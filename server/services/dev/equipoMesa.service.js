"use strict";
// Mesa is the assignment source also used by Portafolio. IDs are solicitud IDs.
const {getPool, sql} = require('../../db');
const gestion = require('../gestionDesarrollo.service');
const key = value => String(value || '').trim().toLowerCase();
const newest = rows => [...rows].sort((a,b)=>new Date(b.fechaRegistro)-new Date(a.fechaRegistro));

function resumenEquipo(data) {
  const complete = data.every(d=>d.horasDisponibles != null);
  const capacidadTotal = complete ? data.reduce((n,d)=>n+Number(d.horasDisponibles),0) : null;
  const horasComprometidas = data.reduce((n,d)=>n+d.horasComprometidas,0);
  return {totalDesarrolladores:data.length, capacidadTotal,
    integrantesSinCapacidad:data.filter(d=>d.horasDisponibles == null).length,
    horasComprometidas, horasDisponibles:complete ? Math.max(0,capacidadTotal-horasComprometidas) : null,
    cargaEquipoPct:capacidadTotal > 0 ? Math.round(horasComprometidas/capacidadTotal*100) : null,
    horasRegistradas:data.reduce((n,d)=>n+d.horasRegistradas,0),
    bloqueosActivos:data.reduce((n,d)=>n+d.bloqueosActivos,0)};
}

async function snapshot(periodo) {
  const portfolio = await gestion.getPortafolio({periodo});
  const proyectos = portfolio.equipo.flatMap(d=>d.proyectos);
  const ids = [...new Set(proyectos.map(p=>Number(p.idSolicitud)).filter(Number.isInteger))];
  if (!ids.length) return {portfolio, tareas:[], avances:[], bloqueos:[], horas:[]};
  const pool = await getPool(), list = ids.join(',');
  const [tasks, avances, legacy, blocks, hours] = await Promise.all([
    pool.request().query(`SELECT * FROM solicitudTI_desarrollo_subtarea WHERE idSolicitud IN (${list}) AND idEstatus NOT IN (6,7)`),
    pool.request().query(`IF OBJECT_ID('dbo.solicitudTI_desarrollo_avances','U') IS NOT NULL SELECT idAvance,idSolicitud,terminado AS queTermine,trabajando AS enQueEstoy,siguiente AS queSigue,fechaRegistro FROM dbo.solicitudTI_desarrollo_avances WHERE idSolicitud IN (${list}) AND estado='PUBLICADO' ELSE SELECT 1 AS unused WHERE 1=0`),
    pool.request().query(`SELECT a.idAvance,p.idSolicitudOrigen AS idSolicitud,a.queTermine,a.enQueEstoy,a.queSigue,a.fechaRegistro FROM dev_avances a JOIN dev_proyectos p ON p.idProyecto=a.idProyecto WHERE p.idSolicitudOrigen IN (${list}) AND a.idEstado=1`),
    pool.request().query(`SELECT b.idBloqueo,COALESCE(b.idSolicitud,p.idSolicitudOrigen) AS idSolicitud,b.motivo,b.accionRequerida,b.fechaBloqueo AS fecha FROM solicitudTI_desarrollo_bloqueos b LEFT JOIN dev_proyectos p ON p.idProyecto=b.idProyecto WHERE COALESCE(b.idSolicitud,p.idSolicitudOrigen) IN (${list}) AND b.fechaResolucion IS NULL`),
    pool.request().input('periodo',sql.Char(7),portfolio.periodo).query(`SELECT h.loginUsuario,SUM(h.minutosTrabajos)/60.0 AS horas FROM solicitudTI_desarrollo_horas h LEFT JOIN dev_proyectos p ON p.idProyecto=h.idProyecto WHERE COALESCE(h.idSolicitud,p.idSolicitudOrigen) IN (${list}) AND h.fechaTrabajo>=CAST(@periodo+'-01' AS DATE) AND h.fechaTrabajo<DATEADD(month,1,CAST(@periodo+'-01' AS DATE)) GROUP BY h.loginUsuario`),
  ]);
  return {portfolio,tareas:tasks.recordset,avances:newest([...avances.recordset,...legacy.recordset]),bloqueos:blocks.recordset,horas:hours.recordset};
}

function member(owner, state) {
  const ids = new Set(owner.proyectos.map(p=>p.idSolicitud));
  const avances = state.avances.filter(a=>ids.has(a.idSolicitud));
  const current = owner.proyectos.find(p=>p.idSolicitud===avances[0]?.idSolicitud) || owner.proyectos[0];
  const next = owner.proyectos.filter(p=>p.fechaCompromiso).sort((a,b)=>new Date(a.fechaCompromiso)-new Date(b.fechaCompromiso))[0];
  return {login:owner.login,nombre:owner.nombre,picture:owner.picture,
    proyectosActivos:owner.proyectos.length,tareasActivas:state.tareas.filter(t=>ids.has(t.idSolicitud)).length,
    bloqueosActivos:state.bloqueos.filter(b=>ids.has(b.idSolicitud)).length,
    proyectoActual:current?.nombre,actividadActual:avances[0]?.enQueEstoy ?? null,
    proximoCompromiso:next?.fechaCompromiso ?? null,proyectoProximo:next?.proximoEntregable || next?.nombre,
    ultimaActualizacion:avances[0]?.fechaRegistro ?? null,
    horasDisponibles:owner.horasDisponibles,horasComprometidas:owner.horasComprometidas,
    horasRegistradas:Number(state.horas.find(h=>key(h.loginUsuario)===key(owner.login))?.horas || 0),
    cargaPct:owner.cargaPct,clasificacionCarga:owner.cargaPct==null?'sin_datos':owner.cargaPct<80?'adecuada':owner.cargaPct<=95?'alta':'sobrecarga'};
}

async function getEquipo(periodo) {
  const state=await snapshot(periodo),data=state.portfolio.equipo.map(d=>member(d,state));
  const projects=new Map(state.portfolio.equipo.flatMap(d=>d.proyectos.map(p=>[p.idSolicitud,{...p,dev:d.nombre}])));
  return {data,periodo:state.portfolio.periodo,resumen:resumenEquipo(data),bloqueos:state.bloqueos.map(b=>({...b,dev:projects.get(b.idSolicitud)?.dev,proyecto:projects.get(b.idSolicitud)?.nombre}))};
}

async function getDesarrollador(login,periodo) {
  const state=await snapshot(periodo),owner=state.portfolio.equipo.find(d=>key(d.login)===key(login));
  if (!owner) throw new Error('El integrante no tiene proyectos abiertos asignados.');
  const ids=new Set(owner.proyectos.map(p=>p.idSolicitud));
  return {...member(owner,state),proyectos:owner.proyectos.map(p=>({...p,idProyecto:p.idSolicitud,prioridad:p.idPrioridad,entregable:p.proximoEntregable})),
    ultimosAvances:state.avances.filter(a=>ids.has(a.idSolicitud)).slice(0,5),
    tareasActivas:state.tareas.filter(t=>ids.has(t.idSolicitud)),bloqueosActivos:state.bloqueos.filter(b=>ids.has(b.idSolicitud))};
}
module.exports={getEquipo,getDesarrollador,resumenEquipo};
