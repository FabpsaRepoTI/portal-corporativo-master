import arteHero from "../../../assets/mesa-servicios-atlas.png";
import PageHero from "../../../components/PageHero";
import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import "./MisSolicitudes.css";
import "./MisSolicitudes.mobile.css";
import HardwareMisSolicitudes from "./HardwareMisSolicitudes";
import MisDesarrollosPage from "../solicitudesUsuario/MisDesarrollosPage";

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

/* ─── Helpers ─────────────────────────────────────────────────── */
function fmtFecha(iso, short = false) {
  if (!iso) return "—";
  const d = new Date(iso);
  return short
    ? d.toLocaleString("es-MX", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : d.toLocaleString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function fmtTiempo(min) {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
}
function fmtBytes(b) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
function isImage(mime) {
  return mime?.startsWith("image/");
}

/* ─── SLA helpers ─────────────────────────────────────────────── */
function getSlaInfo(fechaLimite) {
  if (!fechaLimite)
    return {
      texto: "—",
      color: "var(--text-faint)",
      pct: 0,
      cls: "none",
      min: null,
    };
  const diff = new Date(fechaLimite) - new Date();
  const min = Math.floor(diff / 60000);
  const texto =
    min < 0
      ? `${Math.abs(Math.floor(min / 60))}h vencido`
      : min < 60
        ? `${min}m`
        : min < 1440
          ? `${Math.floor(min / 60)}h ${min % 60}m`
          : `${Math.floor(min / 1440)}d`;
  const cls =
    min < 0 ? "danger" : min < 60 ? "danger" : min < 180 ? "warn" : "ok";
  const color =
    cls === "danger" ? "#f38ba8" : cls === "warn" ? "#f59e0b" : "#4cc9a6";
  return {
    texto,
    color,
    cls,
    pct: Math.min(100, Math.max(0, ((1440 - min) / 1440) * 100)),
    min,
  };
}
function getSlaResolucionInfo(d) {
  const {
    idEstatus,
    fechaInicioResolucion,
    slaResolucionMin,
    tiempoTotalPausaMin = 0,
    fechaUltimaPausa,
    tiempoAtencionMin,
  } = d;
  const slaMin = slaResolucionMin ?? null;
  if (!fechaInicioResolucion)
    return {
      iniciado: false,
      slaMin,
      texto: "—",
      color: "var(--text-faint)",
      pct: 0,
      min: null,
      estado: "sin_iniciar",
    };
  if ([3, 4].includes(idEstatus) && tiempoAtencionMin != null) {
    const consumidoMin = tiempoAtencionMin,
      restante = (slaMin ?? 0) - consumidoMin;
    return {
      iniciado: true,
      concluido: true,
      slaMin,
      consumidoMin,
      tiempoReal: consumidoMin,
      texto: restante >= 0 ? `${restante} min restantes` : "Vencida",
      color: restante >= 0 ? "var(--success)" : "var(--danger)",
      pct: Math.min(100, (consumidoMin / (slaMin || 1)) * 100),
      min: restante,
      estado: restante >= 0 ? "en_tiempo" : "vencido",
    };
  }
  if (idEstatus === 6 && fechaUltimaPausa) {
    const consumidoMin = Math.max(
      0,
      Math.floor(
        (new Date(fechaUltimaPausa) - new Date(fechaInicioResolucion)) / 60000,
      ) - (tiempoTotalPausaMin ?? 0),
    );
    const restante = (slaMin ?? 0) - consumidoMin;
    return {
      iniciado: true,
      pausado: true,
      slaMin,
      consumidoMin,
      texto: `${Math.max(0, restante)} min`,
      color: "var(--warning)",
      pct: Math.min(100, (consumidoMin / (slaMin || 1)) * 100),
      min: restante,
      estado: "pausado",
    };
  }
  const ahora = new Date();
  const transcurridoMin = Math.floor(
    (ahora - new Date(fechaInicioResolucion)) / 60000,
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

/* ─── Estatus map ─────────────────────────────────────────────── */
const ESTATUS_MAP = {
  1: { label: "Abierto", bg: "rgba(124,140,248,0.12)", color: "#7c8cf8" },
  2: { label: "En progreso", bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
  3: { label: "Resuelto", bg: "rgba(16,185,129,0.12)", color: "#10b981" },
  4: { label: "Cerrado", bg: "rgba(107,114,128,0.12)", color: "#6b7280" },
  5: { label: "Cancelado", bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
  6: { label: "En pausa", bg: "rgba(246,193,119,0.12)", color: "#f6c177" },
  7: {
    label: "En diagnóstico",
    bg: "rgba(243,139,168,0.12)",
    color: "#f38ba8",
  },
  8: { label: "Escalado", bg: "rgba(243,139,168,0.15)", color: "#f38ba8" },
};
function EstatusChip({ idEstatus, label }) {
  const cfg = ESTATUS_MAP[idEstatus] ?? {
    label: label ?? "—",
    bg: "rgba(148,163,184,0.1)",
    color: "#94a3b8",
  };
  return (
    <span
      className="msp-chip"
      style={{
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}2e`,
      }}
    >
      <span className="msp-chip-dot" style={{ background: cfg.color }} />
      {cfg.label}
    </span>
  );
}
function PrioChip({ nombre, color }) {
  const hex = color || "#64748b";
  return (
    <span
      className="msp-chip"
      style={{
        background: `${hex}18`,
        color: hex,
        border: `1px solid ${hex}2e`,
      }}
    >
      <span className="msp-chip-dot" style={{ background: hex }} />
      {nombre}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════ */
function EmptyState({ tipo, onAction }) {
  const configs = {
    incidencias: {
      titulo: "Aún no has reportado ninguna incidencia.",
      sub: "Cuando necesites ayuda del equipo de TI, aquí aparecerán todas tus incidencias.",
      accion: "Reportar incidencia",
      ruta: "/mesa-de-servicio/solicitud/incidentes",
      color: "#7c8cf8",
      svg: (
        <svg viewBox="0 0 220 160" fill="none" className="msp-empty-svg">
          <rect
            x="60"
            y="30"
            width="100"
            height="72"
            rx="8"
            fill="var(--bg-elevated)"
            stroke="var(--border)"
            strokeWidth="1.5"
          />
          <rect
            x="69"
            y="39"
            width="82"
            height="54"
            rx="4"
            fill="var(--bg-base)"
          />
          <rect
            x="76"
            y="48"
            width="36"
            height="3"
            rx="1.5"
            fill="var(--border)"
          />
          <rect
            x="76"
            y="55"
            width="54"
            height="3"
            rx="1.5"
            fill="var(--border)"
          />
          <rect
            x="76"
            y="62"
            width="28"
            height="3"
            rx="1.5"
            fill="var(--border)"
          />
          <rect
            x="76"
            y="69"
            width="44"
            height="3"
            rx="1.5"
            fill="var(--border)"
          />
          <rect
            x="103"
            y="102"
            width="14"
            height="6"
            rx="1"
            fill="var(--border)"
          />
          <rect
            x="92"
            y="108"
            width="36"
            height="3"
            rx="1.5"
            fill="var(--border)"
          />
          <circle cx="136" cy="40" r="14" fill="#7c8cf8" opacity="0.12" />
          <circle
            cx="136"
            cy="40"
            r="11"
            fill="var(--bg-surface)"
            stroke="#7c8cf8"
            strokeWidth="1.5"
          />
          <rect x="135" y="33" width="2" height="8" rx="1" fill="#7c8cf8" />
          <circle cx="136" cy="44" r="1.2" fill="#7c8cf8" />
          <circle
            cx="40"
            cy="58"
            r="3.5"
            fill="#7c8cf8"
            opacity="0.2"
            className="msp-empty-dot-1"
          />
          <circle
            cx="185"
            cy="78"
            r="2.5"
            fill="#4cc9a6"
            opacity="0.25"
            className="msp-empty-dot-2"
          />
        </svg>
      ),
    },
    filtros: {
      titulo: "Sin resultados",
      sub: "Intenta con otros criterios de búsqueda.",
      accion: null,
      color: "#7c8cf8",
      svg: (
        <svg viewBox="0 0 220 160" fill="none" className="msp-empty-svg">
          <circle
            cx="110"
            cy="74"
            r="36"
            fill="var(--bg-elevated)"
            stroke="var(--border)"
            strokeWidth="1.5"
          />
          <circle
            cx="110"
            cy="74"
            r="24"
            fill="var(--bg-base)"
            stroke="var(--border)"
            strokeWidth="1"
          />
          <line
            x1="136"
            y1="100"
            x2="152"
            y2="116"
            stroke="var(--border)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M103 67 L117 81"
            stroke="var(--text-faint)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M117 67 L103 81"
            stroke="var(--text-faint)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  };
  const cfg = configs[tipo] || configs.filtros;
  return (
    <div className="msp-empty-state">
      <div className="msp-empty-illustration">{cfg.svg}</div>
      <div className="msp-empty-titulo">{cfg.titulo}</div>
      <div className="msp-empty-subtitulo">{cfg.sub}</div>
      {cfg.accion && (
        <button
          className="msp-empty-btn"
          style={{ "--btn-color": cfg.color }}
          onClick={() => onAction(cfg.ruta)}
        >
          <i className="ti ti-plus" />
          {cfg.accion}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODAL — CONFIRMAR CIERRE
   ═══════════════════════════════════════════════════════════════ */
function ModalCerrarTicket({ onConfirm, onCancel }) {
  return (
    <div className="msp-modal-overlay" onClick={onCancel}>
      <div className="msp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="msp-modal-icon">
          <i
            className="ti ti-circle-check"
            style={{ color: "#10b981", fontSize: "1.8rem" }}
          />
        </div>
        <div className="msp-modal-title">¿Deseas cerrar el ticket?</div>
        <div className="msp-modal-sub">
          Una vez cerrado, tendrás <strong>48 horas</strong> para reabrirlo si
          necesitas más ayuda. Después de ese tiempo el ticket quedará cerrado
          definitivamente.
        </div>
        <div className="msp-modal-actions">
          <button className="msp-modal-btn ghost" onClick={onCancel}>
            No, mantener abierto
          </button>
          <button className="msp-modal-btn primary" onClick={onConfirm}>
            Sí, cerrar ticket
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MODAL — REAPERTURA CON MOTIVO OBLIGATORIO
   ═══════════════════════════════════════════════════════════════ */
function ModalReabrirTicket({ onConfirm, onCancel, loading, errorExterno }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const textareaRef = useRef(null);
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 80);
  }, []);
  useEffect(() => {
    if (errorExterno) setError(errorExterno);
  }, [errorExterno]);
  function handleConfirm() {
    if (!motivo.trim()) {
      setError("El motivo de reapertura es obligatorio.");
      return;
    }
    setError("");
    onConfirm(motivo.trim());
  }
  return (
    <div className="msp-modal-overlay" onClick={onCancel}>
      <div
        className="msp-modal"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="msp-modal-icon"
          style={{
            background: "rgba(124,140,248,0.1)",
            border: "1px solid rgba(124,140,248,0.25)",
          }}
        >
          <i
            className="ti ti-refresh"
            style={{ color: "#7c8cf8", fontSize: "1.8rem" }}
          />
        </div>
        <div className="msp-modal-title">Reabrir ticket</div>
        <div className="msp-modal-sub">
          Indica el motivo por el cual deseas reabrir este ticket.
        </div>
        <div style={{ width: "100%", textAlign: "left" }}>
          <textarea
            ref={textareaRef}
            rows={4}
            placeholder="Describe el motivo de la reapertura…"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (error) setError("");
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "var(--bg-elevated)",
              border: `1px solid ${error ? "#f38ba8" : "var(--border)"}`,
              borderRadius: 8,
              color: "var(--text-body)",
              fontSize: 12.5,
              padding: "0.55rem 0.75rem",
              resize: "vertical",
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.55,
              transition: "border-color 0.18s",
            }}
          />
          {error && (
            <div
              style={{
                fontSize: 11.5,
                color: "#f38ba8",
                marginTop: 4,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <i className="ti ti-alert-circle" style={{ fontSize: 12 }} />
              {error}
            </div>
          )}
        </div>
        <div className="msp-modal-actions">
          <button
            className="msp-modal-btn ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            className="msp-modal-btn"
            style={{
              background: "#7c8cf8",
              border: "none",
              color: "#0f172a",
              fontWeight: 600,
              opacity: loading ? 0.6 : 1,
            }}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <i
                  className="ti ti-loader spinning"
                  style={{ marginRight: 4 }}
                />
                Reabriendo…
              </>
            ) : (
              <>
                <i className="ti ti-refresh" style={{ marginRight: 4 }} />
                Reabrir ticket
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   POPOVER EVALUACIÓN
   ═══════════════════════════════════════════════════════════════ */
function EvalPopover({ ticketId, detalle, onEvaluado, onClose }) {
  const [estrellas, setEstrellas] = useState(0),
    [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState(""),
    [enviando, setEnviando] = useState(false),
    [enviado, setEnviado] = useState(false);
  const ref = useRef(null);
  const LABELS = ["Muy malo", "Malo", "Regular", "Bueno", "Excelente"];
  const EMOJIS = ["😤", "😕", "😐", "😊", "🤩"];
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);
  async function enviar() {
    if (!estrellas || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(
        `${API}/api/solicitudes-usuario/${ticketId}/evaluacion`,
        {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({
            calificacion: estrellas,
            comentario: comentario.trim() || null,
          }),
        },
      );
      if (!r.ok) throw new Error();
      setEnviado(true);
      setTimeout(() => {
        onEvaluado(true);
        onClose();
      }, 1200);
    } catch {
      setEnviando(false);
    }
  }
  const nivel = hover || estrellas;
  return (
    <div className="msp-eval-popover" ref={ref}>
      {enviado ? (
        <div className="msp-eval-pop-thanks">
          <span>🎉</span>
          <span>¡Gracias! Un momento…</span>
        </div>
      ) : (
        <>
          <div className="msp-eval-pop-header">
            {detalle?.nombreTecnico && (
              <div className="msp-eval-pop-tech">
                <div className="msp-eval-pop-avatar">
                  {initials(detalle.nombreTecnico)}
                </div>
                <div>
                  <div className="msp-eval-pop-tech-name">
                    {detalle.nombreTecnico}
                  </div>
                  <div className="msp-eval-pop-tech-role">Ingeniero TI</div>
                </div>
              </div>
            )}
            {detalle?.tiempoAtencionMin && (
              <div className="msp-eval-pop-stat">
                <i className="ti ti-clock" />
                {fmtTiempo(detalle.tiempoAtencionMin)}
              </div>
            )}
            <button className="msp-eval-pop-close" onClick={onClose}>
              <i className="ti ti-x" />
            </button>
          </div>
          <div className="msp-eval-pop-question">
            ¿Cómo fue la atención recibida?
          </div>
          <div className="msp-eval-pop-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`msp-eval-pop-star ${nivel >= n ? "active" : ""}`}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setEstrellas(n)}
              >
                <i className="ti ti-star-filled" />
              </button>
            ))}
          </div>
          {nivel > 0 && (
            <div className="msp-eval-pop-label">
              {EMOJIS[nivel - 1]} {LABELS[nivel - 1]}
            </div>
          )}
          {estrellas > 0 && (
            <textarea
              className="msp-eval-pop-textarea"
              rows={2}
              placeholder="Comentario opcional…"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          )}
          <button
            className="msp-eval-pop-btn"
            disabled={!estrellas || enviando}
            onClick={enviar}
          >
            {enviando ? (
              <>
                <i className="ti ti-loader spinning" />
                Enviando…
              </>
            ) : (
              <>
                <i className="ti ti-send" />
                Enviar evaluación
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB: Información general
   ═══════════════════════════════════════════════════════════════ */
function TabInfoGeneral({ d }) {
  const resolInfo = getSlaResolucionInfo(d);
  let resolucionEstimada;
  if (!resolInfo.iniciado)
    resolucionEstimada = (
      <span style={{ color: "var(--text-faint)", fontSize: 11 }}>
        Sin iniciar — esperando "En proceso"
      </span>
    );
  else if (resolInfo.pausado)
    resolucionEstimada = (
      <span style={{ color: "var(--warning)" }}>
        ⏸ {resolInfo.texto} restantes (pausado)
      </span>
    );
  else if (resolInfo.concluido)
    resolucionEstimada = (
      <span style={{ color: "var(--success)" }}>
        {fmtTiempo(resolInfo.tiempoReal)} (resuelto)
      </span>
    );
  else
    resolucionEstimada = (
      <span style={{ color: resolInfo.color, fontWeight: 600 }}>
        {resolInfo.texto}
      </span>
    );
  return (
    <div className="msp-tab-content msp-tab-content--info">
      <div className="msp-detail-section">
        <div className="msp-detail-section-title">Detalles</div>
        <div className="msp-detail-row">
          <span className="msp-detail-label">Folio</span>
          <span
            className="msp-detail-value"
            style={{
              color: "#7c8cf8",
              fontFamily: "monospace",
              fontWeight: 700,
            }}
          >
            {d.folio}
          </span>
        </div>
        <div className="msp-detail-row">
          <span className="msp-detail-label">Servicio</span>
          <span className="msp-detail-value">{d.servicio}</span>
        </div>
        {d.categoria && (
          <div className="msp-detail-row">
            <span className="msp-detail-label">Categoría</span>
            <span className="msp-detail-value">{d.categoria}</span>
          </div>
        )}
        <div className="msp-detail-row">
          <span className="msp-detail-label">Descripción del incidente</span>
          <div className="msp-descripcion-box">
            {d.descripcion || "Sin descripción."}
          </div>
        </div>
      </div>
      <div className="msp-detail-section">
        <div className="msp-detail-section-title">Estado</div>
        <div className="msp-detail-row">
          <span className="msp-detail-label">Prioridad</span>
          <PrioChip nombre={d.prioridadNombre} color={d.prioridadColor} />
        </div>
        <div className="msp-detail-row">
          <span className="msp-detail-label">Estado</span>
          <EstatusChip idEstatus={d.idEstatus} label={d.estatusNombre} />
        </div>
        <div className="msp-detail-row">
          <span className="msp-detail-label">Creación</span>
          <span className="msp-detail-value">{fmtFecha(d.fechaCreacion)}</span>
        </div>
        <div className="msp-detail-row">
          <span className="msp-detail-label">Actualización</span>
          <span className="msp-detail-value">
            {fmtFecha(d.fechaActualizacion || d.fechaCreacion)}
          </span>
        </div>
        {d.fechaResolucion && (
          <div className="msp-detail-row">
            <span className="msp-detail-label">Resolución</span>
            <span className="msp-detail-value">
              {fmtFecha(d.fechaResolucion)}
            </span>
          </div>
        )}
      </div>
      <div className="msp-detail-section">
        <div className="msp-detail-section-title">Asignación</div>
        <div className="msp-asignacion-card">
          <div className="msp-asignacion-title">Ingeniero asignado</div>
          {d.nombreTecnico ? (
            <div className="msp-tech-row">
              <div className="msp-tech-avatar">{initials(d.nombreTecnico)}</div>
              <div>
                <div className="msp-tech-name">{d.nombreTecnico}</div>
                <div className="msp-tech-role">Ingeniero TI · Sistemas</div>
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-faint)", fontSize: 13 }}>
              Sin asignar aún
            </div>
          )}
          {d.accionesRealizadas && (
            <div
              style={{
                marginTop: "0.75rem",
                borderTop: "1px solid var(--border)",
                paddingTop: "0.65rem",
              }}
            >
              <div className="msp-asignacion-title">Resolución</div>
              <div
                className="msp-descripcion-box"
                style={{ marginTop: "0.3rem" }}
              >
                {d.accionesRealizadas}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="msp-detail-section">
        <div className="msp-detail-section-title">Tiempos</div>
        <div className="msp-tiempos-card">
          <div className="msp-tiempo-row">
            <span className="msp-tiempo-label">Primera respuesta</span>
            <span className="msp-tiempo-val">
              {fmtFecha(d.fechaLimiteResp, true)}
            </span>
          </div>
          <div className="msp-tiempo-row">
            <span className="msp-tiempo-label">SLA respuesta</span>
            <span className="msp-tiempo-val">
              {d.slaRespuestaMin ?? "—"} min
            </span>
          </div>
          <div className="msp-tiempo-row">
            <span className="msp-tiempo-label">Inicio resolución</span>
            <span className="msp-tiempo-val">
              {fmtFecha(d.fechaInicioResolucion, true)}
            </span>
          </div>
          <div className="msp-tiempo-row">
            <span className="msp-tiempo-label">SLA resolución</span>
            <span className="msp-tiempo-val">
              {resolInfo.slaMin ?? "—"} min
            </span>
          </div>
          {/*<div className="msp-tiempo-row">
            <span className="msp-tiempo-label">Resolución estimada change</span>
            <span className="msp-tiempo-val">{resolucionEstimada}</span>
          </div>*/}
          {d.tiempoAtencionMin != null && (
            <div className="msp-tiempo-row">
              <span className="msp-tiempo-label">Tiempo de atención</span>
              <span className="msp-tiempo-val">
                {fmtTiempo(d.tiempoAtencionMin)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB: Evidencias
   ═══════════════════════════════════════════════════════════════ */
function TabEvidencias({ archivos, ticketId, onArchivoSubido }) {
  const [lightbox, setLightbox] = useState(null),
    [progreso, setProgreso] = useState(null),
    [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef(null);
  function buildUrl(ruta) {
    if (!ruta) return "";
    if (ruta.startsWith("http")) return ruta;
    return `${STATIC_BASE}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
  }
  async function handleFiles(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setSubiendo(true);
    setProgreso("subiendo");
    const formData = new FormData();
    files.forEach((f) => formData.append("archivos", f));
    try {
      const t = localStorage.getItem("fabpsa_token");
      const r = await fetch(
        `${API}/api/solicitudes-usuario/${ticketId}/archivos`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${t}` },
          body: formData,
        },
      );
      if (!r.ok) throw new Error();
      onArchivoSubido(await r.json());
      setProgreso("ok");
      setTimeout(() => setProgreso(null), 2500);
    } catch {
      setProgreso("error");
      setTimeout(() => setProgreso(null), 3000);
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  return (
    <div className="msp-tab-content">
      <div
        className="msp-upload-zone"
        onClick={() => !subiendo && fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xlsx,.xls,.txt"
          style={{ display: "none" }}
          onChange={handleFiles}
        />
        {progreso === "subiendo" ? (
          <>
            <i className="ti ti-loader msp-upload-icon spinning" />
            <span className="msp-upload-label">Subiendo…</span>
          </>
        ) : progreso === "ok" ? (
          <>
            <i
              className="ti ti-circle-check msp-upload-icon"
              style={{ color: "#4cc9a6" }}
            />
            <span className="msp-upload-label" style={{ color: "#4cc9a6" }}>
              ¡Archivos adjuntados!
            </span>
          </>
        ) : progreso === "error" ? (
          <>
            <i
              className="ti ti-alert-circle msp-upload-icon"
              style={{ color: "#f38ba8" }}
            />
            <span className="msp-upload-label" style={{ color: "#f38ba8" }}>
              No se pudieron subir
            </span>
          </>
        ) : (
          <>
            <i className="ti ti-cloud-upload msp-upload-icon" />
            <span className="msp-upload-label">
              Haz clic para adjuntar archivos
            </span>
            <span className="msp-upload-hint">
              Imágenes, PDF, Word, Excel — máx. 10 MB
            </span>
          </>
        )}
      </div>
      <div className="msp-evidencias-grid">
        {!archivos?.length ? (
          <span className="msp-evidencias-empty">Sin evidencias adjuntas.</span>
        ) : (
          archivos.map((a) => {
            const url = buildUrl(a.rutaServidor);
            if (isImage(a.mimeType))
              return (
                <div
                  key={a.idArchivo}
                  className="msp-evidencia-thumb"
                  onClick={() => setLightbox(url)}
                >
                  <img src={url} alt={a.nombreArchivo} />
                </div>
              );
            return (
              <button
                key={a.idArchivo}
                className="msp-evidencia-file"
                onClick={() => window.open(url, "_blank")}
              >
                <i
                  className="ti ti-file-description"
                  style={{ fontSize: "1.5rem", color: "var(--text-muted)" }}
                />
                <span>{a.nombreArchivo}</span>
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                  {fmtBytes(a.tamanoBytes)}
                </span>
              </button>
            );
          })
        )}
      </div>
      {lightbox && (
        <div className="msp-lightbox" onClick={() => setLightbox(null)}>
          <img
            src={lightbox}
            alt="evidencia"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="msp-lightbox-close"
            onClick={() => setLightbox(null)}
          >
            <i className="ti ti-x" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB: Comentarios
   ═══════════════════════════════════════════════════════════════ */
function TabComentarios({ d, ticketId, user, onNuevoComentario }) {
  const [texto, setTexto] = useState(""),
    [enviando, setEnviando] = useState(false);
  const ref = useRef(null);
  const cerrado = [4, 5].includes(d.idEstatus);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [d.comentarios]);
  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(
        `${API}/api/solicitudes-usuario/${ticketId}/comentario`,
        {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({ comentario: texto.trim() }),
        },
      );
      if (!r.ok) throw new Error();
      onNuevoComentario(await r.json());
      setTexto("");
    } finally {
      setEnviando(false);
    }
  }
  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }
  return (
    <div className="msp-tab-content">
      <div className="msp-conv-content">
        {!d.comentarios?.length ? (
          <div className="msp-conv-empty">
            <i
              className="ti ti-message-circle-off"
              style={{ fontSize: "1.4rem", marginBottom: 6 }}
            />
            <br />
            Sin mensajes aún
          </div>
        ) : (
          <div className="msp-mensajes" ref={ref}>
            {d.comentarios.map((c) => {
              const esMio = c.idUsuario === user.login;
              return (
                <div
                  key={c.idComentario}
                  className={`msp-mensaje ${esMio ? "usuario" : "tecnico"}`}
                >
                  <div className="msp-mensaje-header">
                    <div className={`msp-msg-avatar ${esMio ? "usr" : "ti"}`}>
                      {initials(c.nombreUsuario)}
                    </div>
                    <span className={`msp-msg-rol-tag ${esMio ? "usr" : "ti"}`}>
                      {esMio ? "Tú" : "Ingeniero"}
                    </span>
                    <span style={{ fontSize: 11 }}>{c.nombreUsuario}</span>
                    <span style={{ color: "var(--text-faint)" }}>·</span>
                    <span style={{ fontSize: 11 }}>
                      {fmtFecha(c.fecha, true)}
                    </span>
                  </div>
                  <div className="msp-burbuja">{c.comentario}</div>
                </div>
              );
            })}
          </div>
        )}
        {!cerrado ? (
          <div className="msp-conv-actions">
            <div className="msp-conv-actions-label">
              ¿Tienes alguna actualización?
            </div>
            <div className="msp-conv-input-row">
              <textarea
                className="msp-conv-textarea"
                rows={3}
                placeholder="Escribe tu mensaje… (Enter para enviar)"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={onKey}
              />
              <div className="msp-conv-btns">
                <button
                  className="msp-btn-action primary"
                  onClick={enviar}
                  disabled={!texto.trim() || enviando}
                >
                  <i className="ti ti-send" />
                  {enviando ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="msp-conv-cerrado">
            Esta solicitud está {d.estatusNombre?.toLowerCase()} — no se pueden
            agregar comentarios
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB: Seguimiento y resolución
   Línea de tiempo unificada: bitácora + escalamiento + reaperturas
   ═══════════════════════════════════════════════════════════════ */
function TabSeguimiento({ d }) {
  const items = [];

  // Bitácora del ingeniero
  (d.bitacora ?? []).forEach((b) => {
    items.push({
      tipo: "bitacora",
      fecha: new Date(b.fecha),
      nota: b.nota,
      autor: b.nombreUsuario,
      idKey: `b-${b.idBitacora}`,
    });
  });

  // Escalamiento visible al usuario (solo si está escalado y hay fecha)
  if (d.idEstatus === 8 && d.fechaInicioEscalamiento) {
    const yaEnBitacora = (d.bitacora ?? []).some((b) =>
      b.nota?.toLowerCase().includes("escalad"),
    );
    if (!yaEnBitacora) {
      items.push({
        tipo: "escalamiento",
        fecha: new Date(d.fechaInicioEscalamiento),
        nombreProveedor: d.nombreProveedor,
        idKey: "escalamiento-0",
      });
    }
  }

  // Historial completo de reaperturas
  (d.reaperturas ?? []).forEach((r) => {
    items.push({
      tipo: "reapertura",
      fecha: new Date(r.fechaReapertura),
      motivo: r.motivo,
      autor: r.nombreUsuario,
      idKey: `r-${r.idReapertura}`,
    });
  });

  // Orden cronológico
  items.sort((a, b) => a.fecha - b.fecha);

  const tipoConfig = {
    bitacora: {
      color: "var(--primary)",
      bg: "rgba(76,201,166,0.1)",
      label: "Ingeniero TI",
      icon: "ti-point-filled",
    },
    escalamiento: {
      color: "#f38ba8",
      bg: "rgba(243,139,168,0.1)",
      label: "Escalamiento",
      icon: "ti-arrow-up-right",
    },
    reapertura: {
      color: "#7c8cf8",
      bg: "rgba(124,140,248,0.1)",
      label: "Ticket reabierto",
      icon: "ti-refresh",
    },
  };

  if (!items.length) {
    return (
      <div className="msp-tab-content">
        <div
          style={{
            gridColumn: "1/-1",
            textAlign: "center",
            padding: "2rem 1rem",
            color: "var(--text-faint)",
            fontSize: 13,
          }}
        >
          <i
            className="ti ti-timeline"
            style={{
              fontSize: "1.8rem",
              display: "block",
              marginBottom: 8,
              color: "var(--border)",
            }}
          />
          Sin actividades registradas aún.
        </div>
      </div>
    );
  }

  return (
    <div className="msp-tab-content">
      <div style={{ gridColumn: "1/-1" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {items.map((item, i) => {
            const cfg = tipoConfig[item.tipo];
            return (
              <div
                key={item.idKey}
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
                    background: cfg.bg,
                    border: `2px solid ${cfg.color}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 1,
                    zIndex: 1,
                  }}
                >
                  <i
                    className={`ti ${cfg.icon}`}
                    style={{ fontSize: 8, color: cfg.color }}
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
                      {fmtFecha(item.fecha, true)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "1px 8px",
                        borderRadius: 20,
                        background: cfg.bg,
                        color: cfg.color,
                      }}
                    >
                      {cfg.label}
                    </span>
                  </div>
                  {item.tipo === "bitacora" && (
                    <div
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontSize: 12.5,
                        color: "var(--text-body)",
                        lineHeight: 1.65,
                        wordBreak: "break-word",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "break-word",
                      }}
                    >
                      {item.nota}
                    </div>
                  )}
                  {item.tipo === "escalamiento" && (
                    <div
                      style={{
                        background: "rgba(243,139,168,0.06)",
                        border: "1px solid rgba(243,139,168,0.2)",
                        borderRadius: 8,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "#f38ba8",
                          marginBottom: 3,
                        }}
                      >
                        <i
                          className="ti ti-arrow-up-right"
                          style={{ marginRight: 5 }}
                        />
                        Ticket escalado
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          lineHeight: 1.55,
                        }}
                      >
                        Este incidente fue escalado a un proveedor especializado
                        para continuar con su atención.
                        {item.nombreProveedor && (
                          <span
                            style={{
                              display: "block",
                              marginTop: 4,
                              color: "var(--text-body)",
                              fontWeight: 500,
                            }}
                          >
                            Proveedor: {item.nombreProveedor}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {item.tipo === "reapertura" && (
                    <div
                      style={{
                        background: "rgba(124,140,248,0.06)",
                        border: "1px solid rgba(124,140,248,0.2)",
                        borderRadius: 8,
                        padding: "10px 12px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "#7c8cf8",
                          marginBottom: 3,
                        }}
                      >
                        <i
                          className="ti ti-refresh"
                          style={{ marginRight: 5 }}
                        />
                        Ticket reabierto
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          lineHeight: 1.55,
                        }}
                      >
                        Motivo:{" "}
                        <span
                          style={{
                            display: "block",
                            marginTop: 2,
                            color: "var(--text-body)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {item.motivo}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Panel expandido
   ═══════════════════════════════════════════════════════════════ */
function DetalleExpandido({
  id,
  user,
  initialTab,
  onAccionCancelar,
  onRefresh,
  refreshTick,
}) {
  const [detalle, setDetalle] = useState(null),
    [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(initialTab ?? "info");
  const [yaEvaluo, setYaEvaluo] = useState(false),
    [showEval, setShowEval] = useState(false);
  const [cerrando, setCerrando] = useState(false),
    [reabriendo, setReabriendo] = useState(false);
  const [pedirCierre, setPedirCierre] = useState(false),
    [pedirReapertura, setPedirReapertura] = useState(false);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/solicitudes-usuario/${id}/detalle`, {
        headers: authH(),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setDetalle(data);
      setYaEvaluo(data.yaEvaluo || false);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar, refreshTick]);

  function onNuevoComentario(c) {
    setDetalle((p) => ({ ...p, comentarios: [...(p.comentarios || []), c] }));
  }
  function onArchivoSubido(nuevos) {
    setDetalle((p) => ({ ...p, archivos: [...(p.archivos || []), ...nuevos] }));
  }

  async function handleCerrar() {
    setCerrando(true);
    try {
      const r = await fetch(`${API}/api/solicitudes-usuario/${id}/cerrar`, {
        method: "PUT",
        headers: authH(),
      });
      if (!r.ok) throw new Error();
      onRefresh();
    } catch {
      alert("No se pudo cerrar el ticket.");
    } finally {
      setCerrando(false);
    }
  }

  const [errorReapertura, setErrorReapertura] = useState("");

  async function handleReabrir(motivo) {
    setReabriendo(true);
    setErrorReapertura("");
    try {
      const r = await fetch(`${API}/api/solicitudes-usuario/${id}/reabrir`, {
        method: "PUT",
        headers: authH(),
        body: JSON.stringify({ motivoReapertura: motivo }),
      });
      const data = await r.json();
      if (!data.ok) {
        setErrorReapertura(data.error || "No se pudo reabrir el ticket.");
        return;
      }
      setPedirReapertura(false);
      setYaEvaluo(false);
      onRefresh();
    } catch (e) {
      setErrorReapertura(e.message || "No se pudo reabrir el ticket.");
    } finally {
      setReabriendo(false);
    }
  }

  function puedeReabrir() {
    if (!detalle || detalle.idEstatus !== 4) return false;
    if (!detalle.fechaResolucion) return false;
    return (new Date() - new Date(detalle.fechaResolucion)) / 3_600_000 <= 48;
  }

  const nComentarios = detalle?.comentarios?.length || 0;
  const nEvidencias = detalle?.archivos?.length || 0;
  const nSeguimiento =
    (detalle?.bitacora?.length || 0) +
    (detalle?.reaperturas?.length || 0) +
    (detalle?.idEstatus === 8 ? 1 : 0);
  const puedeCancel = detalle?.idEstatus === 1;
  const esResuelto = detalle?.idEstatus === 3;
  const esCerrado = detalle?.idEstatus === 4;

  return (
    <div className="msp-detail">
      {loading ? (
        <div style={{ padding: "1.5rem", display: "flex", gap: 12 }}>
          {[100, 160, 200, 140].map((w, i) => (
            <div
              key={i}
              className="msp-skeleton"
              style={{ height: 12, width: w }}
            />
          ))}
        </div>
      ) : !detalle ? (
        <div
          style={{
            padding: "2rem",
            color: "var(--text-faint)",
            textAlign: "center",
          }}
        >
          No se pudo cargar el detalle.
        </div>
      ) : (
        <>
          <div className="msp-tabs">
            {[
              { key: "info", label: "Información", icon: "ti-info-circle" },
              {
                key: "evidencias",
                label: "Evidencias",
                icon: "ti-paperclip",
                count: nEvidencias,
              },
              {
                key: "comentarios",
                label: "Comentarios",
                icon: "ti-message",
                count: nComentarios,
              },
            ].map((t) => (
              <button
                key={t.key}
                className={`msp-tab ${tab === t.key ? "active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                <i className={`ti ${t.icon}`} />
                {t.label}
                {t.count > 0 && (
                  <span className="msp-tab-badge">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {tab === "info" && <TabInfoGeneral d={detalle} />}
          {tab === "evidencias" && (
            <TabEvidencias
              archivos={detalle.archivos}
              ticketId={id}
              onArchivoSubido={onArchivoSubido}
            />
          )}
          {tab === "comentarios" && (
            <TabComentarios
              d={detalle}
              ticketId={id}
              user={user}
              onNuevoComentario={onNuevoComentario}
            />
          )}
          {tab === "seguimiento" && <TabSeguimiento d={detalle} />}

          <div className="msp-detail-actions">
            <span className="msp-detail-actions-label">Acciones</span>
            <button
              className="msp-btn-action"
              onClick={() => setTab("comentarios")}
            >
              <i className="ti ti-message" />
              Agregar comentario
            </button>

            {esResuelto && !yaEvaluo && (
              <div className="msp-eval-trigger-wrap">
                <button
                  className="msp-eval-trigger"
                  onClick={() => setShowEval((v) => !v)}
                >
                  <i className="ti ti-star" />
                  Calificar atención
                </button>
                {showEval && (
                  <EvalPopover
                    ticketId={id}
                    detalle={detalle}
                    onEvaluado={(cerrar) => {
                      setYaEvaluo(true);
                      setShowEval(false);
                      if (cerrar) setPedirCierre(true);
                    }}
                    onClose={() => setShowEval(false)}
                  />
                )}
              </div>
            )}

            {pedirCierre && (
              <ModalCerrarTicket
                onConfirm={() => {
                  setPedirCierre(false);
                  handleCerrar();
                }}
                onCancel={() => setPedirCierre(false)}
              />
            )}

            {esResuelto && yaEvaluo && (
              <>
                <span className="msp-eval-done">
                  <i
                    className="ti ti-star-filled"
                    style={{ color: "#f59e0b" }}
                  />
                  Servicio evaluado
                </span>
                <button
                  className="msp-btn-action"
                  style={{
                    color: "#10b981",
                    borderColor: "rgba(16,185,129,0.3)",
                  }}
                  onClick={handleCerrar}
                  disabled={cerrando}
                >
                  <i className="ti ti-lock" />
                  {cerrando ? "Cerrando…" : "Cerrar ticket"}
                </button>
              </>
            )}

            {esCerrado && puedeReabrir() && (
              <button
                className="msp-btn-action"
                style={{
                  color: "#7c8cf8",
                  borderColor: "rgba(124,140,248,0.3)",
                }}
                onClick={() => setPedirReapertura(true)}
                disabled={reabriendo}
              >
                <i className="ti ti-refresh" />
                Reabrir ticket
              </button>
            )}

            {pedirReapertura && (
              <ModalReabrirTicket
                loading={reabriendo}
                onConfirm={handleReabrir}
                onCancel={() => {
                  setPedirReapertura(false);
                  setErrorReapertura("");
                }}
                errorExterno={errorReapertura}
              />
            )}

            {puedeCancel && (
              <button
                className="msp-btn-action danger"
                onClick={() => onAccionCancelar(id)}
              >
                <i className="ti ti-x" />
                Cancelar solicitud
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CONSTANTES
   ═══════════════════════════════════════════════════════════════ */
const MAIN_TABS = [
  {
    key: "incidencias",
    label: "Incidencias y fallas",
    icon: "ti-alert-triangle",
    color: "#7c8cf8",
    colorBg: "rgba(124,140,248,0.12)",
  },
  {
    key: "hardware",
    label: "Solicitudes de hardware",
    icon: "ti-device-laptop",
    color: "#10b981",
    colorBg: "rgba(16,185,129,0.12)",
  },
  {
    key: "software",
    label: "Solicitudes de desarrollo",
    icon: "ti-code",
    color: "#4f46e5",
    colorBg: "rgba(79,70,229,0.10)",
  },
];
const ESTATUS_INC_OPTS = [
  { value: "", label: "Estado: Todos" },
  { value: 1, label: "Abierto" },
  { value: 2, label: "En progreso" },
  { value: 3, label: "Resuelto" },
  { value: 4, label: "Cerrado" },
  { value: 5, label: "Cancelado" },
  { value: 6, label: "En pausa" },
];
const PRIORIDAD_OPTS = [
  { value: "", label: "Prioridad: Todas" },
  { value: 1, label: "Crítica" },
  { value: 2, label: "Alta" },
  { value: 3, label: "Media" },
  { value: 4, label: "Baja" },
];
const ESTATUS_HW_OPTS = [
  { value: "", label: "Estado: Todos" },
  { value: "Pendiente", label: "Pendiente" },
  { value: "En proceso", label: "En proceso" },
  { value: "Completada", label: "Completada" },
  { value: "Parcialmente atendida", label: "Parcialmente atendida" },
  { value: "Rechazada", label: "Rechazada" },
];

/* ═══════════════════════════════════════════════════════════════
   PÁGINA PRINCIPAL
   ═══════════════════════════════════════════════════════════════ */
export default function MisSolicitudesPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mainTab, setMainTab] = useState("incidencias");
  const [kpis, setKpis] = useState(null),
    [kpisHw, setKpisHw] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]),
    [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null),
    [pendingTab, setPendingTab] = useState(null);
  const [buscar, setBuscar] = useState(""),
    [refreshTick, setRefreshTick] = useState(0);
  const [filtroEstatus, setFiltroEstatus] = useState(""),
    [filtroPrioridad, setFiltroPrioridad] = useState("");

  useEffect(() => {
    const folio = searchParams.get("folio"),
      tab = searchParams.get("tab");
    if (!folio || !solicitudes.length) return;
    const found = solicitudes.find((s) => s.folio === folio);
    if (found) {
      setExpandedId(found.idSolicitud);
      if (tab) setPendingTab(tab);
      setTimeout(
        () =>
          document
            .getElementById(`row-${found.idSolicitud}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" }),
        300,
      );
    }
  }, [searchParams, solicitudes]);

  const cargarKpis = useCallback(() => {
    fetch(`${API}/api/solicitudes-usuario/kpis`, { headers: authH() })
      .then((r) => r.json())
      .then(setKpis)
      .catch(() => {});
    fetch(`${API}/api/solicitudes-usuario/hardware/kpis`, { headers: authH() })
      .then((r) => r.json())
      .then(setKpisHw)
      .catch(() => {});
  }, []);
  useEffect(() => {
    cargarKpis();
  }, [cargarKpis]);

  const fetchLista = useCallback(async () => {
    if (mainTab !== "incidencias") return;
    setLoading(true);
    setExpandedId(null);
    const p = new URLSearchParams();
    if (filtroEstatus) p.set("estatus", filtroEstatus);
    if (filtroPrioridad) p.set("prioridad", filtroPrioridad);
    if (buscar.trim()) p.set("buscar", buscar.trim());
    try {
      const r = await fetch(`${API}/api/solicitudes-usuario?${p}`, {
        headers: authH(),
      });
      const data = await r.json();
      setSolicitudes(Array.isArray(data) ? data : []);
    } catch {
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, [filtroEstatus, filtroPrioridad, buscar, mainTab]);
  useEffect(() => {
    fetchLista();
  }, [fetchLista]);

  function switchTab(key) {
    setMainTab(key);
    setBuscar("");
    setFiltroEstatus("");
    setFiltroPrioridad("");
    setExpandedId(null);
  }
  function toggleRow(id) {
    setExpandedId((p) => (p === id ? null : id));
    setPendingTab(null);
  }

  async function cancelarSolicitud(id) {
    if (!window.confirm("¿Estás seguro de que deseas cancelar esta solicitud?"))
      return;
    try {
      await fetch(`${API}/api/solicitudes-usuario/${id}/cancelar`, {
        method: "PUT",
        headers: authH(),
      });
      fetchLista();
      cargarKpis();
      setExpandedId(null);
    } catch {
      alert("No se pudo cancelar.");
    }
  }

  const kpiCardsInc = [
    {
      id: 0,
      label: "Total",
      val: kpis?.total ?? "—",
      icon: "ti-layout-list",
      color: "#7c8cf8",
      bg: "rgba(124,140,248,0.12)",
    },
    {
      id: 2,
      label: "En progreso",
      val: kpis?.enProceso ?? "—",
      icon: "ti-loader",
      color: "#7c8cf8",
      bg: "rgba(124,140,248,0.12)",
    },
    {
      id: 1,
      label: "Pendientes",
      val: kpis?.abiertas ?? "—",
      icon: "ti-hourglass",
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.12)",
    },
    {
      id: 3,
      label: "Resueltas",
      val: kpis?.resueltas ?? "—",
      icon: "ti-circle-check",
      color: "#4cc9a6",
      bg: "rgba(76,201,166,0.12)",
    },
    {
      id: 5,
      label: "Canceladas",
      val: kpis?.canceladas ?? "—",
      icon: "ti-circle-x",
      color: "#f38ba8",
      bg: "rgba(243,139,168,0.12)",
    },
  ];
  const kpiCardsHw = [
    {
      id: "",
      label: "Total",
      val: kpisHw?.total ?? "—",
      icon: "ti-package",
      color: "#10b981",
      bg: "rgba(16,185,129,0.12)",
    },
    {
      id: "En proceso",
      label: "En proceso",
      val: kpisHw?.enProceso ?? "—",
      icon: "ti-loader",
      color: "#7c8cf8",
      bg: "rgba(124,140,248,0.12)",
    },
    {
      id: "Pendiente",
      label: "Pendientes",
      val: kpisHw?.pendientes ?? "—",
      icon: "ti-hourglass",
      color: "#F59E0B",
      bg: "rgba(245,158,11,0.12)",
    },
    {
      id: "Completada",
      label: "Completadas",
      val: kpisHw?.completadas ?? "—",
      icon: "ti-circle-check",
      color: "#4cc9a6",
      bg: "rgba(76,201,166,0.12)",
    },
    {
      id: "Rechazada",
      label: "Rechazadas",
      val: kpisHw?.rechazadas ?? "—",
      icon: "ti-circle-x",
      color: "#f38ba8",
      bg: "rgba(243,139,168,0.12)",
    },
  ];
  const kpiCards =
    mainTab === "hardware"
      ? kpiCardsHw
      : mainTab === "software"
        ? []
        : kpiCardsInc;
  const emptyType =
    buscar || filtroEstatus || filtroPrioridad ? "filtros" : "incidencias";

  return (
    <div className="msp-page">
      <div className="msp-inner">
        {/* Encabezado estándar del portal (mismo que Información Técnica) */}
        <PageHero
          arte={arteHero}
          eyebrow="Mesa de Servicio"
          titulo="Mis"
          resalte="Solicitudes"
          sub="Consulta y da seguimiento a tus solicitudes con el equipo de Sistemas."
          volver={{ to: "/mesa-de-servicio", label: "Volver a la Mesa de Ayuda" }}
        />

        <div className="msp-kpi-strip">
          {kpiCards.map((k) => (
            <div
              key={k.id}
              className={`msp-kpi-card ${filtroEstatus == k.id ? "active" : ""}`}
              onClick={() => setFiltroEstatus((p) => (p == k.id ? "" : k.id))}
            >
              <div className="msp-kpi-icon" style={{ background: k.bg }}>
                <i className={`ti ${k.icon}`} style={{ color: k.color }} />
              </div>
              <div className="msp-kpi-info">
                <span className="msp-kpi-num">{k.val}</span>
                <span className="msp-kpi-label">{k.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="msp-table-card">
          <div className="msp-main-tabs">
            {MAIN_TABS.map((t) => (
              <button
                key={t.key}
                className={`msp-main-tab ${mainTab === t.key ? "active" : ""}`}
                style={
                  mainTab === t.key
                    ? { "--tab-color": t.color, "--tab-bg": t.colorBg }
                    : {}
                }
                onClick={() => switchTab(t.key)}
              >
                <span
                  className="msp-main-tab-icon-wrap"
                  style={mainTab === t.key ? { background: t.colorBg } : {}}
                >
                  <i
                    className={`ti ${t.icon}`}
                    style={{
                      color: mainTab === t.key ? t.color : "var(--text-faint)",
                    }}
                  />
                </span>
                <span>{t.label}</span>
                {mainTab === t.key && (
                  <span
                    className="msp-main-tab-indicator"
                    style={{ background: t.color }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="msp-toolbar">
            <div className="msp-search-wrap">
              <i className="ti ti-search msp-search-icon" />
              <input
                className="msp-search-input"
                placeholder={
                  mainTab === "hardware"
                    ? "Buscar por folio o motivo…"
                    : "Buscar por folio o descripción..."
                }
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            </div>
            <select
              className="msp-filter-select"
              value={filtroEstatus}
              onChange={(e) => setFiltroEstatus(e.target.value)}
            >
              {(mainTab === "hardware"
                ? ESTATUS_HW_OPTS
                : ESTATUS_INC_OPTS
              ).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {mainTab === "incidencias" && (
              <select
                className="msp-filter-select"
                value={filtroPrioridad}
                onChange={(e) => setFiltroPrioridad(e.target.value)}
              >
                {PRIORIDAD_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {mainTab === "hardware" && (
              <button
                className="msp-btn-nueva-hw"
                onClick={() => navigate("/mesa-de-servicio/hardware")}
              >
                <i className="ti ti-plus" />
                Nueva solicitud
              </button>
            )}
            <div className="msp-toolbar-spacer" />
            {mainTab === "incidencias" && (
              <button
                className="msp-btn-action"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.38rem 0.8rem",
                  borderRadius: 7,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-body)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
                onClick={() => {
                  fetchLista();
                  cargarKpis();
                }}
              >
                <i className="ti ti-refresh" />
                Actualizar
              </button>
            )}
            {solicitudes.length > 0 && mainTab === "incidencias" && (
              <span className="msp-result-count">
                {solicitudes.length} resultado
                {solicitudes.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {mainTab === "hardware" && (
            <HardwareMisSolicitudes
              buscar={buscar}
              filtroEstatus={filtroEstatus}
            />
          )}
          {mainTab === "software" && <MisDesarrollosPage embebido />}

          {mainTab === "incidencias" && (
            <div className="msp-table-wrap">
              <table className="msp-table">
                <colgroup>
                  <col style={{ width: 32 }} />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 180 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th></th>
                    <th>Folio</th>
                    <th>Servicio</th>
                    <th>Categoría</th>
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
                      <td colSpan={10} className="msp-loading-cell">
                        <i className="ti ti-loader-2" /> Cargando…
                      </td>
                    </tr>
                  )}
                  {!loading && !solicitudes.length && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <EmptyState
                          tipo={emptyType}
                          onAction={(ruta) => navigate(ruta)}
                        />
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    solicitudes.map((s) => {
                      const isExpanded = expandedId === s.idSolicitud;
                      const resuelto = [3, 4, 5].includes(s.idEstatus);
                      const enPausa = s.idEstatus === 6;
                      const esEscalado = s.idEstatus === 8;
                      let slaDisplay;
                      if (resuelto)
                        slaDisplay = (
                          <span className="msp-sla ok">
                            <i className="ti ti-circle-check" />
                            Atendido
                          </span>
                        );
                      else if (enPausa)
                        slaDisplay = (
                          <span
                            className="msp-sla"
                            style={{ color: "#f6c177" }}
                          >
                            ⏸ En pausa
                          </span>
                        );
                      else if (s.idEstatus === 2 && s.fechaInicioResolucion) {
                        const ri = getSlaResolucionInfo(s);
                        slaDisplay = (
                          <span
                            className={`msp-sla ${ri.min != null && ri.min < 0 ? "danger" : ri.min != null && ri.min < 60 ? "warn" : "ok"}`}
                            style={{ color: ri.color }}
                          >
                            {ri.texto}
                          </span>
                        );
                      } else {
                        const sla = getSlaInfo(s.fechaLimiteResp);
                        slaDisplay = (
                          <span
                            className={`msp-sla ${sla.cls}`}
                            style={{ color: sla.color }}
                          >
                            {sla.cls !== "none" && (
                              <i
                                className={`ti ${sla.cls === "danger" ? "ti-trending-up" : "ti-clock"}`}
                              />
                            )}
                            {sla.texto}
                          </span>
                        );
                      }
                      return [
                        <tr
                          key={s.idSolicitud}
                          id={`row-${s.idSolicitud}`}
                          className={`msp-tr ${isExpanded ? "msp-tr--exp" : ""}`}
                          onClick={() => toggleRow(s.idSolicitud)}
                        >
                          <td>
                            <button className="msp-expand-btn">
                              <i
                                className={`ti ${isExpanded ? "ti-chevron-down" : "ti-chevron-right"}`}
                              />
                            </button>
                          </td>
                          <td className="msp-folio">{s.folio}</td>
                          <td>
                            <div className="msp-servicio-cell">
                              <div
                                className="msp-svc-icon-sm"
                                style={{
                                  background: `${s.servicioColor || "#7c8cf8"}18`,
                                }}
                              >
                                <i
                                  className={`ti ti-${s.servicioIcono || "ticket"}`}
                                  style={{
                                    color: s.servicioColor || "#7c8cf8",
                                  }}
                                />
                              </div>
                              <div>
                                <div className="msp-svc-name">
                                  {s.titulo || s.servicio}
                                </div>
                                <div className="msp-svc-sub">{s.servicio}</div>
                              </div>
                            </div>
                          </td>
                          <td className="msp-cat">
                            {s.categoria || "General TI"}
                          </td>
                          <td>
                            <PrioChip
                              nombre={s.prioridadNombre}
                              color={s.prioridadColor}
                            />
                          </td>
                          <td>
                            <div>
                              <EstatusChip
                                idEstatus={s.idEstatus}
                                label={s.estatusNombre}
                              />
                              {/* Nombre del proveedor bajo el chip "Escalado" */}
                              {esEscalado && s.nombreProveedor && (
                                <div
                                  style={{
                                    fontSize: 10.5,
                                    color: "#f38ba8",
                                    marginTop: 2,
                                    paddingLeft: 2,
                                  }}
                                >
                                  {s.nombreProveedor}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            {s.nombreTecnico ? (
                              <div className="msp-tec-cell">
                                <div className="msp-tec-av">
                                  {initials(s.nombreTecnico)}
                                </div>
                                <span className="msp-tec-nombre">
                                  {s.nombreTecnico}
                                </span>
                              </div>
                            ) : (
                              <span className="msp-no-asign">Sin asignar</span>
                            )}
                          </td>
                          <td>{slaDisplay}</td>
                          <td className="msp-fecha">
                            {fmtFecha(s.fechaCreacion, true)}
                          </td>
                          <td className="msp-fecha">
                            {fmtTiempo(s.tiempoAtencionMin)}
                          </td>
                        </tr>,
                        isExpanded && (
                          <tr
                            key={`exp-${s.idSolicitud}`}
                            className="msp-expand-row"
                          >
                            <td colSpan={10}>
                              <DetalleExpandido
                                id={s.idSolicitud}
                                user={user}
                                initialTab={pendingTab}
                                onAccionCancelar={cancelarSolicitud}
                                refreshTick={refreshTick}
                                onRefresh={() => {
                                  fetchLista();
                                  cargarKpis();
                                  setExpandedId(null);
                                }}
                              />
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
