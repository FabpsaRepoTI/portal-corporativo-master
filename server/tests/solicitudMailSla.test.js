const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {formatSlaDuration}=require('../helpers/formatSlaDuration');
for(const [minutes,text] of [[1,'1 minuto'],[30,'30 minutos'],[60,'1 hora'],[90,'1 hora 30 minutos'],[1440,'24 horas'],[4320,'72 horas'],['125','2 horas 5 minutos'],[null,'—'],[0,'—'],[-1,'—'],['bad','—']]){
 test(`SLA ${minutes} minutos → ${text}`,()=>assert.equal(formatSlaDuration(minutes),text));
}
function load(file,customRequire){const module={exports:{}};new Function('require','module','__dirname',fs.readFileSync(file,'utf8'))(customRequire,module,path.dirname(file));return module.exports;}
test('registro → controlador → correos: minutos del catálogo, sin SMTP real',async()=>{
 const mail=[];
 const mailer=load(path.join(__dirname,'../services/mailer.js'),name=>name==='nodemailer'?{createTransport:()=>({sendMail:async value=>mail.push(value)})}:name==='../helpers/formatSlaDuration'?{formatSlaDuration}:require(name));
 let calls=0;
 const records=[{slaRespuestaMin:90,slaResolucionMin:1440},{prioridad:'Media',colorHex:'#f59e0b'},{idSolicitud:1,folio:'TEST-1',fechaCreacion:'2026-09-22T12:00:00Z'}];
 const pool={request(){return {input(){return this},async query(){return {recordset:[records[calls++]]}}}}};
 const service=load(path.join(__dirname,'../services/solicitudes.service.js'),name=>name==='../db'?{getPool:async()=>pool}:require(name));
 const result=await service.crearSolicitud({idServicio:1,idPrioridad:2,titulo:'Prueba',idUsuario:'test'});
 assert.equal(result.slaRespuestaMin,90);assert.equal(result.slaResolucionMin,1440);
 // Preserve the existing API fields for current consumers.
 assert.equal(result.slaRespuestaHrs,90);assert.equal(result.slaResolucionHrs,1440);
 assert.equal((result.fechaLimiteResol-result.fechaLimiteResp)/60000,1350);
 let task;
 const controller=load(path.join(__dirname,'../controllers/solicitudes.controller.js'),name=>name.includes('solicitudes.service')?{crearSolicitud:async()=>result}:name.includes('mailer')?{enviarCorreoSolicitudTI:args=>(task=mailer.enviarCorreoSolicitudTI(args))}:{getPool:async()=>({request:()=>({input(){return this},query:async()=>({recordset:[{idServicio:1,idPrioridadDefault:2,nombre:'Soporte'}]})})})});
 let response;
 await controller.postSolicitud({body:{slug:'test',titulo:'Prueba'},user:{login:'test',name:'Prueba',email:'test@example.invalid'},files:[]},{json:value=>{response=value},status(){return this}});
 await task;
 assert.equal(response.ok,true);assert.equal(mail.length,2);
 for(const message of mail){assert.match(message.html,/>1 hora 30 minutos</);assert.match(message.html,/>24 horas</);assert.doesNotMatch(message.html,/>60 días</);assert.doesNotMatch(message.html,/>4 días</);}
});
