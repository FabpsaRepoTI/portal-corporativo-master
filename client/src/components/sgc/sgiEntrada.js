// components/sgc/sgiEntrada.js
// Avance REAL de la entrada al SGI, para la transición (SGITransition):
//   acceso   → verificando el rol del usuario (/api/sgc/mi-rol)
//   modulo   → rol confirmado; cargando la pantalla (código bajo demanda)
//   datos    → pantalla cargada; esperando sus datos principales (centro de control)
//   listo    → todo lo necesario está en pantalla (también si hubo un error:
//              la transición se retira para que el error se vea)
import { useEffect } from "react";

export const FASES = ["acceso", "modulo", "datos", "listo"];

// Los efectos de los hijos corren antes que los del padre: la transición lee
// la última fase al montarse (por si un aviso llegó antes de que escuchara).
let _fase = null;
export const faseActual = () => _fase;
export const reiniciarFases = () => {
  _fase = null;
};

export function avisarFase(fase) {
  // No se retrocede de fase (p. ej. un "datos" tardío después de "listo")
  if (_fase && FASES.indexOf(fase) < FASES.indexOf(_fase)) return;
  _fase = fase;
  window.dispatchEvent(new CustomEvent("sgi:fase", { detail: fase }));
}

/** Avisa "listo" en cuanto `listo` sea verdadero (una vez por montaje). */
export function useAvisarListo(listo) {
  useEffect(() => {
    if (listo) avisarFase("listo");
  }, [listo]);
}
