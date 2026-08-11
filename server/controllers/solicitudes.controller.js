// server/controllers/solicitudes.controller.js
// Reemplaza el archivo existente completo

const {
  crearSolicitud,
  obtenerSolicitudesUsuario,
  guardarArchivos,
} = require("../services/solicitudes.service");
const { enviarCorreoSolicitudTI } = require("../services/mailer.js");
const { getPool } = require("../db");

async function postSolicitud(req, res) {
  try {
    const { slug, titulo, descripcion, idPrioridad } = req.body;
    const user = req.user;
    const archivos = req.files ?? []; // viene de multer

    // ── Validación de negocio (nunca exponer mensajes técnicos) ──────
    if (!slug) {
      return res.status(400).json({
        ok: false,
        code: "MISSING_SLUG",
        message:
          "No se pudo identificar el tipo de servicio. Recarga la página e intenta de nuevo.",
      });
    }
    if (!titulo?.trim()) {
      return res.status(400).json({
        ok: false,
        code: "MISSING_TITULO",
        message:
          "El título del incidente es obligatorio. Por favor complétalo antes de enviar.",
      });
    }

    // ── Obtener servicio ─────────────────────────────────────────────
    const pool = await getPool();
    const svcRes = await pool.request().input("slug", slug).query(`
      SELECT idServicio, nombre, tipo, idPrioridadDefault, formTitulo, colorPrimario
      FROM cat_servicioTI
      WHERE slug = @slug AND activo = 1
    `);

    if (!svcRes.recordset.length) {
      return res.status(404).json({
        ok: false,
        code: "SERVICE_NOT_FOUND",
        message:
          "El servicio seleccionado no está disponible en este momento. Contacta a Sistemas.",
      });
    }

    const svc = svcRes.recordset[0];
    const prioFinal = idPrioridad ?? svc.idPrioridadDefault;

    if (!prioFinal) {
      return res.status(400).json({
        ok: false,
        code: "MISSING_PRIORITY",
        message:
          "No se pudo determinar la prioridad. Selecciona una prioridad e intenta de nuevo.",
      });
    }

    // ── Crear solicitud ──────────────────────────────────────────────
    const resultado = await crearSolicitud({
      idServicio: svc.idServicio,
      idPrioridad: prioFinal,
      titulo: titulo.trim(),
      descripcion: descripcion?.trim() ?? "",
      idUsuario: user.login,
      nombreUsuario: user.name ?? user.login,
      areaUsuario: user.area ?? "",
      sitioUsuario: user.sitio ?? "",
    });

    // ── Guardar archivos adjuntos ────────────────────────────────────
    let rutasGuardadas = [];
    if (archivos.length > 0) {
      rutasGuardadas = await guardarArchivos(resultado.idSolicitud, archivos);
    }

    // ── Email (no bloqueante) ────────────────────────────────────────
    enviarCorreoSolicitudTI({
      folio: resultado.folio,
      fecha: resultado.fechaCreacion,
      titulo: titulo.trim(),
      descripcion: descripcion?.trim() ?? "",
      servicio: svc.nombre,
      prioridad: resultado.prioridad,
      colorPrioridad: resultado.colorHex,
      slaRespuestaHrs: resultado.slaRespuestaHrs,
      slaResolucionHrs: resultado.slaResolucionHrs,
      fechaLimiteResp: resultado.fechaLimiteResp,
      fechaLimiteResol: resultado.fechaLimiteResol,
      solicitante: user.name ?? user.login,
      area: user.area ?? "",
      sitio: user.sitio ?? "",
      correoSolicitante: user.email ?? null,
      tieneEvidencia: archivos.length > 0,
    }).catch((err) => console.error("[mailer] solicitudTI:", err.message));

    return res.json({
      ok: true,
      folio: resultado.folio,
      idSolicitud: resultado.idSolicitud,
      slaRespuestaHrs: resultado.slaRespuestaHrs,
      slaResolucionHrs: resultado.slaResolucionHrs,
      fechaLimiteResp: resultado.fechaLimiteResp,
      fechaLimiteResol: resultado.fechaLimiteResol,
      prioridad: resultado.prioridad,
      archivos: rutasGuardadas,
    });
  } catch (err) {
    console.error("[solicitudes] POST:", err);
    // Nunca exponer el mensaje técnico al cliente
    res.status(500).json({
      ok: false,
      message:
        "Ocurrió un problema al registrar tu solicitud. Por favor intenta de nuevo o contacta a Sistemas.",
    });
  }
}

async function getMisSolicitudes(req, res) {
  try {
    const data = await obtenerSolicitudesUsuario(req.user.login);
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[solicitudes] GET mis:", err);
    res.status(500).json({
      ok: false,
      message: "No se pudieron cargar tus solicitudes. Intenta de nuevo.",
    });
  }
}

module.exports = { postSolicitud, getMisSolicitudes };
