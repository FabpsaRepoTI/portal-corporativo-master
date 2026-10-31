// server/services/sgc.equipo.service.js
// Control del equipo SGI (solo Coordinador): quién tiene rol en el SGC, qué
// rol y a qué módulos entra (sgc_usuario_roles.modulos, JSON; NULL = todos).
//
// Reglas de seguridad:
//   · nadie se quita a sí mismo el rol de Coordinador ni se desactiva
//   · siempre queda al menos un Coordinador activo
//   · desactivar es baja lógica (activo = 0); volver a agregar reactiva
//
// "Última actividad": el portal no registra inicios de sesión, así que se
// toma el movimiento más reciente de la persona en el SGC (bitácoras de NC,
// AC y riesgos, mediciones, comentarios de la Mesa SGI y Fab-i).
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { MODULOS, ROLES, ID_EMPRESA, leerModulos, invalidarUsuarioSgc } = require("../middleware/sgcAuth.middleware");
const { _err, _int, _texto, _mismo, _rollback, _abortar } = C;

/** null = todos; arreglo de claves válidas, sin repetidos y no vacío. */
function _modulos(v) {
  if (v === null || v === undefined) return { valor: null };
  if (!Array.isArray(v)) return { error: "Módulos inválidos" };
  const lista = [...new Set(v)].filter((m) => MODULOS[m]);
  if (lista.length !== new Set(v).size) return { error: "Algún módulo no existe." };
  if (!lista.length) return { error: "Elige al menos un módulo (o acceso completo)." };
  // Todos marcados equivale a acceso completo
  if (lista.length === Object.keys(MODULOS).length) return { valor: null };
  return { valor: JSON.stringify(lista) };
}

const EQUIPO_SELECT = `
  SELECT r.login, LTRIM(RTRIM(u.name)) AS nombre, u.email, u.picture, u.area, u.sitio,
         r.idRol, CAST(ISNULL(r.activo, 0) AS BIT) AS activo, r.modulos,
         (SELECT MAX(f) FROM (VALUES
            ((SELECT MAX(fechaRegistro) FROM sgc_historial_nc WHERE login = r.login)),
            ((SELECT MAX(fechaRegistro) FROM sgc_historial_ac WHERE login = r.login)),
            ((SELECT MAX(fechaRegistro) FROM sgc_historial_riesgos WHERE login = r.login)),
            ((SELECT MAX(fechaRegistro) FROM sgc_indicadores_valores WHERE login = r.login)),
            ((SELECT MAX(fechaRegistro) FROM sgc_msi_comentarios WHERE login = r.login)),
            ((SELECT MAX(m.fechaRegistro) FROM sgc_fabi_mensajes m JOIN sgc_fabi_conversaciones c ON c.idConversacion = m.idConversacion WHERE c.login = r.login))
          ) v(f)) AS ultimaActividad
  FROM sgc_usuario_roles r
  JOIN sec_users u ON u.login = r.login
`;

const _formatear = (x) => ({ ...x, rol: ROLES[x.idRol], modulos: leerModulos(x.modulos) });

/** GET /api/sgc/equipo — activos primero. Incluye el catálogo de roles y módulos. */
async function getEquipo(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`${EQUIPO_SELECT} WHERE r.idEmpresa = @idEmpresa
              ORDER BY CASE WHEN ISNULL(r.activo, 0) = 1 THEN 0 ELSE 1 END, r.idRol, u.name`);
    res.json({ ok: true, data: { miembros: r.recordset.map(_formatear), roles: ROLES, modulos: MODULOS } });
  } catch (err) {
    console.error("[sgc.equipo.service] getEquipo:", err);
    _err(res, 500, "Error interno");
  }
}

async function _coordinadoresActivos(tx) {
  const r = await new sql.Request(tx)
    .input("idEmpresa", sql.Int, ID_EMPRESA)
    .query(`SELECT COUNT(*) AS n FROM sgc_usuario_roles WITH (UPDLOCK, HOLDLOCK)
            WHERE idEmpresa = @idEmpresa AND idRol = 1 AND activo = 1`);
  return r.recordset[0].n;
}

/**
 * GET /api/sgc/equipo/buscar?q=  — busca en sec_users por nombre o login.
 * Excluye quienes ya tienen un registro activo en sgc_usuario_roles.
 */
async function buscarUsuarios(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ ok: true, data: [] });
  try {
    const db = await getPool();
    const r = await db.request()
      .input("q", sql.NVarChar(255), `%${q}%`)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`
        SELECT TOP 15 u.login, LTRIM(RTRIM(u.name)) AS nombre, u.email, u.area,
               CAST(CASE WHEN u.area LIKE '%SGI%' THEN 1 ELSE 0 END AS BIT) AS autoSgi
        FROM sec_users u
        WHERE u.active = 'Y'
          AND (u.name LIKE @q OR u.login LIKE @q)
          AND NOT EXISTS (
            SELECT 1 FROM sgc_usuario_roles r
            WHERE r.login = u.login AND r.idEmpresa = @idEmpresa AND r.activo = 1
          )
        ORDER BY u.name
      `);
    res.json({ ok: true, data: r.recordset });
  } catch (err) {
    console.error("[sgc.equipo.service] buscarUsuarios:", err);
    _err(res, 500, "Error interno");
  }
}

/** POST /api/sgc/equipo  body: { login, idRol, modulos: null | [claves] } */
async function agregarMiembro(req, res) {
  const b = req.body || {};
  const login = _texto(b.login, 255);
  const idRol = _int(b.idRol);
  const m = _modulos(b.modulos);
  if (!login) return _err(res, 400, "Elige a la persona.");
  if (!ROLES[idRol]) return _err(res, 400, "Elige un rol.");
  if (m.error) return _err(res, 400, m.error);

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const u = (await new sql.Request(tx).input("login", sql.VarChar(255), login)
      .query(`SELECT login, LTRIM(RTRIM(name)) AS nombre FROM sec_users WHERE login = @login AND active = 'Y'`)).recordset[0];
    if (!u) return _abortar(tx, res, 400, "La persona no existe o su usuario está inactivo.");
    const existe = (await new sql.Request(tx).input("login", sql.VarChar(255), u.login).input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`SELECT idRolAsig, activo FROM sgc_usuario_roles WITH (UPDLOCK) WHERE login = @login AND idEmpresa = @idEmpresa`)).recordset[0];
    if (existe?.activo) return _abortar(tx, res, 409, `${u.nombre} ya forma parte del equipo.`);

    const request = new sql.Request(tx)
      .input("login", sql.VarChar(255), u.login)
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .input("idRol", sql.TinyInt, idRol)
      .input("modulos", sql.NVarChar(500), m.valor);
    if (existe) {
      await request.query(`UPDATE sgc_usuario_roles SET idRol = @idRol, modulos = @modulos, activo = 1
                           WHERE login = @login AND idEmpresa = @idEmpresa`);
    } else {
      await request.query(`INSERT INTO sgc_usuario_roles (login, idRol, idEmpresa, activo, modulos)
                           VALUES (@login, @idRol, @idEmpresa, 1, @modulos)`);
    }
    await tx.commit();
    invalidarUsuarioSgc(u.login);
    res.status(existe ? 200 : 201).json({ ok: true, data: { login: u.login, nombre: u.nombre, idRol, reactivado: !!existe } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgc.equipo.service] agregarMiembro:", err);
    _err(res, 500, "Error interno");
  }
}

/** PUT /api/sgc/equipo/:login  body: { idRol?, modulos?, activo? } */
async function actualizarMiembro(req, res) {
  const login = _texto(req.params.login, 255);
  const b = req.body || {};
  const idRol = b.idRol === undefined ? undefined : _int(b.idRol);
  const m = b.modulos === undefined ? undefined : _modulos(b.modulos);
  const activo = b.activo === undefined ? undefined : !!b.activo;
  if (!login) return _err(res, 400, "Persona inválida");
  if (idRol !== undefined && !ROLES[idRol]) return _err(res, 400, "Rol inválido");
  if (m?.error) return _err(res, 400, m.error);
  if (idRol === undefined && m === undefined && activo === undefined) return _err(res, 400, "No hay cambios que guardar.");
  const yo = _mismo(login, req.login);
  if (yo && idRol !== undefined && idRol !== 1) return _err(res, 400, "No puedes quitarte el rol de Coordinador. Pide a otro Coordinador que lo haga.");
  if (yo && activo === false) return _err(res, 400, "No puedes desactivarte a ti mismo.");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const actual = (await new sql.Request(tx).input("login", sql.VarChar(255), login).input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`SELECT idRol, CAST(ISNULL(activo, 0) AS BIT) AS activo FROM sgc_usuario_roles WITH (UPDLOCK)
              WHERE login = @login AND idEmpresa = @idEmpresa`)).recordset[0];
    if (!actual) return _abortar(tx, res, 404, "La persona no forma parte del equipo.");
    const dejaDeSerCoordinador = actual.idRol === 1 && actual.activo && ((idRol !== undefined && idRol !== 1) || activo === false);
    if (dejaDeSerCoordinador && (await _coordinadoresActivos(tx)) <= 1) {
      return _abortar(tx, res, 400, "Debe quedar al menos un Coordinador SGI activo.");
    }
    const sets = [];
    const request = new sql.Request(tx).input("login", sql.VarChar(255), login).input("idEmpresa", sql.Int, ID_EMPRESA);
    if (idRol !== undefined) {
      sets.push("idRol = @idRol");
      request.input("idRol", sql.TinyInt, idRol);
    }
    if (m !== undefined) {
      sets.push("modulos = @modulos");
      request.input("modulos", sql.NVarChar(500), m.valor);
    }
    if (activo !== undefined) {
      sets.push("activo = @activo");
      request.input("activo", sql.Bit, activo ? 1 : 0);
    }
    await request.query(`UPDATE sgc_usuario_roles SET ${sets.join(", ")} WHERE login = @login AND idEmpresa = @idEmpresa`);
    await tx.commit();
    invalidarUsuarioSgc(login);
    res.json({ ok: true, data: { login } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgc.equipo.service] actualizarMiembro:", err);
    _err(res, 500, "Error interno");
  }
}

/** DELETE /api/sgc/equipo/:login — desactiva (activo = 0). */
function desactivarMiembro(req, res) {
  req.body = { activo: false };
  return actualizarMiembro(req, res);
}

/** GET /api/sgc/equipo/actividad — últimas 60 acciones del equipo SGI. */
async function getActividad(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`
        SELECT TOP 60 act, login, nombre, referencia, tipo, fecha FROM (
          SELECT 'Registró NC' AS act, h.login, LTRIM(RTRIM(u.name)) AS nombre,
                 nc.folioNC AS referencia, 'nc' AS tipo, h.fechaRegistro AS fecha
          FROM sgc_historial_nc h
          JOIN sgc_usuario_roles r ON r.login = h.login AND r.idEmpresa = @idEmpresa
          JOIN sec_users u ON u.login = h.login
          LEFT JOIN sgc_no_conformidades nc ON nc.idNC = h.idNC
          WHERE h.accion = 'CREÓ'
          UNION ALL
          SELECT 'Registró AC', h.login, LTRIM(RTRIM(u.name)),
                 ac.folioAC, 'ac', h.fechaRegistro
          FROM sgc_historial_ac h
          JOIN sgc_usuario_roles r ON r.login = h.login AND r.idEmpresa = @idEmpresa
          JOIN sec_users u ON u.login = h.login
          LEFT JOIN sgc_acciones_correctivas ac ON ac.idAC = h.idAC
          WHERE h.accion = 'CREÓ'
          UNION ALL
          SELECT 'Comentó en Mesa SGI', c.login, LTRIM(RTRIM(u.name)),
                 t.folio, 'msi', c.fechaRegistro
          FROM sgc_msi_comentarios c
          JOIN sgc_usuario_roles r ON r.login = c.login AND r.idEmpresa = @idEmpresa
          JOIN sec_users u ON u.login = c.login
          LEFT JOIN sgc_msi_tickets t ON t.idTicket = c.idTicket
        ) a
        ORDER BY fecha DESC
      `);
    res.json({ ok: true, data: r.recordset });
  } catch (err) {
    console.error("[sgc.equipo.service] getActividad:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { getEquipo, buscarUsuarios, agregarMiembro, actualizarMiembro, desactivarMiembro, getActividad };
