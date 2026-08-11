// src/pages/mesaServicio/NuevoDesarrolloPage.jsx  v2
// Layout sin scroll · acento índigo · previews de archivos
import { useState, useEffect, useContext, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import "./NuevoDesarrolloPage.css";

/* ── Pantalla de éxito ──────────────────────────────────────── */
function PantallaExito({ folio, onNueva }) {
  const navigate = useNavigate();
  return (
    <div className="nd-exito">
      <div className="nd-exito__card">
        <div className="nd-exito__check">
          <i className="ti ti-circle-check" />
        </div>
        <h2>Solicitud registrada</h2>
        <div className="nd-exito__folio">{folio}</div>
        <p className="nd-exito__desc">
          El equipo de Sistemas revisará tu solicitud y te notificará cuando sea
          asignada a un ingeniero.
        </p>
        <div className="nd-proceso">
          {["Recepción", "Evaluación", "Planificación", "Desarrollo"].map(
            (s, i) => (
              <div
                key={s}
                className={`nd-proceso__step${i === 0 ? " active" : ""}`}
              >
                <div className="nd-proceso__dot" />
                <span>{s}</span>
              </div>
            ),
          )}
        </div>
        <div className="nd-exito__btns">
          {/* Acción principal — muy visible */}
          <button
            className="nd-exito__btn-primary"
            onClick={() => navigate("/mesa-de-servicio/mis-solicitudes")}
          >
            <i className="ti ti-list" /> Ver mis solicitudes
          </button>
          {/* Acciones secundarias */}
          <div className="nd-exito__btns-secondary">
            <button className="nd-exito__btn-secondary" onClick={onNueva}>
              <i className="ti ti-plus" /> Nueva solicitud
            </button>
            <button
              className="nd-exito__btn-secondary"
              onClick={() => navigate("/mesa-de-servicio")}
            >
              <i className="ti ti-arrow-left" /> Mesa de Servicio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Preview de archivo ─────────────────────────────────────── */
function FileCard({ archivo, onRemove }) {
  const [preview, setPreview] = useState(null);
  const ext = archivo.name.split(".").pop().toLowerCase();
  const isImg = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
  const isPdf = ext === "pdf";
  const isXlsx = ["xlsx", "xls", "csv"].includes(ext);
  const isDocx = ["docx", "doc"].includes(ext);

  useEffect(() => {
    if (isImg) {
      const url = URL.createObjectURL(archivo);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [archivo, isImg]);

  const sizeKb =
    archivo.size < 1024 * 1024
      ? `${(archivo.size / 1024).toFixed(0)} KB`
      : `${(archivo.size / (1024 * 1024)).toFixed(1)} MB`;

  function iconInfo() {
    if (isPdf)
      return { icon: "ti-file-type-pdf", color: "#dc2626", label: "PDF" };
    if (isXlsx) return { icon: "ti-table", color: "#16a34a", label: "XLSX" };
    if (isDocx)
      return { icon: "ti-file-word", color: "#2563eb", label: "DOCX" };
    return { icon: "ti-file", color: "#6b7280", label: ext.toUpperCase() };
  }
  const { icon, color, label } = iconInfo();

  return (
    <div className="nd-file-card">
      <div className="nd-file-card__thumb">
        {isImg && preview ? (
          <img src={preview} alt={archivo.name} className="nd-file-card__img" />
        ) : (
          <div
            className="nd-file-card__icon-wrap"
            style={{ background: color + "15" }}
          >
            <i className={`ti ${icon}`} style={{ color }} />
            <span className="nd-file-card__ext" style={{ color }}>
              {label}
            </span>
          </div>
        )}
      </div>
      <div className="nd-file-card__info">
        <span className="nd-file-card__name" title={archivo.name}>
          {archivo.name.length > 22
            ? archivo.name.slice(0, 19) + "…"
            : archivo.name}
        </span>
        <span className="nd-file-card__size">{sizeKb}</span>
      </div>
      <button
        type="button"
        className="nd-file-card__remove"
        onClick={onRemove}
        title="Eliminar"
      >
        <i className="ti ti-x" />
      </button>
    </div>
  );
}

/* ── Drop zone ──────────────────────────────────────────────── */
function DropZone({ archivos, onArchivos }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const agregar = useCallback(
    (nuevos) => {
      const validos = Array.from(nuevos).filter(
        (f) => f.size <= 10 * 1024 * 1024,
      );
      onArchivos((prev) => [...prev, ...validos].slice(0, 5));
    },
    [onArchivos],
  );

  const canAdd = archivos.length < 5;

  return (
    <div className="nd-dropzone-wrap">
      {/* Zona de drop — solo si hay espacio */}
      {canAdd && (
        <div
          className={`nd-dropzone${drag ? " nd-dropzone--drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            agregar(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <i className="ti ti-cloud-upload nd-dropzone__icon" />
          <p className="nd-dropzone__label">
            Arrastra tus archivos aquí o <span>haz clic para seleccionar</span>
          </p>
          <p className="nd-dropzone__hint">
            PDF, PNG, JPG, XLSX, DOCX, PPTX, ZIP · Máx. 10 MB por archivo ·
            Hasta 5 archivos
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => agregar(e.target.files)}
          />
        </div>
      )}

      {/* Grid de previews */}
      {archivos.length > 0 && (
        <div className="nd-files-grid">
          {archivos.map((f, i) => (
            <FileCard
              key={i}
              archivo={f}
              onRemove={() => onArchivos((p) => p.filter((_, j) => j !== i))}
            />
          ))}
          {canAdd && archivos.length > 0 && (
            <button
              type="button"
              className="nd-file-add"
              onClick={() => inputRef.current?.click()}
            >
              <i className="ti ti-plus" />
              <span>Agregar más archivos</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Componente principal ───────────────────────────────────── */
export default function NuevoDesarrolloPage() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [catalogos, setCatalogos] = useState({ tipos: [], sistemas: [] });
  const [loadingCat, setLoadingCat] = useState(true);

  /* Estado del formulario */
  const [idTipo, setIdTipo] = useState("");
  const [idSistema, setIdSistema] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [beneficio, setBeneficio] = useState("");
  const [archivos, setArchivos] = useState([]);

  const [errores, setErrores] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [folio, setFolio] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("fabpsa_token");
    fetch("/api/solicitudes-desarrollo/catalogos", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.tipos) setCatalogos(d);
      })
      .finally(() => setLoadingCat(false));
  }, []);

  function validar() {
    const e = {};
    if (!idTipo) e.idTipo = "Selecciona el tipo de solicitud.";
    if (!idSistema) e.idSistema = "Indica el sistema involucrado.";
    if (!titulo.trim()) e.titulo = "El nombre del desarrollo es obligatorio.";
    if (!descripcion.trim()) e.descripcion = "Describe la necesidad.";
    return e;
  }

  async function handleSubmit() {
    const e = validar();
    if (Object.keys(e).length) {
      setErrores(e);
      return;
    }

    setSubmitting(true);
    setErrores({});
    const token = localStorage.getItem("fabpsa_token");

    try {
      const fd = new FormData();
      fd.append("idTipo", idTipo);
      fd.append("idDesarrollo", idSistema);
      fd.append("titulo", titulo.trim());
      fd.append("descripcion", descripcion.trim());
      fd.append("objetivo", descripcion.trim());
      fd.append("justificacion", descripcion.trim());
      fd.append("idPrioridad", "1"); // prioridad por defecto — la asigna Sistemas
      if (beneficio.trim()) fd.append("beneficioEsperado", beneficio.trim());
      archivos.forEach((f) => fd.append("archivos", f));

      const res = await fetch("/api/solicitudes-desarrollo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        setErrores({
          general: data.message || "Error al enviar la solicitud.",
        });
        return;
      }
      setFolio(data.folio);
    } catch {
      setErrores({ general: "No se pudo conectar con el servidor." });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setIdTipo("");
    setIdSistema("");
    setTitulo("");
    setDescripcion("");
    setBeneficio("");
    setArchivos([]);
    setErrores({});
    setFolio(null);
  }

  if (folio) return <PantallaExito folio={folio} onNueva={resetForm} />;

  const sistemaSeleccionado = catalogos.sistemas.find(
    (s) => String(s.id) === String(idSistema),
  );
  const tipoSeleccionado = catalogos.tipos.find(
    (t) => String(t.idTipo) === String(idTipo),
  );

  /* Tipos hardcodeados con descripción si el catálogo no trae código */
  function tipoDesc(t) {
    if (t.codigo === "ND" || t.nombre?.toLowerCase().includes("nuevo"))
      return "Solicito un desarrollo completamente nuevo.";
    return "Solicito una mejora o actualización de funcionalidad existente.";
  }
  function tipoIcon(t) {
    if (t.codigo === "ND" || t.nombre?.toLowerCase().includes("nuevo"))
      return "ti-sparkles";
    return "ti-refresh";
  }

  return (
    <div className="nd-root">
      {/* ── Encabezado de página ── */}
      <header className="nd-page-header">
        <nav className="nd-breadcrumb">
          <button
            className="nd-breadcrumb__link"
            onClick={() => navigate("/mesa-de-servicio")}
          >
            <i className="ti ti-layout-dashboard" /> Mesa de Servicio
          </button>
          <i className="ti ti-chevron-right nd-breadcrumb__sep" />
          <span>Desarrollo de Software</span>
          <i className="ti ti-chevron-right nd-breadcrumb__sep" />
          <span className="nd-breadcrumb__current">Nueva solicitud</span>
        </nav>
        <div className="nd-page-header__body">
          <div className="nd-page-header__icon">
            <i className="ti ti-code" />
          </div>
          <div>
            <h1 className="nd-page-header__title">
              Solicitar desarrollo de software
            </h1>
            <p className="nd-page-header__sub">
              Cuéntanos qué necesitas y el equipo de Sistemas evaluará tu
              solicitud.
            </p>
          </div>
        </div>
      </header>

      {loadingCat ? (
        <div className="nd-loading">
          <div className="nd-spinner" />
        </div>
      ) : (
        <>
          <div className="nd-layout">
            {/* ══════════════════════════════
              COLUMNA PRINCIPAL
          ══════════════════════════════ */}
            <main className="nd-main">
              {/* ── Sección 1: Información del desarrollo ── */}
              <section className="nd-section">
                <h2 className="nd-section__title">
                  <span className="nd-section__num">1</span>
                  Información del desarrollo
                </h2>

                <div className="nd-row-2">
                  {/* Nombre */}
                  <div
                    className={`nd-field${errores.titulo ? " nd-field--err" : ""}`}
                  >
                    <label className="nd-label">
                      Nombre del desarrollo <span className="nd-req">*</span>
                    </label>
                    <input
                      className="nd-input"
                      type="text"
                      maxLength={200}
                      placeholder="Ej. Módulo de reportes gerenciales"
                      value={titulo}
                      onChange={(e) => {
                        setTitulo(e.target.value);
                        setErrores((p) => ({ ...p, titulo: "" }));
                      }}
                    />
                    {errores.titulo && (
                      <span className="nd-err-msg">
                        <i className="ti ti-alert-circle" />
                        {errores.titulo}
                      </span>
                    )}
                  </div>

                  {/* Sistema */}
                  <div
                    className={`nd-field${errores.idSistema ? " nd-field--err" : ""}`}
                  >
                    <label className="nd-label">
                      ¿Sobre qué sistema necesitas el desarrollo?{" "}
                      <span className="nd-req">*</span>
                    </label>
                    <select
                      className="nd-select"
                      value={idSistema}
                      onChange={(e) => {
                        setIdSistema(e.target.value);
                        setErrores((p) => ({ ...p, idSistema: "" }));
                      }}
                    >
                      <option value="">Selecciona un sistema</option>
                      {catalogos.sistemas.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.desarrollo}
                        </option>
                      ))}
                    </select>
                    {errores.idSistema && (
                      <span className="nd-err-msg">
                        <i className="ti ti-alert-circle" />
                        {errores.idSistema}
                      </span>
                    )}
                  </div>
                </div>

                {/* Tipo de solicitud */}
                <div
                  className={`nd-field${errores.idTipo ? " nd-field--err" : ""}`}
                  style={{ marginTop: 16 }}
                >
                  <label className="nd-label">
                    Tipo de solicitud <span className="nd-req">*</span>
                  </label>
                  <div className="nd-tipo-grid">
                    {catalogos.tipos.map((t) => {
                      const active = String(idTipo) === String(t.idTipo);
                      return (
                        <button
                          key={t.idTipo}
                          type="button"
                          className={`nd-tipo-card${active ? " nd-tipo-card--active" : ""}`}
                          onClick={() => {
                            setIdTipo(String(t.idTipo));
                            setErrores((p) => ({ ...p, idTipo: "" }));
                          }}
                        >
                          <div className="nd-tipo-card__radio">
                            <div
                              className={`nd-radio-dot${active ? " nd-radio-dot--on" : ""}`}
                            />
                          </div>
                          <div className="nd-tipo-card__icon">
                            <i className={`ti ${tipoIcon(t)}`} />
                          </div>
                          <div className="nd-tipo-card__text">
                            <strong>{t.nombre}</strong>
                            <span>{tipoDesc(t)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {errores.idTipo && (
                    <span className="nd-err-msg">
                      <i className="ti ti-alert-circle" />
                      {errores.idTipo}
                    </span>
                  )}
                </div>
              </section>

              {/* ── Sección 2: Descripción de la necesidad ── */}
              <section className="nd-section">
                <h2 className="nd-section__title">
                  <span className="nd-section__num">2</span>
                  Descripción de la necesidad
                </h2>
                <p className="nd-section__sub">
                  Describe qué necesitas, qué problema deseas resolver o qué
                  debería hacer el desarrollo.
                </p>

                <div
                  className={`nd-field${errores.descripcion ? " nd-field--err" : ""}`}
                >
                  <textarea
                    className="nd-textarea"
                    rows={5}
                    maxLength={3000}
                    placeholder="Ej. Necesitamos automatizar el proceso de aprobación de órdenes de compra para reducir tiempos y errores manuales..."
                    value={descripcion}
                    onChange={(e) => {
                      setDescripcion(e.target.value);
                      setErrores((p) => ({ ...p, descripcion: "" }));
                    }}
                  />
                  <div className="nd-field-footer">
                    {errores.descripcion ? (
                      <span className="nd-err-msg">
                        <i className="ti ti-alert-circle" />
                        {errores.descripcion}
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="nd-char">{descripcion.length} / 3000</span>
                  </div>
                </div>

                <div className="nd-field" style={{ marginTop: 12 }}>
                  <label className="nd-label">
                    Beneficio esperado{" "}
                    <span className="nd-opt">(opcional)</span>
                  </label>
                  <p className="nd-label-hint">
                    ¿Qué mejoras operativas o de tiempo esperas obtener?
                  </p>
                  <textarea
                    className="nd-textarea"
                    rows={3}
                    maxLength={1500}
                    placeholder="Ej. Reducción del tiempo de aprobación en 50% y eliminación de tareas repetitivas."
                    value={beneficio}
                    onChange={(e) => setBeneficio(e.target.value)}
                  />
                  <div className="nd-field-footer">
                    <span />
                    <span className="nd-char">{beneficio.length} / 1500</span>
                  </div>
                </div>
              </section>

              {/* ── Sección 3: Documentos de referencia ── */}
              <section className="nd-section">
                <h2 className="nd-section__title">
                  <span className="nd-section__num">3</span>
                  Documentos de referencia
                  <span className="nd-section__opt">opcional</span>
                </h2>
                <p className="nd-section__sub">
                  Adjunta cualquier documento, imagen, diagrama o evidencia que
                  ayude a entender mejor tu solicitud.
                </p>
                <DropZone archivos={archivos} onArchivos={setArchivos} />
              </section>

              {/* Error general */}
              {errores.general && (
                <div className="nd-err-banner">
                  <i className="ti ti-alert-circle" /> {errores.general}
                </div>
              )}
            </main>

            {/* ══════════════════════════════
              SIDEBAR
          ══════════════════════════════ */}
            <aside className="nd-sidebar">
              {/* Resumen de la solicitud */}
              <div className="nd-sidebar-card">
                <div className="nd-sidebar-card__head">
                  Resumen de la solicitud
                </div>
                <div className="nd-sidebar-card__body">
                  <div className="nd-summary-row">
                    <span>Solicitante</span>
                    <strong>{user?.name || "—"}</strong>
                  </div>
                  <div className="nd-summary-row">
                    <span>Área</span>
                    <strong>{user?.area || "—"}</strong>
                  </div>
                  <div className="nd-summary-row">
                    <span>Sistema</span>
                    <strong>{sistemaSeleccionado?.desarrollo || "—"}</strong>
                  </div>
                  <div className="nd-summary-row">
                    <span>Tipo de solicitud</span>
                    <strong>{tipoSeleccionado?.nombre || "—"}</strong>
                  </div>
                  <div className="nd-summary-row">
                    <span>Fecha y hora</span>
                    <strong>
                      {new Date().toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="nd-sidebar-card">
                <div className="nd-sidebar-card__head">
                  Antes de enviar, recuerda…
                </div>
                <div className="nd-sidebar-card__body nd-tips">
                  {[
                    {
                      icon: "ti-target",
                      text: "Define claramente qué debe hacer el sistema, no cómo hacerlo.",
                    },
                    {
                      icon: "ti-users",
                      text: "Menciona quiénes usarán el desarrollo y con qué frecuencia.",
                    },
                    {
                      icon: "ti-arrows-exchange",
                      text: "Indica si debe integrarse con otro sistema existente.",
                    },
                    {
                      icon: "ti-calendar",
                      text: "Si tienes una fecha límite operativa, menciónala en la descripción.",
                    },
                  ].map((t, i) => (
                    <div key={i} className="nd-tip">
                      <div className="nd-tip__icon">
                        <i className={`ti ${t.icon}`} />
                      </div>
                      <p>{t.text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="nd-btn nd-btn--ghost"
                onClick={() => navigate(-1)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="nd-btn nd-btn--primary"
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <i className="ti ti-loader-2 nd-spin" /> Enviando…
                  </>
                ) : (
                  <>
                    <i className="ti ti-send" /> Enviar solicitud
                  </>
                )}
              </button>
            </aside>
          </div>

          {/* ── Footer bar fijo — FUERA del grid, siempre visible ── */}
          <div className="nd-footer-bar">
            <div className="nd-footer-bar__hint">
              <i className="ti ti-info-circle" />
              Tu solicitud será revisada por Sistemas y te notificaremos cuando
              sea asignada.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
