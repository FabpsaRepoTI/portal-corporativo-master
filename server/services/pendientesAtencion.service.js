const {getPool}=require("../db");
async function getPendientesAtencion(){
 const pool=await getPool();
 const result=await pool.request().query(`
 SELECT
 (SELECT COUNT(*) FROM solicitudTI WHERE (idServicio <> 2 OR idServicio IS NULL)
  AND idEstatus IN (1,2,6,7,8)
  AND NULLIF(LTRIM(RTRIM(tecnicoAsignado)),'') IS NULL) AS incidencias,
 (SELECT COUNT(*) FROM solicitudHardware WHERE estatus='Pendiente') AS hardware,
 (SELECT COUNT(*) FROM solicitudTI WHERE idServicio=2 AND idEstatus=1
  AND NULLIF(LTRIM(RTRIM(tecnicoAsignado)),'') IS NULL) AS desarrollo,
 (SELECT COUNT(*) FROM solicitudTI WHERE (idServicio <> 2 OR idServicio IS NULL) AND idEstatus=6) AS pausados,
 (SELECT COUNT(*) FROM solicitudTI WHERE (idServicio <> 2 OR idServicio IS NULL) AND idEstatus=6
  AND ISNULL(fechaUltimaPausa,fechaActualizacion)<DATEADD(HOUR,-24,GETDATE())) AS pausados24h;
 `);
 const row=result.recordset[0]||{};
 const counts={incidencias:Number(row.incidencias||0),hardware:Number(row.hardware||0),desarrollo:Number(row.desarrollo||0)};
 // Pausados se reportan aparte: no suman al total de pendientes por asignar.
 return {...counts,total:counts.incidencias+counts.hardware+counts.desarrollo,pausados:Number(row.pausados||0),pausados24h:Number(row.pausados24h||0)};
}
module.exports={getPendientesAtencion};
