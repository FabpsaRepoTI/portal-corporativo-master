"use strict";
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function parseDecision(camposExtra) {
  const extra = typeof camposExtra === 'string' ? JSON.parse(camposExtra || '{}') : camposExtra || {};
  return extra.revisionDecision || null;
}
function transition(row, body, user, fecha) {
  const accion = body.accion;
  const anterior = parseDecision(row.camposExtra);
  const ti = user.area === 'SISTEMAS';
  const own = String(user.login).toLowerCase() === String(row.idUsuario).toLowerCase();
  const texto = (value, required = false) => {
    const v = typeof value === 'string' ? value.trim() : '';
    if (required && !v) fail('La explicación es obligatoria.');
    if (v.length > 10000) fail('El texto no debe superar 10000 caracteres.');
    return v;
  };
  if (!['rechazar', 'conforme', 'inconforme', 'ratificar', 'reactivar'].includes(accion)) fail('Acción inválida.');
  if (['rechazar', 'ratificar', 'reactivar'].includes(accion) ? !ti : !own) fail('Sin permiso para esta acción.', 403);
  if (accion === 'rechazar' ? [6,7].includes(Number(row.idEstatus)) : Number(row.idEstatus) !== 6) fail('La solicitud ya cambió de estado. Actualiza la vista.', 409);
  const evento = { accion, login: user.login, nombre: user.name || user.login, fecha };
  const revision = anterior ? JSON.parse(JSON.stringify(anterior)) : { eventos: [] };
  revision.eventos ||= [];
  let idEstatus = Number(row.idEstatus);
  if (accion === 'rechazar') {
    evento.motivo = texto(body.motivoRechazo, true);
    evento.explicacion = texto(body.explicacionDecision, true);
    evento.observaciones = texto(body.observacionesDecision);
    revision.decision = evento;
    revision.estatusAnterior = idEstatus;
    revision.estado = 'pendiente_usuario';
    delete revision.respuestaUsuario;
    delete revision.resolucion;
    idEstatus = 6;
  } else if (accion === 'conforme' || accion === 'inconforme') {
    if (revision.estado && revision.estado !== 'pendiente_usuario') fail('La decisión ya tiene una respuesta registrada.', 409);
    evento.explicacion = texto(body.explicacion, accion === 'inconforme');
    revision.respuestaUsuario = evento;
    revision.estado = accion === 'conforme' ? 'conforme' : 'pendiente_ti';
  } else {
    evento.explicacion = texto(body.explicacion, true);
    if (accion === 'ratificar' && revision.estado !== 'pendiente_ti') fail('No existe una inconformidad pendiente.', 409);
    if (accion === 'reactivar') {
      idEstatus = [1,2,3,4,5].includes(Number(revision.estatusAnterior)) ? Number(revision.estatusAnterior) : 1;
      if (idEstatus !== 1 && !row.tecnicoAsignado) fail('La solicitud requiere un responsable para recuperar su estatus anterior.');
    }
    revision.resolucion = evento;
    revision.estado = accion === 'reactivar' ? 'reactivada' : 'ratificada';
  }
  revision.eventos.push(evento);
  return { revision, evento, idEstatus };
}
module.exports = { transition, parseDecision };
