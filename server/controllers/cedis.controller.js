// server/controllers/cedis.controller.js
const cedisService = require('../services/cedis.service');

// ─────────────────────────────────────────────
// POST /api/cedis/facturas/scan
// Body: { numeroFactura: "599988" }
// ─────────────────────────────────────────────
async function scan(req, res) {
  try {
    const { numeroFactura } = req.body;

    // Validación básica — el backend nunca confía solo en el frontend
    if (!numeroFactura || typeof numeroFactura !== 'string' || !numeroFactura.trim()) {
      return res.status(400).json({
        ok: false,
        status: 'INVALID_INPUT',
        message: 'El número de factura es requerido.',
      });
    }

    // El usuario siempre viene del JWT, nunca del body
    const usuarioLogin = req.user?.name || req.user?.login || 'SISTEMA';

    const resultado = await cedisService.scanFactura(
      numeroFactura.trim().toUpperCase(),
      usuarioLogin
    );

    // HTTP 200 para todos los casos de negocio — el status semántico va en el body
    // El frontend distingue SCANNED / ALREADY_SCANNED / CANCELLED / NOT_FOUND
    return res.json({
      ok: resultado.status === cedisService.SCAN_RESULT.SCANNED,
      ...resultado,
    });

  } catch (err) {
    console.error('[cedis.controller] scan error:', err);
    return res.status(500).json({
      ok: false,
      status: 'ERROR',
      message: 'Error interno al procesar el escaneo.',
    });
  }
}

// ─────────────────────────────────────────────
// GET /api/cedis/facturas/hoy
// Query: ?status=surtidas|pendientes|canceladas&q=texto
// ─────────────────────────────────────────────
async function getHoy(req, res) {
  try {
    const { status, q } = req.query;
    const resultado = await cedisService.getFacturasHoy({ status, q });
    return res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[cedis.controller] getHoy error:', err);
    return res.status(500).json({ ok: false, message: 'Error al obtener facturas del día.' });
  }
}

// ─────────────────────────────────────────────
// GET /api/cedis/facturas/historico
// Query: ?mes=8&anio=2026&status=...&q=...
// ─────────────────────────────────────────────
async function getHistorico(req, res) {
  try {
    const { mes, anio, status, q } = req.query;

    if (!mes || !anio) {
      return res.status(400).json({ ok: false, message: 'Se requieren mes y año.' });
    }

    const resultado = await cedisService.getHistorico({ mes, anio, status, q });
    return res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[cedis.controller] getHistorico error:', err);
    return res.status(500).json({ ok: false, message: 'Error al obtener histórico.' });
  }
}

// ─────────────────────────────────────────────
// GET /api/cedis/facturas/:numeroFactura
// Detalle completo + partidas (visor)
// ─────────────────────────────────────────────
async function getDetalle(req, res) {
  try {
    const { numeroFactura } = req.params;

    if (!numeroFactura) {
      return res.status(400).json({ ok: false, message: 'Número de factura requerido.' });
    }

    const resultado = await cedisService.getDetalleFactura(
      numeroFactura.trim().toUpperCase()
    );

    if (!resultado) {
      return res.status(404).json({ ok: false, message: 'Factura no encontrada.' });
    }

    return res.json({ ok: true, ...resultado });
  } catch (err) {
    console.error('[cedis.controller] getDetalle error:', err);
    return res.status(500).json({ ok: false, message: 'Error al obtener detalle de factura.' });
  }
}

module.exports = { scan, getHoy, getHistorico, getDetalle };