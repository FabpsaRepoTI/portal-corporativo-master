// server/jobs/sgc.notificaciones.job.js
// Cron diario 08:00 AM hora México (America/Mexico_City) que recorre TODOS los
// usuarios con rol SGC activo y ejecuta el barrido de plazos para cada uno.
// El barrido es idempotente: no inserta duplicados si la notificación ya existe.
const cron = require("node-cron");
const { getPool, sql } = require("../db");
const { ID_EMPRESA } = require("../middleware/sgcAuth.middleware");
const { barrido } = require("../services/sgc.notificaciones.service");

async function barridoGlobal() {
  const inicio = Date.now();
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, ID_EMPRESA)
      .query(`
        SELECT r.login FROM sgc_usuario_roles r
        JOIN sec_users u ON u.login = r.login AND u.active = 'Y'
        WHERE r.idEmpresa = @idEmpresa AND r.activo = 1
      `);
    const logins = r.recordset.map((x) => x.login);
    let ok = 0, err = 0;
    for (const login of logins) {
      try {
        await barrido(login);
        ok++;
      } catch (e) {
        err++;
        console.error(`[sgc.job] barrido error ${login}:`, e.message);
      }
    }
    console.log(`[sgc.job] barrido completado: ${ok} ok, ${err} errores (${Date.now() - inicio} ms)`);
  } catch (e) {
    console.error("[sgc.job] barridoGlobal error:", e.message);
  }
}

function registrarJob() {
  // '0 8 * * *' = 08:00 todos los días, zona horaria México Centro
  cron.schedule("0 8 * * *", barridoGlobal, { timezone: "America/Mexico_City" });
  console.log("✅ [sgc.job] Cron de notificaciones registrado (08:00 AM México)");
}

module.exports = { registrarJob };
