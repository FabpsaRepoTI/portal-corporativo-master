// server/middleware/sit.middleware.js
// Permisos del módulo SIT (Sistema de Información Técnica).
//
// Quién entra: el módulo 'sit' en portal_usuario_modulos.
// Qué puede hacer: un rol de sit_permisos_puestos (la matriz de roles, en BD),
//   que sale de, en este orden:
//     1) sit_usuario_permiso (rol asignado al usuario desde el centro de
//        control; si su estado es SUSPENDIDO o REVOCADO no entra al SIT)
//     2) sit_area_permiso (rol por el área de sec_users)
//     3) 'Usuario General'
// Centro de control: solo las cuentas activas de sit_administradores.
//
// Todo se lee de la BD en cada petición (no del JWT): un cambio de rol, una
// suspensión o una revocación aplica en la siguiente petición protegida.
const crypto = require("crypto");
const { getPool, sql } = require("../db");
const { getModulosUsuario } = require("../services/permisos.service");

const PERFIL_DEFAULT = "Usuario General";

/**
 * Permisos efectivos de un usuario en el SIT, o un motivo de rechazo.
 * Devuelve { permiso } | { denegado: 'SIN_MODULO' | 'SUSPENDIDO' | 'REVOCADO' | 'SIN_PERFIL' }
 */
async function resolverPermisoSit(login) {
  const { modulos } = await getModulosUsuario(login);
  if (!modulos.includes("sit")) return { denegado: "SIN_MODULO" };

  const db = await getPool();
  const r = await db.request()
    .input("login", sql.VarChar(255), login)
    .input("perfilDefault", sql.NVarChar(100), PERFIL_DEFAULT)
    .query(`
      SELECT TOP 1 p.puesto, p.puedeVerActivos, p.puedeVerInactivos, p.puedeCargarDoc,
             p.puedeValidar, p.puedeAdmin, p.accesoIAFSA, p.accesoDFNC,
             p.puedeConsultarDocs, p.puedeDescargar, p.puedeImprimir, p.esProvisional,
             up.estado AS estadoUsuario,
             CASE WHEN up.idPermiso IS NOT NULL THEN 'USUARIO'
                  WHEN ap.idPermiso IS NOT NULL THEN 'AREA' ELSE 'DEFAULT' END AS origen,
             CASE WHEN adm.login IS NOT NULL THEN 1 ELSE 0 END AS esAdministradora
      FROM sec_users u
      LEFT JOIN sit_usuario_permiso up ON up.login = u.login
      LEFT JOIN sit_area_permiso ap    ON UPPER(LTRIM(RTRIM(ap.area))) = UPPER(LTRIM(RTRIM(u.area)))
      LEFT JOIN sit_administradores adm ON adm.login = u.login AND adm.activo = 1
      JOIN sit_permisos_puestos p
        ON p.activo = 1
       AND (p.idPermiso = COALESCE(up.idPermiso, ap.idPermiso)
            OR (up.idPermiso IS NULL AND ap.idPermiso IS NULL AND p.puesto = @perfilDefault))
      WHERE u.login = @login AND u.active = 'Y'
    `);

  const p = r.recordset[0];
  if (p?.estadoUsuario === "SUSPENDIDO" || p?.estadoUsuario === "REVOCADO") return { denegado: p.estadoUsuario };
  if (!p || !p.puedeVerActivos) return { denegado: "SIN_PERFIL" };

  const plantas = [];
  if (p.accesoIAFSA) plantas.push(1);
  if (p.accesoDFNC) plantas.push(2);

  return {
    permiso: {
      perfil: p.puesto,
      perfilProvisional: !!p.esProvisional,
      origen: p.origen,
      puedeVerInactivos: !!p.puedeVerInactivos,
      puedeCargarDoc: !!p.puedeCargarDoc || !!p.puedeAdmin,
      puedeValidar: !!p.puedeValidar || !!p.puedeAdmin,
      puedeAdmin: !!p.puedeAdmin,
      // Documentos: cada operación se autoriza por separado
      puedeConsultarDocs: !!p.puedeConsultarDocs,
      puedeDescargar: !!p.puedeConsultarDocs && !!p.puedeDescargar,
      puedeImprimir: !!p.puedeConsultarDocs && !!p.puedeImprimir,
      // Centro de control: solo sit_administradores (no lo da ningún rol)
      esAdministradoraDocumental: !!p.esAdministradora,
      plantas,
    },
  };
}

const MENSAJE_DENEGADO = {
  SIN_MODULO: "No tienes acceso al Sistema de Información Técnica.",
  SUSPENDIDO: "Tu acceso a Información Técnica está suspendido. Consulta a las responsables de la documentación.",
  REVOCADO: "Tu acceso a Información Técnica fue retirado. Consulta a las responsables de la documentación.",
  SIN_PERFIL: "Tu perfil no tiene acceso al Sistema de Información Técnica.",
};

/** Exige acceso al SIT y deja los permisos efectivos en req.sitPermiso. */
async function requireSIT(req, res, next) {
  if (!req.user?.login) return res.status(401).json({ ok: false, error: "Sesión requerida." });
  try {
    const r = await resolverPermisoSit(req.user.login);
    if (r.denegado) return res.status(403).json({ ok: false, error: MENSAJE_DENEGADO[r.denegado], motivo: r.denegado });
    req.sitPermiso = r.permiso;
    next();
  } catch (err) {
    console.error("[sit.middleware] requireSIT:", err.message);
    res.status(503).json({ ok: false, error: "No se pudieron verificar tus permisos. Intenta de nuevo." });
  }
}

/**
 * Exige una capacidad del rol: 'puedeAdmin' | 'puedeCargarDoc' | 'puedeValidar'
 * | 'puedeConsultarDocs' | 'puedeDescargar' | 'puedeImprimir'
 */
const requireSitPermiso = (capacidad) => (req, res, next) => {
  if (!req.sitPermiso?.[capacidad]) {
    return res.status(403).json({ ok: false, error: "Sin permisos para esta acción." });
  }
  next();
};

/** Centro de control: solo administradoras documentales (sit_administradores). */
function requireAdminDocumental(req, res, next) {
  if (!req.sitPermiso?.esAdministradoraDocumental) {
    return res.status(403).json({ ok: false, error: "El centro de control es exclusivo de las responsables de la documentación." });
  }
  next();
}

// ── Tickets de documento ────────────────────────────────────
// El visor no puede mandar el header Authorization, y poner el JWT de la
// sesión en la URL lo deja en el historial y en los logs. En su lugar, el
// frontend pide (con su sesión) un ticket firmado que solo sirve para UN
// documento, UNA operación (ver | descargar | imprimir), UNA vez y durante
// 60 segundos. La clave vive en memoria: reiniciar el servidor invalida los
// tickets pendientes, que de todos modos duran un minuto.
const CLAVE_TICKET = crypto.randomBytes(32);
const TTL_TICKET_MS = 60 * 1000;
const _usados = new Map(); // jti → expira (un ticket no se puede reutilizar)

const _b64 = (b) => Buffer.from(b).toString("base64url");
const _firma = (datos) => crypto.createHmac("sha256", CLAVE_TICKET).update(datos).digest("base64url");

function emitirTicket({ login, recurso, modo }) {
  const datos = _b64(JSON.stringify({ l: login, r: recurso, m: modo, e: Date.now() + TTL_TICKET_MS, j: crypto.randomUUID() }));
  return `${datos}.${_firma(datos)}`;
}

function _leerTicket(ticket) {
  const [datos, firma] = String(ticket || "").split(".");
  if (!datos || !firma) return null;
  const esperada = Buffer.from(_firma(datos));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  try {
    const t = JSON.parse(Buffer.from(datos, "base64url").toString("utf8"));
    if (!t.e || t.e < Date.now()) return null;
    return t;
  } catch {
    return null;
  }
}

/**
 * Autentica una petición de archivo con ?ticket= en lugar del JWT. Deja
 * req.user = { login } (para que requireSIT vuelva a leer los permisos de
 * la BD) y req.sitTicket = { recurso, modo }.
 */
function ticketEnQuery(req, res, next) {
  const t = _leerTicket(req.query.ticket);
  if (!t) return res.status(401).json({ ok: false, error: "El enlace del documento expiró. Ábrelo de nuevo desde el SIT." });
  if (_usados.has(t.j)) return res.status(401).json({ ok: false, error: "Este enlace ya se usó. Ábrelo de nuevo desde el SIT." });
  const ahora = Date.now();
  for (const [j, exp] of _usados) if (exp < ahora) _usados.delete(j);
  _usados.set(t.j, t.e);
  req.user = { login: t.l };
  req.sitTicket = { recurso: t.r, modo: t.m };
  next();
}

module.exports = {
  resolverPermisoSit,
  requireSIT,
  requireSitPermiso,
  requireAdminDocumental,
  emitirTicket,
  ticketEnQuery,
};
