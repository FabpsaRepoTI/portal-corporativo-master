// server/db.vigilancia.js
// Pool de conexión EXCLUSIVO para el módulo de Vigilancia. Mientras el resto
// del portal apunta a DB_DATABASE, Vigilancia puede apuntar a una base
// distinta (ej. mantener DEV en Vigilancia cuando todo lo demás ya subió a
// producción) configurando DB_VIGILANCIA_DATABASE en el .env de cada
// ambiente. Si no se define, usa DB_DATABASE (mismo comportamiento de
// siempre).
const sql = require("mssql");

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_VIGILANCIA_DATABASE || process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool = null;

async function getVigilanciaPool() {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  console.log("[db.vigilancia] Conectado a base:", config.database);
  return pool;
}

module.exports = { getVigilanciaPool, sql };
