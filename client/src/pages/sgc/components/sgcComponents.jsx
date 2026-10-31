// pages/sgc/components/sgcComponents.jsx
// Componentes visuales reutilizables del módulo SGI.
// Paleta: #07071a / #0f0f2e / #16163d · acento #8b5cf6 · cian #22d3ee

/** Encabezado de página: título, descripción y slot de acciones */
export function SGCPageHeader({ kicker, titulo, desc, acciones, separador = true }) {
  return (
    <div className="sgc-ph">
      {kicker && <p className="sgc-ph__kicker">{kicker}</p>}
      <div className="sgc-ph__fila">
        <div>
          <h1 className="sgc-ph__titulo">{titulo}</h1>
          {desc && <p className="sgc-ph__desc">{desc}</p>}
        </div>
        {acciones && <div className="sgc-ph__acciones">{acciones}</div>}
      </div>
      {separador && <div className="sgc-ph__sep" aria-hidden="true" />}
    </div>
  );
}

/** Card con fondo superficie SGI, borde violeta sutil y hover elevado */
export function SGCCard({ children, className = "", onClick, style }) {
  return (
    <div
      className={`sgc-card${onClick ? " sgc-card--clic" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      style={style}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick(e) : undefined}
    >
      {children}
    </div>
  );
}

/** Tabla SGI: encabezados uppercase + filas con hover violeta sutil */
export function SGCTable({ cols, children, className = "" }) {
  return (
    <div className={`sgc-tbl-wrap${className ? ` ${className}` : ""}`}>
      <table className="sgc-tbl">
        {cols && (
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={i} className={c.cls || ""}>{c.label}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const BADGE_PALETA = {
  abierta:      { bg: "rgba(234,179,8,0.12)",   borde: "rgba(234,179,8,0.28)",   color: "#eab308" },
  cerrada:      { bg: "rgba(34,197,94,0.12)",   borde: "rgba(34,197,94,0.28)",   color: "#22c55e" },
  vencida:      { bg: "rgba(239,68,68,0.12)",   borde: "rgba(239,68,68,0.28)",   color: "#ef4444" },
  proceso:      { bg: "rgba(34,211,238,0.12)",  borde: "rgba(34,211,238,0.28)",  color: "#22d3ee" },
  coordinador:  { bg: "rgba(139,92,246,0.14)",  borde: "rgba(139,92,246,0.3)",   color: "#c4b5fd" },
  auditor:      { bg: "rgba(34,211,238,0.12)",  borde: "rgba(34,211,238,0.28)",  color: "#67e8f9" },
  responsable:  { bg: "rgba(34,197,94,0.12)",   borde: "rgba(34,197,94,0.28)",   color: "#4ade80" },
  direccion:    { bg: "rgba(234,179,8,0.12)",   borde: "rgba(234,179,8,0.28)",   color: "#fbbf24" },
  info:         { bg: "rgba(59,130,246,0.12)",  borde: "rgba(59,130,246,0.28)",  color: "#60a5fa" },
  neutral:      { bg: "rgba(100,116,139,0.12)", borde: "rgba(100,116,139,0.28)", color: "#94a3b8" },
};

/**
 * Badge semitransparente SGI.
 * color: clave de BADGE_PALETA o string CSS directo.
 */
export function SGCBadge({ color = "neutral", label, icono, children }) {
  const p = BADGE_PALETA[color] || { bg: "rgba(100,116,139,0.12)", borde: "rgba(100,116,139,0.28)", color: "#94a3b8" };
  return (
    <span
      className="sgc-badge"
      style={{ background: p.bg, border: `1px solid ${p.borde}`, color: p.color }}
    >
      {icono && <i className={`ti ${icono}`} aria-hidden="true" />}
      {label ?? children}
    </span>
  );
}

/**
 * Estado vacío del SGI.
 * icono: clase Tabler (ej. "ti-shield-lock")
 */
export function SGCEmptyState({ icono = "ti-inbox", titulo, desc, accion }) {
  return (
    <div className="sgc-empty">
      <span className="sgc-empty__icono" aria-hidden="true">
        <i className={`ti ${icono}`} />
      </span>
      {titulo && <p className="sgc-empty__titulo">{titulo}</p>}
      {desc && <p className="sgc-empty__desc">{desc}</p>}
      {accion && <div className="sgc-empty__accion">{accion}</div>}
    </div>
  );
}
