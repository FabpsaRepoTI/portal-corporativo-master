import PlanEtapas from "./PlanEtapas";
// client/src/pages/gestionDesarrollo/components/ProyectoDrawer.jsx
// Panel lateral que muestra el expediente completo de un proyecto.
// Tabs: Resumen | Tareas | Avances | Bloqueos | Documentos
import { useState, useEffect } from "react";
import { EstatusBadge, EtapaChip, AvanceBar, PrioridadDot, FechaRelativa } from "./DevBadges";
import RegistrarAvanceModal from "./RegistrarAvanceModal";
import { getProyecto, completarTarea, cambiarEstatus } from "../../../services/gestionDesarrollo";
import "./ProyectoDrawer.css";

const TABS = [
  { id: "resumen",   label: "Resumen"   },
  { id: "tareas",    label: "Tareas"    },
  { id: "avances",   label: "Avances"   },
  { id: "bloqueos",  label: "Bloqueos"  },
  { id: "docs",      label: "Documentos"},
];

export default function ProyectoDrawer({ idProyecto, onClose, onRefresh }) {
  const [proyecto, setProyecto] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState("resumen");
  const [showAvance, setShowAvance] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getProyecto(idProyecto);
      setProyecto(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [idProyecto]);

  async function handleCompletarTarea(idTarea) {
    try { await completarTarea(idTarea); await load(); onRefresh?.(); }
    catch (e) { alert(e.message); }
  }

  if (loading) return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="pd-skeleton-wrap">
          {[1,2,3,4].map(i => <div key={i} className="pd-skeleton-line" />)}
        </div>
      </div>
    </div>
  );

  if (!proyecto) return null;

  const p = proyecto;

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-drawer" onClick={(e) => e.stopPropagation()}>
        {/* ── Head ── */}
        <div className="pd-head">
          <div className="pd-head__top">
            <span className="pd-folio">{p.folio}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <EstatusBadge id={p.idEstatus} />
              <button className="pd-close" onClick={onClose}>✕</button>
            </div>
          </div>
          <h2 className="pd-title">{p.nombre}</h2>
          {p.objetivo && <p className="pd-objetivo">{p.objetivo}</p>}
          <div className="pd-meta">
            <EtapaChip id={p.etapaActual} />
            <PrioridadDot id={p.prioridad} />
            {p.areaSolicitante && <span className="pd-area">{p.areaSolicitante}</span>}
          </div>
          <div className="pd-avance-row">
            <AvanceBar pct={p.avancePct ?? 0} esManual={p.avanceEsManual} size="lg" />
          </div>
          <div className="pd-actions">
            <button className="pd-btn pd-btn--primary" onClick={() => setShowAvance(true)}>
              + Registrar avance
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="pd-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`pd-tab ${tab === t.id ? "pd-tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === "bloqueos" && p.bloqueos?.filter(b => !b.fechaResolucion).length > 0 && (
                <span className="pd-tab__badge">
                  {p.bloqueos.filter(b => !b.fechaResolucion).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Contenido por tab ── */}
        <div className="pd-content">
          {tab === "resumen" && <PlanEtapas origen="dev" id={idProyecto}/>}
          {tab === "resumen" && (
            <div className="pd-section-list">
              <Row label="Responsable">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {p.fotoResponsable && <img src={p.fotoResponsable} alt="" className="pd-avatar" />}
                  {p.nombreResponsable ?? p.loginResponsable}
                </div>
              </Row>
              <Row label="Fecha compromiso"><FechaRelativa fecha={p.fechaCompromiso} /></Row>
              <Row label="Fecha est. liberación"><FechaRelativa fecha={p.fechaEstimadaLib} /></Row>
              <Row label="Horas reales">{p.horasReales != null ? `${Number(p.horasReales).toFixed(1)} h` : "—"}</Row>
              <Row label="Tareas">
                {p.tareas?.length > 0
                  ? `${p.tareas.filter(t => t.idEstatus === 3).length} / ${p.tareas.length} completadas`
                  : "Sin tareas definidas"}
              </Row>
              {p.motivoRiesgo && (
                <div className="pd-riesgo-alert">
                  <span>⚠</span> {p.motivoRiesgo}
                </div>
              )}
              {p.descripcion && (
                <div className="pd-descripcion">
                  <div className="pd-label">Descripción</div>
                  <p>{p.descripcion}</p>
                </div>
              )}
              {p.cierresolicitado && (
                <div className="pd-cierre-alert">
                  🔔 Cierre solicitado — pendiente de aprobación del Gerente de TI
                </div>
              )}
            </div>
          )}

          {tab === "tareas" && (
            <div className="pd-tareas">
              {(!p.tareas || p.tareas.length === 0) && (
                <div className="pd-empty">Sin tareas definidas para este proyecto.</div>
              )}
              {p.tareas?.map((t) => (
                <div key={t.idTarea} className={`pd-tarea ${t.idEstatus === 3 ? "pd-tarea--done" : ""}`}>
                  <div className="pd-tarea__check">
                    {t.idEstatus === 3
                      ? <span className="pd-check pd-check--done">✓</span>
                      : <button className="pd-check pd-check--open" onClick={() => handleCompletarTarea(t.idTarea)} title="Marcar como completada">○</button>
                    }
                  </div>
                  <div className="pd-tarea__info">
                    <div className="pd-tarea__titulo">{t.titulo}</div>
                    {t.nombreAsignado && <div className="pd-tarea__asignado">{t.nombreAsignado}</div>}
                  </div>
                  <div className="pd-tarea__right">
                    {t.fechaCompromiso && <FechaRelativa fecha={t.fechaCompromiso} />}
                    {t.esEntregable === 1 && <span className="pd-entregable">📦 Entregable</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "avances" && (
            <div className="pd-avances">
              {(!p.avances || p.avances.length === 0) && (
                <div className="pd-empty">Sin actualizaciones de avance registradas.</div>
              )}
              {p.avances?.map((a) => (
                <div key={a.idAvance} className="pd-avance-card">
                  <div className="pd-avance-card__head">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {a.fotoDesarrollador && <img src={a.fotoDesarrollador} alt="" className="pd-avatar" />}
                      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-h)" }}>
                        {a.nombreDesarrollador}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {new Date(a.fechaRegistro).toLocaleDateString("es-MX", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
                    </span>
                  </div>
                  <div className="pd-avance-card__body">
                    <AvItem label="Qué terminé"        value={a.queTermine} />
                    <AvItem label="En qué estoy"       value={a.enQueEstoy} />
                    <AvItem label="Qué sigue"          value={a.queSigue} />
                    {a.apoyoRequerido && <AvItem label="Apoyo requerido" value={a.apoyoRequerido} highlight />}
                  </div>
                  <div className="pd-avance-card__foot">
                    <span>⏱ {a.horasInvertidas} h</span>
                    <span>{a.avancePctAnterior}% → {a.avancePctNuevo}%</span>
                    {a.tieneBloqueo && <span style={{ color: "var(--danger)" }}>🔴 Bloqueo activo</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "bloqueos" && (
            <div className="pd-bloqueos">
              {(!p.bloqueos || p.bloqueos.length === 0) && (
                <div className="pd-empty">Sin bloqueos registrados.</div>
              )}
              {p.bloqueos?.map((b) => (
                <div key={b.idBloqueo} className={`pd-bloqueo ${b.fechaResolucion ? "pd-bloqueo--resuelto" : ""}`}>
                  <div className="pd-bloqueo__head">
                    <span className="pd-bloqueo__estado">
                      {b.fechaResolucion ? "✅ Resuelto" : "🔴 Activo"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {new Date(b.fechaBloqueo).toLocaleDateString("es-MX", { day:"2-digit", month:"short" })}
                    </span>
                  </div>
                  <p className="pd-bloqueo__motivo">{b.motivo}</p>
                  {b.dependeDe   && <Detail label="Depende de"  value={b.dependeDe} />}
                  {b.accionRequerida && <Detail label="Acción"  value={b.accionRequerida} />}
                </div>
              ))}
            </div>
          )}

          {tab === "docs" && (
            <div className="pd-docs">
              {(!p.archivos || p.archivos.length === 0) && (
                <div className="pd-empty">Sin documentos cargados.</div>
              )}
              {p.archivos?.map((d) => (
                <div key={d.idArchivo} className="pd-doc">
                  <div className="pd-doc__icon">📄</div>
                  <div className="pd-doc__info">
                    <div className="pd-doc__nombre">{d.nombreArchivo}</div>
                    {d.descripcionDoc && <div className="pd-doc__desc">{d.descripcionDoc}</div>}
                    <div className="pd-doc__meta">
                      {d.versionDoc && <span>v{d.versionDoc}</span>}
                      {d.subidoPor  && <span>{d.subidoPor}</span>}
                      <span>{new Date(d.fechaSubida).toLocaleDateString("es-MX")}</span>
                    </div>
                  </div>
                  <a
                    href={`/api${d.rutaServidor}`}
                    target="_blank"
                    rel="noreferrer"
                    className="pd-doc__link"
                  >↗</a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAvance && (
        <RegistrarAvanceModal
          proyecto={p}
          onClose={() => setShowAvance(false)}
          onPublicado={() => { setShowAvance(false); load(); onRefresh?.(); }}
        />
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="pd-row">
      <span className="pd-row__label">{label}</span>
      <span className="pd-row__value">{children}</span>
    </div>
  );
}
function AvItem({ label, value, highlight }) {
  if (!value) return null;
  return (
    <div className={`pd-avitem ${highlight ? "pd-avitem--hl" : ""}`}>
      <span className="pd-avitem__label">{label}</span>
      <span className="pd-avitem__value">{value}</span>
    </div>
  );
}
function Detail({ label, value }) {
  return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
      <b>{label}:</b> {value}
    </div>
  );
}
