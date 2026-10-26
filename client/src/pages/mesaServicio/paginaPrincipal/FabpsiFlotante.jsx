// pages/mesaServicio/paginaPrincipal/FabpsiFlotante.jsx
// Fabi fuera de la Mesa de Servicio (Inicio): se presenta con su globo,
// sigue con sus gestos, abre su chat (MesaAsistente) al hacer clic y se puede
// arrastrar a cualquier parte de la pantalla.
// - Arrastrar vs. clic: si el puntero se mueve más de 6 px es arrastre.
// - La posición se guarda por navegador (localStorage, como fracción de la
//   ventana para que sobreviva a cambios de tamaño). Doble clic: vuelve a su
//   lugar en el encabezado.
// - Funciona con mouse, touch y lápiz (Pointer Events), y con teclado
//   (Enter / Espacio abre el chat).
import { useEffect, useRef, useState } from "react";
import MesaRobotSaludo from "./MesaRobotSaludo";
import MesaAsistente from "./MesaAsistente";
import "./MesaRobot.css";

const CLAVE = "fabpsi-posicion";
const UMBRAL_ARRASTRE = 6;

function leerPosicion() {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) || "null");
    return p && typeof p.x === "number" && typeof p.y === "number" ? p : null;
  } catch {
    return null;
  }
}
function guardarPosicion(p) {
  try {
    if (p) localStorage.setItem(CLAVE, JSON.stringify(p));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: la posición dura solo esta visita */
  }
}

export default function FabpsiFlotante({ robot }) {
  const [pos, setPos] = useState(leerPosicion); // { x, y } en fracción de la ventana, o null = en su lugar
  const [arrastrando, setArrastrando] = useState(false);
  const [chat, setChat] = useState(false);
  const caja = useRef(null);
  const gesto = useRef(null); // { inicioX, inicioY, offX, offY, movido }
  const tClic = useRef(null); // espera para distinguir clic de doble clic

  useEffect(() => () => clearTimeout(tClic.current), []);

  // Mantiene el robot dentro de la ventana si cambia de tamaño
  useEffect(() => {
    const ajustar = () => setPos((p) => (p ? { x: Math.min(Math.max(p.x, 0), 0.95), y: Math.min(Math.max(p.y, 0), 0.92) } : p));
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, []);

  const alPresionar = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const r = caja.current.getBoundingClientRect();
    gesto.current = { inicioX: e.clientX, inicioY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, ancho: r.width, alto: r.height, movido: false };
    caja.current.setPointerCapture?.(e.pointerId);
  };

  const alMover = (e) => {
    const g = gesto.current;
    if (!g) return;
    if (!g.movido && Math.hypot(e.clientX - g.inicioX, e.clientY - g.inicioY) < UMBRAL_ARRASTRE) return;
    g.movido = true;
    setArrastrando(true);
    const x = Math.min(Math.max(e.clientX - g.offX, 0), window.innerWidth - g.ancho);
    const y = Math.min(Math.max(e.clientY - g.offY, 0), window.innerHeight - g.alto);
    setPos({ x: x / window.innerWidth, y: y / window.innerHeight });
  };

  const alSoltar = () => {
    const g = gesto.current;
    gesto.current = null;
    setArrastrando(false);
    if (!g) return;
    if (g.movido) setPos((p) => (guardarPosicion(p), p));
    // Fue un clic. Suelto en la pantalla, espera un instante por si es doble
    // clic (que lo regresa a su lugar); en el encabezado abre el chat de inmediato.
    else if (pos) tClic.current = setTimeout(() => setChat(true), 250);
    else setChat(true);
  };

  const volverASuLugar = () => {
    clearTimeout(tClic.current);
    guardarPosicion(null);
    setPos(null);
  };

  const flotando = !!pos;
  return (
    <>
      <div
        ref={caja}
        className={`fabpsi${flotando ? " fabpsi--flotando" : ""}${arrastrando ? " is-arrastrando" : ""}`}
        style={flotando ? { left: `${pos.x * 100}vw`, top: `${pos.y * 100}vh` } : undefined}
        role="button"
        tabIndex={0}
        aria-label="Fab-i, tu asistente inteligente en FABPSA. Abrir chat"
        title="Haz clic para platicar con Fab-i · Arrástralo para moverlo · Doble clic lo regresa a su lugar"
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={() => {
          gesto.current = null;
          setArrastrando(false);
        }}
        onDoubleClick={volverASuLugar}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setChat(true);
          }
        }}
      >
        <MesaRobotSaludo robot={robot} soloPresentacion />
      </div>
      {chat && <MesaAsistente onClose={() => setChat(false)} />}
    </>
  );
}
