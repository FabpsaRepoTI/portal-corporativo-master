"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../services/gestionDesarrollo.service'),'utf8');
function setup(rows,{failHours=false}={}) {
 const calls=[],transactions=[];
 class Request {constructor(){this.params={};}input(k,type,v){this.params[k]=v;return this;}async query(sql){calls.push({sql,params:this.params});if(failHours&&sql.includes('INSERT solicitudTI_desarrollo_horas'))throw new Error('Hours failed');return {recordset:sql.includes('OUTPUT INSERTED')?[{idAvance:1}]:[],rowsAffected:[1]};}}
 class Transaction{async begin(){transactions.push('begin');}async commit(){transactions.push('commit');}async rollback(){transactions.push('rollback');}}
 const type=()=>null;
 const db={getPool:async()=>({request:()=>new Request()}),sql:{Request,Transaction,Char:type,VarChar:type,NVarChar:type,Int:'int',Bit:'bit',TinyInt:'tiny',Date:'date',MAX:'max'}};
 const pages=[];const desarrollo={getLista:async q=>{pages.push(q);return {data:rows.slice((q.page-1)*q.limit,q.page*q.limit),total:rows.length};},getDetalle:async id=>rows.find(p=>p.idSolicitud===id)};
 const stageModule={exports:{}};new Function('require','module','exports',fs.readFileSync(require.resolve('../services/desarrolloEtapas.service'),'utf8'))(name=>db,stageModule,stageModule.exports);
 const mod={exports:{}};new Function('require','module','exports',source)(name=>name==='../db'?db:name==='./desarrolloEtapas.service'?stageModule.exports:name==='./solicitudesDesarrollo.service'?desarrollo:require('../services/portafolio.model'),mod,mod.exports);
 return {svc:mod.exports,calls,transactions,pages};
}
const row={idSolicitud:1,idEstatus:3,titulo:'Proyecto',tecnicoAsignado:'ana',loginResponsable:'ana',porcentajeAvance:42};
const body={numeroEtapa:2,fechaInicioEtapa:'2026-09-11',fechaFinEtapa:'2026-09-20',estado:'PUBLICADO',avanceNuevo:63,terminado:'Terminado',trabajando:'Actual',siguiente:'Siguiente',minutosInvertidos:120,tieneBloqueo:true,bloqueo:'Acceso a pruebas'};

test('reads all pages, including an unassigned request after the first 100 records',async()=>{
 const rows=Array.from({length:101},(_,i)=>({...row,idSolicitud:i+1}));rows[100]={...rows[100],idEstatus:1,loginResponsable:'',segundosAbiertos:85*3600};const env=setup(rows);const result=await env.svc.getPortafolio({periodo:'2026-09'});assert.equal(env.pages.length,2);assert.equal(result.data.length,100);assert.equal(result.atencion[0].idSolicitud,101);
});
test('published advancement, hours and blocks target the same Mesa request in one transaction',async()=>{
 const env=setup([row]);await env.svc.guardarAvance(1,body,{login:'ana',name:'Ana'});assert.deepEqual(env.transactions,['begin','commit']);
 const update=env.calls.find(c=>c.sql.includes('UPDATE solicitudTI_desarrollo_detalle'));assert.equal(update.params.id,1);assert.equal(update.params.a,63);
 assert(env.calls.some(c=>c.sql.includes('INSERT solicitudTI_desarrollo_horas')&&c.params.id===1&&c.params.min===120));assert(env.calls.some(c=>c.sql.includes('INSERT solicitudTI_desarrollo_bloqueos')&&c.params.id===1));assert(!env.calls.some(c=>/dev_proyectos|dev_avances/.test(c.sql)));
});
test('a draft does not change Mesa progress, hours or blocks',async()=>{const env=setup([row]);await env.svc.guardarAvance(1,{...body,estado:'BORRADOR'},{login:'ana'});assert(!env.calls.some(c=>c.sql.includes('UPDATE solicitudTI_desarrollo_detalle')||c.sql.includes('INSERT solicitudTI_desarrollo_horas')||c.sql.includes('INSERT solicitudTI_desarrollo_bloqueos')));});
test('failed shared writes roll back the entire advancement',async()=>{const env=setup([row],{failHours:true});await assert.rejects(env.svc.guardarAvance(1,body,{login:'ana'}),/Hours failed/);assert.deepEqual(env.transactions,['begin','rollback']);});
test('cannot publish against an unassigned or closed request',async()=>{for(const r of [{...row,tecnicoAsignado:''},{...row,idEstatus:7}]){const env=setup([r]);await assert.rejects(env.svc.guardarAvance(1,body,{login:'ana'}));assert.deepEqual(env.transactions,[]);}});

test('advances no longer require or write stages from the request',async()=>{const env=setup([row]);await env.svc.guardarAvance(1,{...body,numeroEtapa:5,fechaInicioEtapa:'2026-09-30',fechaFinEtapa:''},{login:'ana'});assert.deepEqual(env.transactions,['begin','commit']);assert(!env.calls.some(c=>/UPDATE dbo.desarrollo_etapas|INSERT dbo.desarrollo_etapas/.test(c.sql)));const insert=env.calls.find(c=>c.sql.includes('OUTPUT INSERTED'));assert.equal(insert.params.etapa,null)});
test('simple changes cannot be published through Gestion',async()=>{const env=setup([{...row,alcanceDesarrollo:'CAMBIO_SENCILLO'}]);await assert.rejects(env.svc.guardarAvance(1,body,{login:'ana'}),/cambios sencillos/);assert.deepEqual(env.transactions,[])});

test('finalizados lists only completed projects, not rejected or minor adjustments',async()=>{const env=setup([{...row,idEstatus:7},{...row,idSolicitud:2,idEstatus:6},{...row,idSolicitud:3,idEstatus:7,alcanceDesarrollo:'CAMBIO_SENCILLO'}]);const rows=await env.svc.getFinalizados();assert.deepEqual(rows.map(r=>r.idSolicitud),[1]);assert.equal(env.pages[0].estatus,'7')});

test('optional activity and observations persist on published advances and drafts',async()=>{for(const estado of ['PUBLICADO','BORRADOR']){const e=setup([row]);await e.svc.guardarAvance(1,{...body,estado,tipoActividad:4,observaciones:'Acuerdos de reunión'},{login:'ana'});const insert=e.calls.find(c=>c.sql.includes('OUTPUT INSERTED'));assert.equal(insert.params.tipoActividad,4);assert.equal(insert.params.observaciones,'Acuerdos de reunión');}});
