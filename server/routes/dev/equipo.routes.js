"use strict";
// ─────────────────────────────────────────────────────────────
// routes/dev/equipo.routes.js
// Base: /api/dev/equipo
// Vista "Mi equipo" — carga, resumen y última actualización
// ─────────────────────────────────────────────────────────────
const router = require("express").Router();
const { verifyToken, soloSistemas, soloLecturaDesarrollo, ok, err } = require("../../middleware/dev.middleware");
const svc = {...require("../../services/dev/equipo.service"), ...require("../../services/dev/equipoMesa.service")};

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// GET /api/dev/equipo?periodo=2026-09
router.get("/", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { res.json(await svc.getEquipo(req.query.periodo)); }
  catch (e) { err(res, e); }
});

// GET /api/dev/equipo/:login?periodo=2026-09
router.get("/:login", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { res.json(await svc.getDesarrollador(req.params.login, req.query.periodo)); }
  catch (e) { err(res, e); }
});

// PUT /api/dev/equipo/capacidad — el gerente define horas disponibles
// Body: { loginUsuario, periodo, horasDisponibles }
router.put("/capacidad", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.setCapacidad(req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

module.exports = router;
