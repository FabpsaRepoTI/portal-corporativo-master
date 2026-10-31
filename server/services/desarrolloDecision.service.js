"use strict";
const sql = require('mssql');
const { getPool } = require('../db');
const { crearNotificacion, TIPOS } = require('./notificaciones.service');
const { transition } = require('./desarrolloDecision.model');
const labels = { rechazar: 'Desarrollo rechazado', conforme: 'Usuario conforme con la decisión', inconforme: 'Requiere atención — Usuario no conforme con el rechazo', ratificar: 'Cancelación ratificada por TI', reactivar: 'Desarrollo reactivado por TI' };
function urlSolicitud(id, usuario) { return usuario ? `/mesa-de-servicio/mis-desarrollos?solicitud=${id}` : `/mesa-de-servicio/admin?tab=desarrollo&solicitud=${id}`; }
async function registrar(id, body, user) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  let result, row;
  try {
    const found = await new sql.Request(tx).input('id', sql.Int, id).query(`SELECT s.idSolicitud,s.idUsuario,s.tecnicoAsignado,s.idEstatus,s.camposExtra,COALESCE(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'),s.folio) AS folio,GETDATE() AS fechaDecision
      FROM solicitudTI s WITH (UPDLOCK,HOLDLOCK) WHERE s.idSolicitud=@id AND s.idServicio=2`);
    row = found.recordset[0];
    if (!row) throw Object.assign(new Error('Desarrollo no encontrado.'), {status:404});
    result = transition(row, body, user, row.fechaDecision);
    const { revision, evento, idEstatus } = result;
    const detalle = [labels[evento.accion], evento.motivo, evento.explicacion, evento.observaciones && `Observaciones / alternativa: ${evento.observaciones}`].filter(Boolean).join('\n\n');
    await new sql.Request(tx).input('id', sql.Int, id).input('estado', sql.Int, idEstatus)
      .input('revision', sql.NVarChar(sql.MAX), JSON.stringify(revision))
      .input('login', sql.VarChar(255), user.login).input('nombre', sql.NVarChar(200), evento.nombre)
      .input('fecha', sql.DateTime, row.fechaDecision).input('nota', sql.NVarChar(sql.MAX), detalle)
      .input('texto', sql.NVarChar(sql.MAX), detalle).input('motivo', sql.NVarChar(sql.MAX), evento.motivo || null)
      .query(`UPDATE solicitudTI SET idEstatus=@estado,fechaActualizacion=@fecha,
        camposExtra=JSON_MODIFY(COALESCE(NULLIF(camposExtra,''),'{}'),'$.revisionDecision',JSON_QUERY(@revision)) WHERE idSolicitud=@id;
        IF @motivo IS NOT NULL UPDATE solicitudTI_desarrollo_detalle SET motivoRechazo=@motivo WHERE idSolicitud=@id;
        INSERT INTO solicitudTI_bitacora(idSolicitud,idUsuario,nombreUsuario,nota,fecha) VALUES(@id,@login,@nombre,@nota,@fecha);
        INSERT INTO solicitudTI_comentarios(idSolicitud,idUsuario,nombreUsuario,comentario,esInterno,fecha) VALUES(@id,@login,@nombre,@texto,0,@fecha);`);
    if(body.accion==='rechazar'&&body.idPrioridad!=null)await require('./desarrolloPrioridad.service').actualizar({request:()=>new sql.Request(tx)},id,body.idPrioridad,user);
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  const destino = ['conforme','inconforme'].includes(body.accion) ? (row.tecnicoAsignado || result.revision.decision?.login) : row.idUsuario;
  if (destino && destino !== user.login) await crearNotificacion({loginDestino:destino, loginOrigen:user.login,
    idTipo:body.accion === 'inconforme' ? TIPOS.COMENTARIO_NUEVO : TIPOS.ESTATUS_CAMBIO, idSolicitud:id,
    titulo:labels[body.accion], descripcion:`${row.folio}: ${labels[body.accion]}`.slice(0,300),
    urlDestino:urlSolicitud(id,!['conforme','inconforme'].includes(body.accion))});
  return {ok:true, idEstatus:result.idEstatus, revisionDecision:result.revision};
}
module.exports = { registrar, urlSolicitud };
