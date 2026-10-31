// server/services/sgc.pendientes.service.js
// Bandeja "Mis pendientes" del SGC: lo que el usuario tiene a su cargo, en una sola lista.
//   NC        no conformidades abiertas (1–4) donde es responsable
//   PLAN      actividades del plan de una AC abierta (sgc_acciones_plan) sin completar
//   HALLAZGO  hallazgos tipo "No conformidad" a su cargo que aún no generan NC
// Completados: NCs y ACs a su cargo cerradas en los últimos 30 días.
// Posponer solo oculta el pendiente de SU bandeja (sgc_pendientes_pospuestos);
// nunca cambia la fecha compromiso del registro.
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { notificar } = require("./sgc.notificaciones.service");

const URGENTE_DIAS = 2;
const ENTIDADES = ["NC", "PLAN", "HALLAZGO"];

const _item = (x) => ({
  tipo: x.tipo,
  entidad: x.entidad,
  id: x.id,
  idRegistro: x.idRegistro,
  folio: x.folio,
  titulo: x.titulo,
  modulo: x.modulo,
  fecha_limite: x.fechaLimite,
  dias_restantes: x.diasRestantes,
  urgente: !x.completado && x.diasRestantes != null && x.diasRestantes <= URGENTE_DIAS,
  completado: !!x.completado,
});

/** GET /api/sgc/mis-pendientes */
async function getMisPendientes(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("login", sql.VarChar(255), req.login)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        DECLARE @hoy DATE = ${C.HOY_SQL};

        SELECT * FROM (
        SELECT 'nc' AS tipo, 'NC' AS entidad, nc.idNC AS id, nc.idNC AS idRegistro, nc.folioNC AS folio,
               LEFT(nc.descripcion, 200) AS titulo, 'No conformidades' AS modulo,
               nc.fechaCompromiso AS fechaLimite, DATEDIFF(DAY, @hoy, nc.fechaCompromiso) AS diasRestantes, 0 AS completado
        FROM sgc_no_conformidades nc
        WHERE nc.idEmpresa = @idEmpresa AND nc.loginResponsable = @login AND nc.idEstatus IN (1, 2, 3, 4)
          AND NOT EXISTS (SELECT 1 FROM sgc_pendientes_pospuestos x
                          WHERE x.login = @login AND x.entidad = 'NC' AND x.idEntidad = nc.idNC AND x.hasta > @hoy)

        UNION ALL
        SELECT 'ac', 'PLAN', p.idAccion, ac.idAC, ac.folioAC,
               LEFT(p.descripcion, 200), 'Acciones correctivas',
               p.fechaCompromiso, DATEDIFF(DAY, @hoy, p.fechaCompromiso), 0
        FROM sgc_acciones_plan p
        JOIN sgc_acciones_correctivas ac ON ac.idAC = p.idAC
        WHERE ac.idEmpresa = @idEmpresa AND p.loginResponsable = @login AND p.idEstatus <> 3 AND ac.idEstatus IN (1, 2, 3)
          AND NOT EXISTS (SELECT 1 FROM sgc_pendientes_pospuestos x
                          WHERE x.login = @login AND x.entidad = 'PLAN' AND x.idEntidad = p.idAccion AND x.hasta > @hoy)

        UNION ALL
        SELECT 'aud', 'HALLAZGO', h.idHallazgo, a.idAuditoria, a.folio,
               LEFT(h.descripcion, 200), 'Auditorías',
               h.fechaCompromiso, DATEDIFF(DAY, @hoy, h.fechaCompromiso), 0
        FROM sgc_hallazgos h
        JOIN sgc_auditorias a ON a.idAuditoria = h.idAuditoria
        WHERE a.idEmpresa = @idEmpresa AND h.loginResponsable = @login AND h.tipo = 1 AND h.idNC IS NULL AND a.idEstatus <> 4
          AND NOT EXISTS (SELECT 1 FROM sgc_pendientes_pospuestos x
                          WHERE x.login = @login AND x.entidad = 'HALLAZGO' AND x.idEntidad = h.idHallazgo AND x.hasta > @hoy)

        UNION ALL
        SELECT 'nc', 'NC', nc.idNC, nc.idNC, nc.folioNC, LEFT(nc.descripcion, 200), 'No conformidades',
               nc.fechaCierre, NULL, 1
        FROM sgc_no_conformidades nc
        WHERE nc.idEmpresa = @idEmpresa AND nc.loginResponsable = @login AND nc.idEstatus = 5
          AND nc.fechaCierre >= DATEADD(DAY, -30, @hoy)

        UNION ALL
        SELECT 'ac', 'AC', ac.idAC, ac.idAC, ac.folioAC, LEFT(COALESCE(ac.titulo, ac.d2_descripcion, ac.descripcion, ''), 200),
               'Acciones correctivas', ac.fechaCierre, NULL, 1
        FROM sgc_acciones_correctivas ac
        WHERE ac.idEmpresa = @idEmpresa AND ac.loginResponsable = @login AND ac.idEstatus = 5
          AND ac.fechaCierre >= DATEADD(DAY, -30, @hoy)
        ) t
        ORDER BY completado, CASE WHEN fechaLimite IS NULL THEN 1 ELSE 0 END, fechaLimite, folio;
      `);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data: r.recordset.map(_item) });
  } catch (err) {
    console.error("[sgc.pendientes] getMisPendientes:", err);
    C._err(res, 500, "Error interno");
  }
}

/** ¿El pendiente existe y está a cargo del usuario? Devuelve { folio, titulo, ruta } o null. */
async function _pendienteDelUsuario(db, req, entidad, id) {
  const consultas = {
    NC: `SELECT nc.folioNC AS folio, LEFT(nc.descripcion, 200) AS titulo, 'NC' AS ent, nc.idNC AS idEnt
         FROM sgc_no_conformidades nc WHERE nc.idNC = @id AND nc.idEmpresa = @idEmpresa AND nc.loginResponsable = @login`,
    PLAN: `SELECT ac.folioAC AS folio, LEFT(p.descripcion, 200) AS titulo, 'AC' AS ent, ac.idAC AS idEnt
           FROM sgc_acciones_plan p JOIN sgc_acciones_correctivas ac ON ac.idAC = p.idAC
           WHERE p.idAccion = @id AND ac.idEmpresa = @idEmpresa AND p.loginResponsable = @login`,
    HALLAZGO: `SELECT a.folio, LEFT(h.descripcion, 200) AS titulo, 'AUD' AS ent, a.idAuditoria AS idEnt
               FROM sgc_hallazgos h JOIN sgc_auditorias a ON a.idAuditoria = h.idAuditoria
               WHERE h.idHallazgo = @id AND a.idEmpresa = @idEmpresa AND h.loginResponsable = @login`,
  };
  const r = await db.request()
    .input("id", sql.Int, id)
    .input("idEmpresa", sql.Int, req.idEmpresa)
    .input("login", sql.VarChar(255), req.login)
    .query(consultas[entidad]);
  return r.recordset[0] || null;
}

/** ¿El login existe, está activo y tiene rol SGC? */
async function _usuarioSgcActivo(db, idEmpresa, login) {
  const r = await db.request()
    .input("login", sql.VarChar(255), login)
    .input("idEmpresa", sql.Int, idEmpresa)
    .query(`SELECT TOP 1 u.login FROM sec_users u
            JOIN sgc_usuario_roles r ON r.login = u.login AND r.idEmpresa = @idEmpresa AND r.activo = 1
            WHERE u.login = @login AND u.active = 'Y'`);
  return r.recordset[0]?.login || null;
}

/**
 * POST /api/sgc/mis-pendientes/accion
 * body { entidad: 'NC'|'PLAN'|'HALLAZGO', id, accion: 'posponer'|'delegar', dias?, login? }
 *   posponer  oculta el pendiente de la bandeja `dias` días (1–7)
 *   delegar   avisa a otra persona con rol SGC (no cambia al responsable oficial)
 */
async function accionPendiente(req, res) {
  const entidad = String(req.body?.entidad || "").toUpperCase();
  const id = C._int(req.body?.id);
  const accion = req.body?.accion;
  if (!ENTIDADES.includes(entidad) || !id) return C._err(res, 400, "Pendiente inválido");
  if (!["posponer", "delegar"].includes(accion)) return C._err(res, 400, "Acción inválida");
  try {
    const db = await getPool();
    const p = await _pendienteDelUsuario(db, req, entidad, id);
    if (!p) return C._err(res, 404, "Ese pendiente no está a tu cargo.");

    if (accion === "posponer") {
      const dias = Math.min(7, Math.max(1, C._int(req.body?.dias) || 1));
      await db.request()
        .input("login", sql.VarChar(255), req.login)
        .input("entidad", sql.VarChar(10), entidad)
        .input("id", sql.Int, id)
        .input("dias", sql.Int, dias)
        .query(`
          DECLARE @hasta DATE = DATEADD(DAY, @dias, ${C.HOY_SQL});
          MERGE sgc_pendientes_pospuestos AS t
          USING (SELECT @login AS login, @entidad AS entidad, @id AS idEntidad) AS s
            ON t.login = s.login AND t.entidad = s.entidad AND t.idEntidad = s.idEntidad
          WHEN MATCHED THEN UPDATE SET hasta = @hasta, fechaRegistro = GETDATE()
          WHEN NOT MATCHED THEN INSERT (login, entidad, idEntidad, hasta) VALUES (@login, @entidad, @id, @hasta);
        `);
      return res.json({ ok: true, data: { accion, dias } });
    }

    const destino = C._texto(req.body?.login ?? req.body?.usuario_id, 255);
    if (!destino) return C._err(res, 400, "Elige a quién delegar.");
    if (C._mismo(destino, req.login)) return C._err(res, 400, "No puedes delegarte un pendiente a ti mismo.");
    const login = await _usuarioSgcActivo(db, req.idEmpresa, destino);
    if (!login) return C._err(res, 400, "Esa persona no tiene un rol activo en el SGC.");
    await notificar(null, {
      login,
      actor: req.login,
      tipo: "DELEGADO",
      titulo: `${p.folio}: te delegaron un pendiente`,
      mensaje: `${req.sgcUser?.nombre || req.login} te pidió atender: ${p.titulo}`,
      entidad: p.ent,
      idEntidad: p.idEnt,
    });
    res.json({ ok: true, data: { accion, login } });
  } catch (err) {
    console.error("[sgc.pendientes] accionPendiente:", err);
    C._err(res, 500, "Error interno");
  }
}

module.exports = { getMisPendientes, accionPendiente, _usuarioSgcActivo };
