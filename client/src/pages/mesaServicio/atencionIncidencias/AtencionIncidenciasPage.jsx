import {notifyPendingChanged} from "../../../context/PendingAttention";
// AtencionIncidenciasPage.jsx — v7 FINAL + mobile cards
import { useState, useEffect, useContext, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { AuthContext } from "../../../context/AuthContext";
import "./AtencionIncidenciasPage.css";
import "./AtencionIncidenciasPage.mobile.css";

const API_BASE = "";
const STATIC_BASE =
  window.location.hostname === "localhost" ? "http://localhost:3001" : "";

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

const ESTATUS_MAP = {
  1: { label: "Abierto", bg: "rgba(76,201,166,0.12)", color: "#4cc9a6" },
  2: { label: "En proceso", bg: "rgba(124,140,248,0.12)", color: "#7c8cf8" },
  3: { label: "Resuelto", bg: "rgba(76,201,166,0.12)", color: "#4cc9a6" },
  5: { label: "Cancelado", bg: "rgba(243,139,168,0.12)", color: "#f38ba8" },
  6: { label: "En pausa", bg: "rgba(246,193,119,0.12)", color: "#f6c177" },
  7: {
    label: "En diagnóstico",
    bg: "rgba(243,139,168,0.12)",
    color: "#f38ba8",
  },
  8: { label: "Escalado", bg: "rgba(243,139,168,0.15)", color: "#f38ba8" },
};
const ESTATUS_MAP_DISPLAY = {
  ...ESTATUS_MAP,
  4: { label: "Cerrado", bg: "rgba(148,163,184,0.12)", color: "#94a3b8" },
};

function getSlaInfo(fechaLimite, idEstatus, fechaRespuesta) {
  if (!fechaLimite)
    return {
      texto: "—",
      color: "var(--text-muted)",
      pct: 0,
      min: null,
      atendido: false,
    };
  if (idEstatus != null && idEstatus >= 2) {
    // Una vez atendido, el SLA se congela contra el momento real de la
    // primera respuesta, no contra "ahora" (si no, siempre parecería vencido).
    const referencia = fechaRespuesta ? new Date(fechaRespuesta) : new Date();
    const diff = new Date(fechaLimite) - referencia;
    const minReal = Math.floor(diff / 60000);
    return {
      texto: minReal < 0 ? "Atendido fuera de tiempo" : "Atendido en tiempo",
      subtexto: minReal < 0 ? "Fuera de SLA" : "Dentro de SLA",
      color: minReal < 0 ? "var(--danger)" : "var(--success)",
      pct: 100,
      min: minReal,
      atendido: true,
    };
  }
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
  return {
    texto,
    color,
    pct: Math.min(100, Math.max(0, ((1440 - min) / 1440) * 100)),
    min,
    atendido: false,
  };
}

function getSlaResolucionInfo(sol) {
  const {
    idEstatus,
    fechaInicioResolucion,
    slaResolucionMin,
    tiempoTotalPausaMin = 0,
    fechaUltimaPausa,
    tiempoAtencionMin,
  } = sol;
  const slaMin = slaResolucionMin ?? null;
  if (!fechaInicioResolucion)
    return {
      iniciado: false,
      slaMin,
      texto: "—",
      color: "var(--text-muted)",
      pct: 0,
      min: null,
      estado: "sin_iniciar",
    };
  if ([3, 4].includes(idEstatus) && tiempoAtencionMin != null) {
    const consumidoMin = tiempoAtencionMin;
    const restante = (slaMin ?? 0) - consumidoMin;
    const textoConsumo =
      consumidoMin < 60
        ? `${consumidoMin} min`
        : consumidoMin < 1440
          ? `${Math.floor(consumidoMin / 60)}h ${consumidoMin % 60}m`
          : `${Math.floor(consumidoMin / 1440)}d`;
    return {
      iniciado: true,
      slaMin,
      consumidoMin,
      texto: textoConsumo,
      color: restante >= 0 ? "var(--success)" : "var(--danger)",
      pct: Math.min(100, (consumidoMin / (slaMin || 1)) * 100),
      min: restante,
      estado: restante >= 0 ? "en_tiempo" : "vencido",
      concluido: true,
      tiempoReal: consumidoMin,
    };
  }
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
      texto: `${Math.max(0, restante)} min`,
      color: "var(--warning)",
      pct: Math.min(100, (Math.max(0, consumidoMin) / (slaMin || 1)) * 100),
      min: restante,
      estado: "pausado",
    };
  }
  const transcurridoMin = Math.floor(
    (new Date() - new Date(fechaInicioResolucion)) / 60000,
  );
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
    restante < 0 || restante < 30
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
  return [3, 4].includes(Number(sol.idEstatus));
}

function ModalPortal({ children }) {
  return createPortal(children, document.body);
}

function Chip({ idEstatus, label }) {
  const cfg = ESTATUS_MAP_DISPLAY[idEstatus] ?? {
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
  iconColor,
  label,
  num,
  onClick,
  active,
  activeColor,
}) {
  const aColor = activeColor || iconColor || "var(--primary)";
  return (
    <button
      className="mha-kpi-dev"
      onClick={onClick}
      style={{
        flex: 1,
        outline: active ? `2px solid ${aColor}` : "none",
        outlineOffset: active ? "-2px" : "0",
        background: active ? `${aColor}1a` : "var(--bg-surface)",
        cursor: onClick ? "pointer" : "default",
      }}
      title={onClick ? `Filtrar: ${label}` : undefined}
    >
      <i
        className={`ti ${icon}`}
        style={{
          fontSize: 16,
          color: active ? aColor : iconColor,
          flexShrink: 0,
          marginRight: 8,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.15,
            color: active ? aColor : "var(--text-h)",
          }}
        >
          {num ?? 0}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
    </button>
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

function TabInfoGeneral({ sol, onRecargar }) {
  const [nota, setNota] = useState(""),
    [guardando, setGuardando] = useState(false);
  const resolInfo = getSlaResolucionInfo(sol),
    respInfo = getSlaInfo(sol.fechaLimiteResp, sol.idEstatus, sol.fechaInicioResolucion);
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
                sub: sol.correoUsuario,
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
          <p
            className="mha-det-desc"
            style={{
              wordBreak: "break-word",
              overflowWrap: "break-word",
              whiteSpace: "pre-wrap",
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            {sol.descripcion}
          </p>
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
          {sol.accionesRealizadas && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                background: "rgba(76,201,166,0.06)",
                border: "1px solid rgba(76,201,166,0.2)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--primary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 6,
                }}
              >
                Acciones realizadas para resolver
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-body)",
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {sol.accionesRealizadas}
              </div>
            </div>
          )}
          {sol.motivoReapertura && (
            <div
              style={{
                marginTop: 8,
                padding: "8px 12px",
                background: "rgba(246,193,119,0.07)",
                border: "1px solid rgba(246,193,119,0.25)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#f6c177",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  marginBottom: 4,
                }}
              >
                Motivo de reapertura
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-body)",
                  lineHeight: 1.6,
                }}
              >
                {sol.motivoReapertura}
              </div>
            </div>
          )}
        </div>
        <div className="mha-det-card" style={{ marginTop: 10 }}>
          <div className="mha-det-card-title">Bitácora técnica</div>
          {sol.bitacora?.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginBottom: 10,
              }}
            >
              {sol.bitacora.map((b) => (
                <div
                  key={b.idBitacora}
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    minWidth: 0,
                  }}
                >
                  <div className="mha-bitacora-meta">
                    <strong>{b.nombreUsuario}</strong>
                    <span>{fmtFecha(b.fecha, true)}</span>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      color: "var(--text-body)",
                      lineHeight: 1.7,
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {b.nota}
                  </div>
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
            <div className="mha-sla-row-item">
              <span>1ª resp. comprometida</span>
              <strong>{fmtFecha(sol.fechaLimiteResp, true)}</strong>
            </div>
            <div className="mha-sla-row-item">
              <span>SLA primera respuesta</span>
              <strong>{sol.slaRespuestaMin ?? "—"} min</strong>
            </div>
            <div className="mha-sla-row-item">
              <span>T. restante respuesta</span>
              <strong style={{ color: respInfo.color }}>
                {respInfo.texto}
                {respInfo.atendido ? " ✓" : ""}
              </strong>
            </div>
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
            {resolInfo.concluido && (
              <div className="mha-sla-row-item">
                <span>Tiempo de resolución</span>
                <strong>{fmtTiempoAtencion(resolInfo.tiempoReal)}</strong>
              </div>
            )}
            {sol.tiempoIngenieroMin != null && (
              <div className="mha-sla-row-item" style={{ marginTop: 8 }}>
                <span>Tiempo Ingeniero TI</span>
                <strong style={{ color: "var(--secondary)" }}>
                  {fmtTiempoAtencion(sol.tiempoIngenieroMin)}
                </strong>
              </div>
            )}
            {sol.tiempoProveedorMin != null && (
              <div className="mha-sla-row-item">
                <span>Tiempo proveedor</span>
                <strong style={{ color: "#f38ba8" }}>
                  {fmtTiempoAtencion(sol.tiempoProveedorMin)}
                </strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabEvidencias({ archivos }) {
  const [preview, setPreview] = useState(null);
  if (!archivos?.length)
    return <div className="mha-empty">Sin evidencias adjuntas.</div>;
  const buildUrl = (r) => `${STATIC_BASE}/${r}`;
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

function TabSeguimiento({ sol, onRecargar }) {
  const [actividad, setActividad] = useState(""),
    [guardando, setGuardando] = useState(false);
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
            <div style={{ flex: 1, minWidth: 0 }}>
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
                  wordBreak: "break-word",
                  overflowWrap: "break-word",
                  whiteSpace: "pre-wrap",
                  maxWidth: "100%",
                  overflow: "hidden",
                }}
              >
                {b.nota}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border)",
          paddingTop: 14,
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

function TabSLA({ sol }) {
  const respInfo = getSlaInfo(sol.fechaLimiteResp, sol.idEstatus, sol.fechaInicioResolucion);
  const resolInfo = getSlaResolucionInfo(sol);
  const r = 36,
    circ = 2 * Math.PI * r;
  const [tiempoProveedorLive, setTiempoProveedorLive] = useState(null);
  useEffect(() => {
    if (sol.idEstatus !== 8 || !sol.fechaInicioEscalamiento) {
      setTiempoProveedorLive(null);
      return;
    }
    const tick = () =>
      setTiempoProveedorLive(
        Math.floor(
          (new Date() - new Date(sol.fechaInicioEscalamiento)) / 60000,
        ),
      );
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [sol.idEstatus, sol.fechaInicioEscalamiento]);

  function Ring({ info }) {
    const offset = circ - (info.pct / 100) * circ;
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
          {info.atendido || info.concluido ? (
            <span
              style={{
                color: info.color,
                fontSize: 24,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ✓
            </span>
          ) : (
            <>
              <span
                style={{
                  color: info.color,
                  fontWeight: 600,
                  fontSize: info.pausado ? 13 : 15,
                  lineHeight: 1.2,
                }}
              >
                {info.texto}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                {info.pausado ? "⏸ pausa" : "restante"}
              </span>
            </>
          )}
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
              <span>SLA</span>
              <strong>{sol.slaRespuestaMin ?? "—"} min</strong>
            </div>
            {respInfo.atendido ? (
              <>
                <div className="mha-sla-row-item">
                  <span>Resultado</span>
                  <strong style={{ color: respInfo.color }}>
                    {respInfo.texto}
                  </strong>
                </div>
                <div className="mha-sla-row-item">
                  <span>Estado</span>
                  <span
                    className="mha-chip"
                    style={{
                      background:
                        respInfo.min >= 0
                          ? "rgba(76,201,166,0.12)"
                          : "rgba(243,139,168,0.12)",
                      color: respInfo.color,
                    }}
                  >
                    {respInfo.min >= 0 ? "Atendido" : "Vencido al atender"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="mha-sla-row-item">
                  <span>Tiempo restante</span>
                  <strong style={{ color: respInfo.color, fontWeight: 600 }}>
                    {respInfo.texto}
                  </strong>
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
              </>
            )}
          </div>
        </div>
      </div>
      <div className="mha-sla-block">
        <div className="mha-sla-block-title">Resolución</div>
        {!resolInfo.iniciado ? (
          <div className="mha-tac-nd">
            <span>—</span>
            <small>
              SLA comienza al pasar a <strong>En proceso</strong>. Configurado:{" "}
              <strong>{resolInfo.slaMin ?? "—"} min</strong>
            </small>
          </div>
        ) : (
          <div className="mha-sla-block-inner">
            <Ring info={resolInfo} />
            <div className="mha-sla-block-rows">
              <div className="mha-sla-row-item">
                <span>Inicio</span>
                <strong>{fmtFecha(sol.fechaInicioResolucion, true)}</strong>
              </div>
              <div className="mha-sla-row-item">
                <span>
                  {resolInfo.concluido
                    ? "Tiempo de atención"
                    : "Tiempo restante"}
                </span>
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
              {sol.idEstatus === 8 && (
                <div className="mha-sla-row-item" style={{ marginTop: 4 }}>
                  <span>Reloj TI</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "rgba(246,193,119,0.12)",
                      color: "#f6c177",
                    }}
                  >
                    <i
                      className="ti ti-player-pause"
                      style={{ fontSize: 10 }}
                    />{" "}
                    Detenido por escalamiento
                  </span>
                </div>
              )}
              {[3, 4].includes(sol.idEstatus) && (
                <div className="mha-sla-row-item" style={{ marginTop: 4 }}>
                  <span>Reloj TI</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "rgba(76,201,166,0.12)",
                      color: "#4cc9a6",
                    }}
                  >
                    <i
                      className="ti ti-circle-check"
                      style={{ fontSize: 10 }}
                    />{" "}
                    SLA finalizado
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="mha-sla-block">
        <div className="mha-sla-block-title">Tiempo de atención</div>
        {sol.tiempoIngenieroMin != null ||
        sol.tiempoProveedorMin != null ||
        tiempoProveedorLive != null ? (
          (() => {
            const proveedorFinal =
              tiempoProveedorLive ?? sol.tiempoProveedorMin ?? 0;
            const tiempoIngReal =
              sol.tiempoIngenieroMin === 0 && sol.tiempoAtencionMin > 0
                ? Math.max(0, sol.tiempoAtencionMin - proveedorFinal)
                : sol.tiempoIngenieroMin;
            return (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingTop: 4,
                }}
              >
                {sol.tiempoIngenieroMin != null && (
                  <div className="mha-sla-row-item">
                    <span>Ingeniero TI</span>
                    <strong style={{ color: "var(--secondary)" }}>
                      {fmtTiempoAtencion(tiempoIngReal)}
                    </strong>
                  </div>
                )}
                {(tiempoProveedorLive != null ||
                  sol.tiempoProveedorMin != null) && (
                  <div className="mha-sla-row-item">
                    <span>
                      Proveedor
                      {tiempoProveedorLive != null && (
                        <span
                          style={{
                            color: "#f38ba8",
                            fontSize: 10,
                            marginLeft: 4,
                          }}
                        >
                          ● corriendo
                        </span>
                      )}
                      {sol.tiempoProveedorMin != null &&
                        tiempoProveedorLive == null && (
                          <span
                            style={{
                              fontSize: 10,
                              color: "var(--text-faint)",
                              marginLeft: 4,
                            }}
                          >
                            (finalizado)
                          </span>
                        )}
                    </span>
                    <strong style={{ color: "#f38ba8" }}>
                      {fmtTiempoAtencion(
                        tiempoProveedorLive ?? sol.tiempoProveedorMin,
                      )}
                    </strong>
                  </div>
                )}
                {sol.tiempoAtencionMin != null && (
                  <div
                    className="mha-sla-row-item"
                    style={{
                      borderTop: "1px solid var(--border)",
                      paddingTop: 6,
                      marginTop: 2,
                    }}
                  >
                    <span>Total</span>
                    <strong>{fmtTiempoAtencion(sol.tiempoAtencionMin)}</strong>
                  </div>
                )}
              </div>
            );
          })()
        ) : sol.tiempoAtencionMin != null ? (
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

function TabComentarios({ sol, onNuevoComentario }) {
  const { user } = useContext(AuthContext); // ← agrega esta línea
  const [texto, setTexto] = useState(""),
    [enviando, setEnviando] = useState(false);
  const bottomRef = useRef();
  const lastCountRef = useRef(sol.comentarios?.length ?? 0);
  useEffect(() => {
    const n = sol.comentarios?.length ?? 0;
    if (n !== lastCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      lastCountRef.current = n;
    }
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
            className={`mha-com-item ${c.idUsuario === user.login ? "mha-com-tec" : "mha-com-usr"}`}
          >
            <div className="mha-com-av">
              {c.nombreUsuario?.substring(0, 2).toUpperCase()}
            </div>
            <div className="mha-com-bubble">
              <div className="mha-com-meta">
                <strong>{c.nombreUsuario}</strong>
                <span className="mha-com-rol">
                  {c.idUsuario === user.login ? "Ingeniero TI" : "Usuario"}
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

function TabEvaluacion({ sol }) {
  const evaluaciones =
    sol.evaluaciones ?? (sol.evaluacion ? [sol.evaluacion] : []);
  if (!evaluaciones.length)
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
  const ORDINAL = [
    "Primera",
    "Segunda",
    "Tercera",
    "Cuarta",
    "Quinta",
    "Sexta",
  ];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        maxWidth: 520,
      }}
    >
      {evaluaciones.map((ev, idx) => (
        <div
          key={ev.idEvaluacion ?? idx}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "14px 16px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 10,
            }}
          >
            {ORDINAL[idx] ?? `Evaluación ${idx + 1}`} evaluación
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 12,
            }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <i
                key={n}
                className={`ti ${n <= ev.estrellas ? "ti-star-filled" : "ti-star"}`}
                style={{
                  fontSize: 22,
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
            <p
              style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}
            >
              Sin comentario adicional.
            </p>
          )}
          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <i className="ti ti-calendar-check" style={{ fontSize: 14 }} />{" "}
            {fmtFecha(ev.fecha, true)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ModalEscalar({ sol, onConfirm, onClose }) {
  const [proveedorId, setProveedorId] = useState(""),
    [proveedorNombre, setProveedorNombre] = useState("");
  const [motivo, setMotivo] = useState(""),
    [guardando, setGuardando] = useState(false);
  const [proveedores, setProveedores] = useState([]),
    [cargandoProv, setCargandoProv] = useState(true);
  useEffect(() => {
    apiFetch("/api/mesa-admin/proveedores")
      .then((r) => {
        if (r.ok) setProveedores(r.data);
      })
      .catch(() => {})
      .finally(() => setCargandoProv(false));
  }, []);
  function handleSeleccionProveedor(e) {
    const id = e.target.value;
    setProveedorId(id);
    const found = proveedores.find((p) => String(p.idProveedor) === id);
    setProveedorNombre(found?.proveedor ?? "");
  }
  async function confirmar(e) {
    e.stopPropagation();
    if (!proveedorNombre.trim()) return;
    setGuardando(true);
    await onConfirm(proveedorNombre.trim(), motivo.trim());
    setGuardando(false);
  }
  const selectStyle = {
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
    cursor: "pointer",
  };
  const inputStyle = { ...selectStyle, cursor: "text" };
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
              Proveedor <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            {cargandoProv ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  padding: "8px 0",
                }}
              >
                <i className="ti ti-loader-2" /> Cargando proveedores…
              </div>
            ) : (
              <select
                value={proveedorId}
                onChange={handleSeleccionProveedor}
                autoFocus
                style={selectStyle}
              >
                <option value="">— Selecciona un proveedor —</option>
                {proveedores.map((p) => (
                  <option key={p.idProveedor} value={p.idProveedor}>
                    {p.proveedor}
                  </option>
                ))}
              </select>
            )}
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
              Motivo{" "}
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
              placeholder="Describe el motivo del escalamiento…"
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
            disabled={!proveedorNombre || guardando}
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

function ModalResolver({ sol, onConfirm, onClose }) {
  const [acciones, setAcciones] = useState(""),
    [guardando, setGuardando] = useState(false);
  async function confirmar(e) {
    e.stopPropagation();
    if (!acciones.trim()) return;
    setGuardando(true);
    await onConfirm(acciones.trim());
    setGuardando(false);
  }
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
                background: "rgba(76,201,166,0.15)",
                color: "#4cc9a6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              <i className="ti ti-circle-check" />
            </span>
            Marcar como resuelto
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
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            Describe qué acciones realizaste para corregir el incidente. Esta
            información será visible para el usuario.
          </p>
          <label
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontWeight: 500,
            }}
          >
            Acciones realizadas{" "}
            <span style={{ color: "var(--danger)" }}>*</span>
          </label>
          <textarea
            autoFocus
            placeholder="Ej. Se conectó remotamente, se identificó el problema con Excel, se liberó memoria caché y se reiniciaron los servicios…"
            value={acciones}
            onChange={(e) => setAcciones(e.target.value)}
            rows={5}
            style={{
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
              resize: "vertical",
              minHeight: 100,
            }}
          />
        </div>
        <div className="mha-modal-foot">
          <button className="mha-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="mha-btn-primary"
            disabled={!acciones.trim() || guardando}
            onClick={confirmar}
            style={{ background: "#4cc9a6", border: "none", color: "#0f172a" }}
          >
            {guardando ? (
              <>
                <i className="ti ti-loader-2" /> Guardando…
              </>
            ) : (
              <>
                <i className="ti ti-circle-check" /> Marcar como resuelto
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalConfirmarEscalamiento({ sol, onConfirm, onClose }) {
  const [guardando, setGuardando] = useState(false);
  async function confirmar(e) {
    e.stopPropagation();
    setGuardando(true);
    await onConfirm();
    setGuardando(false);
  }
  return (
    <div className="mha-modal-overlay" onClick={onClose}>
      <div
        className="mha-modal"
        style={{ maxWidth: 380 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mha-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "rgba(76,201,166,0.15)",
                color: "#4cc9a6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
              }}
            >
              <i className="ti ti-circle-check" />
            </span>
            Finalizar escalamiento
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
        <div className="mha-modal-body" style={{ padding: 16 }}>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 13,
              color: "var(--text-body)",
              lineHeight: 1.6,
            }}
          >
            Se detendrá el contador del proveedor y el ticket regresará a estado{" "}
            <strong>En proceso</strong>.
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
            Podrás continuar la atención y marcarlo como Resuelto manualmente.
          </p>
        </div>
        <div className="mha-modal-foot">
          <button className="mha-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="mha-btn-primary"
            disabled={guardando}
            onClick={confirmar}
            style={{ background: "var(--secondary)", border: "none" }}
          >
            {guardando ? (
              <>
                <i className="ti ti-loader-2" /> Finalizando…
              </>
            ) : (
              <>
                <i className="ti ti-player-play" /> Finalizar y volver a En
                proceso
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
          <div
            style={{
              padding: "10px 12px",
              fontSize: 11,
              color: "var(--text-muted)",
              background: "var(--bg-elevated)",
              borderRadius: 8,
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <i className="ti ti-info-circle" style={{ flexShrink: 0 }} />
            El cierre definitivo corresponde al usuario.
          </div>
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

function BarraAcciones({ sol, onAccion }) {
  if (ticketBloqueado(sol))
    return (
      <div className="mha-action-bar">
        <i
          className="ti ti-lock"
          style={{ color: "var(--text-muted)", fontSize: 14 }}
        />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Ticket concluido — acciones bloqueadas hasta su reapertura
        </span>
      </div>
    );
  const sinResponsable = !sol.tecnicoAsignado,
    enPausa = sol.idEstatus === 6,
    escalado = sol.idEstatus === 8;
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  if (sinResponsable)
    return (
      <div className="mha-action-bar">
        <span className="mha-action-label">Acciones rápidas</span>
        <button
          className="mha-action-btn mha-action-btn--primary"
          onClick={stop(() => onAccion("asignar"))}
        >
          <i className="ti ti-user-plus" /> Asignarme el incidente
        </button>
        <button
          className="mha-action-btn mha-action-btn--outline"
          onClick={stop(() => onAccion("transferir"))}
        >
          <i className="ti ti-transfer" /> Asignar a otro{" "}
          <i className="ti ti-chevron-down" />
        </button>
        <span
          style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}
        >
          Asigna un responsable para habilitar el resto de acciones.
        </span>
      </div>
    );
  if (enPausa)
    return (
      <div className="mha-action-bar">
        <span className="mha-action-label">Ticket en pausa</span>
        <button
          className="mha-action-btn mha-action-btn--primary"
          onClick={stop(() => onAccion("reanudar"))}
        >
          <i className="ti ti-player-play" /> Reanudar
        </button>
        <span style={{ fontSize: 11, color: "var(--warning)", marginLeft: 4 }}>
          El SLA está pausado. Reanuda para continuar.
        </span>
      </div>
    );
  if (escalado) {
    const transferenciaDirecta =
      sol.tiempoIngenieroMin === 0 && !sol.fechaInicioResolucion;
    return (
      <div className="mha-action-bar">
        <span className="mha-action-label">Ticket escalado</span>
        {transferenciaDirecta && (
          <span
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 20,
              background: "rgba(246,193,119,0.12)",
              color: "#f6c177",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <i className="ti ti-info-circle" />
            Este ticket fue transferido al proveedor desde el inicio de su
            atención.
          </span>
        )}
        <span
          style={{
            fontSize: 12,
            color: "#f38ba8",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <i className="ti ti-clock" />
          {sol.escalaA ? `En manos de: ${sol.escalaA}` : "Escalado a proveedor"}
        </span>
        <button
          className="mha-action-btn"
          style={{
            color: "#4cc9a6",
            borderColor: "rgba(76,201,166,0.35)",
            background: "rgba(76,201,166,0.06)",
          }}
          onClick={stop(() => onAccion("confirmarFinalizarEscalamiento"))}
        >
          <i className="ti ti-circle-check" /> Finalizar escalamiento
        </button>
      </div>
    );
  }
  return (
    <div className="mha-action-bar">
      <span className="mha-action-label">Acciones rápidas</span>
      <button
        className="mha-action-btn mha-action-btn--primary"
        onClick={stop(() => onAccion("asignar"))}
        title="Asignarme el incidente"
      >
        <i className="ti ti-user-plus" /> Asignarme
      </button>
      <button
        className="mha-action-btn mha-action-btn--outline"
        onClick={stop(() => onAccion("estatus"))}
        title="Cambiar estado"
      >
        <i className="ti ti-refresh" /> Estado
      </button>
      {sol.idEstatus === 2 && (
        <button
          className="mha-action-btn mha-action-btn--outline"
          onClick={stop(() => onAccion("pausar"))}
          title="Pausar ticket"
        >
          <i className="ti ti-player-pause" /> Pausar
        </button>
      )}
      <button
        className="mha-action-btn mha-action-btn--outline"
        onClick={stop(() => onAccion("prioridad"))}
        title="Cambiar prioridad"
      >
        <i className="ti ti-flag" /> Prioridad
      </button>
      <button
        className="mha-action-btn mha-action-btn--outline"
        onClick={stop(() => onAccion("transferir"))}
        title="Transferir a otro ingeniero"
      >
        <i className="ti ti-transfer" /> Transferir
      </button>
      <button
        className="mha-action-btn mha-action-btn--outline"
        onClick={stop(() => onAccion("escalar"))}
        title="Escalar a proveedor"
      >
        <i className="ti ti-arrow-up-circle" /> Escalar
      </button>
      <button
        className="mha-action-btn mha-action-btn--green"
        onClick={stop(() => onAccion("resolver"))}
        title="Marcar como resuelto"
      >
        <i className="ti ti-circle-check" /> Resolver
      </button>
    </div>
  );
}

function PanelExpandido({ sol, onAccion, onNuevoComentario, onRecargar }) {
  const [tab, setTab] = useState(0);
  const evalCount = sol.evaluaciones?.length ?? (sol.evaluacion ? 1 : 0);
  useEffect(() => {
    const iv = setInterval(() => {
      onRecargar();
    }, 8000);
    return () => clearInterval(iv);
  }, []);
  const ssKey = `mha_com_seen_${sol.idSolicitud}`;
  const [lastSeen, setLastSeen] = useState(() => sessionStorage.getItem(ssKey));
  const comentariosNoLeidos = (sol.comentarios ?? []).filter(
    (c) => !lastSeen || new Date(c.fecha) > new Date(lastSeen),
  ).length;
  function marcarLeidos() {
    const now = new Date().toISOString();
    sessionStorage.setItem(ssKey, now);
    setLastSeen(now);
  }
  function handleTabClick(i) {
    setTab(i);
    if (i === 4) marcarLeidos();
  }
  const tabs = [
    { label: "Información general" },
    { label: "Seguimiento", badge: sol.bitacora?.length || null },
    { label: "Evidencias", badge: sol.archivos?.length || null },
    { label: "Información SLA" },
    {
      label: "Comentarios",
      badge:
        comentariosNoLeidos > 0
          ? `🔴${comentariosNoLeidos}`
          : sol.comentarios?.length || null,
      badgeNew: comentariosNoLeidos > 0,
    },
    {
      label: "Evaluación",
      badge: evalCount > 1 ? evalCount : evalCount === 1 ? "star" : null,
    },
  ];
  return (
    <tr className="mha-expand-row">
      <td colSpan={13}>
        <div className="mha-expand-panel">
          <div className="mha-expand-tabs">
            {tabs.map((t, i) => (
              <button
                key={i}
                className={`mha-expand-tab ${tab === i ? "mha-expand-tab--active" : ""}`}
                onClick={() => handleTabClick(i)}
              >
                {t.label}
                {t.badgeNew && (
                  <span className="mha-tab-badge mha-tab-badge--new">
                    {comentariosNoLeidos}
                  </span>
                )}
                {!t.badgeNew && t.badge && t.badge !== "star" && (
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
              <TabComentarios
                sol={sol}
                onNuevoComentario={() => {
                  marcarLeidos();
                  onNuevoComentario();
                }}
              />
            )}
            {tab === 5 && <TabEvaluacion sol={sol} />}
          </div>
          <BarraAcciones sol={sol} onAccion={onAccion} />
        </div>
      </td>
    </tr>
  );
}

// ── Panel expandido para las cards móvil (div, no tr/td) ──────────
function PanelExpandidoMobile({
  sol,
  onAccion,
  onNuevoComentario,
  onRecargar,
}) {
  const [tab, setTab] = useState(0);
  const evalCount = sol.evaluaciones?.length ?? (sol.evaluacion ? 1 : 0);
  useEffect(() => {
    const iv = setInterval(() => {
      onRecargar();
    }, 8000);
    return () => clearInterval(iv);
  }, []);
  const ssKey = `mha_com_seen_${sol.idSolicitud}`;
  const [lastSeen, setLastSeen] = useState(() => sessionStorage.getItem(ssKey));
  const comentariosNoLeidos = (sol.comentarios ?? []).filter(
    (c) => !lastSeen || new Date(c.fecha) > new Date(lastSeen),
  ).length;
  function marcarLeidos() {
    const now = new Date().toISOString();
    sessionStorage.setItem(ssKey, now);
    setLastSeen(now);
  }
  function handleTabClick(i) {
    setTab(i);
    if (i === 4) marcarLeidos();
  }
  const tabs = [
    { label: "Info" },
    { label: "Seguimiento", badge: sol.bitacora?.length || null },
    { label: "Evidencias", badge: sol.archivos?.length || null },
    { label: "SLA" },
    {
      label: "Comentarios",
      badge:
        comentariosNoLeidos > 0
          ? comentariosNoLeidos
          : sol.comentarios?.length || null,
      badgeNew: comentariosNoLeidos > 0,
    },
    { label: "Evaluación", badge: evalCount > 0 ? "star" : null },
  ];
  return (
    <div className="mha-expand-panel">
      <div className="mha-expand-tabs">
        {tabs.map((t, i) => (
          <button
            key={i}
            className={`mha-expand-tab ${tab === i ? "mha-expand-tab--active" : ""}`}
            onClick={() => handleTabClick(i)}
          >
            {t.label}
            {t.badgeNew && (
              <span className="mha-tab-badge mha-tab-badge--new">
                {comentariosNoLeidos}
              </span>
            )}
            {!t.badgeNew && t.badge && t.badge !== "star" && (
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
          <TabComentarios
            sol={sol}
            onNuevoComentario={() => {
              marcarLeidos();
              onNuevoComentario();
            }}
          />
        )}
        {tab === 5 && <TabEvaluacion sol={sol} />}
      </div>
      <BarraAcciones sol={sol} onAccion={onAccion} />
    </div>
  );
}

export default function MesaAyudaAdminPage() {
  const { user } = useContext(AuthContext);
  const [kpis, setKpis] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);
  useEffect(()=>{notifyPendingChanged();},[solicitudes]);
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
  const [kpiActivo, setKpiActivo] = useState(null);

  function mostrarToast(tipo, mensaje) {
    setToast({ tipo, mensaje });
    setTimeout(() => setToast(null), 4500);
  }

  const cargarKPIs = useCallback(async () => {
    const res = await apiFetch("/api/mesa-admin/kpis");
    if (res.ok) setKpis(res.data);
  }, []);

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
  async function recargarDetalle(id) {
    const res = await apiFetch(`/api/mesa-admin/solicitudes/${id}`);
    if (res.ok) setDetalles((p) => ({ ...p, [id]: res.data }));
  }

  async function handleAccion(tipo, sol) {
    const id = sol?.idSolicitud;
    if (!id) return;
    if (ticketBloqueado(sol)) {
      mostrarToast("error", "Ticket concluido. Las acciones se habilitan cuando el solicitante lo reabre.");
      return;
    }
    if (tipo === "asignar") {
      const res = await apiFetch(`/api/mesa-admin/solicitudes/${id}/asignar`, {
        method: "PUT",
      });
      if (res.__httpError || res.ok === false) {
        mostrarToast("error", res.message || "No se pudo asignar el ticket.");
        return;
      }
      cargarKPIs();
      cargarSolicitudes(true);
      recargarDetalle(id);
      return;
    }
    if (tipo === "transferir") {
      setModal({ tipo: "transferir", sol });
      return;
    }
    if (!sol.tecnicoAsignado) {
      mostrarToast(
        "error",
        "Asigna un responsable antes de realizar acciones sobre este ticket.",
      );
      return;
    }
    if (tipo === "resolver") {
      setModal({ tipo: "resolver", sol });
      return;
    }
    if (tipo === "pausar") {
      const res = await apiFetch(`/api/mesa-admin/solicitudes/${id}/estatus`, {
        method: "PUT",
        body: JSON.stringify({ idEstatus: 6 }),
      });
      if (res.__httpError || res.ok === false) {
        mostrarToast("error", res.message || "No se pudo pausar.");
        return;
      }
      mostrarToast("ok", "Ticket puesto en pausa");
      cargarKPIs();
      cargarSolicitudes(true);
      recargarDetalle(id);
    } else if (tipo === "reanudar") {
      const res = await apiFetch(`/api/mesa-admin/solicitudes/${id}/estatus`, {
        method: "PUT",
        body: JSON.stringify({ idEstatus: 2 }),
      });
      if (res.__httpError || res.ok === false) {
        mostrarToast("error", res.message || "No se pudo reanudar.");
        return;
      }
      mostrarToast("ok", "Ticket reanudado");
      cargarKPIs();
      cargarSolicitudes(true);
      recargarDetalle(id);
    } else if (tipo === "confirmarFinalizarEscalamiento") {
      setModal({ tipo: "confirmarEscalamiento", sol });
      return;
    } else {
      setModal({ tipo, sol });
    }
  }

  async function confirmarFinalizarEscalamiento() {
    const id = modal.sol.idSolicitud;
    const res = await apiFetch(
      `/api/mesa-admin/solicitudes/${id}/finalizar-escalamiento`,
      { method: "PUT" },
    );
    if (res.__httpError || res.ok === false) {
      mostrarToast(
        "error",
        res.message || "No se pudo finalizar el escalamiento.",
      );
      setModal(null);
      return;
    }
    mostrarToast(
      "ok",
      "Escalamiento finalizado — el ticket regresa a En proceso",
    );
    setModal(null);
    cargarKPIs();
    cargarSolicitudes(true);
    recargarDetalle(id);
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
  async function confirmarResolver(acciones) {
    const id = modal.sol.idSolicitud;
    const res = await apiFetch(`/api/mesa-admin/solicitudes/${id}/resolver`, {
      method: "PUT",
      body: JSON.stringify({ accionesRealizadas: acciones }),
    });
    if (res.__httpError || res.ok === false) {
      mostrarToast("error", res.message || "No se pudo resolver el ticket.");
      setModal(null);
      return;
    }
    setModal(null);
    mostrarToast("ok", "Ticket marcado como resuelto");
    cargarKPIs();
    cargarSolicitudes(true);
    recargarDetalle(id);
  }
  async function confirmarPrioridad(idPrioridad) {
    const res = await apiFetch(
      `/api/mesa-admin/solicitudes/${modal.sol.idSolicitud}/prioridad`,
      { method: "PUT", body: JSON.stringify({ idPrioridad }) },
    );
    if (res.__httpError || res.ok === false)
      mostrarToast("error", res.message || "No se pudo cambiar la prioridad.");
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
      Departamento: s.areaUsuario,
      Sitio: s.sitioUsuario,
      Categoría: s.categoria,
      Servicio: s.servicio,
      Prioridad: s.prioridad,
      Estado: s.estatus,
      "Escalado a": s.escalaA ?? "",
      Ingeniero: s.nombreTecnico ?? "Sin asignar",
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

  function aplicarFiltroKpi(key, valorEstatus) {
    if (kpiActivo === key) {
      setKpiActivo(null);
      setFiltros((p) => ({ ...p, estatus: "", tecnico: "" }));
    } else {
      setKpiActivo(key);
      setFiltros((p) => ({ ...p, estatus: valorEstatus, tecnico: "" }));
      setPagina(1);
    }
  }

  const totalPags = Math.ceil(total / 10);

  return (
    <div className="mha-root">
      <Toast toast={toast} />

      {/* KPIs */}
      <div className="mha-kpis-dev">
        <KpiCard
          icon="ti-inbox"
          iconColor="#7c8cf8"
          label="Abiertas"
          num={kpis?.abiertas}
          activeColor="#7c8cf8"
          active={kpiActivo === "abiertas"}
          onClick={() => aplicarFiltroKpi("abiertas", "1")}
        />
        <KpiCard
          icon="ti-loader-2"
          iconColor="#4cc9a6"
          label="En proceso"
          num={kpis?.enProgreso}
          activeColor="#4cc9a6"
          active={kpiActivo === "enProceso"}
          onClick={() => aplicarFiltroKpi("enProceso", "2")}
        />
        <KpiCard
          icon="ti-user-question"
          iconColor="#f59e0b"
          label="Sin asignar"
          num={kpis?.sinAsignar}
          activeColor="#f59e0b"
          active={kpiActivo === "sinAsignar"}
          onClick={() => aplicarFiltroKpi("sinAsignar", "sinasignar")}
        />
        <KpiCard
          icon="ti-clock-exclamation"
          iconColor="#ea580c"
          label="Por vencer"
          num={kpis?.proximasVencer}
          activeColor="#ea580c"
          active={kpiActivo === "porVencer"}
          onClick={() => aplicarFiltroKpi("porVencer", "porvencer")}
        />
        <KpiCard
          icon="ti-alert-triangle"
          iconColor="#ef4444"
          label="Vencidas"
          num={kpis?.vencidas}
          activeColor="#ef4444"
          active={kpiActivo === "vencidas"}
          onClick={() => aplicarFiltroKpi("vencidas", "vencidas")}
        />
        <KpiCard
          icon="ti-circle-check"
          iconColor="#14b8a6"
          label="Resueltas hoy"
          num={kpis?.resueltasHoy}
          activeColor="#14b8a6"
          active={kpiActivo === "resueltasHoy"}
          onClick={() => aplicarFiltroKpi("resueltasHoy", "resueltashoy")}
        />
      </div>

      {/* Filtros */}
      <div className="mha-filters">
        <div className="mha-filter-row">
          {[
            {
              key: "estatus",
              label: "Estado",
              opts: Object.entries(ESTATUS_MAP_DISPLAY).map(([id, c]) => ({
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
              label: "Ingeniero",
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
                  if (key === "estatus") setKpiActivo(null);
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
              Limpiar fechas
            </button>
          )}
          {kpiActivo && (
            <button
              className="mha-filter-clear"
              onClick={() => {
                setKpiActivo(null);
                setFiltros((p) => ({ ...p, estatus: "", tecnico: "" }));
              }}
            >
              <i className="ti ti-x" /> Limpiar filtro KPI
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            className="mha-btn-refresh"
            onClick={() => {
              cargarSolicitudes(false);
              cargarKPIs();
            }}
          >
            <i className="ti ti-refresh" /> Actualizar
          </button>
          <button className="mha-btn-export" onClick={exportarExcel}>
            <i className="ti ti-table-export" /> Exportar
          </button>
        </div>
      </div>

      {/* ── TABLA ESCRITORIO ── */}
      <div className="mha-table-wrap">
        <table className="mha-table">
          <thead>
            <tr>
              <th style={{ width: 58, minWidth: 58 }}>Acciones</th>
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
                <td colSpan={13} className="mha-loading-cell">
                  <i className="ti ti-loader-2" /> Cargando…
                </td>
              </tr>
            )}
            {!loading &&
              solicitudes.map((s) => {
                const slaGridInfo =
                  s.idEstatus === 2
                    ? getSlaResolucionInfo(s)
                    : getSlaInfo(s.fechaLimiteResp, s.idEstatus, s.fechaInicioResolucion);
                const slaTxt = slaGridInfo.texto,
                  slaColor = slaGridInfo.color;
                const isExp = expandido === s.idSolicitud,
                  det = detalles[s.idSolicitud];
                const bloqueado = ticketBloqueado(s),
                  sinResponsable = !s.tecnicoAsignado;
                return [
                  <tr
                    key={s.idSolicitud}
                    className={`mha-tr ${isExp ? "mha-tr--exp" : ""}`}
                    onClick={() => toggleExpandir(s)}
                  >
                    <td
                      onClick={(e) => e.stopPropagation()}
                      style={{ padding: "0 6px" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {!bloqueado && (
                          <button
                            className="mha-quick-btn"
                            title="Asignarme el incidente"
                            onClick={() => handleAccion("asignar", s)}
                          >
                            <i className="ti ti-user-plus" />
                          </button>
                        )}
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
                      </div>
                    </td>
                    <td className="mha-folio">{s.folio}</td>
                    <td style={{ minWidth: 160 }}>
                      <span
                        className="mha-uname"
                        style={{
                          whiteSpace: "normal",
                          wordBreak: "break-word",
                        }}
                      >
                        {s.nombreUsuario}
                      </span>
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
                        <div className="mha-escala-tag">{s.escalaA}</div>
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
                        <span style={{ fontSize: 11 }}>
                          {s.idEstatus === 3
                            ? "Resuelto"
                            : s.idEstatus === 4
                              ? "Cerrado"
                              : "Cancelado"}
                        </span>
                      ) : s.idEstatus === 6 ? (
                        <span style={{ fontSize: 11, color: "#f6c177" }}>
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
                <td colSpan={13} className="mha-loading-cell">
                  No hay solicitudes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mha-pager">
          <span className="mha-pager-info">
            Mostrando {Math.min((pagina - 1) * 10 + 1, total)}–
            {Math.min(pagina * 10, total)} de {total} resultados
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
        </div>
      </div>

      {/* ── CARDS MÓVIL ── */}
      <div className="mha-cards-mobile">
        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: 32,
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
              padding: 32,
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No hay solicitudes.
          </div>
        )}
        {!loading &&
          solicitudes.map((s) => {
            const slaGridInfo =
              s.idEstatus === 2
                ? getSlaResolucionInfo(s)
                : getSlaInfo(s.fechaLimiteResp, s.idEstatus, s.fechaInicioResolucion);
            const isExp = expandido === s.idSolicitud;
            const det = detalles[s.idSolicitud];
            const bloqueado = ticketBloqueado(s);
            const sinResponsable = !s.tecnicoAsignado;
            return (
              <div
                key={s.idSolicitud}
                className={`mha-card-mobile ${isExp ? "mha-card-mobile--exp" : ""}`}
              >
                <div
                  className="mha-card-mobile__head"
                  onClick={() => toggleExpandir(s)}
                >
                  <span className="mha-card-mobile__folio">{s.folio}</span>
                  <Chip idEstatus={s.idEstatus} label={s.estatus} />
                  {![3, 4, 5, 6].includes(s.idEstatus) && (
                    <span
                      className="mha-card-mobile__sla"
                      style={{ color: slaGridInfo.color }}
                    >
                      {slaGridInfo.texto}
                    </span>
                  )}
                  {s.idEstatus === 6 && (
                    <span
                      className="mha-card-mobile__sla"
                      style={{ color: "#f6c177" }}
                    >
                      ⏸ Pausa
                    </span>
                  )}
                  <i className="ti ti-chevron-down mha-card-mobile__chevron" />
                </div>
                <div
                  className="mha-card-mobile__body"
                  onClick={() => toggleExpandir(s)}
                >
                  <div className="mha-card-mobile__row">
                    <span className="mha-card-mobile__label">Usuario</span>
                    <span className="mha-card-mobile__val">
                      {s.nombreUsuario}
                    </span>
                  </div>
                  <div className="mha-card-mobile__row">
                    <span className="mha-card-mobile__label">Área · Sitio</span>
                    <span className="mha-card-mobile__val mha-card-mobile__val--muted">
                      {s.areaUsuario ?? "—"} · {s.sitioUsuario ?? "—"}
                    </span>
                  </div>
                  <div className="mha-card-mobile__row">
                    <span className="mha-card-mobile__label">Servicio</span>
                    <span className="mha-card-mobile__val mha-card-mobile__val--muted">
                      {s.servicio ?? "—"}
                    </span>
                  </div>
                  <div className="mha-card-mobile__row">
                    <span className="mha-card-mobile__label">Prioridad</span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: s.prioColor,
                      }}
                    >
                      ● {s.prioridad}
                    </span>
                  </div>
                  <div className="mha-card-mobile__row">
                    <span className="mha-card-mobile__label">Ingeniero</span>
                    <span className="mha-card-mobile__val mha-card-mobile__val--muted">
                      {s.nombreTecnico ?? "Sin asignar"}
                    </span>
                  </div>
                  <div className="mha-card-mobile__row">
                    <span className="mha-card-mobile__label">Creación</span>
                    <span className="mha-card-mobile__val mha-card-mobile__val--muted">
                      {fmtFecha(s.fechaCreacion, true)}
                    </span>
                  </div>
                </div>
                {bloqueado ? (
                  <div className="mha-card-mobile__blocked">
                    <i className="ti ti-lock" style={{ fontSize: 13 }} /> Ticket
                    cerrado
                  </div>
                ) : (
                  <div className="mha-card-mobile__foot">
                    <button
                      className="mha-card-mobile__action mha-card-mobile__action--primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAccion("asignar", s);
                      }}
                    >
                      <i className="ti ti-user-plus" />
                      Asignarme
                    </button>
                    <button
                      className="mha-card-mobile__action"
                      disabled={sinResponsable}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!sinResponsable)
                          setModal({ tipo: "estatus", sol: s });
                      }}
                    >
                      <i className="ti ti-refresh" />
                      Estado
                    </button>
                    <button
                      className="mha-card-mobile__action mha-card-mobile__action--danger"
                      disabled={sinResponsable}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!sinResponsable)
                          setModal({ tipo: "escalar", sol: s });
                      }}
                    >
                      <i className="ti ti-arrow-up-circle" />
                      Escalar
                    </button>
                    <button
                      className="mha-card-mobile__action mha-card-mobile__action--green"
                      disabled={sinResponsable}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!sinResponsable)
                          setModal({ tipo: "resolver", sol: s });
                      }}
                    >
                      <i className="ti ti-circle-check" />
                      Resolver
                    </button>
                  </div>
                )}
                {isExp && det && (
                  <div className="mha-card-mobile__expand">
                    <PanelExpandidoMobile
                      sol={det}
                      onAccion={(tipo) => handleAccion(tipo, det)}
                      onNuevoComentario={() => recargarDetalle(s.idSolicitud)}
                      onRecargar={() => recargarDetalle(s.idSolicitud)}
                    />
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Paginador móvil */}
      <div className="mha-pager-mobile">
        <span className="mha-pager-mobile__info">
          {Math.min((pagina - 1) * 10 + 1, total)}–
          {Math.min(pagina * 10, total)} de {total}
        </span>
        <div className="mha-pager-mobile__btns">
          <button
            className="mha-pager-mobile__btn"
            disabled={pagina === 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            <i className="ti ti-chevron-left" />
          </button>
          <span className="mha-pager-mobile__page">
            Pág. {pagina} / {totalPags}
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
      {modal?.tipo === "resolver" && (
        <ModalPortal>
          <ModalResolver
            sol={modal.sol}
            onConfirm={confirmarResolver}
            onClose={() => setModal(null)}
          />
        </ModalPortal>
      )}
      {modal?.tipo === "confirmarEscalamiento" && (
        <ModalPortal>
          <ModalConfirmarEscalamiento
            sol={modal.sol}
            onConfirm={confirmarFinalizarEscalamiento}
            onClose={() => setModal(null)}
          />
        </ModalPortal>
      )}
    </div>
  );
}
