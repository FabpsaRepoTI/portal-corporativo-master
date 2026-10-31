// server/routes/sgc.documentos.routes.js
// Gestión Documental SGC/SGI — montado en /api/sgc/documentos.
// Requiere verificarSGC() (ya aplicado en sgc.routes.js antes de montarse).
// Las rutas de escritura solo para Coordinador (rol 1).
const router = require("express").Router();
const svc = require("../services/sgc.documentos.service");
const { verificarSGC } = require("../middleware/sgcAuth.middleware");

// Cualquier escritura (subir, registrar, reemplazar, versión) invalida el listado en memoria de SharePoint
router.use((req, _res, next) => {
  if (req.method !== "GET") svc.limpiarCacheExplorador();
  next();
});

// IMPORTANTE: rutas con path literal ANTES de /:id
router.get("/vencimientos", svc.getVencimientos);
router.get("/explorador",   svc.getExplorador);
router.get("/",             svc.getDocumentos);
router.get("/sp/:itemId/preview",   svc.previewSP);
router.get("/sp/:itemId/descargar", svc.descargarSP);
// Proxy de archivos de la biblioteca (token solo en el header Authorization)
router.get("/preview/:itemId",      svc.verSP);
router.get("/download/:itemId",     svc.descargarSP);

router.get("/:id",             svc.getDocumento);
router.get("/:id/abrir",       svc.abrirDocumento);
router.get("/:id/stream",      svc.streamDocumento);
router.get("/:id/descargar",   svc.descargarDocumento);
router.get("/:id/office-url",  svc.getOfficeUrl);

router.post("/registrar",      verificarSGC([1]), svc.registrarDocumento);
router.post("/subir-nuevo",    verificarSGC([1]), svc._upload.single("archivo"), svc.subirNuevo);

router.post("/:id/nueva-version", verificarSGC([1]), svc._upload.single("archivo"), svc.nuevaVersion);
router.post("/:id/reemplazar",    verificarSGC([1]), svc._upload.single("archivo"), svc.reemplazarDocumento);
router.put("/:id/estatus",        verificarSGC([1, 2]), svc.cambiarEstatus);
router.put("/:id",                verificarSGC([1]), svc.actualizarDocumento);

module.exports = router;
