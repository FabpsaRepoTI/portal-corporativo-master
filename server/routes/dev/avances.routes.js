"use strict";
// ─────────────────────────────────────────────────────────────
// routes/dev/avances.routes.js
// Base: /api/dev/avances
// ─────────────────────────────────────────────────────────────
const router  = require("express").Router();
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { verifyToken, soloSistemas, soloLecturaDesarrollo, ok, err } = require("../../middleware/dev.middleware");
const svc = require("../../services/dev/avances.service");

router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

// Upload para evidencias adjuntas al avance
const UPLOAD_DIR = process.env.NODE_ENV === "production"
  ? "D:\\IntranetAPI\\uploads\\dev\\avances"
  : path.join(__dirname, "..", "..", "uploads", "dev", "avances");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// GET  /api/dev/avances?idProyecto=X
router.get("/", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { res.json(await svc.getAvances(parseInt(req.query.idProyecto))); }
  catch (e) { err(res, e); }
});

// POST /api/dev/avances  (publicar)
// multipart/form-data — permite adjuntar archivos de evidencia
router.post("/", verifyToken, soloLecturaDesarrollo, soloSistemas, upload.array("archivos", 5), async (req, res) => {
  try { ok(res, await svc.publicarAvance(req.body, req.user, req.files || [])); }
  catch (e) { err(res, e, 400); }
});

// POST /api/dev/avances/borrador
router.post("/borrador", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { ok(res, await svc.guardarBorrador(req.body, req.user)); }
  catch (e) { err(res, e, 400); }
});

// GET /api/dev/avances/borrador?idProyecto=X&login=Y
router.get("/borrador", verifyToken, soloLecturaDesarrollo, soloSistemas, async (req, res) => {
  try { res.json(await svc.getBorrador(parseInt(req.query.idProyecto), req.user.login)); }
  catch (e) { err(res, e); }
});

module.exports = router;
