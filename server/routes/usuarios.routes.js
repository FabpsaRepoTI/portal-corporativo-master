// ─────────────────────────────────────────────
//  usuarios.routes.js
//  server/routes/usuarios.routes.js
// ─────────────────────────────────────────────
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const svc = require("../services/usuarios.service");

const JWT_SECRET = "fabpsa_secret_2026_intranet";

/* ── Middleware: verificar JWT ────────────────── */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado." });
  }
  try {
    req.user = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }
}

/* ── Middleware: solo SISTEMAS ────────────────── */
function soloSistemas(req, res, next) {
  const area = (req.user?.area || "").toUpperCase().trim();
  if (area !== "SISTEMAS") {
    return res
      .status(403)
      .json({ error: "Acceso restringido al área SISTEMAS." });
  }
  next();
}

// Todos los endpoints requieren JWT válido + ser de SISTEMAS
router.use(verifyToken, soloSistemas);

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

/* ── POST /api/usuarios — Crear ───────────────── */
router.post("/", async (req, res) => {
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
router.put("/:login", async (req, res) => {
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

/* ── PATCH /api/usuarios/:login/activo — Toggle ─ */
router.patch("/:login/activo", async (req, res) => {
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
