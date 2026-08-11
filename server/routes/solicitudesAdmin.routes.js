const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth");
const ctrl = require("../controllers/solicitudesAdmin.controller");
const { getPool } = require("../db");

router.get("/kpis",                          verifyToken, ctrl.getKPIs);
router.get("/solicitudes",                   verifyToken, ctrl.getSolicitudes);
router.get("/solicitudes/:id",               verifyToken, ctrl.getSolicitudDetalle);
router.put("/solicitudes/:id/asignar",       verifyToken, ctrl.asignar);
router.put("/solicitudes/:id/estatus",       verifyToken, ctrl.cambiarEstatus);
router.put("/solicitudes/:id/prioridad",     verifyToken, ctrl.cambiarPrioridad);
router.put("/solicitudes/:id/escalar",       verifyToken, ctrl.escalar);        // ← nuevo
router.post("/solicitudes/:id/comentarios",  verifyToken, ctrl.agregarComentario);
router.post("/solicitudes/:id/bitacora",     verifyToken, ctrl.agregarBitacora);
router.put("/solicitudes/:id/transferir",    verifyToken, ctrl.transferir);
router.get("/tecnicos-sistemas",             verifyToken, ctrl.getTecnicosSistemas);

router.get("/prioridades", verifyToken, async (req, res) => {
  const pool = await getPool();
  const r = await pool.request().query("SELECT * FROM cat_prioridad ORDER BY idPrioridad");
  res.json({ ok: true, data: r.recordset });
});

module.exports = router;
