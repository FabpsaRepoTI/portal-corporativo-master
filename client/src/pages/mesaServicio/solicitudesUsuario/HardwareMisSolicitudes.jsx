import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import "./HardwareMisSolicitudes.css";
import "./MisSolicitudes.mobile.css";

const API = "";

function authH() {
  const t = localStorage.getItem("fabpsa_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

function fmtFecha(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    ", " +
    d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
  );
}
function fmtFechaCorta(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtFechaLarga(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function fmtTiempoTranscurrido(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} minuto${min !== 1 ? "s" : ""}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hora${h !== 1 ? "s" : ""}`;
  const d = Math.floor(h / 24);
  return `${d} día${d !== 1 ? "s" : ""}`;
}
function fmtTiempoEntre(isoInicio, isoFin) {
  if (!isoInicio || !isoFin) return "—";
  const diff = new Date(isoFin).getTime() - new Date(isoInicio).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d} día${d !== 1 ? "s" : ""}`;
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
function esHoy(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  const hoy = new Date();
  return (
    d.getDate() === hoy.getDate() &&
    d.getMonth() === hoy.getMonth() &&
    d.getFullYear() === hoy.getFullYear()
  );
}
function fmtFechaRelativa(iso) {
  if (!iso) return "—";
  if (esHoy(iso)) {
    return (
      "Hoy, " +
      new Date(iso).toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }
  return fmtFecha(iso);
}

const ESTATUS_COLOR = {
  Pendiente: {
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.3)",
  },
  "En proceso": {
    color: "#7c8cf8",
    bg: "rgba(124,140,248,0.12)",
    border: "rgba(124,140,248,0.3)",
  },
  Completada: {
    color: "#10b981",
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.3)",
  },
  "Parcialmente atendida": {
    color: "#0891b2",
    bg: "rgba(8,145,178,0.12)",
    border: "rgba(8,145,178,0.3)",
  },
  Rechazada: {
    color: "#f38ba8",
    bg: "rgba(243,139,168,0.12)",
    border: "rgba(243,139,168,0.3)",
  },
};
const DETALLE_COLOR = {
  Pendiente: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  "En proceso": { color: "#7c8cf8", bg: "rgba(124,140,248,0.1)" },
  Atendida: { color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  Rechazada: { color: "#f38ba8", bg: "rgba(243,139,168,0.1)" },
};

function EstatusChip({ label }) {
  const s = ESTATUS_COLOR[label] || {
    color: "#64748b",
    bg: "rgba(100,116,139,0.1)",
    border: "rgba(100,116,139,0.2)",
  };
  return (
    <span
      className="hw-msp-chip"
      style={{
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.border}`,
      }}
    >
      <span className="hw-msp-chip-dot" style={{ background: s.color }} />
      {label}
    </span>
  );
}
function DetalleChip({ label }) {
  const s = DETALLE_COLOR[label] || {
    color: "#64748b",
    bg: "rgba(100,116,139,0.1)",
  };
  return (
    <span
      className="hw-msp-detalle-chip"
      style={{ color: s.color, background: s.bg }}
    >
      {label}
    </span>
  );
}

/* ── Barra de progreso de artículos ───────────────────────────── */
function BarraProgreso({ articulos }) {
  if (!articulos?.length) return null;
  const total = articulos.length;
  const atendidos = articulos.filter(
    (a) => a.estatusDetalle === "Atendida",
  ).length;
  const rechaz = articulos.filter(
    (a) => a.estatusDetalle === "Rechazada",
  ).length;
  const enproceso = articulos.filter(
    (a) => a.estatusDetalle === "En proceso",
  ).length;
  const pct = Math.round((atendidos / total) * 100);

  return (
    <div className="hw-msp-progreso">
      <div className="hw-msp-progreso-header">
        <span className="hw-msp-progreso-label">Progreso de artículos</span>
        <span className="hw-msp-progreso-val">
          {atendidos}/{total} entregados
        </span>
      </div>
      <div className="hw-msp-progreso-track">
        <div className="hw-msp-progreso-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="hw-msp-progreso-chips">
        {atendidos > 0 && (
          <span className="hw-msp-prog-chip atendida">
            <i className="ti ti-check" />
            {atendidos} entregado{atendidos !== 1 ? "s" : ""}
          </span>
        )}
        {enproceso > 0 && (
          <span className="hw-msp-prog-chip enproceso">
            <i className="ti ti-loader" />
            {enproceso} en proceso
          </span>
        )}
        {rechaz > 0 && (
          <span className="hw-msp-prog-chip rechazada">
            <i className="ti ti-x" />
            {rechaz} rechazado{rechaz !== 1 ? "s" : ""}
          </span>
        )}
        {total - atendidos - rechaz - enproceso > 0 && (
          <span className="hw-msp-prog-chip pendiente">
            <i className="ti ti-hourglass" />
            {total - atendidos - rechaz - enproceso} pendiente
            {total - atendidos - rechaz - enproceso !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TAB INFORMACIÓN — Timeline inteligente por estado
   ═══════════════════════════════════════════════════════════════ */
function TabInformacion({ detalle, solicitud }) {
  const estatus = detalle.estatus || solicitud.estatus;

  /* ── Bloque de campo individual ── */
  function Campo({ icono, label, valor, mono, highlight }) {
    return (
      <div
        className={`hw-info-campo ${highlight ? "hw-info-campo--highlight" : ""}`}
      >
        <div className="hw-info-campo-label">
          {icono && <i className={`ti ${icono}`} />}
          {label}
        </div>
        <div className={`hw-info-campo-val ${mono ? "mono" : ""}`}>
          {valor || "—"}
        </div>
      </div>
    );
  }

  /* ── Próximo paso según estatus ── */
  function proximoPaso(est) {
    if (est === "Pendiente")
      return "Revisión y asignación por parte de Ingenería TI";
    if (est === "En proceso")
      return "Gestión y entrega de artículos solicitados";
    if (est === "Completada")
      return "Solicitud finalizada — puedes dejar tu evaluación";
    if (est === "Rechazada") return "La solicitud no será procesada";
    return "—";
  }

  /* ── Cabecera de estado con gradiente y color dinámico ── */
  const sc = ESTATUS_COLOR[estatus] || {
    color: "#64748b",
    bg: "rgba(100,116,139,0.1)",
    border: "rgba(100,116,139,0.2)",
  };

  /* ── ÍCONOS por estado ── */
  const iconoEstado =
    {
      Pendiente: "ti-hourglass",
      "En proceso": "ti-loader-2",
      Completada: "ti-circle-check",
      Rechazada: "ti-circle-x",
    }[estatus] || "ti-info-circle";

  return (
    <div className="hw-info-timeline">
      {/* ── Hero del estado ── */}
      <div
        className="hw-info-hero"
        style={{ borderColor: sc.border, background: sc.bg }}
      >
        <div className="hw-info-hero-left">
          <div
            className="hw-info-hero-icon"
            style={{ color: sc.color, background: `${sc.color}22` }}
          >
            <i className={`ti ${iconoEstado}`} />
          </div>
          <div>
            <div className="hw-info-hero-label">Estado actual</div>
            <div className="hw-info-hero-status" style={{ color: sc.color }}>
              {estatus}
            </div>
          </div>
        </div>
        <div className="hw-info-hero-folio">
          <span className="hw-info-hero-folio-label">Folio</span>
          <span className="hw-info-hero-folio-val">{detalle.folio}</span>
        </div>
      </div>

      {/* ══════════════════════════════════════
          PENDIENTE
          ══════════════════════════════════════ */}
      {estatus === "Pendiente" && (
        <>
          <div className="hw-info-section-title">
            <i className="ti ti-file-text" />
            Solicitud
          </div>
          <div className="hw-info-campos-grid">
            <Campo
              icono="ti-calendar-event"
              label="Fecha de registro"
              valor={fmtFechaLarga(detalle.fechaRegistro)}
            />
            <Campo
              icono="ti-clock"
              label="Tiempo transcurrido"
              valor={fmtTiempoTranscurrido(detalle.fechaRegistro)}
            />
            <Campo
              icono="ti-building"
              label="Área solicitante"
              valor={detalle.departamento}
            />
          </div>

          <div className="hw-info-section-title">
            <i className="ti ti-align-left" />
            Motivo de la solicitud
          </div>
          <div className="hw-info-texto-box">
            {detalle.motivo || "Sin motivo especificado."}
          </div>

          {detalle.observaciones && (
            <>
              <div className="hw-info-section-title">
                <i className="ti ti-notes" />
                Observaciones
              </div>
              <div className="hw-info-texto-box">{detalle.observaciones}</div>
            </>
          )}

          <div className="hw-info-proximo">
            <i className="ti ti-arrow-right" />
            <div>
              <div className="hw-info-proximo-label">Próximo paso esperado</div>
              <div className="hw-info-proximo-val">{proximoPaso(estatus)}</div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════
          EN PROCESO
          ══════════════════════════════════════ */}
      {estatus === "En proceso" && (
        <>
          <div className="hw-info-section-title">
            <i className="ti ti-progress" />
            Atención en curso
          </div>
          <div className="hw-info-campos-grid">
            <Campo
              icono="ti-calendar-event"
              label="Fecha de solicitud"
              valor={fmtFechaLarga(detalle.fechaRegistro)}
            />
            {detalle.fechaInicioProceso && (
              <Campo
                icono="ti-player-play"
                label="Inicio de atención"
                valor={fmtFechaLarga(detalle.fechaInicioProceso)}
              />
            )}
            {detalle.fechaInicioProceso && (
              <Campo
                icono="ti-clock"
                label="Tiempo en atención"
                valor={fmtTiempoTranscurrido(detalle.fechaInicioProceso)}
              />
            )}
            {detalle.tecnico && (
              <Campo
                icono="ti-user-check"
                label="Ingeniero responsable"
                valor={detalle.tecnico}
              />
            )}
            {detalle.fechaEstimadaAtencion && (
              <Campo
                icono="ti-calendar-check"
                label="Fecha estimada de entrega"
                valor={fmtFechaLarga(detalle.fechaEstimadaAtencion)}
              />
            )}
            {detalle.ultimaActualizacion && (
              <Campo
                icono="ti-refresh"
                label="Última actualización"
                valor={fmtFechaRelativa(detalle.ultimaActualizacion)}
              />
            )}
          </div>

          <div className="hw-info-section-title">
            <i className="ti ti-align-left" />
            Motivo de la solicitud
          </div>
          <div className="hw-info-texto-box">
            {detalle.motivo || "Sin motivo especificado."}
          </div>

          {detalle.observaciones && (
            <>
              <div className="hw-info-section-title">
                <i className="ti ti-notes" />
                Observaciones
              </div>
              <div className="hw-info-texto-box">{detalle.observaciones}</div>
            </>
          )}

          <div className="hw-info-proximo hw-info-proximo--proceso">
            <i className="ti ti-arrow-right" />
            <div>
              <div className="hw-info-proximo-label">Estado de la atención</div>
              <div className="hw-info-proximo-val">{proximoPaso(estatus)}</div>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════
          RECHAZADA
          ══════════════════════════════════════ */}
      {estatus === "Rechazada" && (
        <>
          {/* Banner de rechazo prominente */}
          <div className="hw-info-rechazo-banner">
            <div className="hw-info-rechazo-icon">
              <i className="ti ti-ban" />
            </div>
            <div>
              <div className="hw-info-rechazo-titulo">Solicitud rechazada</div>
              {detalle.motivoRechazo ? (
                <div className="hw-info-rechazo-motivo">
                  {detalle.motivoRechazo}
                </div>
              ) : (
                <div className="hw-info-rechazo-motivo hw-info-rechazo-motivo--empty">
                  Sin motivo de rechazo registrado.
                </div>
              )}
            </div>
          </div>

          <div className="hw-info-section-title">
            <i className="ti ti-info-circle" />
            Detalle
          </div>
          <div className="hw-info-campos-grid">
            <Campo
              icono="ti-calendar-event"
              label="Fecha de solicitud"
              valor={fmtFechaLarga(detalle.fechaRegistro)}
            />
            {detalle.fechaRechazo && (
              <Campo
                icono="ti-calendar-x"
                label="Fecha de rechazo"
                valor={fmtFechaLarga(detalle.fechaRechazo)}
              />
            )}
            {detalle.rechazadoPor && (
              <Campo
                icono="ti-user"
                label="Acción realizada por"
                valor={detalle.rechazadoPor}
              />
            )}
            {detalle.ultimaActualizacion && (
              <Campo
                icono="ti-refresh"
                label="Última actualización"
                valor={fmtFechaRelativa(detalle.ultimaActualizacion)}
              />
            )}
            <Campo
              icono="ti-building"
              label="Área solicitante"
              valor={detalle.departamento}
            />
          </div>

          <div className="hw-info-section-title">
            <i className="ti ti-align-left" />
            Motivo de la solicitud
          </div>
          <div className="hw-info-texto-box">
            {detalle.motivo || "Sin motivo especificado."}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════
          COMPLETADA / PARCIALMENTE ATENDIDA
          ══════════════════════════════════════ */}
      {(estatus === "Completada" || estatus === "Parcialmente atendida") && (
        <>
          <div className="hw-info-section-title">
            <i className="ti ti-circle-check" />
            Resolución
          </div>
          <div className="hw-info-campos-grid">
            <Campo
              icono="ti-calendar-event"
              label="Fecha de solicitud"
              valor={fmtFechaLarga(detalle.fechaRegistro)}
            />
            {detalle.fechaConcluida && (
              <Campo
                icono="ti-calendar-check"
                label="Fecha de conclusión"
                valor={fmtFechaLarga(detalle.fechaConcluida)}
              />
            )}
            {detalle.fechaRegistro && detalle.fechaConcluida && (
              <Campo
                icono="ti-clock"
                label="Tiempo total de resolución"
                valor={fmtTiempoEntre(
                  detalle.fechaRegistro,
                  detalle.fechaConcluida,
                )}
              />
            )}
            {detalle.tecnico && (
              <Campo
                icono="ti-user-check"
                label="Responsable de la atención"
                valor={detalle.tecnico}
              />
            )}
            {detalle.ultimaActualizacion && (
              <Campo
                icono="ti-refresh"
                label="Última actualización"
                valor={fmtFechaRelativa(detalle.ultimaActualizacion)}
              />
            )}
            <Campo
              icono="ti-building"
              label="Área solicitante"
              valor={detalle.departamento}
            />
          </div>

          {detalle.resumenAtencion && (
            <>
              <div className="hw-info-section-title">
                <i className="ti ti-clipboard-check" />
                Resultado de la atención
              </div>
              <div className="hw-info-texto-box">{detalle.resumenAtencion}</div>
            </>
          )}

          <div className="hw-info-section-title">
            <i className="ti ti-align-left" />
            Motivo de la solicitud
          </div>
          <div className="hw-info-texto-box">
            {detalle.motivo || "Sin motivo especificado."}
          </div>

          {detalle.observaciones && (
            <>
              <div className="hw-info-section-title">
                <i className="ti ti-notes" />
                Observaciones
              </div>
              <div className="hw-info-texto-box">{detalle.observaciones}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════ */
function EmptyState({ tipo, onAction }) {
  if (tipo === "filtros")
    return (
      <div className="hw-msp-empty">
        <svg viewBox="0 0 220 160" fill="none" className="hw-msp-empty-svg">
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
        <div className="hw-msp-empty-titulo">Sin resultados</div>
        <div className="hw-msp-empty-sub">
          Intenta con otros criterios de búsqueda.
        </div>
      </div>
    );
  return (
    <div className="hw-msp-empty">
      <svg viewBox="0 0 220 160" fill="none" className="hw-msp-empty-svg">
        <rect
          x="65"
          y="62"
          width="90"
          height="65"
          rx="6"
          fill="var(--bg-elevated)"
          stroke="var(--border)"
          strokeWidth="1.5"
        />
        <path
          d="M63 62 L110 47 L157 62"
          stroke="var(--border)"
          strokeWidth="1.5"
          fill="var(--bg-surface)"
          strokeLinejoin="round"
        />
        <path d="M110 47 L110 62" stroke="var(--border)" strokeWidth="1.5" />
        <rect
          x="88"
          y="76"
          width="44"
          height="3"
          rx="1.5"
          fill="var(--border)"
        />
        <rect
          x="93"
          y="84"
          width="34"
          height="3"
          rx="1.5"
          fill="var(--border)"
        />
        <circle cx="110" cy="49" r="14" fill="#10b981" opacity="0.1" />
        <circle
          cx="110"
          cy="49"
          r="11"
          fill="var(--bg-surface)"
          stroke="#10b981"
          strokeWidth="1.5"
        />
        <rect x="109" y="42" width="2" height="14" rx="1" fill="#10b981" />
        <rect x="103" y="48" width="14" height="2" rx="1" fill="#10b981" />
        <circle
          cx="42"
          cy="68"
          r="3"
          fill="#10b981"
          opacity="0.2"
          className="hw-msp-dot-1"
        />
        <circle
          cx="180"
          cy="82"
          r="2.5"
          fill="#7c8cf8"
          opacity="0.22"
          className="hw-msp-dot-2"
        />
        <circle
          cx="48"
          cy="100"
          r="2"
          fill="#f59e0b"
          opacity="0.18"
          className="hw-msp-dot-3"
        />
      </svg>
      <div className="hw-msp-empty-titulo">
        Mmm... aún no tienes solicitudes de hardware.
      </div>
      <div className="hw-msp-empty-sub">
        Cuando solicites equipos o periféricos, aquí podrás consultar todo su
        seguimiento.
      </div>
      <button
        className="hw-msp-empty-btn"
        onClick={() => onAction("/mesa-de-servicio/hardware")}
      >
        <i className="ti ti-plus" />
        Nueva solicitud
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   POPOVER EVALUACIÓN
   ═══════════════════════════════════════════════════════════════ */
function EvalPopover({ solicitudId, folio, detalle, onEvaluado, onClose }) {
  const [estrellas, setEstrellas] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
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
        `${API}/api/solicitudes-usuario/hardware/${solicitudId}/evaluacion`,
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
        onEvaluado();
        onClose();
      }, 1600);
    } catch {
      setEnviando(false);
    }
  }

  const nivel = hover || estrellas;
  return (
    <div className="hw-msp-eval-popover" ref={ref}>
      {enviado ? (
        <div className="hw-msp-eval-thanks">
          <span>🎉</span>
          <span>¡Gracias por tu evaluación!</span>
        </div>
      ) : (
        <>
          <div className="hw-msp-eval-header">
            <div className="hw-msp-eval-folio">
              <i className="ti ti-package" />
              {folio}
            </div>
            <button className="hw-msp-eval-close" onClick={onClose}>
              <i className="ti ti-x" />
            </button>
          </div>
          <div className="hw-msp-eval-question">
            ¿Cómo fue la atención recibida?
          </div>
          <div className="hw-msp-eval-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`hw-msp-eval-star ${nivel >= n ? "active" : ""}`}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setEstrellas(n)}
              >
                <i className="ti ti-star-filled" />
              </button>
            ))}
          </div>
          {nivel > 0 && (
            <div className="hw-msp-eval-label">
              {EMOJIS[nivel - 1]} {LABELS[nivel - 1]}
            </div>
          )}
          {estrellas > 0 && (
            <textarea
              className="hw-msp-eval-textarea"
              rows={2}
              placeholder="Comentario opcional…"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
          )}
          <button
            className="hw-msp-eval-btn"
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
                Enviar
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PANEL EXPANDIDO
   ═══════════════════════════════════════════════════════════════ */
function DetalleHardware({ solicitud, user }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("articulos");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [yaEvaluo, setYaEvaluo] = useState(false);
  const [showEval, setShowEval] = useState(false);
  const mensajesRef = useRef(null);

  const cerrado =
    solicitud.estatus === "Completada" || solicitud.estatus === "Rechazada";

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `${API}/api/solicitudes-usuario/hardware/${solicitud.idSolicitud}/detalle`,
        { headers: authH() },
      );
      if (!r.ok) throw new Error();
      const data = await r.json();
      setDetalle(data);
      setYaEvaluo(data.yaEvaluo || false);
    } finally {
      setLoading(false);
    }
  }, [solicitud.idSolicitud]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (mensajesRef.current)
      mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight;
  }, [detalle?.comentarios]);

  async function enviarComentario() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      const r = await fetch(
        `${API}/api/solicitudes-usuario/hardware/${solicitud.idSolicitud}/comentario`,
        {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({ comentario: texto.trim() }),
        },
      );
      if (!r.ok) throw new Error();
      const nuevo = await r.json();
      setDetalle((prev) => ({
        ...prev,
        comentarios: [...(prev.comentarios || []), nuevo],
      }));
      setTexto("");
    } finally {
      setEnviando(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarComentario();
    }
  }

  const nComentarios =
    detalle?.comentarios?.filter(
      (c) => c.esEvento === false || c.esEvento === 0,
    ).length || 0;

  return (
    <div className="hw-msp-detail">
      {loading ? (
        <div className="hw-msp-detail-loading">
          {[100, 160, 200, 140].map((w, i) => (
            <div
              key={i}
              className="hw-msp-skeleton"
              style={{ height: 12, width: w }}
            />
          ))}
        </div>
      ) : !detalle ? (
        <div className="hw-msp-detail-error">No se pudo cargar el detalle.</div>
      ) : (
        <>
          {/* Barra de progreso — siempre visible sobre las tabs */}
          <div className="hw-msp-progreso-wrap">
            <BarraProgreso articulos={detalle.articulos} />
          </div>

          {/* Tabs */}
          <div className="hw-msp-tabs">
            {[
              {
                key: "articulos",
                label: "Artículos",
                icon: "ti-package",
                count: detalle.articulos?.length,
              },
              {
                key: "comentarios",
                label: "Comentarios",
                icon: "ti-message",
                count: nComentarios,
              },
              { key: "info", label: "Información", icon: "ti-info-circle" },
            ].map((t) => (
              <button
                key={t.key}
                className={`hw-msp-tab ${tab === t.key ? "active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                <i className={`ti ${t.icon}`} />
                {t.label}
                {t.count > 0 && (
                  <span className="hw-msp-tab-badge">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Tab: Artículos ── */}
          {tab === "articulos" && (
            <div className="hw-msp-tab-content">
              <div className="hw-msp-arts-list">
                {detalle.articulos?.map((a) => {
                  const dc = DETALLE_COLOR[a.estatusDetalle] || {
                    color: "#64748b",
                    bg: "rgba(100,116,139,0.1)",
                  };
                  return (
                    <div key={a.idDetalle} className="hw-msp-art-row">
                      <div
                        className="hw-msp-art-indicator"
                        style={{ background: dc.color }}
                      />
                      <div className="hw-msp-art-icon">
                        <i className="ti ti-box" />
                      </div>
                      <div className="hw-msp-art-info">
                        <div className="hw-msp-art-nombre">
                          {a.nombreArticulo}
                        </div>
                        <div className="hw-msp-art-meta">
                          <span className="hw-msp-art-cat">{a.categoria}</span>
                          {a.requiereAutorizacion === "S" && (
                            <span className="hw-msp-art-auth">
                              <i className="ti ti-shield-check" />
                              Requiere autorización
                            </span>
                          )}
                          {a.fechaEstimadaEntrega && (
                            <span className="hw-msp-art-entrega">
                              <i className="ti ti-calendar" />
                              Entrega: {fmtFechaCorta(a.fechaEstimadaEntrega)}
                            </span>
                          )}
                        </div>
                        {a.observacionAtencion && (
                          <div className="hw-msp-art-obs-text">
                            {a.observacionAtencion}
                          </div>
                        )}
                      </div>
                      <div className="hw-msp-art-right">
                        <div className="hw-msp-art-cantidad">×{a.cantidad}</div>
                        <DetalleChip label={a.estatusDetalle} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Tab: Comentarios ── */}
          {tab === "comentarios" && (
            <div className="hw-msp-tab-content">
              <div className="hw-msp-hilo" ref={mensajesRef}>
                {!detalle.comentarios?.length ? (
                  <div className="hw-msp-hilo-empty">
                    <i className="ti ti-message-circle-off" />
                    Sin mensajes aún
                  </div>
                ) : (
                  detalle.comentarios.map((c) => {
                    const esEvento = c.esEvento === true || c.esEvento === 1;
                    const esMio = c.login === user.login;
                    if (esEvento)
                      return (
                        <div key={c.id} className="hw-msp-evento">
                          <i className="ti ti-point-filled" />
                          <span>{c.mensaje}</span>
                          <span className="hw-msp-evento-fecha">
                            {fmtFecha(c.fechaCreacion)}
                          </span>
                        </div>
                      );
                    return (
                      <div
                        key={c.id}
                        className={`hw-msp-mensaje ${esMio ? "mio" : "otro"}`}
                      >
                        <div className="hw-msp-msg-header">
                          <div
                            className={`hw-msp-msg-avatar ${esMio ? "usr" : "ti"}`}
                          >
                            {initials(c.nombre)}
                          </div>
                          <span
                            className={`hw-msp-msg-rol ${esMio ? "usr" : "ti"}`}
                          >
                            {esMio
                              ? "Tú"
                              : c.rol === "sistemas"
                                ? "Sistemas"
                                : "Ingeniero"}
                          </span>
                          <span className="hw-msp-msg-nombre">{c.nombre}</span>
                          <span className="hw-msp-msg-sep">·</span>
                          <span className="hw-msp-msg-fecha">
                            {fmtFecha(c.fechaCreacion)}
                          </span>
                        </div>
                        <div
                          className={`hw-msp-burbuja ${esMio ? "mio" : "otro"}`}
                        >
                          {c.mensaje}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {!cerrado ? (
                <div className="hw-msp-conv-actions">
                  <div className="hw-msp-conv-label">
                    ¿Tienes alguna actualización?
                  </div>
                  <div className="hw-msp-conv-row">
                    <textarea
                      className="hw-msp-conv-textarea"
                      rows={3}
                      placeholder="Escribe tu mensaje… (Enter para enviar)"
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={onKey}
                    />
                    <button
                      className="hw-msp-btn primary"
                      disabled={!texto.trim() || enviando}
                      onClick={enviarComentario}
                    >
                      <i className="ti ti-send" />
                      {enviando ? "Enviando…" : "Enviar"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="hw-msp-conv-cerrado">
                  Esta solicitud está {solicitud.estatus.toLowerCase()} — no se
                  pueden agregar comentarios
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Información (rediseñada) ── */}
          {tab === "info" && (
            <div className="hw-msp-tab-content">
              <TabInformacion detalle={detalle} solicitud={solicitud} />
            </div>
          )}

          {/* Barra de acciones */}
          <div className="hw-msp-actions-bar">
            <button
              className="hw-msp-btn ghost"
              onClick={() => setTab("comentarios")}
            >
              <i className="ti ti-message" />
              Agregar comentario
            </button>
            {solicitud.estatus === "Completada" && !yaEvaluo && (
              <div className="hw-msp-eval-wrap">
                <button
                  className="hw-msp-btn eval"
                  onClick={() => setShowEval((v) => !v)}
                >
                  <i className="ti ti-star" />
                  ¿Qué te pareció la atención?
                </button>
                {showEval && (
                  <EvalPopover
                    solicitudId={solicitud.idSolicitud}
                    folio={solicitud.folio}
                    detalle={detalle}
                    onEvaluado={() => setYaEvaluo(true)}
                    onClose={() => setShowEval(false)}
                  />
                )}
              </div>
            )}
            {solicitud.estatus === "Completada" && yaEvaluo && (
              <span className="hw-msp-eval-done">
                <i className="ti ti-star-filled" style={{ color: "#f59e0b" }} />
                Servicio evaluado
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════ */
export default function HardwareMisSolicitudes({
  buscar = "",
  filtroEstatus = "",
}) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const fetchLista = useCallback(async () => {
    setLoading(true);
    setExpandedId(null);
    const p = new URLSearchParams();
    if (filtroEstatus) p.set("estatus", filtroEstatus);
    if (buscar.trim()) p.set("buscar", buscar.trim());
    try {
      const r = await fetch(`${API}/api/solicitudes-usuario/hardware?${p}`, {
        headers: authH(),
      });
      const data = await r.json();
      setSolicitudes(Array.isArray(data) ? data : []);
    } catch {
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, [filtroEstatus, buscar]);

  useEffect(() => {
    fetchLista();
  }, [fetchLista]);

  function toggleRow(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const emptyType = buscar || filtroEstatus ? "filtros" : "vacio";

  return (
    <div className="hw-msp-root">
      {/* Thead */}
      <div className="hw-msp-thead">
        <div className="hw-msp-th" />
        <div className="hw-msp-th">Folio</div>
        <div className="hw-msp-th">Artículos</div>
        <div className="hw-msp-th">Motivo</div>
        <div className="hw-msp-th">Estado</div>
        <div className="hw-msp-th">Fecha</div>
        <div className="hw-msp-th">Mensajes</div>
        <div className="hw-msp-th" />
      </div>

      {/* Body */}
      <div className="hw-msp-tbody">
        {loading ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="hw-msp-skeleton hw-msp-skeleton-row" />
          ))
        ) : !solicitudes.length ? (
          <EmptyState tipo={emptyType} onAction={(ruta) => navigate(ruta)} />
        ) : (
          solicitudes.map((s) => {
            const isExpanded = expandedId === s.idSolicitud;
            return (
              <div key={s.idSolicitud} className="hw-msp-row-wrap">
                <div
                  className={`hw-msp-row ${isExpanded ? "expanded" : ""}`}
                  onClick={() => toggleRow(s.idSolicitud)}
                >
                  <div className="hw-msp-td">
                    <span
                      className={`hw-msp-toggle ${isExpanded ? "open" : ""}`}
                    >
                      <i className="ti ti-chevron-right" />
                    </span>
                  </div>
                  <div className="hw-msp-td">
                    <div className="hw-msp-folio">{s.folio}</div>
                    <div className="hw-msp-fecha-sub">
                      {s.departamento || "—"}
                    </div>
                  </div>
                  <div className="hw-msp-td">
                    <div className="hw-msp-arts-preview">
                      {s.articulos || "—"}
                    </div>
                    <div className="hw-msp-fecha-sub">
                      {s.totalArticulos} artículo
                      {s.totalArticulos !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="hw-msp-td hw-msp-motivo">
                    {s.motivo || "—"}
                  </div>
                  <div className="hw-msp-td">
                    <EstatusChip label={s.estatus} />
                  </div>
                  <div className="hw-msp-td hw-msp-fecha">
                    {fmtFecha(s.fechaRegistro)}
                  </div>
                  <div className="hw-msp-td">
                    {s.totalMensajes > 0 ? (
                      <span className="hw-msp-msg-count">
                        <i className="ti ti-message" />
                        {s.totalMensajes}
                      </span>
                    ) : (
                      <span
                        style={{ color: "var(--text-faint)", fontSize: 12 }}
                      >
                        —
                      </span>
                    )}
                  </div>
                  <div className="hw-msp-td hw-msp-arrow">
                    <i className="ti ti-chevron-right" />
                  </div>
                </div>
                {isExpanded && <DetalleHardware solicitud={s} user={user} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
