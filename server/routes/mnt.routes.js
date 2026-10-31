// server/routes/mnt.routes.js

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { verifyToken } = require("../middleware/auth");
const ctrl = require("../controllers/mnt.controller");

const router = express.Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.join(process.env.UPLOADS_DIR, "mantenimiento")
  : path.join(__dirname, "../../uploads/mantenimiento");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "video/mp4",
      "video/quicktime",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

const ejecutivoAccess=[verifyToken,require("../middleware/requireModulo")("mantenimiento"),(req,res,next)=>req.user.esMto?next():res.status(403).json({error:"Acceso denegado"})];
router.get("/ejecutivo",...ejecutivoAccess,async(req,res)=>{try{res.set("Cache-Control","no-store");res.json(await require("../services/mntEjecutivo.service").getResumen());}catch(e){res.status(500).json({error:"No fue posible consultar el resumen de mantenimiento."});}});
const analisisActivos=new Set();
router.post("/ejecutivo/analisis-ia",...ejecutivoAccess,async(req,res)=>{
 const login=req.user.login;if(analisisActivos.has(login))return res.status(409).json({error:"Ya hay un análisis en curso."});
 analisisActivos.add(login);
 try{res.json(await require("../controllers/ejecutivo.controller").getAnalisisIA({mantenimiento:true}));}
 catch(e){res.status(500).json({error:"No fue posible generar el análisis de mantenimiento."});}
 finally{analisisActivos.delete(login);}
});

// Catálogos
router.get("/catalogos", verifyToken, ctrl.getCatalogos);
router.get("/catalogos/areas/:codigoSitio", verifyToken, ctrl.getAreasPorSitio);
router.get("/catalogos/personal", verifyToken, ctrl.getPersonal);
router.get("/catalogos/sitios-bandeja", verifyToken, ctrl.getSitiosBandeja);

// Solicitudes usuario
router.post(
  "/solicitudes",
  verifyToken,
  ctrl.validarNuevaSolicitud,
  upload.array("archivos", 5),
  ctrl.postSolicitud,
);
router.get("/solicitudes/mis", verifyToken, ctrl.getMisSolicitudes);
router.get("/solicitudes/:id", verifyToken, ctrl.getDetalle);

// Cambio de estado
router.patch(
  "/solicitudes/:id/estatus",
  verifyToken,
  upload.array("archivos", 10),
  ctrl.patchEstatus,
);

// Visto bueno
router.post("/solicitudes/:id/visto-bueno", verifyToken, ctrl.postVistoBueno);

// Mensajes
router.get("/solicitudes/:id/mensajes", verifyToken, ctrl.getMensajes);
router.post("/solicitudes/:id/mensajes", verifyToken, ctrl.postMensaje);

// Participantes
router.post(
  "/solicitudes/:id/participantes",
  verifyToken,
  ctrl.postParticipante,
);
router.delete(
  "/solicitudes/:id/participantes/:idParticipante",
  verifyToken,
  ctrl.deleteParticipante,
);

// Bandeja
router.get("/bandeja", verifyToken, ctrl.getBandeja);

module.exports = router;
