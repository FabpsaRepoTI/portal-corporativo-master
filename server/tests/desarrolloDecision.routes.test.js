const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const express=require('express');
test('rechazados: comentarios, evidencia y revisión accesibles solo a participantes; demás mutaciones bloqueadas',async()=>{
  const file=require.resolve('../routes/solicitudesDesarrollo.routes'),module={exports:{}},calls=[];
  const users={owner:{login:'owner',area:'VENTAS'},ti:{login:'dev',area:'SISTEMAS'},otro:{login:'otro',area:'VENTAS'}};
  const pool={request:()=>({input(){return this},async query(){return {recordset:[{idEstatus:6,idUsuario:'owner'}]}}})};
  const upload=()=>({array:()=>((req,res,next)=>{req.files=[];next()})});upload.diskStorage=()=>({});
  const svc={agregarComentario:async()=>{calls.push('comentario');return {ok:true}},subirAdjuntos:async()=>{calls.push('adjuntos');return []}};
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,__dirname:path.dirname(file),process,console,
    require:name=>name==='express'?express:name==='multer'?upload:name==='path'?path:name==='fs'?{mkdirSync(){}}:name==='jsonwebtoken'?{verify:token=>users[token]}:name==='mssql'?{Int:0}:name==='../db'?{getPool:async()=>pool}:name==='../services/solicitudesDesarrollo.service'?svc:name==='../services/desarrolloDecision.service'?{registrar:async()=>{calls.push('revision');return {ok:true}}}:require(name)});
  const app=express();app.use(express.json());app.use('/api/solicitudes-desarrollo',module.exports);const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});
  try{const send=(suffix,method='POST',user='owner')=>fetch(`http://127.0.0.1:${server.address().port}/api/solicitudes-desarrollo/77/${suffix}`,{method,headers:{Authorization:`Bearer ${user}`,'Content-Type':'application/json'},body:JSON.stringify({comentario:'Revisar',accion:'inconforme',explicacion:'Revisar'})});
    for(const user of ['owner','ti'])for(const suffix of ['comentario','adjuntos','revision-decision'])assert.equal((await send(suffix,'POST',user)).status,200);
    for(const suffix of ['comentario','adjuntos','revision-decision'])assert.equal((await send(suffix,'POST','otro')).status,403);
    for(const [suffix,method]of [['estatus','PUT'],['detalle','PUT'],['asignar','PUT'],['concluir','POST'],['actividad','POST'],['horas','POST'],['evaluacion','POST'],['revision-decision','PUT']])assert.equal((await send(suffix,method,'ti')).status,409);
    assert.equal(calls.length,6);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
