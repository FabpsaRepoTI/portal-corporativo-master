// server/routes/cedis.routes.js
const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/auth"); // tu middleware JWT existente
const ctrl = require("../controllers/cedis.controller");
const { cedisAccess, requireScanner } = require('../middleware/cedisAccess');

// Todas las rutas de CEDIS requieren autenticación
router.use(verifyToken);
router.use(cedisAccess);
router.get('/facturas/acceso', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, ...req.cedisAccess });
});

// ── Escaneo ──────────────────────────────────
router.post("/facturas/scan", requireScanner, ctrl.scan);

// ── Consultas ────────────────────────────────
router.get("/facturas/hoy", ctrl.getHoy);
router.get("/facturas/historico", ctrl.getHistorico);
router.get("/facturas/:numeroFactura", ctrl.getDetalle);

module.exports = router;
