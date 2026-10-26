import DevelopmentExecutive from "../components/DevelopmentExecutive";
import ExecutiveAnalysis from "../components/ExecutiveAnalysis";
/**
 * VisorEjecutivoPage.jsx — FABPSA Portal Corporativo v4
 * ══════════════════════════════════════════════════════════════════════
 * Datos 100% reales de /api/ejecutivo/* según ejecutivo.routes.js
 * y ejecutivo.controller.js que ya vienen en el proyecto.
 *
 * MAPA imagen → endpoint (NO hay datos inventados):
 *
 * Banner situación     → GET /api/ejecutivo/resumen   .nivel derivado
 * Banner bullets       → resumen.sitioTopActivo/pctSitioTop
 *                        + escalamientos (promedioHrs > 168)
 * KPI Activos ahora    → resumen.activosAhora + enProceso + escalados
 * KPI Sin asignar      → resumen.sinAsignar
 * KPI SLA vencidos     → resumen.vencidosSLA + porVencer
 * KPI Cumplimiento SLA → resumen.pctSLA
 * KPI Críticos         → resumen.criticas
 * Sparklines KPI       → /tendencia .total (única serie histórica diaria real)
 * Atención inmediata   → GET /api/ejecutivo/alertas (top 5, score DESC)
 * Carga equipo         → GET /api/ejecutivo/equipo .tecnicos / .sinAsignar
 * Donut estado         → resumen: enProceso/pendientes/sinAsignar/
 *                        enDiagnostico/escalados  (activos reales)
 * Donut prioridad      → GET /api/ejecutivo/distribucion .prioridad
 * Donut SLA            → resumen: vencidosSLA / porVencer / resto activos
 * Ubicación barras     → /distribucion .sitio (ya normalizado SUR 121)
 * Tendencia            → GET /api/ejecutivo/tendencia .total / .resueltos
 * Modal KPI click      → GET /api/ejecutivo/detalle-indicador?tipo=&sitio=
 * Modal ticket         → datos del objeto ya cargado en /alertas o /detalle
 * Modal IA             → POST /api/ejecutivo/analisis-ia  (conexión REAL:
 *                        el controller llama a Claude si tiene API key;
 *                        si no, devuelve {ok:false,sinApiKey:true} y el
 *                        frontend lo muestra con un mensaje claro)
 *
 * SUR 121 = CEDIS + IAFSA: normalización en el controller (sitioClause),
 * el frontend NO reagrupa nada por su cuenta.
 *
 * El JSX importa ./VisorEjecutivoPage.css que usa los tokens del Portal:
 * --bg-base, --bg-surface, --secondary, --danger, --warning, --success,
 * --text-h, --text-body, --text-muted, --border, etc.
 * No se redefine ningún color corporativo aquí.
 * ══════════════════════════════════════════════════════════════════════
 */

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useReducer,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./VisorEjecutivoPage.css";
import visorEjecutivoHero from "../assets/visor-ejecutivo-hero.png";

/* ══════════════════════════════════════════════════════════════════
   1. CLIENTE HTTP  (usa axios del proyecto si existe, sino fetch)
   ══════════════════════════════════════════════════════════════════ */
async function apiFetch(path, opts = {}) {
  const base =
    window.__PORTAL_API_BASE__ ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    "/api";
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...opts,
    // La API exige la sesión del portal (verifyToken + equipo de TI)
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (localStorage.getItem("fabpsa_token") || ""),
      ...opts.headers,
    },
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json.data;
}

const GET = (path, params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== "" && v !== undefined),
    ),
  ).toString();
  return apiFetch(`${path}${qs ? `?${qs}` : ""}`);
};

const POST = (path, body) =>
  apiFetch(path, { method: "POST", body: JSON.stringify(body) });

/* ══════════════════════════════════════════════════════════════════
   2. CONSTANTES
   ══════════════════════════════════════════════════════════════════ */
const TABS = [{ id: "situacional", label: "Operaciones TI" },{id:"desarrollo",label:"Desarrollo TI"}];

const PERIODOS = [
  { id: "1", label: "Hoy" },
  { id: "7", label: "7 días" },
  { id: "30", label: "30 días" },
  { id: "90", label: "3 meses" },
];

const SITIOS = [
  { id: "", label: "CORPORATIVO" },
  { id: "PLANTA", label: "PLANTA" },
  { id: "SUR 121", label: "SUR 121" },
  { id: "FDNC", label: "FDNC" },
];

const NAV = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "ti-layout-dashboard",
    activo: true,
    to: null,
  },
  {
    id: "atencion",
    label: "Atención de tickets",
    icon: "ti-ticket",
    activo: false,
    to: "/portal-corporativo/fabpsa/atencion-incidencias",
  },
  {
    id: "solicitudes",
    label: "Solicitudes",
    icon: "ti-clipboard-list",
    activo: false,
    to: "/portal-corporativo/fabpsa/solicitudes",
  },
  {
    id: "catalogo",
    label: "Catálogo de servicios",
    icon: "ti-list-details",
    activo: false,
    to: "/portal-corporativo/fabpsa/catalogo-servicios",
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: "ti-file-analytics",
    activo: false,
    to: "/portal-corporativo/fabpsa/reportes-ti",
  },
  {
    id: "kb",
    label: "Base de conocimiento",
    icon: "ti-book",
    activo: false,
    to: "/portal-corporativo/fabpsa/base-conocimiento",
  },
  {
    id: "usuarios",
    label: "Usuarios",
    icon: "ti-users",
    activo: false,
    to: "/portal-corporativo/fabpsa/usuarios",
  },
];

/* Tipos del indicador → query param del controller */
const IND = {
  activosAhora: "activos",
  sinAsignar: "sinAsignar",
  vencidosSLA: "vencidosSLA",
  porVencer: "porVencer",
  criticas: "criticas",
  escalados: "escalados",
};

/* ══════════════════════════════════════════════════════════════════
   3. UTILIDADES PURAS
   ══════════════════════════════════════════════════════════════════ */
function fmtMin(m) {
  if (m == null || Number.isNaN(m)) return "—";
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const min = abs % 60;
  const s = h > 0 ? `${h} h ${String(min).padStart(2, "0")} min` : `${min} min`;
  return m < 0 ? `-${s}` : s;
}

function colorSLA(m) {
  if (m == null) return "var(--text-faint)";
  if (m < 0) return "var(--danger)";
  if (m <= 30) return "var(--danger)";
  if (m <= 240) return "var(--warning)";
  return "var(--success)";
}

function pctSLABarra(restantes, total) {
  if (restantes == null || !total) return 4;
  const usado = (total - restantes) / total;
  return Math.max(4, Math.min(100, Math.round(usado * 100)));
}

function colorPri(prioridad, hex) {
  if (hex) return hex;
  const m = {
    Crítica: "var(--danger)",
    Alta: "var(--warning)",
    Media: "var(--secondary)",
  };
  return m[prioridad] || "var(--success)";
}

function bgBadge(color) {
  if (!color?.startsWith("#")) return "var(--bg-elevated)";
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},0.16)`;
}

function iniciales(n) {
  return (
    (n || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}

function pct(a, b) {
  return b ? Math.round((a / b) * 100) : 0;
}

function fmtHora(d) {
  return d
    ? new Date(d).toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

function fmtFechaCorta(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("es-MX", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/* ══════════════════════════════════════════════════════════════════
   4. HOOK PRINCIPAL — carga todo en paralelo
   ══════════════════════════════════════════════════════════════════ */
const INIT = {
  resumen: null,
  alertas: null,
  equipo: null,
  distribucion: null,
  tendencia: null,
  escalamientos: null,
  pausados: null,
};

function useVisor(periodo, sitio) {
  const [state, setState] = useState(INIT);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [ts, setTs] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setErr(null);
    try {
      const [resumen, alertas, equipo, distribucion, tendencia, escalamientos, pausados] =
        await Promise.all([
          GET("/ejecutivo/resumen", { periodo, sitio }),
          GET("/ejecutivo/alertas", { sitio }),
          GET("/ejecutivo/equipo", { sitio }),
          GET("/ejecutivo/distribucion", { periodo, sitio }),
          GET("/ejecutivo/tendencia", { periodo, sitio }),
          GET("/ejecutivo/escalamientos"),
          GET("/ejecutivo/pausados", { sitio }),
        ]);
      if (id !== seq.current) return;
      setState({
        resumen,
        alertas: alertas ?? [],
        equipo: equipo ?? { tecnicos: [], sinAsignar: 0 },
        distribucion,
        tendencia: tendencia ?? [],
        escalamientos: escalamientos ?? [],
        pausados: pausados ?? [],
      });
      setTs(new Date());
    } catch (e) {
      if (id !== seq.current) return;
      setErr(e.message);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [periodo, sitio]);

  useEffect(() => {
    load();
  }, [load]);
  return { ...state, loading, err, ts, reload: load };
}

/* ══════════════════════════════════════════════════════════════════
   5. SUBCOMPONENTES VISUALES PUROS
   ══════════════════════════════════════════════════════════════════ */

/* ─ Sparkline ─────────────────────────────────────────────────── */
function Spark({ vals, color, w = 82, h = 34 }) {
  if (!vals || vals.length < 3) return <span style={{ width: w }} />;
  const mn = Math.min(...vals),
    mx = Math.max(...vals),
    span = mx - mn || 1;
  const pts = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - 3 - ((v - mn) / span) * (h - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="vje-kpi-spark"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─ Donut ──────────────────────────────────────────────────────── */
export function Donut({ datos, total, etiqueta = "Tickets", sz = 112 }) {
  const r = sz / 2 - 13,
    c = sz / 2,
    circ = 2 * Math.PI * r;
  const suma = datos.reduce((a, d) => a + (d.valor || 0), 0);
  let off = 0;
  return (
    <svg
      width={sz}
      height={sz}
      viewBox={`0 0 ${sz} ${sz}`}
      role="img"
      aria-label={`${etiqueta}: ${total}`}
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="13"
      />
      {suma > 0 &&
        datos.map((d, i) => {
          const dash = ((d.valor || 0) / suma) * circ;
          const el = (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="13"
              strokeDasharray={`${dash.toFixed(2)} ${(circ - dash).toFixed(2)}`}
              strokeDashoffset={(circ / 4 - off).toFixed(2)}
              transform={`rotate(-90 ${c} ${c})`}
            />
          );
          off += dash;
          return el;
        })}
      <text x={c} y={c - 2} textAnchor="middle" className="vje-donut-num">
        {total}
      </text>
      <text x={c} y={c + 13} textAnchor="middle" className="vje-donut-lbl">
        {etiqueta}
      </text>
    </svg>
  );
}

export function Leyenda({ datos, total }) {
  return (
    <div className="vje-donut-legend">
      {datos.map((d) => (
        <div className="vje-leg-row" key={d.nombre}>
          <span className="vje-leg-left">
            <span className="vje-leg-dot" style={{ background: d.color }} />
            <span className="vje-leg-name">{d.nombre}</span>
          </span>
          <span className="vje-leg-val">
            {d.valor}{" "}
            <span className="vje-leg-pct">({pct(d.valor, total)}%)</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─ Tendencia SVG ──────────────────────────────────────────────── */
function TendChart({ serie }) {
  if (!serie || serie.length < 2)
    return (
      <div className="vje-empty">
        <i className="ti ti-chart-line" />
        Sin datos suficientes
      </div>
    );
  const W = 300,
    H = 100,
    px = 4,
    py = 8;
  const max = Math.max(
    1,
    ...serie.map((p) => Math.max(p.total || 0, p.resueltos || 0)),
  );
  const X = (i) => px + (i / (serie.length - 1)) * (W - px * 2);
  const Y = (v) => H - py - (v / max) * (H - py * 2);
  const line = (key) =>
    serie
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${X(i).toFixed(1)},${Y(p[key] || 0).toFixed(1)}`,
      )
      .join(" ");
  const muestras = serie.filter(
    (_, i) =>
      i === 0 || i === serie.length - 1 || i === Math.floor(serie.length / 2),
  );
  return (
    <>
      <svg
        className="vje-trend-svg"
        viewBox={`0 0 ${W} ${H + 14}`}
        preserveAspectRatio="none"
        aria-label="Tendencia de tickets"
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={px}
            x2={W - px}
            y1={py + f * (H - py * 2)}
            y2={py + f * (H - py * 2)}
            stroke="var(--grid-line)"
            strokeWidth="1"
          />
        ))}
        <path
          d={line("total")}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d={line("resueltos")}
          fill="none"
          stroke="var(--success)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {serie.map((p, i) => (
          <g key={i}>
            <circle
              cx={X(i)}
              cy={Y(p.total || 0)}
              r="2.5"
              fill="var(--secondary)"
            />
            <circle
              cx={X(i)}
              cy={Y(p.resueltos || 0)}
              r="2.5"
              fill="var(--success)"
            />
          </g>
        ))}
        {muestras.map((p) => {
          const i = serie.indexOf(p);
          const anchor =
            i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle";
          return (
            <text
              key={i}
              x={X(i)}
              y={H + 10}
              textAnchor={anchor}
              className="vje-trend-axis"
            >
              {new Date(p.fecha).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
              })}
            </text>
          );
        })}
      </svg>
      <div className="vje-trend-legend">
        <span className="vje-legend-it">
          <span
            className="vje-legend-line"
            style={{ background: "var(--secondary)" }}
          />
          Recibidos
        </span>
        <span className="vje-legend-it">
          <span
            className="vje-legend-line"
            style={{ background: "var(--success)" }}
          />
          Resueltos
        </span>
      </div>
    </>
  );
}

/* ─ Barra SLA ──────────────────────────────────────────────────── */
function SLABar({ min: restantes, total: slaTotal }) {
  const col = colorSLA(restantes);
  const ancho = pctSLABarra(restantes, slaTotal);
  return (
    <span className="vje-sla">
      <span className="vje-sla-val" style={{ color: col }}>
        {restantes == null
          ? "Sin SLA"
          : restantes < 0
            ? "Vencido"
            : fmtMin(restantes)}
      </span>
      <span className="vje-sla-track">
        <span
          className="vje-sla-fill"
          style={{ width: `${ancho}%`, background: col }}
        />
      </span>
    </span>
  );
}

/* ─ Badge prioridad ────────────────────────────────────────────── */
function PriBadge({ prioridad, colorHex }) {
  const col = colorPri(prioridad, colorHex);
  return (
    <span
      className="vje-badge"
      style={{ color: col, background: bgBadge(col) }}
    >
      {prioridad || "—"}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════
   6. MODAL BASE  (portal + ESC + scroll interno)
   ══════════════════════════════════════════════════════════════════ */
function Modal({ onClose, ancho, labelledBy, children, variant = "", busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const esc = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="vje-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-labelledby={labelledBy}
        className={`vje-modal${busy ? " vje-modal--loading" : ""}${ancho ? " vje-modal--ancho" : ""}${variant ? " vje-modal--"+variant : ""}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function ModalHead({ id, title, sub, onClose, ia }) {
  return (
    <div className={`vje-modal-head${ia ? " vje-modal-head--ia" : ""}`}>
      <div className="vje-modal-head-txt">
        <div className="vje-modal-title" id={id}>
          {title}
        </div>
        {sub && <div className="vje-modal-sub">{sub}</div>}
      </div>
      {onClose && (
        <button
          className="vje-modal-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   7. MODAL DETALLE DE TICKET
      datos: objeto de /alertas o de /detalle-indicador .tickets[]
   ══════════════════════════════════════════════════════════════════ */
function ModalTicket({ t, onClose }) {
  const col = colorPri(t.prioridad, t.colorHex);
  const min = t.minutosRestantesSLA;

  const motivos = [];
  if (t.prioridad === "Crítica") motivos.push("Prioridad Crítica");
  if (min != null && min < 0)
    motivos.push(`SLA vencido hace ${fmtMin(Math.abs(min))}`);
  else if (min != null && min <= 240)
    motivos.push(`SLA vence en ${fmtMin(min)}`);
  if (!t.loginTecnico && !t.responsable) motivos.push("Sin técnico asignado");

  return (
    <Modal onClose={onClose} labelledBy="vje-tk-id">
      <ModalHead
        id="vje-tk-id"
        title={
          <>
            <span className="vje-sem" style={{ background: col }} />
            {t.folio}
          </>
        }
        sub={t.servicio || "Sin servicio"}
        onClose={onClose}
      />
      <div className="vje-modal-body">
        <div className="vje-tk-chips">
          <PriBadge prioridad={t.prioridad} colorHex={t.colorHex} />
          <span
            className="vje-badge"
            style={{
              color: "var(--text-muted)",
              background: "var(--bg-elevated)",
            }}
          >
            {t.estatus || "—"}
          </span>
        </div>
        <h3 className="vje-tk-titulo">
          {t.titulo || t.servicio || "Sin título"}
        </h3>
        {t.descripcion && <p className="vje-tk-desc">{t.descripcion}</p>}
        <dl className="vje-tk-grid">
          {[
            ["Usuario", t.nombreUsuario || "—"],
            ["Ubicación", t.sitio || t.sitioRaw || "—"],
            ["Área", t.area || "—"],
            ["Responsable", t.responsable || "Sin asignar", !t.responsable],
            [
              "SLA restante",
              min == null
                ? "Sin SLA"
                : min < 0
                  ? `Vencido hace ${fmtMin(Math.abs(min))}`
                  : fmtMin(min),
              true,
              colorSLA(min),
            ],
            ["Tiempo transcurrido", fmtMin(t.minutosAbierto)],
            ["Sin actividad", fmtMin(t.minutosDesdeUltAct)],
            ["Creado", fmtFechaCorta(t.fechaCreacion)],
            [
              "Última actividad",
              fmtFechaCorta(t.ultimaActividad || t.fechaActualizacion),
            ],
            t.escalaA ? ["Escalado a", t.escalaA] : null,
          ]
            .filter(Boolean)
            .map(([lbl, val, isRisk, forceColor]) => (
              <div className="vje-tk-cell" key={lbl}>
                <dt>{lbl}</dt>
                <dd
                  style={
                    forceColor
                      ? { color: forceColor }
                      : isRisk && val === "Sin asignar"
                        ? { color: "var(--danger)" }
                        : undefined
                  }
                >
                  {val}
                </dd>
              </div>
            ))}
        </dl>
        {motivos.length > 0 && (
          <div className="vje-tk-motivo">
            <i className="ti ti-alert-triangle" aria-hidden="true" />
            <div className="vje-tk-motivo-txt">
              <b>Por qué requiere atención</b>
              {motivos.join(" · ")}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════
   8. MODAL DE INDICADOR
      Llama a GET /ejecutivo/detalle-indicador?tipo=&sitio=
      Luego permite abrir el ticket individual.
   ══════════════════════════════════════════════════════════════════ */
const TITULOS_IND = {
  atencion: "Tickets que requieren atención inmediata",
  activos: "Tickets activos ahora",
  sinAsignar: "Tickets sin asignar",
  vencidosSLA: "Tickets con SLA vencido",
  porVencer: "Tickets por vencer (próx. 4 h)",
  criticas: "Tickets críticos",
  escalados: "Tickets escalados",
  enPausa: "Tickets en pausa",
};

function ModalIndicador({ tipo, sitio, onClose, onTicket }) {
  const [st, setSt] = useState({ loading: true, data: null, err: null });

  useEffect(() => {
    let vivo = true;
    setSt({ loading: true, data: null, err: null });
    GET("/ejecutivo/detalle-indicador", { tipo, sitio })
      .then((d) => {
        if (vivo) setSt({ loading: false, data: d, err: null });
      })
      .catch((e) => {
        if (vivo) setSt({ loading: false, data: null, err: e.message });
      });
    return () => {
      vivo = false;
    };
  }, [tipo, sitio]);

  const { loading, data, err } = st;

  return (
    <Modal onClose={onClose} ancho labelledBy="vje-ind-id">
      <ModalHead
        id="vje-ind-id"
        title={
          <>
            <i className="ti ti-list-search" aria-hidden="true" />
            {TITULOS_IND[tipo]}
          </>
        }
        sub={
          loading
            ? "Consultando…"
            : `${data?.total ?? 0} registros${sitio ? ` · ${sitio}` : ""}`
        }
        onClose={onClose}
      />
      <div className="vje-modal-body">
        {loading && (
          <div className="vje-skel" style={{ height: 280, borderRadius: 10 }} />
        )}
        {err && (
          <div className="vje-error" role="alert">
            <i className="ti ti-alert-circle" />
            <span>{err}</span>
          </div>
        )}
        {!loading && !err && data && (
          <>
            <div className="vje-mini-grid">
              {[
                ["Por ubicación", data.porSitio, "sitio"],
                ["Por servicio", data.porServicio, "servicio"],
                ["Por área", data.porArea, "area"],
              ].map(([tit, lista, campo]) => (
                <div className="vje-mini" key={tit}>
                  <div className="vje-mini-title">{tit}</div>
                  {(lista || []).slice(0, 5).map((r, i) => (
                    <div className="vje-mini-row" key={i}>
                      <span>{r[campo] || "Sin especificar"}</span>
                      <b>{r.total}</b>
                    </div>
                  ))}
                  {!lista?.length && (
                    <div className="vje-mini-row">
                      <span>Sin datos</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {data.tickets?.length ? (
              <div className="vje-lista">
                {data.tickets.map((t) => (
                  <button
                    className="vje-lista-it"
                    key={t.idSolicitud}
                    onClick={() => onTicket(t)}
                  >
                    <span
                      className="vje-sem"
                      style={{ background: colorPri(t.prioridad, t.colorHex) }}
                      aria-hidden="true"
                    />
                    <span className="vje-lista-main">
                      <span className="vje-lista-top">
                        <span className="vje-folio">{t.folio}</span>
                        <span className="vje-asunto">
                          {t.titulo || t.servicio || "—"}
                        </span>
                      </span>
                      <span className="vje-lista-sub">
                        <span>
                          <i className="ti ti-map-pin" aria-hidden="true" />
                          {t.sitio || "—"}
                        </span>
                        <span>
                          <i className="ti ti-user" aria-hidden="true" />
                          {t.responsable || "Sin asignar"}
                        </span>
                        <span>
                          <i className="ti ti-circle-dot" aria-hidden="true" />
                          {t.estatus}
                        </span>
                      </span>
                    </span>
                    <span className="vje-lista-sla">
                      <b style={{ color: colorSLA(t.minutosRestantesSLA) }}>
                        {t.minutosRestantesSLA == null
                          ? "—"
                          : t.minutosRestantesSLA < 0
                            ? "Vencido"
                            : fmtMin(t.minutosRestantesSLA)}
                      </b>
                      <span>SLA</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="vje-empty">
                <i className="ti ti-checks" />
                No hay tickets en este indicador
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════
   9. MODAL DE ANÁLISIS IA
      Llama REAL a POST /api/ejecutivo/analisis-ia
      El controller de tu proyecto llama a Claude con los datos
      reales y devuelve { ok, analisis } o { ok:false, sinApiKey }
   ══════════════════════════════════════════════════════════════════ */
const PASOS = [
  "Analizando tickets…",
  "Evaluando SLA…",
  "Detectando riesgos…",
  "Analizando carga del equipo…",
  "Identificando tendencias…",
];

function nivelLabel(n) {
  if (!n) return null;
  const map = {
    CRITICO: { txt: "Crítico", col: "var(--danger)" },
    ATENCION: { txt: "Con atención", col: "var(--warning)" },
    ESTABLE: { txt: "Estable", col: "var(--success)" },
  };
  return map[n?.toUpperCase()] || null;
}

export function ModalIA({ periodo, sitio, onClose, requestAnalysis, development = false, maintenance = false }) {
  const pasos=maintenance?["Consultando mantenimientos…","Revisando trabajos detenidos…","Analizando la carga del personal…","Preparando el resumen…"]:development?["Consultando desarrollos…","Revisando compromisos…","Evaluando bloqueos…","Analizando responsables…","Preparando el resumen…"]:PASOS;
  const [paso, setPaso] = useState(0);
  const [listo, setListo] = useState(false);
  const [res, setRes] = useState(null); // { ok, analisis?, error?, sinApiKey? }

  useEffect(() => {
    if (paso < pasos.length) {
      const t = setTimeout(() => setPaso((p) => p + 1), 580);
      return () => clearTimeout(t);
    }
    // Cuando terminan los pasos, llamamos al endpoint real
    (requestAnalysis ? requestAnalysis() : POST("/ejecutivo/analisis-ia", { periodo: parseInt(periodo, 10), sitio }))
      .then((data) => {
        // El controller devuelve { ok, analisis, generadoEn } o { ok:false, sinApiKey, error }
        setRes(
          data && typeof data === "object"
            ? data
            : { ok: false, error: "Respuesta inesperada" },
        );
        setListo(true);
      })
      .catch((e) => {
        setRes({ ok: false, error: e.message });
        setListo(true);
      });
  }, [paso]); // eslint-disable-line

  const niv = res?.analisis ? nivelLabel(res.analisis.nivelRiesgo) : null;

  return (
    <Modal ancho busy={!listo} variant={development?"development":""} onClose={listo ? onClose : undefined} labelledBy="vje-ia-id">
      <ModalHead
        id="vje-ia-id"
        title={
          <>
            <i className="ti ti-sparkles" aria-hidden="true" />
            Análisis
          </>
        }
        sub={
          listo
            ? res?.generadoEn
              ? `Generado · ${fmtFechaCorta(res.generadoEn)}`
              : null
            : "Procesando datos reales…"
        }
        onClose={onClose}
        ia
      />
      <div className="vje-modal-body">
        {/* Pasos de animación */}
        {!listo && (
          <div className="vje-ia-steps" aria-live="polite">
            {pasos.map((txt, i) => (
              <div
                key={i}
                className={`vje-ia-step${i < paso ? " vje-ia-step--hecho" : i === paso ? " vje-ia-step--activo" : ""}`}
              >
                {i < paso ? (
                  <i className="ti ti-circle-check" aria-hidden="true" />
                ) : i === paso ? (
                  <i className="ti ti-loader-2 vje-spin" aria-hidden="true" />
                ) : (
                  <i className="ti ti-circle" aria-hidden="true" />
                )}
                <span>{txt}</span>
              </div>
            ))}
          </div>
        )}

        {/* Sin API key configurada */}
        {listo && res?.sinApiKey && (
          <div className="vje-ia-config">
            <i className="ti ti-key" aria-hidden="true" />
            <div>
              <b>ANTHROPIC_API_KEY no configurada</b>
              <p>
                Define la variable de entorno en el servidor para activar el
                análisis con IA. El endpoint{" "}
                <code>POST /ejecutivo/analisis-ia</code> ya está listo.
              </p>
            </div>
          </div>
        )}

        {/* Error de red u otro */}
        {listo && !res?.sinApiKey && !res?.ok && (
          <div className="vje-error" role="alert">
            <i className="ti ti-alert-circle" />
            <span>
              {res?.error || "Error desconocido al generar el análisis."}
            </span>
          </div>
        )}

        {/* Resultado real */}
        {listo && res?.ok && res?.analisis && (
          <ExecutiveAnalysis analysis={res.analisis} nivel={niv} periodo={periodo} sitio={sitio} contextLabel={maintenance?"Mantenimiento · Estado actual":development?"Desarrollo TI · Estado actual":undefined}/>
        )}
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════
   10. PÁGINA PRINCIPAL
   ══════════════════════════════════════════════════════════════════ */
/* ─ Alerta de tickets pausados ─────────────────────────────────
   Nivel por la pausa más antigua: ≥30 días crítico, ≥7 días alerta. */
const DIA_MIN = 1440;

function fmtPausa(m) {
  if (m == null) return "—";
  const d = Math.floor(m / DIA_MIN);
  if (d >= 60) return `${Math.floor(d / 30)} meses`;
  if (d >= 30) return `${d} días (+1 mes)`;
  if (d >= 1) return `${d} día${d > 1 ? "s" : ""}`;
  return fmtMin(m);
}

function nivelPausa(m) {
  if (m >= 30 * DIA_MIN) return "critico";
  if (m >= 7 * DIA_MIN) return "alerta";
  return "normal";
}

function AlertaPausados({ pausados, onVer }) {
  if (!pausados?.length) return null;
  const maxMin = pausados[0].minutosPausado || 0;
  const nivel = nivelPausa(maxMin);
  const masMes = pausados.filter((t) => t.minutosPausado >= 30 * DIA_MIN).length;
  const masSemana = pausados.filter((t) => t.minutosPausado >= 7 * DIA_MIN).length;
  const n = pausados.length;
  const pl = (k) => (k > 1 ? "s" : "");

  const titulo =
    nivel === "critico"
      ? `${masMes} ticket${pl(masMes)} pausado${pl(masMes)} desde hace más de un mes`
      : nivel === "alerta"
        ? `${masSemana} ticket${pl(masSemana)} pausado${pl(masSemana)} hace más de una semana`
        : `${n} ticket${pl(n)} en pausa`;

  return (
    <div className={`vje-pausa vje-pausa--${nivel}`}>
      <button
        className="vje-pausa-bar"
        onClick={onVer}
        aria-describedby="vje-pausa-tip"
      >
        <span className="vje-pausa-icon" aria-hidden="true">
          <i className="ti ti-player-pause" />
        </span>
        <span className="vje-pausa-txt">
          <strong>{titulo}</strong>
          <span>
            {nivel === "normal"
              ? `El más antiguo lleva ${fmtPausa(maxMin)} detenido.`
              : `¡Requieren atención inmediata! El más antiguo lleva ${fmtPausa(maxMin)} sin atención.`}
          </span>
        </span>
        <span className="vje-pausa-count">{n}</span>
        <i className="ti ti-chevron-right" aria-hidden="true" />
      </button>

      <div className="vje-pausa-tip" id="vje-pausa-tip" role="tooltip">
        <div className="vje-pausa-tip-head">
          <i className="ti ti-alarm" aria-hidden="true" />
          Tickets en pausa · {n}
        </div>
        <ul>
          {pausados.slice(0, 6).map((t) => {
            const nv = nivelPausa(t.minutosPausado || 0);
            return (
              <li key={t.idSolicitud} className={`vje-pausa-item--${nv}`}>
                <span className="vje-pausa-folio">{t.folio}</span>
                <span className="vje-pausa-resp">
                  {t.titulo || t.servicio} · {t.responsable}
                </span>
                <span className="vje-pausa-tiempo">
                  {nv === "critico" && (
                    <i className="ti ti-flame" aria-hidden="true" />
                  )}
                  {fmtPausa(t.minutosPausado)}
                </span>
              </li>
            );
          })}
        </ul>
        {n > 6 && <div className="vje-pausa-more">y {n - 6} más…</div>}
        <div className="vje-pausa-foot">Clic para ver el detalle</div>
      </div>
    </div>
  );
}

export default function VisorEjecutivoPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState("situacional");
  const [periodo, setPeriodo] = useState("30");
  const [sitio, setSitio] = useState("");
  const [colaps, setColaps] = useState(false);
  const [reloj, setReloj] = useState(new Date());

  // Modales
  const [tkModal, setTkModal] = useState(null); // objeto ticket
  const [indModal, setIndModal] = useState(null); // string tipo indicador
  const [iaOpen, setIaOpen] = useState(false);

  const {
    resumen,
    alertas,
    equipo,
    distribucion,
    tendencia,
    escalamientos,
    pausados,
    loading,
    err,
    ts,
    reload,
  } = useVisor(periodo, sitio);

  useEffect(() => {
    const t = setInterval(() => setReloj(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  /* ── Nivel operativo derivado de resumen ─────────────────────── */
  const nivel = useMemo(() => {
    if (!resumen) return null;
    const {
      criticas = 0,
      vencidosSLA = 0,
      sinAsignar = 0,
      activosAhora = 0,
    } = resumen;
    if (criticas >= 5 || (activosAhora > 0 && vencidosSLA / activosAhora > 0.5))
      return {
        id: "critico",
        label: "Crítico",
        icono: "ti-alert-octagon",
        texto:
          "La operación está bajo presión. Se requiere intervención inmediata en tickets críticos y SLA vencidos.",
      };
    if (criticas > 0 || vencidosSLA > 0 || sinAsignar > 0)
      return {
        id: "atencion",
        label: "Con atención",
        icono: "ti-alert-triangle",
        texto:
          "Operación funcionando con puntos de atención concentrados en SLA y tickets sin responsable.",
      };
    return {
      id: "estable",
      label: "Estable",
      icono: "ti-circle-check",
      texto:
        "Operación estable. Sin incidencias críticas ni SLA vencidos actualmente.",
    };
  }, [resumen]);

  /* ── Proveedores sin actualización > 7 días ─────────────────── */
  const provSinAct = useMemo(
    () =>
      (escalamientos || []).filter((e) => (e.promedioHrs || 0) > 168).length,
    [escalamientos],
  );

  /* ── KPIs (5 tarjetas) ───────────────────────────────────────── */
  const kpis = useMemo(() => {
    if (!resumen) return [];
    return [
      {
        id: "activosAhora",
        tono: "info",
        icono: "ti-activity",
        label: "Activos ahora",
        valor: resumen.activosAhora,
        sub: `${resumen.enProceso} en proceso · ${resumen.escalados} escalados`,
        delta: resumen.deltas?.abiertas,
      },
      {
        id: "sinAsignar",
        tono: "risk",
        icono: "ti-user-question",
        label: "Sin asignar",
        valor: resumen.sinAsignar,
        sub: "SLA corriendo sin responsable",
      },
      {
        id: "vencidosSLA",
        tono: "warn",
        icono: "ti-clock-exclamation",
        label: "SLA vencidos",
        valor: resumen.vencidosSLA,
        sub: `${resumen.porVencer} más en riesgo próximas 4 h`,
      },
      {
        id: "cumplimiento",
        tono: "ok",
        icono: "ti-circle-check",
        label: "Cumplimiento SLA",
        valor: resumen.pctSLA == null ? "—" : `${resumen.pctSLA}%`,
        sub:
          resumen.pctSLA == null
            ? "Sin resueltos con SLA en el periodo"
            : resumen.pctSLA >= 95
              ? "Dentro de la meta (95%)"
              : "Por debajo de la meta (95%)",
        sinModal: true,
      },
      {
        id: "criticas",
        tono: "accent",
        icono: "ti-flame",
        label: "Tickets críticos",
        valor: resumen.criticas,
        sub: "Requieren atención inmediata",
      },
    ];
  }, [resumen]);

  /* ── Donuts ──────────────────────────────────────────────────── */

  // Estado: usa los cortes reales que devuelve getResumen
  const donutEstado = useMemo(() => {
    if (!resumen) return [];
    return [
      {
        nombre: "En proceso",
        valor: resumen.enProceso || 0,
        color: "var(--secondary)",
      },
      {
        nombre: "Pendientes",
        valor: resumen.pendientes || 0,
        color: "var(--warning)",
      },
      {
        nombre: "Sin asignar",
        valor: resumen.sinAsignar || 0,
        color: "var(--danger)",
      },
      {
        nombre: "En diagnóstico",
        valor: resumen.enDiagnostico || 0,
        color: "var(--accent-l)",
      },
      {
        nombre: "Escalados",
        valor: resumen.escalados || 0,
        color: "var(--text-faint)",
      },
    ].filter((d) => d.valor > 0);
  }, [resumen]);

  // Prioridad: viene de /distribucion
  const donutPri = useMemo(
    () =>
      (distribucion?.prioridad || [])
        .filter((p) => p.prioridad)
        .map((p) => ({
          nombre: p.prioridad,
          valor: p.total,
          color: colorPri(p.prioridad, p.colorHex),
        })),
    [distribucion],
  );

  // SLA: derivado de resumen activos
  const donutSLA = useMemo(() => {
    if (!resumen) return [];
    const venc = resumen.vencidosSLA || 0;
    const riesgo = resumen.porVencer || 0;
    const enTiempo = Math.max(0, (resumen.activosAhora || 0) - venc - riesgo);
    return [
      { nombre: "En tiempo", valor: enTiempo, color: "var(--success)" },
      { nombre: "En riesgo < 4 h", valor: riesgo, color: "var(--warning)" },
      { nombre: "Vencidos", valor: venc, color: "var(--danger)" },
    ];
  }, [resumen]);

  // Ubicación: viene de /distribucion .sitio (normalizado en el controller)
  const ubicaciones = useMemo(() => {
    const lista = distribucion?.sitio || [];
    const total = lista.reduce((a, s) => a + s.total, 0);
    const cols = [
      "var(--secondary)",
      "var(--accent-l)",
      "var(--success)",
      "var(--text-faint)",
    ];
    return lista.map((s, i) => ({
      nombre: s.sitio || "Sin ubicación",
      valor: s.total,
      pct: pct(s.total, total),
      color: cols[i % cols.length],
    }));
  }, [distribucion]);

  // Sparkline: serie histórica real de /tendencia (total creado por día)
  const sparkVals = useMemo(
    () => (tendencia || []).map((p) => p.total || 0),
    [tendencia],
  );

  // Carga equipo: escala relativa al máximo de activos del equipo
  const maxCarga = useMemo(
    () => Math.max(1, ...(equipo?.tecnicos || []).map((t) => t.activas || 0)),
    [equipo],
  );

  // Top 5 alertas para la tabla de atención inmediata
  const top5 = (alertas || []).slice(0, 5);

  // Color de sparkline por tono de KPI
  const sparkColor = {
    info: "var(--secondary)",
    risk: "var(--danger)",
    warn: "var(--warning)",
    ok: "var(--success)",
    accent: "var(--accent)",
  };

  /* ════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════ */
  return (
    <div className={"vje-root"+(tab==="desarrollo"?" vje-root--development":"")}>
      {/* ══════════ MAIN ══════════ */}
      <div className="vje-main">
        <div className="vje-scroll">
          {/* ── TOOLBAR ── */}
          <div className="vje-toolbar">
            <div className="vje-pillgroup" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`vje-pill${tab === t.id ? " vje-pill--active" : ""}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.icon && (
                    <i className={`ti ${t.icon}`} aria-hidden="true" />
                  )}
                  {t.label}
                </button>
              ))}
            </div>
            <div className="vje-toolbar-right" hidden={tab !== "situacional"}>
              <div className="vje-pillgroup" role="group" aria-label="Periodo">
                {PERIODOS.map((p) => (
                  <button
                    key={p.id}
                    aria-pressed={periodo === p.id}
                    className={`vje-pill${periodo === p.id ? " vje-pill--active" : ""}`}
                    onClick={() => setPeriodo(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div
                className="vje-pillgroup vje-pillgroup--sitio"
                role="group"
                aria-label="Ubicación"
              >
                {SITIOS.map((s) => (
                  <button
                    key={s.id || "todos"}
                    aria-pressed={sitio === s.id}
                    className={`vje-pill${sitio === s.id ? " vje-pill--active" : ""}`}
                    onClick={() => setSitio(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="vje-clock">
                <span className="vje-dot-live" aria-hidden="true" />
                <span>{fmtHora(reloj)}</span>
                <button
                  onClick={reload}
                  disabled={loading}
                  aria-label="Actualizar datos"
                >
                  <i
                    className={`ti ti-refresh${loading ? " vje-spin" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </div>

          {tab === "desarrollo" ? <DevelopmentExecutive Donut={Donut} Leyenda={Leyenda} Modal={Modal} ModalHead={ModalHead} ModalIA={ModalIA}/> : <>
          {/* ── ERROR GLOBAL ── */}
          {err && (
            <div className="vje-error" role="alert">
              <i className="ti ti-alert-circle" aria-hidden="true" />
              <span>{err}</span>
              <button onClick={reload}>Reintentar</button>
            </div>
          )}

          {/* ══ BANNER EJECUTIVO ══ */}
          {loading && !resumen ? (
            <div
              className="vje-skel"
              style={{ height: 128, borderRadius: 14 }}
            />
          ) : (
            nivel &&
            resumen && (
              <section className="vje-banner" aria-label="Resumen ejecutivo">
                {/* Col izquierda: situación */}
                <div>
                  <div className="vje-banner-eyebrow">Situación general</div>
                  <div
                    className={`vje-banner-estado vje-banner-estado--${nivel.id}`}
                  >
                    {nivel.label}
                    <i className={`ti ${nivel.icono}`} aria-hidden="true" />
                  </div>
                  <p className="vje-banner-texto">{nivel.texto}</p>
                </div>

                {/* Col centro: ilustración + botón IA */}
                <div className="vje-banner-centro">
                  <div className="vje-banner-ilustracion" aria-hidden="true">
                    <img src={visorEjecutivoHero} alt="" />
                  </div>
                  <button
                    className="vje-btn-ia"
                    onClick={() => setIaOpen(true)}
                  >
                    <i className="ti ti-sparkles" aria-hidden="true" />
                    Analizar con IA
                  </button>
                  <div className="vje-banner-iahint">
                    Obtén un análisis inteligente
                    <br />
                    de la situación actual
                  </div>
                </div>

                {/* Col derecha: bullets con datos reales */}
                <div className="vje-banner-bullets">
                  {!sitio && resumen.sitioTopActivo && (
                    <div className="vje-bullet vje-bullet--info">
                      <i className="ti ti-target" aria-hidden="true" />
                      <span>
                        <strong>{resumen.sitioTopActivo}</strong> concentra el{" "}
                        <strong>{resumen.pctSitioTop}%</strong> de los tickets
                        activos
                      </span>
                    </div>
                  )}
                  <div className="vje-bullet vje-bullet--warn">
                    <i className="ti ti-clock-exclamation" aria-hidden="true" />
                    <span>
                      <strong>{resumen.vencidosSLA}</strong> SLA vencidos
                      requieren atención
                    </span>
                  </div>
                  <div className="vje-bullet vje-bullet--risk">
                    <i className="ti ti-flame" aria-hidden="true" />
                    <span>
                      <strong>{resumen.criticas}</strong> tickets críticos
                      abiertos
                    </span>
                  </div>
                  <div className="vje-bullet vje-bullet--muted">
                    <i className="ti ti-truck-delivery" aria-hidden="true" />
                    <span>
                      <strong>{provSinAct}</strong> proveedores sin
                      actualización &gt; 7 días
                    </span>
                  </div>
                </div>
              </section>
            )
          )}

          <AlertaPausados
            pausados={pausados}
            onVer={() => setIndModal("enPausa")}
          />

          {/* ══ KPIs ══ */}
          <section className="vje-kpis" aria-label="Indicadores clave">
            {loading && !resumen
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="vje-skel"
                    style={{ height: 108, borderRadius: 12 }}
                  />
                ))
              : kpis.map((k) => (
                  <button
                    key={k.id}
                    className={`vje-kpi vje-kpi--${k.tono}`}
                    onClick={
                      k.sinModal ? undefined : () => setIndModal(IND[k.id])
                    }
                    style={k.sinModal ? { cursor: "default" } : undefined}
                  >
                    <div className="vje-kpi-top">
                      <div className="vje-kpi-label">
                        <i className={`ti ${k.icono}`} aria-hidden="true" />
                        <span>{k.label}</span>
                      </div>
                      {typeof k.delta === "number" && k.delta !== 0 && (
                        <span
                          className={`vje-kpi-delta vje-kpi-delta--${k.delta > 0 ? "up" : "down"}`}
                        >
                          {k.delta > 0 ? "▲" : "▼"} {Math.abs(k.delta)}%
                        </span>
                      )}
                    </div>
                    <div className="vje-kpi-body">
                      <span className="vje-kpi-num">{k.valor}</span>
                      <Spark vals={sparkVals} color={sparkColor[k.tono]} />
                    </div>
                    <div className="vje-kpi-sub">{k.sub}</div>
                  </button>
                ))}
          </section>

          {/* ══ ATENCIÓN INMEDIATA + CARGA EQUIPO ══ */}
          <section className="vje-row-media">
            {/* Atención inmediata */}
            {loading && !alertas ? (
              <div
                className="vje-skel"
                style={{ height: 280, borderRadius: 14 }}
              />
            ) : (
              <div className="vje-card">
                <div className="vje-card-head">
                  <div className="vje-card-title">
                    <i
                      className="ti ti-alert-triangle vje-i-warn"
                      aria-hidden="true"
                    />
                    Requieren atención inmediata
                  </div>
                  <button
                    className="vje-card-link"
                    onClick={() => setIndModal("atencion")}
                  >
                    Ver todos
                  </button>
                </div>
                {top5.length ? (
                  <>
                    <div className="vje-tabla-wrap">
                      <table className="vje-tabla">
                        <thead>
                          <tr>
                            <th>Ticket</th>
                            <th>Asunto</th>
                            <th>SLA restante</th>
                            <th>Prioridad</th>
                            <th>Asignado a</th>
                            <th>Ubicación</th>
                          </tr>
                        </thead>
                        <tbody>
                          {top5.map((t) => (
                            <tr
                              key={t.idSolicitud}
                              tabIndex={0}
                              onClick={() => setTkModal(t)}
                              onKeyDown={(e) =>
                                e.key === "Enter" && setTkModal(t)
                              }
                            >
                              <td className="vje-td-folio">
                                <span className="vje-folio-wrap">
                                  <span
                                    className="vje-sem"
                                    style={{
                                      background: colorPri(
                                        t.prioridad,
                                        t.colorHex,
                                      ),
                                    }}
                                    aria-hidden="true"
                                  />
                                  <span className="vje-folio">{t.folio}</span>
                                </span>
                              </td>
                              <td className="vje-td-asunto">
                                <span
                                  className="vje-asunto"
                                  title={t.titulo || t.servicio}
                                >
                                  {t.titulo || t.servicio || "—"}
                                </span>
                              </td>
                              <td className="vje-td-sla">
                                <SLABar
                                  min={t.minutosRestantesSLA}
                                  total={t.slaResolucionMin}
                                />
                              </td>
                              <td>
                                <PriBadge
                                  prioridad={t.prioridad}
                                  colorHex={t.colorHex}
                                />
                              </td>
                              <td
                                className={`vje-td-resp${!t.responsable ? " vje-resp--sin" : ""}`}
                              >
                                {t.responsable || "Sin asignar"}
                              </td>
                              <td className="vje-td-sitio">{t.sitio || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="vje-card-foot">
                      <button
                        className="vje-btn-foot"
                        onClick={() => setIndModal("atencion")}
                      >
                        Ver todos los que requieren atención
                        <i className="ti ti-arrow-right" aria-hidden="true" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="vje-empty">
                    <i className="ti ti-checks" aria-hidden="true" />
                    Nada requiere atención inmediata
                  </div>
                )}
              </div>
            )}

            {/* Carga del equipo */}
            {loading && !equipo ? (
              <div
                className="vje-skel"
                style={{ height: 280, borderRadius: 14 }}
              />
            ) : (
              <div className="vje-card">
                <div className="vje-card-head">
                  <div className="vje-card-title">
                    <i className="ti ti-users vje-i-info" aria-hidden="true" />
                    Carga del equipo TI
                  </div>
                  <button
                    className="vje-card-link"
                    onClick={() => setIndModal("activos")}
                  >
                    Ver detalle
                  </button>
                </div>
                {equipo?.tecnicos?.length ? (
                  <>
                    <div className="vje-equipo">
                      {equipo.tecnicos.slice(0, 6).map((t) => {
                        const proc =
                          (t.enProceso || 0) + (t.enDiagnostico || 0);
                        const pend = t.pendientes || 0;
                        const risk = t.fueraSLA || 0;
                        const esc = (v) =>
                          `${((v / maxCarga) * 100).toFixed(1)}%`;
                        return (
                          <div className="vje-tec" key={t.login}>
                            <div className="vje-tec-av" aria-hidden="true">
                              {t.picture ? (
                                <img src={t.picture} alt="" />
                              ) : (
                                iniciales(t.nombre)
                              )}
                            </div>
                            <div className="vje-tec-body">
                              <div className="vje-tec-top">
                                <div className="vje-tec-ident">
                                  <span className="vje-tec-nombre">
                                    {t.nombre || t.login}
                                  </span>
                                  <span className="vje-tec-area">
                                    {t.criticas > 0
                                      ? `${t.criticas} crítico${t.criticas > 1 ? "s" : ""}`
                                      : "Sin críticos"}
                                  </span>
                                </div>
                                <div className="vje-tec-nums">
                                  <div className="vje-tec-num vje-tec-num--total">
                                    <b>{t.activas || 0}</b>
                                    <span>Activos</span>
                                  </div>
                                  <div className="vje-tec-num vje-tec-num--proc">
                                    <b>{proc}</b>
                                    <span>En proc.</span>
                                  </div>
                                  <div className="vje-tec-num vje-tec-num--pend">
                                    <b>{pend}</b>
                                    <span>Pend.</span>
                                  </div>
                                  <div className="vje-tec-num vje-tec-num--risk">
                                    <b>{risk}</b>
                                    <span>Riesgo</span>
                                  </div>
                                </div>
                              </div>
                              <div
                                className="vje-carga"
                                role="img"
                                aria-label={`${t.nombre}: ${t.activas} tickets activos`}
                              >
                                <span
                                  className="vje-carga-proc"
                                  style={{ width: esc(proc) }}
                                />
                                <span
                                  className="vje-carga-pend"
                                  style={{ width: esc(pend) }}
                                />
                                <span
                                  className="vje-carga-risk"
                                  style={{ width: esc(risk) }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="vje-legend">
                      {[
                        ["var(--success)", "En proceso"],
                        ["var(--warning)", "Pendientes"],
                        ["var(--danger)", "En riesgo"],
                        ["var(--border)", `Sin asignar (${equipo.sinAsignar})`],
                      ].map(([bg, lbl]) => (
                        <span key={lbl} className="vje-legend-it">
                          <span
                            className="vje-legend-sq"
                            style={{ background: bg }}
                          />
                          {lbl}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="vje-empty">
                    <i className="ti ti-users-off" aria-hidden="true" />
                    Sin tickets asignados
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ══ GRÁFICAS ══ */}
          <section
            className="vje-row-charts"
            aria-label="Distribuciones y tendencias"
          >
            {loading && !resumen ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="vje-skel"
                  style={{ height: 246, borderRadius: 14 }}
                />
              ))
            ) : (
              <>
                {/* Donut estado */}
                <div className="vje-chart">
                  <div className="vje-chart-title">Distribución por estado</div>
                  <div className="vje-donut-wrap">
                    <Donut
                      datos={donutEstado}
                      total={donutEstado.reduce((a, d) => a + d.valor, 0)}
                    />
                  </div>
                  <Leyenda
                    datos={donutEstado}
                    total={donutEstado.reduce((a, d) => a + d.valor, 0)}
                  />
                </div>
                {/* Donut prioridad */}
                <div className="vje-chart">
                  <div className="vje-chart-title">
                    Distribución por prioridad
                  </div>
                  <div className="vje-donut-wrap">
                    <Donut
                      datos={donutPri}
                      total={donutPri.reduce((a, d) => a + d.valor, 0)}
                    />
                  </div>
                  <Leyenda
                    datos={donutPri}
                    total={donutPri.reduce((a, d) => a + d.valor, 0)}
                  />
                </div>
                {/* Donut SLA */}
                <div className="vje-chart">
                  <div className="vje-chart-title">SLA</div>
                  <div className="vje-donut-wrap">
                    <Donut
                      datos={donutSLA}
                      total={donutSLA.reduce((a, d) => a + d.valor, 0)}
                    />
                  </div>
                  <Leyenda
                    datos={donutSLA}
                    total={donutSLA.reduce((a, d) => a + d.valor, 0)}
                  />
                </div>
                {/* Barras ubicación */}
                <div className="vje-chart">
                  <div className="vje-chart-title">Tickets por ubicación</div>
                  {ubicaciones.length ? (
                    ubicaciones.map((u) => (
                      <div className="vje-loc" key={u.nombre}>
                        <div className="vje-loc-top">
                          <span className="vje-loc-name">{u.nombre}</span>
                          <span className="vje-loc-val">
                            {u.valor}{" "}
                            <span className="vje-leg-pct">({u.pct}%)</span>
                          </span>
                        </div>
                        <div className="vje-loc-track">
                          <div
                            className="vje-loc-fill"
                            style={{ width: `${u.pct}%`, background: u.color }}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="vje-empty">
                      <i className="ti ti-map-off" />
                      Sin datos de ubicación
                    </div>
                  )}
                </div>
                {/* Tendencia */}
                <div className="vje-chart">
                  <div className="vje-chart-title">
                    Tendencia{" "}
                    {PERIODOS.find(
                      (p) => p.id === periodo,
                    )?.label.toLowerCase()}
                  </div>
                  <TendChart serie={tendencia} />
                </div>
              </>
            )}
          </section>

          {/* Pie */}
          <div className="vje-footer">
            <span className="vje-dot-live" aria-hidden="true" />
            Datos en tiempo real · Última actualización:{" "}
            {ts ? fmtHora(ts) : "—"}
          </div>
          </>}
        </div>
        {/* /vje-scroll */}
      </div>
      {/* /vje-main */}

      {/* ══ MODALES ══ */}
      {tkModal && <ModalTicket t={tkModal} onClose={() => setTkModal(null)} />}

      {indModal && !tkModal && (
        <ModalIndicador
          tipo={indModal}
          sitio={sitio}
          onClose={() => setIndModal(null)}
          onTicket={(t) => setTkModal(t)}
        />
      )}

      {iaOpen && (
        <ModalIA
          periodo={periodo}
          sitio={sitio}
          onClose={() => setIaOpen(false)}
        />
      )}
    </div>
  );
}
