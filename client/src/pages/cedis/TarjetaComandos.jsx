// pages/cedis/TarjetaComandos.jsx
// Tarjeta imprimible con los códigos QR de comandos del escáner de facturas.
// Se imprime una vez, se enmica y se deja junto a la estación de lectura.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { COMANDOS } from "./lectoraComandos";

export default function TarjetaComandos({ onClose }) {
  const [qrs, setQrs] = useState(null);

  useEffect(() => {
    let vivo = true;
    Promise.all(
      COMANDOS.map((c) => QRCode.toDataURL(c.codigo, { errorCorrectionLevel: "M", margin: 1, width: 240 })),
    ).then((urls) => vivo && setQrs(urls));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="cdf-tarjeta-fondo" role="dialog" aria-modal="true" aria-labelledby="cdf-tarjeta-titulo">
      <div className="cdf-tarjeta">
        <header className="cdf-tarjeta-head">
          <div>
            <small>ESCÁNER DE FACTURAS · CEDIS</small>
            <h2 id="cdf-tarjeta-titulo">Tarjeta de comandos</h2>
            <p>Lee un código con la lectora para moverte por el módulo. Las facturas se leen igual que siempre.</p>
          </div>
          <div className="cdf-tarjeta-acciones">
            <button onClick={() => window.print()} disabled={!qrs}>
              Imprimir
            </button>
            <button onClick={onClose}>Cerrar</button>
          </div>
        </header>
        {!qrs ? (
          <p role="status">Generando códigos…</p>
        ) : (
          <div className="cdf-tarjeta-grid">
            {COMANDOS.map((c, i) => (
              <figure key={c.codigo}>
                <img src={qrs[i]} alt={`Código QR: ${c.titulo}`} />
                <figcaption>
                  <strong>
                    <span aria-hidden="true">{c.icono}</span> {c.titulo}
                  </strong>
                  <small>{c.ayuda}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
