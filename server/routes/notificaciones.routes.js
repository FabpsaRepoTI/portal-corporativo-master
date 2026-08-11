const express = require("express");
const router = express.Router();
const { addClient } = require("../sse.manager");
const svc = require("../services/notificaciones.service");

// SSE
router.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": ping\n\n");

  const token = req.query.token;
  if (!token) return res.end();

  try {
    const jwt = require("jsonwebtoken");
    const { JWT_SECRET } = require("../middleware/auth");
    const payload = jwt.verify(token, JWT_SECRET);
    addClient(payload.login, res);
  } catch {
    res.end();
  }
});

// Lista paginada
router.get("/", (req, res) => {
  const { verifyToken } = require("../middleware/auth");
  verifyToken(req, res, async () => {
    try {
      const { pagina = 1, limite = 30 } = req.query;
      const data = await svc.getNotificaciones(req.user.login, {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
      });
      res.json({ ok: true, data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Contador de no leídas
router.get("/count", (req, res) => {
  const { verifyToken } = require("../middleware/auth");
  verifyToken(req, res, async () => {
    try {
      const total = await svc.getCount(req.user.login);
      res.json({ ok: true, total });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Marcar una como leída
router.patch("/:id/leer", (req, res) => {
  const { verifyToken } = require("../middleware/auth");
  verifyToken(req, res, async () => {
    try {
      await svc.marcarLeida(parseInt(req.params.id), req.user.login);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Marcar todas como leídas
router.patch("/leer-todas", (req, res) => {
  const { verifyToken } = require("../middleware/auth");
  verifyToken(req, res, async () => {
    try {
      await svc.marcarTodasLeidas(req.user.login);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

// Eliminar una notificación
router.delete("/:id", (req, res) => {
  const { verifyToken } = require("../middleware/auth");
  verifyToken(req, res, async () => {
    try {
      await svc.eliminar(parseInt(req.params.id), req.user.login);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
});

module.exports = router;
