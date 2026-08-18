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

  // Convertir buffer image → data URL base64 para el frontend
  if (row.picture && Buffer.isBuffer(row.picture)) {
    row.picture = "data:image/jpeg;base64," + row.picture.toString("base64");
  }

  return row;
}

async function updateFoto(login, picture) {
  const pool = await getPool();

  // El frontend manda "data:image/png;base64,XXXX..." — extraemos solo los bytes
  const base64Data = picture.includes(",") ? picture.split(",")[1] : picture;
  const buffer = Buffer.from(base64Data, "base64");

  await pool
    .request()
    .input("login", sql.VarChar, login)
    .input("picture", sql.Image, buffer).query(`
      UPDATE sec_users
      SET picture = @picture
      WHERE login = @login
    `);
}

module.exports = { getPerfil, updateFoto };
