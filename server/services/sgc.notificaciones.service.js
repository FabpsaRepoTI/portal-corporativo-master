// server/services/sgc.notificaciones.service.js
// Notificaciones del SGC/SGI (tabla sgc_notificaciones).
//
// Eventos (se insertan dentro de la transacción del cambio que los origina):
//   NC_ASIGNADA         a quien queda como responsable de una NC (alta o reasignación)
//   TICKET_ACTUALIZADO  al solicitante cuando su ticket de la Mesa SGI cambia de estatus
//   RIESGO_ALTO         a Coordinadores y al responsable cuando se registra un riesgo de nivel > 12
// Plazos (barrido idempotente al consultar las notificaciones; una por registro):
//   NC_POR_VENCER       NC abierta a 3 días o menos de su fecha compromiso → responsable
//   AC_POR_VENCER       AC abierta a 3 días o menos de su fecha compromiso → responsable
//   AUDITORIA_PROXIMA   auditoría planeada a 7 días o menos → auditor líder y equipo auditor
// Nadie se notifica a sí mismo por sus propias acciones.
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { obtenerUsuarioSgc, ID_EMPRESA } = require("../middleware/sgcAuth.middleware");

const TIPOS = ["NC_ASIGNADA", "NC_POR_VENCER", "AC_POR_VENCER", "TICKET_ACTUALIZADO", "AUDITORIA_PROXIMA", "RIESGO_ALTO", "DOC_POR_VENCER", "DELEGADO"];
// Las pospuestas (pospuestaHasta en el futuro) no se muestran ni cuentan
const VISIBLE = "(pospuestaHasta IS NULL OR pospuestaHasta <= GETDATE())";

/**
 * notificar(tx | null, { login, tipo, titulo, mensaje, entidad, idEntidad, actor? })
 * entidad: 'NC' | 'AC' | 'AUD' | 'MSI' | 'RIESGO'. Si login = actor no se crea.
 */
async function notificar(tx, n) {
  if (!n.login || C._mismo(n.login, n.actor)) return;
  const request = tx ? new sql.Request(tx) : (await getPool()).request();
  await request
    .input("login", sql.VarChar(255), n.login)
    .input("tipo", sql.VarChar(40), n.tipo)
    .input("titulo", sql.NVarChar(120), String(n.titulo).slice(0, 120))
    .input("mensaje", sql.NVarChar(500), String(n.mensaje || "").slice(0, 500))
    .input("entidad", sql.VarChar(10), n.entidad || null)
    .input("idEntidad", sql.Int, n.idEntidad || null)
    .query(`INSERT INTO sgc_notificaciones (login, tipo, titulo, mensaje, entidad, idEntidad)
            VALUES (@login, @tipo, @titulo, @mensaje, @entidad, @idEntidad)`);
}

/** Notifica a todos los Coordinadores activos (y a `extra`), sin duplicar. */
async function notificarCoordinadores(tx, n, extra = []) {
  const r = await new sql.Request(tx)
    .input("idEmpresa", sql.Int, ID_EMPRESA)
    .query(`SELECT r.login FROM sgc_usuario_roles r JOIN sec_users u ON u.login = r.login AND u.active = 'Y'
            WHERE r.idEmpresa = @idEmpresa AND r.activo = 1 AND r.idRol = 1`);
  const logins = [...new Set([...r.recordset.map((x) => x.login.toUpperCase()), ...extra.filter(Boolean).map((l) => l.toUpperCase())])];
  for (const login of logins) await notificar(tx, { ...n, login });
}

// Los avisos de plazo se calculan por día: basta revisar cada 5 min por persona
// (la campana consulta al entrar y cada minuto).
const BARRIDO_MS = 5 * 60000;
const _ultimoBarrido = new Map();

/** Genera las notificaciones de plazo que le falten a `login` (no duplica). */
async function barrido(login) {
  const clave = String(login).toUpperCase();
  if (Date.now() - (_ultimoBarrido.get(clave) || 0) < BARRIDO_MS) return;
  _ultimoBarrido.set(clave, Date.now());
  const db = await getPool();
  await db.request()
    .input("login", sql.VarChar(255), login)
    .input("idEmpresa", sql.Int, ID_EMPRESA)
    .query(`
      DECLARE @hoy DATE = ${C.HOY_SQL};

      INSERT INTO sgc_notificaciones (login, tipo, titulo, mensaje, entidad, idEntidad)
      SELECT @login, 'NC_POR_VENCER',
             CONCAT(nc.folioNC, ' vence ', CASE DATEDIFF(DAY, @hoy, nc.fechaCompromiso) WHEN 0 THEN 'hoy' WHEN 1 THEN 'mañana'
                    ELSE CONCAT('en ', DATEDIFF(DAY, @hoy, nc.fechaCompromiso), ' días') END),
             LEFT(nc.descripcion, 300), 'NC', nc.idNC
      FROM sgc_no_conformidades nc
      WHERE nc.idEmpresa = @idEmpresa AND nc.loginResponsable = @login AND nc.idEstatus IN (1, 2, 3, 4)
        AND nc.fechaCompromiso BETWEEN @hoy AND DATEADD(DAY, 3, @hoy)
        AND NOT EXISTS (SELECT 1 FROM sgc_notificaciones n WHERE n.login = @login AND n.tipo = 'NC_POR_VENCER'
                        AND n.entidad = 'NC' AND n.idEntidad = nc.idNC);

      INSERT INTO sgc_notificaciones (login, tipo, titulo, mensaje, entidad, idEntidad)
      SELECT @login, 'AC_POR_VENCER',
             CONCAT(ac.folioAC, ' vence ', CASE DATEDIFF(DAY, @hoy, ac.fechaCompromiso) WHEN 0 THEN 'hoy' WHEN 1 THEN 'mañana'
                    ELSE CONCAT('en ', DATEDIFF(DAY, @hoy, ac.fechaCompromiso), ' días') END),
             LEFT(COALESCE(ac.titulo, ac.d2_descripcion, ac.descripcion, ''), 300), 'AC', ac.idAC
      FROM sgc_acciones_correctivas ac
      WHERE ac.idEmpresa = @idEmpresa AND ac.loginResponsable = @login AND ac.idEstatus IN (1, 2, 3)
        AND ac.fechaCompromiso BETWEEN @hoy AND DATEADD(DAY, 3, @hoy)
        AND NOT EXISTS (SELECT 1 FROM sgc_notificaciones n WHERE n.login = @login AND n.tipo = 'AC_POR_VENCER'
                        AND n.entidad = 'AC' AND n.idEntidad = ac.idAC);

      INSERT INTO sgc_notificaciones (login, tipo, titulo, mensaje, entidad, idEntidad)
      SELECT @login, 'AUDITORIA_PROXIMA',
             CONCAT(a.folio, ' inicia ', CASE DATEDIFF(DAY, @hoy, a.fechaPlan) WHEN 0 THEN 'hoy' WHEN 1 THEN 'mañana'
                    ELSE CONCAT('en ', DATEDIFF(DAY, @hoy, a.fechaPlan), ' días') END),
             LEFT(COALESCE(a.titulo, a.alcance), 300), 'AUD', a.idAuditoria
      FROM sgc_auditorias a
      WHERE a.idEmpresa = @idEmpresa AND a.idEstatus = 1
        AND a.fechaPlan BETWEEN @hoy AND DATEADD(DAY, 7, @hoy)
        AND (a.loginAuditor = @login OR EXISTS (SELECT 1 FROM sgc_auditoria_auditores x WHERE x.idAuditoria = a.idAuditoria AND x.login = @login))
        AND NOT EXISTS (SELECT 1 FROM sgc_notificaciones n WHERE n.login = @login AND n.tipo = 'AUDITORIA_PROXIMA'
                        AND n.entidad = 'AUD' AND n.idEntidad = a.idAuditoria);

      -- DOC_POR_VENCER: defensivo (tabla puede no existir aún)
      IF OBJECT_ID('sgc_documentos') IS NOT NULL BEGIN
        INSERT INTO sgc_notificaciones (login, tipo, titulo, mensaje, entidad, idEntidad)
        SELECT @login, 'DOC_POR_VENCER',
               CONCAT(d.codigo, ' vence ', CASE DATEDIFF(DAY, @hoy, d.fechaVencimiento)
                      WHEN 0 THEN 'hoy' WHEN 1 THEN 'mañana'
                      ELSE CONCAT('en ', DATEDIFF(DAY, @hoy, d.fechaVencimiento), ' días') END),
               LEFT(d.titulo, 300), 'DOC', d.idDocumento
        FROM sgc_documentos d
        WHERE d.idEmpresa = @idEmpresa
          AND (d.loginElabora = @login OR d.loginRevisa = @login)
          AND d.idEstatus <> 4
          AND d.fechaVencimiento IS NOT NULL
          AND d.fechaVencimiento BETWEEN @hoy AND DATEADD(DAY, 15, @hoy)
          AND NOT EXISTS (SELECT 1 FROM sgc_notificaciones n WHERE n.login = @login AND n.tipo = 'DOC_POR_VENCER'
                          AND n.entidad = 'DOC' AND n.idEntidad = d.idDocumento);
      END
    `);
}

/**
 * GET /api/sgc/notificaciones — mis notificaciones (no leídas primero, máx. 50).
 * Abierto a cualquier usuario con sesión (el solicitante de la Mesa SGI puede
 * no tener rol SGC); el barrido de plazos solo corre para quien tiene rol.
 */
async function getNotificaciones(req, res) {
  try {
    const login = req.user.login;
    if (await obtenerUsuarioSgc(login)) {
      try {
        await barrido(login);
      } catch (err) {
        // El barrido no debe impedir leer las notificaciones existentes
        console.error("[sgc.notificaciones] barrido:", err.message);
      }
    }
    const db = await getPool();
    const r = await db.request()
      .input("login", sql.VarChar(255), login)
      .query(`
        SELECT TOP 50 idNotificacion, tipo, titulo, mensaje, entidad, idEntidad, CAST(ISNULL(leida, 0) AS BIT) AS leida, fechaCreacion
        FROM sgc_notificaciones
        WHERE login = @login AND ${VISIBLE}
        ORDER BY ISNULL(leida, 0), fechaCreacion DESC, idNotificacion DESC;
        SELECT COUNT(*) AS noLeidas FROM sgc_notificaciones WHERE login = @login AND ISNULL(leida, 0) = 0 AND ${VISIBLE};
      `);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data: { items: r.recordsets[0], noLeidas: r.recordsets[1][0].noLeidas } });
  } catch (err) {
    console.error("[sgc.notificaciones] getNotificaciones:", err);
    C._err(res, 500, "Error interno");
  }
}

/** PUT /api/sgc/notificaciones/:id/leer */
async function marcarLeida(req, res) {
  const id = C._int(req.params.id);
  if (!id) return C._err(res, 400, "Notificación inválida");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("login", sql.VarChar(255), req.user.login)
      .query(`UPDATE sgc_notificaciones SET leida = 1 WHERE idNotificacion = @id AND login = @login`);
    if (!r.rowsAffected[0]) return C._err(res, 404, "Notificación no encontrada");
    res.json({ ok: true, data: { idNotificacion: id } });
  } catch (err) {
    console.error("[sgc.notificaciones] marcarLeida:", err);
    C._err(res, 500, "Error interno");
  }
}

/** PUT /api/sgc/notificaciones/leer-todo */
async function marcarTodas(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("login", sql.VarChar(255), req.user.login)
      .query(`UPDATE sgc_notificaciones SET leida = 1 WHERE login = @login AND ISNULL(leida, 0) = 0`);
    res.json({ ok: true, data: { marcadas: r.rowsAffected[0] } });
  } catch (err) {
    console.error("[sgc.notificaciones] marcarTodas:", err);
    C._err(res, 500, "Error interno");
  }
}

/**
 * PATCH /api/sgc/notificaciones/:id/accion
 * body { accion: 'ver' | 'posponer' | 'delegar', dias?, login? (alias usuario_id) }
 *   ver       la marca como leída
 *   posponer  la oculta `dias` días (1–7) y la deja sin leer para que reaparezca
 *   delegar   se la reenvía a otra persona con rol SGC y la marca como leída
 */
async function accionNotificacion(req, res) {
  const id = C._int(req.params.id);
  const accion = req.body?.accion;
  if (!id) return C._err(res, 400, "Notificación inválida");
  if (!["ver", "posponer", "delegar"].includes(accion)) return C._err(res, 400, "Acción inválida");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("login", sql.VarChar(255), req.user.login)
      .query(`SELECT idNotificacion, tipo, titulo, mensaje, entidad, idEntidad FROM sgc_notificaciones WHERE idNotificacion = @id AND login = @login`);
    const n = r.recordset[0];
    if (!n) return C._err(res, 404, "Notificación no encontrada");

    if (accion === "posponer") {
      const dias = Math.min(7, Math.max(1, C._int(req.body?.dias) || 1));
      await db.request()
        .input("id", sql.Int, id)
        .input("dias", sql.Int, dias)
        .query(`UPDATE sgc_notificaciones SET leida = 0, pospuestaHasta = DATEADD(DAY, @dias, GETDATE()) WHERE idNotificacion = @id`);
      return res.json({ ok: true, data: { idNotificacion: id, accion, dias } });
    }

    if (accion === "delegar") {
      if (!(await obtenerUsuarioSgc(req.user.login))) return C._err(res, 403, "Solo el equipo del SGC puede delegar.");
      const destino = C._texto(req.body?.login ?? req.body?.usuario_id, 255);
      if (!destino) return C._err(res, 400, "Elige a quién delegar.");
      if (C._mismo(destino, req.user.login)) return C._err(res, 400, "No puedes delegarte una notificación a ti mismo.");
      const otro = await obtenerUsuarioSgc(destino);
      if (!otro) return C._err(res, 400, "Esa persona no tiene un rol activo en el SGC.");
      await notificar(null, {
        login: otro.login,
        actor: req.user.login,
        tipo: "DELEGADO",
        titulo: `Delegada: ${n.titulo}`,
        mensaje: `${req.user.name || req.user.login} te la delegó. ${n.mensaje || ""}`,
        entidad: n.entidad,
        idEntidad: n.idEntidad,
      });
    }

    await db.request().input("id", sql.Int, id).query(`UPDATE sgc_notificaciones SET leida = 1 WHERE idNotificacion = @id`);
    res.json({ ok: true, data: { idNotificacion: id, accion } });
  } catch (err) {
    console.error("[sgc.notificaciones] accionNotificacion:", err);
    C._err(res, 500, "Error interno");
  }
}

module.exports = { TIPOS, notificar, notificarCoordinadores, barrido, getNotificaciones, marcarLeida, marcarTodas, accionNotificacion };
