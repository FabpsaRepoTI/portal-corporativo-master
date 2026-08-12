// AtencionIncidenciasPage.jsx — v5
// Cambios:
//   - ESTATUS_MAP: agrega estado 6 "En pausa"
//   - BarraAcciones: deshabilita todo si !tecnicoAsignado, con tooltip claro
//   - Botones quick del grid: deshabilitan si !tecnicoAsignado
//   - PanelExpandido: agrega tab "Seguimiento" (índice 2, desplaza SLA/Comentarios)
//   - TabSeguimiento: timeline de bitácora + input para actividad manual
//   - TabSLA: SLA en minutos, resolución no inicia hasta "En proceso",
//             pausa del SLA cuando idEstatus=6
//   - TabInfoGeneral: tiempos actualizados (usa misma lógica que TabSLA)
//   - confirmarEstatus: maneja estado 6 (pausa) sin abrir modal extra
//   - Polling silencioso cada 20s sin cerrar detalle ni perder filtros
import { useState, useEffect, useContext, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { AuthContext } from "../../../context/AuthContext";
import "./AtencionIncidenciasPage.css";
import "./AtencionIncidenciasPage.mobile.css";

const API_BASE = "";
const STATIC_BASE = (() => {
  if (window.location.hostname === "localhost") return "http://localhost:3001";
  return "";
})();

const getToken = () => localStorage.getItem("fabpsa_token");
const apiFetch = async (path, opts = {}) => {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) data.__httpError = true;
  return data;
};

// ── Estado 6 "En pausa" agregado ─────────────────────────────
const ESTATUS_MAP = {
  1: { label: "Abierto", bg: "rgba(76,201,166,0.12)", color: "#4cc9a6" },
  2: { label: "En proceso", bg: "rgba(124,140,248,0.12)", color: "#7c8cf8" },
  3: { label: "Resuelto", bg: "rgba(76,201,166,0.12)", color: "#4cc9a6" },
  4: { label: "Cerrado", bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
  5: { label: "Cancelado", bg: "rgba(243,139,168,0.12)", color: "#f38ba8" },
  6: { label: "En pausa", bg: "rgba(246,193,119,0.12)", color: "#f6c177" },
  7: {
    label: "En diagnóstico",
    bg: "rgba(243,139,168,0.12)",
    color: "#f38ba8",
  },
  8: { label: "Escalado", bg: "rgba(243,139,168,0.15)", color: "#f38ba8" },
};

const SERVICIO_ICONOS = {
  incidente: "ti-alert-triangle",
  falla: "ti-alert-triangle",
  hardware: "ti-device-laptop",
  software: "ti-device-desktop",
  red: "ti-network",
  redes: "ti-network",
  internet: "ti-globe",
  correo: "ti-mail",
  office: "ti-mail",
  acceso: "ti-lock",
  cuenta: "ti-user-circle",
  telefon: "ti-phone",
  impres: "ti-printer",
  seguridad: "ti-shield",
  desarrollo: "ti-code",
  servidor: "ti-server",
  default: "ti-ticket",
};

function getServicioIcono(nombre, iconoBD) {
  if (iconoBD) return iconoBD;
  const n = (nombre ?? "").toLowerCase();
  for (const [key, icon] of Object.entries(SERVICIO_ICONOS)) {
    if (n.includes(key)) return icon;
  }
  return SERVICIO_ICONOS.default;
}

// ── SLA helpers ───────────────────────────────────────────────

// Convierte horas a minutos para mostrar en UI
function hrsAMin(hrs) {
  if (!hrs && hrs !== 0) return null;
  return Math.round(parseFloat(hrs) * 60);
}

function getSlaInfo(fechaLimite) {
  if (!fechaLimite)
    return { texto: "—", color: "var(--text-muted)", pct: 0, min: null };
  const diff = new Date(fechaLimite) - new Date();
  const min = Math.floor(diff / 60000);
  const texto =
    min < 0
      ? "Vencida"
      : min < 60
        ? `${min} min`
        : min < 1440
          ? `${Math.floor(min / 60)}h ${min % 60}m`
          : `${Math.floor(min / 1440)}d`;
  const color =
    min < 0 || min < 60
      ? "var(--danger)"
      : min < 180
        ? "var(--warning)"
        : "var(--success)";
  const pct = Math.min(100, Math.max(0, ((1440 - min) / 1440) * 100));
  return { texto, color, pct, min };
}

// SLA de resolución: calcula tiempo restante desde fechaInicioResolucion,
// descontando pausas ya acumuladas. Si está en pausa, el contador está detenido.
function getSlaResolucionInfo(sol) {
  const {
    idEstatus,
    fechaInicioResolucion,
    slaResolucionHrs,
    tiempoTotalPausaMin = 0,
    fechaUltimaPausa,
    fechaResolucion,
    tiempoAtencionMin,
  } = sol;

  const slaMin = hrsAMin(slaResolucionHrs);

  // Antes de "En proceso": no iniciado
  if (!fechaInicioResolucion) {
    return {
      iniciado: false,
      slaMin,
      texto: "—",
      color: "var(--text-muted)",
      pct: 0,
      min: null,
      estado: "sin_iniciar",
    };
  }

  // Ya resuelto/cerrado: usar tiempoAtencionMin guardado en BD
  if ([3, 4].includes(idEstatus) && tiempoAtencionMin != null) {
    const consumidoMin = tiempoAtencionMin;
    const restante = (slaMin ?? 0) - consumidoMin;
    return {
      iniciado: true,
      slaMin,
      consumidoMin,
      texto: restante >= 0 ? `${restante} min restantes` : "Vencida",
      color: restante >= 0 ? "var(--success)" : "var(--danger)",
      pct: Math.min(100, (consumidoMin / (slaMin || 1)) * 100),
      min: restante,
      estado: restante >= 0 ? "en_tiempo" : "vencido",
      concluido: true,
      tiempoReal: consumidoMin,
    };
  }

  // En pausa: el contador está detenido, calcular cuánto se consumió hasta la pausa
  if (idEstatus === 6 && fechaUltimaPausa) {
    const consumidoMin =
      Math.floor(
        (new Date(fechaUltimaPausa) - new Date(fechaInicioResolucion)) / 60000,
      ) - (tiempoTotalPausaMin ?? 0);
    const restante = (slaMin ?? 0) - consumidoMin;
    return {
      iniciado: true,
      pausado: true,
      slaMin,
      consumidoMin: Math.max(0, consumidoMin),
      texto: `En pausa · ${Math.max(0, restante)} min restantes`,
      color: "var(--warning)",
      pct: Math.min(100, (Math.max(0, consumidoMin) / (slaMin || 1)) * 100),
      min: restante,
      estado: "pausado",
    };
  }

  // Activo: calcular tiempo consumido
  const ahora = new Date();
  const inicio = new Date(fechaInicioResolucion);
  const transcurridoMin = Math.floor((ahora - inicio) / 60000);
  const consumidoMin = Math.max(
    0,
    transcurridoMin - (tiempoTotalPausaMin ?? 0),
  );
  const restante = (slaMin ?? 0) - consumidoMin;

  const estado =
    restante < 0
      ? "vencido"
      : restante < 30
        ? "critico"
        : restante < 60
          ? "en_riesgo"
          : "en_tiempo";

  const color =
    restante < 0
      ? "var(--danger)"
      : restante < 30
        ? "var(--danger)"
        : restante < 60
          ? "var(--warning)"
          : "var(--success)";

  const texto =
    restante < 0
      ? "Vencida"
      : restante < 60
        ? `${restante} min`
        : `${Math.floor(restante / 60)}h ${restante % 60}m`;

  return {
    iniciado: true,
    slaMin,
    consumidoMin,
    texto,
    color,
    pct: Math.min(100, (consumidoMin / (slaMin || 1)) * 100),
    min: restante,
    estado,
  };
}

function fmtTiempoAtencion(min) {
  if (!min && min !== 0) return "—";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
}

function fmtFecha(f, short = false) {
  if (!f) return "—";
  return new Date(f).toLocaleString(
    "es-MX",
    short
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
  );
}

function ticketBloqueado(sol) {
  if (sol.idEstatus !== 4) return false;
  if (!sol.fechaActualizacion) return false;
  return (
    Date.now() - new Date(sol.fechaActualizacion).getTime() >
    48 * 60 * 60 * 1000
  );
}

function ModalPortal({ children }) {
  return createPortal(children, document.body);
}

function Chip({ idEstatus, label }) {
  const cfg = ESTATUS_MAP[idEstatus] ?? {
    label: label ?? "—",
    bg: "rgba(148,163,184,0.1)",
    color: "var(--text-muted)",
  };
  return (
    <span className="mha-chip" style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function KpiCard({
  icon,
  iconBg,
  iconColor,
  label,
  sub,
  num,
  accentClass,
  accentNum,
}) {
  return (
    <div className={`mha-kpi ${accentClass ?? ""}`}>
      <div className="mha-kpi-top">
        <span className="mha-kpi-label">{label}</span>
        <div
          className="mha-kpi-icon"
          style={{ background: iconBg, color: iconColor }}
        >
          <i className={`ti ${icon}`} aria-hidden="true" />
        </div>
      </div>
      <div>
        <div
          className={`mha-kpi-num ${accentNum ? "mha-kpi-num--accent" : ""}`}
        >
          {num ?? "—"}
        </div>
        {sub && <div className="mha-kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const esError = toast.tipo === "error";
  return (
    <div className="mha-toast">
      <div
        className={`mha-toast__icon ${esError ? "mha-toast__icon--error" : "mha-toast__icon--ok"}`}
      >
        <i
          className={`ti ${esError ? "ti-alert-circle" : "ti-circle-check"}`}
        />
      </div>
      <div className="mha-toast__title">{toast.mensaje}</div>
      {esError && (
        <div className="mha-toast__sub">
          Asígnate el ticket usando el botón{" "}
          <strong>Asignarme el incidente</strong> e intenta de nuevo.
        </div>
      )}
    </div>
  );
}

/* ── Tab: Información general ────────────────────────────────── */
function TabInfoGeneral({ sol, onRecargar }) {
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Reutiliza la lógica de SLA de resolución de TabSLA
  const resolInfo = getSlaResolucionInfo(sol);
  const respInfo = getSlaInfo(sol.fechaLimiteResp);

  async function guardarNota() {
    if (!nota.trim()) return;
    setGuardando(true);
    await apiFetch(`/api/mesa-admin/solicitudes/${sol.idSolicitud}/bitacora`, {
      method: "POST",
      body: JSON.stringify({ nota: nota.trim() }),
    });
    setNota("");
    setGuardando(false);
    onRecargar();
  }

  return (
    <div className="mha-det-grid">
      <div className="mha-det-col">
        <div className="mha-det-card">
          <div className="mha-det-card-title">Detalles de la solicitud</div>
          <div className="mha-det-rows">
            {[
              { label: "Folio", val: sol.folio },
              {
                label: "Usuario",
                val: sol.nombreUsuario,
                sub:
                  sol.correoUsuario ??
                  `${sol.idUsuario?.toLowerCase()}@fabpsa.uy`,
              },
              { label: "Departamento", val: sol.areaUsuario },
              { label: "Sitio", val: sol.sitioUsuario },
              { label: "Categoría", val: sol.categoria },
              { label: "Servicio", val: sol.servicio },
              { label: "Prioridad", val: sol.prioridad, color: sol.prioColor },
            ].map((r, i) => (
              <div key={i} className="mha-det-row">
                <span>{r.label}</span>
                <strong style={r.color ? { color: r.color } : {}}>
                  {r.color && "● "}
                  {r.val}
                  {r.sub && <small>{r.sub}</small>}
                </strong>
              </div>
            ))}
            <div className="mha-det-row">
              <span>Estado</span>
              <Chip idEstatus={sol.idEstatus} label={sol.estatus} />
            </div>
          </div>
        </div>
      </div>

      <div className="mha-det-col mha-det-col--wide">
        <div className="mha-det-card">
          <div className="mha-det-card-title">Descripción del incidente</div>
          <p className="mha-det-desc">{sol.descripcion}</p>
          <div className="mha-det-meta">
            <div>
              <i className="ti ti-calendar" />
              <span>Creación</span>
              <strong>{fmtFecha(sol.fechaCreacion, true)}</strong>
            </div>
            <div>
              <i className="ti ti-calendar-check" />
              <span>Actualización</span>
              <strong>{fmtFecha(sol.fechaActualizacion, true)}</strong>
            </div>
            <div>
              <i className="ti ti-user-check" />
              <span>Ingeniero asignado</span>
              <strong>{sol.nombreTecnico ?? "Sin asignar"}</strong>
            </div>
          </div>
        </div>
        <div className="mha-det-card" style={{ marginTop: 10 }}>
          <div className="mha-det-card-title">Bitácora técnica</div>
          {sol.bitacora?.length > 0 && (
            <div className="mha-bitacora-list">
              {sol.bitacora.map((b) => (
                <div key={b.idBitacora} className="mha-bitacora-item">
                  <div className="mha-bitacora-meta">
                    <strong>{b.nombreUsuario}</strong>
                    <span>{fmtFecha(b.fecha, true)}</span>
                  </div>
                  <div className="mha-bitacora-nota">{b.nota}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mha-bitacora-input">
            <textarea
              placeholder="Agregar nota técnica, diagnóstico o avance…"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
            />
            <button
              className="mha-btn-nota"
              disabled={guardando || !nota.trim()}
              onClick={guardarNota}
            >
              <i className="ti ti-plus" /> Agregar nota
            </button>
          </div>
        </div>
      </div>

      <div className="mha-det-col">
        <div className="mha-det-card">
          <div className="mha-det-card-title">Tiempos</div>
          <div className="mha-sla-rows">
            {/* Primera respuesta */}
            <div className="mha-sla-row-item">
              <span>1ª resp. comprometida</span>
              <strong>{fmtFecha(sol.fechaLimiteResp, true)}</strong>
            </div>
            <div className="mha-sla-row-item">
              <span>SLA primera respuesta</span>
              <strong>{hrsAMin(sol.slaRespuestaHrs) ?? "—"} min</strong>
            </div>
            <div className="mha-sla-row-item">
              <span>T. restante respuesta</span>
              <strong style={{ color: respInfo.color }}>
                {respInfo.texto}
              </strong>
            </div>
            {/* Resolución */}
            <div className="mha-sla-row-item" style={{ marginTop: 8 }}>
              <span>Inicio resolución</span>
              <strong>{fmtFecha(sol.fechaInicioResolucion, true)}</strong>
            </div>
            <div className="mha-sla-row-item">
              <span>SLA resolución</span>
              <strong>{resolInfo.slaMin ?? "—"} min</strong>
            </div>
            <div className="mha-sla-row-item">
              <span>T. restante resolución</span>
              <strong style={{ color: resolInfo.color }}>
                {resolInfo.iniciado ? resolInfo.texto : "Sin iniciar"}
              </strong>
            </div>
            {/* Tiempo de atención final (solo si ya concluyó) */}
            {resolInfo.concluido && (
              <div className="mha-sla-row-item">
                <span>Tiempo de resolución</span>
                <strong>{fmtTiempoAtencion(resolInfo.tiempoReal)}</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tab: Evidencias ─────────────────────────────────────────── */
function TabEvidencias({ archivos }) {
  const [preview, setPreview] = useState(null);
  if (!archivos?.length)
    return <div className="mha-empty">Sin evidencias adjuntas.</div>;
  const buildUrl = (ruta) => `${STATIC_BASE}/${ruta}`;
  return (
    <div className="mha-evid-wrap">
      <div className="mha-evid-grid">
        {archivos.map((a) => {
          const url = buildUrl(a.rutaServidor),
            esImg = a.mimeType?.startsWith("image/"),
            esPdf = a.mimeType === "application/pdf";
          return (
            <div
              key={a.idArchivo}
              className="mha-evid-item"
              onClick={() => esImg && setPreview(url)}
              title={a.nombreArchivo}
            >
              <div className="mha-evid-thumb">
                {esImg && (
                  <img
                    src={url}
                    alt={a.nombreArchivo}
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                )}
                {esPdf && (
                  <i
                    className="ti ti-file-type-pdf"
                    style={{ fontSize: 32, color: "var(--danger)" }}
                  />
                )}
                {!esImg && !esPdf && (
                  <i
                    className="ti ti-file"
                    style={{ fontSize: 32, color: "var(--text-muted)" }}
                  />
                )}
              </div>
              <div className="mha-evid-name">{a.nombreArchivo}</div>
              <div className="mha-evid-size">
                {(a.tamanoBytes / 1024).toFixed(0)} KB
              </div>
              {!esImg && (
                <button
                  className="mha-evid-dl"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(url, "_blank");
                  }}
                >
                  <i className="ti ti-download" /> Descargar
                </button>
              )}
            </div>
          );
        })}
      </div>
      {preview && (
        <div className="mha-preview-overlay" onClick={() => setPreview(null)}>
          <div className="mha-preview-box" onClick={(e) => e.stopPropagation()}>
            <button
              className="mha-preview-close"
              onClick={() => setPreview(null)}
            >
              <i className="ti ti-x" />
            </button>
            <img src={preview} alt="preview" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tab: Seguimiento ────────────────────────────────────────── */
// Muestra la bitácora como timeline + permite agregar actividades manuales
function TabSeguimiento({ sol, onRecargar }) {
  const [actividad, setActividad] = useState("");
  const [guardando, setGuardando] = useState(false);
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sol.bitacora]);

  async function guardarActividad() {
    if (!actividad.trim()) return;
    setGuardando(true);
    await apiFetch(`/api/mesa-admin/solicitudes/${sol.idSolicitud}/bitacora`, {
      method: "POST",
      body: JSON.stringify({ nota: actividad.trim() }),
    });
    setActividad("");
    setGuardando(false);
    onRecargar();
  }

  const items = sol.bitacora ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {!items.length && (
          <div className="mha-empty">Sin actividades registradas aún.</div>
        )}
        {items.map((b, i) => (
          <div
            key={b.idBitacora ?? i}
            style={{
              display: "flex",
              gap: 12,
              paddingBottom: i < items.length - 1 ? 16 : 0,
              position: "relative",
            }}
          >
            {/* Línea vertical */}
            {i < items.length - 1 && (
              <div
                style={{
                  position: "absolute",
                  left: 11,
                  top: 22,
                  bottom: 0,
                  width: 1,
                  background: "var(--border)",
                }}
              />
            )}
            {/* Punto */}
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                flexShrink: 0,
                background: "rgba(124,140,248,0.15)",
                border: "2px solid var(--secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 1,
                zIndex: 1,
              }}
            >
              <i
                className="ti ti-point-filled"
                style={{ fontSize: 8, color: "var(--secondary)" }}
              />
            </div>
            {/* Contenido */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {fmtFecha(b.fecha, true)}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-h)",
                  }}
                >
                  {b.nombreUsuario}
                </span>
              </div>
              <div
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  color: "var(--text-body)",
                  lineHeight: 1.6,
                }}
              >
                {b.nota}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input para actividad manual */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 14,
          marginTop: 4,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.3px",
          }}
        >
          Agregar actividad
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            placeholder="Escribe una actividad o nota técnica…"
            value={actividad}
            onChange={(e) => setActividad(e.target.value)}
            rows={2}
            style={{
              flex: 1,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 12,
              resize: "none",
              outline: "none",
              fontFamily: "var(--font-sans)",
              background: "var(--bg-elevated)",
              color: "var(--text-body)",
            }}
          />
          <button
            className="mha-btn-nota"
            disabled={guardando || !actividad.trim()}
            onClick={guardarActividad}
          >
            <i className="ti ti-plus" /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Tab: SLA ────────────────────────────────────────────────── */
function TabSLA({ sol }) {
  const respInfo = getSlaInfo(sol.fechaLimiteResp);
  const resolInfo = getSlaResolucionInfo(sol);
  const r = 36,
    circ = 2 * Math.PI * r;

  function Ring({ info, pct }) {
    const usePct = pct ?? info.pct;
    const offset = circ - (usePct / 100) * circ;
    return (
      <div className="mha-sla-ring-wrap">
        <svg width="90" height="90" viewBox="0 0 90 90">
          <circle
            cx="45"
            cy="45"
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth="7"
          />
          <circle
            cx="45"
            cy="45"
            r={r}
            fill="none"
            stroke={info.color}
            strokeWidth="7"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 45 45)"
          />
        </svg>
        <div className="mha-sla-ring-center">
          <span style={{ color: info.color, fontWeight: 600, fontSize: 15 }}>
            {info.texto}
          </span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
            restante
          </span>
        </div>
      </div>
    );
  }

  const estadoLabel = (i) =>
    i.min == null
      ? "—"
      : i.min < 0
        ? "Vencida"
        : i.min < 60
          ? "Crítico"
          : i.min < 180
            ? "En riesgo"
            : "En tiempo";

  const estadoBg = (i) =>
    i.min == null || i.min < 0 || i.min < 60
      ? "rgba(243,139,168,0.12)"
      : i.min < 180
        ? "rgba(246,193,119,0.12)"
        : "rgba(76,201,166,0.12)";

  return (
    <div className="mha-sla-tab">
      {/* Primera respuesta */}
      <div className="mha-sla-block">
        <div className="mha-sla-block-title">Primera respuesta</div>
        <div className="mha-sla-block-inner">
          <Ring info={respInfo} />
          <div className="mha-sla-block-rows">
            <div className="mha-sla-row-item">
              <span>Comprometida</span>
              <strong>{fmtFecha(sol.fechaLimiteResp, true)}</strong>
            </div>
            <div className="mha-sla-row-item">
              <span>Tiempo restante</span>
              <strong style={{ color: respInfo.color, fontWeight: 600 }}>
                {respInfo.texto}
              </strong>
            </div>
            <div className="mha-sla-row-item">
              <span>SLA</span>
              {/* En minutos */}
              <strong>{hrsAMin(sol.slaRespuestaHrs) ?? "—"} min</strong>
            </div>
            <div className="mha-sla-row-item">
              <span>Estado</span>
              <span
                className="mha-chip"
                style={{
                  background: estadoBg(respInfo),
                  color: respInfo.color,
                }}
              >
                {estadoLabel(respInfo)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Resolución */}
      <div className="mha-sla-block">
        <div className="mha-sla-block-title">Resolución</div>
        {!resolInfo.iniciado ? (
          <div className="mha-tac-nd">
            <span>—</span>
            <small>
              El SLA de resolución comienza cuando el ticket pase a{" "}
              <strong>En proceso</strong>.
              <br />
              SLA configurado: <strong>{resolInfo.slaMin ?? "—"} min</strong>
            </small>
          </div>
        ) : (
          <div className="mha-sla-block-inner">
            <Ring info={resolInfo} pct={resolInfo.pct} />
            <div className="mha-sla-block-rows">
              <div className="mha-sla-row-item">
                <span>Inicio</span>
                <strong>{fmtFecha(sol.fechaInicioResolucion, true)}</strong>
              </div>
              <div className="mha-sla-row-item">
                <span>Tiempo restante</span>
                <strong style={{ color: resolInfo.color, fontWeight: 600 }}>
                  {resolInfo.texto}
                  {resolInfo.pausado && " ⏸"}
                </strong>
              </div>
              <div className="mha-sla-row-item">
                <span>SLA</span>
                <strong>{resolInfo.slaMin ?? "—"} min</strong>
              </div>
              {resolInfo.concluido && (
                <div className="mha-sla-row-item">
                  <span>Tiempo real</span>
                  <strong>{fmtTiempoAtencion(resolInfo.tiempoReal)}</strong>
                </div>
              )}
              <div className="mha-sla-row-item">
                <span>Estado</span>
                <span
                  className="mha-chip"
                  style={{
                    background: estadoBg(resolInfo),
                    color: resolInfo.color,
                  }}
                >
                  {resolInfo.pausado
                    ? "En pausa"
                    : resolInfo.concluido
                      ? resolInfo.min >= 0
                        ? "En tiempo"
                        : "Vencido"
                      : estadoLabel(resolInfo)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tiempo de atención */}
      <div className="mha-sla-block">
        <div className="mha-sla-block-title">Tiempo de atención</div>
        {sol.tiempoAtencionMin != null ? (
          <div className="mha-tac-val">
            {fmtTiempoAtencion(sol.tiempoAtencionMin)}
          </div>
        ) : (
          <div className="mha-tac-nd">
            <span>—</span>
            <small>Se calculará al marcar como resuelto o cerrado.</small>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Tab: Comentarios ────────────────────────────────────────── */
function TabComentarios({ sol, onNuevoComentario }) {
  const [texto, setTexto] = useState(""),
    [enviando, setEnviando] = useState(false);
  const bottomRef = useRef();
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sol.comentarios]);
  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    await apiFetch(
      `/api/mesa-admin/solicitudes/${sol.idSolicitud}/comentarios`,
      { method: "POST", body: JSON.stringify({ comentario: texto.trim() }) },
    );
    setTexto("");
    setEnviando(false);
    onNuevoComentario();
  }
  return (
    <div className="mha-com-wrap">
      <div className="mha-com-list">
        {!sol.comentarios?.length && (
          <div className="mha-empty">Sin comentarios aún.</div>
        )}
        {sol.comentarios?.map((c) => (
          <div
            key={c.idComentario}
            className={`mha-com-item ${c.esInterno ? "mha-com-tec" : "mha-com-usr"}`}
          >
            <div className="mha-com-av">
              {c.nombreUsuario?.substring(0, 2).toUpperCase()}
            </div>
            <div className="mha-com-bubble">
              <div className="mha-com-meta">
                <strong>{c.nombreUsuario}</strong>
                <span className="mha-com-rol">
                  {c.esInterno ? "Ingeniero TI" : "Usuario"}
                </span>
                <span className="mha-com-fecha">{fmtFecha(c.fecha, true)}</span>
              </div>
              <div className="mha-com-text">{c.comentario}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="mha-com-input">
        <textarea
          placeholder="Escribe un comentario…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          rows={2}
        />
        <button
          onClick={enviar}
          disabled={enviando || !texto.trim()}
          className="mha-btn-send"
        >
          <i className="ti ti-send" />
        </button>
      </div>
    </div>
  );
}

/* ── Tab: Evaluación ─────────────────────────────────────────── */
function TabEvaluacion({ sol }) {
  const ev = sol.evaluacion;
  if (!ev)
    return (
      <div
        className="mha-empty"
        style={{ flexDirection: "column", gap: 8, paddingTop: 32 }}
      >
        <i
          className="ti ti-star"
          style={{
            fontSize: 32,
            color: "var(--text-muted)",
            display: "block",
            marginBottom: 6,
          }}
        />
        El usuario aún no ha evaluado este ticket.
      </div>
    );
  return (
    <div style={{ padding: "4px 0", maxWidth: 500 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 16,
        }}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <i
            key={n}
            className={`ti ${n <= ev.estrellas ? "ti-star-filled" : "ti-star"}`}
            style={{
              fontSize: 24,
              color: n <= ev.estrellas ? "#f59e0b" : "var(--border)",
            }}
          />
        ))}
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-h)",
            marginLeft: 8,
          }}
        >
          {ev.estrellas} / 5
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 500,
            padding: "3px 10px",
            borderRadius: 20,
            background:
              ev.estrellas >= 4
                ? "rgba(76,201,166,0.12)"
                : ev.estrellas >= 3
                  ? "rgba(246,193,119,0.12)"
                  : "rgba(243,139,168,0.12)",
            color:
              ev.estrellas >= 4
                ? "#4cc9a6"
                : ev.estrellas >= 3
                  ? "#f6c177"
                  : "#f38ba8",
          }}
        >
          {ev.estrellas >= 4
            ? "Satisfecho"
            : ev.estrellas >= 3
              ? "Regular"
              : "Insatisfecho"}
        </span>
      </div>
      {ev.comentario ? (
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--text-body)",
            lineHeight: 1.7,
            position: "relative",
          }}
        >
          <i
            className="ti ti-quote"
            style={{
              fontSize: 20,
              color: "var(--border)",
              position: "absolute",
              top: 10,
              right: 12,
            }}
          />
          {ev.comentario}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          El usuario no dejó comentario adicional.
        </p>
      )}
      <div
        style={{
          marginTop: 12,
          fontSize: 11,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <i className="ti ti-calendar-check" style={{ fontSize: 14 }} /> Evaluado
        el {fmtFecha(ev.fecha, true)}
      </div>
    </div>
  );
}

/* ── Modales ─────────────────────────────────────────────────── */
function ModalEscalar({ sol, onConfirm, onClose }) {
  const [escalaA, setEscalaA] = useState(""),
    [motivo, setMotivo] = useState(""),
    [guardando, setGuardando] = useState(false);
  async function confirmar(e) {
    e.stopPropagation();
    if (!escalaA.trim()) return;
    setGuardando(true);
    await onConfirm(escalaA.trim(), motivo.trim());
    setGuardando(false);
  }
  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "9px 12px",
    fontSize: 13,
    background: "var(--bg-base)",
    color: "var(--text-body)",
    outline: "none",
    fontFamily: "inherit",
  };
  return (
    <div className="mha-modal-overlay" onClick={onClose}>
      <div
        className="mha-modal mha-modal--escalar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mha-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "rgba(243,139,168,0.15)",
                color: "#f38ba8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              <i className="ti ti-arrow-up-circle" />
            </span>
            Escalar incidente
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 16,
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>
        {sol?.folio && (
          <div
            style={{
              padding: "8px 16px",
              background: "var(--bg-elevated)",
              borderBottom: "1px solid var(--border)",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            Ticket:{" "}
            <span style={{ color: "var(--secondary)", fontWeight: 500 }}>
              {sol.folio}
            </span>
          </div>
        )}
        <div
          className="mha-modal-body"
          style={{
            padding: 16,
            gap: 14,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              ¿A quién se escala?{" "}
              <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="Ej. Multivisión, IISI, Telmex…"
              value={escalaA}
              onChange={(e) => setEscalaA(e.target.value)}
              autoFocus
              style={inputStyle}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              Motivo del escalamiento{" "}
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-faint)",
                  fontWeight: 400,
                }}
              >
                (opcional)
              </span>
            </label>
            <textarea
              placeholder="Describe el motivo…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: 72 }}
            />
          </div>
        </div>
        <div className="mha-modal-foot">
          <button className="mha-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="mha-btn-primary"
            disabled={!escalaA.trim() || guardando}
            onClick={confirmar}
            style={{ background: "#f38ba8", border: "none" }}
          >
            {guardando ? (
              <>
                <i className="ti ti-loader-2" /> Escalando…
              </>
            ) : (
              <>
                <i className="ti ti-arrow-up-circle" /> Confirmar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEstatus({ onConfirm, onClose }) {
  const [sel, setSel] = useState("");
  return (
    <div className="mha-modal-overlay" onClick={onClose}>
      <div className="mha-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mha-modal-head">
          Cambiar estado{" "}
          <button onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="mha-modal-body">
          {Object.entries(ESTATUS_MAP).map(([id, cfg]) => (
            <div
              key={id}
              className={`mha-modal-opt ${sel === id ? "mha-modal-opt--sel" : ""}`}
              onClick={() => setSel(id)}
            >
              <span
                className="mha-chip"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                {cfg.label}
              </span>
            </div>
          ))}
        </div>
        <div className="mha-modal-foot">
          <button className="mha-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="mha-btn-primary"
            disabled={!sel}
            onClick={() => onConfirm(parseInt(sel))}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalPrioridad({ prioridades, onConfirm, onClose }) {
  const [sel, setSel] = useState(null);
  return (
    <div className="mha-modal-overlay" onClick={onClose}>
      <div className="mha-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mha-modal-head">
          Cambiar prioridad{" "}
          <button onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="mha-modal-body">
          {prioridades.map((p) => (
            <div
              key={p.idPrioridad}
              className={`mha-modal-opt ${sel === p.idPrioridad ? "mha-modal-opt--sel" : ""}`}
              onClick={() => setSel(p.idPrioridad)}
            >
              <span style={{ color: p.colorHex, fontWeight: 500 }}>
                ● {p.prioridad}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Resp: {p.slaRespuestaHrs}h · Resol: {p.slaResolucionHrs}h
              </span>
            </div>
          ))}
        </div>
        <div className="mha-modal-foot">
          <button className="mha-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="mha-btn-primary"
            disabled={!sel}
            onClick={() => onConfirm(sel)}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalTransferir({ tecnicos, onConfirm, onClose }) {
  const [sel, setSel] = useState(null);
  return (
    <div className="mha-modal-overlay" onClick={onClose}>
      <div className="mha-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mha-modal-head">
          Transferir incidente{" "}
          <button onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="mha-modal-body">
          {tecnicos.map((t) => (
            <div
              key={t.login}
              className={`mha-modal-opt ${sel?.login === t.login ? "mha-modal-opt--sel" : ""}`}
              onClick={() => setSel(t)}
            >
              <div className="mha-tec">
                <div className="mha-tec-av">
                  {t.name?.substring(0, 2).toUpperCase()}
                </div>
                {t.name}
              </div>
            </div>
          ))}
        </div>
        <div className="mha-modal-foot">
          <button className="mha-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="mha-btn-primary"
            disabled={!sel}
            onClick={() => onConfirm(sel)}
          >
            Transferir
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Barra de acciones ───────────────────────────────────────── */
function BarraAcciones({ sol, onAccion }) {
  if (ticketBloqueado(sol))
    return (
      <div className="mha-action-bar">
        <i
          className="ti ti-lock"
          style={{ color: "var(--text-muted)", fontSize: 14 }}
        />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Ticket cerrado — no hay acciones disponibles
        </span>
      </div>
    );

  const sinResponsable = !sol.tecnicoAsignado;
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  const tooltip = sinResponsable
    ? "Asigna un responsable antes de realizar acciones sobre este ticket."
    : "";

  return (
    <div className="mha-action-bar">
      <span className="mha-action-label">Acciones rápidas</span>

      {/* Asignar siempre disponible */}
      <button
        className="mha-action-btn mha-action-btn--primary"
        onClick={stop(() => onAccion("asignar"))}
      >
        <i className="ti ti-user-plus" /> Asignarme el incidente
      </button>

      {/* El resto requiere responsable */}
      <button
        className="mha-action-btn mha-action-btn--outline"
        title={tooltip}
        disabled={sinResponsable}
        onClick={stop(() => onAccion("estatus"))}
      >
        <i className="ti ti-refresh" /> Cambiar estado{" "}
        <i className="ti ti-chevron-down" />
      </button>

      {/* Pausa / Reanudar según estatus */}
      {sol.idEstatus === 2 && (
        <button
          className="mha-action-btn mha-action-btn--outline"
          title={tooltip}
          disabled={sinResponsable}
          onClick={stop(() => onAccion("pausar"))}
        >
          <i className="ti ti-player-pause" /> Pausar
        </button>
      )}
      {sol.idEstatus === 6 && (
        <button
          className="mha-action-btn mha-action-btn--outline"
          title={tooltip}
          disabled={sinResponsable}
          onClick={stop(() => onAccion("reanudar"))}
        >
          <i className="ti ti-player-play" /> Reanudar
        </button>
      )}

      <button
        className="mha-action-btn mha-action-btn--outline"
        title={tooltip}
        disabled={sinResponsable}
        onClick={stop(() => onAccion("prioridad"))}
      >
        <i className="ti ti-flag" /> Cambiar prioridad{" "}
        <i className="ti ti-chevron-down" />
      </button>
      <button
        className="mha-action-btn mha-action-btn--outline"
        title={tooltip}
        disabled={sinResponsable}
        onClick={stop(() => onAccion("transferir"))}
      >
        <i className="ti ti-transfer" /> Transferir incidente{" "}
        <i className="ti ti-chevron-down" />
      </button>
      <button
        className="mha-action-btn mha-action-btn--outline"
        title={tooltip}
        disabled={sinResponsable}
        onClick={stop(() => onAccion("escalar"))}
      >
        <i className="ti ti-arrow-up-circle" /> Escalar incidente{" "}
        <i className="ti ti-chevron-down" />
      </button>
      <button
        className="mha-action-btn mha-action-btn--green"
        title={tooltip}
        disabled={sinResponsable}
        onClick={stop(() => onAccion("resolver"))}
      >
        <i className="ti ti-circle-check" /> Marcar como resuelto
      </button>
    </div>
  );
}

/* ── Panel expandido escritorio ──────────────────────────────── */
function PanelExpandido({ sol, onAccion, onNuevoComentario, onRecargar }) {
  const [tab, setTab] = useState(0);
  // Nuevo tab "Seguimiento" en índice 1, desplaza el resto
  const tabs = [
    { label: "Información general" },
    {
      label: "Seguimiento",
      badge: sol.bitacora?.length > 0 ? sol.bitacora.length : null,
    },
    {
      label: "Evidencias",
      badge: sol.archivos?.length > 0 ? sol.archivos.length : null,
    },
    { label: "Información SLA" },
    {
      label: "Comentarios",
      badge: sol.comentarios?.length > 0 ? sol.comentarios.length : null,
    },
    { label: "Evaluación", badge: sol.evaluacion ? "star" : null },
  ];
  return (
    <tr className="mha-expand-row">
      <td colSpan={17}>
        <div className="mha-expand-panel">
          <div className="mha-expand-tabs">
            {tabs.map((t, i) => (
              <button
                key={i}
                className={`mha-expand-tab ${tab === i ? "mha-expand-tab--active" : ""}`}
                onClick={() => setTab(i)}
              >
                {t.label}
                {t.badge && t.badge !== "star" && (
                  <span className="mha-tab-badge">{t.badge}</span>
                )}
                {t.badge === "star" && (
                  <span className="mha-tab-badge mha-tab-badge--star">★</span>
                )}
              </button>
            ))}
          </div>
          <div className="mha-expand-content">
            {tab === 0 && <TabInfoGeneral sol={sol} onRecargar={onRecargar} />}
            {tab === 1 && <TabSeguimiento sol={sol} onRecargar={onRecargar} />}
            {tab === 2 && <TabEvidencias archivos={sol.archivos} />}
            {tab === 3 && <TabSLA sol={sol} />}
            {tab === 4 && (
              <TabComentarios sol={sol} onNuevoComentario={onNuevoComentario} />
            )}
            {tab === 5 && <TabEvaluacion sol={sol} />}
          </div>
          <BarraAcciones sol={sol} onAccion={onAccion} />
        </div>
      </td>
    </tr>
  );
}

/* ── Panel expandido móvil ───────────────────────────────────── */
function PanelExpandidoMobile({
  sol,
  onAccion,
  onNuevoComentario,
  onRecargar,
}) {
  const [tab, setTab] = useState(0);
  const tabs = [
    { label: "Info" },
    {
      label: "Seguimiento",
      badge: sol.bitacora?.length > 0 ? sol.bitacora.length : null,
    },
    {
      label: "Evidencias",
      badge: sol.archivos?.length > 0 ? sol.archivos.length : null,
    },
    { label: "SLA" },
    {
      label: "Comentarios",
      badge: sol.comentarios?.length > 0 ? sol.comentarios.length : null,
    },
    { label: "Evaluación", badge: sol.evaluacion ? "star" : null },
  ];
  return (
    <>
      <div className="mha-expand-tabs">
        {tabs.map((t, i) => (
          <button
            key={i}
            className={`mha-expand-tab ${tab === i ? "mha-expand-tab--active" : ""}`}
            onClick={() => setTab(i)}
          >
            {t.label}
            {t.badge && t.badge !== "star" && (
              <span className="mha-tab-badge">{t.badge}</span>
            )}
            {t.badge === "star" && (
              <span className="mha-tab-badge mha-tab-badge--star">★</span>
            )}
          </button>
        ))}
      </div>
      <div className="mha-expand-content">
        {tab === 0 && <TabInfoGeneral sol={sol} onRecargar={onRecargar} />}
        {tab === 1 && <TabSeguimiento sol={sol} onRecargar={onRecargar} />}
        {tab === 2 && <TabEvidencias archivos={sol.archivos} />}
        {tab === 3 && <TabSLA sol={sol} />}
        {tab === 4 && (
          <TabComentarios sol={sol} onNuevoComentario={onNuevoComentario} />
        )}
        {tab === 5 && <TabEvaluacion sol={sol} />}
      </div>
      <BarraAcciones sol={sol} onAccion={onAccion} />
    </>
  );
}

/* ── Mobile Card ─────────────────────────────────────────────── */
function MobileCard({
  s,
  isExp,
  det,
  onToggle,
  onAccion,
  onNuevoComentario,
  onRecargar,
}) {
  const { texto: slaTxt, color: slaColor } = getSlaInfo(s.fechaLimiteResp);
  const icono = getServicioIcono(s.servicio, s.servicioIcono);
  const bloqueado = ticketBloqueado(s);
  const sinResponsable = !s.tecnicoAsignado;
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <div
      className={`mha-card-mobile ${isExp ? "mha-card-mobile--exp" : ""}`}
      onClick={onToggle}
    >
      <div className="mha-card-mobile__head">
        <span className="mha-card-mobile__folio">{s.folio}</span>
        <Chip idEstatus={s.idEstatus} label={s.estatus} />
        {![3, 4, 5].includes(s.idEstatus) && (
          <span className="mha-card-mobile__sla" style={{ color: slaColor }}>
            {slaTxt}
          </span>
        )}
        <i className="ti ti-chevron-down mha-card-mobile__chevron" />
      </div>
      <div className="mha-card-mobile__body">
        {[
          { label: "Usuario", val: s.nombreUsuario },
          {
            label: "Área",
            val: `${s.areaUsuario ?? "—"} · ${s.sitioUsuario ?? "—"}`,
            muted: true,
          },
          { label: "Prioridad", val: `● ${s.prioridad}`, color: s.prioColor },
          {
            label: "Ingeniero",
            val: s.nombreTecnico ?? "Sin asignar",
            muted: true,
          },
          {
            label: "Creación",
            val: fmtFecha(s.fechaCreacion, true),
            muted: true,
          },
        ].map(({ label, val, muted, color }) => (
          <div key={label} className="mha-card-mobile__row">
            <span className="mha-card-mobile__label">{label}</span>
            <span
              className={`mha-card-mobile__val${muted ? " mha-card-mobile__val--muted" : ""}`}
              style={color ? { color, fontWeight: 600 } : {}}
            >
              {val}
            </span>
          </div>
        ))}
      </div>
      {bloqueado ? (
        <div className="mha-card-mobile__blocked">
          <i className="ti ti-lock" />
          <span>Ticket cerrado</span>
        </div>
      ) : (
        <div
          className="mha-card-mobile__foot"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="mha-card-mobile__action mha-card-mobile__action--primary"
            onClick={stop(() => onAccion("asignar", s))}
          >
            <i className="ti ti-user-plus" />
            <span>Asignar</span>
          </button>
          <button
            className="mha-card-mobile__action"
            disabled={sinResponsable}
            onClick={stop(() => onAccion("estatus", s))}
          >
            <i className="ti ti-refresh" />
            <span>Estado</span>
          </button>
          <button
            className="mha-card-mobile__action"
            disabled={sinResponsable}
            onClick={stop(() => onAccion("prioridad", s))}
          >
            <i className="ti ti-flag" />
            <span>Prioridad</span>
          </button>
          <button
            className="mha-card-mobile__action"
            disabled={sinResponsable}
            onClick={stop(() => onAccion("escalar", s))}
          >
            <i className="ti ti-arrow-up-circle" />
            <span>Escalar</span>
          </button>
          <button
            className="mha-card-mobile__action mha-card-mobile__action--green"
            disabled={sinResponsable}
            onClick={stop(() => onAccion("resolver", s))}
          >
            <i className="ti ti-circle-check" />
            <span>Resolver</span>
          </button>
        </div>
      )}
      {isExp && det && (
        <div
          className="mha-card-mobile__expand"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mha-expand-panel">
            <PanelExpandidoMobile
              sol={det}
              onAccion={(tipo) => onAccion(tipo, det)}
              onNuevoComentario={onNuevoComentario}
              onRecargar={onRecargar}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════ */
export default function MesaAyudaAdminPage() {
  const { user } = useContext(AuthContext);
  const [kpis, setKpis] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState(null);
  const [detalles, setDetalles] = useState({});
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [prioridades, setPrioridades] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState({
    estatus: "",
    prioridad: "",
    categoria: "",
    tecnico: "",
  });
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Refs para polling silencioso
  const pollingRef = useRef(null);
  const expandidoRef = useRef(null);
  expandidoRef.current = expandido;

  function mostrarToast(tipo, mensaje) {
    setToast({ tipo, mensaje });
    setTimeout(() => setToast(null), 4500);
  }

  const cargarKPIs = useCallback(async () => {
    const res = await apiFetch("/api/mesa-admin/kpis");
    if (res.ok) setKpis(res.data);
  }, []);

  // cargarSolicitudes silent=true no toca setLoading → sin parpadeo
  const cargarSolicitudes = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const params = new URLSearchParams({ pagina, porPagina: 10 });
      if (busqueda) params.set("busqueda", busqueda);
      if (fechaDesde) params.set("fechaDesde", fechaDesde);
      if (fechaHasta) params.set("fechaHasta", fechaHasta);
      Object.entries(filtros).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const res = await apiFetch(`/api/mesa-admin/solicitudes?${params}`);
      if (res.ok) {
        setSolicitudes(res.data);
        setTotal(res.total);
      }
      if (!silent) setLoading(false);
    },
    [pagina, busqueda, filtros, fechaDesde, fechaHasta],
  );

  useEffect(() => {
    cargarKPIs();
    apiFetch("/api/mesa-admin/prioridades").then(
      (r) => r.ok && setPrioridades(r.data),
    );
    apiFetch("/api/mesa-admin/tecnicos-sistemas").then(
      (r) => r.ok && setTecnicos(r.data),
    );
  }, []);

  useEffect(() => {
    cargarSolicitudes(false);
  }, [cargarSolicitudes]);

  // Polling silencioso cada 20 segundos
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      cargarSolicitudes(true);
      cargarKPIs();
      // Si hay detalle abierto, refrescarlo también silenciosamente
      if (expandidoRef.current) {
        apiFetch(`/api/mesa-admin/solicitudes/${expandidoRef.current}`).then(
          (res) => {
            if (res.ok)
              setDetalles((p) => ({ ...p, [expandidoRef.current]: res.data }));
          },
        );
      }
    }, 20000);
    return () => clearInterval(pollingRef.current);
  }, [cargarSolicitudes, cargarKPIs]);

  async function toggleExpandir(sol) {
    if (expandido === sol.idSolicitud) {
      setExpandido(null);
      return;
    }
    setExpandido(sol.idSolicitud);
    if (!detalles[sol.idSolicitud]) {
      const res = await apiFetch(
        `/api/mesa-admin/solicitudes/${sol.idSolicitud}`,
      );
      if (res.ok) setDetalles((p) => ({ ...p, [sol.idSolicitud]: res.data }));
    }
  }

  async function recargarDetalle(idSolicitud) {
    const res = await apiFetch(`/api/mesa-admin/solicitudes/${idSolicitud}`);
    if (res.ok) setDetalles((p) => ({ ...p, [idSolicitud]: res.data }));
  }

  async function handleAccion(tipo, sol) {
    const id = sol?.idSolicitud;
    if (!id) return;

    // Asignar: siempre permitido
    if (tipo === "asignar") {
      await apiFetch(`/api/mesa-admin/solicitudes/${id}/asignar`, {
        method: "PUT",
      });
      cargarKPIs();
      cargarSolicitudes(true);
      recargarDetalle(id);
      return;
    }

    // Para el resto: validar responsable en frontend también
    if (!sol.tecnicoAsignado) {
      mostrarToast(
        "error",
        "Asigna un responsable antes de realizar acciones sobre este ticket.",
      );
      return;
    }

    if (tipo === "resolver") {
      const res = await apiFetch(`/api/mesa-admin/solicitudes/${id}/estatus`, {
        method: "PUT",
        body: JSON.stringify({ idEstatus: 3 }),
      });
      if (res.__httpError || res.ok === false) {
        mostrarToast(
          "error",
          res.message || "No se pudo marcar como resuelto.",
        );
        return;
      }
      cargarKPIs();
      cargarSolicitudes(true);
      recargarDetalle(id);
    } else if (tipo === "pausar") {
      // Cambiar a "En pausa" (6) directamente sin modal
      const res = await apiFetch(`/api/mesa-admin/solicitudes/${id}/estatus`, {
        method: "PUT",
        body: JSON.stringify({ idEstatus: 6 }),
      });
      if (res.__httpError || res.ok === false) {
        mostrarToast("error", res.message || "No se pudo pausar el ticket.");
        return;
      }
      mostrarToast("ok", "Ticket puesto en pausa");
      cargarKPIs();
      cargarSolicitudes(true);
      recargarDetalle(id);
    } else if (tipo === "reanudar") {
      // Reanudar → volver a "En proceso" (2)
      const res = await apiFetch(`/api/mesa-admin/solicitudes/${id}/estatus`, {
        method: "PUT",
        body: JSON.stringify({ idEstatus: 2 }),
      });
      if (res.__httpError || res.ok === false) {
        mostrarToast("error", res.message || "No se pudo reanudar el ticket.");
        return;
      }
      mostrarToast("ok", "Ticket reanudado");
      cargarKPIs();
      cargarSolicitudes(true);
      recargarDetalle(id);
    } else {
      setModal({ tipo, sol });
    }
  }

  async function confirmarEstatus(idEstatus) {
    if (idEstatus === 8) {
      setModal({ tipo: "escalar", sol: modal.sol });
      return;
    }
    const res = await apiFetch(
      `/api/mesa-admin/solicitudes/${modal.sol.idSolicitud}/estatus`,
      { method: "PUT", body: JSON.stringify({ idEstatus }) },
    );
    if (res.__httpError || res.ok === false) {
      mostrarToast("error", res.message || "No se pudo cambiar el estado.");
      setModal(null);
      return;
    }
    setModal(null);
    cargarKPIs();
    cargarSolicitudes(true);
    recargarDetalle(modal.sol.idSolicitud);
  }

  async function confirmarPrioridad(idPrioridad) {
    const res = await apiFetch(
      `/api/mesa-admin/solicitudes/${modal.sol.idSolicitud}/prioridad`,
      { method: "PUT", body: JSON.stringify({ idPrioridad }) },
    );
    if (res.__httpError || res.ok === false) {
      mostrarToast("error", res.message || "No se pudo cambiar la prioridad.");
    }
    setModal(null);
    cargarSolicitudes(true);
    recargarDetalle(modal.sol.idSolicitud);
  }

  async function confirmarEscalar(escalaA, motivo) {
    const id = modal.sol.idSolicitud;
    await apiFetch(`/api/mesa-admin/solicitudes/${id}/escalar`, {
      method: "PUT",
      body: JSON.stringify({ escalaA, comentario: motivo }),
    });
    setModal(null);
    mostrarToast("ok", `Incidente escalado a ${escalaA}`);
    cargarKPIs();
    cargarSolicitudes(true);
    recargarDetalle(id);
  }

  async function confirmarTransferir(tecnico) {
    await apiFetch(
      `/api/mesa-admin/solicitudes/${modal.sol.idSolicitud}/transferir`,
      {
        method: "PUT",
        body: JSON.stringify({
          tecnicoLogin: tecnico.login,
          nombreTecnico: tecnico.name,
        }),
      },
    );
    setModal(null);
    cargarSolicitudes(true);
    recargarDetalle(modal.sol.idSolicitud);
  }

  function exportarExcel() {
    const rows = solicitudes.map((s) => ({
      Folio: s.folio,
      Usuario: s.nombreUsuario,
      Email: `${s.idUsuario?.toLowerCase()}@fabpsa.com.mx`,
      Departamento: s.areaUsuario,
      Sitio: s.sitioUsuario,
      Categoría: s.categoria,
      Servicio: s.servicio,
      Prioridad: s.prioridad,
      Estado: s.estatus,
      "Escalado a": s.escalaA ?? "",
      "Ingeniero asignado": s.nombreTecnico ?? "Sin asignar",
      "SLA restante": getSlaInfo(s.fechaLimiteResp).texto,
      "Tiempo atención": fmtTiempoAtencion(s.tiempoAtencionMin),
      Creación: fmtFecha(s.fechaCreacion),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
    XLSX.writeFile(
      wb,
      `solicitudes_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  const totalPags = Math.ceil(total / 10);

  return (
    <div className="mha-root">
      <Toast toast={toast} />

      {/* KPIs */}
      <div className="mha-kpis">
        <KpiCard
          icon="ti-inbox"
          iconBg="rgba(124,140,248,0.12)"
          iconColor="#7c8cf8"
          label="Abiertas"
          sub="solicitudes activas"
          num={kpis?.abiertas}
          accentClass="mha-kpi--violet"
          accentNum
        />
        <KpiCard
          icon="ti-loader-2"
          iconBg="rgba(76,201,166,0.12)"
          iconColor="#4cc9a6"
          label="En proceso"
          sub="con ingeniero asignado"
          num={kpis?.enProgreso}
          accentClass="mha-kpi--emerald"
        />
        <KpiCard
          icon="ti-user-question"
          iconBg="rgba(245,158,11,0.12)"
          iconColor="#f59e0b"
          label="Sin asignar"
          sub="pendientes de atención"
          num={kpis?.sinAsignar}
          accentClass="mha-kpi--amber"
        />
        <KpiCard
          icon="ti-clock-exclamation"
          iconBg="rgba(234,88,12,0.12)"
          iconColor="#ea580c"
          label="Por vencer"
          sub="SLA en riesgo"
          num={kpis?.proximasVencer}
          accentClass="mha-kpi--orange"
        />
        <KpiCard
          icon="ti-alert-triangle"
          iconBg="rgba(239,68,68,0.12)"
          iconColor="#ef4444"
          label="Vencidas"
          sub="SLA incumplido"
          num={kpis?.vencidas}
          accentClass="mha-kpi--red"
          accentNum
        />
        <KpiCard
          icon="ti-circle-check"
          iconBg="rgba(20,184,166,0.12)"
          iconColor="#14b8a6"
          label="Resueltas hoy"
          sub="cerradas en el día"
          num={kpis?.resueltasHoy}
          accentClass="mha-kpi--teal"
        />
      </div>

      {/* Filtros */}
      <div className="mha-filters">
        <div className="mha-filter-row">
          {[
            {
              key: "estatus",
              label: "Estado",
              opts: Object.entries(ESTATUS_MAP).map(([id, c]) => ({
                v: id,
                l: c.label,
              })),
            },
            {
              key: "prioridad",
              label: "Prioridad",
              opts: prioridades.map((p) => ({
                v: p.idPrioridad,
                l: p.prioridad,
              })),
            },
            {
              key: "tecnico",
              label: "Ingeniero asignado",
              opts: tecnicos.map((t) => ({ v: t.login, l: t.name })),
            },
          ].map(({ key, label, opts }) => (
            <div key={key} className="mha-filter-item">
              <span className="mha-filter-label">{label}:</span>
              <select
                className="mha-filter-select"
                value={filtros[key]}
                onChange={(e) => {
                  setFiltros((p) => ({ ...p, [key]: e.target.value }));
                  setPagina(1);
                }}
              >
                <option value="">Todos</option>
                {opts.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="mha-filter-row2">
          <div className="mha-filter-item">
            <i
              className="ti ti-calendar"
              style={{ color: "var(--text-muted)" }}
            />
            <span className="mha-filter-label">Desde:</span>
            <input
              type="date"
              className="mha-filter-select"
              value={fechaDesde}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setPagina(1);
              }}
            />
          </div>
          <div className="mha-filter-item">
            <span className="mha-filter-label">Hasta:</span>
            <input
              type="date"
              className="mha-filter-select"
              value={fechaHasta}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setPagina(1);
              }}
            />
          </div>
          {(fechaDesde || fechaHasta) && (
            <button
              className="mha-filter-clear"
              onClick={() => {
                setFechaDesde("");
                setFechaHasta("");
              }}
            >
              <i className="ti ti-x" /> Limpiar fechas
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            className="mha-btn-refresh"
            onClick={() => cargarSolicitudes(false)}
          >
            <i className="ti ti-refresh" /> Actualizar
          </button>
          <button className="mha-btn-export" onClick={exportarExcel}>
            <i className="ti ti-table-export" /> Exportar{" "}
            <i className="ti ti-chevron-down" />
          </button>
        </div>
      </div>

      {/* Cards móvil */}
      <div className="mha-cards-mobile">
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            <i className="ti ti-loader-2" /> Cargando…
          </div>
        )}
        {!loading && !solicitudes.length && (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No hay solicitudes.
          </div>
        )}
        {!loading &&
          solicitudes.map((s) => (
            <MobileCard
              key={s.idSolicitud}
              s={s}
              isExp={expandido === s.idSolicitud}
              det={detalles[s.idSolicitud]}
              onToggle={() => toggleExpandir(s)}
              onAccion={handleAccion}
              onNuevoComentario={() => recargarDetalle(s.idSolicitud)}
              onRecargar={() => recargarDetalle(s.idSolicitud)}
            />
          ))}
        {!loading && totalPags > 1 && (
          <div className="mha-pager-mobile">
            <span className="mha-pager-mobile__info">{total} resultados</span>
            <div className="mha-pager-mobile__btns">
              <button
                className="mha-pager-mobile__btn"
                disabled={pagina === 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                <i className="ti ti-chevron-left" />
              </button>
              <span className="mha-pager-mobile__page">
                {pagina} / {totalPags}
              </span>
              <button
                className="mha-pager-mobile__btn"
                disabled={pagina >= totalPags}
                onClick={() => setPagina((p) => p + 1)}
              >
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabla escritorio */}
      <div className="mha-table-wrap">
        <table className="mha-table">
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 28 }} />
            <col style={{ width: 26 }} />
            <col style={{ width: 26 }} />
            <col style={{ width: 26 }} />
            <col style={{ width: 82 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 115 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 115 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 82 }} />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                <input type="checkbox" />
              </th>
              <th></th>
              <th colSpan={3}></th>
              <th>Folio</th>
              <th>Usuario</th>
              <th>Departamento</th>
              <th>Sitio</th>
              <th>Categoría</th>
              <th>Servicio</th>
              <th>Prioridad</th>
              <th>Estado</th>
              <th>Ingeniero asignado</th>
              <th>SLA restante</th>
              <th>Creación</th>
              <th>Tiempo atención</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={17} className="mha-loading-cell">
                  <i className="ti ti-loader-2" /> Cargando…
                </td>
              </tr>
            )}
            {!loading &&
              solicitudes.map((s) => {
                const { texto: slaTxt, color: slaColor } = getSlaInfo(
                  s.fechaLimiteResp,
                );
                const isExp = expandido === s.idSolicitud,
                  det = detalles[s.idSolicitud];
                const icono = getServicioIcono(s.servicio, s.servicioIcono),
                  bloqueado = ticketBloqueado(s);
                const sinResponsable = !s.tecnicoAsignado;
                return [
                  <tr
                    key={s.idSolicitud}
                    className={`mha-tr ${isExp ? "mha-tr--exp" : ""}`}
                    onClick={() => toggleExpandir(s)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" />
                    </td>
                    <td>
                      <button
                        className="mha-expand-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpandir(s);
                        }}
                      >
                        <i
                          className={`ti ${isExp ? "ti-chevron-down" : "ti-chevron-right"}`}
                        />
                      </button>
                    </td>
                    {/* Quick actions: deshabilitar si sin responsable */}
                    <td onClick={(e) => e.stopPropagation()}>
                      {/* Asignar siempre visible */}
                      {!bloqueado && (
                        <button
                          className="mha-quick-btn"
                          title="Asignarme"
                          onClick={() => handleAccion("asignar", s)}
                        >
                          <i className="ti ti-user-plus" />
                        </button>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!bloqueado && (
                        <button
                          className="mha-quick-btn"
                          title={
                            sinResponsable
                              ? "Asigna un responsable primero"
                              : "Cambiar estado"
                          }
                          disabled={sinResponsable}
                          onClick={() =>
                            !sinResponsable &&
                            setModal({ tipo: "estatus", sol: s })
                          }
                        >
                          <i className="ti ti-refresh" />
                        </button>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!bloqueado && (
                        <button
                          className="mha-quick-btn mha-quick-btn--green"
                          title={
                            sinResponsable
                              ? "Asigna un responsable primero"
                              : "Marcar resuelto"
                          }
                          disabled={sinResponsable}
                          onClick={() =>
                            !sinResponsable && handleAccion("resolver", s)
                          }
                        >
                          <i className="ti ti-circle-check" />
                        </button>
                      )}
                    </td>
                    <td className="mha-folio">{s.folio}</td>
                    <td>
                      <span className="mha-uname">{s.nombreUsuario}</span>
                      <span className="mha-uemail">
                        {s.correoUsuario ??
                          `${s.idUsuario?.toLowerCase()}@fabpsa.com.mx`}
                      </span>
                    </td>
                    <td className="mha-dep">{s.areaUsuario ?? "—"}</td>
                    <td className="mha-sitio">{s.sitioUsuario ?? "—"}</td>
                    <td className="mha-cat">{s.categoria ?? "General TI"}</td>
                    <td>
                      <div className="mha-servicio">
                        <i className={`ti ${icono}`} />
                        <span>{s.servicio ?? "—"}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          color: s.prioColor,
                          fontWeight: 500,
                          fontSize: 12,
                        }}
                      >
                        ● {s.prioridad}
                      </span>
                    </td>
                    <td className="mha-estado-cell">
                      <Chip idEstatus={s.idEstatus} label={s.estatus} />
                      {s.idEstatus === 8 && s.escalaA && (
                        <div className="mha-escala-tag">
                          <i
                            className="ti ti-arrow-right"
                            style={{ fontSize: 9 }}
                          />
                          {s.escalaA}
                        </div>
                      )}
                    </td>
                    <td>
                      {s.nombreTecnico ? (
                        <div className="mha-tec">
                          <div className="mha-tec-av">
                            {s.nombreTecnico.substring(0, 2).toUpperCase()}
                          </div>
                          {s.nombreTecnico}
                        </div>
                      ) : (
                        <span className="mha-no-asign">Sin asignar</span>
                      )}
                    </td>
                    <td>
                      {[3, 4, 5].includes(s.idEstatus) ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background:
                              s.idEstatus === 3
                                ? "rgba(76,201,166,0.12)"
                                : s.idEstatus === 4
                                  ? "rgba(148,163,184,0.12)"
                                  : "rgba(243,139,168,0.12)",
                            color:
                              s.idEstatus === 3
                                ? "#4cc9a6"
                                : s.idEstatus === 4
                                  ? "#94a3b8"
                                  : "#f38ba8",
                          }}
                        >
                          {s.idEstatus === 3
                            ? "Resuelto"
                            : s.idEstatus === 4
                              ? "Cerrado"
                              : "Cancelado"}
                        </span>
                      ) : s.idEstatus === 6 ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: "rgba(246,193,119,0.12)",
                            color: "#f6c177",
                          }}
                        >
                          ⏸ En pausa
                        </span>
                      ) : (
                        <span
                          style={{
                            color: slaColor,
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          {slaTxt}
                        </span>
                      )}
                    </td>
                    <td className="mha-fecha">
                      {fmtFecha(s.fechaCreacion, true)}
                    </td>
                    <td className="mha-fecha">
                      {fmtTiempoAtencion(s.tiempoAtencionMin)}
                    </td>
                  </tr>,
                  isExp && det && (
                    <PanelExpandido
                      key={`exp-${s.idSolicitud}`}
                      sol={det}
                      onAccion={(tipo) => handleAccion(tipo, det)}
                      onNuevoComentario={() => recargarDetalle(s.idSolicitud)}
                      onRecargar={() => recargarDetalle(s.idSolicitud)}
                    />
                  ),
                ];
              })}
            {!loading && !solicitudes.length && (
              <tr>
                <td colSpan={17} className="mha-loading-cell">
                  No hay solicitudes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mha-pager">
          <span className="mha-pager-info">
            Mostrando 1 a {Math.min(pagina * 10, total)} de {total} resultados
          </span>
          <div className="mha-pager-btns">
            <button
              className="mha-pn"
              disabled={pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              <i className="ti ti-chevron-left" />
            </button>
            {Array.from(
              { length: Math.min(5, totalPags) },
              (_, i) => i + 1,
            ).map((n) => (
              <button
                key={n}
                className={`mha-pn ${pagina === n ? "mha-pn--act" : ""}`}
                onClick={() => setPagina(n)}
              >
                {n}
              </button>
            ))}
            {totalPags > 5 && (
              <>
                <span className="mha-pn">…</span>
                <button className="mha-pn" onClick={() => setPagina(totalPags)}>
                  {totalPags}
                </button>
              </>
            )}
            <button
              className="mha-pn"
              disabled={pagina >= totalPags}
              onClick={() => setPagina((p) => p + 1)}
            >
              <i className="ti ti-chevron-right" />
            </button>
          </div>
          <div className="mha-filter-item">
            <select className="mha-filter-select">
              <option>10 / página</option>
            </select>
          </div>
        </div>
      </div>

      {/* Modales */}
      {modal?.tipo === "estatus" && (
        <ModalPortal>
          <ModalEstatus
            onConfirm={confirmarEstatus}
            onClose={() => setModal(null)}
          />
        </ModalPortal>
      )}
      {modal?.tipo === "prioridad" && (
        <ModalPortal>
          <ModalPrioridad
            prioridades={prioridades}
            onConfirm={confirmarPrioridad}
            onClose={() => setModal(null)}
          />
        </ModalPortal>
      )}
      {modal?.tipo === "transferir" && (
        <ModalPortal>
          <ModalTransferir
            tecnicos={tecnicos}
            onConfirm={confirmarTransferir}
            onClose={() => setModal(null)}
          />
        </ModalPortal>
      )}
      {modal?.tipo === "escalar" && (
        <ModalPortal>
          <ModalEscalar
            sol={modal.sol}
            onConfirm={confirmarEscalar}
            onClose={() => setModal(null)}
          />
        </ModalPortal>
      )}
    </div>
  );
}
