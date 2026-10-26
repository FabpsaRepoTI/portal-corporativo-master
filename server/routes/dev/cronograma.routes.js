"use strict";
// ─────────────────────────────────────────────────────────────
// routes/dev/cronograma.routes.js
// Base: /api/dev/cronograma
// Vista de Gantt simplificado — solo lectura
// ─────────────────────────────────────────────────────────────
const router = require("express").Router();
const { verifyToken, soloSistemas, err } = require("../../middleware/dev.middleware");
const svc = require("../../services/dev/cronograma.service");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// GET /api/dev/cronograma?responsable=X&estado=X&area=X&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/", verifyToken, soloSistemas, async (req, res) => {
  try { res.json(await svc.getCronograma(req.query)); }
  catch (e) { err(res, e); }
});

module.exports = router;
