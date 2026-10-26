/**
 * ejecutivo.service.js — Visor Ejecutivo FABPSA
 * FUENTE ÚNICA DE VERDAD para reglas y consultas del dashboard.
 *
 * Reglas aprobadas:
 * - ACTIVO: idEstatus IN (1,2,6,7,8) => Abierto, En progreso, En pausa, En diagnóstico, Escalado.
 * - FUERA DEL BACKLOG: idEstatus IN (3,4,5) => Resuelto, Cerrado, Cancelado.
 * - SUR 121 = CEDIS + IAFSA + variantes SUR121.
 * - SLA actual: fechaLimiteResol es la fuente oficial. Solo se usa un fallback calculado
 *   para tickets históricos donde fechaLimiteResol sea NULL y exista SLA en catálogo.
 * - Los KPIs de estado actual NO cambian por periodo; sí cambian por sitio.
 * - Las métricas históricas/tendencias sí cambian por periodo y sitio.
 */

const { getPool, sql } = require("../db");

// Every executive metric reads support tickets only, before interpreting status or SLA.
const SUPPORT_TICKETS_SQL = "(SELECT * FROM solicitudTI WHERE idServicio <> 2 OR idServicio IS NULL)";

const ACTIVE_IDS = [1, 2, 6, 7, 8];
const CLOSED_IDS = [3, 4, 5];
const ACTIVE_SQL = "(1,2,6,7,8)";
const CLOSED_SQL = "(3,4,5)";

const CACHE_TTL = 60 * 1000;
const cache = new Map();
function fromCache(key) {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}
function toCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
  return data;
}

function cleanSite(site = "") {
  const v = String(site || "")
    .trim()
    .toUpperCase();
  if (!v || v === "TODOS") return "";
  if (v === "PFV") return "PLANTA";
  if (["CEDIS", "IAFSA", "SUR121", "SUR 121"].includes(v)) return "SUR 121";
  return v;
}

function normalizeSiteValue(site) {
  const v = String(site || "")
    .trim()
    .toUpperCase();
  if (["CEDIS", "IAFSA", "SUR121", "SUR 121"].includes(v)) return "SUR 121";
  if (v === "PFV") return "PLANTA";
  return v || null;
}

function siteClause(site, alias = "s") {
  const normalized = cleanSite(site);
  if (!normalized) return "";
  const field = `UPPER(LTRIM(RTRIM(${alias}.sitioUsuario)))`;
  if (normalized === "SUR 121") {
    return `AND ${field} IN ('CEDIS','IAFSA','SUR121','SUR 121')`;
  }
  return `AND ${field} = @sitio`;
}

function siteCase(alias = "s") {
  return `CASE
    WHEN UPPER(LTRIM(RTRIM(${alias}.sitioUsuario))) IN ('CEDIS','IAFSA','SUR121','SUR 121') THEN 'SUR 121'
    WHEN UPPER(LTRIM(RTRIM(${alias}.sitioUsuario))) = 'PFV' THEN 'PLANTA'
    ELSE UPPER(LTRIM(RTRIM(${alias}.sitioUsuario)))
  END`;
}

// Fecha límite real. Fallback solo para datos históricos sin fechaLimiteResol.
function slaDeadline(alias = "s", serviceAlias = "cs") {
  return `COALESCE(
    ${alias}.fechaLimiteResol,
    CASE WHEN ${serviceAlias}.slaResolucionMin IS NOT NULL
         THEN DATEADD(MINUTE, ${serviceAlias}.slaResolucionMin, ${alias}.fechaCreacion)
         ELSE NULL END
  )`;
}

function getRange(periodo = 30) {
  let days = Number.parseInt(periodo, 10);
  if (![1, 7, 30, 90].includes(days)) days = 30;

  const end = new Date();
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const previousEnd = new Date(start);
  previousEnd.setMilliseconds(-1);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - days);

  return { days, start, end, previousStart, previousEnd };
}

function addCommonInputs(request, { sitio = "", periodo = 30 } = {}) {
  const site = cleanSite(sitio);
  const range = getRange(periodo);
  request.input("sitio", sql.VarChar, site);
  request.input("inicio", sql.DateTime, range.start);
  request.input("fin", sql.DateTime, range.end);
  request.input("inicioAnt", sql.DateTime, range.previousStart);
  request.input("finAnt", sql.DateTime, range.previousEnd);
  return { site, ...range };
}

function ticketSelect(alias = "s") {
  const deadline = slaDeadline(alias, "cs");
  return `
    ${alias}.idSolicitud,
    ${alias}.folio,
    ${alias}.titulo,
    ${alias}.descripcion,
    ${alias}.nombreUsuario,
    ${alias}.areaUsuario,
    ${alias}.sitioUsuario,
    ${siteCase(alias)} AS sitio,
    ${alias}.idServicio,
    cs.nombre AS servicio,
    ${alias}.idPrioridad,
    p.prioridad,
    p.colorHex,
    ${alias}.idEstatus,
    e.estatus,
    ${alias}.tecnicoAsignado,
    ${alias}.nombreTecnico AS responsable,
    ${alias}.escalaA,
    ${alias}.fechaCreacion,
    ${alias}.fechaActualizacion,
    ${alias}.fechaResolucion,
    ${alias}.fechaLimiteResol,
    cs.slaResolucionMin,
    DATEDIFF(MINUTE, ${alias}.fechaCreacion, GETDATE()) AS minutosAbierto,
    DATEDIFF(MINUTE, ${alias}.fechaActualizacion, GETDATE()) AS minutosDesdeUltAct,
    CASE WHEN ${deadline} IS NOT NULL
         THEN DATEDIFF(MINUTE, GETDATE(), ${deadline})
         ELSE NULL END AS minutosRestantesSLA
  `;
}

// Desarrollo (servicio 2) usa otro catálogo: su estatus 7 significa concluido.
// Esta lista atiende exclusivamente tickets operativos, nunca desarrollos.
function attentionWhere(alias = "s") {
  const deadline=slaDeadline(alias,"cs");
  return `${alias}.idServicio <> 2 AND ${alias}.idEstatus IN ${ACTIVE_SQL}
    AND (p.prioridad = 'Crítica'
      OR (${deadline} IS NOT NULL AND ${deadline} <= DATEADD(HOUR,4,GETDATE()))
      OR NULLIF(LTRIM(RTRIM(${alias}.tecnicoAsignado)), '') IS NULL)`;
}

function kpiWhere(tipo = "activos", alias = "s") {
  const deadline = slaDeadline(alias, "cs");
  const active = `${alias}.idEstatus IN ${ACTIVE_SQL}`;
  const map = {
    atencion: attentionWhere(alias),
    activos: active,
    sinAsignar: `${active} AND NULLIF(LTRIM(RTRIM(${alias}.tecnicoAsignado)), '') IS NULL`,
    vencidosSLA: `${active} AND ${deadline} IS NOT NULL AND ${deadline} < GETDATE()`,
    porVencer: `${active} AND ${deadline} IS NOT NULL AND ${deadline} >= GETDATE() AND ${deadline} <= DATEADD(HOUR,4,GETDATE())`,
    criticas: `${active} AND p.prioridad = 'Crítica'`,
    escalados: `${alias}.idEstatus = 8`,
    enProceso: `${alias}.idEstatus = 2`,
    enPausa: `${alias}.idEstatus = 6`,
    enDiagnostico: `${alias}.idEstatus = 7`,
  };
  return map[tipo] || map.activos;
}

async function getResumen({ periodo = 30, sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const key = `resumen:${periodo}:${site}`;
  const cached = fromCache(key);
  if (cached) return cached;

  const pool = await getPool();
  const req = pool.request();
  addCommonInputs(req, { sitio: site, periodo });
  const sf = siteClause(site, "s");
  const sf2 = siteClause(site, "s2");
  const deadline = slaDeadline("s", "cs");

  const r = await req.query(`
    -- 0. BACKLOG ACTUAL: no filtra por fecha, sí por sitio
    SELECT
      COUNT(*) AS activosAhora,
      SUM(CASE WHEN s.idEstatus = 1 THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN s.idEstatus = 2 THEN 1 ELSE 0 END) AS enProceso,
      SUM(CASE WHEN s.idEstatus = 6 THEN 1 ELSE 0 END) AS enPausa,
      SUM(CASE WHEN s.idEstatus = 7 THEN 1 ELSE 0 END) AS enDiagnostico,
      SUM(CASE WHEN s.idEstatus = 8 THEN 1 ELSE 0 END) AS escalados,
      SUM(CASE WHEN NULLIF(LTRIM(RTRIM(s.tecnicoAsignado)), '') IS NULL THEN 1 ELSE 0 END) AS sinAsignar,
      SUM(CASE WHEN p.prioridad = 'Crítica' THEN 1 ELSE 0 END) AS criticas,
      SUM(CASE WHEN ${deadline} IS NOT NULL AND ${deadline} < GETDATE() THEN 1 ELSE 0 END) AS vencidosSLA,
      SUM(CASE WHEN ${deadline} IS NOT NULL AND ${deadline} >= GETDATE()
                    AND ${deadline} <= DATEADD(HOUR,4,GETDATE()) THEN 1 ELSE 0 END) AS porVencer
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_prioridad p ON p.idPrioridad = s.idPrioridad
    LEFT JOIN cat_servicioTI cs ON cs.idServicio = s.idServicio
    WHERE s.idEstatus IN ${ACTIVE_SQL} ${sf};

    -- 1. ACTIVIDAD DEL PERIODO
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN s.idEstatus IN ${ACTIVE_SQL} THEN 1 ELSE 0 END) AS abiertas,
      SUM(CASE WHEN s.fechaResolucion >= @inicio AND s.fechaResolucion <= @fin THEN 1 ELSE 0 END) AS resueltasPeriodo
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.fechaCreacion >= @inicio AND s.fechaCreacion <= @fin ${sf};

    -- 2. PERIODO ANTERIOR
    SELECT COUNT(*) AS totalAnt
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.fechaCreacion >= @inicioAnt AND s.fechaCreacion <= @finAnt ${sf};

    -- 3. CUMPLIMIENTO SLA: tickets resueltos en el periodo, no cancelados
    SELECT
      SUM(CASE WHEN s.fechaResolucion IS NOT NULL
                    AND ${deadline} IS NOT NULL
                    AND s.fechaResolucion <= ${deadline} THEN 1 ELSE 0 END) AS dentroSLA,
      SUM(CASE WHEN s.fechaResolucion IS NOT NULL
                    AND ${deadline} IS NOT NULL THEN 1 ELSE 0 END) AS evaluables,
      ROUND(AVG(CASE WHEN s.fechaResolucion IS NOT NULL
                     THEN CAST(DATEDIFF(MINUTE,s.fechaCreacion,s.fechaResolucion) AS float)/60.0 END),1) AS tiempoPromedioHrs
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_servicioTI cs ON cs.idServicio = s.idServicio
    WHERE s.idEstatus IN (3,4)
      AND s.fechaResolucion >= @inicio AND s.fechaResolucion <= @fin ${sf};

    -- 4. SATISFACCIÓN registrada en el periodo
    SELECT ROUND(AVG(CAST(ev.calificacion AS float)),1) AS satisfaccion,
           COUNT(*) AS totalEval
    FROM solicitudTI_evaluacion ev
    INNER JOIN ${SUPPORT_TICKETS_SQL} s ON s.idSolicitud = ev.idSolicitud
    WHERE ev.fechaRegistro >= @inicio AND ev.fechaRegistro <= @fin ${sf};

    -- 5. SERVICIO CON MAYOR BACKLOG ACTUAL
    SELECT TOP 1 cs.nombre AS servicioTop, COUNT(*) AS totalServicioTop
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_servicioTI cs ON cs.idServicio = s.idServicio
    WHERE s.idEstatus IN ${ACTIVE_SQL} ${sf}
    GROUP BY cs.nombre
    ORDER BY COUNT(*) DESC;

    -- 6. SITIO CON MAYOR BACKLOG ACTUAL (si el filtro es Todos)
    SELECT TOP 1 ${siteCase("s")} AS sitioTop,
           COUNT(*) AS totalSitioTop,
           CAST(ROUND(100.0 * COUNT(*) /
             NULLIF((SELECT COUNT(*) FROM ${SUPPORT_TICKETS_SQL} s2 WHERE s2.idEstatus IN ${ACTIVE_SQL} ${sf2}),0),0) AS int) AS pctSitio
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.idEstatus IN ${ACTIVE_SQL} ${sf}
    GROUP BY ${siteCase("s")}
    ORDER BY COUNT(*) DESC;
  `);

  const now = r.recordsets[0][0] || {};
  const period = r.recordsets[1][0] || {};
  const prev = r.recordsets[2][0] || {};
  const sla = r.recordsets[3][0] || {};
  const sat = r.recordsets[4][0] || {};
  const serviceTop = r.recordsets[5][0] || {};
  const siteTop = r.recordsets[6][0] || {};

  const pctSLA =
    Number(sla.evaluables) > 0
      ? Math.round((Number(sla.dentroSLA || 0) / Number(sla.evaluables)) * 100)
      : null;
  const delta =
    Number(prev.totalAnt) > 0
      ? Math.round(
          ((Number(period.total || 0) - Number(prev.totalAnt)) /
            Number(prev.totalAnt)) *
            100,
        )
      : 0;

  return toCache(key, {
    activosAhora: Number(now.activosAhora || 0),
    pendientes: Number(now.pendientes || 0),
    enProceso: Number(now.enProceso || 0),
    enPausa: Number(now.enPausa || 0),
    enDiagnostico: Number(now.enDiagnostico || 0),
    escalados: Number(now.escalados || 0),
    sinAsignar: Number(now.sinAsignar || 0),
    criticas: Number(now.criticas || 0),
    vencidosSLA: Number(now.vencidosSLA || 0),
    porVencer: Number(now.porVencer || 0),
    total: Number(period.total || 0),
    resueltas: Number(period.resueltasPeriodo || 0),
    pctSLA,
    tiempoPromedioHrs:
      sla.tiempoPromedioHrs == null ? null : Number(sla.tiempoPromedioHrs),
    satisfaccion: sat.satisfaccion == null ? null : Number(sat.satisfaccion),
    totalEval: Number(sat.totalEval || 0),
    servicioTopActivo: serviceTop.servicioTop || null,
    sitioTopActivo: siteTop.sitioTop || null,
    pctSitioTop: Number(siteTop.pctSitio || 0),
    deltas: { total: delta },
    definicion: {
      activos: ACTIVE_IDS,
      fueraBacklog: CLOSED_IDS,
      sitio: site || "TODOS",
      periodoDias: getRange(periodo).days,
    },
  });
}

async function getAlertas({ sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const pool = await getPool();
  const req = pool.request().input("sitio", sql.VarChar, site);
  const sf = siteClause(site, "s");
  const deadline = slaDeadline("s", "cs");

  const r = await req.query(`
    SELECT ${ticketSelect("s")},
      CASE
        WHEN p.prioridad = 'Crítica' AND ${deadline} < GETDATE() THEN 4000
        WHEN p.prioridad = 'Crítica' THEN 3000
        WHEN ${deadline} < GETDATE() THEN 2500
        WHEN ${deadline} <= DATEADD(HOUR,4,GETDATE()) THEN 1800
        WHEN NULLIF(LTRIM(RTRIM(s.tecnicoAsignado)), '') IS NULL THEN 1200
        ELSE 0
      END + DATEDIFF(HOUR,s.fechaCreacion,GETDATE()) AS score
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_prioridad p ON p.idPrioridad = s.idPrioridad
    LEFT JOIN cat_servicioTI cs ON cs.idServicio = s.idServicio
    LEFT JOIN cat_estatusTI e ON e.idEstatus = s.idEstatus
    WHERE ${attentionWhere("s")}
      ${sf}
    ORDER BY score DESC, s.fechaCreacion ASC;
  `);

  return r.recordset.map((row) => {
    const min = row.minutosRestantesSLA;
    const unassigned = !String(row.tecnicoAsignado || "").trim();
    let tipo = "atencion";
    let motivo = "Requiere atención";

    if (row.prioridad === "Crítica" && min != null && min < 0) {
      tipo = "critico_vencido";
      motivo = `Prioridad Crítica · SLA vencido hace ${Math.abs(min)} min${unassigned ? " · Sin técnico asignado" : ""}`;
    } else if (row.prioridad === "Crítica") {
      tipo = "critico";
      motivo = `Ticket crítico${unassigned ? " sin técnico asignado" : ""}`;
    } else if (min != null && min < 0) {
      tipo = "vencido";
      motivo = `SLA vencido hace ${Math.abs(min)} min${unassigned ? " · Sin técnico asignado" : ""}`;
    } else if (min != null && min <= 240) {
      tipo = "riesgo_sla";
      motivo = `SLA vence en ${min} min${unassigned ? " · Sin técnico asignado" : ""}`;
    } else if (unassigned) {
      tipo = "sin_asignar";
      motivo = `Ticket activo sin técnico asignado desde hace ${row.minutosAbierto} min`;
    }

    return {
      ...row,
      sitio: normalizeSiteValue(row.sitio),
      responsable: row.responsable || null,
      tipo,
      motivo,
    };
  });
}

async function getDetalleIndicador({
  tipo = "activos",
  sitio = "",
  servicio = null,
} = {}) {
  const site = cleanSite(sitio);
  const pool = await getPool();
  const req = pool.request().input("sitio", sql.VarChar, site);
  const sf = siteClause(site, "s");
  const sf2 = siteClause(site, "s2");
  const where = kpiWhere(tipo, "s");
  const where2 = kpiWhere(tipo, "s2");
  const serviceId =
    servicio == null || servicio === "" ? null : Number(servicio);
  if (serviceId != null && !Number.isNaN(serviceId))
    req.input("idServicio", sql.Int, serviceId);
  const serviceFilter =
    serviceId != null && !Number.isNaN(serviceId)
      ? "AND s.idServicio = @idServicio"
      : "";
  const serviceFilter2 =
    serviceId != null && !Number.isNaN(serviceId)
      ? "AND s2.idServicio = @idServicio"
      : "";

  const r = await req.query(`
    SELECT ${ticketSelect("s")}
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_prioridad p ON p.idPrioridad = s.idPrioridad
    LEFT JOIN cat_servicioTI cs ON cs.idServicio = s.idServicio
    LEFT JOIN cat_estatusTI e ON e.idEstatus = s.idEstatus
    WHERE ${where} ${sf} ${serviceFilter}
    ORDER BY CASE WHEN p.prioridad='Crítica' THEN 0 ELSE 1 END,
             CASE WHEN ${slaDeadline("s", "cs")} < GETDATE() THEN 0 ELSE 1 END,
             s.fechaCreacion ASC;

    SELECT COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s2
    LEFT JOIN cat_prioridad p ON p.idPrioridad = s2.idPrioridad
    LEFT JOIN cat_servicioTI cs ON cs.idServicio = s2.idServicio
    WHERE ${where2} ${sf2} ${serviceFilter2};

    SELECT cs.nombre AS servicio, COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_prioridad p ON p.idPrioridad = s.idPrioridad
    LEFT JOIN cat_servicioTI cs ON cs.idServicio = s.idServicio
    WHERE ${where} ${sf} ${serviceFilter}
    GROUP BY cs.nombre ORDER BY total DESC;

    SELECT ${siteCase("s")} AS sitio, COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_prioridad p ON p.idPrioridad = s.idPrioridad
    LEFT JOIN cat_servicioTI cs ON cs.idServicio = s.idServicio
    WHERE ${where} ${sf} ${serviceFilter}
    GROUP BY ${siteCase("s")} ORDER BY total DESC;
  `);

  const tickets = r.recordsets[0].map((row) => ({
    ...row,
    sitio: normalizeSiteValue(row.sitio),
    responsable: row.responsable || null,
    sinAsignar: !String(row.tecnicoAsignado || "").trim(),
  }));

  return {
    tipo,
    total: Number(r.recordsets[1][0]?.total || 0),
    tickets,
    porServicio: r.recordsets[2],
    porSitio: r.recordsets[3],
  };
}

async function getTendencia({ periodo = 30, sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const key = `tendencia:${periodo}:${site}`;
  const cached = fromCache(key);
  if (cached) return cached;
  const pool = await getPool();
  const req = pool.request();
  addCommonInputs(req, { sitio: site, periodo });
  const sf = siteClause(site, "s");

  const r = await req.query(`
    SELECT CAST(s.fechaCreacion AS date) AS fecha, COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.fechaCreacion >= @inicio AND s.fechaCreacion <= @fin ${sf}
    GROUP BY CAST(s.fechaCreacion AS date)
    ORDER BY fecha;

    SELECT CAST(s.fechaResolucion AS date) AS fecha, COUNT(*) AS resueltos
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.fechaResolucion >= @inicio AND s.fechaResolucion <= @fin
      AND s.idEstatus IN (3,4) ${sf}
    GROUP BY CAST(s.fechaResolucion AS date)
    ORDER BY fecha;
  `);

  const byDate = new Map();
  for (const x of r.recordsets[0])
    byDate.set(new Date(x.fecha).toISOString().slice(0, 10), {
      fecha: x.fecha,
      total: Number(x.total),
      resueltos: 0,
    });
  for (const x of r.recordsets[1]) {
    const k = new Date(x.fecha).toISOString().slice(0, 10);
    if (!byDate.has(k))
      byDate.set(k, { fecha: x.fecha, total: 0, resueltos: 0 });
    byDate.get(k).resueltos = Number(x.resueltos);
  }
  return toCache(
    key,
    [...byDate.values()].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)),
  );
}

async function getServicios({ sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const pool = await getPool();
  const req = pool.request().input("sitio", sql.VarChar, site);
  const sf = siteClause(site, "s");
  const deadline = slaDeadline("s", "cs");

  const r = await req.query(`
    SELECT cs.idServicio,
           cs.nombre AS nombreServicio,
           COUNT(s.idSolicitud) AS incidenciasActivas,
           SUM(CASE WHEN p.prioridad='Crítica' THEN 1 ELSE 0 END) AS criticasActivas,
           SUM(CASE WHEN ${deadline} IS NOT NULL AND ${deadline} < GETDATE() THEN 1 ELSE 0 END) AS slaVencidos
    FROM cat_servicioTI cs
    LEFT JOIN ${SUPPORT_TICKETS_SQL} s ON s.idServicio = cs.idServicio AND s.idEstatus IN ${ACTIVE_SQL}
    LEFT JOIN cat_prioridad p ON p.idPrioridad = s.idPrioridad
    WHERE cs.activo = 1 AND cs.idServicio <> 2 ${sf.replace(/^AND /, "AND ")}
    GROUP BY cs.idServicio, cs.nombre
    ORDER BY incidenciasActivas DESC, cs.nombre;
  `);

  return r.recordset.map((x) => {
    const crit = Number(x.criticasActivas || 0);
    const late = Number(x.slaVencidos || 0);
    return {
      ...x,
      incidenciasActivas: Number(x.incidenciasActivas || 0),
      criticasActivas: crit,
      slaVencidos: late,
      estado: crit > 0 || late > 0 ? "atencion" : "operativo",
      descripcion:
        crit > 0
          ? `${crit} crítica(s) activa(s)`
          : late > 0
            ? `${late} SLA vencido(s)`
            : "Sin incidencias críticas",
    };
  });
}

async function getDistribucion({ periodo = 30, sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const key = `dist:${periodo}:${site}`;
  const cached = fromCache(key);
  if (cached) return cached;
  const pool = await getPool();
  const req = pool.request();
  addCommonInputs(req, { sitio: site, periodo });
  const sf = siteClause(site, "s");

  const r = await req.query(`
    SELECT p.prioridad, p.colorHex, COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_prioridad p ON p.idPrioridad=s.idPrioridad
    WHERE s.fechaCreacion >= @inicio AND s.fechaCreacion <= @fin ${sf}
    GROUP BY p.idPrioridad,p.prioridad,p.colorHex
    ORDER BY p.idPrioridad;

    SELECT ${siteCase("s")} AS sitio, COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.fechaCreacion >= @inicio AND s.fechaCreacion <= @fin
      AND NULLIF(LTRIM(RTRIM(s.sitioUsuario)), '') IS NOT NULL ${sf}
    GROUP BY ${siteCase("s")}
    ORDER BY total DESC;

    SELECT e.estatus, e.colorHex, COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_estatusTI e ON e.idEstatus=s.idEstatus
    WHERE s.fechaCreacion >= @inicio AND s.fechaCreacion <= @fin ${sf}
    GROUP BY e.idEstatus,e.estatus,e.colorHex
    ORDER BY e.idEstatus;

    SELECT TOP 8 s.areaUsuario AS area, COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.fechaCreacion >= @inicio AND s.fechaCreacion <= @fin
      AND NULLIF(LTRIM(RTRIM(s.areaUsuario)), '') IS NOT NULL ${sf}
    GROUP BY s.areaUsuario
    ORDER BY total DESC;
  `);

  return toCache(key, {
    prioridad: r.recordsets[0],
    sitio: r.recordsets[1],
    estado: r.recordsets[2],
    area: r.recordsets[3],
  });
}

async function getRecurrentes({ periodo = 30, sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const key = `recurrentes:${periodo}:${site}`;
  const cached = fromCache(key);
  if (cached) return cached;
  const pool = await getPool();
  const req = pool.request();
  addCommonInputs(req, { sitio: site, periodo });
  const sf = siteClause(site, "s");
  const sf2 = siteClause(site, "s2");

  const r = await req.query(`
    SELECT TOP 8
      cs.idServicio,
      cs.nombre AS servicio,
      COUNT(*) AS total,
      SUM(CASE WHEN s.idEstatus IN ${ACTIVE_SQL} THEN 1 ELSE 0 END) AS activas,
      (
        SELECT COUNT(*) FROM ${SUPPORT_TICKETS_SQL} s2
        WHERE s2.idServicio = cs.idServicio
          AND s2.fechaCreacion >= @inicioAnt AND s2.fechaCreacion <= @finAnt
          ${sf2}
      ) AS totalAnt
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_servicioTI cs ON cs.idServicio=s.idServicio
    WHERE s.fechaCreacion >= @inicio AND s.fechaCreacion <= @fin ${sf}
    GROUP BY cs.idServicio,cs.nombre
    ORDER BY total DESC;
  `);

  return toCache(
    key,
    r.recordset.map((x) => ({
      idServicio: x.idServicio,
      servicio: x.servicio,
      total: Number(x.total || 0),
      activas: Number(x.activas || 0),
      totalAnt: Number(x.totalAnt || 0),
      delta:
        Number(x.totalAnt || 0) > 0
          ? Math.round(
              ((Number(x.total) - Number(x.totalAnt)) / Number(x.totalAnt)) *
                100,
            )
          : null,
    })),
  );
}

async function getCargaEquipo({ sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const pool = await getPool();
  const req = pool.request().input("sitio", sql.VarChar, site);
  const sf = siteClause(site, "s");
  const deadline = slaDeadline("s", "cs");

  const r = await req.query(`
    SELECT s.tecnicoAsignado AS login,
           COALESCE(NULLIF(LTRIM(RTRIM(s.nombreTecnico)),''), s.tecnicoAsignado) AS nombre,
           u.picture,
           COUNT(*) AS activas,
           SUM(CASE WHEN s.idEstatus=1 THEN 1 ELSE 0 END) AS pendientes,
           SUM(CASE WHEN s.idEstatus=2 THEN 1 ELSE 0 END) AS enProceso,
           SUM(CASE WHEN s.idEstatus=7 THEN 1 ELSE 0 END) AS enDiagnostico,
           SUM(CASE WHEN s.idEstatus=8 THEN 1 ELSE 0 END) AS escalados,
           SUM(CASE WHEN p.prioridad='Crítica' THEN 1 ELSE 0 END) AS criticas,
           SUM(CASE WHEN ${deadline} IS NOT NULL AND ${deadline}<GETDATE() THEN 1 ELSE 0 END) AS fueraSLA,
           SUM(CASE WHEN ${deadline} IS NOT NULL AND ${deadline}>=GETDATE()
                         AND ${deadline}<=DATEADD(HOUR,4,GETDATE()) THEN 1 ELSE 0 END) AS enRiesgoSLA
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_prioridad p ON p.idPrioridad=s.idPrioridad
    LEFT JOIN cat_servicioTI cs ON cs.idServicio=s.idServicio
    LEFT JOIN SEC_USERS u
      ON UPPER(LTRIM(RTRIM(u.login))) = UPPER(LTRIM(RTRIM(s.tecnicoAsignado)))
    WHERE s.idEstatus IN ${ACTIVE_SQL}
      AND NULLIF(LTRIM(RTRIM(s.tecnicoAsignado)), '') IS NOT NULL ${sf}
    GROUP BY s.tecnicoAsignado,s.nombreTecnico,u.picture
    ORDER BY activas DESC;

    SELECT COUNT(*) AS total
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.idEstatus IN ${ACTIVE_SQL}
      AND NULLIF(LTRIM(RTRIM(s.tecnicoAsignado)), '') IS NULL ${sf};
  `);

  return {
    tecnicos: r.recordsets[0],
    sinAsignar: Number(r.recordsets[1][0]?.total || 0),
  };
}

async function getSLA({ periodo = 30, sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const key = `sla:${periodo}:${site}`;
  const cached = fromCache(key);
  if (cached) return cached;
  const pool = await getPool();
  const req = pool.request();
  addCommonInputs(req, { sitio: site, periodo });
  const sf = siteClause(site, "s");
  const deadline = slaDeadline("s", "cs");

  const r = await req.query(`
    SELECT cs.idServicio, cs.nombre AS servicio,
      COUNT(*) AS total,
      SUM(CASE WHEN s.fechaResolucion <= ${deadline} THEN 1 ELSE 0 END) AS dentroSLA,
      SUM(CASE WHEN s.fechaResolucion > ${deadline} THEN 1 ELSE 0 END) AS fueraSLA,
      ROUND(AVG(CAST(DATEDIFF(MINUTE,s.fechaCreacion,s.fechaResolucion) AS float)),0) AS promedioMin
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_servicioTI cs ON cs.idServicio=s.idServicio
    WHERE s.idEstatus IN (3,4)
      AND s.fechaResolucion IS NOT NULL
      AND s.fechaResolucion >= @inicio AND s.fechaResolucion <= @fin
      AND ${deadline} IS NOT NULL ${sf}
    GROUP BY cs.idServicio,cs.nombre
    ORDER BY fueraSLA DESC, total DESC;
  `);

  return toCache(key, r.recordset);
}

async function getHallazgos({ periodo = 30, sitio = "" } = {}) {
  const [resumen, recurrentes, equipo] = await Promise.all([
    getResumen({ periodo, sitio }),
    getRecurrentes({ periodo, sitio }),
    getCargaEquipo({ sitio }),
  ]);
  const findings = [];
  if (resumen.criticas > 0)
    findings.push({
      tipo: "critico",
      titulo: `${resumen.criticas} ticket(s) crítico(s) activo(s)`,
      filtro: "criticas",
    });
  if (resumen.vencidosSLA > 0)
    findings.push({
      tipo: "critico",
      titulo: `${resumen.vencidosSLA} SLA vencido(s)`,
      filtro: "vencidosSLA",
    });
  if (resumen.sinAsignar > 0)
    findings.push({
      tipo: "atencion",
      titulo: `${resumen.sinAsignar} ticket(s) sin asignar`,
      filtro: "sinAsignar",
    });
  const top = recurrentes[0];
  if (top)
    findings.push({
      tipo: "tendencia",
      titulo: `${top.servicio} concentra ${top.total} ticket(s) del periodo`,
      filtro: "servicio",
      idServicio: top.idServicio,
    });
  const overloaded = [...(equipo.tecnicos || [])].sort(
    (a, b) => Number(b.activas) - Number(a.activas),
  )[0];
  if (overloaded)
    findings.push({
      tipo: "tendencia",
      titulo: `${overloaded.nombre}: ${overloaded.activas} ticket(s) activo(s)`,
      filtro: null,
    });
  return findings;
}

async function getSilenciosos({ sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const pool = await getPool();
  const req = pool.request().input("sitio", sql.VarChar, site);
  const sf = siteClause(site, "s");
  const r = await req.query(`
    SELECT s.idSolicitud,s.folio,cs.nombre AS servicio,
           ISNULL(NULLIF(LTRIM(RTRIM(s.nombreTecnico)),''),'Sin asignar') AS responsable,
           ${siteCase("s")} AS sitio,s.areaUsuario,
           ROUND(CAST(DATEDIFF(MINUTE,s.fechaActualizacion,GETDATE()) AS float)/60.0,1) AS horasSinMovimiento,
           e.estatus
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_servicioTI cs ON cs.idServicio=s.idServicio
    LEFT JOIN cat_estatusTI e ON e.idEstatus=s.idEstatus
    WHERE s.idEstatus IN ${ACTIVE_SQL}
      AND s.idEstatus<>8
      AND s.fechaActualizacion<DATEADD(HOUR,-24,GETDATE()) ${sf}
    ORDER BY s.fechaActualizacion;
  `);
  return r.recordset;
}

// Tickets en pausa (estatus 6) ordenados por tiempo pausado; fechaUltimaPausa es el inicio de la pausa vigente.
async function getPausados({ sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const pool = await getPool();
  const req = pool.request().input("sitio", sql.VarChar, site);
  const sf = siteClause(site, "s");
  const r = await req.query(`
    SELECT s.idSolicitud,s.folio,s.titulo,cs.nombre AS servicio,p.prioridad,
           ISNULL(NULLIF(LTRIM(RTRIM(s.nombreTecnico)),''),'Sin asignar') AS responsable,
           ${siteCase("s")} AS sitio,
           ISNULL(s.fechaUltimaPausa,s.fechaActualizacion) AS fechaPausa,
           DATEDIFF(MINUTE,ISNULL(s.fechaUltimaPausa,s.fechaActualizacion),GETDATE()) AS minutosPausado
    FROM ${SUPPORT_TICKETS_SQL} s
    LEFT JOIN cat_servicioTI cs ON cs.idServicio=s.idServicio
    LEFT JOIN cat_prioridad p ON p.idPrioridad=s.idPrioridad
    WHERE s.idEstatus=6 ${sf}
    ORDER BY minutosPausado DESC;
  `);
  return r.recordset;
}

async function getEscalamientos({ sitio = "" } = {}) {
  const site = cleanSite(sitio);
  const pool = await getPool();
  const req = pool.request().input("sitio", sql.VarChar, site);
  const sf = siteClause(site, "s");
  const r = await req.query(`
    SELECT s.escalaA AS proveedor, COUNT(*) AS [count],
           ROUND(AVG(CAST(DATEDIFF(MINUTE,s.fechaActualizacion,GETDATE()) AS float)/60.0),1) AS promedioHrs,
           MIN(s.fechaCreacion) AS masAntiguo
    FROM ${SUPPORT_TICKETS_SQL} s
    WHERE s.idEstatus=8 AND NULLIF(LTRIM(RTRIM(s.escalaA)),'') IS NOT NULL ${sf}
    GROUP BY s.escalaA
    ORDER BY promedioHrs DESC;
  `);
  return r.recordset;
}

module.exports = {
  ACTIVE_IDS,
  CLOSED_IDS,
  cleanSite,
  normalizeSiteValue,
  getResumen,
  getAlertas,
  getDetalleIndicador,
  getTendencia,
  getServicios,
  getDistribucion,
  getRecurrentes,
  getCargaEquipo,
  getSLA,
  getHallazgos,
  getSilenciosos,
  getEscalamientos,
  getPausados,
};
