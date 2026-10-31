"use strict";
const {getPool, sql} = require('../db');
const NOMBRES = {1:'Análisis',2:'Desarrollo',3:'Revisión',4:'Pruebas',5:'Liberación'};
function fecha(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const d = new Date(value+'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0,10) === value;
}
function validar(value) {
 const numeroEtapa=Number(value.numeroEtapa), inicio=value.fechaInicioEtapa || value.fechaInicio, fin=value.fechaFinEtapa || value.fechaCompromiso;
 if (!NOMBRES[numeroEtapa] || !fecha(inicio) || !fecha(fin)) throw new Error('Selecciona la etapa y sus fechas de inicio y término.');
 if (fin < inicio) throw new Error('El término de la etapa no puede ser anterior al inicio.');
 const result={numeroEtapa,fechaInicio:inicio,fechaCompromiso:fin};
 if(value.entregable !== undefined) {
   if(typeof value.entregable !== 'string' || value.entregable.length>2000) throw new Error('El entregable esperado no debe superar 2000 caracteres.');
   result.entregable=value.entregable.trim();
 }
 return result;
}
let schema;
async function ensureSchema(pool) {
 if (!schema) schema=pool.request().query(`
 IF OBJECT_ID('dbo.desarrollo_etapas','U') IS NULL BEGIN
 CREATE TABLE dbo.desarrollo_etapas (
 origen VARCHAR(4) NOT NULL,idEntidad INT NOT NULL,numeroEtapa TINYINT NOT NULL,
 fechaInicio DATE NOT NULL,fechaCompromiso DATE NOT NULL,fechaCierre DATE NULL,
 activa BIT NOT NULL DEFAULT 0,
 PRIMARY KEY(origen,idEntidad,numeroEtapa),
 CHECK(origen IN ('mesa','dev')),CHECK(numeroEtapa BETWEEN 1 AND 5),CHECK(fechaCompromiso>=fechaInicio)); END;
 IF OBJECT_ID('dbo.desarrollo_cronograma_reset','U') IS NULL CREATE TABLE dbo.desarrollo_cronograma_reset(origen VARCHAR(4) NOT NULL,idEntidad INT NOT NULL,PRIMARY KEY(origen,idEntidad));
 IF OBJECT_ID('dbo.desarrollo_etapas_historial','U') IS NULL BEGIN
 CREATE TABLE dbo.desarrollo_etapas_historial (
 idCambio INT IDENTITY PRIMARY KEY,origen VARCHAR(4) NOT NULL,idEntidad INT NOT NULL,
 loginUsuario VARCHAR(255) NOT NULL,accion VARCHAR(20) NOT NULL,datos NVARCHAR(MAX) NOT NULL,
 fechaRegistro DATETIME2 NOT NULL DEFAULT SYSDATETIME()); END;
 `).catch(e=>{schema=null;throw e;});
 await schema;
}
async function scope(pool,origen,id) {
 if (!['mesa','dev'].includes(origen)||!Number.isInteger(id)||id<1) throw new Error('Desarrollo inválido.');
 if(origen==='dev') {
 const r=await pool.request().input('id',sql.Int,id).query('SELECT idSolicitudOrigen FROM dev_proyectos WHERE idProyecto=@id');
 if(!r.recordset.length) throw new Error('Proyecto no encontrado.');
 if(r.recordset[0].idSolicitudOrigen) return scope(pool,'mesa',r.recordset[0].idSolicitudOrigen);
 } else {
 const r=await pool.request().input('id',sql.Int,id).query('SELECT idSolicitud FROM solicitudTI_desarrollo_detalle WHERE idSolicitud=@id');
 if(!r.recordset.length) throw new Error('Desarrollo no encontrado en Mesa de Servicio.');
 }
 return {origen,id};
}
function request(tx,entity) {return new sql.Request(tx).input('origen',sql.VarChar(4),entity.origen).input('id',sql.Int,entity.id);}
async function list(origen,id) {
 const pool=await getPool();await ensureSchema(pool);const entity=await scope(pool,origen,id);
 const r=await request(pool,entity).query('SELECT * FROM dbo.desarrollo_etapas WHERE origen=@origen AND idEntidad=@id ORDER BY numeroEtapa');
 let entregables={};
 if(entity.origen==='mesa') {
   const extra=await request(pool,entity).query("SELECT JSON_QUERY(camposExtra,'$.entregablesEtapas') AS entregables FROM solicitudTI WHERE idSolicitud=@id");
   entregables=JSON.parse(extra.recordset[0]?.entregables || '{}');
 }
 return r.recordset.map(e=>({...e,nombreEtapa:NOMBRES[e.numeroEtapa],entregable:entregables[e.numeroEtapa] || ''}));
}
async function write(tx,entity,stages,user,activate=false) {
 const existing=await request(tx,entity).query('SELECT * FROM dbo.desarrollo_etapas WITH (UPDLOCK,HOLDLOCK) WHERE origen=@origen AND idEntidad=@id ORDER BY numeroEtapa');
 for(const stage of stages) {
 const previous=existing.recordset.find(e=>e.numeroEtapa===stage.numeroEtapa);
 if(entity.origen==='mesa' && stage.entregable !== undefined) {
   await request(tx,entity).input('ruta',sql.NVarChar(80),'$.entregablesEtapas."'+stage.numeroEtapa+'"').input('entregable',sql.NVarChar(2000),stage.entregable)
   .query(`UPDATE solicitudTI SET camposExtra=JSON_MODIFY(
     CASE WHEN JSON_QUERY(camposExtra,'$.entregablesEtapas') IS NULL THEN JSON_MODIFY(COALESCE(NULLIF(camposExtra,''),'{}'),'$.entregablesEtapas',JSON_QUERY('{}')) ELSE camposExtra END,
     @ruta,@entregable) WHERE idSolicitud=@id`);
 }
 if(activate && previous?.fechaCierre) throw new Error('La etapa ya está cerrada. Su historial se conserva y no se puede sobrescribir.');
 if(activate) {
 const current=existing.recordset.find(e=>e.activa && e.numeroEtapa!==stage.numeroEtapa);
 if(current && new Date(stage.fechaInicio+'T00:00:00Z') < new Date(current.fechaInicio)) throw new Error('La nueva etapa no puede iniciar antes que la etapa activa.');
 await request(tx,entity).input('etapa',sql.TinyInt,stage.numeroEtapa).input('inicio',sql.Date,stage.fechaInicio)
 .query('UPDATE dbo.desarrollo_etapas SET activa=0,fechaCierre=@inicio WHERE origen=@origen AND idEntidad=@id AND activa=1 AND numeroEtapa<>@etapa');
 }
 await request(tx,entity).input('etapa',sql.TinyInt,stage.numeroEtapa).input('inicio',sql.Date,stage.fechaInicio).input('fin',sql.Date,stage.fechaCompromiso).input('activar',sql.Bit,activate)
 .query(`UPDATE dbo.desarrollo_etapas SET fechaInicio=@inicio,fechaCompromiso=@fin,activa=CASE WHEN @activar=1 THEN 1 ELSE activa END WHERE origen=@origen AND idEntidad=@id AND numeroEtapa=@etapa;
 IF @@ROWCOUNT=0 INSERT dbo.desarrollo_etapas(origen,idEntidad,numeroEtapa,fechaInicio,fechaCompromiso,activa) VALUES(@origen,@id,@etapa,@inicio,@fin,@activar);`);
 }
 await request(tx,entity).input('login',sql.VarChar(255),user.login).input('accion',sql.VarChar(20),activate?'AVANCE':'PLANIFICACION').input('datos',sql.NVarChar(sql.MAX),JSON.stringify({antes:existing.recordset,despues:stages}))
 .query('INSERT dbo.desarrollo_etapas_historial(origen,idEntidad,loginUsuario,accion,datos) VALUES(@origen,@id,@login,@accion,@datos)');
}
async function save(origen,id,body,user) {
 if(!Array.isArray(body.etapas)||!body.etapas.length) throw new Error('Registra las fechas de al menos una etapa.');
 const stages=body.etapas.map(validar);if(new Set(stages.map(e=>e.numeroEtapa)).size!==stages.length)throw new Error('No repitas una etapa.');
 const pool=await getPool();await ensureSchema(pool);const entity=await scope(pool,origen,id);const tx=new sql.Transaction(pool);await tx.begin();
 try {await editable(tx,entity);await write(tx,entity,stages,user);await tx.commit();}catch(e){await tx.rollback();throw e;}
 return list(origen,id);
}
async function clear(origen,id,user) {
 const pool=await getPool();await ensureSchema(pool);const entity=await scope(pool,origen,id);const tx=new sql.Transaction(pool);await tx.begin();
 try {
 await editable(tx,entity);
 const before=await request(tx,entity).query('SELECT * FROM dbo.desarrollo_etapas WITH (UPDLOCK,HOLDLOCK) WHERE origen=@origen AND idEntidad=@id');
 await request(tx,entity).input('login',sql.VarChar(255),user.login).input('datos',sql.NVarChar(sql.MAX),JSON.stringify(before.recordset)).query("INSERT dbo.desarrollo_etapas_historial(origen,idEntidad,loginUsuario,accion,datos) VALUES(@origen,@id,@login,'LIMPIAR',@datos)");
 await request(tx,entity).query('DELETE FROM dbo.desarrollo_etapas WHERE origen=@origen AND idEntidad=@id; IF NOT EXISTS(SELECT 1 FROM dbo.desarrollo_cronograma_reset WITH (UPDLOCK,HOLDLOCK) WHERE origen=@origen AND idEntidad=@id) INSERT dbo.desarrollo_cronograma_reset(origen,idEntidad) VALUES(@origen,@id);');
 await tx.commit();return [];
 }catch(e){await tx.rollback();throw e;}
}
async function editable(tx,entity) {
 const q=entity.origen==='mesa'?'SELECT idEstatus FROM solicitudTI WITH (UPDLOCK,HOLDLOCK) WHERE idSolicitud=@id':'SELECT idEstatus FROM dev_proyectos WITH (UPDLOCK,HOLDLOCK) WHERE idProyecto=@id';
 const r=await request(tx,entity).query(q);
 if (Number(r.recordset[0]?.idEstatus)===6) throw new Error('El desarrollo fue cancelado o rechazado y no admite modificaciones.');
}
module.exports={clear,NOMBRES,validar,ensureSchema,scope,list,save,write};
