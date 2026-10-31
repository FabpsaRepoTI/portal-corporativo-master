// pages/sit/components/RegistrarVencimientoModal.jsx
// Registro o edición del vencimiento de un documento de SharePoint.
// Si el documento ya tiene fecha, el modal abre con ella precargada.
// "Extraer fecha del PDF" le pide al servidor que lea el documento con IA y
// precarga la fecha; el usuario la revisa antes de guardar. Si se guarda tal
// cual la sugirió la IA va como esManual: false; si el usuario la teclea o
// la cambia, esManual: true. "No vence" guarda sin fecha (semáforo VERDE).
// Props: documento { sharepointId, nombreArchivo, tipoOficial, tipoDocumento,
//                    fechaVencimiento, origenFecha, noVence }, onSuccess, onClose, showToast
import { useState } from "react";
import SitModal from "./SitModal";
import { sitApi } from "../sitApi";
import "./RegistrarVencimientoModal.css";

export default function RegistrarVencimientoModal({ documento, onSuccess, onClose, showToast }) {
  const editando = !!documento.fechaVencimiento || !!documento.noVence;
  const [fecha, setFecha] = useState(documento.fechaVencimiento || "");
  const [noVence, setNoVence] = useState(!!documento.noVence);
  const [fechaIA, setFechaIA] = useState(null); // la fecha que sugirió la lectura del PDF
  const [guardando, setGuardando] = useState(false);
  const [extrayendo, setExtrayendo] = useState(false);
  const [extraccion, setExtraccion] = useState(null); // { tono: 'ok'|'aviso'|'error', texto }
  const [error, setError] = useState("");

  const ocupado = guardando || extrayendo;

  const extraer = async () => {
    setError("");
    setExtraccion(null);
    try {
      setExtrayendo(true);
      const r = await sitApi(`/documentos/${encodeURIComponent(documento.sharepointId)}/extraer-fecha`);
      if (r?.fecha) {
        setFecha(r.fecha);
        setFechaIA(r.fecha);
        setNoVence(false);
        const etiqueta = r.tipo === "emision" ? "Fecha de emisión (no de vencimiento)" : "Fecha extraída automáticamente";
        setExtraccion({
          tono: r.confianza === "alta" && r.tipo !== "emision" ? "ok" : "aviso",
          texto: `${etiqueta}${r.texto_original ? ` · "${r.texto_original}"` : ""}`,
        });
      } else {
        setExtraccion({ tono: "aviso", texto: "No se encontró fecha en el documento" });
      }
    } catch (err) {
      setExtraccion({ tono: "error", texto: err.message });
    } finally {
      setExtrayendo(false);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    if (!noVence && !fecha) return setError("Captura la fecha de vencimiento que indica el documento, o marca «No vence».");
    try {
      setGuardando(true);
      await sitApi(`/documentos/sharepoint/${encodeURIComponent(documento.sharepointId)}/fecha`, {
        method: "PUT",
        body: noVence
          ? { fechaVencimiento: null, noVence: true, esManual: true }
          : { fechaVencimiento: fecha, noVence: false, esManual: fecha !== fechaIA },
      });
      showToast?.(noVence ? "Documento marcado como «No vence»" : editando ? "Vencimiento actualizado" : "Vencimiento registrado");
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SitModal
      titulo={editando ? "Editar vencimiento" : "Registrar vencimiento"}
      subtitulo={documento.nombreArchivo}
      icono="ti-calendar-event"
      ancho={480}
      bloqueado={ocupado}
      onClose={onClose}
      pie={
        <>
          <button className="sit-btn" onClick={onClose} disabled={ocupado}>
            Cancelar
          </button>
          <button className="sit-btn sit-btn--primary" type="submit" form="sit-form-vencimiento" disabled={ocupado}>
            {guardando ? <i className="ti ti-loader-2 sit-spin" /> : <i className="ti ti-check" />} Guardar
          </button>
        </>
      }
    >
      <form id="sit-form-vencimiento" onSubmit={guardar}>
        {error && (
          <div className="sit-form-error" role="alert">
            <i className="ti ti-alert-circle" /> {error}
          </div>
        )}
        <div className="sit-field">
          <span>Tipo de documento</span>
          <div className="sit-readonly">{documento.tipoOficial || documento.tipoDocumento}</div>
          {!documento.tipoOficial && <small>Tipo no reconocido: no tiene regla de vigencia automática.</small>}
        </div>

        <button type="button" className="sit-btn sit-venc__extraer" onClick={extraer} disabled={ocupado || noVence}>
          {extrayendo ? (
            <>
              <i className="ti ti-loader-2 sit-spin" /> Leyendo el PDF…
            </>
          ) : (
            <>
              <i className="ti ti-sparkles" /> Extraer fecha del PDF
            </>
          )}
        </button>

        {extraccion && !noVence && (
          <p className={`sit-venc__resultado sit-venc__resultado--${extraccion.tono}`} role="status">
            <i className={`ti ${extraccion.tono === "ok" ? "ti-circle-check" : extraccion.tono === "error" ? "ti-alert-circle" : "ti-alert-triangle"}`} />
            <span>{extraccion.texto}</span>
          </p>
        )}

        <div className="sit-field">
          <label htmlFor="sit-fecha-venc">
            Fecha de vencimiento {!noVence && <span className="req">*</span>}
          </label>
          <input
            id="sit-fecha-venc"
            className="sit-input"
            type="date"
            value={noVence ? "" : fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={ocupado || noVence}
            autoFocus
          />
          <small>Verifica la fecha contra el documento antes de guardar.</small>
        </div>

        <label className="sit-venc__novence">
          <input type="checkbox" checked={noVence} onChange={(e) => setNoVence(e.target.checked)} disabled={ocupado} />
          <span>
            <strong>No vence</strong>
            <small>El documento queda vigente siempre, sin fecha de vencimiento.</small>
          </span>
        </label>
      </form>
    </SitModal>
  );
}
