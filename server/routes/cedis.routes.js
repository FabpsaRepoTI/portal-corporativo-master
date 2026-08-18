// server/routes/cedis.routes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth"); // tu middleware JWT existente
const ctrl = require("../controllers/cedis.controller");

// Todas las rutas de CEDIS requieren autenticación
router.use(verifyToken);

// ── Escaneo ──────────────────────────────────
router.post("/facturas/scan", ctrl.scan);

// ── Consultas ────────────────────────────────
router.get("/facturas/hoy", ctrl.getHoy);
router.get("/facturas/historico", ctrl.getHistorico);
router.get("/facturas/:numeroFactura", ctrl.getDetalle);

module.exports = router;
