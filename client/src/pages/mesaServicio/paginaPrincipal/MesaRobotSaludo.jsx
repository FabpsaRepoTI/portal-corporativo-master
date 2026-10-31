// pages/mesaServicio/paginaPrincipal/MesaRobotSaludo.jsx
// Robot del recuadro de ayuda de la Mesa de Servicio: saluda al entrar y
// hace un gesto distinto cada vez que cambia su mensaje.
//
// Solo existe una imagen del personaje (fabi.png), así que el
// robot está "articulado" a partir de ella (ver MesaRobot.css): cabeza,
// brazo y mano son la misma imagen recortada que gira en su articulación
// real (cuello, hombro, muñeca). No se dibujan partes nuevas.
//
// - Los mensajes se apilan en la misma celda y solo cambia su opacidad: el
//   globo conserva siempre su tamaño (nada salta en la página).
// - Estado y temporizadores propios: escribir en el buscador (estado del
//   padre) no reinicia la secuencia. Todo se limpia al desmontar.
// - Se pausa con la pestaña oculta o con el cursor sobre el globo.
import { useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../../../context/AuthContext";
import "./MesaRobot.css";
import { esTemporadaDiaMuertos } from "../../../utils/temporada";
import { CatrinCabeza, CatrinCuerpo, CatrinCapa } from "./DisfrazCatrin";

// Disfraz de temporada (Día de Muertos): Fabi de catrín (DisfrazCatrin.jsx)

// El primero es la presentación de Fabi: se muestra una vez al entrar;
// después la secuencia alterna los demás.
const MENSAJES = [
  { titulo: "¡Hola! Soy Fab-i", texto: "Soy Fab-i, tu asistente inteligente en FABPSA.", gesto: "presenta" },
  { titulo: "¿Tienes dudas?", texto: "Te ayudo a encontrar la opción correcta.", gesto: "atencion" },
  { titulo: "¡Estoy aquí para ayudarte!", texto: "Escribe lo que necesitas en el buscador.", gesto: "saluda" },
  { titulo: "Cuéntame qué necesitas", texto: "y buscamos juntos la mejor opción.", gesto: "curioso" },
  { titulo: "Usa el buscador", texto: "Escribe tu duda y te llevo a la categoría.", gesto: "mira" },
];
const DURACION_MENSAJE_MS = 4500;
const DURACION_PRESENTACION_MS = 6000; // el saludo con el nombre se queda más tiempo
const DURACION_GESTO_MS = { presenta: 2400, saluda: 2200, atencion: 1500, curioso: 1700, asiente: 800, mira: 1600 };
// Parpadeo: cada 2.5–5.5 s, independiente de los mensajes
const parpadeoMs = () => 2500 + Math.random() * 3000;

export default function MesaRobotSaludo({ robot, soloPresentacion = false, disfraz = esTemporadaDiaMuertos() }) {
  const { user } = useContext(AuthContext) || {};
  const nombre = user?.name?.trim().split(/\s+/)[0] || "";
  const [actual, setActual] = useState(0);
  const [texto, setTexto] = useState("si"); // si | saliendo | no
  const [gesto, setGesto] = useState("presenta"); // al entrar: se presenta
  const [parpadeo, setParpadeo] = useState(false);
  const pausado = useRef(false);
  const finGesto = useRef(null);

  const hacerGesto = (g) => {
    clearTimeout(finGesto.current);
    setGesto(g);
    finGesto.current = setTimeout(() => setGesto("reposo"), DURACION_GESTO_MS[g] || 2000);
  };

  useEffect(() => {
    hacerGesto("presenta");
    let tTexto2;
    const tTexto = soloPresentacion
      ? setTimeout(() => {
          setTexto("saliendo");
          tTexto2 = setTimeout(() => setTexto("no"), 400);
        }, DURACION_PRESENTACION_MS)
      : null;
    let id;
    const arranque = setTimeout(() => { id = setInterval(() => {
      if (pausado.current || document.visibilityState !== "visible") return;
      setActual((i) => {
        // La presentación (0) no se repite: el ciclo va de 1 al final
        const siguiente = i + 1 < MENSAJES.length ? i + 1 : 1;
        hacerGesto(MENSAJES[siguiente].gesto);
        return siguiente;
      });
    }, DURACION_MENSAJE_MS); }, DURACION_PRESENTACION_MS - DURACION_MENSAJE_MS);
    // Gesto corto a mitad de cada mensaje para que no se quede quieto
    let medio;
    const desfase = setTimeout(() => {
      medio = setInterval(() => {
        if (!pausado.current && document.visibilityState === "visible") hacerGesto("asiente");
      }, DURACION_MENSAJE_MS);
    }, DURACION_MENSAJE_MS / 2 + 400);
    // Parpadeo natural
    let tParpadeo;
    const parpadear = () => {
      tParpadeo = setTimeout(() => {
        setParpadeo(true);
        tParpadeo = setTimeout(() => {
          setParpadeo(false);
          parpadear();
        }, 220);
      }, parpadeoMs());
    };
    parpadear();
    return () => {
      clearTimeout(tTexto);
      clearTimeout(tTexto2);
      clearTimeout(arranque);
      clearInterval(id);
      clearTimeout(tParpadeo);
      clearTimeout(desfase);
      clearInterval(medio);
      clearTimeout(finGesto.current);
    };
  }, []);

  return (
    <>
      <div className="mesa-robot" aria-hidden="true">
        <div className="mrb" data-gesto={gesto} data-parpadeo={parpadeo ? "si" : "no"} style={{ "--mrb-src": `url(${robot})` }}>
          {disfraz && <div className="mrb__traje-fondo"><CatrinCapa /></div>}
          <div className="mrb__brazo">
            <div className="mrb__capa mrb__mano" />
            <div className="mrb__capa mrb__antebrazo" />
          </div>
          <div className="mrb__capa mrb__cabeza">
            {disfraz && <CatrinCabeza />}
            <div className="mrb__ojos" />
            <div className="mrb__parpado mrb__parpado--izq" />
            <div className="mrb__parpado mrb__parpado--der" />
          </div>
          <div className="mrb__capa mrb__cuerpo">{disfraz && <CatrinCuerpo />}</div>
        </div>
      </div>
      {texto !== "no" && (
      <div
        className={`mesa-speech mesa-speech--secuencia${texto === "saliendo" ? " is-saliendo" : ""}`}
        onMouseEnter={() => (pausado.current = true)}
        onMouseLeave={() => (pausado.current = false)}
      >
        {MENSAJES.map((m, i) => (
          <div
            key={m.titulo}
            className={`mesa-speech__msg${i === actual ? " is-activo" : ""}`}
            aria-hidden={i !== actual}
            aria-live={i === actual ? "polite" : undefined}
          >
            <b>{i === 0 && nombre ? `¡Hola, ${nombre}!` : m.titulo}</b>
            <span>{m.texto}</span>
          </div>
        ))}
      </div>
      )}
    </>
  );
}
