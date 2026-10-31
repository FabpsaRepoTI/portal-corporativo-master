                  "use strict";
// ─────────────────────────────────────────────────────────────
// services/dev/tareas.service.js
// ─────────────────────────────────────────────────────────────
const sql = require("mssql");
const { getPool } = require("../../db");
const { recalcularAvance } = require("./proyectos.service");

async function getTareas(idProyecto) {
  if (!idProyecto) throw new Error("idProyecto es obligatorio.");
  const pool = await getPool();
  const r = await pool.request()
    .input("id", sql.Int, idProyecto)
    .query(`
      SELECT t.*, u.name AS nombreAsignado,
        h.nombre AS hitoNombre
      FROM dev_tareas t
      LEFT JOIN sec_users u ON u.login = t.loginAsignado
      LEFT JOIN dev_hitos h ON h.idHito = t.idHito
      WHERE t.idProyecto = @id
      ORDER BY t.ordenVisualizacion, t.fechaCreacion
    `);
  return { data: r.recordset };
}

async function crearTarea(body, user) {
  const pool = await getPool();
  if (!body.idProyecto) throw new Error("idProyecto es obligatorio.");
  if (!body.titulo?.trim()) throw new Error("El título de la tarea es obligatorio.");

  // Calcular orden: al final de la lista
  const ord = await pool.request()
    .input("id", sql.Int, parseInt(body.idProyecto))
    .query("SELECT ISNULL(MAX(ordenVisualizacion), 0) + 1 AS siguiente FROM dev_tareas WHERE idProyecto = @id");

  const r = await pool.request()
    .input("idProyecto",    sql.Int,          parseInt(body.idProyecto))
    .input("titulo",        sql.NVarChar(300), body.titulo.trim())
    .input("descripcion",   sql.NVarChar(sql.MAX), body.descripcion?.trim() || null)
    .input("loginAsignado", sql.VarChar(255),  body.loginAsignado || null)
    .input("tipo",          sql.TinyInt,       parseInt(body.tipo) || 1)
    .input("peso",          sql.TinyInt,       parseInt(body.peso) || 1)
    .input("horasEst",      sql.Decimal(5,1),  body.horasEstimadas ? parseFloat(body.horasEstimadas) : null)
    .input("fechaInicio",   sql.Date,          body.fechaInicio ? new Date(body.fechaInicio) : null)
    .input("fechaComp",     sql.Date,          body.fechaCompromiso ? new Date(body.fechaCompromiso) : null)
    .input("esEntregable",  sql.Bit,           body.esEntregable ? 1 : 0)
    .input("idHito",        sql.Int,           body.idHito ? parseInt(body.idHito) : null)
    .input("orden",         sql.Int,           ord.recordset[0].siguiente)
    .input("creadoPor",     sql.VarChar(255),  user.login)
    .query(`
      INSERT INTO dev_tareas
        (idProyecto, titulo, descripcion, loginAsignado, tipo, peso,
         horasEstimadas, fechaInicio, fechaCompromiso, esEntregable,
         idHito, ordenVisualizacion, idEstatus, creadoPor, fechaCreacion)
      OUTPUT INSERTED.idTarea
      VALUES
        (@idProyecto, @titulo, @descripcion, @loginAsignado, @tipo, @peso,
         @horasEst, @fechaInicio, @fechaComp, @esEntregable,
         @idHito, @orden, 1, @creadoPor, GETDATE())
    `);

  // Al agregar tareas, el avance pasa a ser calculado
  await recalcularAvance(parseInt(body.idProyecto));
  return { idTarea: r.recordset[0].idTarea };
}

async function actualizarTarea(idTarea, body, user) {
  const pool = await getPool();

  // Obtener idProyecto para recalcular después
  const actual = await pool.request()
    .input("id", sql.Int, idTarea)
    .query("SELECT idProyecto FROM dev_tareas WHERE idTarea = @id");
  if (!actual.recordset.length) throw new Error("Tarea no encontrada.");
  const idProyecto = actual.recordset[0].idProyecto;

  await pool.request()
    .input("id",           sql.Int,           idTarea)
    .input("titulo",       sql.NVarChar(300),  body.titulo?.trim() || null)
    .input("descripcion",  sql.NVarChar(sql.MAX), body.descripcion?.trim() || null)
    .input("loginAsig",    sql.VarChar(255),   body.loginAsignado || null)
    .input("tipo",         sql.TinyInt,        body.tipo ? parseInt(body.tipo) : null)
    .input("peso",         sql.TinyInt,        body.peso ? parseInt(body.peso) : null)
    .input("horasEst",     sql.Decimal(5,1),   body.horasEstimadas != null ? parseFloat(body.horasEstimadas) : null)
    .input("fechaInicio",  sql.Date,           body.fechaInicio ? new Date(body.fechaInicio) : null)
    .input("fechaComp",    sql.Date,           body.fechaCompromiso ? new Date(body.fechaCompromiso) : null)
    .input("esEntregable", sql.Bit,            body.esEntregable != null ? (body.esEntregable ? 1 : 0) : null)
    .input("idHito",       sql.Int,            body.idHito ? parseInt(body.idHito) : null)
    .input("orden",        sql.Int,            body.ordenVisualizacion != null ? parseInt(body.ordenVisualizacion) : null)
    .input("login",        sql.VarChar(255),   user.login)
    .query(`
      UPDATE dev_tareas SET
        titulo              = ISNULL(@titulo,       titulo),
        descripcion         = ISNULL(@descripcion,  descripcion),
        loginAsignado       = ISNULL(@loginAsig,    loginAsignado),
        tipo                = ISNULL(@tipo,         tipo),
        peso                = ISNULL(@peso,         peso),
        horasEstimadas      = ISNULL(@horasEst,     horasEstimadas),
        fechaInicio         = ISNULL(@fechaInicio,  fechaInicio),
        fechaCompromiso     = ISNULL(@fechaComp,    fechaCompromiso),
        esEntregable        = ISNULL(@esEntregable, esEntregable),
        idHito              = ISNULL(@idHito,       idHito),
        ordenVisualizacion  = ISNULL(@orden,        ordenVisualizacion),
        fechaModificacion   = GETDATE()
      WHERE idTarea = @id
    `);

  await recalcularAvance(idProyecto);
  return { ok: true };
}

async function completarTarea(idTarea, user) {
  const pool = await getPool();
  const actual = await pool.request()
    .input("id", sql.Int, idTarea)
    .query("SELECT idProyecto, idEstatus FROM dev_tareas WHERE idTarea = @id");
  if (!actual.recordset.length) throw new Error("Tarea no encontrada.");
  if (actual.recordset[0].idEstatus === 3) throw new Error("La tarea ya está completada.");

  const idProyecto = actual.recordset[0].idProyecto;

  await pool.request()
    .input("id",    sql.Int,         idTarea)
    .input("login", sql.VarChar(255),user.login)
    .query(`
      UPDATE dev_tareas SET
        idEstatus       = 3,
        fechaCompletada = CAST(GETDATE() AS DATE),
        completadaPor   = @login,
        fechaModificacion = GETDATE()
      WHERE idTarea = @id
    `);

  await recalcularAvance(idProyecto);
  return { ok: true };
}

async function cancelarTarea(idTarea, user) {
  const pool = await getPool();
  const actual = await pool.request()
    .input("id", sql.Int, idTarea)
    .query("SELECT idProyecto FROM dev_tareas WHERE idTarea = @id");
  if (!actual.recordset.length) throw new Error("Tarea no encontrada.");
  const idProyecto = actual.recordset[0].idProyecto;

  await pool.request()
    .input("id", sql.Int, idTarea)
    .query("UPDATE dev_tareas SET idEstatus = 4, fechaModificacion = GETDATE() WHERE idTarea = @id");

  await recalcularAvance(idProyecto);
  return { ok: true };
}

module.exports = { getTareas, crearTarea, actualizarTarea, completarTarea, cancelarTarea };
