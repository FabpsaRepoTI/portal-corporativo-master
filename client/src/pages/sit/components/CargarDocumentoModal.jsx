// pages/sit/components/CargarDocumentoModal.jsx
// Sube (o reemplaza) el PDF de un tipo de documento para un par
// artículo-proveedor.
// Props: idArticuloProveedor, idTipoDocumento, tipoDocumento,
//        reglasVigencia (1=fecha explícita, 2=emisión+N, 3=recepción+N),
//        diasVigencia, esReemplazo, onSuccess, onClose, showToast
import { useState } from "react";
import SitModal from "./SitModal";
import { sitApi } from "../sitApi";

const MAX_MB = 20;

export default function CargarDocumentoModal({
  idArticuloProveedor,
  idTipoDocumento,
  tipoDocumento,
  reglasVigencia,
  diasVigencia,
  esReemplazo,
  onSuccess,
  onClose,
  showToast,
}) {
  const [archivo, setArchivo] = useState(null);
  const [fechaEmision, setFechaEmision] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const pideEmision = reglasVigencia === 2;
  const pideVencimiento = reglasVigencia === 1;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());

  const ayudaVigencia =
    reglasVigencia === 1
      ? "La vigencia es la fecha de vencimiento indicada en el certificado."
      : reglasVigencia === 2
        ? `Vigencia: ${diasVigencia || 365} días a partir de la fecha de emisión.`
        : `Vigencia: ${diasVigencia || 730} días a partir de hoy (fecha de recepción).`;

  const elegirArchivo = (e) => {
    const f = e.target.files?.[0] || null;
    setError("");
    if (f && !/\.pdf$/i.test(f.name)) {
      setError("Solo se aceptan archivos PDF.");
      e.target.value = "";
      return;
    }
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setError(`El archivo supera el límite de ${MAX_MB} MB.`);
      e.target.value = "";
      return;
    }
    setArchivo(f);
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    if (!archivo) return setError("Selecciona el archivo PDF.");
    if (pideEmision && !fechaEmision) return setError("Captura la fecha de emisión.");
    if (pideVencimiento && !fechaVencimiento) return setError("Captura la fecha de vencimiento del certificado.");

    const form = new FormData();
    form.append("archivo", archivo);
    form.append("idArticuloProveedor", String(idArticuloProveedor));
    form.append("idTipoDocumento", String(idTipoDocumento));
    if (fechaEmision) form.append("fechaEmision", fechaEmision);
    if (fechaVencimiento) form.append("fechaVencimiento", fechaVencimiento);
    if (observaciones.trim()) form.append("observaciones", observaciones.trim());

    try {
      setGuardando(true);
      await sitApi("/documentos", { method: "POST", form });
      showToast?.("Documento cargado correctamente");
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SitModal
      titulo={esReemplazo ? "Reemplazar documento" : "Cargar documento"}
      subtitulo={tipoDocumento}
      icono="ti-upload"
      bloqueado={guardando}
      onClose={onClose}
      pie={
        <>
          <button className="sit-btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button className="sit-btn sit-btn--primary" type="submit" form="sit-form-cargar" disabled={guardando}>
            {guardando ? (
              <>
                <i className="ti ti-loader-2 sit-spin" /> Subiendo…
              </>
            ) : (
              <>
                <i className="ti ti-upload" /> {esReemplazo ? "Reemplazar" : "Cargar"}
              </>
            )}
          </button>
        </>
      }
    >
      <form id="sit-form-cargar" onSubmit={guardar}>
        {error && (
          <div className="sit-form-error" role="alert">
            <i className="ti ti-alert-circle" /> {error}
          </div>
        )}
        {esReemplazo && (
          <div className="sit-form-aviso">
            <i className="ti ti-history" /> La versión actual pasará al historial y la validación de Calidad se reinicia.
          </div>
        )}

        <div className="sit-field">
          <span>Tipo de documento</span>
          <div className="sit-readonly">{tipoDocumento}</div>
          <small>{ayudaVigencia}</small>
        </div>

        <div className="sit-field">
          <label htmlFor="sit-archivo">
            Archivo PDF <span className="req">*</span>
          </label>
          <input id="sit-archivo" className="sit-input" type="file" accept="application/pdf,.pdf" onChange={elegirArchivo} disabled={guardando} />
          <small>Máximo {MAX_MB} MB.</small>
        </div>

        {(pideEmision || pideVencimiento) && (
          <div className="sit-field-row">
            {pideEmision && (
              <div className="sit-field">
                <label htmlFor="sit-emision">
                  Fecha de emisión <span className="req">*</span>
                </label>
                <input id="sit-emision" className="sit-input" type="date" max={hoy} value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} disabled={guardando} />
              </div>
            )}
            {pideVencimiento && (
              <div className="sit-field">
                <label htmlFor="sit-vencimiento">
                  Fecha de vencimiento <span className="req">*</span>
                </label>
                <input id="sit-vencimiento" className="sit-input" type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} disabled={guardando} />
              </div>
            )}
          </div>
        )}
        {!pideEmision && (
          <div className="sit-field">
            <label htmlFor="sit-emision-opc">Fecha de emisión</label>
            <input id="sit-emision-opc" className="sit-input" type="date" max={hoy} value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} disabled={guardando} />
            <small>Opcional, como referencia.</small>
          </div>
        )}

        <div className="sit-field">
          <label htmlFor="sit-obs">Observaciones</label>
          <textarea id="sit-obs" className="sit-input" maxLength={500} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} disabled={guardando} placeholder="Opcional" />
        </div>
      </form>
    </SitModal>
  );
}
