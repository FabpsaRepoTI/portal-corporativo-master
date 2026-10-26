const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {revision}=require('../helpers/accesosSnapshot');
function setup({old=[{clave:'portal',esMto:false}],failAudit=false}={}){
 const calls=[],events=[],mod={exports:{}};
 const tx={begin:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),request(){const params={};return {input(k,t,v){params[k]=v;return this},async query(q){calls.push({q,params});if(q.includes('INSERT INTO dbo.portal_accesos_historial')&&failAudit)throw Object.assign(new Error('missing'),{number:208});return {recordset:q.includes('SELECT login FROM SEC_USERS')?[{login:'TARGET'}]:q.includes('SELECT m.clave,um.esMto')?old:q.includes('SELECT clave FROM portal_modulos')?['portal','escaner','escaner_contabilidad','usuarios_admin','usuarios_crear','mantenimiento'].map(clave=>({clave})):[]};}}}};
 new Function('require','module',fs.readFileSync(require.resolve('../services/permisos.service'),'utf8'))(name=>name.includes('accesosSnapshot')?require('../helpers/accesosSnapshot'):{sql:{NVarChar:()=>{}},getPool:async()=>({transaction:()=>tx})},mod);
 return {svc:mod.exports,calls,events};
}
const opts={puedeGestionarCreacion:true,actor:{login:'JMRAMIREZ',name:'Juan Ramírez'},revision:revision({modulos:['portal'],esMto:false})};
test('saving records authenticated actor and before/after in the permission transaction',async()=>{
 const e=setup();const r=await e.svc.setModulosUsuario('TARGET',['portal','escaner','escaner_contabilidad'],false,opts);
 assert.deepEqual(e.events,['begin','commit']);assert.ok(r.revision);
 const audit=e.calls.find(c=>c.q.includes('INSERT INTO dbo.portal_accesos_historial'));
 assert.equal(audit.params.actor,'JMRAMIREZ');assert.equal(audit.params.login,'TARGET');assert.deepEqual(JSON.parse(audit.params.antes),{modulos:['portal'],esMto:false});assert.equal(JSON.parse(audit.params.despues).modulos.length,3);
});
test('missing audit table rolls back all permission changes instead of silently omitting history',async()=>{
 const e=setup({failAudit:true});await assert.rejects(e.svc.setModulosUsuario('TARGET',['escaner'],false,opts),e=>e.status===503);assert.deepEqual(e.events,['begin','rollback']);
});
test('stale revisions and unknown modules cannot overwrite current rights',async()=>{
 for(const [claves,options,status] of [[['escaner'],{...opts,revision:'old'},409],[['made-up'],opts,400]]){
  const e=setup();await assert.rejects(e.svc.setModulosUsuario('TARGET',claves,false,options),e=>e.status===status);assert.ok(!e.calls.some(c=>c.q.includes('DELETE')));assert.equal(e.events.at(-1),'rollback');
 }
});
test('no-op saves do not create misleading audit entries',async()=>{const e=setup();const r=await e.svc.setModulosUsuario('TARGET',['portal'],false,opts);assert.equal(r.sinCambios,true);assert.ok(!e.calls.some(c=>c.q.includes('INSERT')));});
test('revoking parent modules also removes child rights and maintenance technician flag',async()=>{
 const e=setup();const r=await e.svc.setModulosUsuario('TARGET',['portal','escaner_contabilidad','usuarios_crear'],true,opts);assert.deepEqual(r.modulos,['portal']);assert.equal(r.esMto,false);
});
