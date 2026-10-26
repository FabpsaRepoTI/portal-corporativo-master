import {projectTitle} from '../projectTitle';
import Finalizados from "./Finalizados";
import { useEffect, useState } from "react";
import { getCronograma, getPortafolioMesa } from "../../../services/gestionDesarrollo";
import { calendarDate, datedStages, stageGeometry, scheduleEvents, milestoneLayout, upcomingDeliveries } from "./cronogramaDates";
import DevIcon from "../components/DevIcon";
import "./CronogramaPage.css";
const DAY = 86400000;
const ETAPAS = {
  1: "Análisis",
  2: "Desarrollo",
  3: "Revisión",
  4: "Pruebas",
  5: "Liberación"
};
const fmt = d => d ? (calendarDate(d) || new Date(d)).toLocaleDateString("es-MX", {
  day: "numeric",
  month: "short"
}) : "Sin fecha";
const monday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d;
};
// Cada responsable tiene un color de avatar distinto (como en la referencia),
// asignado de forma estable por login/nombre — no aleatorio en cada render.
const avatarTone = key => {
  if (!key) return 0;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 6;
};
function Avatar({ login, nombre, foto }) {
  // La BD a veces trae rutas de fotos que ya no existen en disco (usuario
  // sin foto subida, archivo borrado…); si la imagen falla, mostramos
  // iniciales en vez del ícono de imagen rota del navegador.
  const src = foto && /^(https?:)?\//.test(foto.trim()) ? foto.trim() : null;
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt="" onError={() => setBroken(true)} />;
  return <span className={"cg-initials cg-initials-" + avatarTone(login || nombre)}>{nombre?.split(" ").map(n => n[0]).slice(0, 2).join("") || "—"}</span>;
}
export default function CronogramaPage() {
  const [data, setData] = useState([]),
    [resumen, setResumen] = useState({}),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const [view,setView] = useState("active");

  const [start, setStart] = useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1)),
    [resp, setResp] = useState(""),
    [state, setState] = useState(""),
    [area, setArea] = useState(""),
    [selected, setSelected] = useState(null);
  useEffect(() => {
    Promise.all([getCronograma(),getPortafolioMesa().catch(()=>null)]).then(([r,portfolio]) => {
      const byId=new Map((portfolio?.data || []).map(p=>[String(p.idSolicitud),p]));
      setData((r.data || []).map(p=>({...p,bloqueosActivos:p.bloqueosActivos ?? byId.get(String(p.idSolicitudOrigen))?.bloqueosActivos,nombre:projectTitle(p.nombre)})));
      setResumen(r.resumen || {});
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const [scale,setScale]=useState("quarter");
  const [search,setSearch]=useState("");
  const end = scale === "week" ? new Date(+start+7*DAY) : new Date(start.getFullYear(),start.getMonth()+(scale==="month"?1:3),start.getDate());
  const days=Math.round((end-start)/DAY);
  const weeks = Array.from({
    length: Math.ceil(days/7)
  }, (_, i) => new Date(+start + i * 7 * DAY));
  const position = d => ((calendarDate(d) || new Date(d)) - start) / (days * DAY) * 100;
  const activeData = data.filter(p=>![6,7].includes(Number(p.idEstatus)));
  const filtered = activeData.filter(p => (!resp || p.loginResponsable === resp) && (!state || String(p.idEstatus) === state) && (!area || p.areaSolicitante === area) && (!search || [p.nombre,p.nombreResponsable,p.folio].some(v=>v?.toLowerCase().includes(search.toLowerCase()))));
  const visibleProjects = filtered;
  const now = position(new Date());
  const move = n => setStart(d => scale === "week" ? new Date(+d+n*7*DAY) : new Date(d.getFullYear(),d.getMonth()+n*(scale==="month"?1:3),1));
  const months=[];for(let d=new Date(start.getFullYear(),start.getMonth(),1);d<end;d=new Date(d.getFullYear(),d.getMonth()+1,1)){const from=Math.max(+start,+d),to=Math.min(+end,+new Date(d.getFullYear(),d.getMonth()+1,1));months.push({label:d.toLocaleDateString("es-MX",{month:"short",year:"numeric"}),width:(to-from)/(days*DAY)*100});}
  const blocked=activeData.every(p=>p.bloqueosActivos != null) ? activeData.filter(p=>Number(p.bloqueosActivos)>0).length : null;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const mStart = cap(start.toLocaleDateString("es-MX", { month: "long" })),
    mEnd = cap(new Date(+end-DAY).toLocaleDateString("es-MX", { month: "long" }));
  const rangeLabel = mStart === mEnd ? `${mStart} ${end.getFullYear()}` : `${mStart} — ${mEnd} ${end.getFullYear()}`;
  return <div className="cg-root">
  <div className="cg-view-tabs" role="tablist" aria-label="Estado de los desarrollos"><button role="tab" aria-selected={view==='active'} onClick={()=>setView('active')}>En curso <span>{activeData.length}</span></button><button role="tab" aria-selected={view==='completed'} onClick={()=>setView('completed')}>Finalizados</button></div>
  {view === 'completed' ? <Finalizados/> : <>
  <div className="cg-reference-kpis">{[["layers",activeData.length,"Proyectos en curso","Desarrollos activos","ok"],["calendar",upcomingDeliveries(activeData),"Entregas próximas","En los próximos 14 días","info"],["ban",blocked,"Proyectos bloqueados",blocked===null?"Sin información de bloqueos":"Bloqueos registrados","risk"],["warning",resumen.riesgosFecha || 0,"Proyectos en riesgo","Requieren atención","warn"]].map(([icon,value,label,sub,tone])=><div key={label} className={"cg-reference-kpi tone-"+tone}><span><DevIcon name={icon} size={32}/></span><div><b>{loading || value==null?"—":value}</b><strong>{label}</strong><small>{sub}</small></div></div>)}</div>
  <div className="cg-toolbar"><label className="cg-period"><DevIcon name="calendar" size={16} /><span>{rangeLabel}</span><DevIcon name="next" size={12} className="cg-period-chevron" /><input aria-label="Inicio del cronograma" type="date" value={start.getFullYear() + "-" + String(start.getMonth() + 1).padStart(2, "0") + "-" + String(start.getDate()).padStart(2, "0")} onChange={e => {
          if (e.target.value) setStart(new Date(e.target.value + "T00:00:00"));
        }} /></label>
  <label>Responsable <select aria-label="Responsable" value={resp} onChange={e => setResp(e.target.value)}><option value="">Todos</option>{[...new Map(activeData.map(p => [p.loginResponsable, p.nombreResponsable])).entries()].filter(([k]) => k).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
  <label>Estado <select aria-label="Estado" value={state} onChange={e => setState(e.target.value)}><option value="">Todos</option><option value="1">Pendiente</option><option value="2">En revisión</option><option value="3">En proceso</option><option value="4">En pruebas</option><option value="5">Esperando información</option></select></label>
  <label>Área <select aria-label="Área" value={area} onChange={e => setArea(e.target.value)}><option value="">Todas</option>{[...new Set(activeData.map(p => p.areaSolicitante))].filter(Boolean).map(a => <option key={a}>{a}</option>)}</select></label>
  <label className="cg-search"><DevIcon name="search" size={16}/><input aria-label="Buscar en cronograma" placeholder="Buscar proyecto, módulo o responsable…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
  {error && <div role="alert" className="gd-error">{error}</div>}
  <section className="cg-reference-board"><header className="cg-board-heading"><div><h2>Cronograma de proyectos</h2><p>Visualiza las etapas, compromisos y fechas clave de cada proyecto.</p></div><div className="cg-navigation"><button onClick={()=>setStart(new Date(new Date().getFullYear(),new Date().getMonth(),scale==="week"?new Date().getDate():1))}>Hoy</button>{[["week","Semana"],["month","Mes"],["quarter","Trimestre"]].map(([id,label])=><button key={id} aria-pressed={scale===id} onClick={()=>setScale(id)}>{label}</button>)}<button aria-label="Periodo anterior" onClick={()=>move(-1)}>‹</button><button aria-label="Periodo siguiente" onClick={()=>move(1)}>›</button></div></header>
  <div className="cg-scroll"><div className="cg-gantt">
   <div className="cg-grid cg-grid-head"><div>Proyecto / módulo</div><div>Responsable</div><div>Avance</div><div>Estado</div><div className="cg-calendar-head"><div className="cg-months">{months.map(m=><span key={m.label} style={{width:m.width+"%"}}>{m.label}</span>)}</div><div className="cg-weeks" style={{gridTemplateColumns:weeks.map((w,i)=>`${Math.min(7,days-i*7)}fr`).join(" ")}}>{weeks.map((w, i) => <span key={i}>{w.getDate()} – {new Date(Math.min(+w+6*DAY,+end-DAY)).getDate()}</span>)}</div>{now>=0&&now<=100&&<span className="cg-head-today" style={{left:now+"%"}}>Hoy<br/>{fmt(new Date())}</span>}</div><div>Próximo hito</div></div>
   {loading && <div className="gd-empty">Cargando cronograma…</div>}
   {!loading && !error && !filtered.length && <div className="gd-empty">Sin proyectos para los filtros seleccionados.</div>}
   {visibleProjects.map(p => {
          const stages = datedStages(p);
          const visibleStages = stages.map(e => ({ ...e, geometry: stageGeometry(e, start, days) })).filter(e => e.geometry);
          const events = scheduleEvents(p);
          const markers=milestoneLayout(events,start,days);
          const hasProjectCommitment = events.some(e => e.esCompromisoProyecto);
          const h = events.filter(h => Number(h.idEstatus) !== 3 && calendarDate(h.fechaCompromiso)).sort((a,b) => calendarDate(a.fechaCompromiso) - calendarDate(b.fechaCompromiso))[0];
          return <div className="cg-grid cg-project-row" key={p.idProyecto}>
    <div className="cg-project-identity"><span className={"cg-project-icon tone-"+["ok","info","risk","warn"][avatarTone(String(p.idProyecto))%4]}><DevIcon name={["layers","monitor","code","file"][Number(p.idProyecto)%4]}/></span><div><strong title={p.nombre}><button className="cg-project-open" onClick={()=>setSelected({p,h:{nombre:"Detalle del desarrollo"}})}>{p.nombre}</button></strong><small>{p.areaSolicitante}</small></div></div><div className="cg-person"><Avatar login={p.loginResponsable} nombre={p.nombreResponsable} foto={p.fotoResponsable} /><span><b>{p.nombreResponsable || "Sin asignar"}</b><small>{p.areaSolicitante}</small></span></div>
    <div><b>{p.avancePct || 0}%</b><div className={"cg-progress " + (Number(p.avancePct) < 60 ? "cg-progress-low" : "")}><span style={{
                  width: Math.min(100, p.avancePct || 0) + "%"
                }} /></div></div>
    <div><span className={"cg-reference-status status-"+p.idEstatus}>{p.estatusNombre || p.estatus || ({1:"Pendiente",2:"En revisión",3:"En proceso",4:"En pruebas",5:"Esperando información"})[p.idEstatus] || "Sin estado"}</span></div>
    <div className="cg-track" style={{backgroundSize:`${700/days}% 100%`,minHeight:Math.max(60,34+(1+Math.max(0,...markers.map(m=>m.lane)))*22)}}>{now >= 0 && now <= 100 && <div className="cg-today" style={{
                left: now + "%"
              }}/>}
    {visibleStages.filter(e => !e.geometry.invalid).map(e => {
      const label = e.nombreEtapa || ETAPAS[e.numeroEtapa] || "Etapa";
      const title = label + ": " + (e.start ? "Inicio " + fmt(e.fechaInicio) : "Sin inicio registrado") + " · " + (e.finish ? "Fin " + fmt(e.fechaCompromiso || e.fechaCierre) : "Sin cierre ni compromiso registrado");
      return <button type="button" title={title} aria-label={title} className={"cg-phase cg-phase-" + e.numeroEtapa + (e.geometry.partial ? " cg-phase-partial" : "")} key={e.numeroEtapa} style={{left:e.geometry.left + "%",width:e.geometry.width + "%"}} onClick={() => setSelected({p,h:{nombre:label,fechaCompromiso:e.fechaCompromiso || e.fechaCierre || e.fechaInicio,notas:title,entregable:e.entregable,fechaCompletado:e.fechaCierre,soloInicio:!e.finish}})}>{e.geometry.partial ? <><i /><span>{label}</span></> : label}</button>;
    })}
    {markers.map(({h,x,lane,reverse})=><button type="button" key={h.idHito} className={'cg-milestone '+(reverse?'cg-milestone-reverse ':'')+(selected?.h.idHito===h.idHito?'is-selected':'')} style={{left:x+'%',top:32+lane*22}} onClick={()=>setSelected({p,h})} title={h.nombre+' · '+fmt(h.fechaCompromiso)} aria-label={h.nombre+' · '+p.nombre}><i/><span>{fmt(h.fechaCompromiso)}</span></button>)}
    {!stages.length && !events.length && <small className="cg-no-dates">Sin fechas registradas</small>}
    {!stages.length && hasProjectCommitment && <small className="cg-no-dates">Compromiso del proyecto{!events.some(e => position(e.fechaCompromiso) >= 0 && position(e.fechaCompromiso) < 100) ? " fuera del periodo visible" : ""}</small>}
    {stages.length > 0 && !visibleStages.length && <small className="cg-no-dates">Etapas fuera del periodo visible</small>}
    {visibleStages.some(e => e.geometry.invalid) && <small className="cg-no-dates">Revisar fechas: el cierre precede al inicio</small>}
    </div><div>{h ? <button className="cg-next" onClick={() => setSelected({
                p,
                h
              })}><span className="cg-diamond" /><span><b>{h.nombre}</b><small>{fmt(h.fechaCompromiso)}</small>{p.enRiesgo && <em>En riesgo</em>}</span></button> : <small>Sin hitos pendientes</small>}</div>
   </div>;
        })}
  </div></div><footer className="cg-board-footer">Mostrando {filtered.length} de {activeData.length} proyectos en curso</footer></section>
  {selected && <div className="cg-detail"><h3>Detalle del hito seleccionado</h3>{selected ? <div className="cg-detail-grid"><div><span className="cg-diamond" /><strong>{selected.h.nombre}</strong><small>{selected.p.nombre} · {fmt(selected.h.fechaCompromiso)}</small></div><div><small>Responsable</small><div className="cg-person cg-detail-person"><Avatar login={selected.p.loginResponsable} nombre={selected.p.nombreResponsable} foto={selected.p.fotoResponsable} /><span><b>{selected.p.nombreResponsable || "Sin asignar"}</b><small>{selected.p.areaSolicitante}</small></span></div></div><div><small>Entregable</small><div className="cg-detail-deliverable"><DevIcon name="file" size={22}/><b>{selected.h.entregable || "Sin entregable registrado"}</b></div></div><div><small>Estado</small><span className={"cg-status " + (selected.p.enRiesgo ? "risk" : "")}>{selected.p.enRiesgo ? "En riesgo" : Number(selected.h.idEstatus) === 3 || selected.h.fechaCompletado ? "Completado" : !selected.h.fechaCompromiso || selected.h.soloInicio ? "Sin compromiso" : calendarDate(selected.h.fechaCompromiso) < new Date(new Date().setHours(0,0,0,0)) ? "Vencido" : "En tiempo"}</span></div><div><small>Notas</small>{selected.h.notas || selected.p.motivoRiesgo || "Sin observaciones registradas."}</div></div> : null}</div>}
 </>}
 </div>;
}
