// server/services/sitControl.service.js
// Centro de control documental del SIT: quién tiene acceso, con qué rol, en
// qué estado, y la auditoría de cada cambio. Montado en /api/sit/control y
// protegido por requireAdminDocumental (solo sit_administradores).
//
// Reglas de autorización (además del middleware):
//  - Nadie puede cambiar su propio acceso.
//  - Las administradoras no se modifican desde el panel (se dan de alta y
//    baja por SQL en sit_administradores): así no hay forma de elevar
//    privilegios desde la interfaz.
//  - Solo se asignan roles marcados asignable = 1 en la matriz, y nunca uno
//    de administración (puedeAdmin = 1), aunque esté marcado.
//  - El acceso se da persona por persona: las administradoras buscan a
//    cualquier cuenta activa de sec_users y le asignan el rol que decidan,
//    sin importar su área (p. ej. alguien de Sistemas y alguien de RH como
//    Food Fraud). El área solo se muestra como referencia.
//  - Cada cambio y su registro de auditoría se guardan en la misma
//    transacción: si la auditoría falla, el cambio no se aplica.
const { getPool, sql } = require("../db");
const { resolverPermisoSit } = require("../middleware/sit.middleware");

const PERFIL_DEFAULT = "Usuario General";
const ESTADOS = ["ACTIVO", "SUSPENDIDO", "REVOCADO"];
const LOGIN_RE = /^[A-Za-z0-9._-]{1,255}$/;

const _ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const _err = (res, status, error) => res.status(status).json({ ok: false, error });
const _fallo = (res, nombre, err) => {
  if (err.status) return _err(res, err.status, err.message);
  console.error(`[sitControl.service] ${nombre}:`, err);
  _err(res, 500, "Error interno");
};
const _error = (status, message) => Object.assign(new Error(message), { status });

// Rol efectivo de cada usuario (misma precedencia que el middleware)
const SQL_EFECTIVO = `
  SELECT u.login, u.name, u.area,
         CASE WHEN um.login IS NOT NULL THEN 1 ELSE 0 END AS tieneModulo,
         CASE WHEN adm.login IS NOT NULL THEN 1 ELSE 0 END AS esAdministradora,
         p.idPermiso, p.puesto AS rol, p.esProvisional, p.puedeConsultarDocs, p.puedeDescargar, p.puedeImprimir,
         CASE WHEN up.idPermiso IS NOT NULL THEN 'USUARIO'
              WHEN ap.idPermiso IS NOT NULL THEN 'AREA' ELSE 'DEFAULT' END AS origen,
         COALESCE(up.estado, 'ACTIVO') AS estado,
         up.modificadoPor, COALESCE(mu.name, up.modificadoPor) AS modificadoPorNombre,
         up.fechaModificacion, up.motivo
  FROM sec_users u
  LEFT JOIN (SELECT DISTINCT x.login FROM portal_usuario_modulos x JOIN portal_modulos m ON m.idModulo = x.idModulo AND m.clave = 'sit') um
         ON um.login = u.login
  LEFT JOIN sit_usuario_permiso up ON up.login = u.login
  LEFT JOIN sit_area_permiso ap    ON UPPER(LTRIM(RTRIM(ap.area))) = UPPER(LTRIM(RTRIM(u.area)))
  LEFT JOIN sit_administradores adm ON adm.login = u.login AND adm.activo = 1
  LEFT JOIN sec_users mu ON mu.login = up.modificadoPor
  JOIN sit_permisos_puestos p
    ON p.activo = 1
   AND (p.idPermiso = COALESCE(up.idPermiso, ap.idPermiso)
        OR (up.idPermiso IS NULL AND ap.idPermiso IS NULL AND p.puesto = @perfilDefault))
  WHERE u.active = 'Y' AND (um.login IS NOT NULL OR up.login IS NOT NULL)
`;

async function _usuarios(request) {
  const r = await request.input("perfilDefault", sql.NVarChar(100), PERFIL_DEFAULT).query(`${SQL_EFECTIVO} ORDER BY u.name`);
  return r.recordset.map((u) => ({
    ...u,
    tieneModulo: !!u.tieneModulo,
    esAdministradora: !!u.esAdministradora,
    esProvisional: !!u.esProvisional,
    puedeConsultarDocs: !!u.puedeConsultarDocs,
    puedeDescargar: !!u.puedeConsultarDocs && !!u.puedeDescargar,
    puedeImprimir: !!u.puedeConsultarDocs && !!u.puedeImprimir,
    // Estado de acceso real: sin módulo no entra aunque tenga rol
    estado: u.estado !== "ACTIVO" ? u.estado : u.tieneModulo ? "ACTIVO" : "SIN_MODULO",
  }));
}

/** GET /api/sit/control/resumen */
async function getResumen(req, res) {
  try {
    const db = await getPool();
    const usuarios = await _usuarios(db.request());
    const roles = (await db.request().query(`SELECT COUNT(*) AS provisionales FROM sit_permisos_puestos WHERE activo = 1 AND esProvisional = 1`)).recordset[0];
    const porEstado = usuarios.reduce((acc, u) => ((acc[u.estado] = (acc[u.estado] || 0) + 1), acc), {});
    _ok(res, {
      autorizados: porEstado.ACTIVO || 0,
      suspendidos: porEstado.SUSPENDIDO || 0,
      revocados: porEstado.REVOCADO || 0,
      sinModulo: porEstado.SIN_MODULO || 0,
      conRolProvisional: usuarios.filter((u) => u.estado === "ACTIVO" && u.esProvisional).length,
      porArea: usuarios.filter((u) => u.estado === "ACTIVO" && u.origen !== "USUARIO").length,
      rolesProvisionales: roles.provisionales,
      matrizDefinitiva: false, // cambia cuando se cargue la matriz de Andrea
    });
  } catch (err) {
    _fallo(res, "getResumen", err);
  }
}

/** GET /api/sit/control/usuarios — todos los que tienen el módulo o un acceso registrado */
async function getUsuarios(req, res) {
  try {
    const db = await getPool();
    _ok(res, await _usuarios(db.request()));
  } catch (err) {
    _fallo(res, "getUsuarios", err);
  }
}

/** GET /api/sit/control/usuarios/buscar?q= — cuentas activas del portal que aún no tienen acceso */
async function buscarCandidatos(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return _ok(res, []);
  try {
    const db = await getPool();
    const r = await db.request()
      .input("q", sql.NVarChar(120), `%${q.replace(/[%_[\]]/g, "")}%`)
      .query(`
        SELECT TOP 20 u.login, u.name, u.area
        FROM sec_users u
        WHERE u.active = 'Y'
          AND (u.login LIKE @q OR u.name LIKE @q)
          AND NOT EXISTS (
            SELECT 1 FROM portal_usuario_modulos x JOIN portal_modulos m ON m.idModulo = x.idModulo AND m.clave = 'sit'
            WHERE x.login = u.login)
          AND NOT EXISTS (SELECT 1 FROM sit_usuario_permiso up WHERE up.login = u.login AND up.estado = 'ACTIVO')
        ORDER BY u.name
      `);
    _ok(res, r.recordset);
  } catch (err) {
    _fallo(res, "buscarCandidatos", err);
  }
}

/** GET /api/sit/control/usuarios/:login/permisos — permisos efectivos tal como los ve el servidor */
async function getPermisosEfectivos(req, res) {
  const login = String(req.params.login || "");
  if (!LOGIN_RE.test(login)) return _err(res, 400, "Usuario inválido");
  try {
    const r = await resolverPermisoSit(login);
    _ok(res, r.denegado ? { acceso: false, motivo: r.denegado } : { acceso: true, ...r.permiso });
  } catch (err) {
    _fallo(res, "getPermisosEfectivos", err);
  }
}

/** GET /api/sit/control/roles — la matriz de roles (provisional) */
async function getRoles(req, res) {
  try {
    const db = await getPool();
    const r = await db.request().query(`
      SELECT p.idPermiso, p.puesto AS rol, p.descripcion, p.esProvisional, p.asignable,
             p.puedeConsultarDocs, p.puedeDescargar, p.puedeImprimir,
             p.puedeCargarDoc, p.puedeValidar, p.puedeAdmin, p.puedeVerInactivos, p.accesoIAFSA, p.accesoDFNC,
             (SELECT COUNT(*) FROM sit_usuario_permiso up WHERE up.idPermiso = p.idPermiso AND up.estado = 'ACTIVO') AS usuarios,
             (SELECT STRING_AGG(ap.area, ', ') FROM sit_area_permiso ap WHERE ap.idPermiso = p.idPermiso) AS areas
      FROM sit_permisos_puestos p
      WHERE p.activo = 1
      ORDER BY p.esProvisional DESC, p.puesto
    `);
    _ok(res, r.recordset);
  } catch (err) {
    _fallo(res, "getRoles", err);
  }
}

// Acciones que muestra la auditoría del centro de control. VIEW_DOC (la
// entrega del archivo al abrirlo) no se lista: cada apertura ya aparece
// como VISUALIZAR, registrada al pedir el enlace.
const ACCIONES_AUDITORIA = [
  "VISUALIZAR", "DOWNLOAD_DOC", "PRINT_DOC",
  "ACCESS_GRANT", "ACCESS_ROLE", "ACCESS_SUSPEND", "ACCESS_REVOKE", "ACCESS_RESTORE",
];

/**
 * GET /api/sit/control/auditoria?accion=&login=&antes=
 * Aperturas, descargas e impresiones de documentos y cambios de acceso, del
 * más reciente al más antiguo. accion = una de ACCIONES_AUDITORIA (opcional).
 * login filtra por quién hizo la acción o a quién se le cambió el acceso.
 */
async function getAuditoria(req, res) {
  try {
    const db = await getPool();
    const antes = /^\d+$/.test(String(req.query.antes || "")) ? Number(req.query.antes) : null;
    const login = LOGIN_RE.test(String(req.query.login || "")) ? String(req.query.login) : null;
    const accion = String(req.query.accion || "");
    if (accion && !ACCIONES_AUDITORIA.includes(accion)) return _err(res, 400, "Tipo de acción inválido");
    const r = await db.request()
      .input("antes",    sql.BigInt,           antes)
      .input("login",    sql.VarChar(255),     login)
      .input("accion",   sql.NVarChar(50),     accion || null)
      .input("acciones", sql.NVarChar(sql.MAX), JSON.stringify(ACCIONES_AUDITORIA))
      .query(`
        SELECT TOP 51 a.idAuditoria, a.loginUsuario, COALESCE(u.name, a.loginUsuario) AS nombreUsuario,
               a.accion, a.entidad, a.descripcion, a.ipOrigen, a.fecha
        FROM sit_auditoria a
        LEFT JOIN sec_users u ON u.login = a.loginUsuario
        WHERE a.accion IN (SELECT value FROM OPENJSON(@acciones))
          AND (a.entidad = 'sit_acceso' OR a.entidad IN ('sharepoint', 'sit_documentos'))
          AND (@accion IS NULL OR a.accion = @accion)
          AND (@antes IS NULL OR a.idAuditoria < @antes)
          AND (@login IS NULL OR a.loginUsuario = @login OR a.descripcion LIKE '%' + @login + '%')
        ORDER BY a.idAuditoria DESC
      `);
    const filas = r.recordset.slice(0, 50);
    _ok(res, { filas, siguiente: r.recordset.length > 50 ? filas[filas.length - 1].idAuditoria : null });
  } catch (err) {
    _fallo(res, "getAuditoria", err);
  }
}

// ── Cambios de acceso ───────────────────────────────────────

async function _validarObjetivo(tx, req, login) {
  if (!LOGIN_RE.test(login)) throw _error(400, "Usuario inválido");
  if (login.toUpperCase() === String(req.user.login).toUpperCase()) throw _error(403, "No puedes modificar tu propio acceso.");
  const r = await new sql.Request(tx).input("login", sql.VarChar(255), login).query(`
    SELECT u.login, u.name, u.active,
           CASE WHEN adm.login IS NOT NULL THEN 1 ELSE 0 END AS esAdministradora
    FROM sec_users u
    LEFT JOIN sit_administradores adm ON adm.login = u.login AND adm.activo = 1
    WHERE u.login = @login
  `);
  const u = r.recordset[0];
  if (!u || u.active !== "Y") throw _error(404, "El usuario no existe o está inactivo en el portal.");
  if (u.esAdministradora) throw _error(403, "Las administradoras documentales solo se modifican desde la base de datos.");
  return u;
}

async function _rolAsignable(tx, idPermiso) {
  const r = await new sql.Request(tx).input("id", sql.Int, Number.isInteger(idPermiso) ? idPermiso : null).query(
    `SELECT idPermiso, puesto FROM sit_permisos_puestos WHERE idPermiso = @id AND activo = 1 AND asignable = 1 AND puedeAdmin = 0`
  );
  if (!r.recordset[0]) throw _error(400, "Ese rol no se puede asignar desde el centro de control.");
  return r.recordset[0];
}

async function _auditar(tx, req, accion, descripcion) {
  await new sql.Request(tx)
    .input("login",       sql.VarChar(255),      req.user.login)
    .input("accion",      sql.NVarChar(50),      accion)
    .input("descripcion", sql.NVarChar(sql.MAX), descripcion)
    .input("ip",          sql.NVarChar(45),      String(req.ip || req.socket?.remoteAddress || "").slice(0, 45))
    .input("ua",          sql.NVarChar(300),     String(req.headers["user-agent"] || "").slice(0, 300))
    .query(`
      INSERT INTO sit_auditoria (loginUsuario, accion, entidad, idEntidad, descripcion, ipOrigen, userAgent)
      VALUES (@login, @accion, 'sit_acceso', NULL, @descripcion, @ip, @ua)
    `);
}

async function _upsertAcceso(tx, req, login, idPermiso, estado, motivo) {
  await new sql.Request(tx)
    .input("login",  sql.VarChar(255),   login)
    .input("id",     sql.Int,            idPermiso)
    .input("estado", sql.VarChar(12),    estado)
    .input("actor",  sql.VarChar(255),   req.user.login)
    .input("motivo", sql.NVarChar(300),  motivo || null)
    .query(`
      UPDATE sit_usuario_permiso
      SET idPermiso = @id, estado = @estado, modificadoPor = @actor, fechaModificacion = GETDATE(), motivo = @motivo
      WHERE login = @login;
      IF @@ROWCOUNT = 0
        INSERT INTO sit_usuario_permiso (login, idPermiso, estado, modificadoPor, fechaModificacion, motivo)
        VALUES (@login, @id, @estado, @actor, GETDATE(), @motivo);
    `);
}

async function _enTransaccion(fn) {
  const db = await getPool();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const out = await fn(tx);
    await tx.commit();
    return out;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

const _motivo = (req) => String(req.body?.motivo || "").trim().slice(0, 300);

/** POST /api/sit/control/usuarios { login, idPermiso, motivo } — autoriza a un usuario */
async function autorizarUsuario(req, res) {
  const login = String(req.body?.login || "").trim();
  const idPermiso = parseInt(req.body?.idPermiso);
  try {
    await _enTransaccion(async (tx) => {
      const u = await _validarObjetivo(tx, req, login);
      const rol = await _rolAsignable(tx, idPermiso);
      await _upsertAcceso(tx, req, u.login, rol.idPermiso, "ACTIVO", _motivo(req));
      // Sin el módulo 'sit' no entraría al SIT
      await new sql.Request(tx).input("login", sql.VarChar(255), u.login).query(`
        INSERT INTO portal_usuario_modulos (login, idModulo)
        SELECT @login, m.idModulo FROM portal_modulos m
        WHERE m.clave = 'sit' AND NOT EXISTS (
          SELECT 1 FROM portal_usuario_modulos x WHERE x.login = @login AND x.idModulo = m.idModulo)
      `);
      await _auditar(tx, req, "ACCESS_GRANT", `${u.login} (${u.name}) · rol ${rol.puesto}${_motivo(req) ? " · " + _motivo(req) : ""}`);
    });
    _ok(res, null, 201);
  } catch (err) {
    _fallo(res, "autorizarUsuario", err);
  }
}

/** PUT /api/sit/control/usuarios/:login/rol { idPermiso, motivo } */
async function cambiarRol(req, res) {
  const login = String(req.params.login || "");
  const idPermiso = parseInt(req.body?.idPermiso);
  try {
    await _enTransaccion(async (tx) => {
      const u = await _validarObjetivo(tx, req, login);
      const rol = await _rolAsignable(tx, idPermiso);
      const actual = await new sql.Request(tx).input("login", sql.VarChar(255), u.login)
        .query(`SELECT estado FROM sit_usuario_permiso WHERE login = @login`);
      const estado = actual.recordset[0]?.estado || "ACTIVO";
      await _upsertAcceso(tx, req, u.login, rol.idPermiso, estado, _motivo(req));
      await _auditar(tx, req, "ACCESS_ROLE", `${u.login} (${u.name}) · nuevo rol ${rol.puesto}${_motivo(req) ? " · " + _motivo(req) : ""}`);
    });
    _ok(res, null);
  } catch (err) {
    _fallo(res, "cambiarRol", err);
  }
}

/** PUT /api/sit/control/usuarios/:login/estado { estado: ACTIVO|SUSPENDIDO|REVOCADO, motivo } */
async function cambiarEstado(req, res) {
  const login = String(req.params.login || "");
  const estado = String(req.body?.estado || "").toUpperCase();
  if (!ESTADOS.includes(estado)) return _err(res, 400, "Estado inválido");
  if (estado !== "ACTIVO" && !_motivo(req)) return _err(res, 400, "Indica el motivo de la suspensión o revocación.");
  try {
    await _enTransaccion(async (tx) => {
      const u = await _validarObjetivo(tx, req, login);
      // Conserva el rol efectivo actual (asignado o por área) al registrar el estado
      const r = await new sql.Request(tx)
        .input("login", sql.VarChar(255), u.login)
        .input("perfilDefault", sql.NVarChar(100), PERFIL_DEFAULT)
        .query(`
          SELECT TOP 1 p.idPermiso, p.puesto
          FROM sec_users u
          LEFT JOIN sit_usuario_permiso up ON up.login = u.login
          LEFT JOIN sit_area_permiso ap    ON UPPER(LTRIM(RTRIM(ap.area))) = UPPER(LTRIM(RTRIM(u.area)))
          JOIN sit_permisos_puestos p
            ON p.idPermiso = COALESCE(up.idPermiso, ap.idPermiso)
            OR (up.idPermiso IS NULL AND ap.idPermiso IS NULL AND p.puesto = @perfilDefault)
          WHERE u.login = @login
        `);
      const rol = r.recordset[0];
      if (!rol) throw _error(400, "El usuario no tiene un rol del SIT.");
      await _upsertAcceso(tx, req, u.login, rol.idPermiso, estado, _motivo(req));
      const accion = { ACTIVO: "ACCESS_RESTORE", SUSPENDIDO: "ACCESS_SUSPEND", REVOCADO: "ACCESS_REVOKE" }[estado];
      await _auditar(tx, req, accion, `${u.login} (${u.name}) · ${estado.toLowerCase()}${_motivo(req) ? " · " + _motivo(req) : ""}`);
    });
    _ok(res, null);
  } catch (err) {
    _fallo(res, "cambiarEstado", err);
  }
}

module.exports = {
  getResumen,
  getUsuarios,
  buscarCandidatos,
  getPermisosEfectivos,
  getRoles,
  getAuditoria,
  autorizarUsuario,
  cambiarRol,
  cambiarEstado,
};
