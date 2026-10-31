// utils/temporada.js
// Temporada de Día de Muertos en el portal: del 15 de octubre al 3 de noviembre.
// Desactivada: el portal ya no usa temas de temporada.
export function esTemporadaDiaMuertos() {
  return false;
}
export function _esTemporadaDiaMuertosOriginal(d = new Date()) {
  const m = d.getMonth() + 1;
  const dia = d.getDate();
  return (m === 10 && dia >= 15) || (m === 11 && dia <= 3);
}
