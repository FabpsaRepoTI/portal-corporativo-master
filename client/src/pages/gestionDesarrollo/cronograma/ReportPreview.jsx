import {useEffect,useState} from 'react';
import {TraceDialog} from './TraceDocuments';
import logo from '../../../logo-fabpsa.png';
import './ReportPreview.css';

export const reportSections=[['resultados','Resultados documentados','01'],['hitos','Hitos del desarrollo','02'],['incidencias','Incidencias y resolución','03'],['pendientes','Puntos de atención','04']];
export const reportDate=v=>v&&!Number.isNaN(new Date(v).getTime())?new Date(v).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}):'No documentado';

export default function ReportPreview({report,busy,error,onRetry,onClose}) {
 const [elapsed,setElapsed]=useState(0),[downloading,setDownloading]=useState(false),[downloadError,setDownloadError]=useState('');
 useEffect(()=>{if(!busy)return;setElapsed(0);const started=Date.now(),timer=setInterval(()=>setElapsed(Math.floor((Date.now()-started)/1000)),1000);return()=>clearInterval(timer);},[busy]);
 async function download(){setDownloading(true);setDownloadError('');try{const {downloadReport}=await import('./reportPdf');await downloadReport(report);}catch{setDownloadError('No se pudo descargar el PDF. Intenta nuevamente.');}finally{setDownloading(false);}}
 const ficha=report?.ficha||{},metrics=report?.indicadores||{};
 return <TraceDialog title="Informe del desarrollo" onClose={onClose}><div className={"dr-report"+(!report?" dr-report-pending":"")} aria-busy={busy}>
   <div className="dr-masthead"><img src={logo} alt="FABPSA"/><div><span>GESTIÓN DE DESARROLLO</span><strong>Informe para dirección</strong><small>{report?.folio||'Preparando el informe del proyecto seleccionado'}</small></div><span className="dr-internal">USO INTERNO</span></div>
   {busy?<><div className="dr-loading-line" role="progressbar" aria-label="Generando informe"/><div className="dr-loading" role="status"><span className="dr-loading-symbol" aria-hidden="true">✦</span><h3>Preparando la síntesis del desarrollo</h3><p>Analizando la trazabilidad para resumir resultados, hitos y puntos de atención.</p><small>{elapsed} s transcurridos · {elapsed>=45?'La respuesta está tardando más de lo habitual. Seguimos esperando a Claude.':'La generación puede tardar unos momentos.'}</small><div className="dr-loading-caption"><span aria-hidden="true"/>Generación en curso</div></div></>:error?<div className="dr-loading" role="alert"><h3>No se pudo completar el informe</h3><p>{error}</p><button onClick={onRetry}>Intentar nuevamente</button></div>:report&&<>
   <div className="dr-toolbar"><span>Generado el {reportDate(report.fechaGeneracion)} · Síntesis asistida por IA</span><button className="dr-download" disabled={downloading} onClick={download}>{downloading?'Preparando PDF…':'Descargar PDF'}</button></div>
   {downloadError&&<p role="alert">{downloadError}</p>}
   <div className="dr-content"><div className="dr-project"><span className="dr-state">{ficha.estado}</span><h2>{ficha.titulo||'Desarrollo sin título registrado'}</h2><dl><div><dt>Responsable</dt><dd>{ficha.responsable}</dd></div><div><dt>Solicitante</dt><dd>{ficha.solicitante}</dd></div><div><dt>Registro</dt><dd>{reportDate(ficha.fechaInicio)}</dd></div><div><dt>Conclusión</dt><dd>{reportDate(ficha.fechaConclusion)}</dd></div></dl></div>
   <div className="dr-summary"><span>LECTURA EJECUTIVA</span><p>{report.informe.resumen}</p></div>
   <div className="dr-metrics">{[['Avances publicados',metrics.avances],['Etapas registradas',metrics.etapas],['Evidencias',metrics.evidencias],['Bloqueos sin resolver',metrics.bloqueosAbiertos]].map(([label,value])=><div key={label}><strong>{value??'—'}</strong><span>{label}</span></div>)}</div>
   <div className="dr-sections">{reportSections.map(([key,title,number])=><section className={'dr-section dr-section-'+key} key={key}><h3><span>{number}</span>{title}</h3>{report.informe[key].length?<ul>{report.informe[key].map((text,i)=><li key={i}>{text}</li>)}</ul>:<p className="dr-empty">No documentado en los registros consultados.</p>}</section>)}</div>
   <footer>Fuente: trazabilidad registrada del desarrollo. La conclusión no acredita por sí sola una liberación. Revisa la síntesis antes de distribuirla.</footer></div>
   </>}
 </div></TraceDialog>;
}
