// server/routes/dev/sharepoint.routes.js

const express = require("express");
const router = express.Router();
const { verifyToken, soloSistemas } = require("../../middleware/dev.middleware");
const service = require("../../services/dev/sharepoint.service");

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/documentos", verifyToken, async (req, res) => {
  await service.getDocumentos(req, res);
});

router.get("/carpetas", verifyToken, async (req, res) => {
  await service.getColecciones(req, res);
});

router.get("/recientes", verifyToken, async (req, res) => {
  await service.getRecientes(req, res);
});

router.get('/documentos/:id/preview',verifyToken,service.getVistaPrevia);
const multer=require('multer');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:service.UPLOAD_MAX_BYTES,files:1,fields:2,fieldSize:8000,parts:4}}).single('archivo');
router.post('/documentos',verifyToken,soloSistemas,(req,res,next)=>{
 upload(req,res,error=>{if(error)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({ok:false,error:error.code==='LIMIT_FILE_SIZE'?'El archivo supera el límite de 20 MB.':'Selecciona un solo archivo y una colección válida.'});next();});
},service.subirDocumento);
module.exports = router;
