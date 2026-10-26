const { getPool, sql } = require("../db");

async function getPerfil(login) {
  const pool = await getPool();
  const result = await pool.request().input("login", sql.VarChar, login).query(`
      SELECT login, name, email, area, sitio, picture
      FROM sec_users
      WHERE login = @login
    `);

  const row = result.recordset[0];
  if (!row) return null;

  // picture ahora es NVARCHAR — es una URL, no un buffer
  // Si por algún caso llega buffer (datos muy viejos) lo ignoramos
  if (row.picture && Buffer.isBuffer(row.picture)) {
    row.picture = null;
  }

  return row;
}

async function updateFoto(login, pictureUrl) {
  const pool = await getPool();
  await pool
    .request()
    .input("login", sql.VarChar(100), login)
    .input("picture", sql.NVarChar(500), pictureUrl).query(`
      UPDATE sec_users
      SET picture = @picture
      WHERE login = @login
    `);
}

module.exports = { getPerfil, updateFoto };
