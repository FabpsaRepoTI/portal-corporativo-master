const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const {normalizarNombreCorto} = require('../helpers/nombreCorto');
test('short names are normalized without losing accents or inventing a surname', () => {
  for (const [input, output] of [[' JUAN   RAMÍREZ ', 'Juan Ramírez'], ['LIZBET HERNANDEZ', 'Lizbet Hernandez'], ['francisco márquez', 'Francisco Márquez'], ['ÓSCAR MUÑOZ','Óscar Muñoz']]) assert.equal(normalizarNombreCorto(input), output);
  for (const input of ['Juan Manuel Ramirez Martinez', 'FRANCISCO JAVIER MINA RODRIGUEZ', 'FULANITO PEREZ MEJIA', 'Juan', '', null, 'Juan 123']) assert.throws(() => normalizarNombreCorto(input), /un solo nombre y un apellido/);
});
test('creation and editing save the normalized name and reject long names before database access', async () => {
  const mod = {exports:{}}, names = []; let queries = 0;
  const pool = {request() {return {input(k,t,v) {if(k==='name')names.push(v);return this}, async query() {queries++;}}}};
  new Function('require','module',fs.readFileSync(require.resolve('../services/usuarios.service'),'utf8'))(name => name==='mssql'?{NVarChar:()=>{}}:name==='../db'?{getPool:async()=>pool}:{normalizarNombreCorto},mod);
  const data={login:'TEST',pswd:'test-only',name:'JUAN RAMÍREZ',email:'test@example.test',sitio:'PLANTA',area:'SISTEMAS'};
  await mod.exports.crearUsuario(data);await mod.exports.editarUsuario('TEST',data);
  assert.deepEqual(names,['Juan Ramírez','Juan Ramírez']);assert.equal(queries,2);
  await assert.rejects(mod.exports.crearUsuario({...data,name:'Juan Manuel Ramirez Martinez'}));
  await assert.rejects(mod.exports.editarUsuario('TEST',{...data,name:'Juan Manuel Ramirez Martinez'}));assert.equal(queries,2);
});
function access(grants) {
  const mod={exports:{}};
  new Function('require','module','process',fs.readFileSync(require.resolve('../services/usuariosAccess.service'),'utf8'))(()=>({getModulosUsuario:async()=>({modulos:grants})}),mod,{env:{USER_CREATION_MANAGERS:'OWNER'}});
  return mod.exports;
}
test('global access requires explicit grant and does not grant creation without usuarios_crear',async()=>{
  for (const grants of [[],['usuarios_crear']]) {
    const svc=access(grants),res={status(n){this.code=n;return this},json(){}};
    await svc.requireAdministracionUsuarios({user:{login:'OTHER',area:'SISTEMAS',modulos:['usuarios_admin']}},res,()=>assert.fail());assert.equal(res.code,403);
  }
});
test('usuarios_admin delegates permission management (assigning modules) even without being the configured owner',async()=>{
  const svc=access(['usuarios_admin']);
  assert.deepEqual(await svc.capacidadesUsuarios({login:'OTHER',area:'SISTEMAS'}),{puedeVerUsuarios:true,puedeCrear:false,puedeGestionarCreacion:false,puedeAsignarPermisos:true});
  const res={status(n){this.code=n;return this},json(){}};
  let delegate=false;await svc.requireGestionAccesos({user:{login:'OTHER',area:'SISTEMAS'}},res,()=>delegate=true);assert.equal(delegate,true);
  let owner=false;await svc.requireGestionAccesos({user:{login:'OWNER',area:'SISTEMAS'}},{},()=>owner=true);assert.equal(owner,true);
});
test('without usuarios_admin, only the configured owner can manage permissions',async()=>{
  const svc=access([]);
  const res={status(n){this.code=n;return this},json(){}};
  await svc.requireGestionAccesos({user:{login:'OTHER',area:'SISTEMAS'}},res,()=>assert.fail());assert.equal(res.code,403);
  let owner=false;await svc.requireGestionAccesos({user:{login:'OWNER',area:'SISTEMAS'}},{},()=>owner=true);assert.equal(owner,true);
});
test('Sistemas alone and stale token grants do not authorize creation',async()=>{
  const svc=access([]),user={login:'OTHER',area:'SISTEMAS',modulos:['usuarios_crear']};
  assert.deepEqual(await svc.capacidadesUsuarios(user),{puedeVerUsuarios:false,puedeCrear:false,puedeGestionarCreacion:false,puedeAsignarPermisos:false});
  const res={status(n){this.code=n;return this},json(){}};await svc.requireCrearUsuario({user},res,()=>assert.fail());assert.equal(res.code,403);
});
test('explicit grant allows creation but only configured owner delegates',async()=>{
  assert.deepEqual(await access(['usuarios_admin','usuarios_crear']).capacidadesUsuarios({login:'OTHER',area:'SISTEMAS'}),{puedeVerUsuarios:true,puedeCrear:true,puedeGestionarCreacion:false,puedeAsignarPermisos:true});
  assert.deepEqual(await access([]).capacidadesUsuarios({login:'owner',area:'SISTEMAS'}),{puedeVerUsuarios:true,puedeCrear:true,puedeGestionarCreacion:true,puedeAsignarPermisos:true});
  assert.equal((await access(['usuarios_crear']).capacidadesUsuarios({login:'OTHER',area:'VENTAS'})).puedeCrear,false);
});
test('non-manager cannot reset another creator or owner account to bypass access',async()=>{
  for(const [login,grants] of [['CREATOR',['usuarios_crear']],['OWNER',[]]]){
    const res={status(n){this.code=n;return this},json(){}};
    await access(grants).protegerCuentaAutorizada({user:{login:'OTHER',area:'SISTEMAS'},params:{login}},res,()=>assert.fail());assert.equal(res.code,403);
  }
});
test('creation grants cannot be added or removed by a non-manager in the transaction',async()=>{
  for(const existing of [true,false]){
    const mod={exports:{}},events=[];
    const tx={begin:async()=>{},commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),request(){return {input(){return this},query:async q=>{events.push(q);return {recordset:existing?[{clave:'usuarios_crear'}]:[]}}}}};
    new Function('require','module',fs.readFileSync(require.resolve('../services/permisos.service'),'utf8'))(()=>({sql:{},getPool:async()=>({transaction:()=>tx})}),mod);
    await assert.rejects(mod.exports.setModulosUsuario('SELF',existing?[]:['usuarios_crear']),e=>e.status===403);
    assert.ok(!events.some(v=>v.includes('DELETE')||v.includes('INSERT')));assert.deepEqual(events,[]);
  }
});
