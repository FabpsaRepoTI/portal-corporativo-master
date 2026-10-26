const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),express=require('express');
test('all user operations and all permission endpoints enforce their respective gates',async()=>{
 const am={exports:{}};
 new Function('require','module','process',fs.readFileSync(require.resolve('../services/usuariosAccess.service'),'utf8'))(()=>({getModulosUsuario:async login=>({modulos:login==='ADMIN'?['usuarios_admin']:[]})}),am,{env:{USER_CREATION_MANAGERS:'JMRAMIREZ'}});
 const authenticate=(req,res,next)=>{req.user={login:req.headers['x-test-user']||'OTHER',area:'SISTEMAS'};next();};
 const um={exports:{}};
 new Function('require','module','__dirname',fs.readFileSync(require.resolve('../routes/usuarios.routes'),'utf8'))(name=>{
   if(name==='../middleware/auth')return {verifyToken:(req,res,next)=>{const h=req.headers.authorization;if(!h||!h.startsWith('Bearer '))return res.status(401).json({error:'Token no proporcionado.'});req.user={login:h.split(' ')[1],area:'SISTEMAS'};next();}};
   if(name==='../services/usuarios.service')return {getUsuarios:async()=>[],getUsuarioByLogin:async()=>({login:'TARGET'})};
   if(name==='../services/usuariosAccess.service')return am.exports;
   if(name==='fs')return {existsSync:()=>true};return require(name);
 },um,require('node:path').dirname(require.resolve('../routes/usuarios.routes')));
 const pm={exports:{}};
 new Function('require','module',fs.readFileSync(require.resolve('../routes/permisos.routes'),'utf8'))(name=>{
   if(name==='express')return express;if(name==='../middleware/auth')return {verifyToken:authenticate};
   if(name==='../services/usuariosAccess.service')return am.exports;
   return {getModulosCatalogo:async()=>[],getModulosUsuario:async()=>({modulos:[],esMto:false}),setModulosUsuario:async()=>{}};
 },pm);
 const app=express();app.use(express.json());app.use('/users',um.exports);app.use('/permissions',pm.exports);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
   for(const [method,path] of [['GET','/users'],['GET','/users/TARGET'],['POST','/users'],['PUT','/users/TARGET'],['PUT','/users/TARGET/foto'],['PATCH','/users/TARGET/activo']]) {
     assert.equal((await fetch(base+path,{method,headers:{Authorization:'Bearer OTHER'}})).status,403,method+' '+path);
   }
   assert.equal((await fetch(base+'/users',{headers:{Authorization:'Bearer ADMIN'}})).status,200);
   assert.equal((await fetch(base+'/users',{method:'POST',headers:{Authorization:'Bearer ADMIN'}})).status,403);
   for(const [method,path] of [['GET','/permissions/modulos'],['GET','/permissions/usuarios/TARGET/modulos'],['PUT','/permissions/usuarios/TARGET/modulos']])assert.equal((await fetch(base+path,{method,headers:{'x-test-user':'OTHER'}})).status,403);
   // usuarios_admin ahora también delega la asignación de módulos, no solo la creación.
   for(const [method,path] of [['GET','/permissions/modulos'],['GET','/permissions/usuarios/TARGET/modulos'],['PUT','/permissions/usuarios/TARGET/modulos']])assert.equal((await fetch(base+path,{method,headers:{'x-test-user':'ADMIN'}})).status,200);
   assert.equal((await fetch(base+'/permissions/modulos',{headers:{'x-test-user':'JMRAMIREZ'}})).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
