"use strict";
// ─────────────────────────────────────────────────────────────
// services/dev/avances.service.js
// Historial inmutable de actualizaciones de avance.
// NUNCA se sobreescribe un avance publicado.
// ─────────────────────────────────────────────────────────────
const sql  = require("mssql");
const etapas = require("../desarrolloEtapas.service");
const path = require("path");
const { getPool } = require("../../db");
  const { _evaluarRiesgo } = require("./proyectos.service");

async function assertOpen(pool,id) {
  const result=await pool.request().input('id',sql.Int,id).query("SELECT p.idEstatus AS legacyStatus,s.idEstatus AS mesaStatus,JSON_VALUE(s.camposExtra,'$.alcanceDesarrollo') AS alcance FROM dev_proyectos p LEFT JOIN solicitudTI s ON s.idSolicitud=p.idSolicitudOrigen WHERE p.idProyecto=@id");
  const row=result.recordset[0];
  if (!row) return;
  const closed=row.mesaStatus != null ? [6,7].includes(Number(row.mesaStatus)) : [5,6].includes(Number(row.legacyStatus));
  if (closed) throw new Error('El desarrollo está cerrado y no admite avances ni borradores.');
  if (row.alcance==='CAMBIO_SENCILLO') throw new Error('Las adecuaciones menores se atienden en Mesa de Servicio.');
}

async function ensureStageColumns(pool) {
 await pool.request().query("IF COL_LENGTH('dbo.dev_avances','tipoActividad') IS NULL ALTER TABLE dbo.dev_avances ADD tipoActividad TINYINT NULL;");
 await etapas.ensureSchema(pool);
 await pool.request().query("IF COL_LENGTH('dbo.dev_avances','numeroEtapa') IS NULL ALTER TABLE dbo.dev_avances ADD numeroEtapa TINYINT NULL,fechaInicioEtapa DATE NULL,fechaFinEtapa DATE NULL;");
}
const UPLOAD_PATH_PREFIX = "/uploads/dev/avances";

async function getAvances(idProyecto) {
  if (!idProyecto) throw new Error("idProyecto es obligatorio.");
  const pool = await getPool();
  const r = await pool.request()
    .input("id", sql.Int, idProyecto)
    .query(`
      SELECT a.*, u.picture AS fotoDesarrollador
      FROM dev_avances a
      LEFT JOIN sec_users u ON u.login = a.loginDesarrollador
      WHERE a.idProyecto = @id AND a.idEstado = 1
      ORDER BY a.fechaRegistro DESC
    `);
  return { data: r.recordset };
}

async function publicarAvance(body, user, files = []) {
  let pool       = await getPool();
  await ensureStageColumns(pool);
  const idProyecto = parseInt(body.idProyecto);
    if (!idProyecto)             throw new Error("idProyecto es obligatorio.");
    await assertOpen(pool,idProyecto);
  if (!body.queTermine?.trim()) throw new Error("'Qué terminé' es obligatorio.");
  if (!body.enQueEstoy?.trim()) throw new Error("'En qué estoy trabajando' es obligatorio.");
  if (!body.queSigue?.trim())   throw new Error("'Qué sigue' es obligatorio.");

  const horasInvertidas = parseFloat(body.horasInvertidas);
  if (isNaN(horasInvertidas) || horasInvertidas < 0)
    throw new Error("Las horas invertidas son obligatorias.");


  const avancePctNuevo = parseInt(body.avancePctNuevo);
  if (isNaN(avancePctNuevo) || avancePctNuevo < 0 || avancePctNuevo > 100)
    throw new Error("El porcentaje de avance debe estar entre 0 y 100.");

  // Obtener avance anterior del proyecto
  const proy = await pool.request()
    .input("id", sql.Int, idProyecto)
    .query("SELECT avancePct, idEstatus FROM dev_proyectos WHERE idProyecto = @id");
  if (!proy.recordset.length) throw new Error("Proyecto no encontrado.");
  if (proy.recordset[0].idEstatus === 5) throw new Error("El proyecto ya está liberado.");

  const avancePctAnterior = proy.recordset[0].avancePct ?? 0;

  // Si el avance subió más de 20 puntos, exigir justificación
  if ((avancePctNuevo - avancePctAnterior) > 20 && !body.justificacionAvance?.trim())
    throw new Error("El avance subió más de 20 puntos. Es obligatorio indicar la justificación.");

  // Verificar si tiene tareas — si las hay, ignorar el avancePctNuevo
  // y usar el calculado automáticamente
  const tareas = await pool.request()
    .input("id", sql.Int, idProyecto)
    .query("SELECT COUNT(*) AS total FROM dev_tareas WHERE idProyecto = @id AND idEstatus != 4");
  const tieneTareas = tareas.recordset[0].total > 0;


  const entity = await etapas.scope(pool,'dev',idProyecto);
  const tx = new sql.Transaction(pool); await tx.begin();
  pool = { request: () => new sql.Request(tx) };
  try {
  const active = await pool.request().input('origen',sql.VarChar(4),entity.origen).input('id',sql.Int,entity.id).query('SELECT numeroEtapa,fechaInicio,fechaCompromiso FROM dbo.desarrollo_etapas WITH (UPDLOCK,HOLDLOCK) WHERE origen=@origen AND idEntidad=@id AND activa=1');
  const etapa = active.recordset[0];
  if(entity.origen === 'mesa') await pool.request().input('id',sql.Int,entity.id).input('avance',sql.TinyInt,tieneTareas?avancePctAnterior:avancePctNuevo)
    .query('UPDATE solicitudTI_desarrollo_detalle SET porcentajeAvance=@avance WHERE idSolicitud=@id; UPDATE solicitudTI SET fechaActualizacion=GETDATE() WHERE idSolicitud=@id');
  // INSERT del avance (inmutable)
  const r = await pool.request()
    .input("idProyecto",         sql.Int,           idProyecto)
    .input("idTarea",            sql.Int,            body.idTarea ? parseInt(body.idTarea) : null)
    .input("idHito",             sql.Int,            body.idHito  ? parseInt(body.idHito)  : null)
    .input("loginDesarrollador", sql.VarChar(255),   user.login)
    .input("nombreDesarrollador",sql.NVarChar(200),  user.name)
    .input("queTermine",         sql.NVarChar(sql.MAX), body.queTermine.trim())
    .input("enQueEstoy",         sql.NVarChar(sql.MAX), body.enQueEstoy.trim())
    .input("queSigue",           sql.NVarChar(sql.MAX), body.queSigue.trim())
    .input("avancePctAnterior",  sql.TinyInt,        avancePctAnterior)
    .input("avancePctNuevo",     sql.TinyInt,        tieneTareas ? avancePctAnterior : avancePctNuevo)
    .input("justificacion",      sql.NVarChar(500),  body.justificacionAvance?.trim() || null)
    .input("horasInvertidas",    sql.Decimal(5,1),   horasInvertidas)
    .input("tiempoRestante",     sql.Decimal(5,1),   body.tiempoRestanteHoras ? parseFloat(body.tiempoRestanteHoras) : null)
    .input("proximaFecha",       sql.Date,           body.proximaFechaEntrega ? new Date(body.proximaFechaEntrega) : null)
    .input("tieneBloqueo",       sql.Bit,            body.tieneBloqueo ? 1 : 0)
    .input("apoyoRequerido",     sql.NVarChar(500),  body.apoyoRequerido?.trim() || null)
    .input("tipoAvance", sql.TinyInt, [1,2,3,4,5,6,7].includes(Number(body.tipoActividad)) ? Number(body.tipoActividad) : null)
    .input("observaciones",      sql.NVarChar(sql.MAX), body.observaciones?.trim() || null)
    .input("etapa",sql.TinyInt,etapa?.numeroEtapa ?? null).input("ei",sql.Date,etapa?.fechaInicio ?? null).input("ef",sql.Date,etapa?.fechaCompromiso ?? null)
    .query(`
      INSERT INTO dev_avances
        (idProyecto, idTarea, idHito, loginDesarrollador, nombreDesarrollador,
         queTermine, enQueEstoy, queSigue,
         avancePctAnterior, avancePctNuevo, justificacionAvance,
         horasInvertidas, tiempoRestanteHoras, proximaFechaEntrega,
         tieneBloqueo, apoyoRequerido, tipoActividad, observaciones,
         idEstado, fechaRegistro,numeroEtapa,fechaInicioEtapa,fechaFinEtapa)
      OUTPUT INSERTED.idAvance
      VALUES
        (@idProyecto, @idTarea, @idHito, @loginDesarrollador, @nombreDesarrollador,
         @queTermine, @enQueEstoy, @queSigue,
         @avancePctAnterior, @avancePctNuevo, @justificacion,
         @horasInvertidas, @tiempoRestante, @proximaFecha,
         @tieneBloqueo, @apoyoRequerido, @tipoAvance, @observaciones,
         1, GETDATE(),@etapa,@ei,@ef)
    `);
  const idAvance = r.recordset[0].idAvance;

  // Registrar horas en solicitudTI_desarrollo_horas vinculadas al proyecto
  if (horasInvertidas > 0) {
    await pool.request()
      .input("idSolicitud",   sql.Int,           entity.origen === "mesa" ? entity.id : null)  // No siempre tiene solicitud origen
      .input("idProyecto",    sql.Int,            idProyecto)
      .input("login",         sql.VarChar(255),   user.login)
      .input("nombre",        sql.NVarChar(200),  user.name)
      .input("minutos",       sql.Int,            Math.round(horasInvertidas * 60))
      .input("descripcion",   sql.NVarChar(500),  body.enQueEstoy.trim().slice(0, 200))
      .input("tipoActividad", sql.TinyInt,        parseInt(body.tipoActividad) || 1)
      .input("idTarea",       sql.Int,            body.idTarea ? parseInt(body.idTarea) : null)
      .input("fecha",         sql.Date,           new Date())
      .query(`
        INSERT INTO solicitudTI_desarrollo_horas
          (idSolicitud, idProyecto, loginUsuario, nombreUsuario,
           minutosTrabajos, descripcion, tipoActividad, idTarea,
           fechaRegistro, fechaTrabajo)
        VALUES
          (@idSolicitud, @idProyecto, @login, @nombre,
           @minutos, @descripcion, @tipoActividad, @idTarea,
           GETDATE(), @fecha)
      `);
  }

  // Adjuntar archivos de evidencia como documentos del proyecto
  for (const f of files) {
    await pool.request()
      .input("idProyecto",   sql.Int,         idProyecto)
      .input("nombre",       sql.VarChar(255),f.originalname)
      .input("ruta",         sql.VarChar(500),`${UPLOAD_PATH_PREFIX}/${f.filename}`)
      .input("mime",         sql.VarChar(100),f.mimetype)
      .input("size",         sql.BigInt,      f.size)
      .input("categoria",    sql.TinyInt,     9)  // "Otro" por default; el usuario puede cambiarla
      .input("visibilidad",  sql.TinyInt,     2)
      .input("subidoPor",    sql.VarChar(255),user.login)
      .query(`
        INSERT INTO solicitudTI_archivos
          (idProyecto, nombreArchivo, rutaServidor, mimeType, tamanoBytes,
           fechaSubida, categoriaDoc, visibilidad, subidoPor)
        VALUES
          (@idProyecto, @nombre, @ruta, @mime, @size,
           GETDATE(), @categoria, @visibilidad, @subidoPor)
      `);
  }

  // Si no tiene tareas, actualizar avance del proyecto con el valor del avance
  if (!tieneTareas) {
    await pool.request()
      .input("id",     sql.Int,     idProyecto)
      .input("avance", sql.TinyInt, avancePctNuevo)
      .input("login",  sql.VarChar(255), user.login)
      .query(`
        UPDATE dev_proyectos SET
          avancePct         = @avance,
          avanceEsManual    = 1,
          avanceAnteriorPct = @avance,
          modificadoPor     = @login,
          fechaModificacion = GETDATE()
        WHERE idProyecto = @id
      `);
  }

  // Eliminar borrador si existía
  await pool.request()
    .input("idProyecto", sql.Int,         idProyecto)
    .input("login",      sql.VarChar(255),user.login)
    .query(`
      DELETE FROM dev_avances
      WHERE idProyecto = @idProyecto AND loginDesarrollador = @login AND idEstado = 2
    `);

  await _evaluarRiesgo(pool, idProyecto);
  await tx.commit();
  return { idAvance };
  } catch(e) { await tx.rollback(); throw e; }
}

async function guardarBorrador(body, user) {
  const pool       = await getPool();
  await ensureStageColumns(pool);
  const idProyecto = parseInt(body.idProyecto);
    if (!idProyecto) throw new Error("idProyecto es obligatorio.");
    await assertOpen(pool,idProyecto);

  // Borrar borrador anterior del mismo desarrollador en el mismo proyecto
  await pool.request()
    .input("idProyecto", sql.Int,         idProyecto)
    .input("login",      sql.VarChar(255),user.login)
    .query(`
      DELETE FROM dev_avances
      WHERE idProyecto = @idProyecto AND loginDesarrollador = @login AND idEstado = 2
    `);

  const r = await pool.request()
    .input("idProyecto",          sql.Int,           idProyecto)
    .input("loginDesarrollador",  sql.VarChar(255),  user.login)
    .input("nombreDesarrollador", sql.NVarChar(200), user.name)
    .input("queTermine",          sql.NVarChar(sql.MAX), body.queTermine?.trim() || "")
    .input("enQueEstoy",          sql.NVarChar(sql.MAX), body.enQueEstoy?.trim() || "")
    .input("queSigue",            sql.NVarChar(sql.MAX), body.queSigue?.trim() || "")
    .input("avancePctNuevo",      sql.TinyInt,       parseInt(body.avancePctNuevo) || 0)
    .input("horasInvertidas",     sql.Decimal(5,1),  parseFloat(body.horasInvertidas) || 0)
    .input("tipoAvance", sql.TinyInt, [1,2,3,4,5,6,7].includes(Number(body.tipoActividad)) ? Number(body.tipoActividad) : null)
    .input("observaciones",       sql.NVarChar(sql.MAX), body.observaciones?.trim() || null)
    .input("etapa",sql.TinyInt,body.numeroEtapa || null).input("ei",sql.Date,body.fechaInicioEtapa || null).input("ef",sql.Date,body.fechaFinEtapa || null)
    .query(`
      INSERT INTO dev_avances
        (idProyecto, loginDesarrollador, nombreDesarrollador,
         queTermine, enQueEstoy, queSigue,
         avancePctAnterior, avancePctNuevo, horasInvertidas,
         tipoActividad, observaciones, idEstado, fechaRegistro,numeroEtapa,fechaInicioEtapa,fechaFinEtapa)
      OUTPUT INSERTED.idAvance
      VALUES
        (@idProyecto, @loginDesarrollador, @nombreDesarrollador,
         @queTermine, @enQueEstoy, @queSigue,
         0, @avancePctNuevo, @horasInvertidas,
         @tipoAvance, @observaciones, 2, GETDATE(),@etapa,@ei,@ef)
    `);
  return { idAvance: r.recordset[0].idAvance };
}

async function getBorrador(idProyecto, login) {
  if (!idProyecto) return { data: null };
  const pool = await getPool();
  const r = await pool.request()
    .input("id",    sql.Int,         idProyecto)
    .input("login", sql.VarChar(255),login)
    .query(`
      SELECT TOP 1 * FROM dev_avances
      WHERE idProyecto = @id AND loginDesarrollador = @login AND idEstado = 2
      ORDER BY fechaRegistro DESC
    `);
  return { data: r.recordset[0] ?? null };
}

module.exports = { getAvances, publicarAvance, guardarBorrador, getBorrador };
