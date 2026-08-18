// server/db.cedis.js
const sql = require("mssql");

const config = {
  server: process.env.DB_CEDIS_SERVER,
  database: process.env.DB_CEDIS_NAME,
  user: process.env.DB_CEDIS_USER,
  password: process.env.DB_CEDIS_PASSWORD,
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

async function getCedisPool() {
  if (pool && pool.connected) return pool;
  try {
    pool = await new sql.ConnectionPool(config).connect();
    console.log(
      "[db.cedis] Conectado a base CEDIS:",
      process.env.DB_CEDIS_NAME,
    );
    return pool;
  } catch (err) {
    console.error("[db.cedis] Error de conexión:", err.message);
    throw err;
  }
}

module.exports = { getCedisPool, sql };
