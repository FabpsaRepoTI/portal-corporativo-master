// ============================================================
// vigilanciaEvidencias.service.js
// Módulo: Vigilancia — Evidencias del reporte (fotos y documentos)
// Los archivos se guardan en una carpeta PRIVADA (no bajo /uploads, que
// es público) y se sirven por el API, validando sesión y acceso al sitio.
// Se suben y quitan solo mientras el reporte está en BORRADOR.
// ============================================================

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { getVigilanciaPool: getPool, sql } = require('../db.vigilancia')
const { resolveAccesoVigilancia } = require('./vigilancia.service')

const EVIDENCIAS_DIR = process.env.VIG_EVIDENCIAS_DIR
  || path.join(__dirname, '../../uploads_privados/vigilancia/evidencias')

const MAX_BYTES = 10 * 1024 * 1024
const MAX_POR_REPORTE = 30
const TIPOS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
}

/**
 * Reporte visible para el usuario según su acceso a Vigilancia.
 * null si no existe o no tiene acceso a su sitio.
 */
async function _reporteAccesible(req, idReporte) {
  const db = await getPool()
  const r = await db.request()
    .input('idReporte', sql.Int, idReporte)
    .query(`
      SELECT r.idReporte, r.estatus, s.clave
      FROM vig_reportes r
      INNER JOIN vig_sitios s ON s.idSitio = r.idSitio
      WHERE r.idReporte = @idReporte
    `)
  const rep = r.recordset[0]
  if (!rep) return null
  const acceso = await resolveAccesoVigilancia(req.user)
  if (!acceso.general && !(acceso.claves || []).includes(rep.clave)) return null
  return rep
}

const _carpetaReporte = (idReporte) => path.join(EVIDENCIAS_DIR, String(idReporte))

/** GET /api/vigilancia/reportes/:idReporte/evidencias */
async function getEvidencias(req, res) {
  try {
    const idReporte = parseInt(req.params.idReporte)
    const rep = await _reporteAccesible(req, idReporte)
    if (!rep) return res.status(404).json({ ok: false, error: 'Reporte no encontrado' })

    const db = await getPool()
    const r = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query(`
        SELECT e.idEvidencia, e.nombreOriginal, e.tipoMime, e.tamanoBytes, e.descripcion,
               e.loginCarga, COALESCE(u.name, e.loginCarga) AS cargadoPor, e.fechaCarga
        FROM vig_evidencias e
        LEFT JOIN sec_users u ON u.login = e.loginCarga
        WHERE e.idReporte = @idReporte AND e.activo = 1
        ORDER BY e.fechaCarga
      `)
    res.json({ ok: true, data: { evidencias: r.recordset, editable: rep.estatus === 1, maxPorReporte: MAX_POR_REPORTE } })
  } catch (err) {
    console.error('[vigilanciaEvidencias] getEvidencias:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * POST /api/vigilancia/reportes/:idReporte/evidencias  (multipart)
 * Campos: archivo, descripcion?
 */
async function subirEvidencia(req, res) {
  const file = req.file
  try {
    const idReporte = parseInt(req.params.idReporte)
    const descripcion = String(req.body?.descripcion || '').trim()
    if (!file?.buffer?.length) return res.status(400).json({ ok: false, error: 'Selecciona un archivo' })
    if (!TIPOS[file.mimetype]) {
      return res.status(400).json({ ok: false, error: 'Formato no admitido. Usa fotos (JPG, PNG, WEBP), PDF, Word o Excel.' })
    }
    if (descripcion.length > 300) return res.status(400).json({ ok: false, error: 'La descripción admite hasta 300 caracteres' })

    const rep = await _reporteAccesible(req, idReporte)
    if (!rep) return res.status(404).json({ ok: false, error: 'Reporte no encontrado' })
    if (rep.estatus !== 1) return res.status(400).json({ ok: false, error: 'El reporte ya está cerrado' })

    const db = await getPool()
    const n = await db.request()
      .input('idReporte', sql.Int, idReporte)
      .query('SELECT COUNT(*) AS n FROM vig_evidencias WHERE idReporte = @idReporte AND activo = 1')
    if (n.recordset[0].n >= MAX_POR_REPORTE) {
      return res.status(400).json({ ok: false, error: `Máximo ${MAX_POR_REPORTE} evidencias por reporte` })
    }

    // Nombre en disco aleatorio: no depende del nombre que mande el usuario
    const nombreArchivo = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${TIPOS[file.mimetype]}`
    const carpeta = _carpetaReporte(idReporte)
    fs.mkdirSync(carpeta, { recursive: true })
    const ruta = path.join(carpeta, nombreArchivo)
    fs.writeFileSync(ruta, file.buffer)

    // multer puede entregar el nombre UTF-8 leído como latin1 ("FotografÃ­a"): se corrige si aplica
    const crudo = file.originalname || 'archivo'
    const comoUtf8 = Buffer.from(crudo, 'latin1').toString('utf8')
    const nombreOriginal = (comoUtf8.includes('�') ? crudo : comoUtf8).slice(0, 255)
    try {
      const r = await db.request()
        .input('idReporte',      sql.Int,           idReporte)
        .input('nombreOriginal', sql.NVarChar(255), nombreOriginal)
        .input('nombreArchivo',  sql.NVarChar(255), nombreArchivo)
        .input('tipoMime',       sql.VarChar(100),  file.mimetype)
        .input('tamano',         sql.Int,           file.buffer.length)
        .input('descripcion',    sql.NVarChar(300), descripcion || null)
        .input('login',          sql.VarChar(255),  req.user.login)
        .query(`
          INSERT INTO vig_evidencias (idReporte, nombreOriginal, nombreArchivo, tipoMime, tamanoBytes, descripcion, loginCarga)
          OUTPUT INSERTED.idEvidencia
          VALUES (@idReporte, @nombreOriginal, @nombreArchivo, @tipoMime, @tamano, @descripcion, @login)
        `)
      res.status(201).json({ ok: true, data: { idEvidencia: r.recordset[0].idEvidencia } })
    } catch (err) {
      fs.rmSync(ruta, { force: true }) // no dejar el archivo huérfano
      throw err
    }
  } catch (err) {
    console.error('[vigilanciaEvidencias] subirEvidencia:', err)
    res.status(500).json({ ok: false, error: 'Error al guardar la evidencia' })
  }
}

/** Evidencia activa + su reporte, si el usuario tiene acceso */
async function _evidenciaAccesible(req, idEvidencia) {
  const db = await getPool()
  const r = await db.request()
    .input('id', sql.Int, idEvidencia)
    .query(`
      SELECT idEvidencia, idReporte, nombreOriginal, nombreArchivo, tipoMime, loginCarga
      FROM vig_evidencias WHERE idEvidencia = @id AND activo = 1
    `)
  const ev = r.recordset[0]
  if (!ev) return null
  const rep = await _reporteAccesible(req, ev.idReporte)
  return rep ? { ev, rep } : null
}

/**
 * GET /api/vigilancia/evidencias/:idEvidencia/archivo[?descargar=1]
 * Acepta el token por query (?token=) para poder usarse en <img> y en
 * pestañas nuevas, que no mandan el header Authorization.
 */
async function verEvidencia(req, res) {
  try {
    const found = await _evidenciaAccesible(req, parseInt(req.params.idEvidencia))
    if (!found) return res.status(404).json({ ok: false, error: 'Evidencia no encontrada' })
    const { ev } = found

    const ruta = path.join(_carpetaReporte(ev.idReporte), path.basename(ev.nombreArchivo))
    if (!fs.existsSync(ruta)) return res.status(404).json({ ok: false, error: 'El archivo ya no está en el servidor' })

    const disposicion = req.query.descargar === '1' ? 'attachment' : 'inline'
    res.setHeader('Content-Type', ev.tipoMime)
    res.setHeader('Content-Disposition', `${disposicion}; filename*=UTF-8''${encodeURIComponent(ev.nombreOriginal)}`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    fs.createReadStream(ruta).pipe(res)
  } catch (err) {
    console.error('[vigilanciaEvidencias] verEvidencia:', err)
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

/**
 * DELETE /api/vigilancia/evidencias/:idEvidencia
 * Quien la subió la puede quitar mientras el reporte siga en borrador.
 * El registro queda inactivo (trazabilidad) y el archivo se conserva.
 */
async function quitarEvidencia(req, res) {
  try {
    const found = await _evidenciaAccesible(req, parseInt(req.params.idEvidencia))
    if (!found) return res.status(404).json({ ok: false, error: 'Evidencia no encontrada' })
    const { ev, rep } = found
    if (rep.estatus !== 1) return res.status(400).json({ ok: false, error: 'El reporte ya está cerrado' })
    if (String(ev.loginCarga).toUpperCase() !== String(req.user.login).toUpperCase()) {
      return res.status(403).json({ ok: false, error: 'Solo quien subió la evidencia puede quitarla' })
    }

    const db = await getPool()
    await db.request()
      .input('id',    sql.Int,          ev.idEvidencia)
      .input('login', sql.VarChar(255), req.user.login)
      .query('UPDATE vig_evidencias SET activo = 0, loginBaja = @login, fechaBaja = GETDATE() WHERE idEvidencia = @id')
    res.json({ ok: true })
  } catch (err) {
    console.error('[vigilanciaEvidencias] quitarEvidencia:', err)
    res.status(500).json({ ok: false, error: 'Error interno' })
  }
}

module.exports = { MAX_BYTES, getEvidencias, subirEvidencia, verEvidencia, quitarEvidencia }
