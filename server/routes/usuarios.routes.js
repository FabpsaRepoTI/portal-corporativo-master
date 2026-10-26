// ─────────────────────────────────────────────
//  usuarios.routes.js
//  server/routes/usuarios.routes.js
// ─────────────────────────────────────────────
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const svc = require("../services/usuarios.service");
const { capacidadesUsuarios, requireCrearUsuario, protegerCuentaAutorizada, requireAdministracionUsuarios } = require('../services/usuariosAccess.service');
const { verifyToken } = require("../middleware/auth");

// Autenticación, capacidades de la sesión y permiso global de Administración.
router.use(verifyToken);
router.get('/capacidades', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await capacidadesUsuarios(req.user)); }
  catch { res.status(503).json({ error: 'No se pudieron consultar tus permisos.' }); }
});
router.use(requireAdministracionUsuarios);

/* ── Multer para fotos de perfil de usuarios ── */
const perfilDir = path.join(__dirname, "../../uploads/perfil");
if (!fs.existsSync(perfilDir)) fs.mkdirSync(perfilDir, { recursive: true });

const perfilStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, perfilDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // nombre = login del usuario para sobreescribir siempre el mismo archivo
    cb(null, `${req.params.login}${ext}`);
  },
});

const perfilUpload = multer({
  storage: perfilStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

/* ── GET /api/usuarios ────────────────────────── */
router.get("/", async (req, res) => {
  try {
    const { search, sitio, area } = req.query;
    const usuarios = await svc.getUsuarios({ search, sitio, area });
    res.json(usuarios);
  } catch (err) {
    console.error("[usuarios] GET /", err);
    res.status(500).json({ error: "Error al obtener usuarios." });
  }
});

/* ── GET /api/usuarios/:login ─────────────────── */


router.get("/:login", async (req, res) => {
  try {
    const usuario = await svc.getUsuarioByLogin(req.params.login);
    if (!usuario)
      return res.status(404).json({ error: "Usuario no encontrado." });
    res.json(usuario);
  } catch (err) {
    console.error("[usuarios] GET /:login", err);
    res.status(500).json({ error: "Error al obtener usuario." });
  }
});

/* ── GET /api/usuarios/:login/password — Ver contraseña actual ── */
router.get("/:login/password", async (req, res) => {
  try {
    const pswd = await svc.getPassword(req.params.login);
    if (pswd === null)
      return res.status(404).json({ error: "Usuario no encontrado." });
    res.set("Cache-Control", "no-store");
    res.json({ pswd });
  } catch (err) {
    console.error("[usuarios] GET /:login/password", err);
    res.status(500).json({ error: "No se pudo consultar la contraseña." });
  }
});

/* ── POST /api/usuarios — Crear ───────────────── */
router.post("/", requireCrearUsuario, async (req, res) => {
  try {
    const { login } = req.body;
    if (!login)
      return res.status(400).json({ error: "El campo login es requerido." });

    const existe = await svc.loginExiste(login.toUpperCase().trim());
    if (existe) {
      return res
        .status(409)
        .json({ error: `El login '${login.toUpperCase()}' ya existe.` });
    }

    const result = await svc.crearUsuario(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error("[usuarios] POST /", err);
    res.status(400).json({ error: err.message || "Error al crear usuario." });
  }
});

/* ── PUT /api/usuarios/:login — Editar ────────── */
router.put("/:login", protegerCuentaAutorizada, async (req, res) => {
  try {
    const result = await svc.editarUsuario(req.params.login, req.body);
    res.json(result);
  } catch (err) {
    console.error("[usuarios] PUT /:login", err);
    res
      .status(400)
      .json({ error: err.message || "Error al actualizar usuario." });
  }
});

/* ── PUT /api/usuarios/:login/foto — Subir foto ── */
router.put("/:login/foto", protegerCuentaAutorizada, perfilUpload.single("picture"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Falta el archivo" });
    const url = `/uploads/perfil/${req.file.filename}`;
    await svc.actualizarFotoUsuario(req.params.login, url);
    res.json({ ok: true, picture: url });
  } catch (err) {
    console.error("[usuarios] PUT /:login/foto", err);
    res.status(500).json({ error: "Error al guardar foto." });
  }
});

/* ── PATCH /api/usuarios/:login/activo — Toggle ─ */
router.patch("/:login/activo", protegerCuentaAutorizada, async (req, res) => {
  try {
    const { active } = req.body;
    if (active === undefined) {
      return res.status(400).json({ error: "Se requiere el campo 'active'." });
    }
    const result = await svc.toggleActivo(req.params.login, active);
    res.json(result);
  } catch (err) {
    console.error("[usuarios] PATCH /:login/activo", err);
    res.status(500).json({ error: "Error al cambiar estado del usuario." });
  }
});

module.exports = router;
