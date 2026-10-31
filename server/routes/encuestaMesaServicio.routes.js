const express = require("express");
const { verifyToken } = require("../middleware/auth");
const {
  yaRespondio,
  registrar,
  listar,
} = require("../services/encuestaMesaServicio.service");

const ADMIN_LOGIN = "JMRAMIREZ";

const router = express.Router();

// Si el usuario no tiene correo en sec_users se usa su login, para que
// "ya respondió" funcione igual y la encuesta no reaparezca.
const identidad = (u) => (u?.email || "").trim() || u?.login || null;

router.get("/estado", verifyToken, async (req, res) => {
  try {
    const respondida = await yaRespondio(identidad(req.user));
    res.set("Cache-Control", "no-store");
    res.json({ respondida });
  } catch (e) {
    console.error("[encuesta-mesa] estado:", e.message);
    res.status(500).json({ error: "No fue posible consultar la encuesta." });
  }
});

router.post("/", verifyToken, async (req, res) => {
  const satisfaccion = String(req.body?.satisfaccion || "").trim();
  const oportunidades = String(req.body?.oportunidades || "").trim();
  const comentarios = String(req.body?.comentarios || "").trim().slice(0, 2000);
  if (!satisfaccion || oportunidades.length > 2000) {
    return res
      .status(400)
      .json({ error: "Elige una calificación para continuar." });
  }
  try {
    if (await yaRespondio(identidad(req.user))) {
      return res.json({ ok: true, yaRespondida: true });
    }
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip ||
      null;
    await registrar({
      nombre: req.user.name,
      correo: identidad(req.user),
      ip,
      satisfaccion,
      oportunidades,
      comentarios,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("[encuesta-mesa] registrar:", e.message);
    res.status(500).json({ error: "No fue posible registrar tu respuesta." });
  }
});

router.get("/resultados", verifyToken, async (req, res) => {
  if (req.user.login !== ADMIN_LOGIN) {
    return res.status(403).json({ error: "No tienes acceso a esta vista." });
  }
  try {
    res.set("Cache-Control", "no-store");
    res.json({ data: await listar() });
  } catch (e) {
    console.error("[encuesta-mesa] resultados:", e.message);
    res.status(500).json({ error: "No fue posible cargar los resultados." });
  }
});

module.exports = router;
