import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
  // Conexiones abiertas en reserva: abrir una nueva hacia Azure cuesta 1–2 s,
  // así que no se cierran tras 30 s de inactividad (antes min 0 / 30 s).
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 600000,
  },
};

let pool;

export async function getPool() {
  if (!pool) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
}

export { sql };
