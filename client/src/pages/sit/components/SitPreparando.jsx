// pages/sit/components/SitPreparando.jsx
// Pantalla de preparación del SIT mientras la petición real del tablero
// está pendiente (la primera del día recorre la biblioteca de SharePoint y
// tarda ~20 s; con caché responde en menos de un segundo).
// - No aparece si la carga termina antes de RETRASO_MS: así una respuesta
//   rápida entra directo al visor, sin parpadeo de pantalla de carga.
// - No hay porcentaje: el servidor no reporta avance, así que solo se
//   muestra el tiempo transcurrido real y, si tarda, por qué.
import { useEffect, useState } from "react";
import "./SitPreparando.css";

const RETRASO_MS = 300;
const LENTO_S = 6;

export default function SitPreparando() {
  const [visible, setVisible] = useState(false);
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const inicio = Date.now();
    const t = setTimeout(() => setVisible(true), RETRASO_MS);
    const i = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);

  if (!visible) return <div className="sit-prep sit-prep--reservado" aria-hidden="true" />;

  const lento = segundos >= LENTO_S;
  return (
    <div className="sit-prep" role="status" aria-live="polite">
      <div className="sit-prep__ilustracion" aria-hidden="true">
        <span className="sit-prep__hoja sit-prep__hoja--3" />
        <span className="sit-prep__hoja sit-prep__hoja--2" />
        <span className="sit-prep__hoja sit-prep__hoja--1">
          <span className="sit-prep__renglon" />
          <span className="sit-prep__renglon" />
          <span className="sit-prep__renglon sit-prep__renglon--corto" />
          <span className="sit-prep__sello">
            <i className="ti ti-check" />
          </span>
        </span>
        <span className="sit-prep__escaner" />
      </div>

      <h2 className="sit-prep__titulo">Preparando tu espacio de trabajo</h2>
      <p className="sit-prep__texto">
        Revisando la vigencia de los documentos técnicos de IAFSA y FDNC en SharePoint.
      </p>

      <p className={`sit-prep__nota${lento ? " is-visible" : ""}`}>
        {lento ? (
          <>
            La primera consulta del día recorre toda la biblioteca y puede tardar unos 20 segundos.
            <span className="sit-prep__tiempo"> · {segundos} s</span>
          </>
        ) : (
          " "
        )}
      </p>
    </div>
  );
}
