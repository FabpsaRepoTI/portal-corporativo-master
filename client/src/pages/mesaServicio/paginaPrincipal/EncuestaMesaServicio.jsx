import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { enviarEncuesta } from "../../../services/encuestaMesaServicio";
import "./EncuestaMesaServicio.css";

const OPCIONES = [
  { valor: "Muy satisfecho", emoji: "😄" },
  { valor: "Satisfecho", emoji: "🙂" },
  { valor: "Neutral", emoji: "😐" },
  { valor: "Insatisfecho", emoji: "🙁" },
  { valor: "Muy insatisfecho", emoji: "😞" },
];

// Tarjeta flotante discreta: no bloquea la página. Los campos de texto
// solo se muestran después de elegir una calificación.
export default function EncuestaMesaServicio({ onClose, onRespondida }) {
  const [satisfaccion, setSatisfaccion] = useState("");
  const [oportunidades, setOportunidades] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!listo) return;
    const t = setTimeout(() => onRespondida(), 1600);
    return () => clearTimeout(t);
  }, [listo, onRespondida]);

  async function enviar() {
    if (!satisfaccion || enviando) return;
    setEnviando(true);
    setError("");
    try {
      await enviarEncuesta({
        satisfaccion,
        oportunidades: oportunidades.trim(),
        comentarios: comentarios.trim(),
      });
      setListo(true);
    } catch (e) {
      setError(e.message || "No fue posible enviar tu respuesta. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return createPortal(
    <section
      className="mesa-encuesta"
      role="dialog"
      aria-labelledby="mesa-encuesta-title"
    >
      {!listo && (
        <button className="mesa-encuesta-close" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
      )}
      {listo ? (
        <div className="mesa-encuesta-gracias">
          <span className="mesa-encuesta-check" aria-hidden="true">✓</span>
          <strong>¡Gracias por tu opinión!</strong>
          <p>Nos ayuda a seguir mejorando la Mesa de Servicio.</p>
        </div>
      ) : (
        <>
          <div className="mesa-encuesta-head">
            <span className="mesa-encuesta-kicker">AYÚDANOS A MEJORAR</span>
            <h2 id="mesa-encuesta-title">
              ¿Qué te parece la Mesa de Servicio hasta este momento?
            </h2>
          </div>
          <div className="mesa-encuesta-body">
            <div className="mesa-encuesta-opciones" role="radiogroup" aria-label="Calificación">
              {OPCIONES.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  role="radio"
                  aria-checked={satisfaccion === o.valor}
                  title={o.valor}
                  className={"mesa-encuesta-opcion" + (satisfaccion === o.valor ? " is-selected" : "")}
                  onClick={() => setSatisfaccion(o.valor)}
                >
                  <span aria-hidden="true">{o.emoji}</span>
                  <small>{o.valor}</small>
                </button>
              ))}
            </div>
            {satisfaccion && (
              <>
                <div className="mesa-encuesta-field">
                  <label htmlFor="mesa-encuesta-oportunidades">
                    ¿Qué cambiarías o qué le hace falta? <small>(opcional)</small>
                  </label>
                  <textarea
                    id="mesa-encuesta-oportunidades"
                    placeholder="Cuéntanos qué mejorarías…"
                    maxLength={2000}
                    value={oportunidades}
                    onChange={(e) => setOportunidades(e.target.value)}
                  />
                </div>
                <div className="mesa-encuesta-field">
                  <label htmlFor="mesa-encuesta-comentarios">
                    Comentarios adicionales <small>(opcional)</small>
                  </label>
                  <textarea
                    id="mesa-encuesta-comentarios"
                    placeholder="Algo más que quieras compartir…"
                    maxLength={2000}
                    value={comentarios}
                    onChange={(e) => setComentarios(e.target.value)}
                  />
                </div>
              </>
            )}
            {error && <div className="mesa-encuesta-error">{error}</div>}
          </div>
          <div className="mesa-encuesta-foot">
            <button className="mesa-encuesta-later" onClick={onClose}>
              Ahora no
            </button>
            {satisfaccion && (
              <button className="mesa-encuesta-submit" disabled={enviando} onClick={enviar}>
                {enviando ? "Enviando…" : "Enviar"}
              </button>
            )}
          </div>
        </>
      )}
    </section>,
    document.body,
  );
}
