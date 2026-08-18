const { getPool, sql } = require("../db");

// Cache simple en memoria — 5 minutos
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

function fromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}
function toCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

function periodoRango(periodo) {
  const ahora = new Date();
  const fin = new Date(ahora);
  const inicio = new Date(ahora);
  inicio.setDate(inicio.getDate() - parseInt(periodo || 30));
  const inicioAnterior = new Date(inicio);
  inicioAnterior.setDate(inicioAnterior.getDate() - parseInt(periodo || 30));
  return { inicio, fin, inicioAnterior, finAnterior: new Date(inicio) };
}

// ─── 1. RESUMEN / KPIs de cabecera ──────────────────────────────────────────
async function getResumen({ periodo = 30, sitio = "" } = {}) {
  const cacheKey = `resumen_${periodo}_${sitio}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const pool = await getPool();
  const { inicio, inicioAnterior, finAnterior } = periodoRango(periodo);

  const sitioFilter = sitio ? `AND s.sitioUsuario = @sitio` : "";

  const r = await pool
    .request()
    .input("inicio", sql.DateTime, inicio)
    .input("fin", sql.DateTime, new Date())
    .input("inicioAnt", sql.DateTime, inicioAnterior)
    .input("finAnt", sql.DateTime, finAnterior)
    .input("sitio", sql.VarChar, sitio || "").query(`
      -- Periodo actual
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN s.idEstatus NOT IN (4,5) THEN 1 ELSE 0 END) AS abiertas,
        SUM(CASE WHEN s.idEstatus NOT IN (4,5) AND p.prioridad = 'Crítica' THEN 1 ELSE 0 END) AS criticas,
        SUM(CASE WHEN s.idEstatus = 2 THEN 1 ELSE 0 END) AS enProceso,
        SUM(CASE WHEN s.idEstatus = 1 THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN s.idEstatus IN (4,5) THEN 1 ELSE 0 END) AS resueltas,
        -- Fuera de SLA: abiertas cuyo tiempo supera el sla de resolución (en minutos)
        SUM(CASE 
          WHEN s.idEstatus NOT IN (4,5)
            AND cs.slaResolucionMin IS NOT NULL
            AND DATEDIFF(MINUTE, s.fechaCreacion, GETDATE()) > cs.slaResolucionMin
          THEN 1 ELSE 0 
        END) AS fueraSLA,
        -- Cumplimiento SLA en resueltas
        SUM(CASE 
          WHEN s.idEstatus IN (4,5)
            AND cs.slaResolucionMin IS NOT NULL
            AND DATEDIFF(MINUTE, s.fechaCreacion, s.fechaResolucion) <= cs.slaResolucionMin
          THEN 1 ELSE 0 
        END) AS resueltasDentroSLA,
        SUM(CASE 
          WHEN s.idEstatus IN (4,5) AND cs.slaResolucionMin IS NOT NULL
          THEN 1 ELSE 0 
        END) AS resueltasConSLA
      FROM solicitudTI s
      LEFT JOIN cat_prioridad p ON s.idPrioridad = p.idPrioridad
      LEFT JOIN cat_servicioTI cs ON s.idServicio = cs.idServicio
      WHERE s.fechaCreacion >= @inicio AND s.fechaCreacion <= @fin
      ${sitioFilter};

      -- Periodo anterior (para deltas)
      SELECT COUNT(*) AS totalAnt,
        SUM(CASE WHEN s.idEstatus NOT IN (4,5) THEN 1 ELSE 0 END) AS abiertasAnt,
        SUM(CASE WHEN s.idEstatus NOT IN (4,5) AND p.prioridad = 'Crítica' THEN 1 ELSE 0 END) AS criticasAnt,
        SUM(CASE WHEN s.idEstatus NOT IN (4,5)
            AND cs.slaResolucionMin IS NOT NULL
            AND DATEDIFF(MINUTE, s.fechaCreacion, s.fechaResolucion) > cs.slaResolucionMin
          THEN 1 ELSE 0 END) AS fueraSLAAnt
      FROM solicitudTI s
      LEFT JOIN cat_prioridad p ON s.idPrioridad = p.idPrioridad
      LEFT JOIN cat_servicioTI cs ON s.idServicio = cs.idServicio
      WHERE s.fechaCreacion >= @inicioAnt AND s.fechaCreacion <= @finAnt
      ${sitioFilter};
    `);

  const actual = r.recordsets[0][0];
  const anterior = r.recordsets[1][0];

  const pctSLA =
    actual.resueltasConSLA > 0
      ? Math.round((actual.resueltasDentroSLA / actual.resueltasConSLA) * 100)
      : null;

  const delta = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);

  const result = {
    abiertas: actual.abiertas,
    criticas: actual.criticas,
    enProceso: actual.enProceso,
    pendientes: actual.pendientes,
    resueltas: actual.resueltas,
    fueraSLA: actual.fueraSLA,
    pctSLA,
    total: actual.total,
    deltas: {
      abiertas: delta(actual.abiertas, anterior.abiertasAnt),
      criticas: delta(actual.criticas, anterior.criticasAnt),
      fueraSLA: delta(actual.fueraSLA, anterior.fueraSLAAnt),
      total: delta(actual.total, anterior.totalAnt),
    },
  };

  toCache(cacheKey, result);
  return result;
}

// ─── 2. ALERTAS ─────────────────────────────────────────────────────────────
async function getAlertas({ sitio = "" } = {}) {
  const pool = await getPool();
  const sitioFilter = sitio ? `AND s.sitioUsuario = @sitio` : "";

  const r = await pool.request().input("sitio", sql.VarChar, sitio || "")
    .query(`
      SELECT TOP 15
        s.idSolicitud,
        s.folio,
        s.descripcion,
        s.sitioUsuario AS sitio,
        s.areaUsuario  AS area,
        s.fechaCreacion,
        s.fechaResolucion,
        p.prioridad,
        p.colorHex,
        cs.nombre AS servicio,
        cs.slaResolucionMin,
        e.estatus,
        s.nombreTecnico AS responsable,
        DATEDIFF(MINUTE, s.fechaCreacion, GETDATE()) AS minutosAbierto,
        -- Minutos restantes de SLA
        CASE 
          WHEN cs.slaResolucionMin IS NOT NULL AND s.idEstatus NOT IN (4,5)
          THEN cs.slaResolucionMin - DATEDIFF(MINUTE, s.fechaCreacion, GETDATE())
          ELSE NULL
        END AS minutosRestantesSLA,
        -- Score de severidad para ordenar
        (
          CASE WHEN p.prioridad = 'Crítica' THEN 1000 ELSE 0 END +
          CASE WHEN cs.slaResolucionMin IS NOT NULL 
                AND DATEDIFF(MINUTE, s.fechaCreacion, GETDATE()) > cs.slaResolucionMin
               THEN 800 ELSE 0 END +
          CASE WHEN cs.slaResolucionMin IS NOT NULL 
                AND cs.slaResolucionMin - DATEDIFF(MINUTE, s.fechaCreacion, GETDATE()) BETWEEN 0 AND 30
               THEN 600 ELSE 0 END +
          DATEDIFF(MINUTE, s.fechaCreacion, GETDATE()) / 60
        ) AS severityScore
      FROM solicitudTI s
      LEFT JOIN cat_prioridad p ON s.idPrioridad = p.idPrioridad
      LEFT JOIN cat_servicioTI cs ON s.idServicio = cs.idServicio
      LEFT JOIN cat_estatusTI e ON s.idEstatus = e.idEstatus
      WHERE s.idEstatus NOT IN (4,5)
        AND (
          p.prioridad = 'Crítica'
          OR (cs.slaResolucionMin IS NOT NULL AND DATEDIFF(MINUTE, s.fechaCreacion, GETDATE()) > cs.slaResolucionMin)
          OR (cs.slaResolucionMin IS NOT NULL AND cs.slaResolucionMin - DATEDIFF(MINUTE, s.fechaCreacion, GETDATE()) BETWEEN 0 AND 30)
          OR DATEDIFF(HOUR, s.fechaCreacion, GETDATE()) >= 8
        )
        ${sitioFilter}
      ORDER BY severityScore DESC, s.fechaCreacion ASC
    `);

  return r.recordset.map((row) => {
    let tipo = "warning";
    let etiqueta = "";

    if (row.prioridad === "Crítica") {
      tipo = "critica";
      etiqueta = "Crítica";
    }
    if (row.minutosRestantesSLA !== null && row.minutosRestantesSLA < 0) {
      tipo = "vencida";
      etiqueta = "SLA Vencido";
    } else if (
      row.minutosRestantesSLA !== null &&
      row.minutosRestantesSLA <= 30
    ) {
      tipo = "urgente";
      etiqueta = `${row.minutosRestantesSLA} min SLA`;
    } else if (row.minutosAbierto >= 480) {
      etiqueta = `${Math.floor(row.minutosAbierto / 60)}h abierta`;
    }

    return {
      idSolicitud: row.idSolicitud,
      folio: row.folio,
      servicio: row.servicio,
      sitio: row.sitio,
      area: row.area,
      prioridad: row.prioridad,
      colorHex: row.colorHex,
      estatus: row.estatus,
      responsable: row.responsable || "Sin asignar",
      minutosAbierto: row.minutosAbierto,
      minutosRestantesSLA: row.minutosRestantesSLA,
      tipo,
      etiqueta,
    };
  });
}

// ─── 3. TENDENCIA ────────────────────────────────────────────────────────────
async function getTendencia({ periodo = 30, sitio = "" } = {}) {
  const cacheKey = `tendencia_${periodo}_${sitio}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const pool = await getPool();
  const { inicio } = periodoRango(periodo);
  const sitioFilter = sitio ? `AND s.sitio = @sitio` : "";

  const r = await pool
    .request()
    .input("inicio", sql.DateTime, inicio)
    .input("sitio", sql.VarChar, sitio || "").query(`
      SELECT 
        CAST(s.fechaCreacion AS DATE) AS fecha,
        COUNT(*) AS total
      FROM solicitudTI s
      WHERE s.fechaCreacion >= @inicio
      ${sitioFilter}
      GROUP BY CAST(s.fechaCreacion AS DATE)
      ORDER BY fecha ASC
    `);

  const result = r.recordset.map((row) => ({
    fecha: row.fecha,
    total: row.total,
  }));

  toCache(cacheKey, result);
  return result;
}

// ─── 4. ESTADO DE SERVICIOS ──────────────────────────────────────────────────
async function getServicios() {
  const pool = await getPool();

  // Servicios base de home_estado_servicios + incidencias activas por servicio
  const r = await pool.request().query(`
    SELECT 
      h.idServicio,
      h.nombreServicio,
      h.estado,
      h.descripcion,
      COUNT(s.idSolicitud) AS incidenciasActivas,
      SUM(CASE WHEN p.prioridad = 'Crítica' THEN 1 ELSE 0 END) AS criticasActivas
    FROM home_estado_servicios h
    LEFT JOIN cat_servicioTI cs ON h.nombreServicio = cs.nombre
    LEFT JOIN solicitudTI s ON cs.idServicio = s.idServicio AND s.idEstatus NOT IN (4,5)
    LEFT JOIN cat_prioridad p ON s.idPrioridad = p.idPrioridad
    GROUP BY h.idServicio, h.nombreServicio, h.estado, h.descripcion
    ORDER BY h.orden ASC
  `);

  return r.recordset;
}

// ─── 5. DISTRIBUCIÓN ─────────────────────────────────────────────────────────
async function getDistribucion({ periodo = 30, sitio = "" } = {}) {
  const cacheKey = `dist_${periodo}_${sitio}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const pool = await getPool();
  const { inicio } = periodoRango(periodo);
  const sitioFilter = sitio ? `AND s.sitio = @sitio` : "";

  const r = await pool
    .request()
    .input("inicio", sql.DateTime, inicio)
    .input("sitio", sql.VarChar, sitio || "").query(`
      -- Por prioridad
      SELECT p.prioridad, p.colorHex, COUNT(*) AS total
      FROM solicitudTI s
      LEFT JOIN cat_prioridad p ON s.idPrioridad = p.idPrioridad
      WHERE s.fechaCreacion >= @inicio ${sitioFilter}
      GROUP BY p.prioridad, p.colorHex, p.idPrioridad
      ORDER BY p.idPrioridad ASC;

      -- Por sitio
      SELECT s.sitioUsuario AS sitio, COUNT(*) AS total
      FROM solicitudTI s
      WHERE s.fechaCreacion >= @inicio AND s.sitioUsuario IS NOT NULL ${sitioFilter}
      GROUP BY s.sitioUsuario
      ORDER BY total DESC;

      -- Por área
      SELECT s.areaUsuario AS area, COUNT(*) AS total
      FROM solicitudTI s
      WHERE s.fechaCreacion >= @inicio AND s.areaUsuario IS NOT NULL ${sitioFilter}
      GROUP BY s.areaUsuario
      ORDER BY total DESC;
    `);

  const result = {
    prioridad: r.recordsets[0],
    sitio: r.recordsets[1],
    area: r.recordsets[2],
  };

  toCache(cacheKey, result);
  return result;
}

// ─── 6. SERVICIOS CON MÁS INCIDENCIAS (recurrentes) ─────────────────────────
async function getRecurrentes({ periodo = 30, sitio = "" } = {}) {
  const cacheKey = `recurrentes_${periodo}_${sitio}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const pool = await getPool();
  const { inicio, inicioAnterior, finAnterior } = periodoRango(periodo);
  const sitioFilter = sitio ? `AND s.sitio = @sitio` : "";

  const r = await pool
    .request()
    .input("inicio", sql.DateTime, inicio)
    .input("inicioAnt", sql.DateTime, inicioAnterior)
    .input("finAnt", sql.DateTime, finAnterior)
    .input("sitio", sql.VarChar, sitio || "").query(`
      SELECT TOP 8
        cs.idServicio,
        cs.nombre AS servicio,
        COUNT(s.idSolicitud) AS totalActual,
        SUM(CASE WHEN s.idEstatus NOT IN (4,5) THEN 1 ELSE 0 END) AS activas,
        (
          SELECT COUNT(*) FROM solicitudTI s2
          WHERE s2.idServicio = cs.idServicio
            AND s2.fechaCreacion >= @inicioAnt AND s2.fechaCreacion <= @finAnt
            ${sitio ? "AND s2.sitioUsuario = @sitio" : ""}
        ) AS totalAnterior
      FROM solicitudTI s
      LEFT JOIN cat_servicioTI cs ON s.idServicio = cs.idServicio
      WHERE s.fechaCreacion >= @inicio ${sitioFilter}
      GROUP BY cs.idServicio, cs.nombre
      ORDER BY totalActual DESC
    `);

  const result = r.recordset.map((row) => ({
    idServicio: row.idServicio,
    servicio: row.servicio,
    total: row.totalActual,
    activas: row.activas,
    totalAnterior: row.totalAnterior,
    delta:
      row.totalAnterior > 0
        ? Math.round(
            ((row.totalActual - row.totalAnterior) / row.totalAnterior) * 100,
          )
        : null,
  }));

  toCache(cacheKey, result);
  return result;
}

// ─── 7. CARGA DEL EQUIPO ─────────────────────────────────────────────────────
async function getCargaEquipo() {
  const pool = await getPool();

  const r = await pool.request().query(`
    SELECT 
      s.tecnicoAsignado AS login,
      s.nombreTecnico   AS nombre,
      COUNT(s.idSolicitud) AS activas,
      SUM(CASE WHEN p.prioridad = 'Crítica' THEN 1 ELSE 0 END) AS criticas,
      SUM(CASE WHEN 
        cs.slaResolucionMin IS NOT NULL
        AND DATEDIFF(MINUTE, s.fechaCreacion, GETDATE()) > cs.slaResolucionMin
        THEN 1 ELSE 0 END) AS fueraSLA
    FROM solicitudTI s
    LEFT JOIN cat_prioridad p ON s.idPrioridad = p.idPrioridad
    LEFT JOIN cat_servicioTI cs ON s.idServicio = cs.idServicio
    WHERE s.idEstatus NOT IN (4,5) AND s.tecnicoAsignado IS NOT NULL AND s.tecnicoAsignado <> ''
    GROUP BY s.tecnicoAsignado, s.nombreTecnico
    ORDER BY activas DESC
  `);

  // Total sin asignar
  const sinAsignar = await pool.request().query(`
    SELECT COUNT(*) AS total FROM solicitudTI
    WHERE idEstatus NOT IN (4,5) AND (tecnicoAsignado IS NULL OR tecnicoAsignado = '')
  `);

  return {
    tecnicos: r.recordset,
    sinAsignar: sinAsignar.recordset[0].total,
  };
}

// ─── 8. SLA DETALLADO ────────────────────────────────────────────────────────
async function getSLA({ periodo = 30, sitio = "" } = {}) {
  const cacheKey = `sla_${periodo}_${sitio}`;
  const cached = fromCache(cacheKey);
  if (cached) return cached;

  const pool = await getPool();
  const { inicio } = periodoRango(periodo);
  const sitioFilter = sitio ? `AND s.sitioUsuario = @sitio` : "";

  const r = await pool
    .request()
    .input("inicio", sql.DateTime, inicio)
    .input("sitio", sql.VarChar, sitio || "").query(`
      SELECT
        cs.nombre AS servicio,
        COUNT(s.idSolicitud) AS total,
        SUM(CASE 
          WHEN s.idEstatus IN (4,5) 
            AND cs.slaResolucionMin IS NOT NULL
            AND DATEDIFF(MINUTE, s.fechaCreacion, s.fechaResolucion) <= cs.slaResolucionMin
          THEN 1 ELSE 0 END) AS dentroSLA,
        SUM(CASE 
          WHEN s.idEstatus IN (4,5)
            AND cs.slaResolucionMin IS NOT NULL
            AND DATEDIFF(MINUTE, s.fechaCreacion, s.fechaResolucion) > cs.slaResolucionMin
          THEN 1 ELSE 0 END) AS fueraSLA,
        AVG(CASE WHEN s.idEstatus IN (4,5) 
          THEN DATEDIFF(MINUTE, s.fechaCreacion, s.fechaResolucion)
          ELSE NULL END) AS tiempoPromedioMinutos
      FROM solicitudTI s
      LEFT JOIN cat_servicioTI cs ON s.idServicio = cs.idServicio
      WHERE s.fechaCreacion >= @inicio ${sitioFilter}
        AND cs.slaResolucionMin IS NOT NULL
      GROUP BY cs.idServicio, cs.nombre
      ORDER BY fueraSLA DESC
    `);

  toCache(cacheKey, r.recordset);
  return r.recordset;
}

module.exports = {
  getResumen,
  getAlertas,
  getTendencia,
  getServicios,
  getDistribucion,
  getRecurrentes,
  getCargaEquipo,
  getSLA,
};
