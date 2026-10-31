// server/middleware/sgcAuth.middleware.js
// Permisos del módulo SGC/SGI (Sistemas de Gestión).
//
// Quién entra: quien tenga un rol activo en sgc_usuario_roles para la
// empresa (NO se usa portal_usuario_modulos para los roles del módulo).
//   1 = Coordinador SGI   (acceso total)
//   2 = Auditor SGI       (auditorías y hallazgos)
//   3 = Responsable área  (crea NCs, ve y actualiza lo suyo)
//   4 = Dirección         (lectura e indicadores)
//
// El JWT llega en el header Authorization (el servidor no puede leer el
// localStorage del navegador; apiFetch lo envía en cada petición).
// El rol se lee de la BD en cada petición (no del JWT): un cambio de rol
// aplica en la siguiente petición protegida.
//
// Módulos: sgc_usuario_roles.modulos es un arreglo JSON con los módulos
// permitidos (NULL = todos). Las rutas de un módulo no permitido responden 403.
// Catálogos, dashboard, búsqueda, notificaciones y Fab-i quedan abiertos (Fab-i
// vuelve a validar el módulo en cada herramienta).
//
// Modo demo (industria automotriz, idEmpresa = 99): el navegador envía
// X-SGC-Empresa: 99 (solo en la pestaña que lo activó). Se acepta únicamente
// a quien tiene un rol real en el SGC, conserva su rol y es SOLO LECTURA
// (salvo Fab-i y el diagnóstico de IA). La empresa activa de la petición queda
// en un contexto asíncrono: obtenerUsuarioSgc() y empresaActiva() la devuelven
// también dentro de las herramientas de Fab-i.
const { AsyncLocalStorage } = require("async_hooks");
const { verifyToken } = require("./auth");
const { getPool, sql } = require("../db");

const ID_EMPRESA = 1; // FABPSA
const DEMO_EMPRESA_ID = 99; // demo automotriz (scripts/seed-demo-automotriz.js)
const _contexto = new AsyncLocalStorage();
/** Empresa de la petición en curso (1, o 99 en modo demo). */
const empresaActiva = () => _contexto.getStore()?.idEmpresa ?? ID_EMPRESA;
const esDemo = (idEmpresa) => idEmpresa === DEMO_EMPRESA_ID;

// Escrituras permitidas en modo demo: conversar con Fab-i y generar el diagnóstico
const DEMO_ESCRITURAS = [/^\/fabi\/chat$/, /^\/fabi\/buscar-documento$/, /^\/fabi\/historial\/\d+$/, /^\/inteligencia\/diagnostico$/];

// Módulos del SGC que se pueden restringir por persona
const MODULOS = {
  nc: "No conformidades",
  ac: "Acciones correctivas",
  auditorias: "Auditorías",
  indicadores: "Indicadores",
  riesgos: "Riesgos",
  procesos: "Procesos",
  documentos: "Gestión documental",
  mesa_sgi: "Mesa SGI",
};
// Primer segmento de /api/sgc/<segmento>/… → módulo
const RUTA_MODULO = { nc: "nc", ac: "ac", auditorias: "auditorias", indicadores: "indicadores", riesgos: "riesgos", procesos: "procesos", documentos: "documentos" };

/** '["nc","ac"]' → ['nc','ac'] (solo claves válidas); NULL o inválido → null (todos). */
function leerModulos(v) {
  if (v == null || v === "") return null;
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr.filter((m) => MODULOS[m]) : null;
  } catch {
    return null;
  }
}

/** ¿El usuario SGC puede usar el módulo? (modulos null = todos) */
const puedeModulo = (u, modulo) => !!u && (!u.modulos || u.modulos.includes(modulo));

const ROLES = {
  1: "Coordinador SGI",
  2: "Auditor SGI",
  3: "Responsable de área",
  4: "Dirección",
};

// Rol SGC en memoria por 60 s: cada petición del SGC lo necesita y ahorrarse ese
// viaje a la base acelera todas las pantallas. Equipo SGI lo invalida al cambiar un rol.
const CACHE_ROL_MS = 60000;
const _cacheRol = new Map();
function invalidarUsuarioSgc(login) {
  if (login) _cacheRol.delete(String(login).toUpperCase());
  else _cacheRol.clear();
}

/**
 * { login, nombre, idRol, empresa_id, autoSgi?, demo? } o null si no tiene rol activo.
 * Dentro de una petición en modo demo devuelve empresa_id = 99 (mismo rol).
 */
async function obtenerUsuarioSgc(login) {
  const clave = String(login || "").toUpperCase();
  const c = _cacheRol.get(clave);
  let u;
  if (c && Date.now() - c.t < CACHE_ROL_MS) u = c.u;
  else {
    u = await _leerUsuarioSgc(login);
    _cacheRol.set(clave, { u, t: Date.now() });
  }
  const idEmpresa = empresaActiva();
  return u && idEmpresa !== u.empresa_id ? { ...u, empresa_id: idEmpresa, demo: esDemo(idEmpresa) } : u;
}

async function _leerUsuarioSgc(login) {
  const db = await getPool();
  const r = await db.request()
    .input("login", sql.VarChar(255), login)
    .input("idEmpresa", sql.Int, ID_EMPRESA)
    .query(`
      SELECT TOP 1 u.login, LTRIM(RTRIM(u.name)) AS nombre, r.idRol, r.idEmpresa, r.modulos
      FROM sgc_usuario_roles r
      JOIN sec_users u ON u.login = r.login AND u.active = 'Y'
      WHERE r.login = @login AND r.idEmpresa = @idEmpresa AND r.activo = 1
    `);
  if (r.recordset[0]) {
    const u = r.recordset[0];
    return { login: u.login, nombre: u.nombre, idRol: u.idRol, empresa_id: u.idEmpresa, modulos: leerModulos(u.modulos) };
  }

  // Sin rol: verificar si el usuario pertenece al área SGI → auto-provisionar como Coordinador
  const areaR = await db.request()
    .input("login", sql.VarChar(255), login)
    .query(`SELECT login, LTRIM(RTRIM(name)) AS nombre FROM sec_users WHERE login = @login AND active = 'Y' AND area LIKE '%SGI%'`);
  if (!areaR.recordset[0]) return null;

  const u2 = areaR.recordset[0];
  try {
    await db.request()
      .input("login", sql.VarChar(255), u2.login)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM sgc_usuario_roles WHERE login = @login AND idEmpresa = @idEmpresa)
          INSERT INTO sgc_usuario_roles (login, idRol, idEmpresa, activo) VALUES (@login, 1, @idEmpresa, 1)
        ELSE
          UPDATE sgc_usuario_roles SET idRol = 1, activo = 1 WHERE login = @login AND idEmpresa = @idEmpresa
      `);
  } catch (err) {
    console.error("[sgcAuth] auto-provisioning SGI:", err.message);
  }
  return { login: u2.login, nombre: u2.nombre, idRol: 1, empresa_id: ID_EMPRESA, modulos: null, autoSgi: true };
}

/**
 * verificarSGC([roles]) — verifica el JWT, carga el rol SGC y, si se dan
 * roles, exige uno de ellos. Deja req.sgcUser = { login, nombre, idRol,
 * empresa_id } y, por compatibilidad, req.login / req.sgcRol / req.idEmpresa.
 */
const verificarSGC = (rolesPermitidos = []) => (req, res, next) => {
  const revisar = () => {
    if (rolesPermitidos.length && !rolesPermitidos.includes(req.sgcUser.idRol)) {
      return res.status(403).json({ ok: false, error: "Sin permisos para esta acción." });
    }
    next();
  };
  if (req.sgcUser) return revisar();

  verifyToken(req, res, async () => {
    try {
      const real = await obtenerUsuarioSgc(req.user.login);
      if (!real) return res.status(403).json({ ok: false, error: "Sin acceso al SGI." });
      // Modo demo: solo con rol real, solo lectura (salvo Fab-i y diagnóstico)
      const demo = Number(req.get("X-SGC-Empresa")) === DEMO_EMPRESA_ID;
      if (demo && req.method !== "GET" && !DEMO_ESCRITURAS.some((re) => re.test(req.path))) {
        return res.status(403).json({ ok: false, error: "El modo demo es de solo lectura. Sal del demo para registrar o modificar información." });
      }
      const u = demo ? { ...real, empresa_id: DEMO_EMPRESA_ID, demo: true } : real;
      req.sgcUser = u;
      req.login = u.login;
      req.sgcRol = u.idRol;
      req.idEmpresa = u.empresa_id;
      const segmento = String(req.path || "").split("/")[1];
      const modulo = RUTA_MODULO[segmento];
      if (modulo && !puedeModulo(u, modulo)) {
        return res.status(403).json({ ok: false, error: `No tienes acceso al módulo ${MODULOS[modulo]}.` });
      }
      // El resto de la petición (servicios y herramientas de Fab-i) ve esta empresa
      _contexto.run({ idEmpresa: u.empresa_id }, revisar);
    } catch (err) {
      console.error("[sgcAuth.middleware] rol:", err.message);
      res.status(503).json({ ok: false, error: "No se pudieron verificar tus permisos. Intenta de nuevo." });
    }
  });
};

const requireSGC = verificarSGC();
const requireCoordinador = verificarSGC([1]);
const requireAuditor = verificarSGC([1, 2]);

module.exports = {
  verificarSGC,
  requireSGC,
  requireCoordinador,
  requireAuditor,
  obtenerUsuarioSgc,
  invalidarUsuarioSgc,
  puedeModulo,
  leerModulos,
  MODULOS,
  ROLES,
  ID_EMPRESA,
  DEMO_EMPRESA_ID,
  empresaActiva,
  esDemo,
};
