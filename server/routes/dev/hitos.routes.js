"use strict";
// ─────────────────────────────────────────────────────────────
// routes/dev/hitos.routes.js
// Base: /api/dev/hitos
// ─────────────────────────────────────────────────────────────
const router = require("express").Router();
const { verifyToken, soloSistemas, soloGerente, soloLecturaDesarrollo, ok, err } = require("../../middleware/dev.middleware");
const svc = require("../../services/dev/hitos.service");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// GET  /api/dev/hitos?idProyecto=X
router.get("/", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { res.json(await svc.getHitos(parseInt(req.query.idProyecto))); }
  catch (e) { err(res, e); }
});

// POST /api/dev/hitos
router.post("/", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.crearHito(req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// PUT  /api/dev/hitos/:id
router.put("/:id", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.actualizarHito(parseInt(req.params.id), req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// POST /api/dev/hitos/:id/validar  — solo gerente
router.post("/:id/validar", verifyToken, soloGerente, async (req, res) => {
  try { ok(res, await svc.validarHito(parseInt(req.params.id), req.user)); }
  catch (e) { err(res, e, 400); }
});

module.exports = router;
