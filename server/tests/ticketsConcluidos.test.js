const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../services/solicitudesAdmin.service.js'), 'utf8');
function fixture(status, closeDuringUpdate=false) {
  const writes=[], notifications=[];
  const state={status};
  const pool={request(){return {input(){return this},async query(query){
    if (/UPDATE solicitudTI/.test(query)) {
      if(closeDuringUpdate) state.status=4;
      assert.match(query,/AND idEstatus NOT IN \(3,4\)/);
      assert.match(query,/IF @@ROWCOUNT = 0 THROW 51001/);
      if([3,4].includes(state.status)) throw Object.assign(new Error('Ticket bloqueado'),{number:51001});
      writes.push(query);
    }
    if(/INSERT INTO/.test(query)) writes.push(query);
    return {recordset:[{idEstatus:state.status,estatusActual:state.status,tecnicoAsignado:'dev',nombreTecnico:'Dev',idUsuario:'requester',folio:'TEST',slaRespuestaHrs:1,slaResolucionHrs:8,prioridad:'Alta'}]};
  }}}};
  const sql={Int:0,MAX:0,VarChar:()=>0,NVarChar:()=>0};
  const module={exports:{}};
  new Function('require','module',source)(name=>name==='../db'?{getPool:async()=>pool,sql}:{crearNotificacion:async n=>notifications.push(n),TIPOS:{}},module);
  return {...module.exports,writes,notifications,state};
}
const actions={asignar:[1,'dev','Dev'],cambiarEstatus:[1,2,'dev','Dev'],escalar:[1,'Proveedor','Motivo','dev','Dev'],finalizarEscalamiento:[1,'dev','Dev'],resolverConAcciones:[1,'Solucionado','dev','Dev'],cambiarPrioridad:[1,1],transferir:[1,'other','Otro','dev','Dev']};
for(const status of [3,4]) for(const [action,args] of Object.entries(actions)) {
  test(`${action}: estado ${status} no permite cambios ni notificaciones`,async()=>{
    const f=fixture(status);
    try {const r=await f[action](...args);assert.equal(r?.ok,false);} catch(e){assert.equal(e.number,51001);}
    assert.equal(f.writes.length,0);assert.equal(f.notifications.length,0);
  });
}
for(const [action,args] of Object.entries(actions)) {
  test(`${action}: ticket activo permite la operación`,async()=>{
    const f=fixture(action==='finalizarEscalamiento'?8:1);
    await f[action](...args);assert.ok(f.writes.some(q=>q.includes('UPDATE solicitudTI')));
  });
  test(`${action}: protege también si se cierra después de consultar`,async()=>{
    const f=fixture(action==='finalizarEscalamiento'?8:2,true);
    await assert.rejects(f[action](...args),e=>e.number===51001);
    assert.equal(f.writes.length,0);assert.equal(f.notifications.length,0);
  });
}
test('la interfaz bloquea inmediatamente resueltos/cerrados y permite reabiertos',()=>{
  const jsx=fs.readFileSync(path.join(__dirname,'../../client/src/pages/mesaServicio/atencionIncidencias/AtencionIncidenciasPage.jsx'),'utf8');
  const body=jsx.match(/function ticketBloqueado\(sol\) \{([\s\S]*?)\n\}/)[1];
  const blocked=new Function('sol',body);
  for(const idEstatus of [3,4,'3','4']) assert.equal(blocked({idEstatus}),true);
  for(const idEstatus of [1,2,6,7,8]) assert.equal(blocked({idEstatus}),false);
});
