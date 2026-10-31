// pages/sit/components/EstadoValidacion.jsx
// Props: estado (1=OK | 2=Parcial | 3=No corresponde | null=Sin validar)
import { VALIDACION } from "../sitApi";

export default function EstadoValidacion({ estado }) {
  const v = VALIDACION[estado];
  if (!v) {
    return (
      <span className="sit-val sit-val--pendiente">
        <i className="ti ti-clock" /> Sin validar
      </span>
    );
  }
  return (
    <span className={`sit-val sit-val--${v.tono}`}>
      <i className={`ti ${v.icon}`} /> {v.label}
    </span>
  );
}
