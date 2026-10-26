// server/db.fdnc.js
// Pool de conexión al ERP de FDNC (tabla ARTICULO, entre otras).
// Usa su propio ConnectionPool: sql.connect() devolvería el pool global
// que ya ocupa db.js (Azure) y las consultas irían a la base equivocada.
const sql = require("mssql");

const config = {
  user: process.env.FDNC_DB_USER,
  password: process.env.FDNC_DB_PASSWORD,
  server: process.env.FDNC_DB_SERVER,
  database: process.env.FDNC_DB_NAME,
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let poolPromise = null;

async function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .then((pool) => {
        console.log("[db.fdnc] Conectado a base FDNC:", process.env.FDNC_DB_NAME);
        pool.on("error", (err) => {
          console.error("[db.fdnc] Error en el pool:", err.message);
          poolPromise = null;
        });
        return pool;
      })
      .catch((err) => {
        poolPromise = null; // permite reintentar en la siguiente llamada
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { getPool, sql };
