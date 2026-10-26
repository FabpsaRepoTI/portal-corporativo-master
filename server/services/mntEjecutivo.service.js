const {getPool}=require('../db');
const ESTADOS=['Sin atención','En proceso','Pendiente de material','Pendiente de visto bueno','Rechazada','Reabierta'];
function resumir(rows,personal=[],now=new Date()){
 const solicitudes=rows.map(r=>{const cerrado=Number(r.idEstatus)===3&&Number(r.evaluacionVB)===1;const activo=!cerrado&&Number(r.idEstatus)!==4;
 return {...r,activo,cerrado,estado:cerrado?'Cerrada':ESTADOS[Number(r.idEstatus)]||'Sin clasificar',tipo:Number(r.tipoMantenimiento)===1?'Preventivo':Number(r.tipoMantenimiento)===2?'Correctivo':'Sin clasificar',vencido:activo&&!!r.fechaCompromiso&&new Date(r.fechaCompromiso)<now};});
 const activos=solicitudes.filter(r=>r.activo),equipo=new Map();
 for(const p of personal){const r=activos.find(s=>s.idSolicitud===p.idSolicitud);if(!r)continue;const e=equipo.get(p.clave)||{clave:p.clave,nombre:p.nombre,ids:new Set(),detenidos:0};if(!e.ids.has(r.idSolicitud)){e.ids.add(r.idSolicitud);if(Number(r.idEstatus)===2)e.detenidos++;}equipo.set(p.clave,e);}
 return {fechaCorte:now.toISOString(),solicitudes,resumen:{total:solicitudes.length,activos:activos.length,preventivos:solicitudes.filter(r=>r.tipo==='Preventivo').length,preventivosActivos:activos.filter(r=>r.tipo==='Preventivo').length,detenidos:activos.filter(r=>Number(r.idEstatus)===2).length,sinAtencion:activos.filter(r=>Number(r.idEstatus)===0).length,pendientesVB:activos.filter(r=>Number(r.idEstatus)===3).length,cerrados:solicitudes.filter(r=>r.cerrado).length,vencidos:activos.filter(r=>r.vencido).length},equipo:[...equipo.values()].map(e=>({clave:e.clave,nombre:e.nombre,activos:e.ids.size,detenidos:e.detenidos})).sort((a,b)=>b.activos-a.activos)};
}
async function getResumen(){
 const pool=await getPool();
 const result=await pool.request().query(`
 SELECT s.idSolicitud,s.folio,s.descripcion,s.sitio,s.idEstatus,s.tipoMantenimiento,s.evaluacionVB,s.fechaCreacion,s.fechaCompromiso,s.loginTecnico,u.name AS responsable
 FROM mnt_solicitudes s LEFT JOIN sec_users u ON u.login=s.loginTecnico;
 SELECT s.idSolicitud,CONCAT('login:',s.loginTecnico) AS clave,COALESCE(u.name,s.loginTecnico) AS nombre FROM mnt_solicitudes s LEFT JOIN sec_users u ON u.login=s.loginTecnico WHERE NULLIF(s.loginTecnico,'') IS NOT NULL;
 SELECT p.idSolicitud,CONCAT('personal:',p.tipoParticipacion,':',p.idPersonal) AS clave,COALESCE(pm.nombre,pe.nombre) AS nombre
 FROM mnt_participantes p
 LEFT JOIN mnt_personal_mantenimiento pm ON p.tipoParticipacion=1 AND pm.idPersonal=p.idPersonal
 LEFT JOIN mnt_personal_externo pe ON p.tipoParticipacion=2 AND pe.idPersonal=p.idPersonal;
 `);
 return {...resumir(result.recordsets[0],result.recordsets[1]),participantes:resumir(result.recordsets[0],result.recordsets[2]).equipo};
}
module.exports={getResumen,resumir};
