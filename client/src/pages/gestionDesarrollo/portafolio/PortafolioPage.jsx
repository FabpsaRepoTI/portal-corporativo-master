import ReferenceHero,{ReferenceHeadingIcon} from "../components/ReferenceHero";
import {projectTitle} from '../projectTitle';
import {ETAPAS_DESARROLLO} from "../components/PlanEtapas";
import { useState, useEffect,  useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPortafolioMesa, getDetalleMesa, getHistorialAvancesMesa } from "../../../services/gestionDesarrollo";
import RegistrarAvanceModal from "../components/RegistrarAvanceModal";
import DevIcon from "../components/DevIcon";
import "./PortafolioExact.css";
const TABS = [["portafolio", "Portafolio"], ["cronograma", "Cronograma"], ["documentacion", "Documentación"]];
const PAGE_SIZE = 5;
const date = value => value ? new Date(String(value).slice(0, 10) + "T12:00:00").toLocaleDateString("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric"
}).replaceAll(".", "") : "—";
const shortDate = value => date(value).replace(/ \d{4}$/, "");
const monthValue = () => new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0");
// El usuario captura el título del hito con la capitalización que se le
// ocurra (TODO MAYÚSCULAS, Todo Con Mayúsculas...); lo normalizamos a
// "oración" (primera letra mayúscula, resto minúsculas, acentos intactos)
// para que todos los hitos se vean consistentes sin importar cómo se cargó.
const sentenceCase = value => {
  if (!value) return value;
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};
const isImageFile = a => (a.mimeType || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(a.nombreArchivo || a.rutaServidor || "");
// El adjunto no guarda a qué avance pertenece (se sube en una llamada aparte,
// justo después de publicar), así que lo asociamos por cercanía de fecha: el
// avance más reciente cuyo registro sea anterior o igual a la subida.
function adjuntosDeAvance(avance, idxDesc, historialDesc, adjuntos) {
  if (!adjuntos?.length) return [];
  const desde = new Date(avance.fechaRegistro);
  const hasta = idxDesc > 0 ? new Date(historialDesc[idxDesc - 1].fechaRegistro) : null;
  return adjuntos.filter(a => {
    const t = new Date(a.fechaSubida);
    return t >= desde && (!hasta || t < hasta);
  });
}
function Avatar({
  person,
  size = 27
}) {
  const raw = person.picture || person.fotoResponsable;
  // La BD a veces trae valores placeholder ("-", cadena vacía, rutas de
  // Windows) en vez de NULL. Sólo intentamos cargar <img> si de verdad
  // parece una ruta/URL servible; cualquier otra cosa cae a iniciales.
  const src = raw && /^(https?:)?\//.test(raw.trim()) ? raw.trim() : null;
  const [broken, setBroken] = useState(false);
  // Tamaño forzado inline: algunas fotos vienen con proporciones muy
  // distintas a un avatar (logos, capturas) y no deben desbordar la fila
  // pase lo que pase con el resto de las reglas de la tarjeta.
  const style = { width: size, height: size };
  return src && !broken ? <img className="portfolio-avatar" style={style} src={src} alt="" onError={() => setBroken(true)} /> : <span className="portfolio-avatar portfolio-initials" style={style}>{(person.nombreResponsable || person.nombre || "?").split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("")}</span>;
}
function Progress({
  value
}) {
  return <span className="portfolio-progress"><span><i style={{
        width: Math.min(100, Math.max(0, value || 0)) + "%"
      }} /></span><small>{value == null ? "—" : value + "%"}</small></span>;
}
function Pager({
  page,
  count,
  size,
  onChange,
  label
}) {
  return count > size ? <div className="portfolio-pager" aria-label={label}><button aria-label={label + " anterior"} disabled={!page} onClick={() => onChange(page - 1)}>‹</button><span>{page + 1} / {Math.ceil(count / size)}</span><button aria-label={label + " siguiente"} disabled={(page + 1) * size >= count} onClick={() => onChange(page + 1)}>›</button></div> : null;
}
export default function PortafolioPage({
  onTabChange
}) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState({
    data: [],
    equipo: [],
    atencion: [],
    resumen: {}
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [periodo, setPeriodo] = useState(monthValue),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [owner, setOwner] = useState(""),
    [priority, setPriority] = useState("");
  const [page, setPage] = useState(0),
    [weeks, setWeeks] = useState(0);
  const [detail, setDetail] = useState(null),
    [detailLoading, setDetailLoading] = useState(false),
    [avance, setAvance] = useState(null),
    [list, setList] = useState(null);
  const [historial, setHistorial] = useState([]),
    [historialLoading, setHistorialLoading] = useState(false),
    [lightbox, setLightbox] = useState(null);
  const requestId = useRef(0),
    detailRequest = useRef(0),
    inFlight = useRef(false);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    inFlight.current = true;
    try {
      const res = await getPortafolioMesa(periodo);
      if (id === requestId.current) {
        setSnapshot(res);
        setError("");
      }
    } catch (e) {
      if (id === requestId.current) setError(e.message);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        inFlight.current = false;
      }
    }
  }, [periodo]);
  useEffect(() => {
    load();
    const refresh = () => {
      if (!document.hidden && !inFlight.current) load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 15000);
    return () => {
      requestId.current++;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    setPage(0);
  }, [search, status, owner, priority]);
  useEffect(() => {
    const close = e => {
      if (e.key === "Escape") {
        detailRequest.current++;
        setDetail(null);
        setList(null);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);
  const [kpiFilter,setKpiFilter]=useState('');
  const filtered = snapshot.data.filter(p=>!kpiFilter || (kpiFilter==='activos') || (kpiFilter==='entregas' && p.fechaCompromiso && Number(p.diasRestantes)>=0 && Number(p.diasRestantes)<=14) || (kpiFilter==='bloqueos' && Number(p.bloqueosActivos)>0) || (kpiFilter==='enRiesgo' && p.estado?.key==='risk')).filter(p => (!status || String(p.idEstatus) === status) && (!owner || p.loginResponsable === owner) && (!priority || String(p.idPrioridad) === priority) && (!search || [p.nombre, p.nombreResponsable, p.folio, p.areaSolicitante].some(v => v?.toLowerCase().includes(search.toLowerCase()))));
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const rows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const attention = snapshot.atencion || [],
    kpi = snapshot.resumen || {};
  // Resumen rápido por desarrollador (activos / en tiempo / pendientes /
  // riesgo), calculado a partir de sus proyectos reales — se usa en el
  // popover al pasar el mouse sobre "Responsable" en Portafolio activo.
  const team = (snapshot.equipo || []).map(d => {
    const proc = d.proyectos.filter(p => p.estado?.key === 'ok').length;
    const pend = d.proyectos.filter(p => p.estado?.key === 'pending').length;
    const risk = d.proyectos.filter(p => p.estado?.key === 'risk').length;
    return { ...d, proc, pend, risk };
  });
  const teamByLogin = Object.fromEntries(team.map(d => [d.login, d]));
  const start = new Date(periodo + "-01T12:00:00");
  start.setDate(start.getDate() + weeks * 7);
  const milestones = (snapshot.hitos || snapshot.data).map(p => ({
    ...p,
    fechaHito: p.fechaProximoEntregable || p.fechaCompromiso
  })).filter(p => p.fechaHito).filter(p => {
    const d = new Date(p.fechaHito.slice(0, 10) + "T12:00:00");
    return d >= start && d < new Date(+start + 28 * 86400000);
  }).sort((a, b) => a.fechaHito.localeCompare(b.fechaHito));
  const [milestoneWeek,setMilestoneWeek]=useState(-1);
  const [milestoneExpanded,setMilestoneExpanded]=useState(false);
  const [milestoneRisk,setMilestoneRisk]=useState(false);
  const shownMilestones=milestones.filter(p=>(milestoneWeek<0 || Math.floor((new Date(p.fechaHito.slice(0,10)+'T12:00:00')-start)/(7*86400000))===milestoneWeek) && (!milestoneRisk || p.estado?.key==='risk'));
  async function openDetail(id) {
    const token = ++detailRequest.current;
    setDetail({
      idSolicitud: id
    });
    setDetailLoading(true);
    setHistorial([]);
    setHistorialLoading(true);
    try {
      const data = await getDetalleMesa(id);
      if (token === detailRequest.current) setDetail(data);
      if(data.alcanceDesarrollo==='CAMBIO_SENCILLO'){setHistorialLoading(false);return;}
    } catch (e) {
      setError(e.message);
      if (token === detailRequest.current) setDetail(null);
    } finally {
      if (token === detailRequest.current) setDetailLoading(false);
    }
    getHistorialAvancesMesa(id)
      .then(h => { if (token === detailRequest.current) setHistorial(h); })
      .catch(() => {})
      .finally(() => { if (token === detailRequest.current) setHistorialLoading(false); });
  }
  function openMesa(id) {
    const p = snapshot.data.find(p => p.idSolicitud === id) || detail;
    const q = new URLSearchParams({
      tab: 'desarrollo',
      solicitud: id,
      buscar: p?.folio || p?.folioDesarrollo || ''
    });
    navigate('/mesa-de-servicio/admin?' + q);
  }
  return <div className="portfolio-screen">
  <div className="portfolio-content">
   <div className="portfolio-breadcrumb"><Link to="/">Portal Corporativo</Link><span>/</span>Desarrollo</div>
   <header className="portfolio-header"><ReferenceHeadingIcon/><div><span className="portfolio-eyebrow">Gestión tecnológica</span><h1>Gestión de <em>Desarrollo</em></h1><p>Planifica, da seguimiento y lleva el control de tus proyectos.</p></div><ReferenceHero/><div className="portfolio-header-actions"><Link to="/" className="portfolio-secondary portfolio-btn-home"><DevIcon name="home" size={18} />Inicio</Link><label className="portfolio-period"><DevIcon name="calendar" size={18} /><select aria-label="Periodo" value={periodo} onChange={e => {
              setPeriodo(e.target.value);
              setWeeks(0);
            }}>{Array.from({
                length: 25
              }, (_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() + i - 12, 1);
                const value = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
                const label = d.toLocaleDateString('es-MX', {
                  month: 'long',
                  year: 'numeric'
                }).replace(' de ', ' ');
                return <option key={value} value={value}>{label[0].toUpperCase() + label.slice(1)}</option>;
              })}</select></label><button className="portfolio-primary" onClick={() => setAvance({})}><span aria-hidden="true" className="portfolio-plus">+</span> Registrar avance</button><button className="portfolio-secondary" onClick={() => onTabChange('cronograma')}><DevIcon name="calendar" size={18} />Ver cronograma</button></div></header>
   <div className="portfolio-kpis">{[["layers", kpi.activos, "Proyectos activos", "Desarrollos en curso este periodo", "ok"], ["calendar", kpi.entregas, "Entregas próximas", "Con compromiso en los próximos 14 días", "info"], ["ban", kpi.bloqueos, "Bloqueos", "Bloqueos técnicos activos sin resolver", "risk"], ["warning", kpi.enRiesgo, "En riesgo", "Requieren atención inmediata", "warn"]].map(([icon, value, label, sub, tono],index) => <button type="button" title={sub} aria-pressed={kpiFilter===['activos','entregas','bloqueos','enRiesgo'][index]} onClick={()=>{setKpiFilter(kpiFilter===['activos','entregas','bloqueos','enRiesgo'][index]?'':['activos','entregas','bloqueos','enRiesgo'][index]);setPage(0);setStatus('');setOwner('');setPriority('');setSearch('');}} key={label} className={'portfolio-kpi portfolio-kpi--' + tono}><span className="portfolio-kpi-icon"><DevIcon name={icon} size={18}/></span><span className="portfolio-kpi-text"><span className="portfolio-kpi-num">{loading ? '—' : value || 0}</span><span className="portfolio-kpi-label">{label}</span><small className="portfolio-kpi-sub">{sub}</small></span></button>)}</div>
   <div className="portfolio-toolbar"><div className="portfolio-tabs" role="tablist">{TABS.map(([id, label]) => <button role="tab" aria-selected={id === 'portafolio'} key={id} onClick={() => onTabChange(id)}>{label}</button>)}</div><div className="portfolio-filters"><label className="portfolio-search"><DevIcon name="search" size={16} /><input aria-label="Buscar proyecto o responsable" placeholder="Buscar proyecto, responsable…" value={search} onChange={e => setSearch(e.target.value)} /></label><label>Estado<select aria-label="Estado" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option><option value="2">En revisión</option><option value="3">En proceso</option><option value="4">En pruebas</option><option value="5">Esperando información</option></select></label><label>Responsable<select aria-label="Responsable" value={owner} onChange={e => setOwner(e.target.value)}><option value="">Todos</option>{team.map(d => <option key={d.login} value={d.login}>{d.nombre}</option>)}</select></label><label>Prioridad<select aria-label="Prioridad" value={priority} onChange={e => setPriority(e.target.value)}><option value="">Todas</option>{[...new Map(snapshot.data.map(p => [p.idPrioridad, p.prioridadNombre])).entries()].filter(([id]) => id != null).map(([id, name]) => <option key={id} value={id}>{name || id}</option>)}</select></label></div></div>
   <div className="portfolio-main">
    <section className="portfolio-card portfolio-projects"><div className="portfolio-card-heading"><div><h2>Portafolio activo</h2><small>Proyectos y desarrollos en curso</small></div></div>{error && <div role="alert" className="portfolio-error">{error}<button onClick={load}>Reintentar</button></div>}<table className="portfolio-table"><colgroup><col style={{
                width: '22%'
              }} /><col style={{
                width: '14%'
              }} /><col style={{
                width: '11%'
              }} /><col style={{
                width: '13%'
              }} /><col style={{
                width: '16%'
              }} /><col style={{
                width: '11%'
              }} /><col style={{
                width: '11%'
              }} /><col style={{
                width: '2%'
              }} /></colgroup><thead><tr>{['Proyecto y área', 'Responsable', 'Estatus', 'Avance', 'Próximo entregable', 'Compromiso', 'Seguimiento', ''].map((x, i) => <th key={i}>{x}</th>)}</tr></thead><tbody>{rows.map((p, i) => <tr key={p.idSolicitud} onClick={() => openDetail(p.idSolicitud)}><td><div className="portfolio-project"><span className={'portfolio-project-icon icon-' + i % 5}><DevIcon name={['monitor', 'code', 'check', 'file', 'monitor'][i % 5]} /></span><span><button className="portfolio-project-name" onClick={e => {
                        e.stopPropagation();
                        openDetail(p.idSolicitud);
                      }}>{projectTitle(p.nombre)}</button><small>{p.areaSolicitante || '—'}</small></span></div></td><td>{(() => { const dev = teamByLogin[p.loginResponsable]; return <span className={'portfolio-owner' + (dev ? ' portfolio-owner--hoverable' : '')} onClick={e => e.stopPropagation()}><Avatar person={p} /><span>{p.nombreResponsable || 'Sin asignar'}</span>{dev && <div className="portfolio-owner-pop"><b>{dev.nombre}</b><div className="portfolio-owner-pop__row"><span>Activos</span><b>{dev.proyectos.length}</b></div><div className="portfolio-owner-pop__row"><span>En tiempo</span><b className="ok">{dev.proc}</b></div><div className="portfolio-owner-pop__row"><span>Pendientes</span><b className="warn">{dev.pend}</b></div><div className="portfolio-owner-pop__row"><span>En riesgo</span><b className="risk">{dev.risk}</b></div></div>}</span>; })()}</td><td><span className={'portfolio-stage stage-' + p.idEstatus}>{p.etapaNombre}</span></td><td><Progress value={p.avancePct} /></td><td>{p.proximoEntregable || '—'}</td><td>{date(p.fechaCompromiso)}</td><td><span className={'portfolio-state state-' + p.estado.key}><i />{p.estado.label}</span></td><td><button aria-label={'Ver ' + p.nombre} className="portfolio-more" onClick={e => {
                    e.stopPropagation();
                    openDetail(p.idSolicitud);
                  }}>⋯</button></td></tr>)}</tbody></table>{!rows.length && <div className="portfolio-empty">{loading ? 'Cargando desarrollos…' : error ? 'No se pudieron cargar los desarrollos.' : 'No hay desarrollos activos con estos filtros.'}</div>}<div className="portfolio-table-footer"><span>{filtered.length ? `Mostrando ${safePage*PAGE_SIZE+1} a ${Math.min((safePage+1)*PAGE_SIZE,filtered.length)} de ${filtered.length} proyectos` : "Sin proyectos"}</span><Pager page={safePage} count={filtered.length} size={5} onChange={setPage} label="Proyectos" /></div></section>
    <aside className="portfolio-side"><section className="portfolio-card portfolio-attention"><div className="portfolio-card-heading"><h2>Requieren atención <span className="portfolio-attention-count">{attention.length}</span></h2><button className="portfolio-link" onClick={() => setList('attention')}>Ver todas</button></div><div className="portfolio-attention-list">{attention.slice(0, PAGE_SIZE).map(a => <button className={'portfolio-attention-item attention-' + a.tipo} key={a.id} onClick={() => openDetail(a.idSolicitud)}><DevIcon name={a.tipo === 'block' ? 'ban' : a.tipo === 'late' ? 'clock' : 'warning'} size={23} /><span><span className="portfolio-attention-title"><b>{a.titulo}</b><time>{shortDate(a.fecha)}</time></span><span className="portfolio-attention-project">{projectTitle(a.proyecto)}</span><span className="portfolio-attention-description">{a.descripcion}</span></span><em>{a.etiqueta}</em></button>)}{!attention.length && <div className="portfolio-empty">Sin desarrollos que requieran atención.</div>}</div></section></aside>
   </div>
   <section className="portfolio-card portfolio-milestones portfolio-agenda"><div className="portfolio-card-heading"><div><h2>Próximos hitos</h2><small>Selecciona una semana y abre una entrega para consultar su detalle.</small></div><div className="portfolio-agenda-controls"><label><input type="checkbox" checked={milestoneRisk} onChange={e=>setMilestoneRisk(e.target.checked)}/> Solo en riesgo</label><button aria-label="Cuatro semanas anteriores" onClick={()=>setWeeks(w=>w-4)}>‹</button><button aria-label="Cuatro semanas siguientes" onClick={()=>setWeeks(w=>w+4)}>›</button></div></div>
    <div className="portfolio-agenda-weeks" role="tablist" aria-label="Semana de los hitos"><button role="tab" className="portfolio-week-btn portfolio-week-btn--all" aria-selected={milestoneWeek===-1} onClick={()=>{setMilestoneWeek(-1);setMilestoneExpanded(true)}}><span className="portfolio-week-icon"><DevIcon name="calendar" size={17}/></span><span className="portfolio-week-info"><b className="portfolio-week-label">Todas</b><small className="portfolio-week-range">Las 4 semanas</small></span><span className="portfolio-week-count"><b>{milestones.length}</b><small>entregas</small></span></button>{[0,1,2,3].map(i=>{const first=new Date(+start+i*7*86400000),last=new Date(+first+6*86400000);const count=milestones.filter(p=>Math.floor((new Date(p.fechaHito.slice(0,10)+'T12:00:00')-start)/(7*86400000))===i).length;return <button role="tab" className="portfolio-week-btn" key={i} aria-selected={milestoneWeek===i} onClick={()=>{setMilestoneWeek(i);setMilestoneExpanded(true)}}><span className="portfolio-week-icon"><DevIcon name="calendar" size={17}/></span><span className="portfolio-week-info"><b className="portfolio-week-label">Semana {i+1}</b><small className="portfolio-week-range">{shortDate(first.toISOString())} – {shortDate(last.toISOString())}</small></span><span className="portfolio-week-count"><b>{count}</b><small>entregas</small></span></button>})}</div>
    <details className="portfolio-agenda-details" open={milestoneExpanded} onToggle={e=>setMilestoneExpanded(e.currentTarget.open)}><summary>{milestoneExpanded?"Ocultar entregas":"Ver entregas de la selección"}</summary><div className="portfolio-agenda-grid">{shownMilestones.map(p=><button className={'portfolio-delivery-card'+(p.estado?.key==='risk'?' is-risk':'')} key={p.idSolicitud} onClick={()=>openDetail(p.idSolicitud)}><time><b>{new Date(p.fechaHito.slice(0,10)+'T12:00:00').getDate()}</b><small>{new Date(p.fechaHito.slice(0,10)+'T12:00:00').toLocaleDateString('es-MX',{month:'short'})}</small></time><span><small>{p.folio}</small><strong className="portfolio-delivery-title">{projectTitle(p.nombre)}</strong>{p.proximoEntregable && <span className="portfolio-delivery-sub">{sentenceCase(p.proximoEntregable)}</span>}<span className="portfolio-delivery-meta"><b>{p.nombreResponsable || 'Sin asignar'}</b><small> · {p.areaSolicitante || '—'}</small></span><em>{p.alcanceDesarrollo==='CAMBIO_SENCILLO' ? 'Adecuación menor · '+p.etapaNombre : p.estado?.label || 'Sin estado'}</em></span><DevIcon name="next" size={15}/></button>)}</div>{!shownMilestones.length&&<p className="portfolio-empty">Sin compromisos registrados para esta selección.</p>}</details></section>
  </div>
  {list && <div className="portfolio-overlay" onClick={() => setList(null)}><section className="portfolio-dialog" role="dialog" aria-modal="true" aria-label="Requieren atención" onClick={e => e.stopPropagation()}><div className="portfolio-card-heading"><h2>Requieren atención</h2><button aria-label="Cerrar" onClick={() => setList(null)}>×</button></div>{attention.map(a => <button className="portfolio-list-alert" key={a.id} onClick={() => {
          setList(null);
          openDetail(a.idSolicitud);
        }}><b>{a.titulo} · {projectTitle(a.proyecto)}</b><p>{a.descripcion}</p></button>)}</section></div>}
  {detail && <div className="portfolio-overlay" onClick={() => {
      detailRequest.current++;
      setDetail(null);
    }}><section className="portfolio-dialog" role="dialog" aria-modal="true" aria-label="Detalle del desarrollo" onClick={e => e.stopPropagation()}><div className="portfolio-card-heading"><h2>{projectTitle(detail.titulo) || 'Detalle del desarrollo'}</h2><button aria-label="Cerrar detalle" onClick={() => {
            detailRequest.current++;
            setDetail(null);
          }}>×</button></div>{detailLoading ? <p>Cargando desarrollo…</p> : <><p>{detail.folioDesarrollo} · {detail.estatusNombre}</p><dl><dt>Responsable</dt><dd>{detail.nombreTecnico || 'Sin asignar'}</dd><dt>Avance registrado</dt><dd><Progress value={Number(detail.porcentajeAvance || 0)} /></dd><dt>Compromiso</dt><dd>{date(detail.fechaCompromiso)}</dd></dl><p>{detail.descripcion}</p>{detail.alcanceDesarrollo !== 'CAMBIO_SENCILLO' && <div className="portfolio-history"><h3>Historial de avances</h3>{historialLoading && <p className="portfolio-history-empty">Cargando historial…</p>}{!historialLoading && !historial.length && <p className="portfolio-history-empty">Aún no se han publicado avances para este desarrollo.</p>}{historial.map((a, i) => { const archivos = adjuntosDeAvance(a, i, historial, detail.adjuntos); return <div className="portfolio-history-item" key={a.idAvance}><div className="portfolio-history-item__head"><b>{a.nombreUsuario}</b><time>{date(a.fechaRegistro)}</time><span className="portfolio-history-item__pct">{a.avanceAnterior ?? '—'}% → {a.avanceNuevo}%</span></div><dl className="portfolio-history-item__dl"><dt>Etapa</dt><dd>{ETAPAS_DESARROLLO.find(e=>e.id===a.numeroEtapa)?.nombre || (a.numeroEtapa===3?"Revisión":"Sin etapa registrada")} {a.fechaInicioEtapa && `· ${date(a.fechaInicioEtapa)} – ${date(a.fechaFinEtapa)}`}</dd>{a.tipoActividad && <><dt>Tipo de actividad</dt><dd>{['Desarrollo','Análisis','Pruebas','Reunión','Documentación','Soporte','Liberación'][Number(a.tipoActividad)-1] || 'Tipo '+a.tipoActividad}</dd></>}{a.observaciones && <><dt>Observaciones</dt><dd>{a.observaciones}</dd></>}<dt>Terminó</dt><dd>{a.terminado || '—'}</dd><dt>Trabajando en</dt><dd>{a.trabajando || '—'}</dd><dt>Sigue</dt><dd>{a.siguiente || '—'}</dd></dl><div className="portfolio-history-item__meta">{a.minutosInvertidos ? <span>{(a.minutosInvertidos / 60).toFixed(1)} h invertidas</span> : null}{a.tieneBloqueo && <span className="portfolio-history-item__bloqueo">⚠ Bloqueo: {a.bloqueo || a.apoyoRequerido || 'Sin detalle'}</span>}</div>{archivos.length > 0 && <div className="portfolio-history-item__files">{archivos.map(f => isImageFile(f) ? <button key={f.idArchivo} type="button" className="portfolio-history-thumb" title={f.nombreArchivo} onClick={e => { e.stopPropagation(); setLightbox(f.rutaServidor); }}><img src={f.rutaServidor} alt={f.nombreArchivo} /></button> : <a key={f.idArchivo} href={f.rutaServidor} target="_blank" rel="noreferrer" className="portfolio-history-file" title={f.nombreArchivo} onClick={e => e.stopPropagation()}><DevIcon name="file" size={14} />{f.nombreArchivo}</a>)}</div>}</div>; })}</div>}<div className="portfolio-detail-actions"><button className="portfolio-secondary" onClick={() => openMesa(detail.idSolicitud)}>Abrir en Mesa de Servicio ↗</button>{detail.tecnicoAsignado && detail.alcanceDesarrollo !== 'CAMBIO_SENCILLO' && <button className="portfolio-primary" onClick={() => {
              setAvance({
                idProyecto: detail.idSolicitud,
                nombre: detail.titulo,
                folio: detail.folioDesarrollo,
                areaSolicitante: detail.areaUsuario,
                avancePct: Number(detail.porcentajeAvance || 0)
              });
              setDetail(null);
            }}>Registrar avance</button>}</div></>}</section></div>}
  {avance && <RegistrarAvanceModal source="mesa" proyecto={avance.idProyecto ? avance : undefined} onClose={() => {
      setAvance(null);
      load();
    }} onPublicado={() => {
      setAvance(null);
      load();
    }} />}
  {lightbox && <div className="portfolio-lightbox" onClick={() => setLightbox(null)}><button aria-label="Cerrar imagen" className="portfolio-lightbox-close" onClick={() => setLightbox(null)}>×</button><img src={lightbox} alt="" onClick={e => e.stopPropagation()} /></div>}
 </div>;
}
