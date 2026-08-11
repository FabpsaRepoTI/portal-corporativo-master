import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCatalogo,
  enviarSolicitud,
} from "../../../services/hardwareService";
import { AuthContext } from "../../../context/AuthContext";
import "./HardwareSolicitudes.css";

export const MOTIVOS = [
  "Necesito un equipo nuevo",
  "Mi equipo ya no funciona correctamente",
  "Mi equipo es insuficiente para mis actividades",
  "Solo necesito el equipo por un tiempo",
];

export const ICON_MAP = {
  mouse: "ti-mouse",
  teclado: "ti-keyboard",
  webcam: "ti-camera",
  laptop: "ti-device-laptop",
  monitor: "ti-device-tv",
  pantalla: "ti-device-tv",
  impresora: "ti-printer",
  audífonos: "ti-headphones",
  headset: "ti-headphones",
  disco: "ti-database",
  usb: "ti-usb",
  cable: "ti-plug",
  pc: "ti-device-desktop-analytics",
  proyector: "ti-device-projector",
  teléfono: "ti-phone",
  base: "ti-device-phone",
  adaptador: "ti-plug",
  default: "ti-device-desktop",
};

function getIcon(nombre) {
  const n = nombre.toLowerCase();
  for (const key of Object.keys(ICON_MAP)) {
    if (n.includes(key)) return ICON_MAP[key];
  }
  return ICON_MAP.default;
}

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const g = item[key] || "General";
    if (!acc[g]) acc[g] = [];
    acc[g].push(item);
    return acc;
  }, {});
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const PROC_STEPS = [
  "Validando información",
  "Guardando solicitud",
  "Generando folio",
  "Notificando al equipo de TI",
  "Solicitud registrada",
];

export default function HardwarePage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [catalogo, setCatalogo] = useState([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [errorCatalogo, setErrorCatalogo] = useState(null);

  const [seleccionados, setSeleccionados] = useState({});
  const [catFiltro, setCatFiltro] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [fase, setFase] = useState("wizard");
  const [procStep, setProcStep] = useState(0);
  const [folio, setFolio] = useState("");
  const [errorEnvio, setErrorEnvio] = useState(null);

  useEffect(() => {
    getCatalogo()
      .then(setCatalogo)
      .catch(() => setErrorCatalogo("No se pudo cargar el catálogo."))
      .finally(() => setLoadingCatalogo(false));
  }, []);

  // ── Derivados ─────────────────────────────────────────
  const grupos = groupBy(catalogo, "categoria");
  const categorias = ["Todos", ...Object.keys(grupos)];

  const catalogoFiltrado = catalogo
    .filter((a) => catFiltro === "Todos" || a.categoria === catFiltro)
    .filter((a) =>
      busqueda
        ? a.nombreArticulo.toLowerCase().includes(busqueda.toLowerCase())
        : true,
    );

  const gruposFiltrados = groupBy(catalogoFiltrado, "categoria");

  const conteosPorCat = catalogo.reduce((acc, a) => {
    acc[a.categoria] = (acc[a.categoria] || 0) + 1;
    return acc;
  }, {});

  const articulosSeleccionados = Object.values(seleccionados).filter(Boolean);
  const totalSeleccionados = articulosSeleccionados.length;
  const puedeEnviar = totalSeleccionados > 0 && motivo !== "";

  // ── Handlers ──────────────────────────────────────────
  function toggleArticulo(art) {
    setSeleccionados((prev) => ({
      ...prev,
      [art.idArticulo]: prev[art.idArticulo] ? null : { ...art, cantidad: 1 },
    }));
  }

  function setCantidad(id, val) {
    setSeleccionados((prev) => ({
      ...prev,
      [id]: prev[id] ? { ...prev[id], cantidad: Math.max(1, val) } : prev[id],
    }));
  }

  function removeArticulo(id) {
    setSeleccionados((prev) => ({ ...prev, [id]: null }));
  }

  async function handleEnviar() {
    setFase("processing");
    setProcStep(0);
    setErrorEnvio(null);

    for (let i = 0; i < PROC_STEPS.length - 1; i++) {
      await delay(420);
      setProcStep(i + 1);
    }

    try {
      const payload = {
        motivo,
        observaciones,
        articulos: articulosSeleccionados.map((a) => ({
          idArticulo: a.idArticulo,
          cantidad: a.cantidad,
        })),
      };
      const res = await enviarSolicitud(payload);
      setFolio(res.folio);
      await delay(300);
      setProcStep(PROC_STEPS.length);
      await delay(500);
      setFase("success");
    } catch {
      setErrorEnvio(
        "Ocurrió un error al registrar la solicitud. Intenta de nuevo.",
      );
      setFase("wizard");
    }
  }

  function resetWizard() {
    setSeleccionados({});
    setMotivo("");
    setObservaciones("");
    setBusqueda("");
    setCatFiltro("Todos");
    setFase("wizard");
    setProcStep(0);
    setFolio("");
    setErrorEnvio(null);
  }

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div className="hw-page">
      {/* ── Título de página ────────────────────────── */}
      <div className="mds-header">
        <button
          className="mds-back"
          onClick={() => navigate("/mesa-de-servicio")}
        >
          <i className="ti ti-arrow-left" />
          Volver a la Mesa de Ayuda
        </button>
        <div className="mds-hero">
          <div className="mds-hero-icon">
            <i className="ti ti-device-laptop" />
          </div>
          <div className="mds-hero-text">
            <h1 className="mds-hero-title">Nueva solicitud de hardware</h1>
            <p className="mds-hero-desc">
              Selecciona los recursos tecnológicos que necesitas. El equipo de
              Sistemas evaluará y gestionará tu requerimiento.
            </p>
          </div>
        </div>
      </div>

      {/* ── Layout principal ────────────────────────── */}
      <div className="hw-layout">
        {/* ══ COLUMNA IZQUIERDA — resource picker ══ */}
        <div className="hw-picker">
          {/* Barra de búsqueda + filtro ──────────── */}
          <div className="hw-toolbar">
            <div className="hw-search-wrap">
              <i className="ti ti-search" aria-hidden="true" />
              <input
                className="hw-search"
                type="text"
                placeholder="Buscar recurso…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                autoComplete="off"
              />
              {busqueda && (
                <button
                  className="hw-search-clear"
                  onClick={() => setBusqueda("")}
                  aria-label="Limpiar búsqueda"
                >
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="hw-tabs" role="tablist">
              {categorias.map((c) => (
                <button
                  key={c}
                  role="tab"
                  aria-selected={catFiltro === c}
                  className={`hw-tab${catFiltro === c ? " hw-tab--on" : ""}`}
                  onClick={() => setCatFiltro(c)}
                >
                  {c}
                  {c !== "Todos" && (
                    <span className="hw-tab-cnt">{conteosPorCat[c] || 0}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de recursos ──────────────────── */}
          <div className="hw-list-wrap">
            {loadingCatalogo && (
              <div className="hw-state">
                <div className="hw-state-spinner" />
                <span>Cargando recursos…</span>
              </div>
            )}

            {errorCatalogo && (
              <div className="hw-state hw-state--error">
                <i className="ti ti-alert-circle" aria-hidden="true" />
                <span>{errorCatalogo}</span>
              </div>
            )}

            {!loadingCatalogo && !errorCatalogo && (
              <>
                {catalogoFiltrado.length === 0 ? (
                  <div className="hw-state">
                    <i className="ti ti-search-off" aria-hidden="true" />
                    <span>
                      Sin resultados para "<strong>{busqueda}</strong>"
                    </span>
                  </div>
                ) : (
                  <div className="hw-list">
                    {Object.entries(gruposFiltrados).map(([cat, items]) => (
                      <div key={cat} className="hw-group">
                        {/* Solo mostrar encabezado de grupo si no hay filtro activo o si hay búsqueda */}
                        {(catFiltro === "Todos" || busqueda) && (
                          <div className="hw-group-header" role="rowgroup">
                            {cat}
                          </div>
                        )}
                        {items.map((art) => {
                          const sel = !!seleccionados[art.idArticulo];
                          return (
                            <div
                              key={art.idArticulo}
                              className={`hw-row${sel ? " hw-row--sel" : ""}`}
                              onClick={() => toggleArticulo(art)}
                              role="checkbox"
                              aria-checked={sel}
                              tabIndex={0}
                              onKeyDown={(e) =>
                                (e.key === "Enter" || e.key === " ") &&
                                toggleArticulo(art)
                              }
                            >
                              {/* Checkbox nativo estilizado */}
                              <div
                                className={`hw-row-check${sel ? " hw-row-check--on" : ""}`}
                                aria-hidden="true"
                              >
                                {sel && <i className="ti ti-check" />}
                              </div>

                              {/* Ícono del recurso */}
                              <div className="hw-row-ico">
                                <i
                                  className={`ti ${getIcon(art.nombreArticulo)}`}
                                  aria-hidden="true"
                                />
                              </div>

                              {/* Nombre y meta */}
                              <div className="hw-row-info">
                                <span className="hw-row-name">
                                  {art.nombreArticulo}
                                </span>
                                {art.requiereAutorizacion === "S" && (
                                  <span className="hw-row-auth"></span>
                                )}
                              </div>

                              {/* Categoría */}
                              <span className="hw-row-cat">
                                {art.categoria}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══ COLUMNA DERECHA — panel ══ */}
        <aside className="hw-panel">
          {/* Artículos solicitados ──────────────── */}
          <div className="hw-panel-block">
            <div className="hw-panel-title">
              <i className="ti ti-clipboard-list" aria-hidden="true" />
              Artículos solicitados
              {totalSeleccionados > 0 && (
                <span className="hw-panel-count">{totalSeleccionados}</span>
              )}
            </div>

            {articulosSeleccionados.length === 0 ? (
              <div className="hw-panel-empty">
                <i className="ti ti-circle-dashed" aria-hidden="true" />
                <span>Ningún artículo seleccionado</span>
              </div>
            ) : (
              <div className="hw-panel-items">
                {articulosSeleccionados.map((art) => (
                  <div key={art.idArticulo} className="hw-panel-row">
                    <i
                      className={`ti ${getIcon(art.nombreArticulo)} hw-panel-row-ico`}
                      aria-hidden="true"
                    />
                    <span className="hw-panel-row-name">
                      {art.nombreArticulo}
                    </span>
                    <div className="hw-qty">
                      <button
                        className="hw-qty-btn"
                        aria-label="Reducir cantidad"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCantidad(art.idArticulo, art.cantidad - 1);
                        }}
                      >
                        −
                      </button>
                      <span className="hw-qty-num">{art.cantidad}</span>
                      <button
                        className="hw-qty-btn"
                        aria-label="Aumentar cantidad"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCantidad(art.idArticulo, art.cantidad + 1);
                        }}
                      >
                        +
                      </button>
                    </div>
                    <button
                      className="hw-panel-remove"
                      aria-label={`Eliminar ${art.nombreArticulo}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeArticulo(art.idArticulo);
                      }}
                    >
                      <i className="ti ti-x" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Justificación ──────────────────────── */}
          <div className="hw-panel-block">
            <div className="hw-panel-title">
              <i className="ti ti-notes" aria-hidden="true" />
              Justificación del requerimiento
            </div>

            <div className="hw-field">
              <label className="hw-label" htmlFor="hw-motivo">
                Motivo
              </label>
              <select
                id="hw-motivo"
                className="hw-select"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              >
                <option value="" disabled>
                  Selecciona un motivo…
                </option>
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="hw-field">
              <label className="hw-label" htmlFor="hw-obs">
                Observaciones
                <span className="hw-label-opt"> (opcional)</span>
              </label>
              <textarea
                id="hw-obs"
                className="hw-textarea"
                placeholder="Contexto adicional, urgencia u otra información relevante…"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                maxLength={300}
              />
            </div>
          </div>

          {/* CTA ────────────────────────────────── */}
          <div className="hw-panel-footer">
            {errorEnvio && <p className="hw-error">{errorEnvio}</p>}
            <button
              className="hw-submit"
              onClick={handleEnviar}
              disabled={!puedeEnviar}
            >
              <i className="ti ti-send" aria-hidden="true" />
              Enviar requerimiento
            </button>
            <p className="hw-submit-note">
              <i className="ti ti-mail" aria-hidden="true" />
              El equipo de Sistemas recibirá una notificación
            </p>
          </div>
        </aside>
      </div>

      {/* ══ OVERLAY — Procesando ══ */}
      {fase === "processing" && (
        <div className="hw-overlay" role="status" aria-live="polite">
          <div className="hw-proc-card">
            <div className="hw-proc-ring" />
            <ul className="hw-proc-list">
              {PROC_STEPS.map((label, i) => (
                <li
                  key={i}
                  className={`hw-proc-item${
                    i < procStep
                      ? " hw-proc-item--done"
                      : i === procStep
                        ? " hw-proc-item--active"
                        : ""
                  }`}
                >
                  <span className="hw-proc-ico">
                    {i < procStep ? (
                      <i className="ti ti-check" aria-hidden="true" />
                    ) : (
                      <span className="hw-proc-dot" />
                    )}
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ══ OVERLAY — Éxito ══ */}
      {fase === "success" && (
        <div className="hw-overlay">
          <div className="hw-success-card">
            <div className="hw-success-ico">
              <i className="ti ti-check" aria-hidden="true" />
            </div>
            <h2 className="hw-success-h">Requerimiento registrado</h2>
            <p className="hw-success-p">
              El equipo de Tecnologías de la Información fue notificado y dará
              seguimiento a tu requerimiento.
            </p>
            <div className="hw-folio-box">
              <div className="hw-folio-label">Folio de seguimiento</div>
              <div className="hw-folio-val">{folio}</div>
            </div>
            <p className="hw-success-hint">
              Puedes consultar el estado en Mesa de Servicio → Mis solicitudes.
            </p>
            <div className="hw-success-actions">
              <button
                className="hw-btn-primary"
                onClick={() =>
                  (window.location.href =
                    "/mesa-de-servicio/mis-solicitudes?tab=hardware")
                }
              >
                <i className="ti ti-list-check" aria-hidden="true" />
                Ver mis solicitudes
              </button>
              <button className="hw-btn-ghost" onClick={resetWizard}>
                Nuevo requerimiento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
