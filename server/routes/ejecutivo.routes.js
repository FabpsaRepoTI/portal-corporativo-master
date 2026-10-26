const router = require("express").Router();
const ctrl = require("../controllers/ejecutivo.controller");

function handle(fn, paramsFn) {
  return async (req, res) => {
    try {
      const params = paramsFn ? paramsFn(req) : {};
      const data = await fn(params);
      res.json({ ok: true, data });
    } catch (err) {
      console.error(`[ejecutivo] ${req.method} ${req.path}`, err);
      res.status(500).json({
        ok: false,
        error: "No fue posible consultar el Visor Ejecutivo.",
        detail:
          process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  };
}

const qSite = (req) => ({ sitio: req.query.sitio || "" });
const qPeriodSite = (req) => ({
  periodo: req.query.periodo || 30,
  sitio: req.query.sitio || "",
});

router.get("/resumen", handle(ctrl.getResumen, qPeriodSite));
router.get("/alertas", handle(ctrl.getAlertas, qSite));
router.get(
  "/detalle-indicador",
  handle(ctrl.getDetalleIndicador, (req) => ({
    tipo: req.query.tipo || "activos",
    sitio: req.query.sitio || "",
    servicio: req.query.servicio || null,
  })),
);
router.get("/tendencia", handle(ctrl.getTendencia, qPeriodSite));
router.get("/servicios", handle(ctrl.getServicios, qSite));
router.get("/distribucion", handle(ctrl.getDistribucion, qPeriodSite));
router.get("/recurrentes", handle(ctrl.getRecurrentes, qPeriodSite));
router.get("/equipo", handle(ctrl.getCargaEquipo, qSite));
router.get("/sla", handle(ctrl.getSLA, qPeriodSite));
router.get("/hallazgos", handle(ctrl.getHallazgos, qPeriodSite));
router.get("/silenciosos", handle(ctrl.getSilenciosos, qSite));
router.get("/escalamientos", handle(ctrl.getEscalamientos, qSite));
router.get("/pausados", handle(ctrl.getPausados, qSite));

// Análisis ejecutivo con Claude; conserva el contrato del visor.
router.post(
  "/analisis-ia",
  handle(ctrl.getAnalisisIA, (req) => ({
    periodo: req.body?.periodo || 30,
    sitio: req.body?.sitio || "",
  })),
);

module.exports = router;
