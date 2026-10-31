// routes/home.routes.js
const express = require("express");
const router = express.Router();
const svc = require("../services/home.service");

// ── Comunicados ──────────────────────────────────────────────────
router.get("/comunicados", async (req, res) => {
  try {
    const data = await svc.getComunicados();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/comunicados", async (req, res) => {
  try {
    const { encabezado, cuerpo, loginAutor } = req.body;
    if (!encabezado)
      return res.status(400).json({ error: "encabezado requerido" });
    const result = await svc.crearComunicado({
      encabezado,
      cuerpo,
      loginAutor,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Estado de servicios ──────────────────────────────────────────
router.get("/estado-servicios", async (req, res) => {
  try {
    const data = await svc.getEstadoServicios();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/estado-servicios", async (req, res) => {
  console.log("body recibido:", req.body);
  try {
    const { idServicio, estado, detalle, loginAutor } = req.body;
    if (!idServicio || !estado)
      return res.status(400).json({ error: "campos requeridos" });
    const result = await svc.actualizarEstado({
      idServicio: parseInt(idServicio),
      estado,
      detalle,
      loginAutor,
    });
    res.json(result);
  } catch (e) {
    console.error("ERROR actualizarEstado:", e.message); // ← agrega esto
    res.status(500).json({ error: e.message });
  }
});
// ── Catálogo servicios TI (para modal) ──────────────────────────
router.get("/servicios-ti", async (req, res) => {
  try {
    const data = await svc.getServiciosTI();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
