// components/sgc/SGITransition.jsx
// Entrada al SGI: identidad FABPSA + SGI y una línea de progreso que sigue la
// carga REAL del módulo (sgiEntrada.js): acceso → módulo → datos → listo.
//   - El SGI se monta debajo desde el primer momento (carga en paralelo).
//   - La capa se retira cuando llega "listo" (también ante un error, para que se vea).
//   - Para que la identidad alcance a leerse, la capa dura al menos MIN_MS; no hay
//     esperas adicionales: si la carga tarda más, la línea sigue hasta terminar.
//   - Tope de seguridad TOPE_MS: nunca bloquea el módulo.
//   - Movimiento reducido (prefers-reduced-motion): sin animaciones de entrada.
// Se monta una vez por entrada al módulo (envuelve a SGCLayout): navegar dentro
// del SGI no la repite.
import { useEffect, useState } from "react";
import logoFabpsa from "../../assets/sgc/logo-fabpsa-sgi.png";
import { faseActual, reiniciarFases } from "./sgiEntrada";
import "./SGITransition.css";

const MIN_MS = 700;
// Primera entrada de la sesión del navegador: la transición completa se muestra ~4.5 s
const PRIMERA_MS = 4500;
const CLAVE_PRIMERA = "sgi_entrada_vista";
function esPrimeraEntrada() {
  try {
    return !sessionStorage.getItem(CLAVE_PRIMERA);
  } catch {
    return false;
  }
}
function marcarEntradaVista() {
  try {
    sessionStorage.setItem(CLAVE_PRIMERA, "1");
  } catch {
    /* almacenamiento no disponible */
  }
}
const SALIDA_MS = 480;
const TOPE_MS = 20000;
const TEXTO = {
  acceso: "Verificando tu acceso",
  modulo: "Cargando el módulo",
  datos: "Preparando el centro de control",
  listo: "Listo",
};
const AVANCE = { acceso: 22, modulo: 55, datos: 82, listo: 100 };
const FASES_ORDEN = ["acceso", "modulo", "datos", "listo"];
const movimientoReducido = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function SGITransition({ children }) {
  // Se reinicia ANTES de que los hijos ejecuten sus efectos (y avisen su avance)
  const [inicio] = useState(() => {
    reiniciarFases();
    return Date.now();
  });
  const [fase, setFase] = useState("acceso");
  const [estado, setEstado] = useState("visible"); // visible → saliendo → oculto
  const [entrando, setEntrando] = useState(false);
  const [primera] = useState(esPrimeraEntrada);
  const minimo = primera ? PRIMERA_MS : MIN_MS;
  // En la primera entrada la línea avanza con el tiempo, sin adelantarse a la carga real
  const [transcurrido, setTranscurrido] = useState(0);
  useEffect(() => {
    if (!primera) return undefined;
    const t = setInterval(() => setTranscurrido(Date.now() - inicio), 120);
    return () => clearInterval(t);
  }, [primera, inicio]);
  const avance = primera ? Math.min(AVANCE[fase], Math.round((100 * transcurrido) / PRIMERA_MS)) : AVANCE[fase];
  // Texto: la fase real, salvo que la línea aún no la alcance (entonces la fase que corresponde al avance)
  const faseVisible = primera ? FASES_ORDEN.find((f) => AVANCE[f] >= avance) || fase : fase;

  useEffect(() => {
    if (faseActual()) setFase(faseActual());
    const alAvisar = (e) => setFase(e.detail);
    window.addEventListener("sgi:fase", alAvisar);
    const tope = setTimeout(() => setFase("listo"), TOPE_MS);
    return () => {
      window.removeEventListener("sgi:fase", alAvisar);
      clearTimeout(tope);
    };
  }, []);

  // Listo → (mínimo de lectura) → salida → contenido entrando
  useEffect(() => {
    if (fase !== "listo" || estado !== "visible") return undefined;
    const reducido = movimientoReducido();
    const espera = reducido ? 0 : Math.max(0, minimo - (Date.now() - inicio));
    const t1 = setTimeout(() => {
      marcarEntradaVista();
      setEstado("saliendo");
      setEntrando(!reducido);
    }, espera);
    const t2 = setTimeout(() => setEstado("oculto"), espera + (reducido ? 120 : SALIDA_MS));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fase, estado, inicio, minimo]);

  // La animación de entrada del contenido se quita al terminar (no interfiere con el resto)
  useEffect(() => {
    if (!entrando) return undefined;
    const t = setTimeout(() => setEntrando(false), 1100);
    return () => clearTimeout(t);
  }, [entrando]);

  return (
    <>
      <div className={`sgi-contenido${entrando ? " is-entrando" : ""}`}>{children}</div>
      {estado !== "oculto" && (
        <div className={`sgi-entrada${estado === "saliendo" ? " is-saliendo" : ""}`} role="status" aria-live="polite" aria-label={`Abriendo SGI: ${TEXTO[faseVisible]}`}>
          <div className="sgi-entrada__luz" aria-hidden="true" />
          <div className="sgi-entrada__centro">
            <img className="sgi-entrada__logo" src={logoFabpsa} alt="FABPSA" width="480" height="451" />
            <div className="sgi-entrada__nombre">
              <span className="sgi-entrada__sgi">SGI</span>
              <span className="sgi-entrada__sub">Sistemas de Gestión Integral</span>
            </div>
            <div className="sgi-entrada__progreso" aria-hidden="true">
              <span className="sgi-entrada__barra" style={{ transform: `scaleX(${avance / 100})` }} />
            </div>
            <span className="sgi-entrada__fase" key={faseVisible}>{TEXTO[faseVisible]}{faseVisible !== "listo" ? "…" : ""}</span>
          </div>
          <span className="sgi-entrada__pie" aria-hidden="true">Calidad · Control · Mejora</span>
        </div>
      )}
    </>
  );
}
