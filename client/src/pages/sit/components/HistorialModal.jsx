// pages/sit/components/HistorialModal.jsx
// Versiones anteriores de un documento (solo lectura).
// Props: idDocumento, nombreArchivo, onClose
import { useEffect, useState } from "react";
import SitModal from "./SitModal";
import SemaforoChip from "./SemaforoChip";
import SITDocumentoViewer from "./SITDocumentoViewer";
import { sitApi, fecha, fechaHora } from "../sitApi";

export default function HistorialModal({ idDocumento, nombreArchivo, onClose }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState("");
  const [viendo, setViendo] = useState(null);

  useEffect(() => {
    let vivo = true;
    sitApi(`/documentos/${idDocumento}/historial`)
      .then((d) => vivo && setFilas(d || []))
      .catch((e) => vivo && setError(e.message));
    return () => {
      vivo = false;
    };
  }, [idDocumento]);

  return (
    <>
      <SitModal titulo="Historial de versiones" subtitulo={`Versión actual: ${nombreArchivo}`} icono="ti-history" ancho={900} onClose={onClose}>
        {error ? (
          <div className="sit-state sit-state--error">
            <i className="ti ti-alert-circle" />
            <p>{error}</p>
          </div>
        ) : !filas ? (
          <div className="sit-state">
            <i className="ti ti-loader-2 sit-spin" />
            <p>Cargando historial…</p>
          </div>
        ) : !filas.length ? (
          <div className="sit-state">
            <i className="ti ti-history-off" />
            <h3>Sin versiones anteriores</h3>
            <p>Este documento no se ha reemplazado.</p>
          </div>
        ) : (
          <div className="sit-table-wrap">
            <table className="sit-table">
              <thead>
                <tr>
                  <th>Versión anterior</th>
                  <th>Fecha carga</th>
                  <th>Cargado por</th>
                  <th>Vencimiento</th>
                  <th>Reemplazado por</th>
                  <th>Fecha reemplazo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((h) => (
                  <tr key={h.idHistorial}>
                    <td>
                      <strong>v{h.versionNumero}</strong>
                      <small title={h.nombreArchivo}>{h.nombreArchivo}</small>
                    </td>
                    <td>{fechaHora(h.fechaCarga)}</td>
                    <td>{h.cargadoPor}</td>
                    <td>
                      {fecha(h.fechaVencimiento)}
                      {h.semaforo && (
                        <div style={{ marginTop: 4 }}>
                          <SemaforoChip semaforo={h.semaforo} />
                        </div>
                      )}
                    </td>
                    <td>{h.reemplazadoPor}</td>
                    <td>{fechaHora(h.fechaReemplazo)}</td>
                    <td>
                      <button className="sit-btn sit-btn--sm" onClick={() => setViendo(h)}>
                        <i className="ti ti-eye" /> Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SitModal>

      {viendo && (
        <SITDocumentoViewer
          documento={{ tipo: "sit", id: idDocumento, historial: viendo.idHistorial }}
          nombreArchivo={`v${viendo.versionNumero} · ${viendo.nombreArchivo}`}
          onClose={() => setViendo(null)}
        />
      )}
    </>
  );
}
