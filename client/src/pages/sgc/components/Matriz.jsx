// pages/sgc/components/Matriz.jsx
// Matriz 5×5: probabilidad en el eje Y (5 arriba) × impacto en el eje X.
// Color de cada celda por nivel = P × I: <5 verde, 5–12 amarillo, >12 rojo.
// Cada registro es un punto clicable dentro de su celda. La versión mini
// (detalle) solo marca la celda del registro.
import { NIVELES, nivelDe } from "../sgcApi";

export const PROBABILIDAD = { 1: "Rara", 2: "Improbable", 3: "Posible", 4: "Probable", 5: "Casi segura" };
export const IMPACTO = { 1: "Insignificante", 2: "Menor", 3: "Moderado", 4: "Mayor", 5: "Catastrófico" };

const FILAS = [5, 4, 3, 2, 1];
const COLUMNAS = [1, 2, 3, 4, 5];
const MAX_PUNTOS = 8; // por celda; el resto se resume como +n

/**
 * riesgos: [{ idRiesgo, nombre, probabilidad, impacto }]; sel: idRiesgo seleccionado
 * onPunto(riesgo); mini: versión compacta (resaltar = { p, i })
 */
export default function Matriz({ riesgos = [], sel, onPunto, mini = false, resaltar }) {
  const off = mini ? 0 : 1;
  return (
    <div className={`matriz${mini ? " matriz--mini" : ""}`} role="grid" aria-label="Matriz de probabilidad por impacto">
      {!mini && (
        <div className="matriz__eje matriz__eje--y" style={{ gridColumn: 1, gridRow: "1 / span 5" }}>
          Probabilidad
        </div>
      )}
      {FILAS.map((p, fila) => (
        <div key={`r${p}`} style={{ display: "contents" }} role="row">
          <div className="matriz__rot" style={{ gridColumn: off + 1, gridRow: fila + 1 }}>
            {mini ? (
              p
            ) : (
              <>
                {PROBABILIDAD[p]}
                <small>{p}</small>
              </>
            )}
          </div>
          {COLUMNAS.map((i, col) => {
            const nivel = p * i;
            const tono = NIVELES[nivelDe(nivel)].tono;
            const aqui = mini ? [] : riesgos.filter((r) => r.probabilidad === p && r.impacto === i);
            const marcada = resaltar && resaltar.p === p && resaltar.i === i;
            return (
              <div
                key={`c${p}${i}`}
                role="gridcell"
                aria-label={`Probabilidad ${p} (${PROBABILIDAD[p]}), impacto ${i} (${IMPACTO[i]}): nivel ${nivel}, ${aqui.length} registros`}
                data-nivel={nivel}
                className={`matriz__celda t-${tono}${aqui.length ? " tiene" : ""}${marcada ? " is-resaltada" : ""}`}
                style={{ gridColumn: off + 2 + col, gridRow: fila + 1 }}
              >
                {aqui.length > 0 && (
                  <div className="matriz__puntos">
                    {aqui.slice(0, MAX_PUNTOS).map((r) => (
                      <button
                        key={r.idRiesgo}
                        type="button"
                        className={`matriz__punto${sel === r.idRiesgo ? " is-sel" : ""}`}
                        title={`${r.nombre} · nivel ${nivel}`}
                        aria-label={`${r.nombre}, nivel ${nivel}`}
                        aria-pressed={sel === r.idRiesgo}
                        onClick={() => onPunto?.(r)}
                      />
                    ))}
                    {aqui.length > MAX_PUNTOS && <span className="matriz__mas">+{aqui.length - MAX_PUNTOS}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {COLUMNAS.map((i, col) => (
        <div key={`x${i}`} className="matriz__rot matriz__rot--x" style={{ gridColumn: off + 2 + col, gridRow: 6 }}>
          {mini ? (
            i
          ) : (
            <>
              {IMPACTO[i]}
              <small>{i}</small>
            </>
          )}
        </div>
      ))}
      {!mini && (
        <div className="matriz__eje" style={{ gridColumn: "3 / span 5", gridRow: 7, paddingTop: 4 }}>
          Impacto
        </div>
      )}
    </div>
  );
}

/** Píldora de nivel: número + Bajo/Medio/Alto con su color. */
export function Nivel({ nivel, conTexto = true }) {
  const n = NIVELES[nivelDe(nivel)];
  return (
    <span className={`nivel t-${n.tono}`}>
      <span className="nivel__num">{nivel}</span>
      {conTexto && <span className="tag">{n.label}</span>}
    </span>
  );
}
