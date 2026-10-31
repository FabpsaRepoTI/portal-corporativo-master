// pages/sgc/components/Historial.jsx
// Pista del ciclo de vida (con la fecha en que se alcanzó cada etapa, tomada
// de la bitácora) y bitácora compacta de movimientos.
import { Estatus } from "./ui";
import { fechaCorta, fechaHora, hace, NC_ESTATUS, AC_ESTATUS, NC_FLUJO, AC_FLUJO } from "../sgcApi";

const MAPAS = { nc: NC_ESTATUS, ac: AC_ESTATUS };
const FLUJOS = { nc: NC_FLUJO, ac: AC_FLUJO };

/** Última vez que el registro llegó a cada estatus. */
function fechasPorEstatus(historial = []) {
  const f = {};
  for (const h of historial) f[h.estatusNuevo] = h.fechaRegistro;
  return f;
}

export function Pista({ tipo, actual, historial }) {
  const flujo = FLUJOS[tipo];
  const mapa = MAPAS[tipo];
  const fechas = fechasPorEstatus(historial);
  const cancelado = !flujo.includes(actual);
  // Si se canceló, la última etapa alcanzada antes de cancelar
  const previo = cancelado ? [...(historial || [])].reverse().find((h) => h.estatusNuevo !== actual)?.estatusNuevo ?? 1 : actual;
  const pos = flujo.indexOf(previo);

  return (
    <div className="pista" aria-label="Ciclo de vida">
      {flujo.map((paso, i) => {
        const hecho = cancelado ? i <= pos : i < pos || (i === pos && i === flujo.length - 1);
        const esActual = !cancelado && i === pos && !hecho;
        const clase = hecho ? "is-hecho" : esActual ? "is-actual" : "is-pendiente";
        return (
          <div key={paso} className={`pista__paso ${clase}`}>
            <b>{mapa[paso].label}</b>
            <small>{(hecho || esActual) && fechas[paso] ? fechaCorta(fechas[paso]) : esActual ? "Actual" : "—"}</small>
          </div>
        );
      })}
      {cancelado && (
        <div className="pista__paso is-cancelado">
          <b>{mapa[actual].label}</b>
          <small>{fechas[actual] ? fechaCorta(fechas[actual]) : ""}</small>
        </div>
      )}
    </div>
  );
}

export function Bitacora({ tipo, eventos }) {
  const mapa = MAPAS[tipo];
  if (!eventos?.length) return <p className="muted" style={{ padding: 16 }}>Sin movimientos registrados.</p>;
  const lista = [...eventos].reverse();
  return (
    <ol className="bitacora">
      {lista.map((h) => {
        const tono = mapa[h.estatusNuevo]?.tono || "brand";
        const alta = !h.estatusAnterior;
        const reasigna = h.estatusAnterior === h.estatusNuevo;
        return (
          <li key={h.idHistorial}>
            <span className={`bitacora__nodo t-${tono}`} />
            <div>
              <div className="bitacora__head">
                {alta ? (
                  <b>Registro</b>
                ) : reasigna ? (
                  <b>Reasignación</b>
                ) : (
                  <>
                    <Estatus tipo={tipo} id={h.estatusAnterior} />
                    <i className="ti ti-arrow-narrow-right muted" />
                    <Estatus tipo={tipo} id={h.estatusNuevo} />
                  </>
                )}
                <time dateTime={h.fechaRegistro} title={fechaHora(h.fechaRegistro)}>
                  {hace(h.fechaRegistro)}
                </time>
              </div>
              {h.motivo && !/^Avanza a «/.test(h.motivo) && <p className="bitacora__motivo">{h.motivo}</p>}
              <div className="bitacora__autor">{h.nombre || h.login}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
