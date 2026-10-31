// server/db.cedis.js
const sql = require("mssql");

// DB_CEDIS_ENABLED=false desactiva la conexión (p. ej. trabajando fuera de la red de la empresa)
const CEDIS_HABILITADO = process.env.DB_CEDIS_ENABLED !== "false";

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
  if (!CEDIS_HABILITADO) {
    throw new Error("Conexión CEDIS desactivada (DB_CEDIS_ENABLED=false)");
  }
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

module.exports = { getCedisPool, sql, CEDIS_HABILITADO };
