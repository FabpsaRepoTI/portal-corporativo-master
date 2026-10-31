"use strict";
// ─────────────────────────────────────────────────────────────
// services/dev/hitos.service.js
// ─────────────────────────────────────────────────────────────
const sql = require("mssql");
const { getPool } = require("../../db");

async function getHitos(idProyecto) {
  if (!idProyecto) throw new Error("idProyecto es obligatorio.");
  const pool = await getPool();
  const [hitos, tareasPorHito] = await Promise.all([
    pool.request().input("id", sql.Int, idProyecto).query(`
      SELECT h.*, u.name AS nombreValidador
      FROM dev_hitos h
      LEFT JOIN sec_users u ON u.login = h.validadoPor
      WHERE h.idProyecto = @id
      ORDER BY h.etapa, h.fechaCompromiso
    `),
    pool.request().input("id", sql.Int, idProyecto).query(`
      SELECT idHito,
        COUNT(*) AS totalTareas,
        SUM(CASE WHEN idEstatus = 3 THEN 1 ELSE 0 END) AS tareasCompletadas
      FROM dev_tareas
      WHERE idProyecto = @id AND idHito IS NOT NULL
      GROUP BY idHito
    `),
  ]);

  const tareasMap = {};
  for (const t of tareasPorHito.recordset) tareasMap[t.idHito] = t;

  return {
    data: hitos.recordset.map(h => ({
      ...h,
      totalTareas:       tareasMap[h.idHito]?.totalTareas ?? 0,
      tareasCompletadas: tareasMap[h.idHito]?.tareasCompletadas ?? 0,
    })),
  };
}

async function crearHito(body, user) {
  const pool = await getPool();
  if (!body.idProyecto) throw new Error("idProyecto es obligatorio.");
  if (!body.nombre?.trim()) throw new Error("El nombre del hito es obligatorio.");

  const r = await pool.request()
    .input("idProyecto",   sql.Int,          parseInt(body.idProyecto))
    .input("etapa",        sql.TinyInt,      parseInt(body.etapa) || 1)
    .input("nombre",       sql.NVarChar(200),body.nombre.trim())
    .input("descripcion",  sql.NVarChar(500),body.descripcion?.trim() || null)
    .input("entregable",   sql.NVarChar(300),body.entregable?.trim() || null)
    .input("fechaComp",    sql.Date,         body.fechaCompromiso ? new Date(body.fechaCompromiso) : null)
    .input("creadoPor",    sql.VarChar(255), user.login)
    .query(`
      INSERT INTO dev_hitos
        (idProyecto, etapa, nombre, descripcion, entregable,
         fechaCompromiso, idEstatus, creadoPor, fechaCreacion)
      OUTPUT INSERTED.idHito
      VALUES
        (@idProyecto, @etapa, @nombre, @descripcion, @entregable,
         @fechaComp, 1, @creadoPor, GETDATE())
    `);
  return { idHito: r.recordset[0].idHito };
}

async function actualizarHito(idHito, body, user) {
  const pool = await getPool();
  await pool.request()
    .input("id",          sql.Int,          idHito)
    .input("nombre",      sql.NVarChar(200),body.nombre?.trim() || null)
    .input("descripcion", sql.NVarChar(500),body.descripcion?.trim() || null)
    .input("entregable",  sql.NVarChar(300),body.entregable?.trim() || null)
    .input("fechaComp",   sql.Date,         body.fechaCompromiso ? new Date(body.fechaCompromiso) : null)
    .input("idEstatus",   sql.TinyInt,      body.idEstatus ? parseInt(body.idEstatus) : null)
    .query(`
      UPDATE dev_hitos SET
        nombre          = ISNULL(@nombre,      nombre),
        descripcion     = ISNULL(@descripcion, descripcion),
        entregable      = ISNULL(@entregable,  entregable),
        fechaCompromiso = ISNULL(@fechaComp,   fechaCompromiso),
        idEstatus       = ISNULL(@idEstatus,   idEstatus),
        fechaCompletado = CASE WHEN @idEstatus = 3 AND fechaCompletado IS NULL THEN CAST(GETDATE() AS DATE) ELSE fechaCompletado END
      WHERE idHito = @id
    `);
  return { ok: true };
}

async function validarHito(idHito, user) {
  const pool = await getPool();
  await pool.request()
    .input("id",    sql.Int,         idHito)
    .input("login", sql.VarChar(255),user.login)
    .query(`
      UPDATE dev_hitos SET
        idEstatus       = 3,
        fechaCompletado = CAST(GETDATE() AS DATE),
        validadoPor     = @login,
        fechaValidacion = GETDATE()
      WHERE idHito = @id
    `);
  return { ok: true };
}

module.exports = { getHitos, crearHito, actualizarHito, validarHito };
