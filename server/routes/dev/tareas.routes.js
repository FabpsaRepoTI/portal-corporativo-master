"use strict";
// ─────────────────────────────────────────────────────────────
// routes/dev/tareas.routes.js
// Base: /api/dev/tareas
// ─────────────────────────────────────────────────────────────
const router = require("express").Router();
const { verifyToken, soloSistemas, soloLecturaDesarrollo, ok, err } = require("../../middleware/dev.middleware");
const svc = require("../../services/dev/tareas.service");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// GET  /api/dev/tareas?idProyecto=X
router.get("/", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { res.json(await svc.getTareas(parseInt(req.query.idProyecto))); }
  catch (e) { err(res, e); }
});

// POST /api/dev/tareas
router.post("/", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.crearTarea(req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// PUT  /api/dev/tareas/:id
router.put("/:id", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.actualizarTarea(parseInt(req.params.id), req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// POST /api/dev/tareas/:id/completar
router.post("/:id/completar", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.completarTarea(parseInt(req.params.id), req.user)); }
  catch (e) { err(res, e, 400); }
});

// DELETE /api/dev/tareas/:id  (solo cancelar, no borrar)
router.delete("/:id", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.cancelarTarea(parseInt(req.params.id), req.user)); }
  catch (e) { err(res, e, 400); }
});

module.exports = router;
