// pages/sit/components/ValidarDocumentoModal.jsx
// Validación de Calidad de un documento.
// Props: idDocumento, nombreArchivo, estadoActual?, notasActuales?, onSuccess, onClose, showToast,
//        endpoint? (ruta del API; por omisión la de documentos cargados en el portal)
import { useState } from "react";
import SitModal from "./SitModal";
import { sitApi } from "../sitApi";
import "./ValidarDocumentoModal.css";

const OPCIONES = [
  { valor: 1, label: "OK", icono: "ti-circle-check", tono: "ok", ayuda: "El documento cumple." },
  { valor: 2, label: "Parcial", icono: "ti-alert-triangle", tono: "parcial", ayuda: "Cumple con observaciones." },
  { valor: 3, label: "No corresponde", icono: "ti-circle-x", tono: "rechazo", ayuda: "No es el documento correcto o no cumple." },
];

export default function ValidarDocumentoModal({ idDocumento, nombreArchivo, estadoActual, notasActuales, endpoint, onSuccess, onClose, showToast }) {
  const [estado, setEstado] = useState(estadoActual || null);
  const [notas, setNotas] = useState(notasActuales || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    if (!estado) return setError("Selecciona el resultado de la validación.");
    if (estado !== 1 && !notas.trim()) return setError("Explica en las notas qué falta o por qué no corresponde.");

    try {
      setGuardando(true);
      await sitApi(endpoint || `/documentos/${idDocumento}/validar`, {
        method: "PUT",
        body: { estadoValidacion: estado, notasValidacion: notas.trim() },
      });
      showToast?.("Validación registrada");
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SitModal
      titulo="Validar documento"
      subtitulo={nombreArchivo}
      icono="ti-checklist"
      bloqueado={guardando}
      onClose={onClose}
      pie={
        <>
          <button className="sit-btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button className="sit-btn sit-btn--primary" type="submit" form="sit-form-validar" disabled={guardando}>
            {guardando ? <i className="ti ti-loader-2 sit-spin" /> : <i className="ti ti-check" />} Guardar validación
          </button>
        </>
      }
    >
      <form id="sit-form-validar" onSubmit={guardar}>
        {error && (
          <div className="sit-form-error" role="alert">
            <i className="ti ti-alert-circle" /> {error}
          </div>
        )}

        <div className="sit-field">
          <span>Resultado</span>
          <div className="sit-validar__opciones" role="radiogroup">
            {OPCIONES.map((o) => (
              <label key={o.valor} className={`sit-validar__opcion sit-validar__opcion--${o.tono}${estado === o.valor ? " is-sel" : ""}`}>
                <input type="radio" name="estadoValidacion" value={o.valor} checked={estado === o.valor} onChange={() => setEstado(o.valor)} disabled={guardando} />
                <i className={`ti ${o.icono}`} />
                <span>
                  <strong>{o.label}</strong>
                  <small>{o.ayuda}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="sit-field">
          <label htmlFor="sit-notas">
            Notas de validación {estado && estado !== 1 && <span className="req">*</span>}
          </label>
          <textarea id="sit-notas" className="sit-input" maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} disabled={guardando} placeholder="Qué se revisó, qué falta…" />
        </div>
      </form>
    </SitModal>
  );
}
