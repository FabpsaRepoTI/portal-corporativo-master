"use strict";
// ─────────────────────────────────────────────────────────────
// services/dev/cronograma.service.js
// Genera la vista de Gantt a partir de etapas e hitos reales.
// No hay captura manual — todo viene de dev_proyectos,
// dev_etapas_proyecto y dev_hitos.
// ─────────────────────────────────────────────────────────────
const sql = require("mssql");
const { getPool } = require("../../db");

const {esDesarrolladorPermitido,normalizarLogin} = require("./desarrolladores.policy");
const stageService = require("../desarrolloEtapas.service");
const ETAPAS = {
  1: "Análisis", 2: "Desarrollo", 3: "Revisión", 4: "Pruebas", 5: "Liberación",
};

async function getCronograma(query = {}) {
  const pool = await getPool();
  await stageService.ensureSchema(pool);
  const usuarios = await pool.request().query("SELECT login,name AS nombre FROM sec_users WHERE area='SISTEMAS' AND active='Y'");
  const permitidos = new Set(usuarios.recordset.filter(u=>esDesarrolladorPermitido(u.nombre)).map(u=>normalizarLogin(u.login)).filter(Boolean));
  const responsablePermitido = p => permitidos.has(normalizarLogin(p.loginResponsable));
  const req  = pool.request();
  const conds = ["COALESCE(JSON_VALUE(s.camposExtra,'$.alcanceDesarrollo'),'PROYECTO') <> 'CAMBIO_SENCILLO'"]; // Filter after resolving the canonical Mesa values.

  // Proyectos con sus datos base
  const proyectos = await req.query(`
    SELECT
      p.idProyecto, p.idSolicitudOrigen, p.folio, COALESCE(s.titulo,p.nombre) AS nombre, COALESCE(s.areaUsuario,p.areaSolicitante) AS areaSolicitante,
      CASE WHEN s.idSolicitud IS NOT NULL THEN s.tecnicoAsignado ELSE p.loginResponsable END AS loginResponsable, u.name AS nombreResponsable, u.picture AS fotoResponsable,
      JSON_QUERY(s.camposExtra,'$.entregablesEtapas') AS entregablesEtapas,
      p.prioridad, CASE WHEN s.idSolicitud IS NOT NULL THEN s.idEstatus ELSE CASE p.idEstatus WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 4 WHEN 4 THEN 2 WHEN 5 THEN 7 WHEN 6 THEN 6 WHEN 7 THEN 5 END END AS idEstatus, p.etapaActual,
      COALESCE(dd.porcentajeAvance,p.avancePct) AS avancePct, p.enRiesgo, p.motivoRiesgo,
      COALESCE(dd.fechaInicio,p.fechaInicio) AS fechaInicio, COALESCE(dd.fechaCompromiso,p.fechaCompromiso) AS fechaCompromiso, p.fechaEstimadaLib
    FROM dev_proyectos p
    LEFT JOIN solicitudTI s ON s.idSolicitud=p.idSolicitudOrigen
    LEFT JOIN solicitudTI_desarrollo_detalle dd ON dd.idSolicitud=s.idSolicitud
    LEFT JOIN sec_users u ON u.login = CASE WHEN s.idSolicitud IS NOT NULL THEN s.tecnicoAsignado ELSE p.loginResponsable END
    WHERE ${conds.join(" AND ")}
    ORDER BY p.fechaCompromiso ASC, p.prioridad ASC
  `);



  proyectos.recordset = proyectos.recordset.filter(responsablePermitido);
  const ids = proyectos.recordset.map(p => p.idProyecto);
  const idList = ids.length ? ids.join(",") : "0";

  // Etapas de cada proyecto
  const etapas = await pool.request().query(`
    SELECT idProyecto, numeroEtapa, fechaInicio, fechaCompromiso, fechaCierre
    FROM dev_etapas_proyecto
    WHERE idProyecto IN (${idList})
    ORDER BY idProyecto, numeroEtapa
  `);

  // Hitos de cada proyecto
  const hitos = await pool.request().query(`
    SELECT idProyecto, idHito, nombre, etapa, entregable,
           fechaCompromiso, fechaCompletado, idEstatus
    FROM dev_hitos
    WHERE idProyecto IN (${idList})
    ORDER BY idProyecto, fechaCompromiso
  `);

  // Dependencias entre proyectos
  const dependencias = await pool.request().query(`
    SELECT idProyecto, idProyectoDepende, descripcion
    FROM dev_dependencias
    WHERE idProyecto IN (${idList}) OR idProyectoDepende IN (${idList})
  `).catch(() => ({ recordset: [] })); // tabla puede no existir aún

  // Include planned Mesa developments even before a legacy dev project exists.
  const additional = await pool.request().query(`SELECT DISTINCT s.idSolicitud AS idSolicitudOrigen, s.titulo AS nombre,s.areaUsuario AS areaSolicitante,
    s.tecnicoAsignado AS loginResponsable,u.name AS nombreResponsable,u.picture AS fotoResponsable,dd.porcentajeAvance AS avancePct,
    dd.fechaInicio,dd.fechaCompromiso,
    s.idEstatus, JSON_QUERY(s.camposExtra,'$.entregablesEtapas') AS entregablesEtapas
    FROM solicitudTI s
    JOIN solicitudTI_desarrollo_detalle dd ON dd.idSolicitud=s.idSolicitud LEFT JOIN sec_users u ON u.login=s.tecnicoAsignado
    WHERE s.idEstatus<>6 AND COALESCE(JSON_VALUE(s.camposExtra,'$.alcanceDesarrollo'),'PROYECTO') <> 'CAMBIO_SENCILLO' AND NOT EXISTS(SELECT 1 FROM dev_proyectos p WHERE p.idSolicitudOrigen=s.idSolicitud)`);
  proyectos.recordset.push(...additional.recordset.map(p=>({...p,idProyecto:'mesa-'+p.idSolicitudOrigen})));
  const registered=await pool.request().query('SELECT * FROM dbo.desarrollo_etapas ORDER BY numeroEtapa');
  const resets=await pool.request().query('SELECT origen,idEntidad FROM dbo.desarrollo_cronograma_reset');
  // Agrupar por proyecto
  const etapaMap     = {};
  const hitoMap      = {};
  const dependMap    = {};

  for (const e of etapas.recordset) {
    if (!etapaMap[e.idProyecto]) etapaMap[e.idProyecto] = [];
    etapaMap[e.idProyecto].push({ ...e, nombreEtapa: ETAPAS[e.numeroEtapa] });
  }
  for (const h of hitos.recordset) {
    if (!hitoMap[h.idProyecto]) hitoMap[h.idProyecto] = [];
    hitoMap[h.idProyecto].push(h);
  }
  for (const d of dependencias.recordset) {
    if (!dependMap[d.idProyecto]) dependMap[d.idProyecto] = [];
    dependMap[d.idProyecto].push(d);
  }

  const data = proyectos.recordset.map(p => {
    const scope=p.idSolicitudOrigen ? "mesa" : "dev", id=p.idSolicitudOrigen || p.idProyecto;
    const reset=resets.recordset.some(e=>e.origen===scope && e.idEntidad===id);
    const stored=registered.recordset.filter(e=>e.origen===scope && e.idEntidad===id).map(e=>({...e,nombreEtapa:ETAPAS[e.numeroEtapa]}));
    const entregables=JSON.parse(p.entregablesEtapas || "{}");
    return ({
    ...p,
    etapas: [...(reset ? [] : etapaMap[p.idProyecto] || []).filter(e=>!stored.some(s=>s.numeroEtapa===e.numeroEtapa)),...stored].map(e=>({...e,entregable:entregables[e.numeroEtapa] || e.entregable || ""})).sort((a,b)=>a.numeroEtapa-b.numeroEtapa),
    etapaActual: stored.find(e=>e.activa)?.numeroEtapa || p.etapaActual,
    hitos: reset ? [] : hitoMap[p.idProyecto] ?? [],
    fechaInicio:reset ? null : p.fechaInicio,fechaCompromiso:reset ? null : p.fechaCompromiso,fechaEstimadaLib:reset ? null : p.fechaEstimadaLib,
    dependencias: dependMap[p.idProyecto] ?? [],
    // Para el Gantt: fecha de inicio real o fecha de creación del proyecto
    ganttInicio: reset ? null : p.fechaInicio ?? null,
    ganttFin: reset ? null : p.fechaEstimadaLib ?? p.fechaCompromiso ?? null,
  }); }).filter(p=>responsablePermitido(p) && p.idEstatus!==6 && (!query.responsable || p.loginResponsable===query.responsable) && (!query.estado || String(p.idEstatus)===String(query.estado)) && (!query.area || p.areaSolicitante?.includes(query.area))
    && (!query.desde || !p.ganttFin || new Date(p.ganttFin)>=new Date(query.desde) || p.etapas.some(e=>new Date(e.fechaCierre || e.fechaCompromiso || e.fechaInicio)>=new Date(query.desde)))
    && (!query.hasta || !p.ganttInicio || new Date(p.ganttInicio)<=new Date(query.hasta) || p.etapas.some(e=>new Date(e.fechaInicio)<=new Date(query.hasta))));

  // Resumen para las chips superiores del cronograma
  const hoy = new Date();
  const entregasProximas = data.flatMap(p => p.hitos)
    .filter(h => h.idEstatus !== 3 && h.fechaCompromiso &&
      new Date(h.fechaCompromiso) >= hoy &&
      ((new Date(h.fechaCompromiso) - hoy) / 86400000) <= 14)
    .length;

  const dependenciasExternas = data.reduce((total,p)=>total+p.dependencias.length,0);
  const riesgosFecha = data.filter(p => p.enRiesgo).length;

  return {
    data,
    resumen: { entregasProximas, dependenciasExternas, riesgosFecha },
  };
}

module.exports = { getCronograma };
