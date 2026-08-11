// React y hooks que vamos a usar:
// useState — para guardar datos que cambian (solicitudes, filtros, modales)
// useEffect — para ejecutar código cuando el componente carga (traer datos del backend)
// useContext — para leer el usuario logueado desde AuthContext
import { useState, useEffect, useContext } from "react";

// Importamos las funciones del service que acabamos de crear
import {
  getSolicitudesHardware,
  atenderSolicitud,
  rechazarSolicitud,
} from "../../../services/solicitudesService.js";

// El contexto de autenticación nos da acceso al usuario logueado
import { AuthContext } from "../../../context/AuthContext";

// Los estilos del componente
import "./HardwareSolicitudes.css";

// ─── UTILIDADES ────────────────────────────────────────────────────────────────

// Convierte el estatus a una clase CSS para colorear el badge
function claseEstatus(estatus) {
  const v = String(estatus || "")
    .toLowerCase()
    .trim();
  if (v === "pendiente") return "hws-badge--pendiente";
  if (v === "en proceso") return "hws-badge--proceso";
  if (v === "completada") return "hws-badge--completada";
  if (v === "atendida") return "hws-badge--completada";
  if (v === "rechazada") return "hws-badge--rechazada";
  return "hws-badge--default";
}

// Formatea una fecha ISO a formato legible "DD/MM/YYYY HH:MM"
function formatFecha(fecha) {
  if (!fecha) return "—";
  const v = String(fecha);
  if (v.includes("T")) return v.replace("T", " ").substring(0, 16);
  return v.substring(0, 16);
}

// ─── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────

export default function HardwareSolicitudesPage() {
  const { user } = useContext(AuthContext);

  // Lista completa de solicitudes que viene del backend
  const [solicitudes, setSolicitudes] = useState([]);

  // Estado de carga y error al traer las solicitudes
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filtros de búsqueda — cada uno controla su input
  const [buscar, setBuscar] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [filtroDept, setFiltroDept] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  // Paginación — qué página estamos viendo y cuántos registros por página
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(15);

  // IDs de filas expandidas (para mostrar el detalle de artículos)
  const [expandidas, setExpandidas] = useState(new Set());

  // Modal de consulta rápida — null = cerrado, objeto = solicitud seleccionada
  const [modalConsulta, setModalConsulta] = useState(null);

  // Modal de atención — null = cerrado, objeto = solicitud seleccionada
  const [modalAtender, setModalAtender] = useState(null);

  // Estado de los campos del modal de atención (por idDetalle)
  const [camposAtencion, setCamposAtencion] = useState({});

  // Estado del botón guardar en el modal de atención
  const [guardando, setGuardando] = useState(false);
  const [alertaModal, setAlertaModal] = useState(null);

  // ─── CARGAR DATOS AL MONTAR ────────────────────────────────────────────────
  // useEffect con [] como dependencia = se ejecuta solo una vez cuando el componente aparece
  useEffect(() => {
    getSolicitudesHardware()
      .then(setSolicitudes)
      .catch(() => setError("No se pudieron cargar las solicitudes."))
      .finally(() => setLoading(false));
  }, []);

  // ─── RESUMEN ───────────────────────────────────────────────────────────────
  // Calculamos los conteos directamente de la lista — sin llamada extra al backend
  const resumen = {
    total: solicitudes.length,
    pendientes: solicitudes.filter(
      (s) => s.estatus?.toLowerCase() === "pendiente",
    ).length,
    proceso: solicitudes.filter(
      (s) => s.estatus?.toLowerCase() === "en proceso",
    ).length,
    completadas: solicitudes.filter(
      (s) => s.estatus?.toLowerCase() === "completada",
    ).length,
    rechazadas: solicitudes.filter(
      (s) => s.estatus?.toLowerCase() === "rechazada",
    ).length,
  };

  // ─── DEPARTAMENTOS ÚNICOS para el filtro ───────────────────────────────────
  const departamentos = [
    ...new Set(solicitudes.map((s) => s.departamento).filter(Boolean)),
  ].sort();

  // ─── FILTRADO ──────────────────────────────────────────────────────────────
  // Filtramos la lista completa según todos los criterios activos
  const filtradas = solicitudes.filter((s) => {
    const texto = `${s.folio} ${s.usuario} ${s.departamento}`.toLowerCase();
    const okBuscar = texto.includes(buscar.toLowerCase());
    const okEstatus = !filtroEstatus || s.estatus === filtroEstatus;
    const okDept = !filtroDept || s.departamento === filtroDept;
    const fecha = String(s.fechaRegistro).substring(0, 10);
    const okDesde = !fechaDesde || fecha >= fechaDesde;
    const okHasta = !fechaHasta || fecha <= fechaHasta;
    return okBuscar && okEstatus && okDept && okDesde && okHasta;
  });

  // ─── PAGINACIÓN ────────────────────────────────────────────────────────────
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginaReal = Math.min(pagina, totalPaginas);
  const inicio = (paginaReal - 1) * porPagina;
  const paginadas = filtradas.slice(inicio, inicio + porPagina);

  // Cuando cambia un filtro, volvemos a la página 1
  function alFiltrar() {
    setPagina(1);
  }

  function limpiarFiltros() {
    setBuscar("");
    setFiltroEstatus("");
    setFiltroDept("");
    setFechaDesde("");
    setFechaHasta("");
    setPagina(1);
  }

  // ─── EXPANDIR FILA ─────────────────────────────────────────────────────────
  function toggleExpand(id) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ─── MODAL ATENDER ─────────────────────────────────────────────────────────
  // Cuando abrimos el modal, inicializamos los campos con los valores actuales
  function abrirAtender(sol) {
    const campos = {};
    sol.detalle.forEach((d) => {
      campos[d.idDetalle] = {
        estatus: d.estatusDetalle || "Pendiente",
        fecha: d.fechaEstimadaEntrega
          ? String(d.fechaEstimadaEntrega).substring(0, 10)
          : "",
        observacion: d.observacionAtencion || "",
      };
    });
    setCamposAtencion(campos);
    setAlertaModal(null);
    setModalAtender(sol);
  }

  // Actualiza un campo específico de un artículo en el modal
  function setCampo(idDetalle, campo, valor) {
    setCamposAtencion((prev) => ({
      ...prev,
      [idDetalle]: { ...prev[idDetalle], [campo]: valor },
    }));
  }

  // Guarda los cambios del modal de atención
  async function guardarAtencion() {
    // Validación: si estatus es "En proceso" debe tener fecha
    const sinFecha = modalAtender.detalle.find((d) => {
      const c = camposAtencion[d.idDetalle];
      return c?.estatus === "En proceso" && !c?.fecha;
    });

    if (sinFecha) {
      setAlertaModal({
        tipo: "warning",
        titulo: "Falta fecha estimada",
        texto: "Agrega una fecha estimada a cada artículo en proceso.",
      });
      return;
    }

    setGuardando(true);

    const cambios = modalAtender.detalle.map((d) => ({
      idDetalle: d.idDetalle,
      estatus: camposAtencion[d.idDetalle]?.estatus || d.estatusDetalle,
      fechaEstimadaEntrega: camposAtencion[d.idDetalle]?.fecha || null,
      observacionAtencion: camposAtencion[d.idDetalle]?.observacion || null,
    }));

    try {
      const res = await atenderSolicitud(modalAtender.idSolicitud, cambios);

      // Actualizar los datos localmente sin recargar del backend
      setSolicitudes((prev) =>
        prev.map((s) => {
          if (s.idSolicitud !== modalAtender.idSolicitud) return s;
          return {
            ...s,
            estatus: res.estatusSolicitud,
            detalle: s.detalle.map((d) => {
              const c = camposAtencion[d.idDetalle];
              return c
                ? {
                    ...d,
                    estatusDetalle: c.estatus,
                    fechaEstimadaEntrega: c.fecha,
                    observacionAtencion: c.observacion,
                  }
                : d;
            }),
          };
        }),
      );

      setAlertaModal({
        tipo: "success",
        titulo: "Cambios guardados",
        texto: "La solicitud se actualizó correctamente.",
      });

      setTimeout(() => setModalAtender(null), 1500);
    } catch {
      setAlertaModal({
        tipo: "error",
        titulo: "Error al guardar",
        texto: "No se pudieron guardar los cambios. Intenta de nuevo.",
      });
    } finally {
      setGuardando(false);
    }
  }

  // ─── RECHAZAR SOLICITUD ────────────────────────────────────────────────────
  async function handleRechazar() {
    if (!modalConsulta) return;
    try {
      await rechazarSolicitud(modalConsulta.idSolicitud);
      setSolicitudes((prev) =>
        prev.map((s) =>
          s.idSolicitud === modalConsulta.idSolicitud
            ? {
                ...s,
                estatus: "Rechazada",
                detalle: s.detalle.map((d) => ({
                  ...d,
                  estatusDetalle: "Rechazada",
                })),
              }
            : s,
        ),
      );
      setModalConsulta(null);
    } catch {
      alert("No se pudo rechazar la solicitud.");
    }
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────

  if (loading)
    return <div className="hws-loading">Cargando solicitudes...</div>;
  if (error) return <div className="hws-error">{error}</div>;

  return (
    <div className="hws-wrap">
      {/* ENCABEZADO */}

      {/* TARJETAS RESUMEN */}
      <div className="hws-resumen">
        {[
          {
            label: "Total",
            value: resumen.total,
            icon: "ti-clipboard-list",
            cls: "total",
          },
          {
            label: "Pendientes",
            value: resumen.pendientes,
            icon: "ti-clipboard",
            cls: "pendiente",
          },
          {
            label: "En proceso",
            value: resumen.proceso,
            icon: "ti-refresh",
            cls: "proceso",
          },
          {
            label: "Completadas",
            value: resumen.completadas,
            icon: "ti-circle-check",
            cls: "completada",
          },
          {
            label: "Rechazadas",
            value: resumen.rechazadas,
            icon: "ti-x",
            cls: "rechazada",
          },
        ].map((c) => (
          <div key={c.label} className="hws-card">
            <div className={`hws-card-icon hws-card-icon--${c.cls}`}>
              <i className={`ti ${c.icon}`} />
            </div>
            <div>
              <div className="hws-card-label">{c.label}</div>
              <div className="hws-card-num">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div className="hws-filtros">
        <div className="hws-filtro hws-filtro--buscar">
          <label>Buscar</label>
          <div className="hws-input-wrap">
            <input
              type="text"
              placeholder="Folio, usuario o departamento..."
              value={buscar}
              onChange={(e) => {
                setBuscar(e.target.value);
                alFiltrar();
              }}
            />
            <i className="ti ti-search" />
          </div>
        </div>

        <div className="hws-filtro">
          <label>Estatus</label>
          <select
            value={filtroEstatus}
            onChange={(e) => {
              setFiltroEstatus(e.target.value);
              alFiltrar();
            }}
          >
            <option value="">Todos</option>
            <option>Pendiente</option>
            <option>En proceso</option>
            <option>Completada</option>
            <option>Rechazada</option>
          </select>
        </div>

        <div className="hws-filtro">
          <label>Departamento</label>
          <select
            value={filtroDept}
            onChange={(e) => {
              setFiltroDept(e.target.value);
              alFiltrar();
            }}
          >
            <option value="">Todos</option>
            {departamentos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="hws-filtro">
          <label>Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => {
              setFechaDesde(e.target.value);
              alFiltrar();
            }}
          />
        </div>

        <div className="hws-filtro">
          <label>Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => {
              setFechaHasta(e.target.value);
              alFiltrar();
            }}
          />
        </div>

        <button className="hws-btn hws-btn--ghost" onClick={limpiarFiltros}>
          <i className="ti ti-eraser" /> Limpiar
        </button>
      </div>

      {/* TABLA */}
      <div className="hws-table-wrap">
        <div className="hws-table-scroll">
          {filtradas.length === 0 ? (
            <div className="hws-empty">
              <i className="ti ti-folder-open" />
              <p>
                No se encontraron solicitudes con los filtros seleccionados.
              </p>
            </div>
          ) : (
            <table className="hws-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Departamento</th>
                  <th>Estatus</th>
                  <th style={{ width: 100 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginadas.map((s) => (
                  <>
                    {/* FILA PRINCIPAL */}
                    <tr key={s.idSolicitud} className="hws-row">
                      <td>
                        <button
                          className={`hws-btn-expand ${expandidas.has(s.idSolicitud) ? "open" : ""}`}
                          onClick={() => toggleExpand(s.idSolicitud)}
                        >
                          <i
                            className={`ti ${expandidas.has(s.idSolicitud) ? "ti-minus" : "ti-plus"}`}
                          />
                        </button>
                      </td>
                      <td className="hws-folio">{s.folio}</td>
                      <td>{formatFecha(s.fechaRegistro)}</td>
                      <td>{s.usuario}</td>
                      <td>{s.departamento}</td>
                      <td>
                        <span
                          className={`hws-badge ${claseEstatus(s.estatus)}`}
                        >
                          {s.estatus}
                        </span>
                      </td>
                      <td>
                        <div className="hws-acciones">
                          <button
                            className="hws-btn-icon"
                            title="Ver detalles"
                            onClick={() => setModalConsulta(s)}
                          >
                            <i className="ti ti-eye" />
                          </button>
                          <button
                            className="hws-btn-icon"
                            title="Atender solicitud"
                            onClick={() => abrirAtender(s)}
                          >
                            <i className="ti ti-pencil" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* FILA DETALLE EXPANDIBLE */}
                    {expandidas.has(s.idSolicitud) && (
                      <tr
                        key={`det-${s.idSolicitud}`}
                        className="hws-row-detalle"
                      >
                        <td colSpan={7}>
                          <div className="hws-detalle">
                            <div className="hws-detalle-title">
                              Artículos solicitados
                            </div>
                            <table className="hws-detalle-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  <th>Artículo</th>
                                  <th>Cantidad</th>
                                  <th>Estatus</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.detalle.length === 0 ? (
                                  <tr>
                                    <td colSpan={4}>
                                      Sin artículos registrados.
                                    </td>
                                  </tr>
                                ) : (
                                  s.detalle.map((d, i) => (
                                    <tr key={d.idDetalle}>
                                      <td>{i + 1}</td>
                                      <td>{d.nombreArticulo}</td>
                                      <td>{d.cantidad}</td>
                                      <td>
                                        <span
                                          className={`hws-badge ${claseEstatus(d.estatusDetalle)}`}
                                        >
                                          {d.estatusDetalle}
                                        </span>
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                            <div className="hws-detalle-footer">
                              <span>
                                Total artículos:{" "}
                                <strong>{s.detalle.length}</strong>
                              </span>
                              <span>
                                Total piezas:{" "}
                                <strong>
                                  {s.detalle.reduce(
                                    (a, d) => a + Number(d.cantidad || 0),
                                    0,
                                  )}
                                </strong>
                              </span>
                              <button
                                className="hws-btn hws-btn--primary"
                                onClick={() => abrirAtender(s)}
                              >
                                Ver / Atender{" "}
                                <i className="ti ti-arrow-right" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* PAGINACIÓN */}
        {filtradas.length > 0 && (
          <div className="hws-paginacion">
            <span className="hws-pag-info">
              Mostrando{" "}
              <strong>
                {inicio + 1}–{Math.min(inicio + porPagina, filtradas.length)}
              </strong>{" "}
              de <strong>{filtradas.length}</strong>
            </span>
            <div className="hws-pag-controles">
              <label className="hws-pag-porpagina">
                <select
                  value={porPagina}
                  onChange={(e) => {
                    setPorPagina(Number(e.target.value));
                    setPagina(1);
                  }}
                >
                  {[10, 15, 25, 50].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                por página
              </label>
              <div className="hws-pag-btns">
                <button
                  className="hws-pag-btn"
                  disabled={paginaReal === 1}
                  onClick={() => setPagina((p) => p - 1)}
                >
                  <i className="ti ti-chevron-left" />
                </button>
                {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                  .filter(
                    (n) =>
                      n === 1 ||
                      n === totalPaginas ||
                      Math.abs(n - paginaReal) <= 1,
                  )
                  .reduce((acc, n, i, arr) => {
                    if (i > 0 && n - arr[i - 1] > 1) acc.push("...");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((n, i) =>
                    n === "..." ? (
                      <span key={`e${i}`} className="hws-pag-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={n}
                        className={`hws-pag-btn ${n === paginaReal ? "activo" : ""}`}
                        onClick={() => setPagina(n)}
                      >
                        {n}
                      </button>
                    ),
                  )}
                <button
                  className="hws-pag-btn"
                  disabled={paginaReal === totalPaginas}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  <i className="ti ti-chevron-right" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL CONSULTA RÁPIDA ── */}
      {modalConsulta && (
        <div className="hws-backdrop" onClick={() => setModalConsulta(null)}>
          <div
            className="hws-modal hws-modal--sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hws-modal-head">
              <div>
                <h2>Solicitud {modalConsulta.folio}</h2>
                <p>Consulta rápida</p>
              </div>
              <button
                className="hws-modal-close"
                onClick={() => setModalConsulta(null)}
              >
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="hws-modal-body">
              <div className="hws-consulta-bloque">
                <div className="hws-consulta-label">Motivo</div>
                <div className="hws-consulta-valor">
                  {modalConsulta.motivo || "Sin motivo"}
                </div>
              </div>
              <div className="hws-consulta-bloque">
                <div className="hws-consulta-label">Observaciones</div>
                <div className="hws-consulta-obs">
                  {modalConsulta.observaciones || "Sin observaciones"}
                </div>
              </div>
              <div className="hws-consulta-bloque">
                <div className="hws-consulta-label">Estatus</div>
                <span
                  className={`hws-badge ${claseEstatus(modalConsulta.estatus)}`}
                >
                  {modalConsulta.estatus}
                </span>
              </div>
            </div>
            <div className="hws-modal-foot">
              <button
                className="hws-btn hws-btn--ghost"
                onClick={() => setModalConsulta(null)}
              >
                Cerrar
              </button>
              {/* Solo mostramos rechazar si no está ya rechazada, completada o tiene artículos atendidos */}
              {!["rechazada", "completada"].includes(
                modalConsulta.estatus?.toLowerCase(),
              ) &&
                !modalConsulta.detalle.some(
                  (d) => d.estatusDetalle?.toLowerCase() === "atendida",
                ) && (
                  <button
                    className="hws-btn hws-btn--danger"
                    onClick={handleRechazar}
                  >
                    <i className="ti ti-ban" /> Rechazar solicitud
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ATENDER ── */}
      {modalAtender && (
        <div className="hws-backdrop" onClick={() => setModalAtender(null)}>
          <div className="hws-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hws-modal-head">
              <div>
                <h2>Atender {modalAtender.folio}</h2>
                <p>Actualiza el estatus de cada artículo solicitado.</p>
              </div>
              <button
                className="hws-modal-close"
                onClick={() => setModalAtender(null)}
              >
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="hws-modal-body">
              {/* Alerta dentro del modal */}
              {alertaModal && (
                <div className={`hws-alerta hws-alerta--${alertaModal.tipo}`}>
                  <i
                    className={`ti ${alertaModal.tipo === "success" ? "ti-circle-check" : alertaModal.tipo === "error" ? "ti-circle-x" : "ti-alert-triangle"}`}
                  />
                  <div>
                    <div className="hws-alerta-titulo">
                      {alertaModal.titulo}
                    </div>
                    <div className="hws-alerta-texto">{alertaModal.texto}</div>
                  </div>
                </div>
              )}

              {/* Info del solicitante */}
              <div className="hws-info-grid">
                <div>
                  <span>Solicitante</span>
                  <strong>{modalAtender.usuario}</strong>
                </div>
                <div>
                  <span>Departamento</span>
                  <strong>{modalAtender.departamento || "—"}</strong>
                </div>
                <div>
                  <span>Motivo</span>
                  <strong>{modalAtender.motivo || "—"}</strong>
                </div>
              </div>

              <div className="hws-modal-section">Artículos solicitados</div>

              {/* Un bloque por cada artículo */}
              {modalAtender.detalle.map((d) => {
                const c = camposAtencion[d.idDetalle] || {};
                return (
                  <div key={d.idDetalle} className="hws-atencion-item">
                    <div className="hws-atencion-head">
                      <span className="hws-atencion-art">
                        {d.nombreArticulo}
                      </span>
                      <span className="hws-atencion-cant">
                        Cantidad: <strong>{d.cantidad}</strong>
                      </span>
                    </div>
                    <div className="hws-atencion-grid">
                      <div className="hws-atencion-campo">
                        <label>Estatus del artículo</label>
                        <select
                          value={c.estatus || "Pendiente"}
                          onChange={(e) =>
                            setCampo(d.idDetalle, "estatus", e.target.value)
                          }
                        >
                          <option>Pendiente</option>
                          <option>En proceso</option>
                          <option>Atendida</option>
                          <option>Rechazada</option>
                        </select>
                      </div>
                      {/* Solo mostramos fecha si el estatus es "En proceso" */}
                      {c.estatus === "En proceso" && (
                        <div className="hws-atencion-campo">
                          <label>Fecha estimada de entrega</label>
                          <input
                            type="date"
                            value={c.fecha || ""}
                            onChange={(e) =>
                              setCampo(d.idDetalle, "fecha", e.target.value)
                            }
                          />
                        </div>
                      )}
                      <div className="hws-atencion-campo">
                        <label>Observación</label>
                        <textarea
                          value={c.observacion || ""}
                          placeholder="Ej. Equipo solicitado a proveedor..."
                          onChange={(e) =>
                            setCampo(d.idDetalle, "observacion", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hws-modal-foot">
              <button
                className="hws-btn hws-btn--ghost"
                onClick={() => setModalAtender(null)}
              >
                Cancelar
              </button>
              <button
                className="hws-btn hws-btn--primary"
                onClick={guardarAtencion}
                disabled={guardando}
              >
                {guardando ? (
                  <>
                    <i className="ti ti-loader-2 hws-spin" /> Guardando...
                  </>
                ) : (
                  <>
                    <i className="ti ti-device-floppy" /> Guardar cambios
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
