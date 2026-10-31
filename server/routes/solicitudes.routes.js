// server/routes/solicitudes.routes.js
// Reemplaza el archivo existente completo

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");
const {
  postSolicitud,
  getMisSolicitudes,
} = require("../controllers/solicitudes.controller");

// ── Directorio de uploads ────────────────────────────────────────────
//const UPLOADS_DIR = path.join(__dirname, "../../uploads/solicitudes");

//const UPLOADS_DIR = "D:\\uploads\\solicitudes";
const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(__dirname, "../../uploads/solicitudes");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Configuración de multer ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── Rutas ────────────────────────────────────────────────────────────
router.post("/", verifyToken, upload.array("archivos", 5), postSolicitud);
router.get("/mis-solicitudes", verifyToken, getMisSolicitudes);

module.exports = router;
