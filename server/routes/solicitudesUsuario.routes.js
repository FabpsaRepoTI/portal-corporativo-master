const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");
const ctrl = require("../controllers/solicitudesUsuario.controller");

/* ── Multer config ──────────────────────────────────────────── */
const uploadsDir =
  process.env.UPLOADS_DIR || path.join(__dirname, "../../uploads/solicitudes");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = path.join(uploadsDir, String(req.params.id));
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 40);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const permitidos = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ];
    cb(
      permitidos.includes(file.mimetype)
        ? null
        : new Error("Tipo no permitido"),
      permitidos.includes(file.mimetype),
    );
  },
});

/* ── Rutas ──────────────────────────────────────────────────── */
router.get("/kpis", verifyToken, ctrl.getMisKpis);
router.get("/", verifyToken, ctrl.getMisSolicitudes);
router.get("/:id/detalle", verifyToken, ctrl.getDetalleSolicitud);
router.post("/:id/comentario", verifyToken, ctrl.postComentario);
router.put("/:id/cancelar", verifyToken, ctrl.cancelarSolicitud);
router.post(
  "/:id/archivos",
  verifyToken,
  upload.array("archivos", 10),
  ctrl.postArchivos,
); // ← nuevo
router.post("/:id/evaluacion", verifyToken, ctrl.postEvaluacion); // ← nuevo
router.put("/:id/cerrar", verifyToken, ctrl.cerrarSolicitud);
router.put("/:id/reabrir", verifyToken, ctrl.reabrirSolicitud);

module.exports = router;
