// pages/sit/components/EmpresaBadge.jsx
// Props: empresa ('IAFSA' | 'FDNC'). IAFSA en azul, FDNC en verde.
import "./EmpresaBadge.css";

export default function EmpresaBadge({ empresa }) {
  const clase = empresa === "FDNC" ? "fdnc" : empresa === "IAFSA" ? "iafsa" : "otra";
  return <span className={`sit-empresa sit-empresa--${clase}`}>{empresa || "—"}</span>;
}
