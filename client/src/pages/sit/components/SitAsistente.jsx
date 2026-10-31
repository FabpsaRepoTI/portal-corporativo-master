// pages/sit/components/SitAsistente.jsx
// Fabi · Información Técnica: asistente propio del SIT (independiente de Fabi
// de Mesa de Servicio). Botón flotante en las páginas del módulo + panel
// lateral de chat. Si se abre desde la ficha de un artículo, envía ese
// artículo como contexto (el servidor vuelve a validar acceso y planta).
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import robot from "../../../assets/fabi.png";
import {
  LaboratorioCabeza,
  LaboratorioCuerpo,
} from "../../mesaServicio/paginaPrincipal/TrajeLaboratorio";
import { sitApi } from "../sitApi";
import "./SitAsistente.css";

const SUGERENCIAS_GENERALES = [
  "¿Qué documentos vencen pronto?",
  "¿Qué documentos están vencidos?",
  "Buscar un artículo",
];
const SUGERENCIAS_ARTICULO = [
  "¿Qué documentos tiene este artículo?",
  "¿Quién es el contacto técnico del proveedor?",
  "¿Tiene algún documento vencido?",
];

/** Artículo en pantalla, a partir de la ruta /sit/articulos/:codigo?empresa=X */
function contextoDeRuta(location) {
  const m = location.pathname.match(/^\/sit\/articulos\/([^/]+)$/);
  if (!m) return null;
  const empresa = new URLSearchParams(location.search).get("empresa") || "";
  return { codigoArticulo: decodeURIComponent(m[1]), empresa };
}

export function FabiLaboratorio({ className = "" }) {
  return (
    <span className={"sit-fabi " + className} aria-hidden="true">
      <img src={robot} alt="" />
      <LaboratorioCuerpo />
      <LaboratorioCabeza />
    </span>
  );
}

/** Abre a Fabi desde cualquier página del SIT, opcionalmente con una pregunta ya enviada */
export function abrirFabiSit(pregunta = "") {
  window.dispatchEvent(new CustomEvent("sit-fabi:abrir", { detail: { pregunta } }));
}

export function SitAsistentePanel({ contexto, onClose, inicial = "" }) {
  const { user } = useContext(AuthContext);
  const nombre = user?.name?.trim().split(/\s+/)[0] || "";
  const navigate = useNavigate();
  const dialog = useRef(null),
    fin = useRef(null),
    vivo = useRef(true);
  const [mensajes, setMensajes] = useState([]);
  const [input, setInput] = useState("");
  const [pendiente, setPendiente] = useState("");
  const [error, setError] = useState("");
  const ocupado = Boolean(pendiente);

  useEffect(() => {
    vivo.current = true;
    const previo = document.activeElement;
    dialog.current?.querySelector("textarea")?.focus();
    const tecla = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", tecla);
    return () => {
      vivo.current = false;
      document.removeEventListener("keydown", tecla);
      previo?.focus?.();
    };
  }, [onClose]);
  // Pregunta con la que se abrió (botón "Preguntar a Fabi"); una sola vez
  const enviada = useRef(false);
  useEffect(() => {
    if (inicial && !enviada.current) {
      enviada.current = true;
      enviar(inicial);
    }
  }, []);
  useEffect(
    () => fin.current?.scrollIntoView({ block: "nearest" }),
    [mensajes, pendiente, error],
  );

  async function enviar(texto) {
    const content = String(texto || "").trim();
    if (ocupado || !content) return;
    const historial = [
      ...mensajes.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ].slice(-11);
    setPendiente(content);
    setInput("");
    setError("");
    try {
      const d = await sitApi("/asistente", {
        method: "POST",
        body: { messages: historial, contexto },
      });
      if (!vivo.current) return;
      setMensajes((p) => [
        ...p,
        { role: "user", content },
        {
          role: "assistant",
          content: d.respuesta,
          recomendacion: d.recomendacion,
        },
      ]);
    } catch (err) {
      if (!vivo.current) return;
      setInput(content);
      setError(
        err.status === 403
          ? "No tienes acceso al asistente del SIT."
          : "Fab-i no está disponible en este momento. Intenta de nuevo en un momento.",
      );
    } finally {
      if (vivo.current) setPendiente("");
    }
  }

  const sugerencias = contexto ? SUGERENCIAS_ARTICULO : SUGERENCIAS_GENERALES;

  return createPortal(
    <div
      className="sit-bot-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={dialog}
        className="sit-bot"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sit-bot-title"
      >
        <header className="sit-bot__head">
          <FabiLaboratorio className="sit-fabi--head" />
          <div>
            <h2 id="sit-bot-title">Fab-i · Información Técnica</h2>
            <p>Artículos, documentos técnicos y proveedores</p>
          </div>
          <button type="button" aria-label="Cerrar asistente" onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </header>

        {contexto && (
          <div className="sit-bot__contexto">
            <i className="ti ti-file-description" /> Consultando el artículo{" "}
            <strong>{contexto.codigoArticulo}</strong>
            {contexto.empresa ? ` · ${contexto.empresa}` : ""}
          </div>
        )}

        <div className="sit-bot__mensajes" role="log" aria-live="polite">
          <div className="sit-bot__bienvenida">
            <strong>Hola{nombre ? ", " + nombre : ""}.</strong>
            <p>
              Soy Fab-i, tu asistente inteligente en FABPSA. Pregúntame por
              fichas técnicas, documentos por vencer o proveedores de un
              artículo.
            </p>
            {mensajes.length === 0 && (
              <div className="sit-bot__chips">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      s === "Buscar un artículo"
                        ? setInput("Busca el artículo ")
                        : enviar(s)
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {mensajes.map((m, i) => (
            <div key={i} className={"sit-bot__msg sit-bot__msg--" + m.role}>
              <p>{m.content}</p>
              {m.recomendacion && (
                <button
                  type="button"
                  className="sit-bot__ir"
                  onClick={() => {
                    onClose();
                    navigate(m.recomendacion.to);
                  }}
                >
                  {m.recomendacion.nombre} <i className="ti ti-arrow-right" />
                </button>
              )}
            </div>
          ))}
          {ocupado && (
            <>
              <div className="sit-bot__msg sit-bot__msg--user">
                <p>{pendiente}</p>
              </div>
              <div className="sit-bot__pensando" role="status">
                <span />
                <span />
                <span /> Revisando la información técnica…
              </div>
            </>
          )}
          {error && (
            <p className="sit-bot__error" role="alert">
              {error}
            </p>
          )}
          <div ref={fin} />
        </div>

        <form
          className="sit-bot__form"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(input);
          }}
        >
          <textarea
            aria-label="Escribe tu pregunta"
            disabled={ocupado}
            maxLength={1500}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                enviar(input);
              }
            }}
            placeholder={
              contexto
                ? "Ej. ¿La ficha técnica sigue vigente?"
                : "Ej. ¿Qué proveedor tiene la lecitina de soya?"
            }
          />
          <button
            type="submit"
            disabled={ocupado || !input.trim()}
            aria-label="Enviar"
          >
            <i className="ti ti-send" />
          </button>
        </form>
        <footer className="sit-bot__pie">
          Respuestas con IA de solo consulta · Verifica en la ficha antes de
          decidir.
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default function SitAsistente({ sinBoton = false }) {
  const location = useLocation();
  const [abierto, setAbierto] = useState(null); // null = cerrado; { pregunta } = abierto
  const contexto = contextoDeRuta(location);
  const cerrar = useRef(() => setAbierto(null)).current;

  // Las pestañas del portal mantienen montadas las páginas ocultas
  // (<div className="app-tab-panel" hidden>). El botón va en <body>, así que
  // hay que ocultarlo a mano cuando la pestaña del SIT no es la visible.
  const marca = useRef(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const panel = marca.current?.closest(".app-tab-panel");
    if (!panel) return undefined; // sin pestañas: siempre visible
    const revisar = () => setVisible(!panel.hidden);
    revisar();
    const obs = new MutationObserver(revisar);
    obs.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) setAbierto(null); // al salir del SIT, el chat se cierra
  }, [visible]);

  useEffect(() => {
    const abrir = (e) => visible && setAbierto({ pregunta: String(e.detail?.pregunta || "").slice(0, 500) });
    window.addEventListener("sit-fabi:abrir", abrir);
    return () => window.removeEventListener("sit-fabi:abrir", abrir);
  }, [visible]);

  return (
    <>
      <span ref={marca} hidden aria-hidden="true" />
      {/* En body: el contenedor de la página (animación de entrada) crea su
          propia capa y el contenido de la página se pintaba encima del botón */}
      {visible &&
        !abierto &&
        !sinBoton &&
        createPortal(
          <button
            type="button"
            className="sit-bot-fab"
            onClick={() => setAbierto({ pregunta: "" })}
            aria-label="Abrir Fab-i · Información Técnica"
          >
            <FabiLaboratorio className="sit-fabi--fab" />
            <span className="sit-bot-fab__txt">
              <strong>Fab-i</strong>
              <small>Información Técnica</small>
            </span>
          </button>,
          document.body,
        )}
      {abierto && <SitAsistentePanel contexto={contexto} onClose={cerrar} inicial={abierto.pregunta} />}
    </>
  );
}
