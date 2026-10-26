const express = require("express");
const { verifyToken } = require("../middleware/auth");
const requireModulo = require("../middleware/requireModulo");
const {
  orientar,
  validarMensajes,
} = require("../services/mesaAsistente.service");
const router = express.Router(),
  active = new Set(),
  recent = new Map();
router.post(
  "/",
  verifyToken,
  requireModulo("mesa_servicio"),
  async (req, res) => {
    let messages;
    try {
      messages = validarMensajes(req.body?.messages);
    } catch {
      return res.status(400).json({
        error: "Escribe tu necesidad en mensajes de hasta 1500 caracteres.",
      });
    }
    const login = req.user.login,
      now = Date.now();
    for (const [id, at] of recent) if (now - at > 60000) recent.delete(id);
    if (active.has(login) || now - (recent.get(login) || 0) < 2500)
      return res
        .status(429)
        .json({ error: "Espera un momento antes de enviar otro mensaje." });
    active.add(login);
    recent.set(login, now);
    try {
      res.set("Cache-Control", "no-store");
      // El login es SIEMPRE el de la sesión: las herramientas de Fabi solo ven datos de este usuario
      res.json(await orientar(messages, { login }));
    } catch (err) {
      // El usuario solo ve el mensaje genérico; en la consola queda el motivo real
      console.error("[mesa-asistente]", err.detalle || err.message);
      res.status(503).json({
        error:
          "El asistente no está disponible en este momento. Puedes elegir una categoría o intentarlo nuevamente.",
      });
    } finally {
      active.delete(login);
    }
  },
);
module.exports = router;
