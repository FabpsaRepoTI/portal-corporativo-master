"use strict";
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");
const svc = require("../services/blog.service");

const router = express.Router();
router.use(verifyToken);

// ─── MULTER ───────────────────────────────────────────────
const uploadDir = path.join(__dirname, "../../uploads/blog");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `blog_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

const soloAdmin = (req, res, next) => {
  if (req.user?.area !== "SISTEMAS")
    return res.status(403).json({ error: "Sin permiso" });
  next();
};

// ═══════════════════════════════════════════════════════════
//  EDICIONES
// ═══════════════════════════════════════════════════════════

router.get("/edicion/activa", async (req, res) => {
  try {
    res.json(await svc.getEdicionActiva());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/ediciones", async (req, res) => {
  try {
    res.json(await svc.getEdiciones());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/ediciones", soloAdmin, async (req, res) => {
  try {
    const { titulo, mes, anio } = req.body;
    if (!titulo || !mes || !anio)
      return res.status(400).json({ error: "Faltan campos" });
    const id = await svc.crearEdicion({ titulo, mes, anio });
    res.status(201).json({ idEdicion: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/ediciones/:id/activar", soloAdmin, async (req, res) => {
  try {
    await svc.activarEdicion(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/ediciones/:id", soloAdmin, async (req, res) => {
  try {
    await svc.eliminarEdicion(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ARTÍCULOS — rutas estáticas PRIMERO (antes de /:id)
// ═══════════════════════════════════════════════════════════

// GET /api/blog/articulos/estado?idEdicion=1
// IMPORTANTE: debe ir ANTES de /articulos/:id
router.get("/articulos/estado", async (req, res) => {
  try {
    const { idEdicion } = req.query;
    if (!idEdicion) return res.status(400).json({ error: "Falta idEdicion" });
    res.json(await svc.getEstadoArticulos(idEdicion, req.user.login));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/blog/articulos
router.get("/articulos", async (req, res) => {
  try {
    const { idEdicion } = req.query;
    if (!idEdicion) return res.status(400).json({ error: "Falta idEdicion" });
    res.json(await svc.getArticulosEdicion(idEdicion));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/blog/articulos/:id  ← dinámica, va después
router.get("/articulos/:id", async (req, res) => {
  try {
    const art = await svc.getArticuloDetalle(req.params.id, req.user.login);
    if (!art) return res.status(404).json({ error: "No encontrado" });
    res.json(art);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/blog/articulos/:id/reacciones
router.get("/articulos/:id/reacciones", async (req, res) => {
  try {
    res.json(await svc.getReaccionesArticulo(req.params.id, req.user.login));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/archivo", async (req, res) => {
  try {
    res.json(await svc.getArchivo());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ARTÍCULOS — administración [admin]
// ═══════════════════════════════════════════════════════════

router.get("/admin/articulos", soloAdmin, async (req, res) => {
  try {
    const { idEdicion } = req.query;
    if (!idEdicion) return res.status(400).json({ error: "Falta idEdicion" });
    res.json(await svc.getArticulosAdmin(idEdicion));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// IMPORTANTE: antes de /admin/articulos/:id
router.get("/admin/articulos/:id/detalle", soloAdmin, async (req, res) => {
  try {
    const art = await svc.getArticuloDetalleAdmin(req.params.id);
    if (!art) return res.status(404).json({ error: "No encontrado" });
    res.json(art);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post(
  "/admin/articulos",
  soloAdmin,
  upload.single("foto"),
  async (req, res) => {
    try {
      const {
        idEdicion,
        titulo,
        extracto,
        contenido,
        categoria,
        autor,
        destacado,
        tiempoLectura,
      } = req.body;
      if (!idEdicion || !titulo || !extracto || !contenido || !categoria)
        return res.status(400).json({ error: "Faltan campos obligatorios" });
      const fotoUrl = req.file ? `/uploads/blog/${req.file.filename}` : null;
      const id = await svc.crearArticulo({
        idEdicion,
        titulo,
        extracto,
        contenido,
        categoria,
        autor: autor || req.user.login,
        fotoUrl,
        destacado,
        tiempoLectura,
      });
      res.status(201).json({ idArticulo: id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

router.put(
  "/admin/articulos/:id",
  soloAdmin,
  upload.single("foto"),
  async (req, res) => {
    try {
      const campos = { ...req.body };
      if (req.file) campos.fotoUrl = `/uploads/blog/${req.file.filename}`;
      await svc.actualizarArticulo(req.params.id, campos);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
);

router.put("/admin/articulos/:id/publicar", soloAdmin, async (req, res) => {
  try {
    await svc.actualizarArticulo(req.params.id, { estatus: 2 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  LIKES (compatibilidad hacia atrás)
// ═══════════════════════════════════════════════════════════

router.post("/articulos/:id/like", async (req, res) => {
  try {
    res.json(await svc.toggleLike(req.params.id, req.user.login));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  REACCIONES A ARTÍCULOS
// ═══════════════════════════════════════════════════════════

router.post("/articulos/:id/reaccionar", async (req, res) => {
  try {
    const { tipo } = req.body;
    if (!["like", "love", "interest"].includes(tipo))
      return res.status(400).json({ error: "Tipo inválido" });
    const result = await svc.reaccionarArticulo(
      req.params.id,
      req.user.login,
      tipo,
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  COMENTARIOS
// ═══════════════════════════════════════════════════════════

router.post("/articulos/:id/comentarios", async (req, res) => {
  try {
    const { comentario } = req.body;
    if (!comentario?.trim())
      return res.status(400).json({ error: "Comentario vacío" });
    const data = await svc.agregarComentario(
      req.params.id,
      req.user.login,
      comentario,
    );
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/admin/comentarios/:id/moderar", soloAdmin, async (req, res) => {
  try {
    await svc.moderarComentario(req.params.id, req.body.activo);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  REACCIONES EN COMENTARIOS
// ═══════════════════════════════════════════════════════════

router.post("/comentarios/:id/reaccionar", async (req, res) => {
  try {
    const { tipo } = req.body;
    if (!["like", "love"].includes(tipo))
      return res.status(400).json({ error: "Tipo inválido" });
    const result = await svc.reaccionarComentario(
      req.params.id,
      req.user.login,
      tipo,
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  RESPUESTAS A COMENTARIOS
// ═══════════════════════════════════════════════════════════

router.post("/comentarios/:id/responder", async (req, res) => {
  try {
    const { respuesta } = req.body;
    if (!respuesta?.trim())
      return res.status(400).json({ error: "Respuesta vacía" });
    const data = await svc.responderComentario(
      req.params.id,
      req.user.login,
      respuesta,
    );
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ARTÍCULOS GUARDADOS
// ═══════════════════════════════════════════════════════════

router.post("/articulos/:id/guardar", async (req, res) => {
  try {
    res.json(await svc.toggleGuardado(req.params.id, req.user.login));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/guardados", async (req, res) => {
  try {
    res.json(await svc.getArticulosGuardados(req.user.login));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  PARTICIPACIÓN
// ═══════════════════════════════════════════════════════════

router.get("/participacion", async (req, res) => {
  try {
    const { idEdicion } = req.query;
    if (!idEdicion) return res.status(400).json({ error: "Falta idEdicion" });
    res.json(await svc.getParticipacion(idEdicion));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ENCUESTAS
// ═══════════════════════════════════════════════════════════

router.get("/encuesta", async (req, res) => {
  try {
    const { idEdicion } = req.query;
    if (!idEdicion) return res.status(400).json({ error: "Falta idEdicion" });
    res.json(await svc.getEncuestaEdicion(idEdicion, req.user.login));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/admin/encuestas", soloAdmin, async (req, res) => {
  try {
    const { idEdicion, pregunta, opciones } = req.body;
    if (
      !idEdicion ||
      !pregunta ||
      !Array.isArray(opciones) ||
      opciones.length < 2
    )
      return res.status(400).json({
        error: "Se requieren idEdicion, pregunta y mínimo 2 opciones",
      });
    const id = await svc.crearEncuesta(idEdicion, pregunta, opciones);
    res.status(201).json({ idEncuesta: id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/encuestas/:id/votar", async (req, res) => {
  try {
    const { idOpcion } = req.body;
    if (!idOpcion) return res.status(400).json({ error: "Falta idOpcion" });
    const result = await svc.votar(req.params.id, idOpcion, req.user.login);
    if (!result.ok) return res.status(409).json({ error: result.error });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── UPLOAD standalone ───────────────────────────────────
router.post("/admin/upload", soloAdmin, upload.single("foto"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Sin archivo" });
  res.json({ url: `/uploads/blog/${req.file.filename}` });
});

module.exports = router;
