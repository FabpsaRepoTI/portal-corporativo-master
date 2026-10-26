"use strict";
// ─────────────────────────────────────────────────────────────
// routes/dev/proyectos.routes.js
// Base: /api/dev/proyectos
// ─────────────────────────────────────────────────────────────
const router = require("express").Router();
const { verifyToken, soloSistemas, soloGerente, soloLecturaDesarrollo, ok, err } = require("../../middleware/dev.middleware");
const svc = require("../../services/dev/proyectos.service");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// ── Portafolio / Lista ────────────────────────────────────────
// GET /api/dev/proyectos
// Query params: estatus, responsable, prioridad, buscar, page, limit
router.get("/", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { res.json(await svc.getPortafolio(req.query)); }
  catch (e) { err(res, e); }
});

// ── Catálogos necesarios para el formulario ───────────────────
// GET /api/dev/proyectos/catalogos
router.get("/catalogos", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { res.json(await svc.getCatalogos()); }
  catch (e) { err(res, e); }
});

// ── Promover solicitud existente a proyecto ───────────────────
// POST /api/dev/proyectos/promover
// Body: { idSolicitud }
// Copia folio, título y solicitante de solicitudTI. Solo lectura sobre esa tabla.
router.post("/promover", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.promoverSolicitud(req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// ── Crear proyecto nuevo (sin solicitud origen) ───────────────
// POST /api/dev/proyectos
router.post("/", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.crearProyecto(req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// ── Detalle completo de un proyecto ──────────────────────────
// GET /api/dev/proyectos/:id
router.get("/:id", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try {
    const data = await svc.getDetalle(parseInt(req.params.id));
    if (!data) return res.status(404).json({ ok: false, message: "Proyecto no encontrado" });
    res.json(data);
  } catch (e) { err(res, e); }
});

// ── Editar datos generales ────────────────────────────────────
// PUT /api/dev/proyectos/:id
router.put("/:id", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.actualizarProyecto(parseInt(req.params.id), req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// ── Cambiar estatus/etapa ─────────────────────────────────────
// PUT /api/dev/proyectos/:id/estatus
// Body: { idEstatus, etapaActual?, observaciones? }
router.put("/:id/estatus", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.cambiarEstatus(parseInt(req.params.id), req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// ── Actualizar avance manual (cuando no hay tareas) ───────────
// PUT /api/dev/proyectos/:id/avance
// Body: { avancePct, justificacion }
router.put("/:id/avance", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.actualizarAvanceManual(parseInt(req.params.id), req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// ── Solicitar cierre (desarrollador) ─────────────────────────
// POST /api/dev/proyectos/:id/solicitar-cierre
// Valida que existan los 3 documentos obligatorios antes de permitirlo
router.post("/:id/solicitar-cierre", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.solicitarCierre(parseInt(req.params.id), req.user)); }
  catch (e) { err(res, e, 400); }
});

// ── Aprobar cierre (solo gerente) ────────────────────────────
// POST /api/dev/proyectos/:id/aprobar-cierre
router.post("/:id/aprobar-cierre", verifyToken, soloGerente, async (req, res) => {
  try { ok(res, await svc.aprobarCierre(parseInt(req.params.id), req.user)); }
  catch (e) { err(res, e, 400); }
});

// ── Rechazar cierre (gerente devuelve al desarrollador) ───────
// POST /api/dev/proyectos/:id/rechazar-cierre
// Body: { motivo }
router.post("/:id/rechazar-cierre", verifyToken, soloGerente, async (req, res) => {
  try { ok(res, await svc.rechazarCierre(parseInt(req.params.id), req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// ── Recalcular avance por tareas (llamado por tareas.service) ─
// POST /api/dev/proyectos/:id/recalcular-avance
router.post("/:id/recalcular-avance", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.recalcularAvance(parseInt(req.params.id))); }
  catch (e) { err(res, e); }
});

// ── Evaluar riesgo (job manual o automático) ──────────────────
// POST /api/dev/proyectos/:id/evaluar-riesgo
router.post("/:id/evaluar-riesgo", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.evaluarRiesgo(parseInt(req.params.id))); }
  catch (e) { err(res, e); }
});

module.exports = router;
