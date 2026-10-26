require('dotenv').config({quiet:true});
(async()=>{
  const pool=await require('../db').getPool();
  const r=await pool.request().query("SELECT OBJECT_ID('dbo.solicitudTI_desarrollo_avances','U') AS a,OBJECT_ID('dbo.desarrollo_etapas','U') AS b,OBJECT_ID('dbo.desarrollo_etapas_historial','U') AS c,OBJECT_ID('dbo.desarrollo_cronograma_reset','U') AS d,COL_LENGTH('dbo.solicitudTI_desarrollo_avances','numeroEtapa') AS e");
  if(Object.values(r.recordset[0]).some(v=>v==null)) throw new Error('Falta estructura; no se ejecuta la consulta de trazabilidad');
  const data=await require('../services/gestionDesarrollo.service').getTrazabilidad(20,'');
  require('fs').writeFileSync('../client/.flujo-desarrollo-review/traza.json',JSON.stringify(data));
  console.log(JSON.stringify({id:data.idSolicitud,avances:data.avances.length,bitacora:data.bitacora.length,horas:data.horas.length,etapas:data.etapas.length,evidencias:data.adjuntos.length}));
})().then(()=>process.exit()).catch(e=>{console.error(e.message);process.exit(1)});
