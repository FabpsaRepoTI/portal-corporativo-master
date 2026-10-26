// ============================================================
// vigilancia.routes.js
// Módulo: Vigilancia — Reporte de Novedades
// Portal Corporativo v4 · FABPSA
// ============================================================

const express = require('express')
const router  = express.Router()
const multer  = require('multer')
const path    = require('path')
const fs      = require('fs')
const { verifyToken } = require('../middleware/auth')
const svc = require('../services/vigilancia.service')
const pdfSvc = require('../services/vigilanciaPdf.service')

// ── Multer para firmas precargadas ──
const firmasUploadDir = path.join(__dirname, '../../uploads/firmas')
if (!fs.existsSync(firmasUploadDir)) fs.mkdirSync(firmasUploadDir, { recursive: true })

const firmasStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, firmasUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${req.params.login}${ext}`)
  },
})

const firmasUpload = multer({
  storage: firmasStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp']
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()))
  },
})

// ── Evidencias del reporte (fotos y documentos) ──
const evidenciasSvc = require('../services/vigilanciaEvidencias.service')
const evidenciaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: evidenciasSvc.MAX_BYTES, files: 1, fields: 4 },
}).single('archivo')

function subirEvidenciaArchivo(req, res, next) {
  evidenciaUpload(req, res, (error) => {
    if (!error) return next()
    const tamano = error.code === 'LIMIT_FILE_SIZE'
    res.status(tamano ? 413 : 400).json({
      ok: false,
      error: tamano ? 'El archivo supera el límite de 10 MB.' : 'Selecciona un solo archivo.',
    })
  })
}

// <img> y pestañas nuevas no mandan Authorization: solo esta ruta acepta ?token=
function tokenEnQuery(req, res, next) {
  if (!req.headers.authorization && req.query.token) req.headers.authorization = 'Bearer ' + req.query.token
  next()
}

router.get('/reportes/:idReporte/evidencias', verifyToken, evidenciasSvc.getEvidencias)
router.post('/reportes/:idReporte/evidencias', verifyToken, subirEvidenciaArchivo, evidenciasSvc.subirEvidencia)
router.get('/evidencias/:idEvidencia/archivo', tokenEnQuery, verifyToken, evidenciasSvc.verEvidencia)
router.delete('/evidencias/:idEvidencia', verifyToken, evidenciasSvc.quitarEvidencia)

// ────────────────────────────────────────────────────────────
// CATÁLOGOS / CONFIG
// ────────────────────────────────────────────────────────────

/**
 * GET /api/vigilancia/sitios
 * Lista los 5 sitios con sus flags de configuración.
 */
router.get('/sitios', verifyToken, async (req, res) => {
  await svc.getSitios(req, res)
})

/**
 * GET /api/vigilancia/config/:idSitio
 * Devuelve la configuración completa de un sitio:
 * sitio + ejecutivos + vehículos (con km heredado) + rondines
 */
router.get('/config/:idSitio', verifyToken, async (req, res) => {
  await svc.getConfigSitio(req, res)
})

// ────────────────────────────────────────────────────────────
// REPORTES — CRUD PRINCIPAL
// ────────────────────────────────────────────────────────────

/**
 * GET /api/vigilancia/reportes
 * Lista paginada de reportes.
 * Query params: idSitio, estatus, fechaDesde, fechaHasta, page, limit
 */
router.get('/reportes', verifyToken, async (req, res) => {
  await svc.getReportes(req, res)
})

/**
 * GET /api/vigilancia/reportes/:idReporte
 * Objeto completo del reporte con todos sus hijos anidados.
 */
router.get('/reportes/:idReporte', verifyToken, async (req, res) => {
  await svc.getReporteById(req, res)
})

/**
 * POST /api/vigilancia/reportes
 * Crea un nuevo reporte BORRADOR con todas las filas hijo inicializadas.
 * Body: { idSitio, fechaInicio, fechaFin, horaInicio, horaFin, reporto, recibio, enterado1, enterado2 }
 */
router.post('/reportes', verifyToken, async (req, res) => {
  await svc.crearReporte(req, res)
})

/**
 * PATCH /api/vigilancia/reportes/:idReporte/cabecera
 * Actualiza campos de cabecera (fechas, horas, firmantes).
 * Solo en estado BORRADOR.
 */
router.patch('/reportes/:idReporte/cabecera', verifyToken, async (req, res) => {
  await svc.updateCabecera(req, res)
})

/**
 * PATCH /api/vigilancia/reportes/:idReporte/recibio
 * Fija quién recibió el turno — editable en cualquier momento del Borrador.
 * Body: { recibio }
 */
router.patch('/reportes/:idReporte/recibio', verifyToken, async (req, res) => {
  await svc.updateRecibio(req, res)
})

/**
 * POST /api/vigilancia/reportes/:idReporte/cerrar
 * Cierra el reporte (estatus 1→2) y registra auditoría de km.
 * Solo en estado BORRADOR.
 */
router.post('/reportes/:idReporte/cerrar', verifyToken, async (req, res) => {
  await svc.cerrarReporte(req, res)
})

/**
 * GET /api/vigilancia/borrador-activo/:idSitio
 * Devuelve el reporte en BORRADOR activo del sitio (si existe).
 */
router.get('/borrador-activo/:idSitio', verifyToken, async (req, res) => {
  await svc.getBorradorActivo(req, res)
})

// ────────────────────────────────────────────────────────────
// PERSONAL
// ────────────────────────────────────────────────────────────

/**
 * PUT /api/vigilancia/reportes/:idReporte/personal
 * Actualiza (upsert) la sección de personal del reporte.
 * Body: { deptAdministracion, deptAlmacen, deptReparto, retardos, faltas, incapacitados, pasesAutorizados, personalExtraNum }
 */
router.put('/reportes/:idReporte/personal', verifyToken, async (req, res) => {
  await svc.updatePersonal(req, res)
})

// ────────────────────────────────────────────────────────────
// EJECUTIVOS
// ────────────────────────────────────────────────────────────

/**
 * POST /api/vigilancia/ejecutivos/:idEjecutivoRep/movimientos
 * Agrega un movimiento (ENTRADA/SALIDA) a un ejecutivo del reporte. Máx 6.
 * Body: { tipo, hora }
 */
router.post('/ejecutivos/:idEjecutivoRep/movimientos', verifyToken, async (req, res) => {
  await svc.addMovimientoEjecutivo(req, res)
})

/**
 * PUT /api/vigilancia/ejecutivos/movimientos/:idMovEjec
 * Edita hora de un movimiento existente.
 * Body: { hora }
 */
router.put('/ejecutivos/movimientos/:idMovEjec', verifyToken, async (req, res) => {
  await svc.updateMovimientoEjecutivo(req, res)
})

/**
 * DELETE /api/vigilancia/ejecutivos/movimientos/:idMovEjec
 * Elimina un movimiento de ejecutivo.
 */
router.delete('/ejecutivos/movimientos/:idMovEjec', verifyToken, async (req, res) => {
  await svc.deleteMovimientoEjecutivo(req, res)
})

/**
 * PUT /api/vigilancia/ejecutivos/:idEjecutivoRep/observaciones
 * Actualiza el campo de observaciones del ejecutivo en el reporte.
 * Body: { observaciones }
 */
router.put('/ejecutivos/:idEjecutivoRep/observaciones', verifyToken, async (req, res) => {
  await svc.updateObservacionEjecutivo(req, res)
})

// ────────────────────────────────────────────────────────────
// VEHÍCULOS
// ────────────────────────────────────────────────────────────

/**
 * PUT /api/vigilancia/vehiculos/:idVehiculoRep
 * Actualiza campos de un vehículo en el reporte (km, estado, placa, operador, observaciones).
 * Valida que kmEntrada >= kmSalida.
 * Body: { kmSalida, kmEntrada, estado, placaActual, nombreOperador, observaciones }
 */
router.put('/vehiculos/:idVehiculoRep', verifyToken, async (req, res) => {
  await svc.updateVehiculo(req, res)
})

/**
 * POST /api/vigilancia/vehiculos/:idVehiculoRep/movimientos
 * Agrega un movimiento (SALIDA/ENTRADA) a un vehículo del reporte. Máx 8.
 * Body: { tipo, hora, destino }
 */
router.post('/vehiculos/:idVehiculoRep/movimientos', verifyToken, async (req, res) => {
  await svc.addMovimientoVehiculo(req, res)
})

/**
 * PUT /api/vigilancia/vehiculos/movimientos/:idMovVehiculo
 * Edita hora/destino de un movimiento de vehículo.
 * Body: { hora, destino }
 */
router.put('/vehiculos/movimientos/:idMovVehiculo', verifyToken, async (req, res) => {
  await svc.updateMovimientoVehiculo(req, res)
})

/**
 * DELETE /api/vigilancia/vehiculos/movimientos/:idMovVehiculo
 * Elimina un movimiento de vehículo.
 */
router.delete('/vehiculos/movimientos/:idMovVehiculo', verifyToken, async (req, res) => {
  await svc.deleteMovimientoVehiculo(req, res)
})

// ────────────────────────────────────────────────────────────
// RONDINES
// ────────────────────────────────────────────────────────────

/**
 * PUT /api/vigilancia/rondines/:idRondinRep
 * Actualiza el estatus/hora de un rondín del reporte.
 * Body: { realizado, horaRondin, observaciones }
 */
router.put('/rondines/:idRondinRep', verifyToken, async (req, res) => {
  await svc.updateRondin(req, res)
})

// ────────────────────────────────────────────────────────────
// UBICACIONES (solo SUR 121 — tieneUbicacionIncidencia = 1)
// ────────────────────────────────────────────────────────────

/**
 * PUT /api/vigilancia/ubicaciones/:idUbicacionRep
 * Actualiza las unidades asignadas y la observación de una ubicación del reporte.
 * Body: { idVehiculos: [1,2,3], observaciones }
 */
router.put('/ubicaciones/:idUbicacionRep', verifyToken, async (req, res) => {
  await svc.updateUbicacion(req, res)
})

/**
 * PUT /api/vigilancia/reportes/:idReporte/vehiculos-ubicacion/:idVehiculo
 * Reasigna una unidad a un destino en una sola llamada (vista rápida por vehículo).
 * Body: { idUbicacionRep: number|null }
 */
router.put('/reportes/:idReporte/vehiculos-ubicacion/:idVehiculo', verifyToken, async (req, res) => {
  await svc.reassignVehiculoUbicacion(req, res)
})

// ────────────────────────────────────────────────────────────
// SINIESTROS
// ────────────────────────────────────────────────────────────

/**
 * GET /api/vigilancia/reportes/:idReporte/siniestros
 * Lista siniestros del reporte.
 */
router.get('/reportes/:idReporte/siniestros', verifyToken, async (req, res) => {
  await svc.getSiniestros(req, res)
})

/**
 * POST /api/vigilancia/reportes/:idReporte/siniestros
 * Agrega un siniestro al reporte.
 * Body: { tipo, descripcion, camposExtra (JSON) }
 */
router.post('/reportes/:idReporte/siniestros', verifyToken, async (req, res) => {
  await svc.addSiniestro(req, res)
})

/**
 * PUT /api/vigilancia/siniestros/:idSiniestro
 * Edita un siniestro.
 * Body: { tipo, descripcion, camposExtra }
 */
router.put('/siniestros/:idSiniestro', verifyToken, async (req, res) => {
  await svc.updateSiniestro(req, res)
})

/**
 * DELETE /api/vigilancia/siniestros/:idSiniestro
 * Elimina un siniestro.
 */
router.delete('/siniestros/:idSiniestro', verifyToken, async (req, res) => {
  await svc.deleteSiniestro(req, res)
})

// ────────────────────────────────────────────────────────────
// FIRMAS PRECARGADAS
// ────────────────────────────────────────────────────────────

/**
 * GET /api/vigilancia/firmas?logins=LOGIN1,LOGIN2
 * Devuelve las firmas guardadas (y los nombres) de los logins pedidos.
 */
router.get('/firmas', verifyToken, async (req, res) => {
  await svc.getFirmas(req, res)
})

/**
 * PUT /api/vigilancia/firmas/:login
 * Sube/reemplaza la imagen de firma precargada de esa persona.
 * multipart/form-data, campo "firma".
 */
router.put('/firmas/:login', verifyToken, firmasUpload.single('firma'), async (req, res) => {
  await svc.uploadFirma(req, res)
})

/**
 * GET /api/vigilancia/reportes/:idReporte/pdf
 * Genera y devuelve el PDF del reporte (solo si ya está CERRADO).
 */
router.get('/reportes/:idReporte/pdf', verifyToken, async (req, res) => {
  await pdfSvc.generarReportePdf(req, res)
})

module.exports = router
