// server/routes/sit.routes.js
// Módulo SIT — Sistema de Información Técnica. Montado en /api/sit.
const router = require("express").Router();
const multer = require("multer");
const { verifyToken } = require("../middleware/auth");
const { ticketEnQuery, requireSIT, requireSitPermiso, requireAdminDocumental } = require("../middleware/sit.middleware");
const svc = require("../services/sit.service");
const control = require("../services/sitControl.service");

const soloAdmin = requireSitPermiso("puedeAdmin");
const puedeCargar = requireSitPermiso("puedeCargarDoc");
const puedeValidar = requireSitPermiso("puedeValidar");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: svc.UPLOAD_MAX_BYTES, files: 1, fields: 10, fieldSize: 4000 },
}).single("archivo");

function subirArchivo(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();
    const tamano = error.code === "LIMIT_FILE_SIZE";
    res.status(tamano ? 413 : 400).json({
      ok: false,
      error: tamano ? "El archivo supera el límite de 20 MB." : "Selecciona un solo archivo PDF.",
    });
  });
}

// Archivos: el visor no puede mandar el header Authorization, así que estas
// dos rutas se autentican con un ticket de un solo uso (?ticket=), emitido
// por POST /documentos/ticket. Ya NO aceptan el JWT de la sesión en la URL.
// requireSIT vuelve a leer los permisos de la BD en cada archivo servido.
router.get("/documentos/:id/ver", ticketEnQuery, requireSIT, svc.verDocumento);
// PDF de la biblioteca de SharePoint de proveedores
router.get("/documentos/:sharepointId/stream", ticketEnQuery, requireSIT, svc.streamDocumentoSharePoint);

router.use(verifyToken, requireSIT);

router.post("/documentos/ticket", svc.solicitarTicket);
// Permisos efectivos del usuario actual (el frontend decide qué mostrar; el servidor decide qué permite)
router.get("/mis-permisos", (req, res) => res.json({ ok: true, data: req.sitPermiso }));

// ── Fabi · Información Técnica (asistente propio del SIT) ──
// Solo quien tiene acceso al SIT (router.use requireSIT de arriba). Mismo
// formato de mensajes y límites que el asistente de Mesa de Servicio.
const { conversarSit } = require("../services/sitAsistente.service");
const { validarMensajes } = require("../services/mesaAsistente.service");
const _asistActivos = new Set();
const _asistRecientes = new Map();
router.post("/asistente", async (req, res) => {
  let messages;
  try {
    messages = validarMensajes(req.body?.messages);
  } catch {
    return res.status(400).json({ ok: false, error: "Escribe tu pregunta en mensajes de hasta 1500 caracteres." });
  }
  const login = req.user.login;
  const ahora = Date.now();
  for (const [id, t] of _asistRecientes) if (ahora - t > 60000) _asistRecientes.delete(id);
  if (_asistActivos.has(login) || ahora - (_asistRecientes.get(login) || 0) < 2500) {
    return res.status(429).json({ ok: false, error: "Espera un momento antes de enviar otra pregunta." });
  }
  _asistActivos.add(login);
  _asistRecientes.set(login, ahora);
  try {
    res.set("Cache-Control", "no-store");
    const contexto = req.body?.contexto && typeof req.body.contexto === "object" ? req.body.contexto : null;
    res.json({ ok: true, data: await conversarSit(messages, { login, contexto }) });
  } catch (err) {
    console.error("[sit-asistente]", err.detalle || err.message);
    res.status(503).json({ ok: false, error: "Fab-i no está disponible en este momento. Intenta de nuevo en unos segundos." });
  } finally {
    _asistActivos.delete(login);
  }
});

// ── Centro de control documental (solo sit_administradores) ──
router.get("/control/resumen", requireAdminDocumental, control.getResumen);
router.get("/control/usuarios", requireAdminDocumental, control.getUsuarios);
router.get("/control/usuarios/buscar", requireAdminDocumental, control.buscarCandidatos);
router.get("/control/usuarios/:login/permisos", requireAdminDocumental, control.getPermisosEfectivos);
router.post("/control/usuarios", requireAdminDocumental, control.autorizarUsuario);
router.put("/control/usuarios/:login/rol", requireAdminDocumental, control.cambiarRol);
router.put("/control/usuarios/:login/estado", requireAdminDocumental, control.cambiarEstado);
router.get("/control/roles", requireAdminDocumental, control.getRoles);
router.get("/control/auditoria", requireAdminDocumental, control.getAuditoria);

// Catálogos y tablero
router.get("/tipos-documento", svc.getTiposDocumento);
router.get("/dashboard", svc.getDashboard);
router.get("/tablero", svc.getDashboard);

// Artículos
router.get("/articulos", svc.getArticulos);
router.get("/articulos/:codigoArticulo", svc.getArticuloDetalle);
router.post("/articulos", soloAdmin, svc.crearArticulo);
router.put("/articulos/:id/inactivar", soloAdmin, svc.inactivarArticulo);

// Proveedores
router.get("/proveedores", svc.getProveedores);
router.post("/proveedores", soloAdmin, svc.crearProveedor);
router.get("/articulos/:codigoArticulo/proveedores", svc.getProveedoresArticulo);
router.post("/articulos/:codigoArticulo/proveedores", soloAdmin, svc.vincularProveedor);

// Requisitos y documentos por par artículo-proveedor
router.get("/articulo-proveedor/:id/requisitos", svc.getRequisitos);
router.put("/articulo-proveedor/:id/requisitos", soloAdmin, svc.setRequisitos);
router.get("/articulo-proveedor/:id/documentos", svc.getDocumentos);

// Documentos
router.post("/documentos", puedeCargar, subirArchivo, svc.cargarDocumento);
router.post("/documentos/registrar-vencimiento", puedeValidar, svc.registrarVencimiento);
router.put("/documentos/sharepoint/:sharepointId/fecha", puedeValidar, svc.registrarVencimiento);
router.put("/documentos/sharepoint/:sharepointId/validar", puedeValidar, svc.validarDocumentoSharePoint);
// Lectura de la fecha del PDF con IA (usa la API de Anthropic: solo quien puede registrar vencimientos)
router.get("/documentos/:sharepointId/extraer-fecha", puedeValidar, svc.extraerFechaDocumento);
// "También contiene": la IA sugiere, la persona confirma; cuenta para el cumplimiento
router.get("/documentos/sharepoint/:sharepointId/sugerir-contenido", puedeValidar, svc.sugerirContenidoDocumento);
router.put("/documentos/sharepoint/:sharepointId/contenido", puedeValidar, svc.guardarContenidoDocumento);

// Tablero: cumplimiento de la matriz de requisitoriedad por planta
router.get("/tablero/cumplimiento", svc.getCumplimientoTablero);
router.get("/tablero/dashboard", requireAdminDocumental, svc.getDashboardAdmin);
router.get("/documentos/:id/historial", svc.getHistorial);
router.put("/documentos/:id/validar", puedeValidar, svc.validarDocumento);

module.exports = router;
