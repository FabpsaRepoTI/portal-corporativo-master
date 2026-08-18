const router = require("express").Router();
const ctrl = require("../controllers/ejecutivo.controller");

// GET /api/ejecutivo/resumen?periodo=30&sitio=
router.get("/resumen", ctrl.getResumen);

// GET /api/ejecutivo/alertas?sitio=
router.get("/alertas", ctrl.getAlertas);

// GET /api/ejecutivo/tendencia?periodo=30&sitio=
router.get("/tendencia", ctrl.getTendencia);

// GET /api/ejecutivo/servicios
router.get("/servicios", ctrl.getServicios);

// GET /api/ejecutivo/distribucion?periodo=30&sitio=
router.get("/distribucion", ctrl.getDistribucion);

// GET /api/ejecutivo/recurrentes?periodo=30&sitio=
router.get("/recurrentes", ctrl.getRecurrentes);

// GET /api/ejecutivo/equipo
router.get("/equipo", ctrl.getCargaEquipo);

// GET /api/ejecutivo/sla?periodo=30&sitio=
router.get("/sla", ctrl.getSLA);

module.exports = router;
