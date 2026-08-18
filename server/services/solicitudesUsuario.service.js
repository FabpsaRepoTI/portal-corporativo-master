// solicitudesUsuario.service.js — patch v2
// Cambios vs original:
//   - getDetalleSolicitud: agrega sv.slaRespuestaMin, sv.slaResolucionMin,
//     s.fechaInicioResolucion, s.tiempoTotalPausaMin, s.fechaUltimaPausa
//   - getMisSolicitudes: agrega s.fechaInicioResolucion, s.tiempoTotalPausaMin,
//     s.fechaUltimaPausa, sv.slaResolucionMin para SLA de resolución en grid
// Todo lo demás sin cambios.
"use strict";
const { getPool } = require("../db");
const sql = require("mssql");
const { crearNotificacion, TIPOS } = require("./notificaciones.service");

async function getMisKpis(login) {
  const pool = await getPool();
  const result = await pool.request().input("login", sql.VarChar, login).query(`
      SELECT
        SUM(CASE WHEN idEstatus = 1 THEN 1 ELSE 0 END) AS abiertas,
        SUM(CASE WHEN idEstatus = 2 THEN 1 ELSE 0 END) AS enProceso,
        SUM(CASE WHEN idEstatus = 3 THEN 1 ELSE 0 END) AS resueltas,
        SUM(CASE WHEN idEstatus = 4 THEN 1 ELSE 0 END) AS cerradas,
        SUM(CASE WHEN idEstatus = 5 THEN 1 ELSE 0 END) AS canceladas,
        COUNT(*) AS total
      FROM solicitudTI
      WHERE idUsuario = @login AND idServicio != 2
    `);
  return result.recordset[0];
}

async function getMisSolicitudes(login, { estatus, prioridad, buscar }) {
  const pool = await getPool();
  const req = pool.request().input("login", sql.VarChar, login);
  let where = "s.idUsuario = @login AND s.idServicio != 2";
  if (estatus) {
    req.input("estatus", sql.Int, parseInt(estatus));
    where += " AND s.idEstatus = @estatus";
  }
  if (prioridad) {
    req.input("prioridad", sql.Int, parseInt(prioridad));
    where += " AND s.idPrioridad = @prioridad";
  }
  if (buscar) {
    req.input("buscar", sql.NVarChar, `%${buscar}%`);
    where += " AND (s.folio LIKE @buscar OR s.titulo LIKE @buscar)";
  }
  const result = await req.query(`
    SELECT
      s.idSolicitud, s.folio, s.titulo, s.idEstatus,
      e.estatus          AS estatusNombre,
      e.colorHex         AS estatusColor,
      s.idPrioridad,
      p.prioridad        AS prioridadNombre,
      p.colorHex         AS prioridadColor,
      sv.nombre          AS servicio,
      sv.colorPrimario   AS servicioColor,
      sv.icono           AS servicioIcono,
      s.nombreTecnico,
      s.fechaCreacion,
      s.fechaLimiteResp,
      s.fechaLimiteResol,
      s.tiempoAtencionMin,
      s.fechaInicioResolucion,
      s.tiempoTotalPausaMin,
      s.fechaUltimaPausa,
      sv.slaResolucionMin,
      (
        SELECT COUNT(*) FROM solicitudTI_comentarios c
        WHERE c.idSolicitud = s.idSolicitud AND c.esInterno = 0
      ) AS totalMensajes
    FROM solicitudTI s
    JOIN cat_estatusTI  e  ON e.idEstatus   = s.idEstatus
    JOIN cat_prioridad  p  ON p.idPrioridad  = s.idPrioridad
    JOIN cat_servicioTI sv ON sv.idServicio  = s.idServicio
    WHERE ${where}
    ORDER BY s.fechaCreacion DESC
  `);
  return result.recordset;
}

async function getDetalleSolicitud(idSolicitud, login) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .query(
      `SELECT idSolicitud FROM solicitudTI WHERE idSolicitud = @id AND idUsuario = @login AND idServicio != 2`,
    );
  if (!check.recordset.length) return null;

  const detalle = await pool.request().input("id", sql.Int, idSolicitud).query(`
      SELECT
        s.idSolicitud, s.folio, s.titulo, s.descripcion,
        s.idEstatus,
        e.estatus        AS estatusNombre,
        e.colorHex       AS estatusColor,
        s.idPrioridad,
        p.prioridad      AS prioridadNombre,
        p.colorHex       AS prioridadColor,
        sv.nombre        AS servicio,
        sv.colorPrimario AS servicioColor,
        sv.icono         AS servicioIcono,
        spad.nombre      AS categoria,
        s.tecnicoAsignado,
        s.nombreTecnico,
        s.fechaCreacion,
        s.fechaLimiteResp,
        s.fechaLimiteResol,
        s.fechaResolucion,
        s.tiempoAtencionMin,
        s.slaRespuestaHrs,
        s.slaResolucionHrs,
        s.camposExtra,
        sv.slaRespuestaMin,
        sv.slaResolucionMin,
        s.fechaInicioResolucion,
        s.tiempoTotalPausaMin,
        s.fechaUltimaPausa
      FROM solicitudTI s
      JOIN cat_estatusTI  e   ON e.idEstatus   = s.idEstatus
      JOIN cat_prioridad  p   ON p.idPrioridad  = s.idPrioridad
      JOIN cat_servicioTI sv  ON sv.idServicio  = s.idServicio
      LEFT JOIN cat_servicioTI spad ON spad.idServicio = sv.idServicioPadre
      WHERE s.idSolicitud = @id
    `);

  const comentarios = await pool.request().input("id", sql.Int, idSolicitud)
    .query(`
      SELECT idComentario, idUsuario, nombreUsuario, esInterno, comentario, fecha
      FROM solicitudTI_comentarios WHERE idSolicitud = @id ORDER BY fecha ASC
    `);
  const archivos = await pool.request().input("id", sql.Int, idSolicitud)
    .query(`
      SELECT idArchivo, nombreArchivo, rutaServidor, mimeType, tamanoBytes, fechaSubida
      FROM solicitudTI_archivos WHERE idSolicitud = @id ORDER BY fechaSubida ASC
    `);
  return {
    ...detalle.recordset[0],
    comentarios: comentarios.recordset,
    archivos: archivos.recordset,
  };
}

async function postComentario(idSolicitud, login, nombreUsuario, comentario) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .query(
      `SELECT idSolicitud, tecnicoAsignado, folio FROM solicitudTI WHERE idSolicitud = @id AND idUsuario = @login AND idServicio != 2`,
    );
  if (!check.recordset.length) return null;
  const { tecnicoAsignado, folio } = check.recordset[0];
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .input("nombre", sql.NVarChar, nombreUsuario)
    .input("comentario", sql.NVarChar, comentario)
    .query(
      `INSERT INTO solicitudTI_comentarios (idSolicitud, idUsuario, nombreUsuario, esInterno, comentario, fecha) VALUES (@id, @login, @nombre, 0, @comentario, GETDATE())`,
    );
  if (tecnicoAsignado) {
    try {
      await crearNotificacion({
        loginDestino: tecnicoAsignado,
        loginOrigen: login,
        idTipo: TIPOS.NUEVO_COMENTARIO,
        idSolicitud,
        titulo: "Nuevo comentario",
        descripcion: `${nombreUsuario} comentó en el ticket ${folio}`,
        urlDestino: `/mesa-de-servicio/admin/incidencias?folio=${folio}`,
      });
    } catch (e) {
      console.error("[Notificación] postComentario:", e.message);
    }
  }
  const result = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .query(
      `SELECT TOP 1 idComentario, idUsuario, nombreUsuario, esInterno, comentario, fecha FROM solicitudTI_comentarios WHERE idSolicitud = @id AND idUsuario = @login ORDER BY fecha DESC`,
    );
  return result.recordset[0];
}

async function cancelarSolicitud(idSolicitud, login) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .query(
      `SELECT idEstatus FROM solicitudTI WHERE idSolicitud = @id AND idUsuario = @login AND idServicio != 2`,
    );
  if (!check.recordset.length) return { ok: false, error: "No autorizado" };
  if (check.recordset[0].idEstatus !== 1)
    return {
      ok: false,
      error: "Solo se pueden cancelar tickets en estado Abierto",
    };
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `UPDATE solicitudTI SET idEstatus = 5, fechaActualizacion = GETDATE() WHERE idSolicitud = @id`,
    );
  return { ok: true };
}

async function postArchivos(idSolicitud, login, archivos) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .query(
      `SELECT idSolicitud FROM solicitudTI WHERE idSolicitud = @id AND idUsuario = @login AND idServicio != 2`,
    );
  if (!check.recordset.length) return null;
  const guardados = [];
  for (const file of archivos) {
    const rutaRelativa = `uploads/solicitudes/${idSolicitud}/${file.filename}`;
    const result = await pool
      .request()
      .input("idSolicitud", sql.Int, idSolicitud)
      .input("nombreArchivo", sql.NVarChar(255), file.originalname)
      .input("rutaServidor", sql.NVarChar(500), rutaRelativa)
      .input("mimeType", sql.VarChar(100), file.mimetype)
      .input("tamanoBytes", sql.Int, file.size)
      .query(`INSERT INTO solicitudTI_archivos (idSolicitud, nombreArchivo, rutaServidor, mimeType, tamanoBytes, fechaSubida)
              OUTPUT INSERTED.idArchivo, INSERTED.nombreArchivo, INSERTED.rutaServidor, INSERTED.mimeType, INSERTED.tamanoBytes, INSERTED.fechaSubida
              VALUES (@idSolicitud, @nombreArchivo, @rutaServidor, @mimeType, @tamanoBytes, GETDATE())`);
    guardados.push(result.recordset[0]);
  }
  return guardados;
}

async function postEvaluacion(
  idSolicitud,
  login,
  { calificacion, emoji, comentario },
) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .query(
      `SELECT idEstatus, tecnicoAsignado, folio FROM solicitudTI WHERE idSolicitud = @id AND idUsuario = @login AND idServicio != 2`,
    );
  if (!check.recordset.length) return { ok: false, error: "No autorizado" };
  if (check.recordset[0].idEstatus !== 3)
    return { ok: false, error: "Solo tickets resueltos" };
  const { tecnicoAsignado, folio } = check.recordset[0];
  const existe = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `SELECT idEvaluacion FROM solicitudTI_evaluacion WHERE idSolicitud = @id`,
    );
  if (existe.recordset.length) return { ok: false, error: "Ya evaluado" };
  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("calificacion", sql.TinyInt, calificacion)
    .input("emoji", sql.VarChar(10), emoji || null)
    .input("comentario", sql.NVarChar(500), comentario || null)
    .query(
      `INSERT INTO solicitudTI_evaluacion (idSolicitud, calificacion, emoji, comentario, fechaRegistro) VALUES (@idSolicitud, @calificacion, @emoji, @comentario, GETDATE())`,
    );
  if (tecnicoAsignado) {
    try {
      await crearNotificacion({
        loginDestino: tecnicoAsignado,
        loginOrigen: login,
        idTipo: TIPOS.EVALUACION_RECIBIDA,
        idSolicitud,
        titulo: "Evaluación recibida",
        descripcion: `Tu atención en ${folio} fue calificada con ${calificacion} estrella${calificacion !== 1 ? "s" : ""}`,
        urlDestino: `/mesa-de-servicio/admin/incidencias?folio=${folio}`,
      });
    } catch (e) {
      console.error("[Notificación] postEvaluacion:", e.message);
    }
  }
  return { ok: true };
}

async function cerrarSolicitud(idSolicitud, login) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .query(
      `SELECT idEstatus FROM solicitudTI WHERE idSolicitud = @id AND idUsuario = @login AND idServicio != 2`,
    );
  if (!check.recordset.length) return { ok: false, error: "No autorizado" };
  if (check.recordset[0].idEstatus !== 3)
    return { ok: false, error: "Solo se pueden cerrar tickets resueltos" };
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `UPDATE solicitudTI SET idEstatus = 4, fechaActualizacion = GETDATE() WHERE idSolicitud = @id`,
    );
  return { ok: true };
}

async function reabrirSolicitud(idSolicitud, login) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar, login)
    .query(
      `SELECT idEstatus, fechaResolucion FROM solicitudTI WHERE idSolicitud = @id AND idUsuario = @login AND idServicio != 2`,
    );
  if (!check.recordset.length) return { ok: false, error: "No autorizado" };
  const row = check.recordset[0];
  if (row.idEstatus !== 4)
    return { ok: false, error: "Solo se pueden reabrir tickets cerrados" };
  if ((new Date() - new Date(row.fechaResolucion)) / 3_600_000 > 48)
    return {
      ok: false,
      error: "La ventana de 48 horas para reabrir ha expirado",
    };
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `UPDATE solicitudTI SET idEstatus = 1, fechaActualizacion = GETDATE() WHERE idSolicitud = @id`,
    );
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(`DELETE FROM solicitudTI_evaluacion WHERE idSolicitud = @id`);
  return { ok: true };
}

module.exports = {
  getMisKpis,
  getMisSolicitudes,
  getDetalleSolicitud,
  postComentario,
  cancelarSolicitud,
  postArchivos,
  postEvaluacion,
  cerrarSolicitud,
  reabrirSolicitud,
};
