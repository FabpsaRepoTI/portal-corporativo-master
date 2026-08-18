// services/home.service.js
const { getPool, sql } = require("../db");

async function getComunicados() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TOP 5
      idComunicado,
      encabezado,
      cuerpo,
      fechaPublicacion,
      loginAutor
    FROM home_comunicados
    WHERE activo = 1
    ORDER BY fechaPublicacion DESC
  `);
  return result.recordset;
}

async function crearComunicado({ encabezado, cuerpo, loginAutor }) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("encabezado", sql.NVarChar(200), encabezado)
    .input("cuerpo", sql.NVarChar(1000), cuerpo || null)
    .input("loginAutor", sql.VarChar(255), loginAutor || null).query(`
      INSERT INTO home_comunicados (encabezado, cuerpo, loginAutor)
      OUTPUT INSERTED.*
      VALUES (@encabezado, @cuerpo, @loginAutor)
    `);
  return result.recordset[0];
}

async function getEstadoServicios() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      c.idServicio,
      c.nombre,
      c.slug,
      ISNULL(e.estado, 'operando') AS estado,
      ISNULL(e.detalle, '')        AS detalle,
      e.fechaRegistro,
      e.loginAutor
    FROM cat_servicioTI c
    LEFT JOIN (
      SELECT idServicio, estado, detalle, fechaRegistro, loginAutor,
             ROW_NUMBER() OVER (PARTITION BY idServicio ORDER BY fechaRegistro DESC) AS rn
      FROM home_estado_servicios
      WHERE activo = 1
    ) e ON c.idServicio = e.idServicio AND e.rn = 1
    WHERE c.slug IN ('inc-correo', 'inc-erp', 'inc-red', 'inc-office365', 'inc-telefonia')
    ORDER BY c.nombre
  `);
  return result.recordset;
}

async function actualizarEstado({ idServicio, estado, detalle, loginAutor }) {
  const pool = await getPool();

  await pool
    .request()
    .input("idServicio", sql.Int, idServicio)
    .query(
      `UPDATE home_estado_servicios SET activo = 0 WHERE idServicio = @idServicio`,
    );

  const result = await pool
    .request()
    .input("idServicio", sql.Int, idServicio)
    .input("estado", sql.VarChar(50), estado)
    .input("detalle", sql.NVarChar(500), detalle || null)
    .input("loginAutor", sql.VarChar(255), loginAutor || null).query(`
      INSERT INTO home_estado_servicios (idServicio, estado, detalle, loginAutor)
      OUTPUT INSERTED.*
      VALUES (@idServicio, @estado, @detalle, @loginAutor)
    `);

  return result.recordset[0];
}

async function getServiciosTI() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT idServicio, nombre, slug
    FROM cat_servicioTI
    WHERE slug IN ('inc-correo', 'inc-erp', 'inc-red', 'inc-office365', 'inc-telefonia')
    ORDER BY nombre
  `);
  return result.recordset;
}

module.exports = {
  getComunicados,
  crearComunicado,
  getEstadoServicios,
  actualizarEstado,
  getServiciosTI,
};
