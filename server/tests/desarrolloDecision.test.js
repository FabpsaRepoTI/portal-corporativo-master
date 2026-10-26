const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transition, parseDecision } = require('../services/desarrolloDecision.model');
const ti = {login:'ingeniero',name:'Ingeniero TI',area:'SISTEMAS'}, usuario = {login:'solicitante',name:'Solicitante',area:'VENTAS'};
const original = {idSolicitud:77,idUsuario:usuario.login,tecnicoAsignado:ti.login,idEstatus:3,camposExtra:JSON.stringify({folioDesarrollo:'DEV-77',alcanceDesarrollo:'PROYECTO'})};
const rechazo = {accion:'rechazar',motivoRechazo:'Fuera de alcance',explicacionDecision:'El sistema no dispone de la integración solicitada.',observacionesDecision:'Se propone revisar la alternativa disponible.'};
const fecha = '2026-09-15T12:00:00.000Z';
function next(row,body,user) { const r=transition(row,body,user,fecha); return {...row,idEstatus:r.idEstatus,camposExtra:JSON.stringify({...JSON.parse(row.camposExtra),revisionDecision:r.revision})}; }
const rejected = () => next(original,rechazo,ti);
test('rechazo requiere motivo y explicación, incluso llamando directamente al servicio',()=>{
  for (const key of ['motivoRechazo','explicacionDecision']) assert.throws(()=>transition(original,{...rechazo,[key]:'   '},ti,fecha),/obligatoria/);
  assert.throws(()=>transition(original,rechazo,usuario,fecha),/permiso/);
});
test('conformidad conserva rechazo y registra responsable, fecha y explicación original',()=>{
  const row=next(rejected(),{accion:'conforme'},usuario),r=parseDecision(row.camposExtra);
  assert.equal(row.idEstatus,6);assert.equal(r.estado,'conforme');assert.equal(r.eventos.length,2);
  assert.equal(r.decision.explicacion,rechazo.explicacionDecision);assert.equal(r.decision.nombre,ti.name);assert.equal(r.decision.fecha,fecha);
  assert.equal(r.respuestaUsuario.login,usuario.login);
});
test('inconformidad exige explicación y conserva el estado original sin reactivar',()=>{
  assert.throws(()=>next(rejected(),{accion:'inconforme',explicacion:' '},usuario),/obligatoria/);
  const row=next(rejected(),{accion:'inconforme',explicacion:'La integración ya está autorizada.'},usuario);
  assert.equal(row.idEstatus,6);assert.equal(parseDecision(row.camposExtra).estado,'pendiente_ti');
});
test('solo el solicitante puede responder, incluido si otro usuario pertenece a TI',()=>{
  for (const user of [ti,{...usuario,login:'otro'}]) assert.throws(()=>next(rejected(),{accion:'inconforme',explicacion:'Solicito revisión'},user),/permiso/);
});
test('evita duplicados y conformidad que sobrescriba una inconformidad pendiente',()=>{
  const row=next(rejected(),{accion:'inconforme',explicacion:'Solicito revisión'},usuario);
  for(const accion of ['conforme','inconforme']) assert.throws(()=>next(row,{accion,explicacion:'Duplicada'},usuario),/respuesta registrada/);
});
test('TI ratifica con justificación y conserva todas las decisiones y respuestas',()=>{
  const pending=next(rejected(),{accion:'inconforme',explicacion:'Solicito revisión'},usuario);
  assert.throws(()=>next(pending,{accion:'ratificar',explicacion:''},ti),/obligatoria/);
  assert.throws(()=>next(pending,{accion:'ratificar',explicacion:'Mantener'},usuario),/permiso/);
  const row=next(pending,{accion:'ratificar',explicacion:'La dependencia externa sigue sin autorización.'},ti),r=parseDecision(row.camposExtra);
  assert.equal(row.idEstatus,6);assert.equal(r.estado,'ratificada');assert.equal(r.eventos.length,3);assert.equal(r.respuestaUsuario.explicacion,'Solicito revisión');
});
test('reactivar requiere motivo y responsable; recupera el estatus anterior sin tocar otros campos',()=>{
  assert.throws(()=>next(rejected(),{accion:'reactivar'},ti),/obligatoria/);
  assert.throws(()=>next({...rejected(),tecnicoAsignado:null},{accion:'reactivar',explicacion:'Autorizado'},ti),/responsable/);
  const row=next(rejected(),{accion:'reactivar',explicacion:'Se autorizó la integración.'},ti);
  assert.equal(row.idEstatus,3);assert.equal(row.tecnicoAsignado,original.tecnicoAsignado);assert.equal(JSON.parse(row.camposExtra).alcanceDesarrollo,'PROYECTO');
});
test('rechazo histórico admite revisión sin inventar autor o fecha; reactivación vuelve a Pendiente',()=>{
  const old={...original,idEstatus:6};assert.equal(parseDecision(old.camposExtra),null);
  assert.equal(parseDecision(next(old,{accion:'inconforme',explicacion:'Falta información'},usuario).camposExtra).decision,undefined);
  assert.equal(next(old,{accion:'reactivar',explicacion:'Revisado'},ti).idEstatus,1);
});
test('un desarrollo concluido no usa el flujo de rechazo o revisión',()=>{
  for (const accion of ['rechazar','reactivar','inconforme']) assert.throws(()=>next({...original,idEstatus:7},{...rechazo,accion},accion==='inconforme'?usuario:ti),/estado/);
});
function serviceFixture({row=rejected(),fail=false}={}) {
  const calls=[],notifications=[],events=[];class Transaction{async begin(){events.push('begin')}async commit(){events.push('commit')}async rollback(){events.push('rollback')}}
  class Request{constructor(tx){this.tx=tx;this.params={}}input(k,t,v){this.params[k]=v;return this}async query(q){calls.push({q,p:this.params,tx:this.tx});if(q.includes('SELECT s.idSolicitud'))return {recordset:[{...row,fechaDecision:new Date(fecha)}]};if(fail)throw Error('write failed');return {recordset:[]}}}
  const type=()=>{},sql={Transaction,Request,Int:type,DateTime:type,NVarChar:type,VarChar:type,MAX:0};
  const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../services/desarrolloDecision.service'),'utf8'),{module,exports:module.exports,require:name=>name==='mssql'?sql:name==='../db'?{getPool:async()=>({})}:name==='./desarrolloDecision.model'?{transition}:{crearNotificacion:async n=>{events.push('notify');notifications.push(n)},TIPOS:{COMENTARIO_NUEVO:4,ESTATUS_CAMBIO:3}}});
  return {run:module.exports.registrar,calls,notifications,events};
}
for(const accion of ['conforme','inconforme'])test(`${accion}: persistencia atómica y notificación al ingeniero después de confirmar`,async()=>{
  const env=serviceFixture();await env.run(77,{accion,explicacion:'Revisar evidencia'},usuario);
  assert.deepEqual(env.events,['begin','commit','notify']);assert.match(env.calls[0].q,/UPDLOCK,HOLDLOCK/);
  const write=env.calls[1];assert.equal(write.p.estado,6);assert.match(write.q,/solicitudTI_bitacora/);assert.match(write.q,/solicitudTI_comentarios/);assert.match(write.q,/JSON_MODIFY/);
  assert.equal(env.notifications[0].loginDestino,ti.login);assert.match(env.notifications[0].urlDestino,/tab=desarrollo&solicitud=77/);
});
test('fallo al guardar revierte la decisión y no notifica una acción no confirmada',async()=>{
  const env=serviceFixture({fail:true});await assert.rejects(env.run(77,{accion:'conforme'},usuario),/write failed/);
  assert.deepEqual(env.events,['begin','rollback']);assert.equal(env.notifications.length,0);
});
test('segunda inconformidad bajo bloqueo no escribe ni genera notificación',async()=>{
  const env=serviceFixture({row:next(rejected(),{accion:'inconforme',explicacion:'Revisar'},usuario)});
  await assert.rejects(env.run(77,{accion:'inconforme',explicacion:'Duplicada'},usuario),/respuesta registrada/);
  assert.equal(env.calls.length,1);assert.deepEqual(env.events,['begin','rollback']);
});
