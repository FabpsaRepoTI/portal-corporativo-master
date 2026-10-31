import './Finalizados.css';
import {EvidenceGallery} from './TraceDocuments';
import ReportPreview from './ReportPreview';
import {useEffect,useRef,useState} from 'react';
import {getFinalizados,getTrazabilidad,generarReporteDesarrollo} from '../../../services/gestionDesarrollo';
import {projectTitle} from '../projectTitle';
const date=v=>v?new Date(v).toLocaleString('es-MX',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Sin fecha registrada';
const day=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}):'Sin fecha registrada';
const stageName={1:'Análisis',2:'Desarrollo',3:'Revisión',4:'Pruebas',5:'Liberación'};
function HistoryStage({value}) {
  let content;
  try {content=JSON.parse(value);} catch {return <p>Detalle histórico no disponible.</p>;}
  const before=Array.isArray(content)?content:content.antes || [];
  const after=Array.isArray(content)?[]:content.despues || [];
  return <div className="cg-audit-stages">{[['Antes',before],['Después',after]].map(([label,rows])=><div key={label}><b>{label}</b>{rows.length?rows.map((r,i)=><p key={i}>{stageName[r.numeroEtapa] || 'Etapa'} · {day(r.fechaInicio)} → {day(r.fechaCompromiso)}{r.fechaCierre && ` · Cierre: ${day(r.fechaCierre)}`}{r.entregable && ` · Entregable: ${r.entregable}`}</p>):<p>Sin etapas registradas.</p>}</div>)}</div>;
}
export default function Finalizados() {
  const [rows,setRows]=useState([]),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [detail,setDetail]=useState(null),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[traceError,setTraceError]=useState('');
  const [eventSearch,setEventSearch]=useState(''),[eventType,setEventType]=useState(''),[month,setMonth]=useState(''),[expanded,setExpanded]=useState(false);
  const [report,setReport]=useState(null),[reportBusy,setReportBusy]=useState(false),[reportError,setReportError]=useState('');
  const [reportOpen,setReportOpen]=useState(false);
  const generating=useRef(false);
  async function generate(){if(generating.current)return;setReportOpen(true);if(report)return;generating.current=true;const current=request.current;setReportBusy(true);setReportError('');try{const r=await generarReporteDesarrollo(selected);if(current===request.current)setReport(r.data);}catch(e){if(current===request.current)setReportError(e.message);}finally{generating.current=false;setReportBusy(false);}}
  const request=useRef(0);
  useEffect(()=>{let active=true;getFinalizados().then(r=>{if(active)setRows(r.data || []);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;request.current++;};},[]);
  async function open(id) {const current=++request.current;setReport(null);setReportOpen(false);setReportError('');setSelected(id);setEventSearch('');setEventType('');setMonth('');setExpanded(false);setBusy(true);setDetail(null);setTraceError('');try{const r=await getTrazabilidad(id);if(current===request.current)setDetail(r.data);}catch(e){if(current===request.current)setTraceError(e.message);}finally{if(current===request.current)setBusy(false);}}
  const filtered=rows.filter(p=>[p.titulo,p.folioDesarrollo,p.nombreResponsable].some(v=>v?.toLowerCase().includes(search.toLowerCase())));
  const events=detail?[
    {kind:'Solicitud registrada',when:detail.fechaCreacion,who:detail.nombreUsuario,text:detail.descripcion},
    ...(detail.bitacora || []).map(r=>({kind:'Bitácora',when:r.fecha,who:r.nombreUsuario,text:r.nota})),
    ...(detail.avances || []).filter(r=>r.estado==='PUBLICADO').map(r=>({kind:'Avance publicado',when:r.fechaRegistro,who:r.nombreUsuario,text:`${r.avanceAnterior ?? '—'}% → ${r.avanceNuevo ?? '—'}%`,advance:r})),
    ...(detail.actividades || []).map(r=>({kind:'Actividad',when:r.fecha,who:r.nombreUsuario,text:r.actividad})),
    ...(detail.comentarios || []).map(r=>({kind:r.esInterno?'Comentario interno':'Comentario',when:r.fecha,who:r.nombreUsuario,text:r.comentario})),
    ...(detail.horas || []).map(r=>({kind:'Tiempo registrado',when:r.fechaRegistro,who:r.nombreUsuario,text:`${Number(r.minutosTrabajos || 0)/60} h · ${r.descripcion || 'Sin descripción'} · Trabajo: ${day(r.fechaTrabajo)}`})),
    ...(detail.bloqueos || []).flatMap(r=>[{kind:'Bloqueo',when:r.fechaBloqueo,who:r.nombreRegistro,text:r.motivo},...(r.fechaResolucion?[{kind:'Bloqueo resuelto',when:r.fechaResolucion,who:r.resueltoPor,text:r.motivo}]:[])]),
    ...(detail.historialEtapas || []).map(r=>({kind:({AVANCE:'Etapa actualizada',PLANIFICACION:'Planificación actualizada',LIMPIAR:'Planificación eliminada'})[r.accion] || r.accion,when:r.fechaRegistro,who:r.loginUsuario,stage:r.datos})),
    {kind:'Desarrollo concluido',when:detail['fechaConclusión'] || detail.fechaResolucion,who:detail.loginConcluyo,text:'Cierre registrado en Mesa de Servicio'},
  ].sort((a,b)=>(new Date(a.when || 0))-(new Date(b.when || 0))):[];

  const monthOf=e=>e.when?String(e.when).slice(0,7):'sin-fecha';
  const monthLabel=m=>m==='sin-fecha'?'Sin fecha registrada':new Date(m+'-15T12:00:00').toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  const visibleEvents=events.map((e,index)=>({...e,index})).filter(e=>(!eventType||e.kind===eventType)&&(!month||monthOf(e)===month)&&(!eventSearch||[e.kind,e.who,e.text,e.advance?.terminado,e.advance?.trabajando,e.advance?.siguiente,e.advance?.observaciones,e.stage].filter(Boolean).join(' ').toLocaleLowerCase('es-MX').includes(eventSearch.toLocaleLowerCase('es-MX'))));
  const months=[...new Set(visibleEvents.map(monthOf))];
  const tone=kind=>/concluido|resuelto/i.test(kind)?'success':/bloqueo/i.test(kind)?'warning':/avance|etapa|planificación/i.test(kind)?'progress':'neutral';
  return <section className="cg-completed"><div className="cg-completed-heading"><div><h2>Finalizados</h2><p>Resultados y trazabilidad, a tu ritmo.</p></div><input aria-label="Buscar finalizados" placeholder="Proyecto, folio o responsable" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Cargando finalizados…</p>}
    <div className="cg-completed-layout"><div className="cg-completed-list">{filtered.map(p=><button key={p.idSolicitud} aria-pressed={p.idSolicitud===selected} onClick={()=>open(p.idSolicitud)}><small>{p.folioDesarrollo}</small><strong>{projectTitle(p.titulo)}</strong><span>{p.nombreResponsable||'Sin responsable registrado'}</span><small>{date(p.fechaActualizacion)}</small><em>✓ Concluido <span aria-hidden="true">↗</span></em></button>)}{!loading&&!error&&!filtered.length&&<p>No hay desarrollos finalizados para esta búsqueda.</p>}</div>
    <div className="cg-trace" aria-live="polite">{busy?<p>Cargando trazabilidad…</p>:traceError?<p role="alert">{traceError}</p>:detail?<>
      <header><span className="cf-badge cf-success">Concluido</span><small> {detail.folioDesarrollo} · Solo lectura</small><h3>{projectTitle(detail.titulo)}</h3><p>{detail.nombreTecnico||'Sin responsable registrado'} · {date(detail['fechaConclusión']||detail.fechaResolucion)}</p></header>
      <div className="cf-metrics"><div><strong>{events.length}</strong><span>Eventos registrados</span></div><div><strong>{(detail.avances||[]).filter(a=>a.estado==='PUBLICADO').length}</strong><span>Avances publicados</span></div><div><strong>{detail.etapas?.length||0}</strong><span>Etapas registradas</span></div><div><strong>{detail.adjuntos?.length||0}</strong><span>Evidencias</span></div></div>
      <div className="cf-reference">
      <details><summary>Información general</summary><p>{detail.descripcion||'Sin descripción'}</p>{detail.objetivo&&detail.objetivo.trim()!==detail.descripcion?.trim()&&<p><b>Objetivo:</b> {detail.objetivo}</p>}{detail.justificacion&&![detail.descripcion?.trim(),detail.objetivo?.trim()].includes(detail.justificacion.trim())&&<p><b>Justificación:</b> {detail.justificacion}</p>}{detail.beneficioEsperado&&<p><b>Beneficio esperado:</b> {detail.beneficioEsperado}</p>}<p>Avance registrado: {detail.porcentajeAvance??'—'}% · Compromiso: {day(detail.fechaCompromiso)}</p></details>
      <details><summary>Etapas · {detail.etapas?.length||0}</summary>{detail.etapas?.length?detail.etapas.map(e=><article key={e.numeroEtapa}><b>{stageName[e.numeroEtapa]}</b><p>{day(e.fechaInicio)} → {day(e.fechaCompromiso)} · Cierre: {day(e.fechaCierre)}</p>{e.entregable&&<p>Entregable: {e.entregable}</p>}</article>):<p>Sin etapas registradas.</p>}</details>
      <details><summary>Subtareas · {detail.subtareas?.length||0}</summary>{detail.subtareas?.length?detail.subtareas.map(s=><article key={s.idSubtarea}><b>{s.titulo}</b><p>{s.estatusNombre} · {s.nombreResponsable||'Sin responsable'} · {day(s.fechaCompromiso)}</p><p>{s.descripcion}</p></article>):<p>Sin subtareas registradas.</p>}</details>
      <details><summary>Evidencias · {detail.adjuntos?.length||0}</summary>{detail.adjuntos?.length?<EvidenceGallery files={detail.adjuntos}/>:<p>Sin evidencias adjuntas.</p>}</details>
      <details><summary>Evaluación e impactos</summary>{detail.evaluacion?<dl>{[['Satisfacción','satisfaccion'],['Cumplimiento','cumplimiento'],['Tiempo de entrega','tiempoEntrega'],['Calidad','calidad'],['Comentarios','comentarios']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>{detail.evaluacion[key]??'Sin registrar'}</dd></div>)}</dl>:<p>Sin evaluación registrada.</p>}{detail.impactos?.map((r,i)=><p key={i}>{r.area} · {r.motivo}</p>)}</details>
      </div>
      <div className="cf-history-heading"><div><h4>Traza completa ({events.length})</h4><small>{visibleEvents.length} eventos visibles</small></div><div className="cf-mode" role="group" aria-label="Presentación del historial"><button aria-pressed={!expanded} onClick={()=>setExpanded(false)}>Resumen</button><button aria-pressed={expanded} onClick={()=>setExpanded(true)}>Detalle</button><button className="cf-generate" disabled={reportBusy} onClick={generate}>{reportBusy?"Generando…":report?"Ver reporte":"Generar Reporte"}</button></div></div>
      {reportError&&<p role="alert">{reportError}</p>}{reportOpen&&<ReportPreview report={report} busy={reportBusy} error={reportError} onRetry={generate} onClose={()=>setReportOpen(false)}/>}<div className="cf-filters"><input aria-label="Buscar en el historial" placeholder="Buscar en el historial" value={eventSearch} onChange={e=>setEventSearch(e.target.value)}/><select aria-label="Tipo de evento" value={eventType} onChange={e=>setEventType(e.target.value)}><option value="">Todos los eventos</option>{[...new Set(events.map(e=>e.kind))].map(k=><option key={k}>{k}</option>)}</select><select aria-label="Mes del historial" value={month} onChange={e=>setMonth(e.target.value)}><option value="">Todos los meses</option>{[...new Set(events.map(monthOf))].map(m=><option value={m} key={m}>{monthLabel(m)}</option>)}</select></div>
      {!visibleEvents.length&&<p>No hay eventos para estos filtros.</p>}
      {months.map(m=><section className="cf-month" key={m}><h5>{monthLabel(m)}</h5><ol className="cg-trace-events">{visibleEvents.filter(e=>monthOf(e)===m).map(e=><li key={e.index} className={'cf-event cf-'+tone(e.kind)}><details open={expanded} key={String(expanded)+e.index}><summary><span className={'cf-badge cf-'+tone(e.kind)}>{e.kind}</span><time>{date(e.when)}</time><span className="cf-event-who">{e.who||'Responsable no registrado'}</span><span className="cf-preview">{e.advance?.trabajando||e.text||(e.stage?'Cambio de planificación registrado':'Consultar detalle')}</span></summary><div className="cf-event-body">{e.text&&<p>{e.text}</p>}{e.advance&&<dl>{[['Tipo de actividad',['Desarrollo','Análisis','Pruebas','Reunión','Documentación','Soporte','Liberación'][Number(e.advance.tipoActividad)-1]],['Observaciones',e.advance.observaciones],['Resultado terminado',e.advance.terminado],['En qué trabajó',e.advance.trabajando],['Siguiente paso',e.advance.siguiente],['Horas invertidas',e.advance.minutosInvertidos==null?null:Number(e.advance.minutosInvertidos)/60],['Etapa',stageName[e.advance.numeroEtapa]],['Bloqueo',e.advance.bloqueo],['Apoyo requerido',e.advance.apoyoRequerido],['Próximo compromiso',e.advance.proximoCompromiso&&day(e.advance.proximoCompromiso)]].filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}{e.stage&&<HistoryStage value={e.stage}/>}</div></details></li>)}</ol></section>)}
    </>:<div className="cf-empty"><h3>Explora los resultados</h3><p>Selecciona un desarrollo para recorrer sus hitos, avances y evidencias.</p></div>}</div></div>
  </section>;
}
