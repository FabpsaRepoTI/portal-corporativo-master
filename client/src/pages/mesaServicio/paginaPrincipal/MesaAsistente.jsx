import fabpsaLogo from "../../../logo-fabpsa.png";
import { AuthContext } from "../../../context/AuthContext";
import robot from "../../../assets/fabi.png";
import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./MesaUsuario.css"; // también se abre fuera de la Mesa (Inicio)
export default function MesaAsistente({ initial = "", onClose }) {
  const { user } = useContext(AuthContext);
  const name = user?.name?.trim().split(/\s+/)[0] || "";
  const hour = Number(
    new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );

  const greeting =
    hour < 12 ? "buenos días" : hour < 19 ? "buenas tardes" : "buenas noches";
  const navigate = useNavigate(),
    dialog = useRef(null),
    end = useRef(null),
    controller = useRef(null);
  const [messages, setMessages] = useState([]),
    [input, setInput] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector("textarea")?.focus();
    const key = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = [
          ...dialog.current.querySelectorAll(
            "button:not(:disabled),textarea,a[href]",
          ),
        ];
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      controller.current?.abort();
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy, error]);
  async function send(e) {
    e.preventDefault();
    if (busy || !input.trim()) return;
    const content = input.trim();
    const history = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content },
    ].slice(-11);
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      const r = await fetch("/api/mesa-asistente", {
        method: "POST",
        signal: controller.current.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("fabpsa_token"),
        },
        body: JSON.stringify({ messages: history }),
      });
      const d = await r.json();
      if (!r.ok)
        throw new Error(d.error || "No fue posible consultar al asistente.");
      setMessages((previous) => [
        ...previous,
        { role: "user", content },
        {
          role: "assistant",
          content: d.respuesta,
          recomendacion: d.recomendacion,
        },
      ]);
      setInput("");
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <div
      className="mesa-bot-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        ref={dialog}
        className={"mesa-bot" + (busy ? " mesa-bot-thinking" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mesa-bot-title"
      >
        <header>
          <img className="mesa-bot-header-logo" src={fabpsaLogo} alt="FABPSA" />
          <div>
            <h2 id="mesa-bot-title">Fab-i · Mesa de Servicio</h2>
            <p>Te ayudo a encontrar la opción correcta</p>
          </div>
          <button aria-label="Cerrar asistente" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="mesa-bot-messages" role="log" aria-live="polite">
          <div className="mesa-bot-intro">
            <img src={robot} alt="Fab-i, tu asistente inteligente en FABPSA, saludando" />
            <div className="mesa-bot-welcome">
              <strong>
                Hola, {greeting}
                {name ? ", " + name : ""}.
              </strong>
              <p>
                Soy Fab-i, tu asistente inteligente en FABPSA. Cuéntame qué necesitas y
                te guiaré a la opción correcta.
              </p>
            </div>
          </div>
          {messages.map((m, i) => (
            <div key={i} className={"mesa-bot-message " + m.role}>
              {m.role === "assistant" && (
                <img className="mesa-bot-avatar" src={robot} alt="" />
              )}
              <strong>
                {m.role === "user" ? "Tú" : "FABPSA TI · Asistente virtual"}
              </strong>
              <p style={{ whiteSpace: "pre-line" }}>{m.content}</p>
              {m.recomendacion && (
                <button
                  className="mesa-outline"
                  onClick={() => {
                    onClose();
                    navigate(m.recomendacion.to);
                  }}
                >
                  Ir a {m.recomendacion.nombre} →
                </button>
              )}
            </div>
          ))}
          {busy && (
            <>
              <div className="mesa-bot-message user">
                <strong>Tú</strong>
                <p>{input}</p>
              </div>
              <div className="mesa-bot-pending" role="status">
                <img src={robot} alt="" />
                <span>Estoy revisando cómo ayudarte…</span>
              </div>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <div ref={end} />
        </div>
        <form onSubmit={send}>
          <label htmlFor="mesa-bot-input">Describe tu necesidad</label>
          <textarea
            id="mesa-bot-input"
            disabled={busy}
            maxLength={1500}
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                send(e);
              }
            }}
            placeholder="Ej. La impresora no imprime desde esta mañana"
          />
          <div>
            <small>No compartas contraseñas ni códigos de acceso.</small>
            <button className="mesa-primary" disabled={busy || !input.trim()}>
              {busy ? "Consultando…" : "Enviar"}
            </button>
          </div>
        </form>
        <footer>
          Orientación con IA · Revisa la categoría antes de enviar tu solicitud.
        </footer>
      </section>
    </div>,
    document.body,
  );
}
