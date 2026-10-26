// server/services/mnt.service.js

const { getPool, sql } = require("../db");

// ─────────────────────────────────────────────────────────────
// MAPA sec_users.sitio → dbo.SITIOS.codigoSitio
// ─────────────────────────────────────────────────────────────
const SITIO_MAP = {
  "ALMACÉN CENTRAL NAHUM": "ALMC",
  "ALMACEN CENTRAL NAHUM": "ALMC",
  BAJIO: "BJ",
  FDNC: "FDNC",
  MERIDA: "ST",
  NORTE: "NTE",
  OCCIDENTE: "OCC",
  ORIENTE: "OTE",
  PACIFICO: "PC",
  PLANTA: "PFV",
  "SUR 121": "IAFSA",
  TOLUCA: "TL",
};

function mapearSitio(sitioUsuario) {
  if (!sitioUsuario) throw new Error("El usuario no tiene sitio asignado");
  const codigo =
    SITIO_MAP[sitioUsuario.trim().toUpperCase()] ||
    SITIO_MAP[sitioUsuario.trim()];
  if (!codigo) throw new Error(`Sitio no reconocido: ${sitioUsuario}`);
  return codigo;
}

// ─────────────────────────────────────────────────────────────
// CATÁLOGOS
// ─────────────────────────────────────────────────────────────

async function getCatalogos() {
  const pool = await getPool();
  const [servicios, sitios] = await Promise.all([
    pool.request().query(`
      SELECT id, descripcion, prioridad,
             CASE prioridad WHEN '001' THEN 24 ELSE 48 END AS horasObjetivo
      FROM serviciosPrioridadMantenimiento
      ORDER BY prioridad, id
    `),
    pool.request().query(`
      SELECT codigoSitio,
             CASE WHEN codigoSitio = 'IAFSA' THEN 'CEDIS' ELSE nombreCorto END AS nombreCorto
      FROM dbo.SITIOS
      ORDER BY descripcion
    `),
  ]);
  return { servicios: servicios.recordset, sitios: sitios.recordset };
}

async function getAreasPorSitio(sitioParam) {
  const pool = await getPool();
  const codigoSitio =
    SITIO_MAP[sitioParam?.trim()] ||
    SITIO_MAP[sitioParam?.trim().toUpperCase()] ||
    sitioParam;
  const res = await pool
    .request()
    .input("codigoSitio", sql.VarChar, codigoSitio).query(`
      SELECT codigoDepartamento, departamento
      FROM dbo.DEPARTAMENTOS
      WHERE codigoSitio = @codigoSitio
      ORDER BY departamento
    `);
  return res.recordset;
}

async function getPersonal(tipo) {
  const pool = await getPool();
  const tipoNormalizado = String(tipo || "").trim().toLowerCase();
  const esExterno = tipoNormalizado === "externo" || tipoNormalizado === "2";
  const tabla = esExterno
    ? "mnt_personal_externo"
    : "mnt_personal_mantenimiento";
  const res = await pool.request().query(`
    SELECT idPersonal, nombre, numero, ${esExterno ? 2 : 1} AS tipo
    FROM ${tabla}
    WHERE ISNULL(activo, 1) = 1
    ORDER BY nombre
  `);
  return res.recordset;
}

async function getSitiosBandeja() {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT DISTINCT s.sitio,
      CASE WHEN s.sitio = 'IAFSA' THEN 'CEDIS' ELSE st.nombreCorto END AS nombreSitio
    FROM mnt_solicitudes s
    JOIN dbo.SITIOS st ON st.codigoSitio = s.sitio
    ORDER BY nombreSitio
  `);
  return res.recordset;
}

// ─────────────────────────────────────────────────────────────
// SOLICITUDES — USUARIO
// ─────────────────────────────────────────────────────────────

async function validarNuevaSolicitud(login) {
  const pool = await getPool();
  const res = await pool.request().input("login", sql.VarChar, login).query(`
    SELECT COUNT(*) AS pendientes
    FROM mnt_solicitudes
    WHERE loginSolicitante = @login
      AND idEstatus = 3
      AND evaluacionVB IS NULL
  `);
  const pendientes = Number(res.recordset[0]?.pendientes || 0);
  return { permitido: pendientes <= 1, pendientes };
}

async function crearSolicitud({
  login,
  sitio,
  area,
  idServicio,
  ubicacionDetalle,
  descripcion,
}) {
  const pool = await getPool();
  const codigoSitio = mapearSitio(sitio);

  const svcRes = await pool
    .request()
    .input("idServicio", sql.Int, idServicio)
    .query(
      `SELECT prioridad, descripcion FROM serviciosPrioridadMantenimiento WHERE id = @idServicio`,
    );

  if (!svcRes.recordset.length) throw new Error("Servicio no encontrado");
  const { prioridad, descripcion: servicio } = svcRes.recordset[0];

  const anio = new Date().getFullYear();
  const folioRes = await pool
    .request()
    .input("anio", sql.Int, anio)
    .query(
      `SELECT COUNT(*) AS total FROM mnt_solicitudes WHERE YEAR(fechaCreacion) = @anio`,
    );
  const consecutivo = (folioRes.recordset[0].total + 1)
    .toString()
    .padStart(4, "0");
  const folio = `MNT-${anio}-${consecutivo}`;

  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const insertRes = await transaction
      .request()
      .input("folio", sql.VarChar, folio)
      .input("loginSolicitante", sql.VarChar, login)
      .input("sitio", sql.VarChar, codigoSitio)
      .input("area", sql.VarChar, area)
      .input("idServicio", sql.Int, idServicio)
      .input("prioridadSnapshot", sql.VarChar, prioridad)
      .input("ubicacionDetalle", sql.VarChar, ubicacionDetalle)
      .input("descripcion", sql.VarChar, descripcion).query(`
        INSERT INTO mnt_solicitudes
          (folio, loginSolicitante, sitio, area, idServicio,
           prioridadSnapshot, ubicacionDetalle, descripcion, idEstatus)
        OUTPUT INSERTED.idSolicitud, INSERTED.folio, INSERTED.fechaCreacion
        VALUES
          (@folio, @loginSolicitante, @sitio, @area, @idServicio,
           @prioridadSnapshot, @ubicacionDetalle, @descripcion, 0)
      `);

    const { idSolicitud, fechaCreacion } = insertRes.recordset[0];

    await transaction
      .request()
      .input("idSolicitud", sql.Int, idSolicitud)
      .input("estatusAnterior", sql.TinyInt, 0)
      .input("estatusNuevo", sql.TinyInt, 0)
      .input("loginActor", sql.VarChar, login)
      .input("nota", sql.VarChar, "Solicitud creada").query(`
        INSERT INTO mnt_historial_estatus
          (idSolicitud, estatusAnterior, estatusNuevo, loginActor, nota)
        VALUES (@idSolicitud, @estatusAnterior, @estatusNuevo, @loginActor, @nota)
      `);

    await transaction.commit();
    return { idSolicitud, folio, fechaCreacion, prioridad, servicio };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getMisSolicitudes(login) {
  const pool = await getPool();
  const res = await pool.request().input("login", sql.VarChar, login).query(`
      SELECT
        s.idSolicitud, s.folio, s.sitio, s.area,
        sv.descripcion          AS servicio,
        s.prioridadSnapshot     AS prioridad,
        s.ubicacionDetalle, s.descripcion,
        s.idEstatus, s.fechaCreacion, s.fechaUltimaModif,
        s.loginTecnico, s.fechaCompromiso, s.evaluacionVB, s.observacionVB,
        s.loginEvaluador, s.fechaEvaluacion,
        CASE WHEN s.idEstatus = 3 AND s.evaluacionVB IS NULL THEN 1 ELSE 0 END AS pendienteVB,
        (SELECT COUNT(*) FROM mnt_mensajes m WHERE m.idSolicitud = s.idSolicitud) AS totalMensajes,
        (SELECT COUNT(*) FROM mnt_mensajes m WHERE m.idSolicitud = s.idSolicitud AND m.loginAutor <> @login) AS mensajesRecibidos
      FROM mnt_solicitudes s
      JOIN serviciosPrioridadMantenimiento sv ON sv.id = s.idServicio
      WHERE s.loginSolicitante = @login
      ORDER BY s.fechaCreacion DESC
    `);
  return res.recordset;
}

async function getDetalleSolicitud(idSolicitud, login, esMto) {
  const pool = await getPool();

  const solicitudRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud).query(`
      SELECT s.*,
             sv.descripcion AS servicio,
             u.name         AS nombreSolicitante,
             u.email        AS emailSolicitante,
             d.departamento AS nombreArea
      FROM mnt_solicitudes s
      JOIN serviciosPrioridadMantenimiento sv ON sv.id = s.idServicio
      JOIN sec_users u ON u.login = s.loginSolicitante
      LEFT JOIN dbo.DEPARTAMENTOS d ON d.codigoDepartamento = s.area
      WHERE s.idSolicitud = @idSolicitud
    `);

  if (!solicitudRes.recordset.length)
    throw new Error("Solicitud no encontrada");
  const solicitud = solicitudRes.recordset[0];

  if (!esMto && solicitud.loginSolicitante !== login)
    throw new Error("FORBIDDEN");

  const [historialRes, participantesRes, archivosRes, mensajesRes, evaluacionesRes] =
    await Promise.all([
      pool.request().input("idSolicitud", sql.Int, idSolicitud).query(`
      SELECT h.idHistorial, h.estatusAnterior, h.estatusNuevo,
             h.loginActor, u.name AS nombreActor,
             h.motivo, h.nota, h.fechaCambio
      FROM mnt_historial_estatus h
      JOIN sec_users u ON u.login = h.loginActor
      WHERE h.idSolicitud = @idSolicitud
      ORDER BY h.fechaCambio ASC
    `),
      pool.request().input("idSolicitud", sql.Int, idSolicitud).query(`
      SELECT p.idParticipante, p.idPersonal, p.tipoParticipacion,
             COALESCE(pm.nombre, pe.nombre) AS nombre,
             COALESCE(pm.numero, pe.numero) AS numero
      FROM mnt_participantes p
      LEFT JOIN mnt_personal_mantenimiento pm
        ON p.tipoParticipacion = 1 AND pm.idPersonal = p.idPersonal
      LEFT JOIN mnt_personal_externo pe
        ON p.tipoParticipacion = 2 AND pe.idPersonal = p.idPersonal
      WHERE p.idSolicitud = @idSolicitud
      ORDER BY p.tipoParticipacion, COALESCE(pm.nombre, pe.nombre)
    `),
      pool.request().input("idSolicitud", sql.Int, idSolicitud).query(`
      SELECT idArchivo, momento, nombreOriginal,
             rutaServidor, tipoMime, tamanioBytes, fechaSubida
      FROM mnt_archivos
      WHERE idSolicitud = @idSolicitud
      ORDER BY fechaSubida ASC
    `),
      pool.request().input("idSolicitud", sql.Int, idSolicitud).query(`
      SELECT m.idMensaje, m.loginAutor, u.name AS nombreAutor,
             u.area AS rolAutor,
             m.mensaje, m.fechaEnvio
      FROM mnt_mensajes m
      JOIN sec_users u ON u.login = m.loginAutor
      WHERE m.idSolicitud = @idSolicitud
      ORDER BY m.fechaEnvio ASC
    `),
      pool.request().input("idSolicitud", sql.Int, idSolicitud).query(`
      SELECT e.idEvaluacion, e.evaluacion, e.calificacionAtencion,
             e.calificacionServicio, e.observacion, e.loginEvaluador,
             u.name AS nombreEvaluador, e.fechaEvaluacion
      FROM mnt_evaluaciones e
      LEFT JOIN sec_users u ON u.login = e.loginEvaluador
      WHERE e.idSolicitud = @idSolicitud
      ORDER BY e.fechaEvaluacion DESC, e.idEvaluacion DESC
    `),
    ]);

  return {
    ...solicitud,
    historial: historialRes.recordset,
    participantes: participantesRes.recordset,
    archivos: archivosRes.recordset,
    mensajes: mensajesRes.recordset,
    evaluaciones: evaluacionesRes.recordset,
  };
}

// ─────────────────────────────────────────────────────────────
// BANDEJA — MANTENIMIENTO
// ─────────────────────────────────────────────────────────────

async function getBandeja({
  login,
  estatus,
  sitio,
  prioridad,
  tipoMantenimiento,
  busqueda,
} = {}) {
  const pool = await getPool();
  const req = pool.request();
  req.input("loginActual", sql.VarChar, login || "");
  let where = "WHERE 1=1";

  // Si se filtra explícitamente por estatus se usa ese valor,
  // si no se filtra se muestran todos excepto cerradas (estado futuro)
  if (estatus !== undefined && estatus !== null && estatus !== "") {
    where += " AND s.idEstatus = @estatus";
    if (Number(estatus) === 3) where += " AND s.evaluacionVB IS NULL";
    req.input("estatus", sql.TinyInt, Number(estatus));
  }
  if (sitio) {
    where += " AND s.sitio = @sitio";
    req.input("sitio", sql.VarChar, sitio);
  }
  if (prioridad) {
    where += " AND s.prioridadSnapshot = @prioridad";
    req.input("prioridad", sql.VarChar, prioridad);
  }
  if (tipoMantenimiento) {
    where += " AND s.tipoMantenimiento = @tipoMant";
    req.input("tipoMant", sql.TinyInt, Number(tipoMantenimiento));
  }
  if (busqueda) {
    where += ` AND (
      s.folio LIKE @busqueda OR
      u.name  LIKE @busqueda OR
      u.email LIKE @busqueda OR
      s.descripcion LIKE @busqueda OR
      sv.descripcion LIKE @busqueda
    )`;
    req.input("busqueda", sql.VarChar, `%${busqueda}%`);
  }

  const res = await req.query(`
    SELECT
      s.idSolicitud, s.folio,
      s.sitio,
      CASE WHEN s.sitio = 'IAFSA' THEN 'CEDIS' ELSE st.nombreCorto END AS nombreSitio,
      s.area,
      d.departamento AS nombreArea,
      s.prioridadSnapshot  AS prioridad,
      sv.descripcion       AS servicio,
      s.idEstatus,
      s.ubicacionDetalle,
      s.descripcion,
      s.fechaCreacion,
      s.fechaCompromiso,
      s.fechaInicioProceso,
      s.tipoMantenimiento,
      s.evaluacionVB,
      s.observacionVB,
      s.loginEvaluador,
      s.fechaEvaluacion,
      CASE WHEN s.idEstatus = 3 AND s.evaluacionVB IS NULL THEN 1 ELSE 0 END AS pendienteVB,
      u.name               AS nombreSolicitante,
      u.email              AS emailSolicitante,
      s.loginTecnico,
      DATEDIFF(HOUR, s.fechaCreacion, GETDATE()) AS horasTranscurridas,
      (SELECT COUNT(*) FROM mnt_mensajes m WHERE m.idSolicitud = s.idSolicitud) AS totalMensajes,
      (
        SELECT COUNT(*)
        FROM mnt_mensajes m
        LEFT JOIN sec_users mu ON mu.login = m.loginAutor
        WHERE m.idSolicitud = s.idSolicitud
          AND m.loginAutor <> @loginActual
          AND ISNULL(mu.area, '') <> 'MANTENIMIENTO'
      ) AS mensajesRecibidos,
      CONCAT_WS(', ',
        (
          SELECT STRING_AGG(pm.nombre, ', ')
          FROM mnt_participantes p
          JOIN mnt_personal_mantenimiento pm ON pm.idPersonal = p.idPersonal
          WHERE p.idSolicitud = s.idSolicitud AND p.tipoParticipacion = 1
        ),
        (
          SELECT STRING_AGG(pe.nombre, ', ')
          FROM mnt_participantes p
          JOIN mnt_personal_externo pe ON pe.idPersonal = p.idPersonal
          WHERE p.idSolicitud = s.idSolicitud AND p.tipoParticipacion = 2
        )
      ) AS personalMto
    FROM mnt_solicitudes s
    JOIN serviciosPrioridadMantenimiento sv ON sv.id     = s.idServicio
    JOIN sec_users                        u  ON u.login  = s.loginSolicitante
    JOIN dbo.SITIOS                       st ON st.codigoSitio = s.sitio
    LEFT JOIN dbo.DEPARTAMENTOS           d  ON d.codigoDepartamento = s.area
    ${where}
    ORDER BY
      s.fechaCreacion DESC,
      s.idSolicitud  DESC
  `);

  return res.recordset;
}

// ─────────────────────────────────────────────────────────────
// CAMBIO DE ESTADO
// ─────────────────────────────────────────────────────────────

// Transiciones permitidas
const TRANSICIONES = {
  0: [1, 4], // Sin atención   → En proceso, Rechazada
  1: [2, 3, 4], // En proceso     → Pdte.material, Concluida pdte.VB, Rechazada
  2: [1, 4], // Pdte.material  → En proceso, Rechazada
  3: [5], // Concluida pdte.VB → Reabierta (vía VB usuario)
  4: [], // Rechazada      → ninguna
  5: [1], // Reabierta      → En proceso
};

async function cambiarEstatus({
  idSolicitud,
  estatusNuevo,
  login,
  esMto,
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
}) {
  const pool = await getPool();

  const solRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT idEstatus, loginSolicitante, fechaInicioProceso FROM mnt_solicitudes WHERE idSolicitud = @idSolicitud`,
    );

  if (!solRes.recordset.length) throw new Error("Solicitud no encontrada");
  const { idEstatus: estatusActual, fechaInicioProceso } = solRes.recordset[0];

  if (!esMto) throw new Error("FORBIDDEN");

  const permitidas = TRANSICIONES[estatusActual] || [];
  if (!permitidas.includes(estatusNuevo)) {
    throw new Error(
      `Transición no permitida: ${estatusActual} → ${estatusNuevo}`,
    );
  }

  // Validaciones por estado destino
  if (estatusNuevo === 4 && !motivo?.trim())
    throw new Error("El motivo es obligatorio al rechazar");

  if (estatusNuevo === 1) {
    if (!tipoTrabajo) throw new Error("Tipo de trabajo requerido");
    if (!fechaCompromiso) throw new Error("Fecha compromiso requerida");
  }
  if (estatusNuevo === 2) {
    if (!materialRequerido?.trim())
      throw new Error("Describe el material pendiente");
    if (!fechaCompromiso) throw new Error("Fecha compromiso requerida");
  }
  if (estatusNuevo === 3) {
    if (!tipoActividad) throw new Error("Tipo de actividad requerido");
    if (!tipoMantenimiento) throw new Error("Tipo de mantenimiento requerido");
    if (!origenEvento) throw new Error("Origen del evento requerido");
    if (!actividadesRealizadas?.trim())
      throw new Error("Las actividades realizadas son obligatorias");
    if (!fechaInicio || !horaInicio || !fechaTermino || !horaTermino)
      throw new Error("Fechas y horas de inicio y término son obligatorias");
  }

  // Calcular tiempo ejecución
  let tiempoEjecucionMin = null;
  if (fechaInicio && horaInicio && fechaTermino && horaTermino) {
    const inicio = new Date(`${fechaInicio}T${horaInicio}`);
    const termino = new Date(`${fechaTermino}T${horaTermino}`);
    tiempoEjecucionMin = Math.round((termino - inicio) / 60000);
  }

  const transaction = pool.transaction();
  await transaction.begin();

  try {
    const req = transaction
      .request()
      .input("idSolicitud", sql.Int, idSolicitud);
    let sets = [
      "idEstatus = @estatusNuevo",
      "fechaUltimaModif = GETDATE()",
      "loginUltimaModif = @login",
    ];
    req.input("estatusNuevo", sql.TinyInt, estatusNuevo);
    req.input("login", sql.VarChar, login);

    // Diagnóstico (estados 1 y 2)
    if (estatusNuevo === 1 || estatusNuevo === 2) {
      if (tipoTrabajo) {
        sets.push("tipoTrabajo = @tipoTrabajo", "loginTecnico = @loginTecnico");
        req.input("tipoTrabajo", sql.TinyInt, tipoTrabajo);
        req.input("loginTecnico", sql.VarChar, login);
      }
      if (textoDiagnostico) {
        sets.push("textoDiagnostico = @textoDiagnostico");
        req.input("textoDiagnostico", sql.VarChar, textoDiagnostico);
      }
      if (fechaCompromiso) {
        sets.push("fechaCompromiso = @fechaCompromiso");
        req.input("fechaCompromiso", sql.Date, fechaCompromiso);
      }
      if (materialRequerido) {
        sets.push("materialRequerido = @materialRequerido");
        req.input("materialRequerido", sql.VarChar, materialRequerido);
      }
      // fechaInicioProceso solo la primera vez
      if (estatusNuevo === 1 && !fechaInicioProceso) {
        sets.push("fechaInicioProceso = GETDATE()");
      }
    }

    // Cierre (estado 3)
    if (estatusNuevo === 3) {
      sets.push(
        "tipoActividad = @tipoActividad",
        "tipoMantenimiento = @tipoMantenimiento",
        "origenEvento = @origenEvento",
        "actividadesRealizadas = @actividadesRealizadas",
        "observacionesCierre = @observacionesCierre",
        "fechaInicio = @fechaInicio",
        "horaInicio = @horaInicio",
        "fechaTermino = @fechaTermino",
        "horaTermino = @horaTermino",
        "tiempoEjecucionMin = @tiempoEjecucionMin",
        "fechaRegistroCierre = GETDATE()",
        "loginCierro = @loginCierro",
        "evaluacionVB = NULL",
        "observacionVB = NULL",
        "loginEvaluador = NULL",
        "fechaEvaluacion = NULL",
      );
      req.input("tipoActividad", sql.TinyInt, tipoActividad);
      req.input("tipoMantenimiento", sql.TinyInt, tipoMantenimiento);
      req.input("origenEvento", sql.TinyInt, origenEvento);
      req.input("actividadesRealizadas", sql.VarChar, actividadesRealizadas);
      req.input(
        "observacionesCierre",
        sql.VarChar,
        observacionesCierre || null,
      );
      req.input("fechaInicio", sql.Date, fechaInicio);
      req.input("horaInicio", sql.VarChar, horaInicio);
      req.input("fechaTermino", sql.Date, fechaTermino);
      req.input("horaTermino", sql.VarChar, horaTermino);
      req.input("tiempoEjecucionMin", sql.Int, tiempoEjecucionMin);
      req.input("loginCierro", sql.VarChar, login);
    }

    await req.query(
      `UPDATE mnt_solicitudes SET ${sets.join(", ")} WHERE idSolicitud = @idSolicitud`,
    );

    // Participantes: también se registran al concluir en espera de VB (estado 3).
    if (
      (estatusNuevo === 1 || estatusNuevo === 2 || estatusNuevo === 3) &&
      (personalMto?.length || personalConstruccion?.length)
    ) {
      // Limpiar participantes anteriores
      await transaction
        .request()
        .input("idSolicitud", sql.Int, idSolicitud)
        .query(
          `DELETE FROM mnt_participantes WHERE idSolicitud = @idSolicitud`,
        );

      const participantesRecibidos = [
        ...(personalMto || []).map((id) => ({ id, tipo: 1 })),
        ...(personalConstruccion || []).map((id) => ({ id, tipo: 2 })),
      ];
      const todos = Array.from(
        new Map(
          participantesRecibidos.map((participante) => [
            `${participante.tipo}:${participante.id}`,
            participante,
          ]),
        ).values(),
      );
      for (const p of todos) {
        await transaction
          .request()
          .input("idSolicitud", sql.Int, idSolicitud)
          .input("idPersonal", sql.Int, p.id)
          .input("tipoParticipacion", sql.TinyInt, p.tipo).query(`
            INSERT INTO mnt_participantes (idSolicitud, idPersonal, tipoParticipacion)
            VALUES (@idSolicitud, @idPersonal, @tipoParticipacion)
          `);
      }
    }

    // Historial
    await transaction
      .request()
      .input("idSolicitud", sql.Int, idSolicitud)
      .input("estatusAnterior", sql.TinyInt, estatusActual)
      .input("estatusNuevo", sql.TinyInt, estatusNuevo)
      .input("loginActor", sql.VarChar, login)
      .input("motivo", sql.VarChar, motivo || null)
      .input("nota", sql.VarChar, nota || null).query(`
        INSERT INTO mnt_historial_estatus
          (idSolicitud, estatusAnterior, estatusNuevo, loginActor, motivo, nota)
        VALUES (@idSolicitud, @estatusAnterior, @estatusNuevo, @loginActor, @motivo, @nota)
      `);

    await transaction.commit();
    return { ok: true };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// VISTO BUENO — USUARIO
// ─────────────────────────────────────────────────────────────

async function registrarVistoBueno({
  idSolicitud,
  login,
  evaluacion,
  observacion,
  calificacionAtencion,
  calificacionServicio,
}) {
  if (evaluacion === 2 && !observacion?.trim()) {
    throw new Error(
      "La observación es obligatoria cuando la evaluación es No conforme",
    );
  }

  const pool = await getPool();
  const solRes = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .query(
      `SELECT s.idEstatus, s.loginSolicitante, s.folio,
              sv.descripcion AS servicio,
              u.name AS nombreSolicitante
       FROM mnt_solicitudes s
       JOIN serviciosPrioridadMantenimiento sv ON sv.id = s.idServicio
       JOIN sec_users u ON u.login = s.loginSolicitante
       WHERE s.idSolicitud = @idSolicitud`,
    );

  if (!solRes.recordset.length) throw new Error("Solicitud no encontrada");
  const solicitud = solRes.recordset[0];
  const { idEstatus, loginSolicitante } = solicitud;

  if (loginSolicitante !== login) throw new Error("FORBIDDEN");
  if (idEstatus !== 3)
    throw new Error("La solicitud no está pendiente de visto bueno");

  // La restricción CK_mntsol_estatus admite los estados 0–5. Una solicitud
  // conforme permanece en 3 y se considera cerrada por evaluacionVB = 1;
  // la interfaz la representa visualmente como estado 6 mediante estatusVisual.
  const estatusNuevo = evaluacion === 2 ? 5 : 3;

  const transaction = pool.transaction();
  await transaction.begin();
  try {
    await transaction
      .request()
      .input("idSolicitud", sql.Int, idSolicitud)
      .input("evaluacion", sql.TinyInt, evaluacion)
      .input("observacion", sql.VarChar, observacion || null)
      .input("login", sql.VarChar, login)
      .input("estatusNuevo", sql.TinyInt, estatusNuevo).query(`
        UPDATE mnt_solicitudes SET
          evaluacionVB     = @evaluacion,
          observacionVB    = @observacion,
          loginEvaluador   = @login,
          fechaEvaluacion  = GETDATE(),
          idEstatus        = @estatusNuevo,
          fechaUltimaModif = GETDATE(),
          loginUltimaModif = @login
        WHERE idSolicitud = @idSolicitud
      `);

    await transaction
      .request()
      .input("idSolicitud", sql.Int, idSolicitud)
      .input("evaluacion", sql.TinyInt, evaluacion)
      .input("calificacionAtencion", sql.TinyInt, calificacionAtencion)
      .input("calificacionServicio", sql.TinyInt, calificacionServicio)
      .input("observacion", sql.VarChar, observacion || null)
      .input("loginEvaluador", sql.VarChar, login).query(`
        INSERT INTO mnt_evaluaciones
          (idSolicitud, evaluacion, calificacionAtencion,
           calificacionServicio, observacion, loginEvaluador)
        VALUES
          (@idSolicitud, @evaluacion, @calificacionAtencion,
           @calificacionServicio, @observacion, @loginEvaluador)
      `);

    await transaction
      .request()
      .input("idSolicitud", sql.Int, idSolicitud)
      .input("estatusAnterior", sql.TinyInt, 3)
      .input("estatusNuevo", sql.TinyInt, estatusNuevo)
      .input("loginActor", sql.VarChar, login)
      .input(
        "nota",
        sql.VarChar,
        evaluacion === 1
          ? "Visto bueno conforme"
          : `No conforme: ${observacion}`,
      ).query(`
        INSERT INTO mnt_historial_estatus
          (idSolicitud, estatusAnterior, estatusNuevo, loginActor, nota)
        VALUES (@idSolicitud, @estatusAnterior, @estatusNuevo, @loginActor, @nota)
      `);

    await transaction.commit();
    return {
      ok: true,
      folio: solicitud.folio,
      servicio: solicitud.servicio,
      nombreSolicitante: solicitud.nombreSolicitante,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// MENSAJES
// ─────────────────────────────────────────────────────────────

async function getMensajes(idSolicitud) {
  const pool = await getPool();
  const res = await pool.request().input("idSolicitud", sql.Int, idSolicitud)
    .query(`
      SELECT m.idMensaje, m.loginAutor,
             u.name  AS nombreAutor,
             u.area  AS areaAutor,
             m.mensaje, m.fechaEnvio
      FROM mnt_mensajes m
      JOIN sec_users u ON u.login = m.loginAutor
      WHERE m.idSolicitud = @idSolicitud
      ORDER BY m.fechaEnvio ASC
    `);
  return res.recordset;
}

async function enviarMensaje({ idSolicitud, login, mensaje }) {
  if (!mensaje?.trim()) throw new Error("El mensaje no puede estar vacío");
  const pool = await getPool();
  const res = await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("loginAutor", sql.VarChar, login)
    .input("mensaje", sql.VarChar, mensaje.trim()).query(`
      INSERT INTO mnt_mensajes (idSolicitud, loginAutor, mensaje)
      OUTPUT INSERTED.idMensaje, INSERTED.fechaEnvio
      VALUES (@idSolicitud, @loginAutor, @mensaje)
    `);
  return res.recordset[0];
}

async function getContextoNotificacion(idSolicitud) {
  const pool = await getPool();
  const [solicitudRes, mantenimientoRes] = await Promise.all([
    pool.request().input("idSolicitud", sql.Int, idSolicitud).query(`
      SELECT s.idSolicitud, s.folio, s.loginSolicitante, s.loginTecnico,
             sv.descripcion AS servicio
      FROM mnt_solicitudes s
      JOIN serviciosPrioridadMantenimiento sv ON sv.id = s.idServicio
      WHERE s.idSolicitud = @idSolicitud
    `),
    pool.request().query(`
      SELECT DISTINCT um.login
      FROM portal_usuario_modulos um
      JOIN portal_modulos m ON m.idModulo = um.idModulo
      WHERE m.clave = 'mantenimiento'
        AND m.activo = 1
        AND um.esMto = 1
    `),
  ]);

  if (!solicitudRes.recordset.length) return null;
  return {
    ...solicitudRes.recordset[0],
    loginsMantenimiento: mantenimientoRes.recordset.map((fila) => fila.login),
  };
}

// ─────────────────────────────────────────────────────────────
// PARTICIPANTES
// ─────────────────────────────────────────────────────────────

async function agregarParticipante({
  idSolicitud,
  idPersonal,
  tipoParticipacion,
  esMto,
}) {
  if (!esMto) throw new Error("FORBIDDEN");
  const pool = await getPool();
  await pool
    .request()
    .input("idSolicitud", sql.Int, idSolicitud)
    .input("idPersonal", sql.Int, idPersonal)
    .input("tipoParticipacion", sql.TinyInt, tipoParticipacion).query(`
      INSERT INTO mnt_participantes (idSolicitud, idPersonal, tipoParticipacion)
      VALUES (@idSolicitud, @idPersonal, @tipoParticipacion)
    `);
  return { ok: true };
}

async function eliminarParticipante({ idParticipante, esMto }) {
  if (!esMto) throw new Error("FORBIDDEN");
  const pool = await getPool();
  await pool
    .request()
    .input("idParticipante", sql.Int, idParticipante)
    .query(
      `DELETE FROM mnt_participantes WHERE idParticipante = @idParticipante`,
    );
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// ARCHIVOS
// ─────────────────────────────────────────────────────────────

async function guardarArchivos(idSolicitud, momento, login, archivos) {
  const pool = await getPool();
  const rutas = [];
  for (const file of archivos) {
    const rutaRelativa = `uploads/mantenimiento/${file.filename}`;
    await pool
      .request()
      .input("idSolicitud", sql.Int, idSolicitud)
      .input("momento", sql.TinyInt, momento)
      .input("nombreOriginal", sql.VarChar, file.originalname)
      .input("rutaServidor", sql.VarChar, rutaRelativa)
      .input("tipoMime", sql.VarChar, file.mimetype)
      .input("tamanioBytes", sql.Int, file.size)
      .input("loginSubio", sql.VarChar, login).query(`
        INSERT INTO mnt_archivos
          (idSolicitud, momento, nombreOriginal, rutaServidor, tipoMime, tamanioBytes, loginSubio)
        VALUES (@idSolicitud, @momento, @nombreOriginal, @rutaServidor, @tipoMime, @tamanioBytes, @loginSubio)
      `);
    rutas.push(rutaRelativa);
  }
  return rutas;
}

module.exports = {
  getCatalogos,
  getAreasPorSitio,
  getPersonal,
  getSitiosBandeja,
  validarNuevaSolicitud,
  crearSolicitud,
  getMisSolicitudes,
  getDetalleSolicitud,
  getBandeja,
  cambiarEstatus,
  registrarVistoBueno,
  getMensajes,
  enviarMensaje,
  getContextoNotificacion,
  agregarParticipante,
  eliminarParticipante,
  guardarArchivos,
};
