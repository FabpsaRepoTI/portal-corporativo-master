// client/src/components/DataTable.jsx
// Tabla reutilizable para todo el portal.
// Soporta: columnas configurables, ordenamiento, paginación,
// filas vacías, loading skeleton, acciones por fila.
import { useState } from "react";
import "./DataTable.css";

/**
 * @param {object[]}  columns        - { key, label, width?, render?, sortable? }
 * @param {object[]}  data           - filas
 * @param {boolean}   loading        - muestra skeleton
 * @param {string}    emptyText      - texto cuando no hay datos
 * @param {string}    emptyIcon      - emoji o icono
 * @param {function}  onRowClick     - callback(row)
 * @param {string}    rowKey         - campo único por fila (default "id")
 * @param {object}    sort           - { key, dir } controlado desde fuera
 * @param {function}  onSort         - callback({ key, dir })
 * @param {number}    page           - página actual (1-based)
 * @param {number}    total          - total de registros
 * @param {number}    limit          - registros por página
 * @param {function}  onPage         - callback(nuevaPagina)
 * @param {string}    className      - clase extra al wrapper
 */
export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyText = "Sin resultados",
  emptyIcon = "📭",
  onRowClick,
  rowKey = "id",
  sort,
  onSort,
  page = 1,
  total = 0,
  limit = 20,
  onPage,
  className = "",
}) {
  const totalPages = Math.ceil(total / limit) || 1;

  function handleSort(col) {
    if (!col.sortable || !onSort) return;
    const newDir = sort?.key === col.key && sort?.dir === "asc" ? "desc" : "asc";
    onSort({ key: col.key, dir: newDir });
  }

  return (
    <div className={`dt-wrapper ${className}`}>
      <div className="dt-scroll">
        <table className="dt-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={col.sortable ? "dt-th--sortable" : ""}
                  onClick={() => handleSort(col)}
                >
                  <span>{col.label}</span>
                  {col.sortable && (
                    <span className="dt-sort-icon">
                      {sort?.key === col.key
                        ? sort.dir === "asc" ? "↑" : "↓"
                        : "↕"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="dt-skeleton-row">
                    {columns.map((col) => (
                      <td key={col.key}>
                        <span className="dt-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              : data.length === 0
              ? (
                  <tr>
                    <td colSpan={columns.length} className="dt-empty">
                      <span className="dt-empty-icon">{emptyIcon}</span>
                      <span className="dt-empty-text">{emptyText}</span>
                    </td>
                  </tr>
                )
              : data.map((row) => (
                  <tr
                    key={row[rowKey]}
                    className={onRowClick ? "dt-row--clickable" : ""}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <td key={col.key}>
                        {col.render ? col.render(row[col.key], row) : row[col.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Paginador */}
      {total > 0 && onPage && (
        <div className="dt-pager">
          <span className="dt-pager__info">
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total}
          </span>
          <div className="dt-pager__btns">
            <button
              className="dt-pager__btn"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
            >‹</button>
            <span className="dt-pager__page">Pág. {page} / {totalPages}</span>
            <button
              className="dt-pager__btn"
              disabled={page >= totalPages}
              onClick={() => onPage(page + 1)}
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}
