// server/routes/sgc.fabi.routes.js
// Fab-i · Asistente SGC — montado en /api/sgc/fabi (detrás de verificarSGC).
// El login y el rol son SIEMPRE los de la sesión (req.sgcUser): las
// herramientas solo ven lo que el usuario puede ver en sus pantallas.
const router = require("express").Router();
const { _int } = require("../services/sgcComun.service");
const fabi = require("../services/sgc.fabi.service");
const { searchDocuments, MAX_RESULTADOS } = require("../services/sgc.sharepointSearch.service");

// Una pregunta a la vez por usuario, con una pausa mínima entre mensajes
const activos = new Set();
const recientes = new Map();

router.post("/chat", async (req, res) => {
  let mensaje;
  try {
    mensaje = fabi.validarMensaje(req.body?.mensaje);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  const idConversacion = req.body?.idConversacion == null ? null : _int(req.body.idConversacion);
  if (req.body?.idConversacion != null && !idConversacion) return res.status(400).json({ ok: false, error: "Conversación inválida" });

  const login = req.sgcUser.login;
  const ahora = Date.now();
  for (const [id, t] of recientes) if (ahora - t > 60000) recientes.delete(id);
  if (activos.has(login) || ahora - (recientes.get(login) || 0) < 2500) {
    return res.status(429).json({ ok: false, error: "Espera un momento antes de enviar otro mensaje." });
  }
  activos.add(login);
  recientes.set(login, ahora);
  try {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data: await fabi.chatFabi(req.sgcUser, mensaje, idConversacion) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    // El usuario ve un mensaje genérico; en la consola queda el motivo real
    console.error("[sgc-fabi]", err.detalle || err.message);
    res.status(503).json({ ok: false, error: "Fab-i no está disponible en este momento. Intenta de nuevo en unos minutos." });
  } finally {
    activos.delete(login);
  }
});

// Búsqueda documental directa (sin pasar por el modelo)
router.post("/buscar-documento", async (req, res) => {
  const query = typeof req.body?.query === "string" ? req.body.query.trim().slice(0, 120) : "";
  const carpeta = typeof req.body?.carpeta === "string" && req.body.carpeta.trim() ? req.body.carpeta.trim().slice(0, 120) : null;
  if (!query) return res.status(400).json({ ok: false, error: "Escribe qué documento buscas." });
  try {
    const resultados = await searchDocuments(query, carpeta);
    res.json({ ok: true, data: { resultados: resultados.slice(0, MAX_RESULTADOS) } });
  } catch (err) {
    console.error("[sgc-fabi] buscar-documento:", err.response?.status, err.message);
    res.status(502).json({ ok: false, error: "No se pudo consultar la biblioteca documental." });
  }
});

router.get("/historial", async (req, res) => {
  try {
    res.json({ ok: true, data: await fabi.listarConversaciones(req.sgcUser) });
  } catch (err) {
    console.error("[sgc-fabi] historial:", err);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
});

router.get("/historial/:id", async (req, res) => {
  const id = _int(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "Conversación inválida" });
  try {
    const c = await fabi.obtenerConversacion(req.sgcUser, id);
    if (!c) return res.status(404).json({ ok: false, error: "Conversación no encontrada" });
    res.json({ ok: true, data: c });
  } catch (err) {
    console.error("[sgc-fabi] conversación:", err);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
});

router.delete("/historial/:id", async (req, res) => {
  const id = _int(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "Conversación inválida" });
  try {
    if (!(await fabi.eliminarConversacion(req.sgcUser, id))) return res.status(404).json({ ok: false, error: "Conversación no encontrada" });
    res.json({ ok: true, data: { idConversacion: id } });
  } catch (err) {
    console.error("[sgc-fabi] eliminar:", err);
    res.status(500).json({ ok: false, error: "Error interno" });
  }
});

module.exports = router;
