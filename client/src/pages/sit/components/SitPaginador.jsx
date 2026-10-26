// pages/sit/components/SitPaginador.jsx
// Paginación de las tablas del SIT (en cliente), con el mismo aspecto que
// el paginador de Mesa de Servicio: 10 filas por defecto y selector para
// ver 25, 50 o 100.
import { useEffect, useMemo, useState } from "react";
import "./SitPaginador.css";

export const TAMANOS_PAGINA = [10, 25, 50, 100];

/**
 * usePaginacion(items, reinicio)
 * Devuelve la página visible y los controles. `reinicio` es cualquier valor
 * que, al cambiar (búsqueda, filtro…), regresa a la página 1.
 */
export function usePaginacion(items, reinicio) {
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(10);
  const total = items?.length || 0;
  const totalPags = Math.max(1, Math.ceil(total / porPagina));

  useEffect(() => {
    setPagina(1);
  }, [reinicio, porPagina]);

  // Si la lista se achica (recarga), no quedarse en una página vacía
  useEffect(() => {
    if (pagina > totalPags) setPagina(totalPags);
  }, [pagina, totalPags]);

  const visibles = useMemo(
    () => (items || []).slice((pagina - 1) * porPagina, pagina * porPagina),
    [items, pagina, porPagina]
  );

  return { visibles, pagina, setPagina, porPagina, setPorPagina, total, totalPags };
}

// Páginas a mostrar: primera, última y una ventana alrededor de la actual
function numerosVisibles(pagina, totalPags) {
  const set = new Set([1, totalPags]);
  for (let n = pagina - 1; n <= pagina + 1; n++) if (n >= 1 && n <= totalPags) set.add(n);
  const nums = [...set].sort((a, b) => a - b);
  const out = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push(`gap-${n}`);
    out.push(n);
  });
  return out;
}

export default function SitPaginador({ pagina, setPagina, porPagina, setPorPagina, total, totalPags }) {
  if (!total) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  return (
    <div className="sit-pager">
      <div className="sit-pager__info">
        <span>
          Mostrando {desde.toLocaleString("es-MX")}–{hasta.toLocaleString("es-MX")} de {total.toLocaleString("es-MX")} resultados
        </span>
        <label className="sit-pager__tam">
          Filas
          <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} aria-label="Filas por página">
            {TAMANOS_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sit-pager__btns">
        <button className="sit-pn" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)} aria-label="Página anterior">
          <i className="ti ti-chevron-left" />
        </button>
        {numerosVisibles(pagina, totalPags).map((n) =>
          typeof n === "string" ? (
            <span key={n} className="sit-pn sit-pn--gap">
              …
            </span>
          ) : (
            <button key={n} className={`sit-pn${pagina === n ? " sit-pn--act" : ""}`} onClick={() => setPagina(n)} aria-current={pagina === n ? "page" : undefined}>
              {n}
            </button>
          )
        )}
        <button className="sit-pn" disabled={pagina >= totalPags} onClick={() => setPagina((p) => p + 1)} aria-label="Página siguiente">
          <i className="ti ti-chevron-right" />
        </button>
      </div>
    </div>
  );
}
