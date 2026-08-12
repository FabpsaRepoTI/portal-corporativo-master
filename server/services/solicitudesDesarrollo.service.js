// ═══════════════════════════════════════════════════════════════
// solicitudesDesarrollo.service.js  v4.1
// ═══════════════════════════════════════════════════════════════
"use strict";

const sql = require("mssql");
const { getPool } = require("../db");
const { crearNotificacion, TIPOS } = require("./notificaciones.service");

const ID_SERVICIO = 2;
const TIPO_CODIGO = { 1: "ND", 2: "MA" };

// ── Generar folio DEVTI ──────────────────────────────────────
async function generarFolio(pool, idTipo) {
  const codigo = TIPO_CODIGO[idTipo] ?? "ND";
  const now = new Date();
  const yymm =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, "0");
  const prefijo = `DEVTI-${codigo}-${yymm}-`;
  const r = await pool.request().input("prefijo", sql.VarChar(30), prefijo)
    .query(`
    SELECT ISNULL(MAX(TRY_CAST(RIGHT(JSON_VALUE(camposExtra,'$.folioDesarrollo'),5) AS INT)),0) AS ultimo
    FROM solicitudTI
    WHERE idServicio=${ID_SERVICIO}
      AND JSON_VALUE(camposExtra,'$.folioDesarrollo') LIKE @prefijo+'%'
  `);
  const siguiente = (r.recordset[0]?.ultimo ?? 0) + 1;
  return `${prefijo}${String(siguiente).padStart(5, "0")}`;
}

// ── Bitácora ─────────────────────────────────────────────────
async function bitacora(pool, { idSolicitud, idUsuario, nombreUsuario, nota }) {
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar(255), idUsuario)
    .input("nombre", sql.NVarChar(200), nombreUsuario)
    .input("nota", sql.NVarChar(500), nota)
    .query(
      "INSERT INTO solicitudTI_bitacora(idSolicitud,idUsuario,nombreUsuario,nota,fecha) VALUES(@id,@login,@nombre,@nota,GETDATE())",
    );
}

// ── Helper solicitante ────────────────────────────────────────
async function getSolicitante(pool, idSolicitud) {
  const r = await pool.request().input("id", sql.Int, idSolicitud).query(`
    SELECT idUsuario,nombreUsuario,
           ISNULL(JSON_VALUE(camposExtra,'$.folioDesarrollo'),folio) AS folioDesarrollo
    FROM solicitudTI WHERE idSolicitud=@id
  `);
  return r.recordset[0] ?? null;
}

// ── Formatear minutos ─────────────────────────────────────────
function fmtMinutos(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ════════════════════════════════════════════════════════════
// getCatalogos
// ════════════════════════════════════════════════════════════
async function getCatalogos() {
  const pool = await getPool();
  const [estatus, tipos, sistemas, prioridades, tecnicos] = await Promise.all([
    pool
      .request()
      .query(
        "SELECT idEstatus,nombre,color,colorBg,orden FROM cat_estatus_desarrollo WHERE activo=1 ORDER BY orden",
      ),
    pool
      .request()
      .query(
        "SELECT idTipo,nombre,icono,codigo FROM cat_tipo_solicitud_dev WHERE activo=1 ORDER BY idTipo",
      ),
    pool
      .request()
      .query(
        "SELECT id,desarrollo,loginResponsable FROM desarrollosTI ORDER BY desarrollo",
      ),
    pool
      .request()
      .query(
        "SELECT idPrioridad,prioridad AS nombre,colorHex AS color,slaRespuestaHrs,slaResolucionHrs FROM cat_prioridad ORDER BY idPrioridad",
      ),
    pool
      .request()
      .query(
        "SELECT login,name AS nombre,email FROM sec_users WHERE area='SISTEMAS' AND active='Y' ORDER BY name",
      ),
  ]);
  return {
    estatus: estatus.recordset,
    tipos: tipos.recordset,
    sistemas: sistemas.recordset,
    prioridades: prioridades.recordset,
    tecnicos: tecnicos.recordset,
  };
}

// ════════════════════════════════════════════════════════════
// getKpis
// ════════════════════════════════════════════════════════════
async function getKpis(loginUsuario) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("idServicio", sql.Int, ID_SERVICIO)
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT
        SUM(CASE WHEN s.idEstatus=1 THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN s.idEstatus=2 THEN 1 ELSE 0 END) AS enEvaluacion,
        SUM(CASE WHEN s.idEstatus=3 THEN 1 ELSE 0 END) AS enDesarrollo,
        SUM(CASE WHEN s.idEstatus=4 THEN 1 ELSE 0 END) AS enRevision,
        SUM(CASE WHEN s.idEstatus=5 THEN 1 ELSE 0 END) AS enPruebas,
        SUM(CASE WHEN s.idEstatus=7 THEN 1 ELSE 0 END) AS concluidos,
        SUM(CASE WHEN s.idEstatus=6 THEN 1 ELSE 0 END) AS cancelados,
        SUM(CASE WHEN s.idEstatus NOT IN(6,7) AND dd.fechaCompromiso IS NOT NULL AND GETDATE()>dd.fechaCompromiso THEN 1 ELSE 0 END) AS vencidos,
        SUM(CASE WHEN s.tecnicoAsignado=@login AND s.idEstatus NOT IN(6,7) THEN 1 ELSE 0 END) AS misAsignados
      FROM solicitudTI s
      LEFT JOIN solicitudTI_desarrollo_detalle dd ON s.idSolicitud=dd.idSolicitud
      WHERE s.idServicio=@idServicio
    `);
  return r.recordset[0];
}

// ════════════════════════════════════════════════════════════
// getLista
// ════════════════════════════════════════════════════════════
async function getLista(query) {
  const pool = await getPool();
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 20);
  const offset = (page - 1) * limit;
  const colMap = {
    fecha: "s.fechaCreacion",
    folio: "JSON_VALUE(s.camposExtra,'$.folioDesarrollo')",
    prioridad: "s.idPrioridad",
    estatus: "s.idEstatus",
    titulo: "s.titulo",
    actualizado: "s.fechaActualizacion",
    solicitante: "s.nombreUsuario",
    compromiso: "dd.fechaCompromiso",
    avance: "dd.porcentajeAvance",
  };
  const orderBy = colMap[query.orderBy] || "s.fechaCreacion";
  const orderDir = query.dir === "asc" ? "ASC" : "DESC";
  const conds = ["s.idServicio=@idServicio"];
  const req = pool.request().input("idServicio", sql.Int, ID_SERVICIO);
  if (query.buscar?.trim()) {
    conds.push(
      "(JSON_VALUE(s.camposExtra,'$.folioDesarrollo') LIKE @b OR s.titulo LIKE @b OR s.nombreUsuario LIKE @b OR dt.desarrollo LIKE @b)",
    );
    req.input("b", sql.VarChar(300), `%${query.buscar.trim()}%`);
  }
  if (query.estatus) {
    conds.push("s.idEstatus=@est");
    req.input("est", sql.Int, parseInt(query.estatus));
  }
  if (query.tipo) {
    conds.push("dd.idTipo=@tipo");
    req.input("tipo", sql.Int, parseInt(query.tipo));
  }
  if (query.prioridad) {
    conds.push("s.idPrioridad=@pri");
    req.input("pri", sql.Int, parseInt(query.prioridad));
  }
  if (query.responsable) {
    conds.push("s.tecnicoAsignado=@resp");
    req.input("resp", sql.VarChar(255), query.responsable);
  }
  if (query.sistema) {
    conds.push("dd.idDesarrollo=@sis");
    req.input("sis", sql.Int, parseInt(query.sistema));
  }
  if (query.vencidas === "true")
    conds.push(
      "s.idEstatus NOT IN(6,7) AND dd.fechaCompromiso IS NOT NULL AND GETDATE()>dd.fechaCompromiso",
    );
  req.input("offset", sql.Int, offset).input("limit", sql.Int, limit);
  const result = await req.query(`
    SELECT
      s.idSolicitud,
      ISNULL(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'),s.folio) AS folioDesarrollo,
      s.titulo, s.nombreUsuario AS solicitante, s.areaUsuario AS area, s.sitioUsuario AS sitio,
      s.idPrioridad, s.idEstatus,
      s.tecnicoAsignado AS loginResponsable, s.nombreTecnico AS nombreResponsable,
      s.fechaCreacion, s.fechaActualizacion,
      dd.idDesarrollo,dd.idTipo,dd.fechaCompromiso,dd.fechaInicio,dd.porcentajeAvance,dd.motivoRevision,
      dd.tipoDesarrollo,
      ced.nombre AS estatusNombre, ced.color AS estatusColor, ced.colorBg AS estatusBg,
      ctd.nombre AS tipoNombre, ctd.codigo AS tipoCodigo,
      cp.prioridad AS prioridadNombre, cp.colorHex AS prioridadColor,
      dt.desarrollo AS sistemaNombre,
      -- Bloqueo activo
      (SELECT COUNT(*) FROM solicitudTI_desarrollo_bloqueos b WHERE b.idSolicitud=s.idSolicitud AND b.fechaResolucion IS NULL) AS bloqueosActivos,
      CASE WHEN s.idEstatus IN(6,7) THEN 'terminal'
           WHEN dd.fechaCompromiso IS NULL THEN 'sin_fecha'
           WHEN GETDATE()>dd.fechaCompromiso THEN 'vencido'
           WHEN DATEDIFF(DAY,GETDATE(),dd.fechaCompromiso)<=3 THEN 'proximo'
           ELSE 'en_tiempo' END AS tiempoEstado,
      DATEDIFF(DAY,GETDATE(),dd.fechaCompromiso) AS diasRestantes,
      DATEDIFF(DAY,s.fechaCreacion,GETDATE()) AS diasAbiertos,
      CASE WHEN dd.fechaInicio IS NOT NULL AND dd.fechaCompromiso IS NOT NULL
           THEN DATEDIFF(DAY,dd.fechaInicio,dd.fechaCompromiso)
           ELSE DATEDIFF(DAY,s.fechaCreacion,dd.fechaCompromiso) END AS duracionTotal,
      CASE WHEN dd.fechaInicio IS NOT NULL THEN DATEDIFF(DAY,dd.fechaInicio,GETDATE())
           ELSE DATEDIFF(DAY,s.fechaCreacion,GETDATE()) END AS diasTranscurridos,
      COUNT(*) OVER() AS totalRegistros
    FROM solicitudTI s
    LEFT JOIN solicitudTI_desarrollo_detalle dd ON s.idSolicitud=dd.idSolicitud
    LEFT JOIN cat_estatus_desarrollo ced ON s.idEstatus=ced.idEstatus
    LEFT JOIN cat_tipo_solicitud_dev ctd ON dd.idTipo=ctd.idTipo
    LEFT JOIN cat_prioridad cp ON s.idPrioridad=cp.idPrioridad
    LEFT JOIN desarrollosTI dt ON dd.idDesarrollo=dt.id
    WHERE ${conds.join(" AND ")}
    ORDER BY ${orderBy} ${orderDir}
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);
  return {
    data: result.recordset,
    total: result.recordset[0]?.totalRegistros ?? 0,
    page,
    limit,
  };
}

// ════════════════════════════════════════════════════════════
// getDetalle — incluye horas, subtareas, bloqueos
// ════════════════════════════════════════════════════════════
async function getDetalle(idSolicitud) {
  const pool = await getPool();
  const [
    principal,
    adjuntos,
    comentarios,
    bitacoraRows,
    actividades,
    evaluacion,
    impactos,
    horas,
    subtareas,
    bloqueos,
  ] = await Promise.all([
    pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .input("srv", sql.Int, ID_SERVICIO).query(`
        SELECT s.*,
          ISNULL(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'),s.folio) AS folioDesarrollo,
          dd.idDesarrollo,dd.idTipo,dd.justificacion,dd.beneficioEsperado,dd.impacto,dd.objetivo,
          dd.fechaCompromiso,dd.fechaInicio,dd.motivoRechazo,dd.motivoRevision,dd.impactaOtrasAreas,
          dd.loginConcluyo,dd.fechaConclusión,dd.porcentajeAvance,dd.horasEstimadas,
          dd.tipoDesarrollo,
          ced.nombre AS estatusNombre, ced.color AS estatusColor, ced.colorBg AS estatusBg,
          ctd.nombre AS tipoNombre, ctd.codigo AS tipoCodigo,
          cp.prioridad AS prioridadNombre, cp.colorHex AS prioridadColor,
          dt.desarrollo AS sistemaNombre,
          DATEDIFF(DAY,GETDATE(),dd.fechaCompromiso) AS diasRestantes,
          DATEDIFF(DAY,s.fechaCreacion,GETDATE()) AS diasAbiertos,
          CASE WHEN dd.fechaInicio IS NOT NULL AND dd.fechaCompromiso IS NOT NULL
               THEN DATEDIFF(DAY,dd.fechaInicio,dd.fechaCompromiso)
               ELSE DATEDIFF(DAY,s.fechaCreacion,dd.fechaCompromiso) END AS duracionTotal,
          CASE WHEN dd.fechaInicio IS NOT NULL THEN DATEDIFF(DAY,dd.fechaInicio,GETDATE())
               ELSE DATEDIFF(DAY,s.fechaCreacion,GETDATE()) END AS diasTranscurridos,
          CASE WHEN s.idEstatus IN(6,7) THEN 'terminal'
               WHEN dd.fechaCompromiso IS NULL THEN 'sin_fecha'
               WHEN GETDATE()>dd.fechaCompromiso THEN 'vencido'
               WHEN DATEDIFF(DAY,GETDATE(),dd.fechaCompromiso)<=3 THEN 'proximo'
               ELSE 'en_tiempo' END AS tiempoEstado
        FROM solicitudTI s
        LEFT JOIN solicitudTI_desarrollo_detalle dd ON s.idSolicitud=dd.idSolicitud
        LEFT JOIN cat_estatus_desarrollo ced ON s.idEstatus=ced.idEstatus
        LEFT JOIN cat_tipo_solicitud_dev ctd ON dd.idTipo=ctd.idTipo
        LEFT JOIN cat_prioridad cp ON s.idPrioridad=cp.idPrioridad
        LEFT JOIN desarrollosTI dt ON dd.idDesarrollo=dt.id
        WHERE s.idSolicitud=@id AND s.idServicio=@srv
      `),
    pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .query(
        "SELECT idArchivo,nombreArchivo,rutaServidor,mimeType,tamanoBytes,fechaSubida FROM solicitudTI_archivos WHERE idSolicitud=@id ORDER BY fechaSubida",
      ),
    pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .query(
        "SELECT idComentario,idUsuario,nombreUsuario,comentario,esInterno,fecha FROM solicitudTI_comentarios WHERE idSolicitud=@id ORDER BY fecha",
      ),
    pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .query(
        "SELECT idBitacora,idUsuario,nombreUsuario,nota,fecha FROM solicitudTI_bitacora WHERE idSolicitud=@id ORDER BY fecha",
      ),
    pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .query(
        "SELECT idActividad,idUsuario,nombreUsuario,actividad,fecha FROM solicitudTI_desarrollo_actividades WHERE idSolicitud=@id ORDER BY fecha",
      ),
    pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .query(
        "SELECT idEvaluacion,satisfaccion,cumplimiento,tiempoEntrega,calidad,comentarios,loginEvaluador,fechaEvaluacion FROM solicitudTI_desarrollo_evaluacion WHERE idSolicitud=@id",
      ),
    pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .query(
        "SELECT idImpacto,area,motivo,registradoPor,fecha FROM solicitudTI_desarrollo_impactos WHERE idSolicitud=@id ORDER BY fecha",
      ),
    pool.request().input("id", sql.Int, idSolicitud).query(`
        SELECT idRegistro,loginUsuario,nombreUsuario,minutosTrabajos,descripcion,fechaRegistro,fechaTrabajo,
          SUM(minutosTrabajos) OVER() AS totalMinutos,
          SUM(CASE WHEN CAST(fechaTrabajo AS DATE)=CAST(GETDATE() AS DATE) THEN minutosTrabajos ELSE 0 END) OVER() AS minutosHoy,
          SUM(CASE WHEN fechaTrabajo >= DATEADD(DAY,-DATEPART(WEEKDAY,GETDATE())+1,CAST(GETDATE() AS DATE)) THEN minutosTrabajos ELSE 0 END) OVER() AS minutosSemana
        FROM solicitudTI_desarrollo_horas WHERE idSolicitud=@id ORDER BY fechaTrabajo DESC,fechaRegistro DESC
      `),
    pool.request().input("id", sql.Int, idSolicitud).query(`
        SELECT st.*,
          ced.nombre AS estatusNombre, ced.color AS estatusColor, ced.colorBg AS estatusBg,
          cp.prioridad AS prioridadNombre, cp.colorHex AS prioridadColor
        FROM solicitudTI_desarrollo_subtarea st
        LEFT JOIN cat_estatus_desarrollo ced ON st.idEstatus=ced.idEstatus
        LEFT JOIN cat_prioridad cp ON st.idPrioridad=cp.idPrioridad
        WHERE st.idSolicitud=@id ORDER BY st.orden,st.fechaCreacion
      `),
    pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .query(
        "SELECT idBloqueo,motivo,registradoPor,nombreRegistro,fechaBloqueo,fechaResolucion,resueltoPor FROM solicitudTI_desarrollo_bloqueos WHERE idSolicitud=@id ORDER BY fechaBloqueo DESC",
      ),
  ]);

  if (!principal.recordset.length) return null;
  const h = horas.recordset;
  return {
    ...principal.recordset[0],
    adjuntos: adjuntos.recordset,
    comentarios: comentarios.recordset,
    bitacora: bitacoraRows.recordset,
    actividades: actividades.recordset,
    evaluacion: evaluacion.recordset[0] ?? null,
    impactos: impactos.recordset,
    horas: h,
    horasResumen:
      h.length > 0
        ? {
            totalMinutos: h[0].totalMinutos,
            minutosHoy: h[0].minutosHoy,
            minutosSemana: h[0].minutosSemana,
          }
        : { totalMinutos: 0, minutosHoy: 0, minutosSemana: 0 },
    subtareas: subtareas.recordset,
    bloqueos: bloqueos.recordset,
  };
}

// ════════════════════════════════════════════════════════════
// crearSolicitud
// ════════════════════════════════════════════════════════════
async function crearSolicitud(body, userJwt, files = []) {
  const pool = await getPool();
  const idTipo = parseInt(body.idTipo) || 1;
  const folio = await generarFolio(pool, idTipo);
  let fechaLimite = null;
  if (body.idPrioridad) {
    const prio = await pool
      .request()
      .input("idP", sql.Int, parseInt(body.idPrioridad))
      .query(
        "SELECT slaResolucionHrs FROM cat_prioridad WHERE idPrioridad=@idP",
      );
    const hrs = prio.recordset[0]?.slaResolucionHrs;
    if (hrs) {
      fechaLimite = new Date();
      fechaLimite.setHours(fechaLimite.getHours() + hrs);
    }
  }
  const ins = await pool
    .request()
    .input("idServicio", sql.Int, ID_SERVICIO)
    .input("titulo", sql.NVarChar(300), body.titulo?.trim())
    .input("descripcion", sql.NVarChar(sql.MAX), body.descripcion?.trim())
    .input("idUsuario", sql.VarChar(255), userJwt.login)
    .input("nombreUsuario", sql.NVarChar(200), userJwt.name)
    .input("areaUsuario", sql.NVarChar(100), userJwt.area ?? null)
    .input("sitioUsuario", sql.NVarChar(100), userJwt.sitio ?? null)
    .input("idPrioridad", sql.Int, parseInt(body.idPrioridad) || null)
    .input("idEstatus", sql.Int, 1)
    .input("fechaLimite", sql.DateTime, fechaLimite)
    .input(
      "camposExtra",
      sql.NVarChar(sql.MAX),
      JSON.stringify({ folioDesarrollo: folio }),
    )
    .query(`INSERT INTO solicitudTI(idServicio,titulo,descripcion,idUsuario,nombreUsuario,areaUsuario,sitioUsuario,idPrioridad,idEstatus,fechaLimiteResol,camposExtra,fechaCreacion,fechaActualizacion)
      OUTPUT INSERTED.idSolicitud
      VALUES(@idServicio,@titulo,@descripcion,@idUsuario,@nombreUsuario,@areaUsuario,@sitioUsuario,@idPrioridad,@idEstatus,@fechaLimite,@camposExtra,GETDATE(),GETDATE())`);
  const idSolicitud = ins.recordset[0].idSolicitud;
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("idTipo", sql.Int, idTipo)
    .input("idDev", sql.Int, parseInt(body.idDesarrollo) || null)
    .input("justif", sql.NVarChar(sql.MAX), body.justificacion?.trim() || null)
    .input("objetivo", sql.NVarChar(sql.MAX), body.objetivo?.trim() || null)
    .input(
      "beneficio",
      sql.NVarChar(sql.MAX),
      body.beneficioEsperado?.trim() || null,
    )
    .query(
      "INSERT INTO solicitudTI_desarrollo_detalle(idSolicitud,idTipo,idDesarrollo,justificacion,objetivo,beneficioEsperado) VALUES(@id,@idTipo,@idDev,@justif,@objetivo,@beneficio)",
    );
  for (const f of files) {
    await pool
      .request()
      .input("idSol", sql.Int, idSolicitud)
      .input("nombre", sql.VarChar(255), f.originalname)
      .input("ruta", sql.VarChar(500), `/uploads/solicitudes/${f.filename}`)
      .input("mime", sql.VarChar(100), f.mimetype)
      .input("size", sql.BigInt, f.size)
      .query(
        "INSERT INTO solicitudTI_archivos(idSolicitud,nombreArchivo,rutaServidor,mimeType,tamanoBytes,fechaSubida) VALUES(@idSol,@nombre,@ruta,@mime,@size,GETDATE())",
      );
  }
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: `${userJwt.name} registró la solicitud de desarrollo`,
  });
  return { idSolicitud, folio };
}

// ════════════════════════════════════════════════════════════
// cambiarEstatus
// ════════════════════════════════════════════════════════════
async function cambiarEstatus(idSolicitud, body, userJwt) {
  const pool = await getPool();
  const idEstatus = parseInt(body.idEstatus);
  if (idEstatus !== 6) {
    const chk = await pool
      .request()
      .input("id", sql.Int, idSolicitud)
      .query("SELECT tecnicoAsignado FROM solicitudTI WHERE idSolicitud=@id");
    if (!chk.recordset[0]?.tecnicoAsignado)
      throw new Error(
        "Debes asignar un responsable antes de avanzar el estatus.",
      );
  }
  if (idEstatus === 6 && !body.motivoRechazo?.trim())
    throw new Error("El motivo de cancelación es obligatorio.");
  if (idEstatus === 4 && !body.motivoRevision?.trim())
    throw new Error("El motivo de revisión es obligatorio.");
  if (idEstatus === 3 && !body.fechaCompromiso)
    throw new Error(
      "La fecha compromiso es obligatoria al iniciar el desarrollo.",
    );
  const actual = await pool.request().input("id", sql.Int, idSolicitud).query(`
    SELECT s.idEstatus,s.idUsuario,ced.nombre AS estatusNombre,
           ISNULL(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'),s.folio) AS folioDesarrollo
    FROM solicitudTI s LEFT JOIN cat_estatus_desarrollo ced ON s.idEstatus=ced.idEstatus WHERE s.idSolicitud=@id
  `);
  const row = actual.recordset[0];
  const estatusAnterior = row?.estatusNombre || "—";
  const loginSolicitante = row?.idUsuario;
  const folioDesarrollo = row?.folioDesarrollo;
  const nuevoEst = await pool
    .request()
    .input("e", sql.Int, idEstatus)
    .query("SELECT nombre FROM cat_estatus_desarrollo WHERE idEstatus=@e");
  const estatusNuevo = nuevoEst.recordset[0]?.nombre || String(idEstatus);
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("est", sql.Int, idEstatus)
    .query(
      "UPDATE solicitudTI SET idEstatus=@est,fechaActualizacion=GETDATE(),fechaResolucion=CASE WHEN @est=7 THEN GETDATE() ELSE fechaResolucion END WHERE idSolicitud=@id",
    );
  const det = pool.request().input("id", sql.Int, idSolicitud);
  if (idEstatus === 6) {
    det.input("motivo", sql.NVarChar(sql.MAX), body.motivoRechazo);
    await det.query(
      "UPDATE solicitudTI_desarrollo_detalle SET motivoRechazo=@motivo WHERE idSolicitud=@id",
    );
  }
  if (idEstatus === 4) {
    det.input("motivo", sql.NVarChar(sql.MAX), body.motivoRevision);
    await det.query(
      "UPDATE solicitudTI_desarrollo_detalle SET motivoRevision=@motivo WHERE idSolicitud=@id",
    );
  }
  if (idEstatus === 3) {
    det.input("compromiso", sql.DateTime, new Date(body.fechaCompromiso));
    await det.query(
      "UPDATE solicitudTI_desarrollo_detalle SET fechaInicio=CASE WHEN fechaInicio IS NULL THEN GETDATE() ELSE fechaInicio END,fechaCompromiso=@compromiso WHERE idSolicitud=@id",
    );
  }
  if (idEstatus === 7) {
    det.input("login", sql.VarChar(255), userJwt.login);
    await det.query(
      "UPDATE solicitudTI_desarrollo_detalle SET fechaConclusión=GETDATE(),loginConcluyo=@login WHERE idSolicitud=@id",
    );
  }
  const motivo = body.motivoRevision || body.motivoRechazo || "";
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota:
      idEstatus === 3
        ? `Estatus cambiado de "${estatusAnterior}" a "${estatusNuevo}" — Fecha compromiso: ${body.fechaCompromiso}`
        : `Estatus cambiado de "${estatusAnterior}" a "${estatusNuevo}"${motivo ? ` — Motivo: ${motivo}` : ""}`,
  });
  if (loginSolicitante && loginSolicitante !== userJwt.login) {
    try {
      await crearNotificacion({
        loginDestino: loginSolicitante,
        loginOrigen: userJwt.login,
        idTipo: TIPOS.ESTATUS_CAMBIO,
        idSolicitud,
        titulo: "Cambio de estado en tu solicitud",
        descripcion: `Tu solicitud ${folioDesarrollo} cambió a "${estatusNuevo}"`,
        urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${folioDesarrollo}`,
      });
    } catch (e) {
      console.error("[Notif] cambiarEstatus:", e.message);
    }
  }
  return { ok: true, idEstatus, estatusNuevo };
}

// ════════════════════════════════════════════════════════════
// concluirDesarrollo
// ════════════════════════════════════════════════════════════
async function concluirDesarrollo(idSolicitud, body, userJwt) {
  const pool = await getPool();
  if (!body.actividadesRealizadas?.trim())
    throw new Error(
      "Debes describir las actividades realizadas para concluir.",
    );
  const chk = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query("SELECT tecnicoAsignado FROM solicitudTI WHERE idSolicitud=@id");
  if (!chk.recordset[0]?.tecnicoAsignado)
    throw new Error("Debes asignar un responsable antes de concluir.");
  const actual = await pool.request().input("id", sql.Int, idSolicitud).query(`
    SELECT s.idEstatus,s.idUsuario,ced.nombre AS estatusNombre,
           ISNULL(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'),s.folio) AS folioDesarrollo
    FROM solicitudTI s LEFT JOIN cat_estatus_desarrollo ced ON s.idEstatus=ced.idEstatus WHERE s.idSolicitud=@id
  `);
  const row = actual.recordset[0];
  const loginSolicitante = row?.idUsuario;
  const folioDesarrollo = row?.folioDesarrollo;
  const estatusAnterior = row?.estatusNombre || "—";
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      "UPDATE solicitudTI SET idEstatus=7,fechaActualizacion=GETDATE(),fechaResolucion=GETDATE() WHERE idSolicitud=@id",
    );
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar(255), userJwt.login)
    .input("impacta", sql.Bit, body.impactaOtrasAreas ? 1 : 0)
    .query(
      "UPDATE solicitudTI_desarrollo_detalle SET fechaConclusión=GETDATE(),loginConcluyo=@login,porcentajeAvance=100,impactaOtrasAreas=@impacta WHERE idSolicitud=@id",
    );
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar(255), userJwt.login)
    .input("nombre", sql.NVarChar(200), userJwt.name)
    .input("act", sql.NVarChar(sql.MAX), body.actividadesRealizadas.trim())
    .query(
      "INSERT INTO solicitudTI_desarrollo_actividades(idSolicitud,idUsuario,nombreUsuario,actividad,fecha) VALUES(@id,@login,@nombre,@act,GETDATE())",
    );
  if (body.impactaOtrasAreas && Array.isArray(body.impactos)) {
    for (const imp of body.impactos) {
      if (imp.area?.trim() && imp.motivo?.trim()) {
        await pool
          .request()
          .input("id", sql.Int, idSolicitud)
          .input("area", sql.NVarChar(100), imp.area)
          .input("motivo", sql.NVarChar(sql.MAX), imp.motivo)
          .input("login", sql.VarChar(255), userJwt.login)
          .query(
            "INSERT INTO solicitudTI_desarrollo_impactos(idSolicitud,area,motivo,registradoPor,fecha) VALUES(@id,@area,@motivo,@login,GETDATE())",
          );
      }
    }
  }
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: `Estatus cambiado de "${estatusAnterior}" a "Concluido" — Actividades: ${body.actividadesRealizadas.trim().slice(0, 200)}`,
  });
  if (loginSolicitante && loginSolicitante !== userJwt.login) {
    try {
      await crearNotificacion({
        loginDestino: loginSolicitante,
        loginOrigen: userJwt.login,
        idTipo: TIPOS.TICKET_CERRADO,
        idSolicitud,
        titulo: "Tu solicitud fue concluida",
        descripcion: `Tu solicitud ${folioDesarrollo} ha sido concluida. Ya puedes revisarla y evaluarla.`,
        urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${folioDesarrollo}`,
      });
    } catch (e) {
      console.error("[Notif] concluirDesarrollo:", e.message);
    }
  }
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// asignarResponsable
// ════════════════════════════════════════════════════════════
async function asignarResponsable(idSolicitud, body, userJwt) {
  const pool = await getPool();
  const login = body.loginResponsable || userJwt.login;
  const nombre = body.nombreResponsable || userJwt.name;
  const { tipoDesarrollo } = body;

  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar(255), login)
    .input("nombre", sql.NVarChar(200), nombre)
    .query(
      "UPDATE solicitudTI SET tecnicoAsignado=@login,nombreTecnico=@nombre,fechaActualizacion=GETDATE() WHERE idSolicitud=@id",
    );

  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: body.loginResponsable
      ? `Responsable asignado: ${nombre}`
      : `${nombre} se auto-asignó como responsable`,
  });

  if (tipoDesarrollo) {
    await pool
      .request()
      .input("idSolicitud", sql.Int, parseInt(idSolicitud))
      .input("tipoDesarrollo", sql.VarChar(30), tipoDesarrollo)
      .query(
        "UPDATE solicitudTI_desarrollo_detalle SET tipoDesarrollo=@tipoDesarrollo WHERE idSolicitud=@idSolicitud",
      );
  }

  return { ok: true, loginResponsable: login, nombreResponsable: nombre };
}

// ════════════════════════════════════════════════════════════
// actualizarDetalle
// ════════════════════════════════════════════════════════════
async function actualizarDetalle(idSolicitud, body, userJwt) {
  const pool = await getPool();

  // Validar responsable antes de actualizar
  const check = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query("SELECT tecnicoAsignado FROM solicitudTI WHERE idSolicitud=@id");
  if (!check.recordset[0]?.tecnicoAsignado) {
    return {
      ok: false,
      message:
        "Asigna un responsable antes de actualizar el avance o la fecha del desarrollo.",
    };
  }

  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("idDev", sql.Int, body.idDesarrollo ?? null)
    .input("idTipo", sql.Int, body.idTipo ?? null)
    .input("justif", sql.NVarChar(sql.MAX), body.justificacion ?? null)
    .input("objetivo", sql.NVarChar(sql.MAX), body.objetivo ?? null)
    .input("beneficio", sql.NVarChar(sql.MAX), body.beneficioEsperado ?? null)
    .input("avance", sql.TinyInt, body.porcentajeAvance ?? null)
    .input("hrsEst", sql.Int, body.horasEstimadas ?? null)
    .input(
      "compromiso",
      sql.DateTime,
      body.fechaCompromiso ? new Date(body.fechaCompromiso) : null,
    ).query(`
      MERGE solicitudTI_desarrollo_detalle AS t USING(SELECT @id AS idSolicitud) AS s ON t.idSolicitud=s.idSolicitud
      WHEN MATCHED THEN UPDATE SET
        idDesarrollo=ISNULL(@idDev,idDesarrollo),idTipo=ISNULL(@idTipo,idTipo),
        justificacion=ISNULL(@justif,justificacion),objetivo=ISNULL(@objetivo,objetivo),
        beneficioEsperado=ISNULL(@beneficio,beneficioEsperado),porcentajeAvance=ISNULL(@avance,porcentajeAvance),
        horasEstimadas=ISNULL(@hrsEst,horasEstimadas),fechaCompromiso=ISNULL(@compromiso,fechaCompromiso)
      WHEN NOT MATCHED THEN INSERT(idSolicitud,idDesarrollo,idTipo,justificacion,objetivo,beneficioEsperado,porcentajeAvance,horasEstimadas,fechaCompromiso)
        VALUES(@id,@idDev,@idTipo,@justif,@objetivo,@beneficio,@avance,@hrsEst,@compromiso);
    `);
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      "UPDATE solicitudTI SET fechaActualizacion=GETDATE() WHERE idSolicitud=@id",
    );
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: `${userJwt.name} actualizó los detalles del desarrollo`,
  });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// agregarComentario
// ════════════════════════════════════════════════════════════
async function agregarComentario(idSolicitud, body, userJwt) {
  const pool = await getPool();
  const r = await pool
    .request()
    .input("idSol", sql.Int, idSolicitud)
    .input("login", sql.VarChar(255), userJwt.login)
    .input("nombre", sql.NVarChar(200), userJwt.name)
    .input("texto", sql.NVarChar(sql.MAX), body.comentario?.trim()).query(`
      INSERT INTO solicitudTI_comentarios(idSolicitud,idUsuario,nombreUsuario,comentario,fecha)
      OUTPUT INSERTED.idComentario,INSERTED.fecha VALUES(@idSol,@login,@nombre,@texto,GETDATE())`);
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      "UPDATE solicitudTI SET fechaActualizacion=GETDATE() WHERE idSolicitud=@id",
    );
  const nuevo = r.recordset[0];
  return {
    ok: true,
    idComentario: nuevo.idComentario,
    fecha: nuevo.fecha,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    comentario: body.comentario,
  };
}

// ════════════════════════════════════════════════════════════
// agregarActividad
// ════════════════════════════════════════════════════════════
async function agregarActividad(idSolicitud, body, userJwt) {
  const pool = await getPool();
  if (!body.actividad?.trim())
    throw new Error("La actividad no puede estar vacía.");
  const r = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar(255), userJwt.login)
    .input("nombre", sql.NVarChar(200), userJwt.name)
    .input("act", sql.NVarChar(sql.MAX), body.actividad.trim()).query(`
      INSERT INTO solicitudTI_desarrollo_actividades(idSolicitud,idUsuario,nombreUsuario,actividad,fecha)
      OUTPUT INSERTED.idActividad,INSERTED.fecha VALUES(@id,@login,@nombre,@act,GETDATE())`);
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      "UPDATE solicitudTI SET fechaActualizacion=GETDATE() WHERE idSolicitud=@id",
    );
  const sol = await getSolicitante(pool, idSolicitud);
  if (sol && sol.idUsuario !== userJwt.login) {
    try {
      const resumen =
        body.actividad.trim().slice(0, 100) +
        (body.actividad.trim().length > 100 ? "…" : "");
      await crearNotificacion({
        loginDestino: sol.idUsuario,
        loginOrigen: userJwt.login,
        idTipo: TIPOS.COMENTARIO_NUEVO,
        idSolicitud,
        titulo: "Nueva actividad en tu solicitud",
        descripcion: `${userJwt.name} registró una actividad en ${sol.folioDesarrollo}: "${resumen}"`,
        urlDestino: `/mesa-de-servicio/mis-solicitudes?folio=${sol.folioDesarrollo}`,
      });
    } catch (e) {
      console.error("[Notif] agregarActividad:", e.message);
    }
  }
  return { ok: true, ...r.recordset[0] };
}

// ════════════════════════════════════════════════════════════
// HORAS TRABAJADAS
// ════════════════════════════════════════════════════════════
async function registrarHoras(idSolicitud, body, userJwt) {
  const pool = await getPool();
  const minutos = parseInt(body.minutosTrabajos);
  if (!minutos || minutos <= 0)
    throw new Error("El tiempo trabajado debe ser mayor a cero.");
  const fechaTrabajo = body.fechaTrabajo
    ? new Date(body.fechaTrabajo)
    : new Date();
  const r = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("login", sql.VarChar(255), userJwt.login)
    .input("nombre", sql.NVarChar(200), userJwt.name)
    .input("min", sql.Int, minutos)
    .input("desc", sql.NVarChar(500), body.descripcion?.trim() || null)
    .input("fecha", sql.Date, fechaTrabajo).query(`
      INSERT INTO solicitudTI_desarrollo_horas(idSolicitud,loginUsuario,nombreUsuario,minutosTrabajos,descripcion,fechaRegistro,fechaTrabajo)
      OUTPUT INSERTED.idRegistro,INSERTED.fechaRegistro
      VALUES(@id,@login,@nombre,@min,@desc,GETDATE(),@fecha)
    `);
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: `${userJwt.name} registró ${fmtMinutos(minutos)} de trabajo${body.descripcion ? `: "${body.descripcion.trim().slice(0, 80)}"` : ""}`,
  });
  return { ok: true, ...r.recordset[0] };
}

async function eliminarHoras(idSolicitud, idRegistro, userJwt) {
  const pool = await getPool();
  const chk = await pool
    .request()
    .input("id", sql.Int, idRegistro)
    .input("login", sql.VarChar(255), userJwt.login)
    .query(
      "SELECT idRegistro,minutosTrabajos FROM solicitudTI_desarrollo_horas WHERE idRegistro=@id AND loginUsuario=@login AND fechaRegistro >= DATEADD(HOUR,-24,GETDATE())",
    );
  if (!chk.recordset.length)
    throw new Error("No puedes eliminar este registro.");
  await pool
    .request()
    .input("id", sql.Int, idRegistro)
    .query("DELETE FROM solicitudTI_desarrollo_horas WHERE idRegistro=@id");
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// SUBTAREAS
// ════════════════════════════════════════════════════════════
async function crearSubtarea(idSolicitud, body, userJwt) {
  const pool = await getPool();
  if (!body.titulo?.trim())
    throw new Error("El título de la subtarea es obligatorio.");
  const ord = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      "SELECT ISNULL(MAX(orden),0)+1 AS siguiente FROM solicitudTI_desarrollo_subtarea WHERE idSolicitud=@id",
    );
  const orden = ord.recordset[0].siguiente;
  const r = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("titulo", sql.NVarChar(200), body.titulo.trim())
    .input("desc", sql.NVarChar(sql.MAX), body.descripcion?.trim() || null)
    .input("est", sql.Int, body.idEstatus || 1)
    .input("pri", sql.TinyInt, body.idPrioridad || null)
    .input("loginResp", sql.VarChar(255), body.loginResponsable || null)
    .input("nombreResp", sql.NVarChar(200), body.nombreResponsable || null)
    .input("fi", sql.Date, body.fechaInicio ? new Date(body.fechaInicio) : null)
    .input(
      "fc",
      sql.Date,
      body.fechaCompromiso ? new Date(body.fechaCompromiso) : null,
    )
    .input("orden", sql.Int, orden)
    .input("creadoPor", sql.VarChar(255), userJwt.login).query(`
      INSERT INTO solicitudTI_desarrollo_subtarea(idSolicitud,titulo,descripcion,idEstatus,idPrioridad,loginResponsable,nombreResponsable,fechaInicio,fechaCompromiso,orden,creadoPor)
      OUTPUT INSERTED.idSubtarea,INSERTED.fechaCreacion
      VALUES(@id,@titulo,@desc,@est,@pri,@loginResp,@nombreResp,@fi,@fc,@orden,@creadoPor)
    `);
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: `${userJwt.name} creó la subtarea: "${body.titulo.trim()}"`,
  });
  return { ok: true, ...r.recordset[0] };
}

async function actualizarSubtarea(idSolicitud, idSubtarea, body, userJwt) {
  const pool = await getPool();
  const det = pool
    .request()
    .input("id", sql.Int, idSubtarea)
    .input("sol", sql.Int, idSolicitud);
  const sets = [];
  if (body.titulo !== undefined) {
    det.input("titulo", sql.NVarChar(200), body.titulo);
    sets.push("titulo=@titulo");
  }
  if (body.descripcion !== undefined) {
    det.input("desc", sql.NVarChar(sql.MAX), body.descripcion);
    sets.push("descripcion=@desc");
  }
  if (body.idEstatus !== undefined) {
    det.input("est", sql.Int, body.idEstatus);
    sets.push("idEstatus=@est");
  }
  if (body.idPrioridad !== undefined) {
    det.input("pri", sql.TinyInt, body.idPrioridad);
    sets.push("idPrioridad=@pri");
  }
  if (body.loginResponsable !== undefined) {
    det.input("loginResp", sql.VarChar(255), body.loginResponsable);
    det.input("nombreResp", sql.NVarChar(200), body.nombreResponsable || "");
    sets.push("loginResponsable=@loginResp,nombreResponsable=@nombreResp");
  }
  if (body.porcentajeAvance !== undefined) {
    det.input("avance", sql.TinyInt, body.porcentajeAvance);
    sets.push("porcentajeAvance=@avance");
  }
  if (body.fechaInicio !== undefined) {
    det.input(
      "fi",
      sql.Date,
      body.fechaInicio ? new Date(body.fechaInicio) : null,
    );
    sets.push("fechaInicio=@fi");
  }
  if (body.fechaCompromiso !== undefined) {
    det.input(
      "fc",
      sql.Date,
      body.fechaCompromiso ? new Date(body.fechaCompromiso) : null,
    );
    sets.push("fechaCompromiso=@fc");
  }
  if (body.idEstatus === 7 || body.cerrar) {
    sets.push("fechaCierre=GETDATE()");
  }
  if (!sets.length) return { ok: true };
  await det.query(
    `UPDATE solicitudTI_desarrollo_subtarea SET ${sets.join(",")} WHERE idSubtarea=@id AND idSolicitud=@sol`,
  );
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// BLOQUEOS
// ════════════════════════════════════════════════════════════
async function registrarBloqueo(idSolicitud, body, userJwt) {
  const pool = await getPool();
  if (!body.motivo?.trim())
    throw new Error("El motivo del bloqueo es obligatorio.");
  const r = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("motivo", sql.NVarChar(500), body.motivo.trim())
    .input("login", sql.VarChar(255), userJwt.login)
    .input("nombre", sql.NVarChar(200), userJwt.name).query(`
      INSERT INTO solicitudTI_desarrollo_bloqueos(idSolicitud,motivo,registradoPor,nombreRegistro,fechaBloqueo)
      OUTPUT INSERTED.idBloqueo,INSERTED.fechaBloqueo
      VALUES(@id,@motivo,@login,@nombre,GETDATE())
    `);
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: `Bloqueo registrado: "${body.motivo.trim().slice(0, 100)}"`,
  });
  return { ok: true, ...r.recordset[0] };
}

async function resolverBloqueo(idSolicitud, idBloqueo, userJwt) {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, idBloqueo)
    .input("sol", sql.Int, idSolicitud)
    .input("login", sql.VarChar(255), userJwt.login)
    .query(
      "UPDATE solicitudTI_desarrollo_bloqueos SET fechaResolucion=GETDATE(),resueltoPor=@login WHERE idBloqueo=@id AND idSolicitud=@sol",
    );
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: `Bloqueo resuelto por ${userJwt.name}`,
  });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// registrarEvaluacion — SOLO el solicitante original puede evaluar
// ════════════════════════════════════════════════════════════
async function registrarEvaluacion(idSolicitud, body, userJwt) {
  const pool = await getPool();
  const chk = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query("SELECT idEstatus,idUsuario FROM solicitudTI WHERE idSolicitud=@id");
  const row = chk.recordset[0];
  if (!row) throw new Error("Solicitud no encontrada.");
  if (row.idEstatus !== 7)
    throw new Error("Solo se puede evaluar un desarrollo concluido.");
  if (row.idUsuario !== userJwt.login)
    throw new Error(
      "Solo el solicitante original puede evaluar este desarrollo.",
    );
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("sat", sql.TinyInt, parseInt(body.satisfaccion))
    .input("cum", sql.TinyInt, parseInt(body.cumplimiento))
    .input("tiempo", sql.TinyInt, parseInt(body.tiempoEntrega))
    .input("cal", sql.TinyInt, parseInt(body.calidad))
    .input("coment", sql.NVarChar(sql.MAX), body.comentarios || null)
    .input("login", sql.VarChar(255), userJwt.login).query(`
      MERGE solicitudTI_desarrollo_evaluacion AS t USING(SELECT @id AS idSolicitud) AS s ON t.idSolicitud=s.idSolicitud
      WHEN MATCHED THEN UPDATE SET satisfaccion=@sat,cumplimiento=@cum,tiempoEntrega=@tiempo,calidad=@cal,comentarios=@coment,loginEvaluador=@login,fechaEvaluacion=GETDATE()
      WHEN NOT MATCHED THEN INSERT(idSolicitud,satisfaccion,cumplimiento,tiempoEntrega,calidad,comentarios,loginEvaluador,fechaEvaluacion)
        VALUES(@id,@sat,@cum,@tiempo,@cal,@coment,@login,GETDATE());
    `);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// registrarImpacto / subirAdjuntos
// ════════════════════════════════════════════════════════════
async function registrarImpacto(idSolicitud, body, userJwt) {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .input("impacta", sql.Bit, body.impactaOtrasAreas ? 1 : 0)
    .query(
      "UPDATE solicitudTI_desarrollo_detalle SET impactaOtrasAreas=@impacta WHERE idSolicitud=@id",
    );
  if (body.impactaOtrasAreas && Array.isArray(body.impactos)) {
    for (const imp of body.impactos) {
      await pool
        .request()
        .input("id", sql.Int, idSolicitud)
        .input("area", sql.NVarChar(100), imp.area)
        .input("motivo", sql.NVarChar(sql.MAX), imp.motivo)
        .input("login", sql.VarChar(255), userJwt.login)
        .query(
          "INSERT INTO solicitudTI_desarrollo_impactos(idSolicitud,area,motivo,registradoPor,fecha) VALUES(@id,@area,@motivo,@login,GETDATE())",
        );
    }
  }
  return { ok: true };
}

async function subirAdjuntos(idSolicitud, files, userJwt) {
  const pool = await getPool();
  const insertados = [];
  for (const f of files) {
    const r = await pool
      .request()
      .input("idSol", sql.Int, idSolicitud)
      .input("nombre", sql.VarChar(255), f.originalname)
      .input("ruta", sql.VarChar(500), `/uploads/solicitudes/${f.filename}`)
      .input("mime", sql.VarChar(100), f.mimetype)
      .input("size", sql.BigInt, f.size)
      .query(
        "INSERT INTO solicitudTI_archivos(idSolicitud,nombreArchivo,rutaServidor,mimeType,tamanoBytes,fechaSubida) OUTPUT INSERTED.idArchivo VALUES(@idSol,@nombre,@ruta,@mime,@size,GETDATE())",
      );
    insertados.push({
      idArchivo: r.recordset[0].idArchivo,
      nombreArchivo: f.originalname,
    });
  }
  await bitacora(pool, {
    idSolicitud,
    idUsuario: userJwt.login,
    nombreUsuario: userJwt.name,
    nota: `${userJwt.name} adjuntó ${files.length} archivo(s)`,
  });
  return insertados;
}

// ════════════════════════════════════════════════════════════
// getMisSolicitudes
// ════════════════════════════════════════════════════════════
async function getMisSolicitudes(
  loginUsuario,
  { estatus, search, orden } = {},
) {
  const pool = await getPool();
  const r = pool.request();

  r.input("login", sql.VarChar, loginUsuario);

  let whereExtra = "";

  if (estatus === "proceso") whereExtra += ` AND s.idEstatus IN (1,2,3,4,5)`;
  if (estatus === "concluidas") whereExtra += ` AND s.idEstatus IN (6,7)`;
  if (estatus === "accion")
    whereExtra += ` AND s.idEstatus IN (6,7) AND ev.idEvaluacion IS NULL`;

  if (search) {
    r.input("search", sql.VarChar, `%${search}%`);
    whereExtra += ` AND (
      s.titulo LIKE @search OR
      ISNULL(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'), s.folio) LIKE @search
    )`;
  }

  const ordenSQL =
    orden === "az"
      ? "s.titulo ASC"
      : orden === "za"
        ? "s.titulo DESC"
        : "s.fechaCreacion DESC";

  const query = `
    SELECT
      s.idSolicitud,
      ISNULL(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'), s.folio) AS folio,
      s.titulo,
      s.fechaCreacion,
      s.idUsuario,
      t.nombre                       AS tipoNombre,
      s.idEstatus,
      e.nombre                       AS estatusNombre,
      e.color                        AS estatusColor,
      e.colorBg                      AS estatusBg,
      det.fechaCompromiso,
      det.fechaInicio,
      det.tipoDesarrollo,
      det.porcentajeAvance           AS avance,
      det.fechaConclusión            AS fechaConcluido,
      dev.desarrollo                 AS sistemaNombre,
      s.nombreTecnico                AS responsableNombre,
      ev.idEvaluacion
    FROM solicitudTI s
    JOIN solicitudTI_desarrollo_detalle det ON det.idSolicitud = s.idSolicitud
    JOIN cat_estatus_desarrollo e           ON e.idEstatus     = s.idEstatus
    LEFT JOIN cat_tipo_solicitud_dev t      ON t.idTipo        = det.idTipo
    LEFT JOIN desarrollosTI dev             ON dev.id          = det.idDesarrollo
    LEFT JOIN solicitudTI_desarrollo_evaluacion ev ON ev.idSolicitud = s.idSolicitud
    WHERE s.idServicio = 2
      AND s.idUsuario  = @login
      ${whereExtra}
    ORDER BY ${ordenSQL}
  `;

  const result = await r.query(query);

  return result.recordset.map((row) => ({
    idSolicitud: row.idSolicitud,
    folio: row.folio,
    titulo: row.titulo,
    fechaSolicitud: row.fechaCreacion,
    idUsuario: row.idUsuario,
    tipo: row.tipoNombre,
    tipoDesarrollo: row.tipoDesarrollo ?? null,
    estatus: {
      id: row.idEstatus,
      nombre: row.estatusNombre,
      color: row.estatusColor,
      bg: row.estatusBg,
    },
    fechaCompromiso: row.fechaCompromiso,
    fechaInicio: row.fechaInicio,
    fechaConcluido: row.fechaConcluido,
    avance: row.avance,
    sistema: row.sistemaNombre,
    responsable: row.responsableNombre,
    evaluada: !!row.idEvaluacion,
  }));
}

// ════════════════════════════════════════════════════════════
// getMiSolicitudDetalle
// ════════════════════════════════════════════════════════════
async function getMiSolicitudDetalle(idSolicitud, loginUsuario) {
  const pool = await getPool();
  const r = pool.request();
  r.input("id", sql.Int, parseInt(idSolicitud));
  r.input("login", sql.VarChar, loginUsuario);

  const check = await r.query(
    `SELECT idUsuario FROM solicitudTI WHERE idSolicitud = @id AND idServicio = 2`,
  );
  if (!check.recordset.length) throw { status: 404, message: "No encontrada" };
  if (check.recordset[0].idUsuario !== loginUsuario)
    throw { status: 403, message: "Sin acceso" };

  return await getDetalle(idSolicitud);
}

// ════════════════════════════════════════════════════════════
// getMiSolicitudActividades
// ════════════════════════════════════════════════════════════
async function getMiSolicitudActividades(idSolicitud, loginUsuario) {
  const pool = await getPool();
  const idSol = parseInt(idSolicitud);

  const own = await pool
    .request()
    .input("id", sql.Int, idSol)
    .query(
      `SELECT idUsuario FROM solicitudTI WHERE idSolicitud = @id AND idServicio = 2`,
    );

  if (!own.recordset.length || own.recordset[0].idUsuario !== loginUsuario)
    throw { status: 403, message: "Sin acceso" };

  const acts = await pool.request().input("id", sql.Int, idSol).query(`
      SELECT
        a.idActividad        AS id,
        a.actividad          AS descripcion,
        a.fecha              AS fechaRegistro,
        a.nombreUsuario      AS autor,
        'actividad'          AS tipo
      FROM solicitudTI_desarrollo_actividades a
      WHERE a.idSolicitud = @id
      ORDER BY a.fecha DESC
    `);

  const bit = await pool.request().input("id", sql.Int, idSol).query(`
      SELECT
        b.idBitacora         AS id,
        b.nota               AS descripcion,
        b.fecha              AS fechaRegistro,
        b.nombreUsuario      AS autor,
        'bitacora'           AS tipo
      FROM solicitudTI_bitacora b
      WHERE b.idSolicitud = @id
      ORDER BY b.fecha DESC
    `);

  const merged = [...acts.recordset, ...bit.recordset].sort(
    (a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro),
  );

  return merged;
}

module.exports = {
  getCatalogos,
  getKpis,
  getLista,
  getDetalle,
  crearSolicitud,
  cambiarEstatus,
  concluirDesarrollo,
  asignarResponsable,
  actualizarDetalle,
  agregarComentario,
  agregarActividad,
  registrarHoras,
  eliminarHoras,
  crearSubtarea,
  actualizarSubtarea,
  registrarBloqueo,
  resolverBloqueo,
  registrarEvaluacion,
  registrarImpacto,
  subirAdjuntos,
  getMisSolicitudes,
  getMiSolicitudDetalle,
  getMiSolicitudActividades,
};
