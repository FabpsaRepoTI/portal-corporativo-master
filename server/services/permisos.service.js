const { getPool, sql } = require("../db");

const getModulosUsuario = async (login) => {
  const pool = await getPool();
  const res = await pool.request().input("login", sql.VarChar, login).query(`
            SELECT m.clave
            FROM portal_modulos m
            JOIN portal_usuario_modulos um ON m.idModulo = um.idModulo
            WHERE um.login = @login AND m.activo = 1
        `);
  return res.recordset.map((r) => r.clave);
};

const getModulosCatalogo = async () => {
  const pool = await getPool();
  const res = await pool
    .request()
    .query(`SELECT * FROM portal_modulos WHERE activo = 1 ORDER BY orden`);
  return res.recordset;
};

const setModulosUsuario = async (login, claves) => {
  const pool = await getPool();
  const tx = pool.transaction();
  await tx.begin();
  try {
    // Borrar asignaciones actuales
    await tx
      .request()
      .input("login", sql.VarChar, login)
      .query(`DELETE FROM portal_usuario_modulos WHERE login = @login`);

    // Insertar las nuevas
    for (const clave of claves) {
      await tx
        .request()
        .input("login", sql.VarChar, login)
        .input("clave", sql.VarChar, clave).query(`
                    INSERT INTO portal_usuario_modulos (login, idModulo)
                    SELECT @login, idModulo FROM portal_modulos
                    WHERE clave = @clave AND activo = 1
                `);
    }
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
};

module.exports = { getModulosUsuario, getModulosCatalogo, setModulosUsuario };
