// server/routes/sgc.procesos.routes.js
// Mapa de procesos — montado en /api/sgc/procesos (detrás de verificarSGC).
// Consulta: cualquier rol SGC. Edición: solo Coordinador.
const router = require("express").Router();
const { requireCoordinador } = require("../middleware/sgcAuth.middleware");
const pro = require("../services/sgc.procesos.service");

router.get("/mapa", pro.getMapa);
router.post("/relacion", requireCoordinador, pro.crearRelacion);
router.delete("/relacion/:id", requireCoordinador, pro.eliminarRelacion);
router.post("/", requireCoordinador, pro.crearProceso);
router.get("/:id", pro.getProceso);
router.put("/:id", requireCoordinador, pro.actualizarProceso);
router.delete("/:id", requireCoordinador, pro.eliminarProceso);

module.exports = router;
