import {useEffect,useState} from "react";
import {getDetalleMesa} from "../services/gestionDesarrollo";
const timestamp=value=>value?new Date(value).toLocaleString("es-MX",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Sin registro";
export default function DevelopmentDetail({project,reasons,Modal,ModalHead,onClose}){
 const [data,setData]=useState(null),[error,setError]=useState(""),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setData(null);setError("");getDetalleMesa(project.idSolicitud).then(response=>{if(!response?.idSolicitud)throw new Error("No se encontró el desarrollo.");if(active)setData(response);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[project.idSolicitud,retry]);
 const blocks=data?.bloqueos?.filter(b=>!b.fechaResolucion)||[];
 const messages=[...new Set([...(reasons||[]).map(r=>r.descripcion),...(blocks.map(b=>b.motivo))].filter(Boolean))];
 if(data&&!messages.length&&Number(data.idEstatus)!==6&&Number(data.idEstatus)!==7){
  if(data.tiempoEstado==="vencido")messages.push("La fecha compromiso está vencida.");
  if(project.estado?.label&&project.estado.key!=="ok")messages.push(project.estado.label);
 }
 const cells=data?[
 ["Solicitante",data.nombreUsuario||"Sin registro"],["Ubicación",data.sitioUsuario||"Sin registro"],["Área",data.areaUsuario||project.areaSolicitante||"Sin registro"],
 ["Responsable",data.nombreResponsable||project.nombreResponsable||"Sin responsable"],["Avance",data.porcentajeAvance==null?"Sin registro":data.porcentajeAvance+"%"],["Compromiso",data.fechaCompromiso?new Date(String(data.fechaCompromiso).slice(0,10)+"T12:00:00").toLocaleDateString("es-MX"):"Sin compromiso"],
 ["Horas registradas",data.horasResumen?.totalMinutos==null?"Sin registro":(Number(data.horasResumen.totalMinutos)/60).toLocaleString("es-MX",{maximumFractionDigits:1})+" h"],["Creado",timestamp(data.fechaCreacion)],["Última actualización",timestamp(data.fechaActualizacion)]
 ]:[];
 return <Modal variant="development" onClose={onClose} labelledBy="dev-project-title"><ModalHead id="dev-project-title" title={data?.folioDesarrollo||project.folio||project.folioDesarrollo||"Desarrollo"} sub="Desarrollo de Software" onClose={onClose}/><div className="vje-modal-body">
 {error?<div className="vje-error" role="alert">{error}<button onClick={()=>setRetry(v=>v+1)}>Reintentar</button></div>:!data?<div className="vje-empty" role="status">Cargando información del desarrollo…</div>:<>
 <div className="vje-tk-chips"><span className="vje-badge" style={{color:data.prioridadColor||"var(--text-muted)",background:"var(--bg-elevated)"}}>{data.prioridadNombre||"Sin prioridad"}</span><span className="vje-badge" style={{color:"var(--text-muted)",background:"var(--bg-elevated)"}}>{data.estatusNombre||"Sin estado"}</span></div>
 <h3 className="vje-tk-titulo">{data.titulo||project.nombre}</h3><p className="vje-tk-desc">{data.descripcion||"Sin descripción registrada."}</p>
 <dl className="vje-tk-grid">{cells.map(([label,value])=><div className="vje-tk-cell" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
 {messages.length>0&&<div className="vje-tk-motivo"><i className="ti ti-alert-triangle" aria-hidden="true"/><div className="vje-tk-motivo-txt"><b>Por qué requiere atención</b>{messages.map((message,i)=><div key={i}>{message}</div>)}</div></div>}
 {data.objetivo&&<details className="vje-tk-desc"><summary>Objetivo del desarrollo</summary><p>{data.objetivo}</p></details>}
 </>}
 </div></Modal>;
}
