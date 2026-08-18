// solicitudesAdmin.service.js — v5
// Cambios respecto a v4:
//   - asignar(): registra bitácora automática
//   - cambiarEstatus(): valida responsable en TODOS los estados operativos,
//     maneja estado 6 (En pausa): acumula tiempoTotalPausaMin,
//     al pasar a "En proceso" (2) registra fechaInicioResolucion si es la primera vez,
//     al reanudarse descuenta tiempo de pausa, registra bitácora automática en cada cambio
//   - getSolicitudDetalle(): incluye fechaInicioResolucion, tiempoTotalPausaMin, fechaUltimaPausa
//   - getSolicitudes(): idem
//   - transferir(): registra bitácora automática
"use strict";

const { getPool, sql } = require("../db");
const { crearNotificacion, TIPOS } = require("./notificaciones.service");

// ── Nombres de estatus para bitácora ─────────────────────────
const ESTATUS_TEXTO = {
  1: "Abierto",
  2: "En proceso",
  3: "Resuelto",
  4: "Cerrado",
  5: "Cancelado",
  6: "En pausa",
  7: "En diagnóstico",
  8: "Escalado",
};

// ── Helper: insertar en bitácora ──────────────────────────────
async function _bitacora(pool, idSolicitud, idUsuario, nombreUsuario, nota) {
  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("idUsuario", sql.VarChar(255), idUsuario)
    .input("nombreUsuario", sql.NVarChar(200), nombreUsuario)
    .input("nota", sql.NVarChar(sql.MAX), nota).query(`
      INSERT INTO solicitudTI_bitacora (idSolicitud, idUsuario, nombreUsuario, nota, fecha)
      VALUES (@idSolicitud, @idUsuario, @nombreUsuario, @nota, GETDATE())
    `);
}

async function getKPIs() {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT
      SUM(CASE WHEN idEstatus = 1 THEN 1 ELSE 0 END) AS abiertas,
      SUM(CASE WHEN idEstatus = 2 THEN 1 ELSE 0 END) AS enProgreso,
      SUM(CASE WHEN tecnicoAsignado IS NULL AND idEstatus NOT IN (3,4,5) THEN 1 ELSE 0 END) AS sinAsignar,
      SUM(CASE WHEN fechaLimiteResp < DATEADD(HOUR,2,GETDATE()) AND idEstatus NOT IN (3,4,5,6) THEN 1 ELSE 0 END) AS proximasVencer,
      SUM(CASE WHEN fechaLimiteResp < GETDATE() AND idEstatus NOT IN (3,4,5,6) THEN 1 ELSE 0 END) AS vencidas,
      SUM(CASE WHEN idEstatus = 3 AND CAST(fechaResolucion AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS resueltasHoy
    FROM solicitudTI
    WHERE idServicio != 2
  `);
  return res.recordset[0];
}

async function getSolicitudes({
  estatus,
  prioridad,
  categoria,
  tecnico,
  busqueda,
  fechaDesde,
  fechaHasta,
  pagina = 1,
  porPagina = 10,
}) {
  const pool = await getPool();
  const r = pool.request();
  const offset = (pagina - 1) * porPagina;

  let where = "WHERE s.idServicio != 2";

  if (estatus) {
    r.input("estatus", sql.Int, parseInt(estatus));
    where += " AND s.idEstatus = @estatus";
  }
  if (prioridad) {
    r.input("prioridad", sql.Int, parseInt(prioridad));
    where += " AND s.idPrioridad = @prioridad";
  }
  if (categoria) {
    r.input("categoria", sql.VarChar(100), categoria);
    where += " AND sv.idServicio = @categoria";
  }
  if (tecnico) {
    r.input("tecnico", sql.VarChar(255), tecnico);
    where += " AND s.tecnicoAsignado = @tecnico";
  }
  if (busqueda) {
    r.input("busqueda", sql.VarChar(300), `%${busqueda}%`);
    where +=
      " AND (s.folio LIKE @busqueda OR s.nombreUsuario LIKE @busqueda OR s.titulo LIKE @busqueda)";
  }
  if (fechaDesde) {
    r.input("fechaDesde", sql.VarChar(20), fechaDesde);
    where += " AND CAST(s.fechaCreacion AS DATE) >= @fechaDesde";
  }
  if (fechaHasta) {
    r.input("fechaHasta", sql.VarChar(20), fechaHasta);
    where += " AND CAST(s.fechaCreacion AS DATE) <= @fechaHasta";
  }

  r.input("offset", sql.Int, offset).input("porPagina", sql.Int, porPagina);

  const res = await r.query(`
    SELECT
      s.idSolicitud, s.folio, s.titulo, s.descripcion,
      s.idUsuario, s.nombreUsuario, s.areaUsuario, s.sitioUsuario,
      s.tecnicoAsignado, s.nombreTecnico,
      s.slaRespuestaHrs, s.slaResolucionHrs,
      sv.slaRespuestaMin, sv.slaResolucionMin,
      s.fechaLimiteResp, s.fechaLimiteResol,
      s.fechaCreacion, s.fechaActualizacion, s.fechaResolucion,
      s.tiempoAtencionMin, s.escalaA,
      s.fechaInicioResolucion, s.tiempoTotalPausaMin, s.fechaUltimaPausa,
      e.idEstatus, e.estatus,
      sv.idServicio, sv.nombre AS servicio, sv.icono AS servicioIcono,
      ISNULL(svp.nombre, 'General TI') AS categoria,
      p.idPrioridad, p.prioridad, p.colorHex AS prioColor,
      u.email AS correoUsuario,
      COUNT(*) OVER() AS totalRegistros
    FROM solicitudTI s
    JOIN cat_estatusTI  e    ON e.idEstatus   = s.idEstatus
    JOIN cat_servicioTI sv   ON sv.idServicio  = s.idServicio
    LEFT JOIN cat_servicioTI svp ON svp.idServicio = sv.idServicioPadre
    JOIN cat_prioridad  p    ON p.idPrioridad  = s.idPrioridad
    LEFT JOIN sec_users u    ON u.login        = s.idUsuario
    ${where}
    ORDER BY s.fechaCreacion DESC
    OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY
  `);

  return {
    data: res.recordset,
    total: res.recordset[0]?.totalRegistros ?? 0,
    pagina,
    porPagina,
  };
}

async function getSolicitudDetalle(idSolicitud) {
  const pool = await getPool();

  const solRes = await pool.request().input("idSolicitud", sql.Int, idSolicitud)
    .query(`
    SELECT
      s.idSolicitud, s.folio, s.titulo, s.descripcion,
      s.idUsuario, s.nombreUsuario, s.areaUsuario, s.sitioUsuario,
      s.tecnicoAsignado, s.nombreTecnico,
      s.slaRespuestaHrs, s.slaResolucionHrs,
      sv.slaRespuestaMin, sv.slaResolucionMin,
      s.fechaLimiteResp, s.fechaLimiteResol,
      s.fechaCreacion, s.fechaActualizacion, s.fechaResolucion,
      s.tiempoAtencionMin, s.escalaA,
      s.fechaInicioResolucion, s.tiempoTotalPausaMin, s.fechaUltimaPausa,
      e.idEstatus, e.estatus,
      sv.idServicio, sv.nombre AS servicio, sv.icono AS servicioIcono,
      ISNULL(svp.nombre, 'General TI') AS categoria,
      p.idPrioridad, p.prioridad, p.colorHex AS prioColor,
      u.email AS correoUsuario
    FROM solicitudTI s
    JOIN cat_estatusTI  e    ON e.idEstatus   = s.idEstatus
    JOIN cat_servicioTI sv   ON sv.idServicio  = s.idServicio
    LEFT JOIN cat_servicioTI svp ON svp.idServicio = sv.idServicioPadre
    JOIN cat_prioridad  p    ON p.idPrioridad  = s.idPrioridad
    LEFT JOIN sec_users u    ON u.login        = s.idUsuario
    WHERE s.idSolicitud = @idSolicitud
      AND s.idServicio != 2
  `);

  if (!solRes.recordset.length) return null;

  const archRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud).query(`
    SELECT idArchivo, nombreArchivo, rutaServidor, mimeType, tamanoBytes, fechaSubida
    FROM solicitudTI_archivos WHERE idSolicitud = @idSolicitud ORDER BY fechaSubida
  `);

  const comRes = await pool.request().input("idSolicitud", sql.Int, idSolicitud)
    .query(`
    SELECT idComentario, idUsuario, nombreUsuario, esInterno, comentario, fecha
    FROM solicitudTI_comentarios WHERE idSolicitud = @idSolicitud ORDER BY fecha ASC
  `);

  // Bitácora = seguimiento completo (automático + manual)
  const bitRes = await pool.request().input("idSolicitud", sql.Int, idSolicitud)
    .query(`
    SELECT idBitacora, idUsuario, nombreUsuario, nota, fecha
    FROM solicitudTI_bitacora WHERE idSolicitud = @idSolicitud ORDER BY fecha ASC
  `);

  const evalRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud).query(`
    SELECT TOP 1 calificacion, comentario, fechaRegistro AS fecha
    FROM solicitudTI_evaluacion
    WHERE idSolicitud = @idSolicitud
    ORDER BY fechaRegistro DESC
  `);

  const ev = evalRes.recordset[0];
  return {
    ...solRes.recordset[0],
    archivos: archRes.recordset,
    comentarios: comRes.recordset,
    bitacora: bitRes.recordset,
    evaluacion: ev
      ? {
          estrellas: ev.calificacion,
          comentario: ev.comentario,
          fecha: ev.fecha,
        }
      : null,
  };
}

async function asignar(idSolicitud, tecnicoLogin, nombreTecnico) {
  const pool = await getPool();

  const solRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT folio, titulo, idUsuario FROM solicitudTI WHERE idSolicitud = @idSolicitud AND idServicio != 2`,
    );
  const sol = solRes.recordset[0];

  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("tecnicoAsignado", sql.VarChar(255), tecnicoLogin)
    .input("nombreTecnico", sql.NVarChar(200), nombreTecnico).query(`
      UPDATE solicitudTI
      SET tecnicoAsignado    = @tecnicoAsignado,
          nombreTecnico      = @nombreTecnico,
          fechaActualizacion = GETDATE()
      WHERE idSolicitud = @idSolicitud
    `);

  // Bitácora automática de asignación
  await _bitacora(
    pool,
    idSolicitud,
    tecnicoLogin,
    nombreTecnico,
    `Ticket asignado a ${nombreTecnico}`,
  );

  if (sol) {
    await crearNotificacion({
      loginDestino: sol.idUsuario,
      loginOrigen: tecnicoLogin,
      idTipo: TIPOS.TICKET_ASIGNADO,
      idSolicitud,
      titulo: "Solicitud asignada",
      descripcion: `Tu solicitud fue asignada a ${nombreTecnico}.`,
      urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${sol.folio}&tab=detalle`,
    });
  }
}

async function cambiarEstatus(
  idSolicitud,
  idEstatus,
  loginSolicitante,
  nombreSolicitante,
) {
  const pool = await getPool();

  // Leer estado actual y datos necesarios
  const check = await pool.request().input("id", sql.Int, idSolicitud).query(`
      SELECT tecnicoAsignado, nombreTecnico, idEstatus AS estatusActual,
             fechaInicioResolucion, tiempoTotalPausaMin, fechaUltimaPausa,
             folio, idUsuario
      FROM solicitudTI WHERE idSolicitud = @id
    `);
  const row = check.recordset[0];
  if (!row) throw new Error("Solicitud no encontrada");

  const ESTADOS_OPERATIVOS = [2, 3, 4, 5, 6, 7, 8];
  const esCancelacion = idEstatus === 5;

  // Validar responsable para todos los estados operativos excepto cancelación
  if (ESTADOS_OPERATIVOS.includes(idEstatus) && !esCancelacion) {
    if (!row.tecnicoAsignado) {
      return {
        ok: false,
        code: "SIN_ASIGNAR",
        message:
          "Asigna un responsable antes de realizar acciones sobre este ticket.",
      };
    }
  }

  // Validar que solo el técnico asignado opere (excepto cancelación y estatus admin)
  if (
    [2, 3, 6].includes(idEstatus) &&
    loginSolicitante &&
    row.tecnicoAsignado
  ) {
    if (row.tecnicoAsignado !== loginSolicitante) {
      return {
        ok: false,
        code: "NO_ASIGNADO",
        message: "Este ticket está asignado a otro ingeniero.",
      };
    }
  }

  const estatusAnteriorTexto =
    ESTATUS_TEXTO[row.estatusActual] ?? `Estatus ${row.estatusActual}`;
  const estatusNuevoTexto = ESTATUS_TEXTO[idEstatus] ?? `Estatus ${idEstatus}`;

  // ── Lógica de tiempos según nuevo estatus ──────────────────
  let setSql = `
    idEstatus          = @idEstatus,
    fechaActualizacion = GETDATE()
  `;

  // Pasar a "En proceso" (2): registrar fechaInicioResolucion si es la primera vez
  // y descontar tiempo de pausa si venía de pausa (6)
  if (idEstatus === 2) {
    if (!row.fechaInicioResolucion) {
      // Primera vez que entra a En proceso
      setSql += `, fechaInicioResolucion = GETDATE()`;
    }
    if (row.estatusActual === 6 && row.fechaUltimaPausa) {
      // Venía de pausa: acumular minutos de pausa y limpiar fechaUltimaPausa
      setSql += `,
        tiempoTotalPausaMin = ISNULL(tiempoTotalPausaMin, 0) + DATEDIFF(MINUTE, fechaUltimaPausa, GETDATE()),
        fechaUltimaPausa    = NULL
      `;
    }
  }

  // Pasar a "En pausa" (6): registrar momento de inicio de pausa
  if (idEstatus === 6) {
    setSql += `, fechaUltimaPausa = GETDATE()`;
  }

  // Pasar a Resuelto (3) o Cerrado (4): calcular tiempoAtencionMin descontando pausas
  if (idEstatus === 3 || idEstatus === 4) {
    // tiempoAtencionMin = minutos desde fechaInicioResolucion (o fechaCreacion) - pausas acumuladas
    setSql += `,
      fechaResolucion   = GETDATE(),
      tiempoAtencionMin = (
        CASE
          WHEN fechaInicioResolucion IS NOT NULL
          THEN DATEDIFF(MINUTE, fechaInicioResolucion, GETDATE()) - ISNULL(tiempoTotalPausaMin, 0)
          ELSE DATEDIFF(MINUTE, fechaCreacion, GETDATE()) - ISNULL(tiempoTotalPausaMin, 0)
        END
      ),
      fechaUltimaPausa = NULL
    `;
  }

  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("idEstatus", sql.Int, idEstatus)
    .query(`UPDATE solicitudTI SET ${setSql} WHERE idSolicitud = @idSolicitud`);

  // Bitácora automática
  let notaBitacora;
  if (idEstatus === 6) {
    notaBitacora = `Ticket puesto en pausa (estado anterior: ${estatusAnteriorTexto})`;
  } else if (row.estatusActual === 6 && idEstatus === 2) {
    notaBitacora = `Ticket reanudado`;
  } else if (idEstatus === 3) {
    notaBitacora = `Ticket resuelto`;
  } else if (idEstatus === 4) {
    notaBitacora = `Ticket cerrado`;
  } else {
    notaBitacora = `Estado cambiado de "${estatusAnteriorTexto}" a "${estatusNuevoTexto}"`;
  }

  const usuarioLog = loginSolicitante ?? "sistema";
  const nombreLog = nombreSolicitante ?? row.nombreTecnico ?? "Sistema";
  await _bitacora(pool, idSolicitud, usuarioLog, nombreLog, notaBitacora);

  // Notificación al usuario
  const tipoMap = {
    3: TIPOS.TICKET_CERRADO,
    4: TIPOS.TICKET_CERRADO,
    5: TIPOS.RECHAZADO,
  };
  const idTipo = tipoMap[idEstatus] ?? TIPOS.ESTATUS_CAMBIO;

  if (row.idUsuario && row.idUsuario !== loginSolicitante) {
    try {
      await crearNotificacion({
        loginDestino: row.idUsuario,
        loginOrigen: loginSolicitante,
        idTipo,
        idSolicitud,
        titulo: "Estatus actualizado",
        descripcion: `Tu solicitud cambió a "${estatusNuevoTexto}".`,
        urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${row.folio}&tab=detalle`,
      });
    } catch (e) {
      console.error("[Notif] cambiarEstatus:", e.message);
    }
  }

  return { ok: true };
}

async function escalar(
  idSolicitud,
  escalaA,
  comentario,
  loginUsuario,
  nombreUsuario,
) {
  const pool = await getPool();

  // Validar responsable
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `SELECT tecnicoAsignado, idUsuario, folio FROM solicitudTI WHERE idSolicitud = @id`,
    );
  const row = check.recordset[0];
  if (!row) throw new Error("Solicitud no encontrada");
  if (!row.tecnicoAsignado) {
    return {
      ok: false,
      code: "SIN_ASIGNAR",
      message: "Asigna un responsable antes de escalar el ticket.",
    };
  }

  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("escalaA", sql.NVarChar(200), escalaA).query(`
      UPDATE solicitudTI
      SET idEstatus = 8, escalaA = @escalaA, fechaActualizacion = GETDATE()
      WHERE idSolicitud = @idSolicitud
    `);

  const notaBitacora = comentario?.trim()
    ? `Escalado a ${escalaA}. Motivo: ${comentario.trim()}`
    : `Escalado a ${escalaA}.`;

  await _bitacora(pool, idSolicitud, loginUsuario, nombreUsuario, notaBitacora);

  if (row.idUsuario) {
    await crearNotificacion({
      loginDestino: row.idUsuario,
      loginOrigen: loginUsuario,
      idTipo: TIPOS.ESCALADO,
      idSolicitud,
      titulo: "Solicitud escalada",
      descripcion: `Tu solicitud fue escalada a ${escalaA}.`,
      urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${row.folio}&tab=historial`,
    });
  }

  return { ok: true };
}

async function cambiarPrioridad(idSolicitud, idPrioridad) {
  const pool = await getPool();

  const pr = await pool
    .request()
    .input("idPrioridad", sql.Int, idPrioridad)
    .query(
      "SELECT slaRespuestaHrs, slaResolucionHrs, prioridad FROM cat_prioridad WHERE idPrioridad = @idPrioridad",
    );
  if (!pr.recordset.length) throw new Error("Prioridad no encontrada");
  const { slaRespuestaHrs, slaResolucionHrs, prioridad } = pr.recordset[0];

  const solRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT folio, idUsuario, tecnicoAsignado FROM solicitudTI WHERE idSolicitud = @idSolicitud`,
    );
  const sol = solRes.recordset[0];

  // Validar responsable
  if (!sol?.tecnicoAsignado) {
    return {
      ok: false,
      code: "SIN_ASIGNAR",
      message: "Asigna un responsable antes de cambiar la prioridad.",
    };
  }

  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("idPrioridad", sql.Int, idPrioridad)
    .input("slaRespuestaHrs", sql.Int, slaRespuestaHrs)
    .input("slaResolucionHrs", sql.Int, slaResolucionHrs).query(`
      UPDATE solicitudTI
      SET idPrioridad        = @idPrioridad,
          slaRespuestaHrs    = @slaRespuestaHrs,
          slaResolucionHrs   = @slaResolucionHrs,
          fechaLimiteResp    = DATEADD(HOUR, @slaRespuestaHrs,  fechaCreacion),
          fechaLimiteResol   = DATEADD(HOUR, @slaResolucionHrs, fechaCreacion),
          fechaActualizacion = GETDATE()
      WHERE idSolicitud = @idSolicitud
    `);

  if (sol) {
    await crearNotificacion({
      loginDestino: sol.idUsuario,
      idTipo: TIPOS.PRIORIDAD_CAMBIO,
      idSolicitud,
      titulo: "Prioridad actualizada",
      descripcion: `La prioridad de tu solicitud cambió a "${prioridad}".`,
      urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${sol.folio}&tab=detalle`,
    });
  }

  return { ok: true };
}

async function agregarComentario(
  idSolicitud,
  idUsuario,
  nombreUsuario,
  esInterno,
  comentario,
) {
  const pool = await getPool();

  const solRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT folio, idUsuario FROM solicitudTI WHERE idSolicitud = @idSolicitud`,
    );
  const sol = solRes.recordset[0];

  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("idUsuario", sql.VarChar(255), idUsuario)
    .input("nombreUsuario", sql.NVarChar(200), nombreUsuario)
    .input("esInterno", sql.Bit, esInterno ? 1 : 0)
    .input("comentario", sql.NVarChar(sql.MAX), comentario).query(`
      INSERT INTO solicitudTI_comentarios (idSolicitud, idUsuario, nombreUsuario, esInterno, comentario)
      VALUES (@idSolicitud, @idUsuario, @nombreUsuario, @esInterno, @comentario)
    `);

  if (!esInterno && sol && sol.idUsuario !== idUsuario) {
    await crearNotificacion({
      loginDestino: sol.idUsuario,
      loginOrigen: idUsuario,
      idTipo: TIPOS.COMENTARIO_NUEVO,
      idSolicitud,
      titulo: "Nuevo comentario en tu solicitud",
      descripcion: `${nombreUsuario}: "${comentario.substring(0, 80)}${comentario.length > 80 ? "…" : ""}"`,
      urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${sol.folio}&tab=comentarios`,
    });
  }
}

// agregarBitacora: también sirve para actividades manuales desde la pestaña Seguimiento
async function agregarBitacora(idSolicitud, idUsuario, nombreUsuario, nota) {
  const pool = await getPool();
  await _bitacora(pool, idSolicitud, idUsuario, nombreUsuario, nota);
}

async function getTecnicosSistemas() {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT login, name FROM sec_users WHERE area = 'SISTEMAS' AND active = 'Y' ORDER BY name
  `);
  return res.recordset;
}

async function transferir(
  idSolicitud,
  tecnicoLogin,
  nombreTecnico,
  loginUsuario,
  nombreUsuario,
) {
  const pool = await getPool();
  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("tecnicoAsignado", sql.VarChar(255), tecnicoLogin)
    .input("nombreTecnico", sql.NVarChar(200), nombreTecnico).query(`
      UPDATE solicitudTI
      SET tecnicoAsignado    = @tecnicoAsignado,
          nombreTecnico      = @nombreTecnico,
          fechaActualizacion = GETDATE()
      WHERE idSolicitud = @idSolicitud
    `);

  await _bitacora(
    pool,
    idSolicitud,
    loginUsuario ?? tecnicoLogin,
    nombreUsuario ?? nombreTecnico,
    `Ticket transferido a ${nombreTecnico}`,
  );
}

module.exports = {
  getKPIs,
  getSolicitudes,
  getSolicitudDetalle,
  asignar,
  cambiarEstatus,
  cambiarPrioridad,
  agregarComentario,
  agregarBitacora,
  getTecnicosSistemas,
  transferir,
  escalar,
};
