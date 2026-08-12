// MisDesarrollosPage.jsx v6 — quirúrgico, sin reescritura de diseño
import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
import ReactDOM from "react-dom";
import { AuthContext } from "../../../context/AuthContext";
import "./MisDesarrollosPage.css";
import "./MisDesarrollosPage.mobile.css";

const API = "";
const STATIC_BASE = (() => {
  const h = window.location.hostname;
  if (h === "192.168.16.198") return "http://192.168.16.198:3001";
  if (h === "201.151.218.138") return "http://201.151.218.138:3001";
  return "http://localhost:3001";
})();

function authH() {
  const t = localStorage.getItem("fabpsa_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

const PAGE_SIZE = 10;

function fmtDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtDateTime(str) {
  if (!str) return "—";
  return new Date(str).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function iniciales(nombre) {
  if (!nombre) return "?";
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
function fileIcon(nombre) {
  if (!nombre) return "ti-file";
  const ext = nombre.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "ti-photo";
  if (ext === "pdf") return "ti-file-type-pdf";
  if (["xlsx", "xls", "csv"].includes(ext)) return "ti-table";
  if (["docx", "doc"].includes(ext)) return "ti-file-word";
  return "ti-paperclip";
}
const stop = (fn) => (e) => {
  e.stopPropagation();
  fn(e);
};

const KPI_DEFS_USR = [
  { key: "todas", label: "Todas", icon: "ti-stack-2", color: "#4f46e5" },
  { key: "proceso", label: "En proceso", icon: "ti-code", color: "#3b82f6" },
  {
    key: "concluidas",
    label: "Concluidas",
    icon: "ti-circle-check",
    color: "#10b981",
  },
  { key: "evaluar", label: "Por evaluar", icon: "ti-star", color: "#f59e0b" },
];

/* ── Componentes puros (sin acceso a estado del padre) ────────── */
function Avatar({ nombre, size = 26 }) {
  const colors = [
    "#4f46e5",
    "#7c3aed",
    "#0891b2",
    "#059669",
    "#d97706",
    "#dc2626",
  ];
  const idx = nombre ? nombre.charCodeAt(0) % colors.length : 0;
  return (
    <div
      className="sdp-avatar"
      style={{
        width: size,
        height: size,
        background: colors[idx],
        fontSize: size * 0.38,
      }}
    >
      {iniciales(nombre)}
    </div>
  );
}

function StarRating({ value, onChange, size = 22 }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star-btn${(hover || value) >= n ? " star-btn--on" : ""}`}
          style={{ fontSize: size }}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function MiniBarraTiempo({ idEstatus, fechaCompromiso }) {
  if (idEstatus >= 6)
    return (
      <span className="sdp-time-chip sdp-time-chip--done">
        <i className="ti ti-circle-check" /> Concluido
      </span>
    );
  if (!fechaCompromiso)
    return <span className="sdp-time-chip sdp-time-chip--none">Sin fecha</span>;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const c = new Date(fechaCompromiso);
  c.setHours(0, 0, 0, 0);
  const d = Math.round((c - hoy) / 86400000);
  const color = d < 0 ? "#ef4444" : d <= 3 ? "#f59e0b" : "#4f46e5";
  const label =
    d < 0
      ? `Vencido hace ${Math.abs(d)}d`
      : d === 0
        ? "Vence hoy"
        : `${d}d restantes`;
  return (
    <div className="sdp-mini-barra">
      <div className="sdp-mini-track">
        <div
          className="sdp-mini-fill"
          style={{ width: "60%", background: color }}
        />
      </div>
      <span className="sdp-mini-label" style={{ color }}>
        {label}
      </span>
    </div>
  );
}

/* ── Panel expandido (tabs del usuario) ───────────────────────── */
const TABS_USR = [
  { key: "resumen", label: "Resumen", icon: "ti-layout-grid" },
  { key: "actividades", label: "Actividades", icon: "ti-activity" },
  { key: "comentarios", label: "Comentarios", icon: "ti-message-circle" },
  { key: "archivos", label: "Archivos", icon: "ti-paperclip" },
  { key: "evaluacion", label: "Evaluación", icon: "ti-star" },
];

function PanelUsuario({
  data,
  tab,
  onTabChange,
  user,
  idSolicitud,
  onRefresh,
}) {
  const [comentario, setComentario] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef(null);
  const folio = data.folioDesarrollo || data.folio || "";

  async function postComentario() {
    if (!comentario.trim()) return;
    await fetch(`${API}/api/solicitudes-desarrollo/${idSolicitud}/comentario`, {
      method: "POST",
      headers: authH(),
      body: JSON.stringify({ comentario: comentario.trim() }),
    });
    setComentario("");
    onRefresh?.();
  }

  async function subirArchivos(files) {
    if (!files?.length) return;
    setSubiendo(true);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("archivos", f));
    try {
      const token = localStorage.getItem("fabpsa_token");
      await fetch(`${API}/api/solicitudes-desarrollo/${idSolicitud}/adjuntos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      onRefresh?.();
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="sdp-panel-wrap">
      <div className="sdp-panel-tabs">
        {TABS_USR.map((t) => (
          <button
            key={t.key}
            className={`sdp-panel-tab ${tab === t.key ? "active" : ""}`}
            onClick={stop(() => onTabChange(t.key))}
          >
            <i className={`ti ${t.icon}`} /> <span>{t.label}</span>
          </button>
        ))}
        <div className="sdp-panel-tabs-spacer" />
      </div>
      <div className="sdp-panel-body">
        {/* RESUMEN */}
        {tab === "resumen" && (
          <div className="sdp-resumen-grid">
            <div className="sdp-info-col">
              <div className="sdp-section-title">INFORMACIÓN GENERAL</div>
              {[
                [
                  "Folio",
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "#4f46e5",
                    }}
                  >
                    {folio}
                  </span>,
                ],
                ["Tipo", data.tipoNombre || "—"],
                ["Sistema", data.sistemaNombre || "—"],
                ["Área", data.areaUsuario || "—"],
                ["Solicitante", data.nombreUsuario || "—"],
                ["Registro", fmtDateTime(data.fechaCreacion)],
              ].map(([label, val]) => (
                <div key={label} className="info-row">
                  <span className="info-row-label">{label}</span>
                  <span className="info-row-val">{val}</span>
                </div>
              ))}
            </div>
            <div className="sdp-desc-col">
              <div className="sdp-section-title">DESCRIPCIÓN</div>
              <p className="sdp-desc-text">
                {data.descripcion || data.objetivo || "—"}
              </p>
              {data.beneficioEsperado && (
                <>
                  <div className="sdp-section-title" style={{ marginTop: 12 }}>
                    BENEFICIO
                  </div>
                  <p className="sdp-desc-text">{data.beneficioEsperado}</p>
                </>
              )}
            </div>
            <div className="sdp-prog-col">
              <div className="sdp-section-title">PROGRESO Y TIEMPOS</div>
              <div className="bt-full" style={{ marginBottom: 10 }}>
                <div className="bt-header">
                  <span>Avance</span>
                  <span className="bt-pct" style={{ color: "#4f46e5" }}>
                    {data.porcentajeAvance || 0}%
                  </span>
                </div>
                <div className="bt-track">
                  <div
                    className="bt-fill"
                    style={{
                      width: `${data.porcentajeAvance || 0}%`,
                      background: "#4f46e5",
                    }}
                  />
                </div>
              </div>
              {[
                ["Compromiso", fmtDate(data.fechaCompromiso)],
                ["Inicio real", fmtDate(data.fechaInicio)],
                ["Entregado", fmtDate(data.fechaConclusión)],
              ].map(([l, v]) => (
                <div key={l} className="info-row">
                  <span className="info-row-label">{l}</span>
                  <span className="info-row-val">{v}</span>
                </div>
              ))}
              {data.nombreTecnico && (
                <div style={{ marginTop: 10 }}>
                  <div
                    className="sdp-section-title"
                    style={{ marginBottom: 6 }}
                  >
                    Responsable
                  </div>
                  <div className="sdp-resp-cell">
                    <Avatar nombre={data.nombreTecnico} size={28} />
                    <span>{data.nombreTecnico}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="sdp-resumen-rapido">
              <div className="sdp-section-title">RESUMEN RÁPIDO</div>
              {[
                ["ti-activity", "Actividades", data.actividades?.length || 0],
                ["ti-paperclip", "Archivos", data.adjuntos?.length || 0],
                [
                  "ti-message-circle",
                  "Comentarios",
                  data.comentarios?.length || 0,
                ],
              ].map(([icon, label, val]) => (
                <div key={label} className="sdp-quick-row">
                  <span className="sdp-quick-label">
                    <i className={`ti ${icon}`} /> {label}
                  </span>
                  <span className="sdp-quick-val">{val}</span>
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <span
                  className="sdp-estatus-pill"
                  style={{
                    background: data.estatusBg,
                    color: data.estatusColor,
                  }}
                >
                  {data.estatusNombre}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ACTIVIDADES */}
        {tab === "actividades" && (
          <ActividadesPanel idSolicitud={idSolicitud} />
        )}

        {/* COMENTARIOS */}
        {tab === "comentarios" && (
          <div className="sdp-comments">
            {!data.comentarios?.filter((c) => !c.esInterno).length ? (
              <div className="sdp-empty-inline">
                <i className="ti ti-message-circle" />
                <p>Sin comentarios aún.</p>
              </div>
            ) : (
              data.comentarios
                .filter((c) => !c.esInterno)
                .map((c, i) => (
                  <div key={c.idComentario || i} className="sdp-comment-item">
                    <div className="sdp-comment-header">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Avatar nombre={c.nombreUsuario} size={26} />
                        <span className="sdp-comment-author">
                          {c.nombreUsuario}
                        </span>
                      </div>
                      <span className="sdp-comment-date">
                        {fmtDateTime(c.fecha)}
                      </span>
                    </div>
                    <p className="sdp-comment-text">{c.comentario}</p>
                  </div>
                ))
            )}
            <div className="sdp-comment-form">
              <textarea
                placeholder="Escribe un comentario…"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="sdp-btn sdp-btn-primary sdp-btn-sm"
                style={{ alignSelf: "flex-end" }}
                onClick={stop(postComentario)}
              >
                <i className="ti ti-send" /> Enviar
              </button>
            </div>
          </div>
        )}

        {/* ARCHIVOS */}
        {tab === "archivos" && (
          <div>
            <div
              className="msd-upload-zone"
              onClick={() => !subiendo && fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.txt"
                style={{ display: "none" }}
                onChange={(e) => subirArchivos(e.target.files)}
              />
              {subiendo ? (
                <>
                  <i className="ti ti-loader msd-upload-icon spinning" />
                  <span>Subiendo…</span>
                </>
              ) : (
                <>
                  <i className="ti ti-cloud-upload msd-upload-icon" />
                  <span className="msd-upload-label">
                    Haz clic para adjuntar archivos
                  </span>
                  <span className="msd-upload-hint">
                    Imágenes, PDF, Word, Excel — máx. 10 MB
                  </span>
                </>
              )}
            </div>
            {!data.adjuntos?.length ? (
              <div className="sdp-empty-inline">
                <i className="ti ti-paperclip" />
                <p>Sin archivos adjuntos.</p>
              </div>
            ) : (
              <div className="sdp-files-grid">
                {data.adjuntos.map((f, i) => {
                  const url = `${STATIC_BASE}${f.rutaServidor}`;
                  const esImg = f.mimeType?.startsWith("image/");
                  if (esImg)
                    return (
                      <div
                        key={i}
                        className="sdp-file-item sdp-file-item--img"
                        onClick={stop(() => setLightbox(url))}
                      >
                        <img
                          src={url}
                          alt={f.nombreArchivo}
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                        <span className="sdp-file-name">{f.nombreArchivo}</span>
                      </div>
                    );
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="sdp-file-item"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <i className={`ti ${fileIcon(f.nombreArchivo)}`} />
                      <span className="sdp-file-name">{f.nombreArchivo}</span>
                    </a>
                  );
                })}
              </div>
            )}
            {lightbox && (
              <div className="msd-lightbox" onClick={() => setLightbox(null)}>
                <img
                  src={lightbox}
                  alt="preview"
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  className="msd-lightbox-close"
                  onClick={() => setLightbox(null)}
                >
                  <i className="ti ti-x" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* EVALUACIÓN */}
        {tab === "evaluacion" && (
          <TabEvaluacionUsuario
            evaluacion={data.evaluacion}
            esConcluido={data.idEstatus === 7}
            esSolicitante={data.idUsuario === user?.login}
            idSolicitud={idSolicitud}
            onRefresh={onRefresh}
          />
        )}
      </div>
    </div>
  );
}

function ActividadesPanel({ idSolicitud }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(
      `${API}/api/solicitudes-desarrollo/mis-solicitudes/${idSolicitud}/actividades`,
      { headers: authH() },
    )
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setItems(j.data || []);
      })
      .finally(() => setLoading(false));
  }, [idSolicitud]);
  if (loading)
    return (
      <div className="sdp-spinner-wrap">
        <div className="sdp-spinner" />
      </div>
    );
  if (!items.length)
    return (
      <div className="sdp-empty-inline">
        <i className="ti ti-activity" />
        <p>Sin actividades registradas.</p>
      </div>
    );
  return (
    <div className="sdp-activities">
      {items.map((a, i) => (
        <div key={i} className="sdp-act-item">
          <div className="sdp-act-dot">
            <i className="ti ti-point-filled" />
          </div>
          <div className="sdp-act-body">
            <div className="sdp-act-header">
              <span className="sdp-act-autor">{a.autor || "Sistemas"}</span>
              <span className="sdp-act-fecha">
                {fmtDateTime(a.fechaRegistro)}
              </span>
            </div>
            <p className="sdp-act-desc">{a.descripcion}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabEvaluacionUsuario({
  evaluacion,
  esConcluido,
  esSolicitante,
  idSolicitud,
  onRefresh,
}) {
  const [form, setForm] = useState({
    satisfaccion: 0,
    cumplimiento: 0,
    tiempoEntrega: 0,
    calidad: 0,
    comentarios: "",
  });
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (evaluacion) {
    const prom = (
      (evaluacion.satisfaccion +
        evaluacion.cumplimiento +
        evaluacion.tiempoEntrega +
        evaluacion.calidad) /
      4
    ).toFixed(1);
    return (
      <div className="tab-eval">
        <div className="eval-header">
          <i
            className="ti ti-star-filled"
            style={{ color: "#f59e0b", fontSize: 22 }}
          />
          <span>Evaluación del solicitante</span>
          <span className="eval-fecha">
            {fmtDate(evaluacion.fechaEvaluacion)}
          </span>
        </div>
        <div className="eval-promedio">
          <span className="eval-promedio-num">{prom}</span>
          <StarRating value={Math.round(parseFloat(prom))} size={20} />
          <span className="eval-promedio-label">Promedio general</span>
        </div>
        <div className="eval-grid">
          {[
            ["Satisfacción general", evaluacion.satisfaccion],
            ["Cumplimiento", evaluacion.cumplimiento],
            ["Tiempo de entrega", evaluacion.tiempoEntrega],
            ["Calidad", evaluacion.calidad],
          ].map(([l, v]) => (
            <div key={l} className="eval-row">
              <span className="eval-dim">{l}</span>
              <StarRating value={v} size={16} />
              <span className="eval-val">{v}/5</span>
            </div>
          ))}
        </div>
        {evaluacion.comentarios && (
          <div className="eval-comentarios">
            <label>Comentarios</label>
            <p>"{evaluacion.comentarios}"</p>
          </div>
        )}
      </div>
    );
  }
  if (!esConcluido)
    return (
      <div className="sdp-empty-inline">
        <i className="ti ti-star" />
        <p>
          La evaluación estará disponible cuando el desarrollo sea concluido.
        </p>
      </div>
    );
  if (!esSolicitante)
    return (
      <div className="sdp-empty-inline">
        <i className="ti ti-star" />
        <p>La evaluación corresponde exclusivamente al usuario solicitante.</p>
      </div>
    );
  if (enviado)
    return (
      <div className="sdp-empty-inline">
        <i className="ti ti-circle-check" style={{ color: "#10b981" }} />
        <p>¡Evaluación enviada! Gracias.</p>
      </div>
    );

  async function handleEnviar() {
    if (
      !form.satisfaccion ||
      !form.cumplimiento ||
      !form.tiempoEntrega ||
      !form.calidad
    ) {
      setError("Califica todas las dimensiones.");
      return;
    }
    setLoading(true);
    setError("");
    const r = await fetch(
      `${API}/api/solicitudes-desarrollo/${idSolicitud}/evaluacion`,
      {
        method: "POST",
        headers: authH(),
        body: JSON.stringify(form),
      },
    ).then((r) => r.json());
    setLoading(false);
    if (r.ok) {
      setEnviado(true);
      onRefresh?.();
    } else setError(r.message || "Error al enviar");
  }

  return (
    <div className="tab-eval">
      <p className="eval-intro">
        El desarrollo está concluido. Califica el desempeño del equipo de
        Sistemas.
      </p>
      {[
        ["satisfaccion", "Satisfacción general"],
        ["cumplimiento", "Cumplimiento"],
        ["tiempoEntrega", "Tiempo de entrega"],
        ["calidad", "Calidad"],
      ].map(([key, label]) => (
        <div key={key} className="eval-form-row">
          <span className="eval-form-label">{label}</span>
          <StarRating
            value={form[key]}
            onChange={(v) => setForm((p) => ({ ...p, [key]: v }))}
          />
        </div>
      ))}
      <div className="sdp-modal-field" style={{ marginTop: 12 }}>
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary,#6b7280)",
          }}
        >
          Comentarios (opcional)
        </label>
        <textarea
          rows={3}
          value={form.comentarios}
          onChange={(e) =>
            setForm((p) => ({ ...p, comentarios: e.target.value }))
          }
          placeholder="¿Qué te pareció el desarrollo?"
        />
      </div>
      {error && (
        <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{error}</p>
      )}
      <div
        style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}
      >
        <button
          className="sdp-btn sdp-btn-primary"
          disabled={loading}
          onClick={handleEnviar}
        >
          {loading ? (
            <>
              <i className="ti ti-loader-2 sdp-spin" /> Enviando…
            </>
          ) : (
            <>
              <i className="ti ti-send" /> Enviar evaluación
            </>
          )}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
══════════════════════════════════════════════════════════════ */
export default function MisDesarrollosPage({ embebido = false }) {
  const { user } = useContext(AuthContext);

  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [buscar, setBuscar] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [activeKpi, setActiveKpi] = useState("todas");
  // Modal de detalle
  const [modalId, setModalId] = useState(null);
  const [modalTab, setModalTab] = useState("resumen");
  const [modalData, setModalData] = useState(null);
  const pollingRef = useRef(null);

  // ESC cierra modal
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") setModalId(null);
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);

  const fetchSolicitudes = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const p = new URLSearchParams({ page, limit: PAGE_SIZE });
        if (buscar.trim()) p.set("search", buscar.trim());
        if (filtroEstatus) p.set("estatus", filtroEstatus);
        const r = await fetch(
          `${API}/api/solicitudes-desarrollo/mis-solicitudes?${p}`,
          { headers: authH() },
        );
        const j = await r.json();
        if (j.ok) setSolicitudes(j.data || []);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page, buscar, filtroEstatus],
  );

  useEffect(() => {
    fetchSolicitudes(false);
  }, [fetchSolicitudes]);

  // Polling silencioso cada 20 segundos
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      fetchSolicitudes(true);
    }, 20000);
    return () => clearInterval(pollingRef.current);
  }, [fetchSolicitudes]);

  function abrirModal(idSol) {
    setModalId(idSol);
    setModalTab("resumen");
    setModalData(null);
    fetch(`${API}/api/solicitudes-desarrollo/mis-solicitudes/${idSol}`, {
      headers: authH(),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) setModalData(j.data);
      });
  }

  function refrescarModal() {
    if (!modalId) return;
    fetch(`${API}/api/solicitudes-desarrollo/mis-solicitudes/${modalId}`, {
      headers: authH(),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && j.data) setModalData(j.data);
      });
    fetchSolicitudes(true);
  }

  // KPIs calculados localmente
  const kpiCounts = {
    todas: solicitudes.length,
    proceso: solicitudes.filter((s) => (s.estatus?.id || s.idEstatus || 0) < 6)
      .length,
    concluidas: solicitudes.filter(
      (s) => (s.estatus?.id || s.idEstatus || 0) >= 6,
    ).length,
    evaluar: solicitudes.filter(
      (s) => (s.estatus?.id || s.idEstatus || 0) === 7 && !s.evaluada,
    ).length,
  };

  const filas =
    activeKpi === "proceso"
      ? solicitudes.filter((s) => (s.estatus?.id || s.idEstatus || 0) < 6)
      : activeKpi === "concluidas"
        ? solicitudes.filter((s) => (s.estatus?.id || s.idEstatus || 0) >= 6)
        : activeKpi === "evaluar"
          ? solicitudes.filter(
              (s) => (s.estatus?.id || s.idEstatus || 0) === 7 && !s.evaluada,
            )
          : solicitudes;

  const totalPages = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const slice = filas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={embebido ? "sdp-root sdp-root--embebido" : "sdp-root"}>
      {/* KPI Strip */}
      <div className="sdp-kpi-strip">
        {KPI_DEFS_USR.map((kpi) => {
          const count = kpiCounts[kpi.key] || 0;
          return (
            <button
              key={kpi.key}
              className={`sdp-kpi-chip ${activeKpi === kpi.key ? "active" : ""} ${kpi.key === "evaluar" && count > 0 ? "chip-alert" : ""}`}
              onClick={() => {
                setActiveKpi(kpi.key);
                setPage(1);
              }}
            >
              <div
                className="kpi-icon-wrap"
                style={{ background: kpi.color + "18", color: kpi.color }}
              >
                <i className={`ti ${kpi.icon}`} />
              </div>
              <div className="kpi-text">
                <span
                  className="kpi-count"
                  style={{
                    color: activeKpi === kpi.key ? kpi.color : undefined,
                  }}
                >
                  {count}
                </span>
                <span className="kpi-label">{kpi.label}</span>
              </div>
              {kpi.key === "evaluar" && count > 0 && (
                <span className="kpi-pulse" />
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="sdp-toolbar">
        <div className="sdp-search-wrap">
          <i className="ti ti-search" />
          <input
            placeholder="Buscar por folio o título…"
            value={buscar}
            onChange={(e) => {
              setBuscar(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="sdp-toolbar-filters">
          <select
            className="sdp-filter-select"
            value={filtroEstatus}
            onChange={(e) => {
              setFiltroEstatus(e.target.value);
              setPage(1);
              setActiveKpi("todas");
            }}
          >
            <option value="">Todos los estatus</option>
            <option value="proceso">En proceso</option>
            <option value="concluidas">Concluidas</option>
            <option value="accion">Por evaluar</option>
          </select>
        </div>
        <div className="sdp-toolbar-spacer" />
        {solicitudes.length > 0 && (
          <span
            style={{ fontSize: 12, color: "var(--text-secondary,#6b7280)" }}
          >
            {filas.length} solicitud{filas.length !== 1 ? "es" : ""}
          </span>
        )}
      </div>

      {/* Tabla */}
      <div className="sdp-table-wrap">
        {loading ? (
          <div className="sdp-spinner-wrap">
            <div className="sdp-spinner" />
          </div>
        ) : filas.length === 0 ? (
          <div className="sdp-empty">
            <i className="ti ti-code-circle" />
            <p>
              {activeKpi === "todas"
                ? "Aún no tienes solicitudes de desarrollo."
                : "No hay solicitudes en esta categoría."}
            </p>
          </div>
        ) : (
          <table className="sdp-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Folio / Tipo</th>
                <th>Título</th>
                <th>Sistema</th>
                <th>Prioridad</th>
                <th>Estatus</th>
                <th>Responsable TI</th>
                <th>Avance</th>
                <th>Fecha estimada</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((sol) => {
                const idSol = sol.idSolicitud;
                const idEst = sol.estatus?.id || sol.idEstatus || 0;
                const sinEval = idEst === 7 && !sol.evaluada;
                const folio = sol.folio || "";
                const tipo = sol.tipo || sol.tipoNombre || "";
                const esMejora = tipo.toLowerCase().includes("mejora");

                return (
                  <tr
                    key={idSol}
                    onClick={() => abrirModal(idSol)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="col-chevron">
                      <i className="ti ti-chevron-right" />
                    </td>
                    <td className="col-folio">
                      <span className="sdp-folio-num sdp-folio-num--sobrio">
                        {folio}
                      </span>
                      {tipo && (
                        <span
                          className={`sdp-tipo-mini ${esMejora ? "sdp-tipo-mini--ma" : "sdp-tipo-mini--nd"}`}
                        >
                          {tipo}
                        </span>
                      )}
                      {sinEval && (
                        <span className="sdp-eval-badge">
                          <i className="ti ti-star" /> Por evaluar
                        </span>
                      )}
                    </td>
                    <td className="col-titulo-main">
                      <span className="titulo-text titulo-text--truncado">
                        {sol.titulo}
                      </span>
                    </td>
                    <td className="col-sistema">
                      {sol.sistema || sol.sistemaNombre || "—"}
                    </td>
                    <td>
                      {sol.prioridadNombre ? (
                        <span className="sdp-prio">
                          <span
                            className="sdp-prio-dot"
                            style={{
                              background: sol.prioridadColor || "#9ca3af",
                            }}
                          />
                          {sol.prioridadNombre}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {sol.estatus?.nombre || sol.estatusNombre ? (
                        <span
                          className="sdp-estatus-pill"
                          style={{
                            background:
                              sol.estatus?.bg || sol.estatusBg || "#f3f4f6",
                            color:
                              sol.estatus?.color ||
                              sol.estatusColor ||
                              "#6b7280",
                          }}
                        >
                          {sol.estatus?.nombre || sol.estatusNombre}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="col-responsable">
                      {sol.responsable || sol.nombreTecnico ? (
                        <div className="sdp-resp-cell">
                          <Avatar
                            nombre={sol.responsable || sol.nombreTecnico}
                            size={24}
                          />
                          <span>{sol.responsable || sol.nombreTecnico}</span>
                        </div>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>
                          Sin asignar
                        </span>
                      )}
                    </td>
                    <td className="col-avance">
                      <div className="avance-cell">
                        <div className="avance-track">
                          <div
                            className="avance-fill"
                            style={{
                              width: `${sol.avance || sol.porcentajeAvance || 0}%`,
                            }}
                          />
                        </div>
                        <span className="avance-num">
                          {sol.avance || sol.porcentajeAvance || 0}%
                        </span>
                      </div>
                      <MiniBarraTiempo
                        idEstatus={idEst}
                        fechaCompromiso={sol.fechaCompromiso}
                      />
                    </td>
                    <td className="col-fecha">
                      {sol.fechaConcluido ? (
                        <>
                          <i
                            className="ti ti-calendar-check"
                            style={{ color: "#10b981", marginRight: 4 }}
                          />
                          {fmtDate(sol.fechaConcluido)}
                        </>
                      ) : (
                        fmtDate(sol.fechaCompromiso) || "Sin fecha"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="sdp-pagination">
          <span className="sdp-pag-info">
            {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, filas.length)} de {filas.length}
          </span>
          <div className="sdp-pag-btns">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <i className="ti ti-chevron-left" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={page === p ? "active" : ""}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <i className="ti ti-chevron-right" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de detalle — portal limpio */}
      {modalId &&
        ReactDOM.createPortal(
          <div
            className="sdp-modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalId(null);
            }}
          >
            <div
              className="msd-modal-wrap"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="msd-modal-header-bar">
                {modalData ? (
                  <div className="msd-modal-title-area">
                    <span className="sdp-folio-num sdp-folio-num--sobrio">
                      {modalData.folioDesarrollo || modalData.folio}
                    </span>
                    <h2 className="msd-modal-titulo">{modalData.titulo}</h2>
                  </div>
                ) : (
                  <div
                    className="sdp-spinner"
                    style={{ width: 20, height: 20, borderWidth: 2 }}
                  />
                )}
                <div className="msd-modal-header-right">
                  {modalData && (
                    <span
                      className="sdp-estatus-pill"
                      style={{
                        background: modalData.estatusBg,
                        color: modalData.estatusColor,
                      }}
                    >
                      {modalData.estatusNombre}
                    </span>
                  )}
                  <button
                    className="sdp-icon-btn"
                    onClick={() => setModalId(null)}
                    title="Cerrar (ESC)"
                  >
                    <i className="ti ti-x" />
                  </button>
                </div>
              </div>
              <div className="msd-modal-body">
                {!modalData ? (
                  <div className="sdp-spinner-wrap">
                    <div className="sdp-spinner" />
                  </div>
                ) : (
                  <PanelUsuario
                    data={modalData}
                    tab={modalTab}
                    onTabChange={setModalTab}
                    user={user}
                    idSolicitud={modalId}
                    onRefresh={refrescarModal}
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
