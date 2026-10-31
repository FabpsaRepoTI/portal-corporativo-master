// server/controllers/mnt.controller.js

const svc = require("../services/mnt.service");
const {
  enviarCorreoSolicitudMantenimiento,
  enviarCorreoReaperturaMantenimiento,
} = require("../services/mailer");
const {
  crearNotificacion,
  TIPOS: TIPOS_NOTIFICACION,
} = require("../services/notificaciones.service");

const ETIQUETAS_MNT = {
  0: "Sin atención",
  1: "En proceso",
  2: "Pendiente de material",
  3: "Pendiente de visto bueno",
  4: "Rechazada",
  5: "Reabierta",
};

function notificarMantenimiento(destinos, datos) {
  [...new Set(destinos.filter(Boolean))].forEach((loginDestino) => {
    crearNotificacion({ ...datos, loginDestino }).catch((error) =>
      console.error("[Notificación MNT]:", error.message),
    );
  });
}

async function ejecutarNotificacion(tarea) {
  try {
    await tarea();
  } catch (error) {
    console.error("[Notificación MNT]:", error.message);
  }
}

// ── Catálogos ─────────────────────────────────────────────────
async function getCatalogos(req, res) {
  try {
    res.json(await svc.getCatalogos());
  } catch (err) {
    console.error("[MNT] getCatalogos:", err.message);
    res.status(500).json({ error: "Error al obtener catálogos" });
  }
}

async function getAreasPorSitio(req, res) {
  try {
    res.json(await svc.getAreasPorSitio(req.params.codigoSitio));
  } catch (err) {
    console.error("[MNT] getAreasPorSitio:", err.message);
    res.status(500).json({ error: "Error al obtener áreas" });
  }
}

async function getPersonal(req, res) {
  try {
    res.json(await svc.getPersonal(req.query.tipo));
  } catch (err) {
    console.error("[MNT] getPersonal:", err.message);
    res.status(500).json({ error: "Error al obtener personal" });
  }
}

async function getSitiosBandeja(req, res) {
  try {
    res.json(await svc.getSitiosBandeja());
  } catch (err) {
    console.error("[MNT] getSitiosBandeja:", err.message);
    res.status(500).json({ error: "Error al obtener sitios" });
  }
}

// ── Solicitudes usuario ───────────────────────────────────────
async function validarNuevaSolicitud(req, res, next) {
  try {
    const validacion = await svc.validarNuevaSolicitud(req.user.login);
    if (!validacion.permitido) {
      return res.status(409).json({
        error: `Tienes ${validacion.pendientes} solicitudes pendientes de calificar. Califícalas antes de crear una nueva solicitud.`,
      });
    }
    next();
  } catch (err) {
    console.error("[MNT] validarNuevaSolicitud:", err.message);
    res.status(500).json({ error: "No fue posible validar las solicitudes pendientes" });
  }
}

async function postSolicitud(req, res) {
  try {
    const { login, sitio } = req.user;
    const {
      idServicio,
      ubicacionDetalle,
      descripcion,
      area,
      codigoDepartamento,
    } = req.body;

    if (!idServicio || !ubicacionDetalle || !descripcion) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const solicitud = await svc.crearSolicitud({
      login,
      sitio,
      area: codigoDepartamento || area,
      idServicio: Number(idServicio),
      ubicacionDetalle: ubicacionDetalle.trim(),
      descripcion: descripcion.trim(),
    });

    if (req.files?.length) {
      await svc.guardarArchivos(solicitud.idSolicitud, 1, login, req.files);
    }

    enviarCorreoSolicitudMantenimiento({
      folio: solicitud.folio,
      solicitante: req.user.name || req.user.nombre || login,
      servicio: solicitud.servicio,
      sitio,
      area: codigoDepartamento || area,
      ubicacion: ubicacionDetalle.trim(),
      descripcion: descripcion.trim(),
    }).catch((error) =>
      console.error("[mailer] solicitudMantenimiento:", error.message),
    );

    res.status(201).json(solicitud);
  } catch (err) {
    console.error("[MNT] postSolicitud:", err.message);
    res.status(500).json({ error: "Error al crear solicitud" });
  }
}

async function getMisSolicitudes(req, res) {
  try {
    res.json(await svc.getMisSolicitudes(req.user.login));
  } catch (err) {
    console.error("[MNT] getMisSolicitudes:", err.message);
    res.status(500).json({ error: "Error al obtener solicitudes" });
  }
}

async function getDetalle(req, res) {
  try {
    const { login, esMto } = req.user;
    const data = await svc.getDetalleSolicitud(
      Number(req.params.id),
      login,
      esMto,
    );
    res.json(data);
  } catch (err) {
    if (err.message === "FORBIDDEN")
      return res.status(403).json({ error: "Acceso denegado" });
    console.error("[MNT] getDetalle:", err.message);
    res.status(500).json({ error: "Error al obtener detalle" });
  }
}

// ── Bandeja Mantenimiento ─────────────────────────────────────
async function getBandeja(req, res) {
  try {
    if (!req.user.esMto)
      return res.status(403).json({ error: "Acceso denegado" });
    const { estatus, sitio, prioridad, tipoMantenimiento, busqueda } =
      req.query;
    res.json(
      await svc.getBandeja({
        login: req.user.login,
        estatus,
        sitio,
        prioridad,
        tipoMantenimiento,
        busqueda,
      }),
    );
  } catch (err) {
    console.error("[MNT] getBandeja:", err.message);
    res.status(500).json({ error: "Error al obtener bandeja" });
  }
}

// ── Cambio de estado ──────────────────────────────────────────
async function patchEstatus(req, res) {
  try {
    const { login, esMto } = req.user;
    const idSolicitud = Number(req.params.id);
    const {
      estatusNuevo,
      motivo,
      nota,
      tipoTrabajo,
      textoDiagnostico,
      fechaCompromiso,
      materialRequerido,
      personalMto,
      personalConstruccion,
      tipoActividad,
      tipoMantenimiento,
      origenEvento,
      actividadesRealizadas,
      observacionesCierre,
      fechaInicio,
      horaInicio,
      fechaTermino,
      horaTermino,
    } = req.body;

    if (!estatusNuevo && estatusNuevo !== 0) {
      return res.status(400).json({ error: "estatusNuevo es requerido" });
    }

    // Multer entrega un solo campo repetible como string y varios como arreglo.
    // Normalizamos ambos casos para no perder al único participante seleccionado.
    const normalizarIds = (valor) => {
      if (valor === undefined || valor === null || valor === "") return [];
      let valores = Array.isArray(valor) ? valor : [valor];
      if (valores.length === 1 && typeof valores[0] === "string") {
        const texto = valores[0].trim();
        if (texto.startsWith("[")) {
          try {
            const parsed = JSON.parse(texto);
            valores = Array.isArray(parsed) ? parsed : [parsed];
          } catch (_) {
            valores = [texto];
          }
        }
      }
      return valores.map(Number).filter(Number.isFinite);
    };

    const result = await svc.cambiarEstatus({
      idSolicitud,
      login,
      esMto,
      estatusNuevo: Number(estatusNuevo),
      motivo,
      nota,
      tipoTrabajo: tipoTrabajo ? Number(tipoTrabajo) : undefined,
      textoDiagnostico,
      fechaCompromiso,
      materialRequerido,
      personalMto: normalizarIds(personalMto),
      personalConstruccion: normalizarIds(personalConstruccion),
      tipoActividad: tipoActividad ? Number(tipoActividad) : undefined,
      tipoMantenimiento: tipoMantenimiento
        ? Number(tipoMantenimiento)
        : undefined,
      origenEvento: origenEvento ? Number(origenEvento) : undefined,
      actividadesRealizadas,
      observacionesCierre,
      fechaInicio,
      horaInicio,
      fechaTermino,
      horaTermino,
    });

    if (req.files?.length) {
      await svc.guardarArchivos(idSolicitud, 3, login, req.files);
    }

    void ejecutarNotificacion(async () => {
      const contexto = await svc.getContextoNotificacion(idSolicitud);
      if (!contexto || contexto.loginSolicitante === login) return;
      notificarMantenimiento([contexto.loginSolicitante], {
        loginOrigen: login,
        idTipo:
          Number(estatusNuevo) === 4
            ? TIPOS_NOTIFICACION.RECHAZADO
            : Number(estatusNuevo) === 3
              ? TIPOS_NOTIFICACION.TICKET_CERRADO
              : TIPOS_NOTIFICACION.ESTATUS_CAMBIO,
        idSolicitud,
        titulo: `Actualización ${contexto.folio}`,
        descripcion: `Tu solicitud cambió a ${ETIQUETAS_MNT[Number(estatusNuevo)] || "un nuevo estado"}.`,
        urlDestino: "/mantenimiento",
      });
    });

    res.json(result);
  } catch (err) {
    if (err.message === "FORBIDDEN")
      return res.status(403).json({ error: "Acceso denegado" });
    if (err.message.startsWith("Transición no permitida"))
      return res.status(400).json({ error: err.message });
    console.error("[MNT] patchEstatus:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ── Visto bueno ───────────────────────────────────────────────
async function postVistoBueno(req, res) {
  try {
    const { login } = req.user;
    const {
      evaluacion,
      observacion,
      calificacionAtencion,
      calificacionServicio,
    } = req.body;
    if (!evaluacion)
      return res.status(400).json({ error: "evaluacion es requerida" });
    const evaluacionNumero = Number(evaluacion);
    const result = await svc.registrarVistoBueno({
      idSolicitud: Number(req.params.id),
      login,
      evaluacion: evaluacionNumero,
      observacion,
      calificacionAtencion: Number(calificacionAtencion) || null,
      calificacionServicio: Number(calificacionServicio) || null,
    });

    void ejecutarNotificacion(async () => {
      const contexto = await svc.getContextoNotificacion(Number(req.params.id));
      if (!contexto) return;
      const destinos = [
        contexto.loginTecnico,
        ...contexto.loginsMantenimiento,
      ];
      notificarMantenimiento(destinos.filter((destino) => destino !== login), {
        loginOrigen: login,
        idTipo:
          evaluacionNumero === 2
            ? TIPOS_NOTIFICACION.TICKET_REABIERTO
            : TIPOS_NOTIFICACION.EVALUACION_RECIBIDA,
        idSolicitud: Number(req.params.id),
        titulo:
          evaluacionNumero === 2
            ? `Solicitud reabierta ${contexto.folio}`
            : `Visto bueno recibido ${contexto.folio}`,
        descripcion:
          evaluacionNumero === 2
            ? "El usuario no quedó conforme y solicitó seguimiento adicional."
            : "El usuario calificó el trabajo y cerró la solicitud.",
        urlDestino: "/mantenimiento",
      });
    });

    if (evaluacionNumero === 2) {
      enviarCorreoReaperturaMantenimiento({
        folio: result.folio,
        solicitante: result.nombreSolicitante || login,
        servicio: result.servicio,
        motivo: observacion,
      }).catch((error) =>
        console.error("[mailer] reaperturaMantenimiento:", error.message),
      );
    }

    res.json(result);
  } catch (err) {
    if (err.message === "FORBIDDEN")
      return res.status(403).json({ error: "Acceso denegado" });
    console.error("[MNT] postVistoBueno:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ── Mensajes ──────────────────────────────────────────────────
async function getMensajes(req, res) {
  try {
    res.json(await svc.getMensajes(Number(req.params.id)));
  } catch (err) {
    console.error("[MNT] getMensajes:", err.message);
    res.status(500).json({ error: "Error al obtener mensajes" });
  }
}

async function postMensaje(req, res) {
  try {
    const { login } = req.user;
    const { mensaje } = req.body;
    if (!mensaje?.trim())
      return res.status(400).json({ error: "El mensaje no puede estar vacío" });
    const result = await svc.enviarMensaje({
      idSolicitud: Number(req.params.id),
      login,
      mensaje,
    });
    void ejecutarNotificacion(async () => {
      const contexto = await svc.getContextoNotificacion(Number(req.params.id));
      if (!contexto) return;
      const destinos = req.user.esMto
        ? [contexto.loginSolicitante]
        : [contexto.loginTecnico, ...contexto.loginsMantenimiento];
      notificarMantenimiento(destinos.filter((destino) => destino !== login), {
        loginOrigen: login,
        idTipo: TIPOS_NOTIFICACION.COMENTARIO_NUEVO,
        idSolicitud: Number(req.params.id),
        titulo: `Nuevo mensaje ${contexto.folio}`,
        descripcion: `${req.user.name || req.user.nombre || login} envió un mensaje en la solicitud de mantenimiento.`,
        urlDestino: "/mantenimiento",
      });
    });
    res.status(201).json(result);
  } catch (err) {
    console.error("[MNT] postMensaje:", err.message);
    res.status(400).json({ error: err.message });
  }
}

// ── Participantes ─────────────────────────────────────────────
async function postParticipante(req, res) {
  try {
    const { esMto } = req.user;
    const { idPersonal, tipoParticipacion } = req.body;
    if (!idPersonal || !tipoParticipacion)
      return res
        .status(400)
        .json({ error: "idPersonal y tipoParticipacion son requeridos" });
    res.status(201).json(
      await svc.agregarParticipante({
        idSolicitud: Number(req.params.id),
        idPersonal: Number(idPersonal),
        tipoParticipacion: Number(tipoParticipacion),
        esMto,
      }),
    );
  } catch (err) {
    if (err.message === "FORBIDDEN")
      return res.status(403).json({ error: "Acceso denegado" });
    console.error("[MNT] postParticipante:", err.message);
    res.status(500).json({ error: "Error al agregar participante" });
  }
}

async function deleteParticipante(req, res) {
  try {
    const { esMto } = req.user;
    res.json(
      await svc.eliminarParticipante({
        idParticipante: Number(req.params.idParticipante),
        esMto,
      }),
    );
  } catch (err) {
    if (err.message === "FORBIDDEN")
      return res.status(403).json({ error: "Acceso denegado" });
    console.error("[MNT] deleteParticipante:", err.message);
    res.status(500).json({ error: "Error al eliminar participante" });
  }
}

module.exports = {
  getCatalogos,
  getAreasPorSitio,
  getPersonal,
  getSitiosBandeja,
  validarNuevaSolicitud,
  postSolicitud,
  getMisSolicitudes,
  getDetalle,
  getBandeja,
  patchEstatus,
  postVistoBueno,
  getMensajes,
  postMensaje,
  postParticipante,
  deleteParticipante,
};
