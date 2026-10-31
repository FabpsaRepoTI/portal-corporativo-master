import React, { useState } from 'react';
import './DesarrolloDecision.css';
export const ALERTA_DECISION = 'Requiere atención — Usuario no conforme con el rechazo';
const labels = {rechazar:'Decisión de TI',conforme:'Usuario conforme',inconforme:'Solicitud de revisión',ratificar:'Decisión ratificada',reactivar:'Desarrollo reactivado'};
export function decisionDe(data) {
  if (data.revisionDecision) return data.revisionDecision;
  try { return JSON.parse(data.camposExtra || '{}').revisionDecision || null; } catch { return null; }
}
const fecha = value => value ? new Date(value).toLocaleString('es-MX') : 'No registrada';
export function DecisionAviso({data}) {
  const revision = decisionDe(data);
  const anterior = (data.bitacora || []).filter(b => /Estatus cambiado.*a "(?:Rechazado|Cancelado)"/i.test(b.nota || '')).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))[0];
  const decision = revision?.decision || (anterior && {nombre:anterior.nombreUsuario || anterior.idUsuario,fecha:anterior.fecha});
  return <section className="dev-decision-notice" aria-label="Decisión de TI">
    <h3>Desarrollo rechazado / cancelado</h3>
    <p><strong>{decision?.motivo || data.motivoRechazo || 'El registro anterior no incluye un motivo. Solicita la explicación a TI en Comentarios.'}</strong></p>
    {decision?.explicacion && <p>{decision.explicacion}</p>}
    {decision?.observaciones && <p><strong>Observaciones / alternativa: </strong>{decision.observaciones}</p>}
    <p className="dev-decision-meta">Decisión de {decision?.nombre || 'responsable no registrado'} · {fecha(decision?.fecha)}</p>
    {revision?.estado === 'pendiente_ti' && <p className="dev-decision-alert" role="status">{ALERTA_DECISION}</p>}
  </section>;
}
export default function DesarrolloDecision({data, ingeniero = false, onRefresh}) {
  const [accion,setAccion] = useState(''), [texto,setTexto] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false);
  const revision = decisionDe(data), rechazado = Number(data.idEstatus) === 6;
  const respondible = rechazado && (!revision?.estado || revision.estado === 'pendiente_usuario');
  async function enviar(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const r = await fetch(`/api/solicitudes-desarrollo/${data.idSolicitud}/revision-decision`,{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('fabpsa_token')}`,'Content-Type':'application/json'},body:JSON.stringify({accion,explicacion:texto})});
      const j = await r.json(); if(!r.ok || !j.ok) throw new Error(j.message || 'No se pudo guardar la respuesta.');
      setAccion('');setTexto('');onRefresh?.();
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  return <section className="dev-decision">
    <h3>Revisión de la decisión</h3>
    <p>La revisión conserva el rechazo. Solo TI puede reactivar el desarrollo con una justificación.</p>
    {revision?.estado === 'pendiente_ti' && <p className="dev-decision-alert" role="status">{ALERTA_DECISION}</p>}
    {revision?.estado === 'conforme' && <p role="status">{ingeniero ? 'El solicitante está de acuerdo con la decisión. Los comentarios siguen disponibles.' : 'Registraste tu conformidad con la decisión. Los comentarios siguen disponibles.'}</p>}
    {revision?.respuestaUsuario?.accion === 'inconforme' && <div className="dev-decision-result"><strong>Inconformidad del solicitante</strong><p>{revision.respuestaUsuario.explicacion}</p><small>{revision.respuestaUsuario.nombre} · {fecha(revision.respuestaUsuario.fecha)}</small></div>}
    {revision?.resolucion && <div className="dev-decision-result"><strong>{labels[revision.resolucion.accion]}</strong><p>{revision.resolucion.explicacion}</p><small>{revision.resolucion.nombre} · {fecha(revision.resolucion.fecha)}</small></div>}
    <div className="dev-decision-actions">
      {!ingeniero && respondible && <><button type="button" disabled={busy} onClick={()=>setAccion('conforme')}>Estoy de acuerdo</button><button type="button" disabled={busy} onClick={()=>setAccion('inconforme')}>No estoy de acuerdo</button></>}
      {ingeniero && rechazado && <>{revision?.estado === 'pendiente_ti' && <button type="button" disabled={busy} onClick={()=>setAccion('ratificar')}>Ratificar la decisión</button>}<button type="button" disabled={busy} onClick={()=>setAccion('reactivar')}>Reactivar desarrollo</button></>}
    </div>
    {accion && <form onSubmit={enviar}>
      {accion === 'conforme' ? <p>Se registrará que estás de acuerdo con la decisión.</p> : <label>Explicación obligatoria<textarea aria-label="Explicación de la revisión" required maxLength={10000} value={texto} onChange={e=>setTexto(e.target.value)} /></label>}
      {accion === 'inconforme' && <p>Puedes adjuntar evidencia en Archivos; quedará vinculada a este desarrollo.</p>}
      {accion === 'reactivar' && <p>Se recuperará el estatus anterior al rechazo; si no está registrado, volverá a Pendiente.</p>}
      <button type="submit" disabled={busy || (accion !== 'conforme' && !texto.trim())}>{busy?'Guardando…':'Confirmar respuesta'}</button>
      <button type="button" disabled={busy} onClick={()=>{setAccion('');setError('');}}>Volver</button>
    </form>}
    {error && <p role="alert">{error}</p>}
    {!!revision?.eventos?.length && <details className="dev-decision-history"><summary>Historial de decisiones y revisiones</summary><ol>{revision.eventos.map((e,i)=><li key={i}><strong>{labels[e.accion]}</strong><small>{e.nombre} · {fecha(e.fecha)}</small>{e.motivo && <p>{e.motivo}</p>}{e.explicacion && <p>{e.explicacion}</p>}{e.observaciones && <p>{e.observaciones}</p>}</li>)}</ol></details>}
  </section>;
}
