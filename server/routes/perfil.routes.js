const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");
const { getPerfil, updateFoto } = require("../services/perfil.service");

// ── Multer para fotos de perfil ──
const perfilUploadDir = path.join(__dirname, "../../uploads/perfil");
if (!fs.existsSync(perfilUploadDir))
  fs.mkdirSync(perfilUploadDir, { recursive: true });

const perfilStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, perfilUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user.login}${ext}`);
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

// GET /api/perfil
router.get("/", verifyToken, async (req, res) => {
  try {
    const perfil = await getPerfil(req.user.login);
    if (!perfil)
      return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(perfil);
  } catch (err) {
    console.error("GET /perfil:", err);
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// PUT /api/perfil/foto
router.put(
  "/foto",
  verifyToken,
  perfilUpload.single("picture"),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Falta el archivo" });
      const url = `/uploads/perfil/${req.file.filename}`;
      await updateFoto(req.user.login, url);
      res.json({ ok: true, picture: url });
    } catch (err) {
      console.error("PUT /perfil/foto:", err);
      res.status(500).json({ error: "Error al guardar foto" });
    }
  },
);

module.exports = router;
