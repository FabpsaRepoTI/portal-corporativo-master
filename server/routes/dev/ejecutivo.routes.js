"use strict";
// ─────────────────────────────────────────────────────────────
// routes/dev/ejecutivo.routes.js
// Base: /api/dev/ejecutivo
// Vista resumida para Alta Dirección — solo lectura
// ─────────────────────────────────────────────────────────────
const router = require("express").Router();
const { verifyToken, err } = require("../../middleware/dev.middleware");
const svc = require("../../services/dev/ejecutivo.service");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// Accesible para cualquier usuario autenticado del portal
// El Gerente filtra qué proyectos son "estratégicos" (prioridad=1)
// GET /api/dev/ejecutivo?periodo=2026-09&soloEstrategicos=true
router.get("/", verifyToken, async (req, res) => {
  try { res.json(await svc.getEjecutivo(req.query)); }
  catch (e) { err(res, e); }
});

module.exports = router;
