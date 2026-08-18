import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

// ─── apiFetch local ──────────────────────────────────────────────────────────
const apiFetch = async (path, options = {}) => {
  const token = localStorage.getItem("fabpsa_token");
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (res.status === 401) {
    window.location.href = "/login";
    return null;
  }
  return res.json();
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(min) {
  if (min == null) return "—";
  if (min < 0)
    return `Vencido ${Math.abs(Math.floor(min / 60))}h ${Math.abs(min % 60)}m`;
  const h = Math.floor(min / 60),
    m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtAbierto(min) {
  const h = Math.floor(min / 60),
    m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function delta(val, invert = false) {
  if (val === 0) return null;
  const up = val > 0;
  const good = invert ? !up : up;
  return { val, up, good };
}
function DeltaBadge({ value, invert = false }) {
  const d = delta(value, invert);
  if (!d)
    return (
      <span style={{ color: "var(--text-faint)", fontSize: 11 }}>igual</span>
    );
  return (
    <span
      style={{
        fontSize: 11,
        color: d.good ? "#4cc9a6" : "#f38ba8",
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <i
        className={`ti ti-trending-${d.up ? "up" : "down"}`}
        style={{ fontSize: 12 }}
      />
      {Math.abs(d.val)}% vs. anterior
    </span>
  );
}

// ─── Sparkline SVG simple ────────────────────────────────────────────────────
function Sparkline({ data = [], color = "#4cc9a6", height = 36, width = 120 }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (v / max) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Mini line chart (tendencia 30d) ─────────────────────────────────────────
function TendenciaChart({ data = [] }) {
  if (!data.length)
    return (
      <div style={{ color: "var(--text-faint)", fontSize: 13 }}>Sin datos</div>
    );
  const W = 340,
    H = 100,
    PAD = 8;
  const vals = data.map((d) => d.total);
  const max = Math.max(...vals, 1);
  const pts = vals
    .map((v, i) => {
      const x = PAD + (i / (vals.length - 1 || 1)) * (W - PAD * 2);
      const y = PAD + ((max - v) / max) * (H - PAD * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const lastX = PAD + (W - PAD * 2);
  const lastY = PAD + ((max - vals[vals.length - 1]) / max) * (H - PAD * 2);

  const labels =
    data.length > 1
      ? [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]]
      : [data[0]];
  const labelIdxs =
    data.length > 1 ? [0, Math.floor(data.length / 2), data.length - 1] : [0];

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H + 20}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4cc9a6" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#4cc9a6" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.5, 1].map((t, i) => (
        <line
          key={i}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + t * (H - PAD * 2)}
          y2={PAD + t * (H - PAD * 2)}
          stroke="var(--border)"
          strokeWidth={0.5}
          strokeDasharray="3,3"
        />
      ))}
      {/* Area fill */}
      <polygon
        points={`${PAD},${H - PAD} ${pts} ${lastX},${H - PAD}`}
        fill="url(#tg)"
      />
      {/* Line */}
      <polyline
        points={pts}
        fill="none"
        stroke="#4cc9a6"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last dot */}
      <circle cx={lastX} cy={lastY} r={3} fill="#4cc9a6" />
      {/* X labels */}
      {labelIdxs.map((idx, i) => {
        const x = PAD + (idx / (vals.length - 1 || 1)) * (W - PAD * 2);
        const fecha = new Date(data[idx].fecha);
        const label = `${fecha.getDate()} ${["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][fecha.getMonth()]}`;
        return (
          <text
            key={i}
            x={x}
            y={H + 16}
            textAnchor="middle"
            fontSize={9}
            fill="var(--text-faint)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton({ w = "100%", h = 16, radius = 4, style = {} }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, var(--bg-elevated) 25%, var(--bg-hover) 50%, var(--bg-elevated) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
        ...style,
      }}
    />
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  icon,
  color = "var(--primary)",
  delta: d,
  loading,
  accentBad,
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "16px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        borderTop: `3px solid ${color}`,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 18, color }} />
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      </div>
      {loading ? (
        <Skeleton h={32} w={60} />
      ) : (
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "var(--text-h)",
            lineHeight: 1,
          }}
        >
          {value ?? "—"}
        </span>
      )}
      {d !== undefined && !loading && (
        <DeltaBadge value={d} invert={accentBad} />
      )}
    </div>
  );
}

// ─── Alerta item ─────────────────────────────────────────────────────────────
function AlertaItem({ a, onClick }) {
  const colorMap = {
    critica: "#f38ba8",
    vencida: "#f38ba8",
    urgente: "#fab387",
    warning: "#f9e2af",
  };
  const iconMap = {
    critica: "ti-alert-octagon",
    vencida: "ti-clock-x",
    urgente: "ti-clock-exclamation",
    warning: "ti-clock",
  };
  const color = colorMap[a.tipo] || "#f9e2af";
  const icon = iconMap[a.tipo] || "ti-clock";

  return (
    <div
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "32px 1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--bg-elevated)",
        cursor: "pointer",
        borderLeft: `3px solid ${color}`,
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--bg-elevated)")
      }
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: `${color}20`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 16, color }} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{ fontWeight: 600, fontSize: 13, color: "var(--text-h)" }}
          >
            {a.folio}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {a.servicio}
          </span>
          {a.sitio && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-faint)",
                background: "var(--bg-base)",
                borderRadius: 4,
                padding: "1px 6px",
              }}
            >
              {a.sitio}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
          Abierta {fmtAbierto(a.minutosAbierto)} · {a.responsable}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color,
            background: `${color}15`,
            borderRadius: 6,
            padding: "3px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {a.etiqueta || a.prioridad}
        </span>
        {a.minutosRestantesSLA !== null && a.minutosRestantesSLA > 30 && (
          <div
            style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3 }}
          >
            SLA: {fmt(a.minutosRestantesSLA)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Estado de servicios item ─────────────────────────────────────────────────
function ServicioItem({ s, onClick }) {
  const estadoColor = {
    Operando: "#4cc9a6",
    Intermitencia: "#fab387",
    Caído: "#f38ba8",
    Mantenimiento: "#cba6f7",
  };
  const estadoIcon = {
    Operando: "ti-circle-check",
    Intermitencia: "ti-alert-triangle",
    Caído: "ti-circle-x",
    Mantenimiento: "ti-tool",
  };
  const color = estadoColor[s.estado] || "#cdd6f4";
  const icon = estadoIcon[s.estado] || "ti-circle";

  return (
    <div
      onClick={s.incidenciasActivas > 0 ? onClick : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 12px",
        borderRadius: 8,
        background: "var(--bg-elevated)",
        cursor: s.incidenciasActivas > 0 ? "pointer" : "default",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        s.incidenciasActivas > 0 &&
        (e.currentTarget.style.background = "var(--bg-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--bg-elevated)")
      }
    >
      <i
        className={`ti ${icon}`}
        style={{ fontSize: 16, color, flexShrink: 0 }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: "var(--text-h)",
          fontWeight: 500,
        }}
      >
        {s.nombreServicio}
      </span>
      <span style={{ fontSize: 12, color, fontWeight: 600 }}>{s.estado}</span>
      {s.incidenciasActivas > 0 && (
        <span
          style={{
            fontSize: 11,
            color: "#f38ba8",
            background: "#f38ba820",
            borderRadius: 5,
            padding: "2px 7px",
            marginLeft: 4,
          }}
        >
          {s.incidenciasActivas}{" "}
          {s.criticasActivas > 0 ? `· ${s.criticasActivas} crít.` : ""}
        </span>
      )}
    </div>
  );
}

// ─── Barra horizontal ─────────────────────────────────────────────────────────
function BarraH({ label, value, max, color = "var(--primary)", delta: d }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr 48px",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={label}
      >
        {label}
      </span>
      <div
        style={{
          background: "var(--bg-elevated)",
          borderRadius: 4,
          height: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: 4,
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          justifyContent: "flex-end",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-h)" }}>
          {value}
        </span>
        {d !== null && d !== undefined && (
          <span style={{ fontSize: 10, color: d > 0 ? "#f38ba8" : "#4cc9a6" }}>
            {d > 0 ? "↑" : "↓"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Panel card wrapper ───────────────────────────────────────────────────────
function Panel({ title, icon, children, action, style = {}, headerColor }) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
          background: headerColor ? `${headerColor}08` : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && (
            <i
              className={`ti ${icon}`}
              style={{
                fontSize: 15,
                color: headerColor || "var(--text-muted)",
              }}
            />
          )}
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: "var(--text-muted)",
            }}
          >
            {title}
          </span>
        </div>
        {action}
      </div>
      <div
        style={{
          padding: 14,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── SLA Ring ────────────────────────────────────────────────────────────────
function SLARing({ pct }) {
  const r = 36,
    circ = 2 * Math.PI * r;
  const dash = ((pct ?? 0) / 100) * circ;
  const color = pct >= 90 ? "#4cc9a6" : pct >= 75 ? "#fab387" : "#f38ba8";
  return (
    <svg width={90} height={90}>
      <circle
        cx={45}
        cy={45}
        r={r}
        fill="none"
        stroke="var(--bg-elevated)"
        strokeWidth={8}
      />
      <circle
        cx={45}
        cy={45}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 45 45)"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text
        x={45}
        y={49}
        textAnchor="middle"
        fontSize={16}
        fontWeight={700}
        fill={color}
      >
        {pct ?? "—"}%
      </text>
    </svg>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function VisorEjecutivoPage() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState("30");
  const [sitio, setSitio] = useState("");
  const [tab, setTab] = useState("sitio"); // sitio | area
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const [resumen, setResumen] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [tendencia, setTendencia] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [dist, setDist] = useState(null);
  const [recurrentes, setRecurrentes] = useState([]);
  const [equipo, setEquipo] = useState(null);
  const [sla, setSla] = useState([]);
  const [alertasExpanded, setAlertasExpanded] = useState(false);

  const intervalRef = useRef(null);

  const cargar = useCallback(async () => {
    const q = `?periodo=${periodo}${sitio ? `&sitio=${sitio}` : ""}`;
    try {
      const [r, al, tr, sv, di, rc, eq, sl] = await Promise.all([
        apiFetch(`/ejecutivo/resumen${q}`),
        apiFetch(`/ejecutivo/alertas${sitio ? `?sitio=${sitio}` : ""}`),
        apiFetch(`/ejecutivo/tendencia${q}`),
        apiFetch("/ejecutivo/servicios"),
        apiFetch(`/ejecutivo/distribucion${q}`),
        apiFetch(`/ejecutivo/recurrentes${q}`),
        apiFetch("/ejecutivo/equipo"),
        apiFetch(`/ejecutivo/sla${q}`),
      ]);
      if (r?.ok) setResumen(r.data);
      if (al?.ok) setAlertas(al.data);
      if (tr?.ok) setTendencia(tr.data);
      if (sv?.ok) setServicios(sv.data);
      if (di?.ok) setDist(di.data);
      if (rc?.ok) setRecurrentes(rc.data);
      if (eq?.ok) setEquipo(eq.data);
      if (sl?.ok) setSla(sl.data);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }, [periodo, sitio]);

  useEffect(() => {
    setLoading(true);
    cargar();
    intervalRef.current = setInterval(cargar, 5 * 60 * 1000);
    return () => clearInterval(intervalRef.current);
  }, [cargar]);

  const maxDist = (arr) =>
    arr?.length ? Math.max(...arr.map((a) => a.total)) : 1;

  const alertasVisibles = alertasExpanded ? alertas : alertas.slice(0, 5);
  const hayCriticas = alertas.some(
    (a) => a.tipo === "critica" || a.tipo === "vencida",
  );

  const irATickets = (filtro = "") =>
    navigate(`/atencion-incidencias${filtro}`);

  // ─── Sitios conocidos para filtro
  const SITIOS = ["", "PFV", "IAFSA", "FDNC", "CEDIS"];

  return (
    <div
      style={{
        padding: "20px 24px",
        maxWidth: 1400,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* ── Animación shimmer ─────────────────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .visor-periodo-btn {
          padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
          border: 1px solid var(--border); cursor: pointer; transition: all 0.15s;
          background: var(--bg-elevated); color: var(--text-muted);
        }
        .visor-periodo-btn.active {
          background: var(--primary); color: #0f1117; border-color: var(--primary);
        }
        .visor-sitio-btn {
          padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
          border: 1px solid var(--border); cursor: pointer; transition: all 0.15s;
          background: var(--bg-elevated); color: var(--text-muted);
        }
        .visor-sitio-btn.active {
          background: var(--secondary); color: #fff; border-color: var(--secondary);
        }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════════
          ENCABEZADO
      ═══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-h)",
              margin: 0,
            }}
          >
            Panel de Operación TI
          </h1>
          <div
            style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 4 }}
          >
            {lastUpdate ? (
              <>
                Actualizado{" "}
                {lastUpdate.toLocaleTimeString("es-MX", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                ·{" "}
                <span
                  style={{ cursor: "pointer", color: "var(--primary)" }}
                  onClick={cargar}
                >
                  Actualizar ahora
                </span>
              </>
            ) : (
              "Cargando datos..."
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          {/* Periodo */}
          <div style={{ display: "flex", gap: 4 }}>
            {[
              ["1", "Hoy"],
              ["7", "7d"],
              ["30", "30d"],
              ["90", "3m"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={`visor-periodo-btn${periodo === v ? " active" : ""}`}
                onClick={() => setPeriodo(v)}
              >
                {l}
              </button>
            ))}
          </div>
          {/* Sitio */}
          <div style={{ display: "flex", gap: 4 }}>
            {SITIOS.map((s) => (
              <button
                key={s || "todos"}
                className={`visor-sitio-btn${sitio === s ? " active" : ""}`}
                onClick={() => setSitio(s)}
              >
                {s || "Todos"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          KPIs
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <KpiCard
          label="Abiertas"
          icon="ti-ticket"
          color="#7c8cf8"
          value={resumen?.abiertas}
          delta={resumen?.deltas?.abiertas}
          loading={loading}
          accentBad
        />
        <KpiCard
          label="Críticas"
          icon="ti-alert-octagon"
          color="#f38ba8"
          value={resumen?.criticas}
          delta={resumen?.deltas?.criticas}
          loading={loading}
          accentBad
        />
        <KpiCard
          label="En proceso"
          icon="ti-loader"
          color="#fab387"
          value={resumen?.enProceso}
          loading={loading}
        />
        <KpiCard
          label="Fuera de SLA"
          icon="ti-clock-x"
          color="#f38ba8"
          value={resumen?.fueraSLA}
          delta={resumen?.deltas?.fueraSLA}
          loading={loading}
          accentBad
        />
        <KpiCard
          label="Resueltas"
          icon="ti-circle-check"
          color="#4cc9a6"
          value={resumen?.resueltas}
          loading={loading}
        />
        <KpiCard
          label="Cumpl. SLA"
          icon="ti-shield-check"
          color="#4cc9a6"
          value={resumen?.pctSLA != null ? `${resumen.pctSLA}%` : "—"}
          loading={loading}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          FILA PRINCIPAL — Alertas + Servicios
      ═══════════════════════════════════════════════════════════════ */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}
      >
        {/* ── Alertas ── */}
        <Panel
          title="Requieren atención"
          icon="ti-alert-triangle"
          headerColor={hayCriticas ? "#f38ba8" : "#fab387"}
          action={
            <button
              onClick={() => irATickets("?prioridad=critica")}
              style={{
                fontSize: 11,
                color: "var(--primary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Ver todas →
            </button>
          }
        >
          {loading ? (
            [1, 2, 3, 4].map((i) => <Skeleton key={i} h={56} radius={8} />)
          ) : alertas.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: "var(--text-faint)",
                fontSize: 13,
              }}
            >
              <i
                className="ti ti-circle-check"
                style={{
                  fontSize: 32,
                  display: "block",
                  marginBottom: 8,
                  color: "#4cc9a6",
                }}
              />
              Sin alertas activas
            </div>
          ) : (
            <>
              {alertasVisibles.map((a) => (
                <AlertaItem
                  key={a.idSolicitud}
                  a={a}
                  onClick={() =>
                    navigate(`/atencion-incidencias?folio=${a.folio}`)
                  }
                />
              ))}
              {alertas.length > 5 && (
                <button
                  onClick={() => setAlertasExpanded((x) => !x)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--text-muted)",
                    fontSize: 12,
                    padding: "6px",
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  {alertasExpanded
                    ? "Ver menos ↑"
                    : `Ver ${alertas.length - 5} más ↓`}
                </button>
              )}
            </>
          )}
        </Panel>

        {/* ── Estado de servicios ── */}
        <Panel title="Estado de servicios" icon="ti-server">
          {loading ? (
            [1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} h={36} radius={8} />
            ))
          ) : servicios.length === 0 ? (
            <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
              Sin servicios configurados
            </span>
          ) : (
            servicios.map((s) => (
              <ServicioItem
                key={s.idServicio}
                s={s}
                onClick={() =>
                  navigate(`/atencion-incidencias?servicio=${s.idServicio}`)
                }
              />
            ))
          )}
          {/* Leyenda */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 4,
              paddingTop: 8,
              borderTop: "1px solid var(--border)",
            }}
          >
            {[
              ["#4cc9a6", "Operando"],
              ["#fab387", "Intermitencia"],
              ["#f38ba8", "Caído"],
            ].map(([c, l]) => (
              <div
                key={l}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: c,
                  }}
                />
                <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
                  {l}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          FILA SECUNDARIA — Tendencia + Distribución + Servicios
      ═══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr 1fr",
          gap: 14,
        }}
      >
        {/* ── Tendencia ── */}
        <Panel title="Tendencia de incidencias" icon="ti-chart-line">
          {loading ? (
            <Skeleton h={100} radius={4} />
          ) : (
            <>
              <TendenciaChart data={tendencia} />
              {resumen && (
                <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Periodo actual
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "var(--text-h)",
                      }}
                    >
                      {resumen.total}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      vs. anterior
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: resumen.deltas.total > 0 ? "#f38ba8" : "#4cc9a6",
                      }}
                    >
                      {resumen.deltas.total > 0 ? "↑" : "↓"}{" "}
                      {Math.abs(resumen.deltas.total)}%
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>

        {/* ── Distribución por prioridad ── */}
        <Panel title="Por prioridad" icon="ti-flag">
          {loading
            ? [1, 2, 3, 4].map((i) => <Skeleton key={i} h={20} />)
            : dist?.prioridad?.map((p) => (
                <BarraH
                  key={p.prioridad}
                  label={p.prioridad}
                  value={p.total}
                  max={maxDist(dist.prioridad)}
                  color={`#${p.colorHex?.replace("#", "") || "7c8cf8"}`}
                />
              ))}
        </Panel>

        {/* ── Sitio / Área toggle ── */}
        <Panel
          title={tab === "sitio" ? "Por sitio" : "Por área"}
          icon={tab === "sitio" ? "ti-building-factory" : "ti-users"}
          action={
            <div style={{ display: "flex", gap: 4 }}>
              {["sitio", "area"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 5,
                    border: "1px solid var(--border)",
                    background:
                      tab === t ? "var(--secondary)" : "var(--bg-elevated)",
                    color: tab === t ? "#fff" : "var(--text-faint)",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {t === "sitio" ? "Sitio" : "Área"}
                </button>
              ))}
            </div>
          }
        >
          {loading
            ? [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={20} />)
            : (tab === "sitio" ? dist?.sitio : dist?.area)?.map((item, i) => (
                <BarraH
                  key={i}
                  label={tab === "sitio" ? item.sitio : item.area}
                  value={item.total}
                  max={maxDist(tab === "sitio" ? dist?.sitio : dist?.area)}
                  color="var(--secondary)"
                />
              ))}
        </Panel>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          FILA INFERIOR — Servicios recurrentes + Equipo + SLA
      ═══════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 0.8fr",
          gap: 14,
        }}
      >
        {/* ── Servicios con más incidencias ── */}
        <Panel
          title="Servicios con más incidencias"
          icon="ti-apps"
          action={
            <span style={{ fontSize: 10, color: "var(--text-faint)" }}>
              ↑ subió · ↓ bajó vs. periodo ant.
            </span>
          }
        >
          {loading ? (
            [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={28} />)
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recurrentes.map((r, i) => (
                <div
                  key={r.idServicio}
                  onClick={() =>
                    navigate(`/atencion-incidencias?servicio=${r.idServicio}`)
                  }
                  style={{
                    display: "grid",
                    gridTemplateColumns: "20px 1fr auto auto",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 10px",
                    borderRadius: 8,
                    background: "var(--bg-elevated)",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "var(--bg-elevated)")
                  }
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-faint)",
                      fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-h)",
                      }}
                    >
                      {r.servicio}
                    </div>
                    {r.activas > 0 && (
                      <div style={{ fontSize: 11, color: "#fab387" }}>
                        {r.activas} activas ahora
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--text-h)",
                    }}
                  >
                    {r.total}
                  </span>
                  {r.delta !== null && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: r.delta > 0 ? "#f38ba8" : "#4cc9a6",
                        width: 40,
                        textAlign: "right",
                      }}
                    >
                      {r.delta > 0 ? "↑" : "↓"}
                      {Math.abs(r.delta)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* ── Carga del equipo ── */}
        <Panel title="Carga del equipo" icon="ti-users-group">
          {loading ? (
            [1, 2, 3].map((i) => <Skeleton key={i} h={36} />)
          ) : (
            <>
              {equipo?.sinAsignar > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: "#f38ba815",
                    border: "1px solid #f38ba830",
                  }}
                >
                  <span
                    style={{ fontSize: 12, color: "#f38ba8", fontWeight: 600 }}
                  >
                    <i className="ti ti-user-x" style={{ marginRight: 6 }} />
                    Sin asignar
                  </span>
                  <span
                    style={{ fontSize: 15, fontWeight: 700, color: "#f38ba8" }}
                  >
                    {equipo.sinAsignar}
                  </span>
                </div>
              )}
              {equipo?.tecnicos?.map((t) => {
                const max = Math.max(
                  ...equipo.tecnicos.map((x) => x.activas),
                  1,
                );
                const pct = (t.activas / max) * 100;
                return (
                  <div
                    key={t.login}
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-muted)",
                          fontWeight: 500,
                        }}
                      >
                        {t.nombre || t.login}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        {t.criticas > 0 && (
                          <span style={{ fontSize: 10, color: "#f38ba8" }}>
                            {t.criticas} crít.
                          </span>
                        )}
                        {t.fueraSLA > 0 && (
                          <span style={{ fontSize: 10, color: "#fab387" }}>
                            {t.fueraSLA} SLA
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "var(--text-h)",
                          }}
                        >
                          {t.activas}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        background: "var(--bg-elevated)",
                        borderRadius: 4,
                        height: 5,
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: "var(--secondary)",
                          borderRadius: 4,
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </Panel>

        {/* ── SLA ── */}
        <Panel title="Cumplimiento SLA" icon="ti-shield-check">
          {loading ? (
            <Skeleton h={90} w={90} radius={50} style={{ margin: "0 auto" }} />
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <SLARing pct={resumen?.pctSLA} />
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {sla.slice(0, 4).map((s) => (
                  <div
                    key={s.servicio}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 11,
                      padding: "4px 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 100,
                      }}
                    >
                      {s.servicio}
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      {s.fueraSLA > 0 && (
                        <span style={{ color: "#f38ba8", fontWeight: 600 }}>
                          {s.fueraSLA} fuera
                        </span>
                      )}
                      <span style={{ color: "#4cc9a6", fontWeight: 600 }}>
                        {s.dentroSLA} ok
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-faint)",
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                Basado en tickets cerrados con SLA definido
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* Footer */}
      <div
        style={{
          fontSize: 10,
          color: "var(--text-faint)",
          textAlign: "center",
          paddingTop: 4,
        }}
      >
        Los datos se actualizan automáticamente cada 5 minutos
      </div>
    </div>
  );
}
