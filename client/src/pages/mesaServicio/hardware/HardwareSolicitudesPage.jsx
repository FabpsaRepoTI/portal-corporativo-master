import {notifyPendingChanged} from "../../../context/PendingAttention";
import { useState, useEffect, useRef, useCallback, useContext } from "react";
import {
  getSolicitudesHardware,
  atenderSolicitud,
  rechazarSolicitud,
} from "../../../services/solicitudesService.js";
import { AuthContext } from "../../../context/AuthContext";
import "./HardwareSolicitudes.css";

const API = "";

function authH() {
  const t = localStorage.getItem("fabpsa_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

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

function formatFecha(fecha) {
  if (!fecha) return "—";
  const v = String(fecha);
  if (v.includes("T")) return v.replace("T", " ").substring(0, 16);
  return v.substring(0, 16);
}

function fmtFechaLarga(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ─── HILO DE COMENTARIOS ─────────────────────────────────────────────────────
// Usa el mismo endpoint que el usuario — ajusta si el backend tiene ruta propia para TI

function HiloComentariosTI({ solicitudId }) {
  const { user } = useContext(AuthContext);
  const [comentarios, setComentarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const hiloRef = useRef(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      // Misma ruta que usa el usuario — cambiar si el backend expone ruta propia para TI
      const r = await fetch(
        `${API}/api/admin/hardware/${solicitudId}/comentarios`,
        { headers: authH() },
      );
      if (!r.ok) throw new Error();
      const data = await r.json();
      setComentarios(Array.isArray(data) ? data : []);
    } catch {
      setComentarios([]);
    } finally {
      setLoading(false);
    }
  }, [solicitudId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (hiloRef.current)
      hiloRef.current.scrollTop = hiloRef.current.scrollHeight;
  }, [comentarios]);

  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      // Ruta exclusiva para TI — el backend valida area = SISTEMAS
      const r = await fetch(
        `${API}/api/hardware/${solicitudId}/comentario-ti`,
        {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({ comentario: texto.trim() }),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const nuevo = await r.json();
      setComentarios((prev) => [...prev, nuevo]);
      setTexto("");
    } catch (err) {
      setErrorEnvio("No se pudo enviar el comentario. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  if (loading) {
    return (
      <div className="hwt-loading">
        <i className="ti ti-loader-2 hwt-spin" /> Cargando comentarios…
      </div>
    );
  }

  return (
    <div className="hwt-hilo-wrap">
      {/* Mensajes */}
      <div className="hwt-hilo" ref={hiloRef}>
        {comentarios.length === 0 ? (
          <div className="hwt-hilo-empty">
            <i className="ti ti-message-circle-off" />
            Sin mensajes aún. Inicia la conversación con el usuario.
          </div>
        ) : (
          comentarios.map((c, idx) => {
            const esEvento = c.esEvento === true || c.esEvento === 1;
            const esMio =
              c.login === user?.login || c.rol === "sistemas" || c.rol === "ti";

            if (esEvento)
              return (
                <div key={c.id ?? idx} className="hwt-evento">
                  <i className="ti ti-point-filled" />
                  <span>{c.mensaje}</span>
                  <span className="hwt-evento-fecha">
                    {fmtFechaLarga(c.fechaCreacion)}
                  </span>
                </div>
              );

            return (
              <div
                key={c.id ?? idx}
                className={`hwt-mensaje ${esMio ? "mio" : "otro"}`}
              >
                <div className="hwt-msg-header">
                  <div className={`hwt-msg-avatar ${esMio ? "ti" : "usr"}`}>
                    {initials(c.nombre)}
                  </div>
                  <span className={`hwt-msg-rol ${esMio ? "ti" : "usr"}`}>
                    {esMio ? "TI" : "Usuario"}
                  </span>
                  <span className="hwt-msg-nombre">{c.nombre}</span>
                  <span className="hwt-msg-sep">·</span>
                  <span className="hwt-msg-fecha">
                    {fmtFechaLarga(c.fechaCreacion)}
                  </span>
                </div>
                <div className={`hwt-burbuja ${esMio ? "mio" : "otro"}`}>
                  {c.mensaje}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Error de envío */}
      {errorEnvio && (
        <div className="hwt-error-envio">
          <i className="ti ti-alert-triangle" /> {errorEnvio}
        </div>
      )}

      {/* Caja de envío */}
      <div className="hwt-input-wrap">
        <div className="hwt-input-row">
          <textarea
            className="hwt-textarea"
            rows={3}
            placeholder="Escribe un comentario para el usuario… (Enter para enviar)"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={onKey}
          />
          <button
            className="hwt-btn-enviar"
            disabled={!texto.trim() || enviando}
            onClick={enviar}
          >
            {enviando ? (
              <>
                <i className="ti ti-loader-2 hwt-spin" /> Enviando…
              </>
            ) : (
              <>
                <i className="ti ti-send" /> Enviar
              </>
            )}
          </button>
        </div>
        <div className="hwt-input-hint">
          <i className="ti ti-info-circle" />
          El mensaje será visible para el usuario solicitante.
        </div>
      </div>
    </div>
  );
}

// ─── PANEL EXPANDIDO — TABS HORIZONTALES ─────────────────────────────────────

function PanelDetallesTI({ solicitud, onAtender }) {
  const [tab, setTab] = useState("articulos");

  const nMensajes = solicitud.totalMensajes || 0;
  const nArticulos = solicitud.detalle?.length || 0;

  return (
    <div className="hwt-panel">
      {/* Tabs */}
      <div className="hwt-tabs">
        {[
          {
            key: "articulos",
            icon: "ti-package",
            label: "Artículos",
            count: nArticulos,
          },
          {
            key: "comentarios",
            icon: "ti-message",
            label: "Comentarios",
            count: nMensajes,
          },
          { key: "info", icon: "ti-info-circle", label: "Información" },
        ].map((t) => (
          <button
            key={t.key}
            className={`hwt-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            <i className={`ti ${t.icon}`} />
            {t.label}
            {t.count > 0 && <span className="hwt-tab-badge">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="hwt-tab-body">
        {/* ── Artículos ── */}
        {tab === "articulos" && (
          <div className="hwt-arts-wrap">
            {!solicitud.detalle?.length ? (
              <div className="hwt-empty-inline">Sin artículos registrados.</div>
            ) : (
              <div className="hwt-arts-list">
                {solicitud.detalle.map((d, i) => (
                  <div key={d.idDetalle} className="hwt-art-row">
                    <div className="hwt-art-num">{i + 1}</div>
                    <div className="hwt-art-info">
                      <div className="hwt-art-nombre">{d.nombreArticulo}</div>
                      {d.observacionAtencion && (
                        <div className="hwt-art-obs">
                          {d.observacionAtencion}
                        </div>
                      )}
                    </div>
                    <div className="hwt-art-right">
                      <span className="hwt-art-cant">×{d.cantidad}</span>
                      <span
                        className={`hws-badge ${claseEstatus(d.estatusDetalle)}`}
                      >
                        {d.estatusDetalle}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="hwt-arts-footer">
              <span className="hwt-arts-total">
                {nArticulos} artículo{nArticulos !== 1 ? "s" : ""} ·{" "}
                {solicitud.detalle?.reduce(
                  (a, d) => a + Number(d.cantidad || 0),
                  0,
                )}{" "}
                piezas
              </span>
              <button
                className="hws-btn hws-btn--primary"
                onClick={() => onAtender(solicitud)}
              >
                <i className="ti ti-pencil" /> Atender solicitud
              </button>
            </div>
          </div>
        )}

        {/* ── Comentarios ── */}
        {tab === "comentarios" && (
          <HiloComentariosTI solicitudId={solicitud.idSolicitud} />
        )}

        {/* ── Información ── */}
        {tab === "info" && (
          <div className="hwt-info-grid">
            <div className="hwt-info-item">
              <span className="hwt-info-label">Solicitante</span>
              <strong className="hwt-info-val">{solicitud.usuario}</strong>
            </div>
            <div className="hwt-info-item">
              <span className="hwt-info-label">Departamento</span>
              <strong className="hwt-info-val">
                {solicitud.departamento || "—"}
              </strong>
            </div>
            <div className="hwt-info-item">
              <span className="hwt-info-label">Fecha de registro</span>
              <strong className="hwt-info-val">
                {formatFecha(solicitud.fechaRegistro)}
              </strong>
            </div>
            <div className="hwt-info-item">
              <span className="hwt-info-label">Estatus</span>
              <span className={`hws-badge ${claseEstatus(solicitud.estatus)}`}>
                {solicitud.estatus}
              </span>
            </div>
            <div className="hwt-info-item hwt-info-item--full">
              <span className="hwt-info-label">Motivo</span>
              <div className="hwt-info-texto">
                {solicitud.motivo || "Sin motivo especificado."}
              </div>
            </div>
            {solicitud.observaciones && (
              <div className="hwt-info-item hwt-info-item--full">
                <span className="hwt-info-label">Observaciones</span>
                <div className="hwt-info-texto">{solicitud.observaciones}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export default function HardwareSolicitudesPage() {
  const { user } = useContext(AuthContext);

  const [solicitudes, setSolicitudes] = useState([]);
  useEffect(()=>{notifyPendingChanged();},[solicitudes]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [filtroDept, setFiltroDept] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(15);
  const [expandedId, setExpandedId] = useState(null);
  const [modalConsulta, setModalConsulta] = useState(null);
  const [modalAtender, setModalAtender] = useState(null);
  const [camposAtencion, setCamposAtencion] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [alertaModal, setAlertaModal] = useState(null);

  const recargar = useCallback(() => {
    setLoading(true);
    setExpandedId(null);
    getSolicitudesHardware()
      .then(setSolicitudes)
      .catch(() => setError("No se pudieron cargar las solicitudes."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

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

  const departamentos = [
    ...new Set(solicitudes.map((s) => s.departamento).filter(Boolean)),
  ].sort();

  const filtradas = solicitudes.filter((s) => {
    const texto = `${s.folio} ${s.usuario} ${s.departamento}`.toLowerCase();
    const fecha = String(s.fechaRegistro).substring(0, 10);
    return (
      texto.includes(buscar.toLowerCase()) &&
      (!filtroEstatus || s.estatus === filtroEstatus) &&
      (!filtroDept || s.departamento === filtroDept) &&
      (!fechaDesde || fecha >= fechaDesde) &&
      (!fechaHasta || fecha <= fechaHasta)
    );
  });

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginaReal = Math.min(pagina, totalPaginas);
  const inicio = (paginaReal - 1) * porPagina;
  const paginadas = filtradas.slice(inicio, inicio + porPagina);

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
  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

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

  function setCampo(idDetalle, campo, valor) {
    setCamposAtencion((prev) => ({
      ...prev,
      [idDetalle]: { ...prev[idDetalle], [campo]: valor },
    }));
  }

  async function guardarAtencion() {
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

  if (loading)
    return <div className="hws-loading">Cargando solicitudes...</div>;
  if (error) return <div className="hws-error">{error}</div>;

  return (
    <div className="hws-wrap">
      {/* KPI */}
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
        <button
          className="hws-btn hws-btn--ghost hws-btn-refresh-tabla"
          onClick={recargar}
        >
          <i className="ti ti-refresh" /> Actualizar
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
                {paginadas.map((s) => {
                  const isExpanded = expandedId === s.idSolicitud;
                  return (
                    <>
                      <tr key={s.idSolicitud} className="hws-row">
                        <td>
                          <button
                            className={`hws-btn-expand ${isExpanded ? "open" : ""}`}
                            onClick={() => toggleExpand(s.idSolicitud)}
                          >
                            <i
                              className={`ti ${isExpanded ? "ti-minus" : "ti-plus"}`}
                            />
                          </button>
                        </td>
                        <td
                          className="hws-folio hws-td-click"
                          onClick={() => toggleExpand(s.idSolicitud)}
                        >
                          {s.folio}
                        </td>
                        <td
                          className="hws-td-click"
                          onClick={() => toggleExpand(s.idSolicitud)}
                        >
                          {formatFecha(s.fechaRegistro)}
                        </td>
                        <td
                          className="hws-td-click"
                          onClick={() => toggleExpand(s.idSolicitud)}
                        >
                          {s.usuario}
                        </td>
                        <td
                          className="hws-td-click"
                          onClick={() => toggleExpand(s.idSolicitud)}
                        >
                          {s.departamento}
                        </td>
                        <td
                          className="hws-td-click"
                          onClick={() => toggleExpand(s.idSolicitud)}
                        >
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
                              title="Atender"
                              onClick={() => abrirAtender(s)}
                            >
                              <i className="ti ti-pencil" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Panel expandido con tabs */}
                      {isExpanded && (
                        <tr
                          key={`det-${s.idSolicitud}`}
                          className="hws-row-detalle"
                        >
                          <td colSpan={7} style={{ padding: 0 }}>
                            <PanelDetallesTI
                              solicitud={s}
                              onAtender={abrirAtender}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
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

      {/* MODAL CONSULTA */}
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

      {/* MODAL ATENDER */}
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
