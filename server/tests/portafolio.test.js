"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildPortfolio, projectState} = require('../services/portafolio.model');
const now=Date.parse('2026-09-11T12:00:00Z');
const row=(extra={})=>({idSolicitud:1,titulo:'Portal',idEstatus:3,loginResponsable:'ana',nombreResponsable:'Ana',porcentajeAvance:42,fechaInicio:'2026-09-01',fechaCompromiso:'2026-09-20',tiempoEstado:'en_tiempo',diasRestantes:9,fechaCreacion:'2026-09-01T00:00:00Z',...extra});
test('active statuses use the Mesa enum and exclude pending, cancelled and completed',()=>{
 const result=buildPortfolio([1,2,3,4,5,6,7].map(id=>row({idSolicitud:id,idEstatus:id})),[],now);
 assert.deepEqual(result.data.map(p=>p.idEstatus),[2,3,4,5]);
});
test('Mesa status, owner and exact progress are read afresh, including zero',()=>{
 const source=row();assert.equal(buildPortfolio([source]).data[0].avancePct,42);
 source.porcentajeAvance=73;source.idEstatus=4;source.loginResponsable='luis';
 const updated=buildPortfolio([source]);assert.equal(updated.data[0].avancePct,73);assert.equal(updated.data[0].etapaNombre,'En pruebas');assert.equal(updated.equipo[0].login,'luis');
 source.porcentajeAvance=0;assert.equal(buildPortfolio([source]).data[0].avancePct,0);
});
test('unassigned attention fires strictly after 48 elapsed hours',()=>{
 const make=(id,seconds,owner,status=1)=>row({idSolicitud:id,segundosAbiertos:seconds,loginResponsable:owner,idEstatus:status,fechaCompromiso:'2026-09-20'});
 const result=buildPortfolio([make(1,48*3600,'',1),make(2,48*3600+1,'',3),make(3,48*3600+1,'ana',1),make(4,48*3600-1,'',1)],[],now);
 assert.deepEqual(result.atencion.map(a=>a.idSolicitud),[2]);
});
test('assigned work without a commitment date is flagged late after 7 days',()=>{
 const make=(id,seconds)=>row({idSolicitud:id,segundosAbiertos:seconds,loginResponsable:'ana',fechaCompromiso:null});
 const result=buildPortfolio([make(1,7*24*3600),make(2,7*24*3600+1)],[],now);
 assert.deepEqual(result.atencion.map(a=>a.idSolicitud),[2]);
 assert.equal(result.atencion[0].etiqueta,'Atrasado');
});
test('no owner, no start and no commitment must not display En tiempo',()=>{
 assert.equal(projectState(row({loginResponsable:' ',segundosAbiertos:0})).label,'Sin responsable');
 assert.equal(projectState(row({porcentajeAvance:0,fechaInicio:null})).label,'Sin iniciar');
 assert.equal(projectState(row({fechaCompromiso:null,segundosAbiertos:0})).label,'Sin compromiso');
 assert.equal(projectState(row({idEstatus:1})).label,'Sin iniciar');
 assert.equal(projectState(row({bloqueosActivos:1})).label,'Bloqueado');
 assert.equal(projectState(row()).label,'En tiempo');
});
test('unassigned or commitment-less work becomes risk only after its grace period',()=>{
 assert.equal(projectState(row({loginResponsable:'',segundosAbiertos:47*3600})).key,'pending');
 assert.equal(projectState(row({loginResponsable:'',segundosAbiertos:49*3600})).label,'Sin asignar');
 assert.equal(projectState(row({loginResponsable:'',segundosAbiertos:49*3600})).key,'risk');
 assert.equal(projectState(row({fechaCompromiso:null,segundosAbiertos:6*24*3600})).key,'pending');
 assert.equal(projectState(row({fechaCompromiso:null,segundosAbiertos:8*24*3600})).label,'Atrasado');
 assert.equal(projectState(row({fechaCompromiso:null,segundosAbiertos:8*24*3600})).key,'risk');
});
test('proyectosRiesgo surfaces overdue Pendiente work that never reached an active status',()=>{
 const stalled=row({idSolicitud:9,idEstatus:1,loginResponsable:'oscar',fechaCompromiso:null,segundosAbiertos:8*24*3600});
 const fresh=row({idSolicitud:10,idEstatus:1,loginResponsable:'oscar',fechaCompromiso:null,segundosAbiertos:2*24*3600});
 const result=buildPortfolio([stalled,fresh],[],now);
 assert.deepEqual(result.data.map(p=>p.idSolicitud),[]);
 assert.deepEqual(result.proyectosRiesgo.map(p=>p.idSolicitud),[9]);
 assert.equal(result.proyectosRiesgo[0].estado.label,'Atrasado');
});
test('team contains only owners of open assignments and never invents a capacity percentage',()=>{
 const result=buildPortfolio([row(),row({idSolicitud:2,loginResponsable:'alberto',idEstatus:7}),row({idSolicitud:3,loginResponsable:''}),row({idSolicitud:4,loginResponsable:'luis',idEstatus:1,horasEstimadas:40})],[{loginUsuario:'luis',horasDisponibles:80}],now);
 assert.deepEqual(result.equipo.map(d=>d.login),['ana','luis']);assert.equal(result.equipo[0].cargaPct,null);assert.equal(result.equipo[1].cargaPct,50);
});
test('closed work is excluded from attention and blocked counts; active overdue work is visible',()=>{
 const result=buildPortfolio([row({idSolicitud:1,bloqueosActivos:1,idEstatus:7}),row({idSolicitud:2,bloqueosActivos:2,tiempoEstado:'vencido'})],[],now);
 assert.equal(result.resumen.bloqueos,2);assert.equal(result.resumen.enRiesgo,1);assert.deepEqual(result.atencion.map(a=>a.idSolicitud),[2,2]);
});

test('simple changes never enter portfolio, team or attention',()=>{const result=buildPortfolio([row({alcanceDesarrollo:'CAMBIO_SENCILLO',bloqueosActivos:1}),row({idSolicitud:2})]);assert.deepEqual(result.data.map(p=>p.idSolicitud),[2]);assert.equal(result.equipo[0].proyectos.length,1);assert.equal(result.atencion.length,0)});
test('waiting for information is paused and rejection is excluded',()=>{const result=buildPortfolio([row({idEstatus:5}),row({idSolicitud:2,idEstatus:6,bloqueosActivos:1})]);assert.equal(result.data.length,1);assert.equal(result.data[0].etapaNombre,'Esperando información');assert.equal(result.data[0].estado.label,'Esperando información');assert.equal(result.equipo[0].proyectos.length,1)});
test('all five open assignments include pending and exclude completed',()=>{const result=buildPortfolio([1,2,3,3,3,7].map((status,i)=>row({idSolicitud:i+1,idEstatus:status})));assert.equal(result.equipo[0].proyectos.length,5);assert.equal(result.data.length,4)});
