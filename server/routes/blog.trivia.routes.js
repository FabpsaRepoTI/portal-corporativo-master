"use strict";
const express = require("express");
const { verifyToken } = require("../middleware/auth");
const svc = require("../services/blog.trivia.service");

const router = express.Router();
router.use(verifyToken);

const soloAdmin = (req, res, next) => {
  if (req.user?.area !== "SISTEMAS")
    return res.status(403).json({ error: "Sin permiso" });
  next();
};

// ═══════════════════════════════════════════════════════════
//  TIPS
// ═══════════════════════════════════════════════════════════

// GET /api/blog/tips/activo
router.get("/tips/activo", async (req, res) => {
  try {
    res.json(await svc.getTipActivo());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/blog/admin/tips  [admin]
router.get("/admin/tips", soloAdmin, async (req, res) => {
  try {
    res.json(await svc.getTips());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/blog/admin/tips  [admin]
router.post("/admin/tips", soloAdmin, async (req, res) => {
  try {
    const { texto, categoria, icono, fechaInicio } = req.body;
    if (!texto?.trim() || !categoria || !fechaInicio)
      return res
        .status(400)
        .json({ error: "Faltan campos: texto, categoria, fechaInicio" });
    const id = await svc.crearTip({ texto, categoria, icono, fechaInicio });
    res.status(201).json({ idTip: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/blog/admin/tips/:id/toggle  [admin]
router.put("/admin/tips/:id/toggle", soloAdmin, async (req, res) => {
  try {
    const { activo } = req.body;
    await svc.toggleTip(req.params.id, activo);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/blog/admin/tips/:id  [admin]
router.delete("/admin/tips/:id", soloAdmin, async (req, res) => {
  try {
    await svc.eliminarTip(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  TRIVIA — pública
// ═══════════════════════════════════════════════════════════

// GET /api/blog/trivia?idEdicion=1
router.get("/trivia", async (req, res) => {
  try {
    const { idEdicion } = req.query;
    if (!idEdicion) return res.status(400).json({ error: "Falta idEdicion" });
    const data = await svc.getTriviaEdicion(idEdicion, req.user.login);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/blog/trivia/:id/ranking
router.get("/trivia/:id/ranking", async (req, res) => {
  try {
    res.json(await svc.getRankingTrivia(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/blog/trivia/:id/responder
router.post("/trivia/:id/responder", async (req, res) => {
  try {
    const { respuestas } = req.body;
    if (!Array.isArray(respuestas) || respuestas.length === 0)
      return res.status(400).json({ error: "Faltan respuestas" });
    const result = await svc.responderTrivia(
      req.params.id,
      req.user.login,
      respuestas,
    );
    res.json(result);
  } catch (e) {
    if (e.message === "YA_RESPONDISTE")
      return res.status(409).json({ error: "YA_RESPONDISTE" });
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  TRIVIA — administración
// ═══════════════════════════════════════════════════════════

// GET /api/blog/admin/trivia?idEdicion=1  [admin]
router.get("/admin/trivia", soloAdmin, async (req, res) => {
  try {
    const { idEdicion } = req.query;
    if (!idEdicion) return res.status(400).json({ error: "Falta idEdicion" });
    res.json(await svc.getTriviasAdmin(idEdicion));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/blog/admin/trivia  [admin]
router.post("/admin/trivia", soloAdmin, async (req, res) => {
  try {
    const { idEdicion, titulo, preguntas } = req.body;
    if (
      !idEdicion ||
      !titulo ||
      !Array.isArray(preguntas) ||
      preguntas.length === 0
    )
      return res.status(400).json({ error: "Faltan campos obligatorios" });

    // validar que cada pregunta tenga exactamente una opción correcta
    for (const p of preguntas) {
      if (!p.texto?.trim())
        return res.status(400).json({ error: "Pregunta sin texto" });
      if (!Array.isArray(p.opciones) || p.opciones.length < 2)
        return res
          .status(400)
          .json({ error: "Cada pregunta necesita mínimo 2 opciones" });
      const correctas = p.opciones.filter((o) => o.correcta).length;
      if (correctas !== 1)
        return res
          .status(400)
          .json({
            error: "Cada pregunta debe tener exactamente 1 opción correcta",
          });
    }

    const id = await svc.crearTrivia(idEdicion, titulo, preguntas);
    res.status(201).json({ idTrivia: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/blog/admin/trivia/:id/estadisticas  [admin]
router.get("/admin/trivia/:id/estadisticas", soloAdmin, async (req, res) => {
  try {
    res.json(await svc.getEstadisticasTrivia(req.params.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
