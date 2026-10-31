// server/routes/sgc.riesgos.routes.js
// Riesgos y oportunidades — montado en /api/sgc/riesgos (detrás de verificarSGC).
// Los permisos finos (quién edita cada registro) se validan en el service.
const router = require("express").Router();
const { verificarSGC } = require("../middleware/sgcAuth.middleware");
const rie = require("../services/sgc.riesgos.service");

router.get("/", rie.getRiesgos);
router.post("/", verificarSGC([1, 2, 3]), rie.crearRiesgo);
router.get("/:id", rie.getRiesgo);
router.put("/:id", rie.actualizarRiesgo);
router.put("/:id/estatus", rie.cambiarEstatusRiesgo);

module.exports = router;
