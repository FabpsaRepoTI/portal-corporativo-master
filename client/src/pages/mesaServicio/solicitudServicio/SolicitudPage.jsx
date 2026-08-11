// src/pages/mesaServicio/SolicitudPage.jsx
import { useState, useEffect, useContext, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useServicioConfig } from "../../../hooks/useServicioConfig";
import { AuthContext } from "../../../context/AuthContext";
import "./SolicitudPage.css";

/* ─── Helpers ────────────────────────────────────────────────────── */
function formatMinutos(min) {
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} hrs`;
  return `${Math.round(min / 1440)} días`;
}
function formatFechaCorta() {
  return new Date().toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ─── Pantalla de éxito ──────────────────────────────────────────── */
function PantallaExito({ folio, config, onNueva }) {
  const navigate = useNavigate();
  const color = config?.colorPrimario ?? "#7c3aed";
  return (
    <div className="sp-exito">
      <div className="sp-exito__card">
        <div
          className="sp-exito__icono"
          style={{ background: `${color}1a`, color }}
        >
          <i className="ti ti-circle-check" />
        </div>
        <h2 className="sp-exito__titulo">¡Solicitud registrada!</h2>
        <p className="sp-exito__folio">
          Folio: <span style={{ color }}>{folio}</span>
        </p>
        <p className="sp-exito__desc">
          Tu reporte fue enviado correctamente. El equipo de Sistemas lo
          atenderá dentro del tiempo de respuesta establecido.
        </p>
        <div className="sp-exito__acciones">
          <button className="sp-btn sp-btn--ghost" onClick={onNueva}>
            <i className="ti ti-plus" /> Nuevo reporte
          </button>
          <button
            className="sp-btn sp-btn--ghost"
            onClick={() => navigate("/mesa-de-servicio")}
          >
            <i className="ti ti-arrow-left" /> Mesa de Servicio
          </button>
          <button
            className="sp-btn sp-btn--primary"
            style={{ background: color, borderColor: color }}
            onClick={() => navigate("/mesa-de-servicio/mis-solicitudes")}
          >
            <i className="ti ti-list" /> Ver mis solicitudes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────── */
function SkeletonForm() {
  return (
    <div className="sp-skeleton">
      <div className="sp-skeleton__header" />
      <div className="sp-skeleton__body">
        {["md", "sm", "lg", "xl", "md"].map((s, i) => (
          <div
            key={i}
            className={`sp-skeleton__line sp-skeleton__line--${s}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Stepper ────────────────────────────────────────────────────── */
function Stepper({ paso, color }) {
  const pasos = ["Categoría", "Detalle", "Confirmación"];
  return (
    <div className="sp-stepper">
      {pasos.map((label, i) => {
        const num = i + 1;
        const done = num < paso;
        const active = num === paso;
        return (
          <div key={label} className="sp-stepper__item">
            <div
              className={`sp-stepper__circle${done ? " sp-stepper__circle--done" : ""}${active ? " sp-stepper__circle--active" : ""}`}
              style={
                done || active
                  ? { background: color, borderColor: color, color: "#fff" }
                  : {}
              }
            >
              {done ? <i className="ti ti-check" /> : num}
            </div>
            <span
              className={`sp-stepper__label${active ? " sp-stepper__label--active" : ""}`}
              style={active ? { color } : {}}
            >
              {label}
            </span>
            {i < pasos.length - 1 && (
              <div
                className={`sp-stepper__line${done ? " sp-stepper__line--done" : ""}`}
                style={done ? { background: color } : {}}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Upload de evidencia ────────────────────────────────────────── */
function EvidenciaUpload({ color, archivos, onArchivos }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  function agregarArchivos(nuevos) {
    const lista = Array.from(nuevos).filter((f) => {
      const ok = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
      ].includes(f.type);
      return ok && f.size <= 5 * 1024 * 1024;
    });
    // máximo 5 archivos en total
    onArchivos((prev) => [...prev, ...lista].slice(0, 5));
  }

  function quitarArchivo(idx) {
    onArchivos((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleDrop(e) {
    e.preventDefault();
    setDrag(false);
    agregarArchivos(e.dataTransfer.files);
  }

  return (
    <div className="sp-evidencia-wrap">
      <div
        className={`sp-evidencia${drag ? " sp-evidencia--drag" : ""}`}
        style={drag ? { borderColor: color } : {}}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <i className="ti ti-cloud-upload sp-evidencia__icon" />
        <p className="sp-evidencia__texto">
          Arrastra una imagen o captura de pantalla
        </p>
        <p className="sp-evidencia__hint">
          PNG, JPG · Máx. 5 MB · hasta 5 archivos
        </p>
        <button
          type="button"
          className="sp-evidencia__btn"
          style={{ borderColor: color, color }}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          <i className="ti ti-upload" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => agregarArchivos(e.target.files)}
        />
      </div>

      {archivos.length > 0 && (
        <div className="sp-archivos-lista">
          {archivos.map((f, i) => (
            <div key={i} className="sp-archivo-item">
              <i className="ti ti-file-check" style={{ color }} />
              <span className="sp-archivo-nombre">{f.name}</span>
              <span className="sp-archivo-size">
                {(f.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                className="sp-archivo-quitar"
                onClick={() => quitarArchivo(i)}
              >
                <i className="ti ti-x" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Componente principal ───────────────────────────────────────── */
export default function SolicitudPage() {
  //const { slug } = useParams();
  //console.log("Slug:", slug);
  const params = useParams();
  const { slug } = params;

  //console.log("PATH:", window.location.pathname);
  //console.log("PARAMS:", params);
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const { config, loading, error } = useServicioConfig(slug);

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState(null);
  const [prioridadObj, setPrioridadObj] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [errores, setErrores] = useState({}); // { titulo, descripcion, general }
  const [folio, setFolio] = useState(null);
  const [fechaActual] = useState(formatFechaCorta());

  /* Reset al cambiar slug */
  useEffect(() => {
    setTitulo("");
    setDescripcion("");
    setPrioridad(null);
    setPrioridadObj(null);
    setArchivos([]);
    setErrores({});
    setFolio(null);
  }, [slug]);

  useEffect(() => {
    if (config?.comportamiento?.tituloAutofill)
      setTitulo(config.comportamiento.tituloAutofill);
  }, [config]);

  useEffect(() => {
    if (config?.prioridadDefault) {
      setPrioridad(config.prioridadDefault.idPrioridad);
      setPrioridadObj(config.prioridadDefault);
    }
  }, [config]);

  /* ── Validación frontend ── */
  function validar() {
    const e = {};
    if (!titulo.trim()) e.titulo = "El título del incidente es obligatorio.";
    if (!descripcion.trim())
      e.descripcion = "Por favor describe el problema antes de enviar.";
    return e;
  }

  /* ── Submit ── */
  async function handleSubmit(ev) {
    ev?.preventDefault();
    const e = validar();
    if (Object.keys(e).length) {
      setErrores(e);
      return;
    }

    setSubmitting(true);
    setErrores({});
    const token = localStorage.getItem("fabpsa_token");

    try {
      // Usamos FormData para enviar archivos + campos juntos
      const fd = new FormData();
      fd.append("slug", slug);
      fd.append("titulo", titulo.trim());
      fd.append("descripcion", descripcion.trim());
      if (prioridad) fd.append("idPrioridad", prioridad);
      archivos.forEach((f) => fd.append("archivos", f));

      const API_BASE =
        window.location.hostname === "192.168.16.198"
          ? "http://192.168.16.198:3001"
          : "";

      const res = await fetch(`${API_BASE}/api/solicitudes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        // NO pongas Content-Type — el browser lo pone con el boundary correcto
        body: fd,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrores({
          general:
            data.message ??
            "Ocurrió un problema al enviar tu solicitud. Intenta de nuevo.",
        });
        return;
      }

      setFolio(data.folio);
    } catch {
      setErrores({
        general:
          "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleNuevaSolicitud() {
    setFolio(null);
    setTitulo("");
    setDescripcion("");
    setArchivos([]);
    setErrores({});
    setPrioridad(config?.prioridadDefault?.idPrioridad ?? null);
    setPrioridadObj(config?.prioridadDefault ?? null);
  }

  /* ── Estados de carga ── */
  if (loading)
    return (
      <div className="sp-wrapper">
        <SkeletonForm />
      </div>
    );

  if (error)
    return (
      <div className="sp-wrapper">
        <div className="sp-error">
          <i className="ti ti-alert-triangle" />
          <p>No se pudo cargar el formulario.</p>
          <button className="sp-btn sp-btn--ghost" onClick={() => navigate(-1)}>
            Regresar
          </button>
        </div>
      </div>
    );

  if (!config) return null;

  if (folio)
    return (
      <div className="sp-wrapper">
        <PantallaExito
          folio={folio}
          config={config}
          onNueva={handleNuevaSolicitud}
        />
      </div>
    );

  /* ── Alias ── */
  const color = config.colorPrimario;
  const colorBg = `${color}15`;
  const mostrarPrio = config.comportamiento?.mostrarPrioridad;
  const autofill = !!config.comportamiento?.tituloAutofill;
  const sla = config.prioridadDefault;
  const form = config.form ?? {};
  const prioActiva = prioridadObj ?? sla;

  return (
    <div className="sp-wrapper">
      {/* ── Breadcrumb ── */}
      <nav className="sp-breadcrumb">
        <button
          onClick={() => navigate("/mesa-de-servicio")}
          className="sp-breadcrumb__link"
        >
          <i className="ti ti-layout-dashboard" /> Mesa de Servicio
        </button>
        <i className="ti ti-chevron-right sp-breadcrumb__sep" />
        <span className="sp-breadcrumb__current">
          {form.titulo ?? "Nueva solicitud"}
        </span>
      </nav>

      {/* ── Header ── */}
      <div className="sp-header-bar">
        <div className="sp-header-bar__left">
          <div
            className="sp-header-bar__icon"
            style={{ background: colorBg, color }}
          >
            <i className={`ti ${config.icono ?? "ti-ticket"}`} />
          </div>
          <div>
            <p className="sp-header-bar__eyebrow">
              MESA DE SERVICIO ·{" "}
              <span style={{ color }}>{config.nombre?.toUpperCase()}</span>
            </p>
            <h1 className="sp-header-bar__titulo">
              {form.titulo ?? "Nueva solicitud"}
            </h1>
            {form.subtitulo && (
              <p className="sp-header-bar__sub">{form.subtitulo}</p>
            )}
          </div>
        </div>
        <div className="sp-header-bar__folio">
          <span className="sp-header-bar__folio-label">
            <i className="ti ti-hash" /> Folio asignado
          </span>
          <span className="sp-header-bar__folio-num" style={{ color }}>
            —
          </span>
          <span className="sp-header-bar__folio-hint">
            Generado automáticamente al enviar
          </span>
        </div>
      </div>

      {/* ── Stepper ── */}
      <Stepper paso={2} color={color} />

      {/* ── Layout ── */}
      <div className="sp-layout">
        {/* ══ COLUMNA PRINCIPAL ══ */}
        <div className="sp-col-main">
          <div className="sp-card">
            <div className="sp-form-inner">
              {/* Chip categoría */}
              {autofill && (
                <div
                  className="sp-cat-chip"
                  style={{
                    background: colorBg,
                    color,
                    borderColor: `${color}40`,
                  }}
                >
                  <i className={`ti ${config.icono ?? "ti-tag"}`} />{" "}
                  {config.nombre}
                </div>
              )}

              <div className="sp-section-title">Cuéntanos qué está pasando</div>
              {form.descripcion && (
                <p className="sp-section-hint">{form.descripcion}</p>
              )}

              {/* Título */}
              <div
                className={`sp-field${errores.titulo ? " sp-field--error" : ""}`}
              >
                <label className="sp-label" htmlFor="sp-titulo">
                  Título del problema <span className="sp-required">*</span>
                </label>
                <input
                  id="sp-titulo"
                  className="sp-input"
                  type="text"
                  value={titulo}
                  onChange={(e) => {
                    setTitulo(e.target.value);
                    setErrores((p) => ({ ...p, titulo: "" }));
                  }}
                  placeholder={
                    form.placeholderTitulo ?? "Describe brevemente el problema"
                  }
                  maxLength={120}
                  readOnly={autofill}
                  style={
                    autofill
                      ? { color: "var(--text-muted)", cursor: "default" }
                      : {}
                  }
                />
                {errores.titulo && (
                  <span className="sp-field-error">
                    <i className="ti ti-alert-circle" />
                    {errores.titulo}
                  </span>
                )}
              </div>

              {/* Descripción */}
              <div
                className={`sp-field${errores.descripcion ? " sp-field--error" : ""}`}
              >
                <label className="sp-label" htmlFor="sp-desc">
                  Descripción detallada <span className="sp-required">*</span>
                </label>
                <textarea
                  id="sp-desc"
                  className="sp-textarea"
                  value={descripcion}
                  onChange={(e) => {
                    setDescripcion(e.target.value);
                    setErrores((p) => ({ ...p, descripcion: "" }));
                  }}
                  placeholder={
                    form.placeholderDesc ??
                    "¿Qué ocurrió? ¿Desde cuándo? ¿Qué equipo o sistema está afectado?"
                  }
                  rows={4}
                  maxLength={1000}
                />
                <div className="sp-field-footer">
                  {errores.descripcion ? (
                    <span className="sp-field-error">
                      <i className="ti ti-alert-circle" />
                      {errores.descripcion}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="sp-char-count">
                    {descripcion.length} / 1000
                  </span>
                </div>
              </div>

              {/* Prioridad */}
              {mostrarPrio && config.prioridades?.length > 0 && (
                <div className="sp-field">
                  <label className="sp-label">
                    Prioridad <span className="sp-required">*</span>
                  </label>
                  <div className="sp-prio-grid">
                    {config.prioridades.map((p) => {
                      const active = prioridad === p.idPrioridad;
                      return (
                        <button
                          key={p.idPrioridad}
                          type="button"
                          className={`sp-prio-btn${active ? " sp-prio-btn--active" : ""}`}
                          style={
                            active
                              ? {
                                  borderColor: p.colorHex,
                                  background: `${p.colorHex}15`,
                                  color: p.colorHex,
                                }
                              : {}
                          }
                          onClick={() => {
                            setPrioridad(p.idPrioridad);
                            setPrioridadObj(p);
                          }}
                        >
                          <i
                            className="sp-prio-dot"
                            style={{ background: p.colorHex }}
                          />
                          <span className="sp-prio-nombre">{p.nombre}</span>
                          <span className="sp-prio-desc">
                            {p.descripcion ?? ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {prioActiva && (
                    <div
                      className="sp-sla-inline"
                      style={{
                        borderColor: `${prioActiva.color ?? color}40`,
                        background: `${prioActiva.color ?? color}0d`,
                      }}
                    >
                      <i
                        className="ti ti-clock"
                        style={{ color: prioActiva.color ?? color }}
                      />
                      <span style={{ color: prioActiva.color ?? color }}>
                        Tiempo de respuesta estimado para prioridad{" "}
                        {prioActiva.nombre}&nbsp;·&nbsp;
                        <strong>
                          {formatMinutos(prioActiva.slaRespuestaMin)}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Ayuda contextual */}
              {form.ayudaContextual && (
                <div className="sp-ayuda" style={{ borderLeftColor: color }}>
                  <i className="ti ti-info-circle" style={{ color }} />
                  <p>{form.ayudaContextual}</p>
                </div>
              )}

              {/* Evidencia — dentro del card, compacta */}
              <div className="sp-field">
                <label className="sp-label">
                  Evidencia <span className="sp-label-opt">(opcional)</span>
                </label>
                <EvidenciaUpload
                  color={color}
                  archivos={archivos}
                  onArchivos={setArchivos}
                />
              </div>

              {/* Error general */}
              {errores.general && (
                <div className="sp-submit-error">
                  <i className="ti ti-alert-circle" /> {errores.general}
                </div>
              )}

              {/* Botones dentro del card */}
              <div className="sp-footer-btns">
                <button
                  type="button"
                  className="sp-btn sp-btn--ghost"
                  onClick={() => navigate(-1)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="sp-btn sp-btn--primary"
                  disabled={submitting}
                  style={{ background: color, borderColor: color }}
                  onClick={handleSubmit}
                >
                  {submitting ? (
                    <>
                      <i className="ti ti-loader-2 sp-spin" /> Enviando…
                    </>
                  ) : (
                    <>
                      <i className="ti ti-send" /> Enviar reporte
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ══ SIDEBAR ══ */}
        <aside className="sp-sidebar">
          {/* Resumen */}
          <div className="sp-sidebar-card">
            <div className="sp-sidebar-card__head">
              <i className="ti ti-info-circle" />
              <span>Resumen de solicitud</span>
            </div>
            <div className="sp-sidebar-card__body">
              <div className="sp-resumen-row">
                <span className="sp-resumen-label">Estatus</span>
                <span className="sp-resumen-badge sp-resumen-badge--abierto">
                  ● Abierto
                </span>
              </div>
              <div className="sp-resumen-row">
                <span className="sp-resumen-label">Categoría</span>
                <span className="sp-resumen-val">{config.nombre}</span>
              </div>
              {prioActiva && (
                <div className="sp-resumen-row">
                  <span className="sp-resumen-label">Prioridad</span>
                  <span
                    className="sp-resumen-val"
                    style={{
                      color: prioActiva.color ?? color,
                      fontWeight: 600,
                    }}
                  >
                    {prioActiva.nombre}
                  </span>
                </div>
              )}
              <div className="sp-resumen-row">
                <span className="sp-resumen-label">Sitio</span>
                <span className="sp-resumen-val">{user?.sitio ?? "—"}</span>
              </div>
              <div className="sp-resumen-row">
                <span className="sp-resumen-label">Fecha</span>
                <span className="sp-resumen-val">{fechaActual}</span>
              </div>
            </div>
            {sla && (
              <div className="sp-resolucion">
                <div className="sp-resolucion__head" style={{ color }}>
                  <i className="ti ti-clock" style={{ color }} /> Resolución
                  estimada
                </div>
                <div className="sp-resolucion__val">
                  Antes de las {formatMinutos(sla.slaResolucionMin)}
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="sp-sidebar-card">
            <div className="sp-sidebar-card__head">
              <i className="ti ti-bulb" />
              <span>Tips para una respuesta más rápida</span>
            </div>
            <div className="sp-tips-list">
              {[
                {
                  icon: "ti-align-left",
                  text: "Describe desde cuándo ocurre el problema y si afecta a más personas.",
                },
                {
                  icon: "ti-camera",
                  text: "Adjunta una captura de pantalla o foto del error visible.",
                },
                {
                  icon: "ti-device-laptop",
                  text: "Incluye el nombre de tu equipo o número de serie si lo sabes.",
                },
              ].map((tip, i) => (
                <div key={i} className="sp-tip-item">
                  <div
                    className="sp-tip-item__icon"
                    style={{ background: colorBg, color }}
                  >
                    <i className={`ti ${tip.icon}`} />
                  </div>
                  <p className="sp-tip-item__text">{tip.text}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
