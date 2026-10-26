const { getPool, sql } = require("../db");

async function yaRespondio(correo) {
  if (!correo) return false;
  const pool = await getPool();
  const r = await pool
    .request()
    .input("correo", sql.VarChar(255), correo)
    .query(
      "SELECT TOP 1 ID FROM encuestaPrueba WHERE Correo = @correo",
    );
  return r.recordset.length > 0;
}

async function registrar({ nombre, correo, ip, satisfaccion, oportunidades, comentarios }) {
  const pool = await getPool();
  await pool
    .request()
    .input("nombre", sql.NVarChar(200), nombre || null)
    .input("correo", sql.VarChar(255), correo || null)
    .input("ip", sql.VarChar(64), ip || null)
    .input("satisfaccion", sql.Text, satisfaccion)
    .input("oportunidades", sql.Text, oportunidades)
    .input("comentarios", sql.NVarChar(sql.MAX), comentarios || null)
    .query(`
      INSERT INTO encuestaPrueba (Satisfaccion, Oportunidades, Correo, IP, FechaRegistro, nombre, comentarios)
      VALUES (@satisfaccion, @oportunidades, @correo, @ip, GETDATE(), @nombre, @comentarios)
    `);
}

async function listar() {
  const pool = await getPool();
  const r = await pool.request().query(
    "SELECT ID, Satisfaccion, Oportunidades, Correo, IP, FechaRegistro, nombre, comentarios FROM encuestaPrueba ORDER BY FechaRegistro DESC",
  );
  return r.recordset;
}

module.exports = { yaRespondio, registrar, listar };
