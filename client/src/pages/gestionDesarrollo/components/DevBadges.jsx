// client/src/pages/gestionDesarrollo/components/DevBadges.jsx
// Badges, barras de avance y chip de carga — usados en varias vistas

import "./DevBadges.css";

const ESTATUS_MAP = {
  1: { label: "En análisis",  color: "#7c8cf8" },
  2: { label: "En desarrollo",color: "#4cc9a6" },
  3: { label: "En pruebas",   color: "#f6c177" },
  4: { label: "En revisión",  color: "#f38ba8" },
  5: { label: "Liberado",     color: "#4cc9a6" },
  6: { label: "Cancelado",    color: "#94a3b8" },
  7: { label: "En pausa",     color: "#f6c177" },
};

const ETAPA_MAP = {
  1: "Análisis", 2: "Desarrollo", 3: "Revisión", 4: "Pruebas", 5: "Liberación",
};

const PRIORIDAD_MAP = {
  1: { label: "Alta",   color: "#f38ba8" },
  2: { label: "Media",  color: "#f6c177" },
  3: { label: "Baja",   color: "#94a3b8" },
};

const CARGA_MAP = {
  disponible:  { label: "Disponible",  color: "#4cc9a6" },
  adecuada:    { label: "Adecuada",    color: "#4cc9a6" },
  alta:        { label: "Alta",        color: "#f6c177" },
  sobrecarga:  { label: "Sobrecarga",  color: "#f38ba8" },
  sin_datos:   { label: "Sin datos",   color: "#94a3b8" },
};

export function EstatusBadge({ id }) {
  const e = ESTATUS_MAP[id] ?? { label: "—", color: "#94a3b8" };
  return (
    <span className="dev-badge" style={{ "--badge-color": e.color }}>
      {e.label}
    </span>
  );
}

export function EtapaChip({ id }) {
  return (
    <span className="dev-chip">
      {ETAPA_MAP[id] ?? "—"}
    </span>
  );
}

export function PrioridadDot({ id }) {
  const p = PRIORIDAD_MAP[id] ?? { label: "—", color: "#94a3b8" };
  return (
    <span className="dev-prioridad" style={{ "--dot-color": p.color }}>
      <span className="dev-prioridad__dot" />
      {p.label}
    </span>
  );
}

export function AvanceBar({ pct = 0, esManual = false, size = "md" }) {
  const color = pct >= 80 ? "#4cc9a6" : pct >= 40 ? "#7c8cf8" : "#f6c177";
  return (
    <div className={`dev-avance dev-avance--${size}`}>
      <div className="dev-avance__track">
        <div
          className="dev-avance__fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="dev-avance__pct">
        {pct}%{esManual && <span className="dev-avance__manual" title="Avance manual">~</span>}
      </span>
    </div>
  );
}

export function CargaBar({ pct, clasificacion }) {
  const c = CARGA_MAP[clasificacion] ?? CARGA_MAP.sin_datos;
  return (
    <div className="dev-carga">
      <div className="dev-carga__track">
        <div
          className="dev-carga__fill"
          style={{ width: `${Math.min(pct ?? 0, 100)}%`, background: c.color }}
        />
      </div>
      <span className="dev-carga__label" style={{ color: c.color }}>
        {pct != null ? `${pct}%` : "—"} · {c.label}
      </span>
    </div>
  );
}

export function RiesgoChip({ enRiesgo, motivo }) {
  if (!enRiesgo) return null;
  return (
    <span className="dev-riesgo" title={motivo}>
      ⚠ En riesgo
    </span>
  );
}

export function FechaRelativa({ fecha }) {
  if (!fecha) return <span style={{ color: "var(--text-faint)" }}>—</span>;
  const d    = new Date(fecha);
  const hoy  = new Date();
  const dias = Math.ceil((d - hoy) / 86400000);
  const str  = d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

  let color = "var(--text-body)";
  if (dias < 0)      color = "var(--danger)";
  else if (dias <= 7) color = "var(--warning)";

  return <span style={{ color, fontSize: 12 }}>{str}</span>;
}
