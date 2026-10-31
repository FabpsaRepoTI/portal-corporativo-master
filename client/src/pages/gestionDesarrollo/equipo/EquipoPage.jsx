// client/src/pages/gestionDesarrollo/equipo/EquipoPage.jsx
// Reproduce exactamente el mockup "Mi equipo":
// - Filtros: Periodo | Buscar | Todos los proyectos
// - Cards por desarrollador con: carga, proyecto actual, próximo compromiso, tareas activas, última actualización
// - Card expandida: proyectos asignados + timeline qué terminó / en qué trabaja / qué sigue
// - Panel derecho: Balance del equipo | Bloqueos que requieren apoyo | Próximos compromisos
import { useState, useEffect } from "react";
import { getEquipo, getDesarrollador } from "../../../services/gestionDesarrollo";
import "./EquipoPage.css";
import DevIcon from "../components/DevIcon";

const CARGA_MAP = {
  disponible: { label: "Disponible", color: "var(--primary)" },
  adecuada:   { label: "Adecuada",   color: "var(--primary)" },
  alta:        { label: "Alta",       color: "var(--warning)" },
  sobrecarga:  { label: "Sobrecarga", color: "var(--danger)" },
  sin_datos:   { label: "Sin datos",  color: "var(--text-faint)" },
};

// El usuario captura los nombres de proyecto con la capitalización que se le
// ocurra (TODO MAYÚSCULAS incluido); lo normalizamos para que la lista se
// vea consistente, igual que en Portafolio.
const sentenceCase = value => {
  if (!value) return value;
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

// Igual que en Portafolio/Cronograma: la BD a veces trae rutas de fotos que
// ya no existen en disco, o valores placeholder ("-", vacío). Sólo se
// intenta cargar <img> si de verdad parece una ruta/URL servible, y si la
// carga falla en el navegador cae a iniciales — nunca al ícono roto.
function Avatar({ picture, nombre }) {
  const src = picture && /^(https?:)?\//.test(picture.trim()) ? picture.trim() : null;
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt="" className="eq-avatar" onError={() => setBroken(true)} />;
  return <div className="eq-avatar eq-avatar--fb">{(nombre?.[0] ?? "?")}</div>;
}

function fmtFecha(f) {
  if (!f) return "—";
  return new Date(f).toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" });
}

function fmtRelativa(f) {
  if (!f) return "—";
  const fecha = new Date(f);
  const d = Math.ceil((fecha - new Date()) / 86400000);
  const hora = fecha.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  if (d === 0) return `Hoy, ${hora}`;
  if (d === 1) return `Mañana, ${hora}`;
  if (d < 0)   return `Hace ${Math.abs(d)} días`;
  return fmtFecha(f);
}
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtHace(f) {
  if (!f) return "—";
  const d = Math.floor((new Date() - new Date(f)) / 86400000);
  if (d <= 0) return "Hoy";
  if (d === 1) return "Hace 1 día";
  return `Hace ${d} días`;
}

export default function EquipoPage() {
  const [data,      setData]      = useState([]);
  const [resumen,   setResumen]   = useState(null);
  const [bloqueos,  setBloqueos]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null);
  const [buscar, setBuscar] = useState("");
  const [periodo, setPeriodo] = useState(new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0"));
  const [project, setProject] = useState("");
  const [details, setDetails] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [showAllBlocks, setShowAllBlocks] = useState(false);
  const [error, setError] = useState("");
  async function expand(dev) {
    if (expanded === dev.login) return setExpanded(null);
    setExpanded(dev.login);
    if (!details[dev.login]) try { const r = await getDesarrollador(dev.login, periodo); setDetails(d => ({...d,[dev.login]:r})); } catch(e) { setDetailErrors(d => ({...d, [dev.login]: e.message})); }
  }
  function exportView() {
    const rows = [["Nombre","Proyecto","Carga (%)","Tareas activas"], ...filtrados.map(d=>[d.nombre,d.proyectoActual,d.cargaPct,d.tareasActivas])];
    const csv = rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'").replaceAll('"','""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a');a.href=url;a.download='equipo-'+periodo+'.csv';a.click();URL.revokeObjectURL(url);
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setDetails({}); setDetailErrors({}); setExpanded(null); setResumen(null); setData([]); setBloqueos([]);
    getEquipo(periodo)
      .then(r => { if (!active) return; setData(r.data ?? []); setResumen(r.resumen ?? null); setBloqueos(r.bloqueos ?? []); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [periodo]);

  // Sólo desarrolladores con trabajo asignado (proyectos activos o tareas
  // activas) — alguien sin nada asignado no debería figurar en "Mi equipo".
  const filtrados = data
    .filter(d => (d.proyectosActivos ?? 0) > 0 || (d.tareasActivas ?? 0) > 0)
    .filter(d => (!project || d.proyectoActual === project))
    .filter(d =>
      !buscar || d.nombre?.toLowerCase().includes(buscar.toLowerCase()) ||
                 d.proyectoActual?.toLowerCase().includes(buscar.toLowerCase())
    );

  // Bloqueos que requieren apoyo (datos reales, ver bloqueosDetalle en el backend)
  const bloqueosApoyo = showAllBlocks ? bloqueos : bloqueos.slice(0, 2);
  const number = value => value == null ? "—" : Number(value).toLocaleString("es-MX", {maximumFractionDigits: 1});
  const capacity = resumen?.capacidadTotal;
  const availablePct = capacity > 0 && resumen?.horasDisponibles != null ? Math.round(resumen.horasDisponibles / capacity * 100) : null;
  const committedPct = capacity > 0 && resumen?.horasComprometidas != null ? Math.round(resumen.horasComprometidas / capacity * 100) : null;

  return (
    <div className="eq-root">
      {/* Filtros */}
      <div className="eq-bar">
        <div className="eq-bar__left">
          <label className="eq-btn-periodo">
            <DevIcon name="calendar" size={16}/>
            <span><small>Periodo</small><b>{MESES[Number(periodo.slice(5,7))-1]} {periodo.slice(0,4)}</b></span>
            <DevIcon name="next" size={11} className="eq-periodo-chevron"/>
            <input aria-label="Periodo del equipo" type="month" value={periodo} onChange={e => {if(e.target.value) setPeriodo(e.target.value);}}/>
          </label>
          <input className="eq-search" placeholder="Buscar por nombre, proyecto o tecnología..."
            value={buscar} onChange={e => setBuscar(e.target.value)} />
          <select aria-label="Proyecto del equipo" className="eq-select" value={project} onChange={e => setProject(e.target.value)}>
            <option value="">Todos los proyectos</option>{[...new Set(data.map(d=>d.proyectoActual))].filter(Boolean).map(p=><option key={p}>{p}</option>)}
          </select>
        </div>
        <button className="eq-btn-export" onClick={exportView}>↑ Exportar vista</button>
      </div>

      {/* Layout 2 columnas */}
      {error && <div role="alert" className="gd-error">{error}</div>}<div className="eq-layout">
        {/* Columna izquierda — cards */}
        <div className="eq-col-main">
          {!loading && !error && !filtrados.length && <div className="eq-card gd-empty">Sin integrantes para los filtros seleccionados.</div>}{loading && Array.from({length:3}).map((_,i) => (
            <div key={i} className="eq-card eq-card--skeleton">
              <div className="eq-sk" style={{width:"40%",height:16}} />
              <div className="eq-sk" style={{width:"70%",height:12,marginTop:8}} />
            </div>
          ))}

          {!loading && filtrados.map(dev => {
            const sinDatos = dev.cargaPct == null;
            const carga   = CARGA_MAP[dev.clasificacionCarga] ?? CARGA_MAP.sin_datos;
            const pct     = Math.min(dev.cargaPct ?? 0, 100);
            const isExp   = expanded === dev.login;
            const detail = details[dev.login];

            return (
              <div key={dev.login} className={`eq-card ${isExp ? "eq-card--expanded" : ""}`}>
                {/* Fila principal */}
                <div className="eq-card__row">
                  {/* Avatar */}
                  <div className="eq-avatar-wrap">
                    <Avatar picture={dev.picture} nombre={dev.nombre} />
                    <span className={`eq-dot ${dev.bloqueosActivos > 0 ? "eq-dot--riesgo" : "eq-dot--ok"}`} />
                  </div>

                  {/* Info dev */}
                  <div className="eq-card__info">
                    <div className="eq-card__nombre">{dev.nombre}</div><div className="eq-card__role">{dev.rol || "Desarrollo de software"}</div></div><div className="eq-card__col eq-card__load">
                    <div className="eq-card__carga-row">
                      <span className="eq-card__carga-label">Carga de trabajo</span>
                      <span className="eq-card__carga-pct" style={{ color: carga.color }}>{sinDatos ? "—" : pct + "%"}</span>
                    </div>
                    <div className="eq-carga-bar">
                      <div className="eq-carga-bar__fill" style={{ width: (sinDatos ? 0 : pct) + "%", background: carga.color }} />
                    </div>
                  </div>

                  {/* Proyecto actual */}
                  <div className="eq-card__col">
                    <div className="eq-card__col-label">Proyecto actual</div>
                    <div className="eq-card__col-val eq-card__col-val--link" title={dev.proyectoActual}>{sentenceCase(dev.proyectoActual) ?? "—"}</div>
                    <div className="eq-card__col-sub">Ahora: {dev.actividadActual ? sentenceCase(dev.actividadActual).slice(0,30) + (dev.actividadActual.length > 30 ? "…" : "") : "—"}</div>
                  </div>

                  {/* Próximo compromiso */}
                  <div className="eq-card__col">
                    <div className="eq-card__col-label"><DevIcon name="calendar" size={13}/> Próximo compromiso</div>
                    <div className="eq-card__col-val">{fmtFecha(dev.proximoCompromiso)}</div>
                    <div className="eq-card__col-sub">{sentenceCase(dev.proyectoProximo) ?? "—"}</div>
                  </div>

                  {/* Tareas activas */}
                  <div className="eq-card__col eq-card__col--center">
                    <div className="eq-card__col-label">Tareas activas</div>
                    <div className="eq-card__col-val eq-card__col-val--big">
                      <span>≡</span> {dev.tareasActivas ?? 0}
                    </div>
                  </div>

                  {/* Última actualización */}
                  <div className="eq-card__col eq-card__updated">
                    <div className="eq-card__col-label">Última actualización</div>
                    <div className="eq-card__col-val">{fmtRelativa(dev.ultimaActualizacion)}</div>
                    {dev.bloqueosActivos > 0 && (
                      <div className="eq-bloqueo-badge">
                        <DevIcon name="warning" size={11}/> {dev.bloqueosActivos} bloqueo{dev.bloqueosActivos > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="eq-card__actions">
                    <button className="eq-btn-detalle" aria-expanded={isExp} onClick={() => expand(dev)}>Ver detalle</button>
                    <button
                      className="eq-btn-expand"
                      aria-label={isExp ? "Contraer desarrollador" : "Expandir desarrollador"}
                      onClick={() => expand(dev)}
                    >
                      {isExp ? "∧" : "∨"}
                    </button>
                  </div>
                </div>

                {/* Panel expandido */}
                {isExp && (
                  <div className="eq-expand">
                    <div className="eq-expand__left">
                      <div className="eq-expand__subtitle">Proyectos asignados ({dev.proyectosActivos ?? 0})</div>
                      {!detail && <div className="eq-expand__empty">{detailErrors[dev.login] || "Cargando detalle…"}</div>}{dev.proyectosActivos === 0 && <div className="eq-expand__empty">Sin proyectos asignados activos</div>}
                      {dev.proyectosActivos > 0 && (
                        <div className="eq-proy-list">
                          {(detail?.proyectos || []).map((p, i) => (
                            <div key={p.idProyecto ?? i} className={`eq-proy-item eq-proy-item--${i % 2 ? "violet" : "mint"}`}>
                              <div className="eq-proy-icon"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 6h8"/>{i % 2 ? <path d="M8 16v-4m4 4v-2m4 2V9"/> : <><path d="M8 9h8v8H8zM11 12h2m-2 2h2"/></>}</svg></div>
                              <div className="eq-proy-info">
                                <div className="eq-proy-nombre" title={p.nombre}>{sentenceCase(p.nombre)}</div>
                                <div className="eq-proy-meta">Proyecto · {p.prioridad === 1 ? "Alta prioridad" : "Prioridad normal"}</div>
                              </div>
                              <div className="eq-proy-progress"><div className="eq-mini-bar"><div className="eq-mini-bar__fill" style={{width: Math.max(0, Math.min(p.avancePct ?? 0, 100)) + "%"}}/></div><span>{number(p.avancePct)}{p.avancePct != null && "%"}</span></div>
                              <div className="eq-proy-right"><div className="eq-proy-fecha"><DevIcon name="calendar" size={14}/> {fmtFecha(p.fechaCompromiso)}</div><div className="eq-proy-ent">{p.entregable || "Sin entregable registrado"}</div></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="eq-expand__right">
                      <div className="eq-timeline">
                        {[["done", "Qué terminó", "queTermine"], ["active", "En qué trabaja", "enQueEstoy"], ["next", "Qué sigue", "queSigue"]].map(([state, label, field]) => <div key={field} className={"eq-tl-item eq-tl-item--" + state}>
                          <span className={"eq-tl-dot eq-tl-dot--" + state}>{state === "done" ? "✓" : ""}</span>
                          <div><div className="eq-tl-label">{label}</div><div className="eq-tl-val">{!detail ? (detailErrors[dev.login] ? "No se pudo cargar el avance" : "Cargando avance…") : detail.ultimosAvances?.[0]?.[field] || "Sin actualización registrada"}</div><div className="eq-tl-meta">{detail?.ultimosAvances?.[0] ? (state === "next" ? fmtFecha(dev.proximoCompromiso) : fmtHace(detail.ultimosAvances[0].fechaRegistro)) : "—"}</div></div>
                        </div>)} 
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Panel derecho */}
        <div className="eq-col-side">
          {/* Balance del equipo */}
          <div className="eq-panel">
            <div className="eq-panel__head">
              <span className="eq-panel__title"><DevIcon name="users"/> Balance del equipo</span>
              <span className="eq-panel__sub">{data.length} integrantes</span>
            </div>
            <div className="eq-balance" aria-busy={loading}>
              {[["Horas disponibles", resumen?.horasDisponibles, availablePct, "green"], ["Horas comprometidas", resumen?.horasComprometidas, committedPct, "blue"]].map(([label, hours, pct, color]) => <div className="eq-balance__item" key={label}>
                <div className="eq-balance__label">{label}</div><div className="eq-balance__val">{number(hours)}{hours != null && " h"}</div>
                <div className="eq-balance__meter"><div className="eq-balance-bar"><div className={"eq-balance-bar__fill eq-balance-bar__fill--" + color} style={{width: Math.min(pct ?? 0, 100) + "%"}}/></div><span className="eq-balance__pct">{number(pct)}{pct != null && "%"}</span></div>
              </div>)}
            </div>
            <div className="eq-balance__total">{loading ? "Cargando balance…" : error ? "No se pudo cargar el balance." : <>Capacidad total del periodo: {number(capacity)}{capacity != null && " h"}{capacity == null && <div>Capacidad del equipo incompleta o sin registrar.</div>}</>}</div>
          </div>
          <div className="eq-panel eq-panel--blocks">
            <div className="eq-panel__head"><span className="eq-panel__title"><DevIcon name="warning"/> Bloqueos que requieren apoyo</span>{bloqueos.length > 0 && <button className="eq-panel__link" onClick={() => setShowAllBlocks(v => !v)}>{showAllBlocks ? "Ver menos" : "Ver todos (" + bloqueos.length + ")"}</button>}</div>
            {loading || error || !bloqueos.length ? <div className="eq-panel__empty" role="status">{loading ? "Cargando bloqueos…" : error ? "No se pudieron cargar los bloqueos." : "Sin bloqueos que requieran apoyo."}</div> : bloqueosApoyo.map(b => <div key={b.idBloqueo} className="eq-bloqueo-item"><div className="eq-bloqueo-item__dot"/><div className="eq-bloqueo-item__body"><div className="eq-bloqueo-item__titulo">{b.motivo || "Sin motivo registrado"}</div><div className="eq-bloqueo-item__dev">{b.dev} · {b.proyecto}</div><div className="eq-bloqueo-item__desc">{b.accionRequerida || "Sin acción requerida registrada."}</div></div><span className="eq-bloqueo-item__hace">{fmtHace(b.fecha)}</span></div>)}
          </div>


          {/* Próximos compromisos */}
          <div className="eq-panel"><div className="eq-panel__head"><span className="eq-panel__title"><DevIcon name="calendar"/> Próximos compromisos</span><span className="eq-panel__link">Ver todos</span></div>
          {data.filter(d => d.proximoCompromiso).sort((a,b) => new Date(a.proximoCompromiso) - new Date(b.proximoCompromiso)).slice(0,4).map(d => <div key={d.login} className="eq-compromiso"><div className="eq-compromiso__fecha"><span className="eq-compromiso__dia">{new Date(d.proximoCompromiso).getDate()}</span><span className="eq-compromiso__mes">{MESES[new Date(d.proximoCompromiso).getMonth()]}</span></div><div className="eq-compromiso__body"><div className="eq-compromiso__nombre">{sentenceCase(d.proyectoProximo) || "Compromiso"}</div><div className="eq-compromiso__dev">{d.nombre} · {sentenceCase(d.proyectoActual)}</div></div></div>)}
          {!data.some(d=>d.proximoCompromiso) && <div className="eq-panel__empty">Sin compromisos próximos.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
