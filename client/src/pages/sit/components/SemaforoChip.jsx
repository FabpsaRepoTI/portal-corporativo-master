// pages/sit/components/SemaforoChip.jsx
// Props: semaforo (1|2|3|null), diasRestantes (opcional)
import "./SemaforoChip.css";

const ESTADOS = {
  1: { clase: "verde", label: "Vigente" },
  2: { clase: "amarillo", label: "Por vencer" },
  3: { clase: "rojo", label: "Vencido" },
};

export default function SemaforoChip({ semaforo, diasRestantes }) {
  const estado = ESTADOS[semaforo] || { clase: "gris", label: "Sin fecha" };

  let detalle = null;
  if (diasRestantes != null && semaforo) {
    detalle =
      diasRestantes < 0
        ? `hace ${Math.abs(diasRestantes)} d`
        : diasRestantes === 0
          ? "hoy"
          : `${diasRestantes} d`;
  }

  return (
    <span className={`sit-semaforo sit-semaforo--${estado.clase}`}>
      <span className="sit-semaforo__dot" aria-hidden="true" />
      {estado.label}
      {detalle && <span className="sit-semaforo__dias">· {detalle}</span>}
    </span>
  );
}
