"use strict";

const { getPool, sql } = require("../db");
const {
  crearNotificacion,
  TIPOS: _TIPOS,
} = require("./notificaciones.service");

// Normalizar TIPOS — si alguna key no existe en notificaciones.service, usar el ID numérico directo
// Esto previene que idTipo sea undefined/null y cause errores en DB
const TIPOS = {
  TICKET_ASIGNADO: _TIPOS?.TICKET_ASIGNADO ?? _TIPOS?.ASIGNADO ?? 2,
  ESTATUS_CAMBIO: _TIPOS?.ESTATUS_CAMBIO ?? _TIPOS?.CAMBIO_ESTATUS ?? 3,
  TICKET_CERRADO: _TIPOS?.TICKET_CERRADO ?? _TIPOS?.CERRADO ?? 4,
  RECHAZADO: _TIPOS?.RECHAZADO ?? _TIPOS?.CANCELADO ?? 5,
  ESCALADO: _TIPOS?.ESCALADO ?? 8,
  PRIORIDAD_CAMBIO: _TIPOS?.PRIORIDAD_CAMBIO ?? _TIPOS?.PRIORIDAD ?? 9,
  COMENTARIO_NUEVO: _TIPOS?.COMENTARIO_NUEVO ?? _TIPOS?.NUEVO_COMENTARIO ?? 6,
};

// Guard: nunca llamar crearNotificacion con idTipo undefined/null
async function _notificar(args) {
  if (!args.idTipo) return; // silently skip — evita el error de columna NOT NULL
  try {
    await crearNotificacion(args);
  } catch (e) {
    console.error("[Notif]", e.message);
  }
}

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

async function _bitacora(pool, idSolicitud, idUsuario, nombreUsuario, nota) {
  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("idUsuario", sql.VarChar(255), idUsuario)
    .input("nombreUsuario", sql.NVarChar(200), nombreUsuario)
    .input("nota", sql.NVarChar(sql.MAX), nota)
    .query(`INSERT INTO solicitudTI_bitacora (idSolicitud, idUsuario, nombreUsuario, nota, fecha)
            VALUES (@idSolicitud, @idUsuario, @nombreUsuario, @nota, GETDATE())`);
}

async function getKPIs() {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT
      SUM(CASE WHEN idEstatus = 1 THEN 1 ELSE 0 END) AS abiertas,
      SUM(CASE WHEN idEstatus = 2 THEN 1 ELSE 0 END) AS enProgreso,
      SUM(CASE WHEN tecnicoAsignado IS NULL AND idEstatus NOT IN (3,4,5) THEN 1 ELSE 0 END) AS sinAsignar,
      SUM(CASE WHEN fechaLimiteResp BETWEEN GETDATE() AND DATEADD(HOUR,2,GETDATE()) AND idEstatus NOT IN (3,4,5,6) THEN 1 ELSE 0 END) AS proximasVencer,
      SUM(CASE WHEN fechaLimiteResp < GETDATE() AND idEstatus NOT IN (3,4,5,6) THEN 1 ELSE 0 END) AS vencidas,
      SUM(CASE WHEN idEstatus = 3 AND CAST(fechaResolucion AS DATE) = CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS resueltasHoy
    FROM solicitudTI WHERE idServicio != 2
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

  if (estatus === "sinasignar") {
    where += " AND s.tecnicoAsignado IS NULL AND s.idEstatus NOT IN (3,4,5)";
  } else if (estatus === "porvencer") {
    where +=
      " AND s.fechaLimiteResp BETWEEN GETDATE() AND DATEADD(HOUR,2,GETDATE()) AND s.idEstatus NOT IN (3,4,5,6)";
  } else if (estatus === "vencidas") {
    where +=
      " AND s.fechaLimiteResp < GETDATE() AND s.idEstatus NOT IN (3,4,5,6)";
  } else if (estatus === "resueltashoy") {
    where +=
      " AND s.idEstatus = 3 AND CAST(s.fechaResolucion AS DATE) = CAST(GETDATE() AS DATE)";
  } else if (estatus) {
    const n = parseInt(estatus);
    if (!isNaN(n)) {
      r.input("estatus", sql.Int, n);
      where += " AND s.idEstatus = @estatus";
    }
  }

  if (prioridad) {
    r.input("prioridad", sql.Int, parseInt(prioridad));
    where += " AND s.idPrioridad = @prioridad";
  }
  if (categoria) {
    r.input("categoria", sql.VarChar(100), categoria);
    where += " AND sv.idServicio = @categoria";
  }
  if (tecnico && tecnico !== "sinasignar") {
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
    SELECT s.idSolicitud, s.folio, s.titulo, s.descripcion,
      s.idUsuario, s.nombreUsuario, s.areaUsuario, s.sitioUsuario,
      s.tecnicoAsignado, s.nombreTecnico,
      s.slaRespuestaHrs, s.slaResolucionHrs,
      sv.slaRespuestaMin, sv.slaResolucionMin,
      s.fechaLimiteResp, s.fechaLimiteResol,
      s.fechaCreacion, s.fechaActualizacion, s.fechaResolucion,
      s.tiempoAtencionMin, s.escalaA,
      s.fechaInicioResolucion, s.tiempoTotalPausaMin, s.fechaUltimaPausa,
      s.fechaInicioEscalamiento, s.tiempoIngenieroMin, s.tiempoProveedorMin,
      s.accionesRealizadas,
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
    SELECT s.idSolicitud, s.folio, s.titulo, s.descripcion,
      s.idUsuario, s.nombreUsuario, s.areaUsuario, s.sitioUsuario,
      s.tecnicoAsignado, s.nombreTecnico,
      s.slaRespuestaHrs, s.slaResolucionHrs,
      sv.slaRespuestaMin, sv.slaResolucionMin,
      s.fechaLimiteResp, s.fechaLimiteResol,
      s.fechaCreacion, s.fechaActualizacion, s.fechaResolucion,
      s.tiempoAtencionMin, s.escalaA,
      s.fechaInicioResolucion, s.tiempoTotalPausaMin, s.fechaUltimaPausa,
      s.fechaInicioEscalamiento, s.tiempoIngenieroMin, s.tiempoProveedorMin,
      s.accionesRealizadas, s.motivoReapertura,
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
    WHERE s.idSolicitud = @idSolicitud AND s.idServicio != 2
  `);
  if (!solRes.recordset.length) return null;

  const archRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT idArchivo, nombreArchivo, rutaServidor, mimeType, tamanoBytes, fechaSubida FROM solicitudTI_archivos WHERE idSolicitud = @idSolicitud ORDER BY fechaSubida`,
    );
  const comRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT idComentario, idUsuario, nombreUsuario, esInterno, comentario, fecha FROM solicitudTI_comentarios WHERE idSolicitud = @idSolicitud ORDER BY fecha ASC`,
    );
  const bitRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT idBitacora, idUsuario, nombreUsuario, nota, fecha FROM solicitudTI_bitacora WHERE idSolicitud = @idSolicitud ORDER BY fecha ASC`,
    );

  // TODAS las evaluaciones históricas
  const evalRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT idEvaluacion, calificacion, comentario, fechaRegistro AS fecha FROM solicitudTI_evaluacion WHERE idSolicitud = @idSolicitud ORDER BY fechaRegistro ASC`,
    );
  const evaluaciones = evalRes.recordset.map((ev) => ({
    idEvaluacion: ev.idEvaluacion,
    estrellas: ev.calificacion,
    comentario: ev.comentario,
    fecha: ev.fecha,
  }));

  return {
    ...solRes.recordset[0],
    archivos: archRes.recordset,
    comentarios: comRes.recordset,
    bitacora: bitRes.recordset,
    evaluacion: evaluaciones.length
      ? evaluaciones[evaluaciones.length - 1]
      : null,
    evaluaciones,
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
    .input("nombreTecnico", sql.NVarChar(200), nombreTecnico)
    .query(
      `UPDATE solicitudTI SET tecnicoAsignado=@tecnicoAsignado, nombreTecnico=@nombreTecnico, fechaActualizacion=GETDATE() WHERE idSolicitud=@idSolicitud AND idEstatus NOT IN (3,4);
      IF @@ROWCOUNT = 0 THROW 51001, 'El ticket no existe o esta concluido. Solo el solicitante puede reabrirlo.', 1;`,
    );
  await _bitacora(
    pool,
    idSolicitud,
    tecnicoLogin,
    nombreTecnico,
    `Ticket asignado a ${nombreTecnico}`,
  );
  if (sol) {
    await _notificar({
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
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `SELECT tecnicoAsignado, nombreTecnico, idEstatus AS estatusActual, fechaInicioResolucion, tiempoTotalPausaMin, fechaUltimaPausa, folio, idUsuario FROM solicitudTI WHERE idSolicitud = @id`,
    );
  const row = check.recordset[0];
  if (!row) throw new Error("Solicitud no encontrada");

  const ESTADOS_OPERATIVOS = [2, 3, 4, 5, 6, 7, 8];
  if (
    ESTADOS_OPERATIVOS.includes(idEstatus) &&
    idEstatus !== 5 &&
    !row.tecnicoAsignado
  )
    return {
      ok: false,
      code: "SIN_ASIGNAR",
      message:
        "Asigna un responsable antes de realizar acciones sobre este ticket.",
    };
  if (
    [2, 3, 6].includes(idEstatus) &&
    loginSolicitante &&
    row.tecnicoAsignado &&
    row.tecnicoAsignado !== loginSolicitante
  )
    return {
      ok: false,
      code: "NO_ASIGNADO",
      message: "Este ticket está asignado a otro ingeniero.",
    };

  const estatusAnteriorTexto =
    ESTATUS_TEXTO[row.estatusActual] ?? `Estatus ${row.estatusActual}`;
  const estatusNuevoTexto = ESTATUS_TEXTO[idEstatus] ?? `Estatus ${idEstatus}`;
  let setSql = `idEstatus=@idEstatus, fechaActualizacion=GETDATE()`;

  if (idEstatus === 2) {
    if (!row.fechaInicioResolucion)
      setSql += `, fechaInicioResolucion=GETDATE()`;
    if (row.estatusActual === 6 && row.fechaUltimaPausa)
      setSql += `, tiempoTotalPausaMin=ISNULL(tiempoTotalPausaMin,0)+DATEDIFF(MINUTE,fechaUltimaPausa,GETDATE()), fechaUltimaPausa=NULL`;
  }
  if (idEstatus === 6) setSql += `, fechaUltimaPausa=GETDATE()`;
  if (idEstatus === 3 || idEstatus === 4) {
    setSql += `, fechaResolucion=GETDATE(), tiempoAtencionMin=(CASE WHEN fechaInicioResolucion IS NOT NULL THEN DATEDIFF(MINUTE,fechaInicioResolucion,GETDATE())-ISNULL(tiempoTotalPausaMin,0) ELSE DATEDIFF(MINUTE,fechaCreacion,GETDATE())-ISNULL(tiempoTotalPausaMin,0) END), fechaUltimaPausa=NULL`;
  }

  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("idEstatus", sql.Int, idEstatus)
    .query(`UPDATE solicitudTI SET ${setSql} WHERE idSolicitud=@idSolicitud AND idEstatus NOT IN (3,4);
      IF @@ROWCOUNT = 0 THROW 51001, 'El ticket no existe o esta concluido. Solo el solicitante puede reabrirlo.', 1;`);

  let notaBitacora;
  if (idEstatus === 6)
    notaBitacora = `Ticket puesto en pausa (estado anterior: ${estatusAnteriorTexto})`;
  else if (row.estatusActual === 6 && idEstatus === 2)
    notaBitacora = `Ticket reanudado`;
  else if (idEstatus === 3) notaBitacora = `Ticket resuelto`;
  else if (idEstatus === 4) notaBitacora = `Ticket cerrado`;
  else
    notaBitacora = `Estado cambiado de "${estatusAnteriorTexto}" a "${estatusNuevoTexto}"`;

  await _bitacora(
    pool,
    idSolicitud,
    loginSolicitante ?? "sistema",
    nombreSolicitante ?? row.nombreTecnico ?? "Sistema",
    notaBitacora,
  );

  const tipoMap = {
    3: TIPOS.TICKET_CERRADO,
    4: TIPOS.TICKET_CERRADO,
    5: TIPOS.RECHAZADO,
  };
  if (row.idUsuario && row.idUsuario !== loginSolicitante) {
    try {
      await _notificar({
        loginDestino: row.idUsuario,
        loginOrigen: loginSolicitante,
        idTipo: tipoMap[idEstatus] ?? TIPOS.ESTATUS_CAMBIO,
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
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `SELECT tecnicoAsignado, idUsuario, folio, fechaInicioResolucion, tiempoTotalPausaMin FROM solicitudTI WHERE idSolicitud = @id`,
    );
  const row = check.recordset[0];
  if (!row) throw new Error("Solicitud no encontrada");
  if (!row.tecnicoAsignado)
    return {
      ok: false,
      code: "SIN_ASIGNAR",
      message: "Asigna un responsable antes de escalar el ticket.",
    };

  // Corta tiempoIngenieroMin y arranca fechaInicioEscalamiento
  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("escalaA", sql.NVarChar(200), escalaA)
    .query(`UPDATE solicitudTI SET idEstatus=8, escalaA=@escalaA, fechaActualizacion=GETDATE(),
      fechaInicioEscalamiento=GETDATE(),
      tiempoIngenieroMin=CASE WHEN fechaInicioResolucion IS NOT NULL THEN DATEDIFF(MINUTE,fechaInicioResolucion,GETDATE())-ISNULL(tiempoTotalPausaMin,0) ELSE 0 END
      WHERE idSolicitud=@idSolicitud AND idEstatus NOT IN (3,4);
      IF @@ROWCOUNT = 0 THROW 51001, 'El ticket no existe o esta concluido. Solo el solicitante puede reabrirlo.', 1;`);

  const notaBitacora = comentario?.trim()
    ? `Escalado a ${escalaA}. Motivo: ${comentario.trim()}`
    : `Escalado a ${escalaA}.`;
  await _bitacora(pool, idSolicitud, loginUsuario, nombreUsuario, notaBitacora);

  if (row.idUsuario) {
    await _notificar({
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

async function finalizarEscalamiento(idSolicitud, loginUsuario, nombreUsuario) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `SELECT idEstatus, folio, idUsuario, fechaInicioEscalamiento FROM solicitudTI WHERE idSolicitud = @id`,
    );
  const row = check.recordset[0];
  if (!row) throw new Error("Solicitud no encontrada");
  if (row.idEstatus !== 8)
    return { ok: false, message: "El ticket no está escalado." };

  // PUNTO 1: Detiene timer proveedor y regresa a En proceso (idEstatus=2)
  // El ingeniero decidirá manualmente cuándo pasar a Resuelto
  await pool.request().input("idSolicitud", sql.Int, idSolicitud).query(`
    UPDATE solicitudTI SET
      idEstatus=2,
      fechaActualizacion=GETDATE(),
      tiempoProveedorMin=DATEDIFF(MINUTE,fechaInicioEscalamiento,GETDATE()),
      fechaInicioEscalamiento=NULL
    WHERE idSolicitud=@idSolicitud AND idEstatus NOT IN (3,4);
      IF @@ROWCOUNT = 0 THROW 51001, 'El ticket no existe o esta concluido. Solo el solicitante puede reabrirlo.', 1;
  `);
  await _bitacora(
    pool,
    idSolicitud,
    loginUsuario,
    nombreUsuario,
    `Escalamiento finalizado. El ticket regresa a En proceso.`,
  );
  return { ok: true };
}

async function resolverConAcciones(
  idSolicitud,
  accionesRealizadas,
  loginSolicitante,
  nombreSolicitante,
) {
  const pool = await getPool();
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      `SELECT tecnicoAsignado, nombreTecnico, idEstatus AS estatusActual, fechaInicioResolucion, tiempoTotalPausaMin, folio, idUsuario FROM solicitudTI WHERE idSolicitud = @id`,
    );
  const row = check.recordset[0];
  if (!row) throw new Error("Solicitud no encontrada");
  if (!row.tecnicoAsignado)
    return {
      ok: false,
      code: "SIN_ASIGNAR",
      message: "Asigna un responsable antes de resolver.",
    };

  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input(
      "acciones",
      sql.NVarChar(sql.MAX),
      accionesRealizadas?.trim() || null,
    )
    .query(`UPDATE solicitudTI SET idEstatus=3, fechaActualizacion=GETDATE(), fechaResolucion=GETDATE(),
      accionesRealizadas=@acciones,
      tiempoAtencionMin=(CASE WHEN fechaInicioResolucion IS NOT NULL THEN DATEDIFF(MINUTE,fechaInicioResolucion,GETDATE())-ISNULL(tiempoTotalPausaMin,0) ELSE DATEDIFF(MINUTE,fechaCreacion,GETDATE())-ISNULL(tiempoTotalPausaMin,0) END),
      fechaUltimaPausa=NULL
      WHERE idSolicitud=@idSolicitud AND idEstatus NOT IN (3,4);
      IF @@ROWCOUNT = 0 THROW 51001, 'El ticket no existe o esta concluido. Solo el solicitante puede reabrirlo.', 1;`);

  await _bitacora(
    pool,
    idSolicitud,
    loginSolicitante,
    nombreSolicitante,
    `Ticket resuelto. Acciones realizadas: ${accionesRealizadas?.trim() || "—"}`,
  );

  if (row.idUsuario && row.idUsuario !== loginSolicitante) {
    try {
      await _notificar({
        loginDestino: row.idUsuario,
        loginOrigen: loginSolicitante,
        idTipo: TIPOS.TICKET_CERRADO,
        idSolicitud,
        titulo: "Solicitud resuelta",
        descripcion: `Tu solicitud fue marcada como resuelta.`,
        urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${row.folio}&tab=detalle`,
      });
    } catch (e) {
      console.error("[Notif] resolverConAcciones:", e.message);
    }
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
  if (!sol?.tecnicoAsignado)
    return {
      ok: false,
      code: "SIN_ASIGNAR",
      message: "Asigna un responsable antes de cambiar la prioridad.",
    };
  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("idPrioridad", sql.Int, idPrioridad)
    .input("slaRespuestaHrs", sql.Int, slaRespuestaHrs)
    .input("slaResolucionHrs", sql.Int, slaResolucionHrs)
    .query(`UPDATE solicitudTI SET idPrioridad=@idPrioridad, slaRespuestaHrs=@slaRespuestaHrs, slaResolucionHrs=@slaResolucionHrs,
      fechaLimiteResp=DATEADD(HOUR,@slaRespuestaHrs,fechaCreacion), fechaLimiteResol=DATEADD(HOUR,@slaResolucionHrs,fechaCreacion), fechaActualizacion=GETDATE()
      WHERE idSolicitud=@idSolicitud AND idEstatus NOT IN (3,4);
      IF @@ROWCOUNT = 0 THROW 51001, 'El ticket no existe o esta concluido. Solo el solicitante puede reabrirlo.', 1;`);
  if (sol) {
    await _notificar({
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
    .input("comentario", sql.NVarChar(sql.MAX), comentario)
    .query(
      `INSERT INTO solicitudTI_comentarios (idSolicitud, idUsuario, nombreUsuario, esInterno, comentario) VALUES (@idSolicitud, @idUsuario, @nombreUsuario, @esInterno, @comentario)`,
    );
  if (!esInterno && sol && sol.idUsuario !== idUsuario) {
    await _notificar({
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

async function agregarBitacora(idSolicitud, idUsuario, nombreUsuario, nota) {
  const pool = await getPool();
  await _bitacora(pool, idSolicitud, idUsuario, nombreUsuario, nota);
}

async function getTecnicosSistemas() {
  const pool = await getPool();
  const res = await pool
    .request()
    .query(
      `SELECT login, name FROM sec_users WHERE area = 'SISTEMAS' AND active = 'Y' ORDER BY name`,
    );
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
    .input("nombreTecnico", sql.NVarChar(200), nombreTecnico)
    .query(
      `UPDATE solicitudTI SET tecnicoAsignado=@tecnicoAsignado, nombreTecnico=@nombreTecnico, fechaActualizacion=GETDATE() WHERE idSolicitud=@idSolicitud AND idEstatus NOT IN (3,4);
      IF @@ROWCOUNT = 0 THROW 51001, 'El ticket no existe o esta concluido. Solo el solicitante puede reabrirlo.', 1;`,
    );
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
  finalizarEscalamiento,
  resolverConAcciones,
};
