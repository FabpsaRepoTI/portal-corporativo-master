const svc = require("../services/ejecutivo.service");

const params = (req) => ({
  periodo: req.query.periodo || 30,
  sitio: req.query.sitio || "",
});

const handle = (fn) => async (req, res) => {
  try {
    const data = await fn(params(req));
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[ejecutivo]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
};

module.exports = {
  getResumen: handle(svc.getResumen),
  getAlertas: handle(svc.getAlertas),
  getTendencia: handle(svc.getTendencia),
  getServicios: async (_req, res) => {
    try {
      res.json({ ok: true, data: await svc.getServicios() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },
  getDistribucion: handle(svc.getDistribucion),
  getRecurrentes: handle(svc.getRecurrentes),
  getCargaEquipo: async (_req, res) => {
    try {
      res.json({ ok: true, data: await svc.getCargaEquipo() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },
  getSLA: handle(svc.getSLA),
};
