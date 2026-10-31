// ============================================================
// VigilanciaPage.jsx
// Módulo: Vigilancia — Reporte de Novedades
// Lista de reportes + creación de nuevo reporte
// ============================================================

import { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import "./VigilanciaPage.css";
import PageHero from "../../components/PageHero";
import arteHero from "../../assets/hero-vigilancia.svg";

const API = (path) => `/api/vigilancia${path}`;
const token = () => localStorage.getItem("fabpsa_token");
const apiFetch = (path, opts = {}) =>
  fetch(API(path), {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...opts.headers,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

const ESTATUS_LABEL = { 1: "Borrador", 2: "Cerrado" };
const ESTATUS_CLASS = { 1: "badge-draft", 2: "badge-closed" };

export default function VigilanciaPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  // ── Estado general ──────────────────────────────────────────
  const [sitios, setSitios] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(null);

  // ── Filtros ─────────────────────────────────────────────────
  const hoy = new Date().toISOString().split("T")[0];
  const hace30 = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .split("T")[0];
  const [filters, setFilters] = useState({
    idSitio: "",
    fechaInicio: hace30,
    fechaFin: hoy,
    estatus: "",
  });

  // ── Nuevo reporte ───────────────────────────────────────────
  // Sitio y fecha se resuelven solos (el sitio sale de los sitios a los que
  // el usuario tiene acceso por su área — normalmente solo uno; la fecha es
  // siempre hoy). El modal de selección solo aparece si el usuario tiene
  // acceso a más de un sitio (el visor general). Turno ya no se captura.
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState({ idSitio: "" });
  const [creando, setCreando] = useState(false);
  const [borradorActivo, setBorradorActivo] = useState(null);

  // ── Toast ───────────────────────────────────────────────────
  const showToast = (msg, tipo = "success") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4500);
  };

  // ── Carga inicial ───────────────────────────────────────────
  useEffect(() => {
    fetchSitios();
  }, []);

  useEffect(() => {
    fetchReportes();
  }, [filters]);

  const fetchSitios = async () => {
    try {
      const res = await apiFetch("/sitios");
      const data = await res.json();
      if (data.ok) setSitios(data.data);
    } catch {
      /* silencioso */
    }
  };

  const fetchReportes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (filters.idSitio) params.set("idSitio", filters.idSitio);
      if (filters.fechaInicio) params.set("fechaInicio", filters.fechaInicio);
      if (filters.fechaFin) params.set("fechaFin", filters.fechaFin);
      if (filters.estatus) params.set("estatus", filters.estatus);

      const res = await apiFetch(`/reportes?${params}`);
      const data = await res.json();
      if (data.ok) setReportes(data.data);
      else setError(data.error || "Error al cargar reportes");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // ── Verificar borrador activo al cambiar sitio en modal ─────
  useEffect(() => {
    if (!modalData.idSitio) {
      setBorradorActivo(null);
      return;
    }
    verificarBorrador(modalData.idSitio);
  }, [modalData.idSitio]);

  const verificarBorrador = async (idSitio) => {
    try {
      const res = await apiFetch(`/borrador-activo/${idSitio}`);
      const data = await res.json();
      setBorradorActivo(data.ok && data.data ? data.data : null);
    } catch {
      setBorradorActivo(null);
    }
  };

  // ── Crear reporte ───────────────────────────────────────────
  // Fecha siempre es hoy (no se captura). idSitio viene de modalData cuando
  // hay varios sitios disponibles, o se resuelve solo si hay uno solo.
  const crearReporte = async (idSitio) => {
    try {
      setCreando(true);
      const res = await apiFetch("/reportes", {
        method: "POST",
        body: {
          idSitio: parseInt(idSitio),
          fechaInicio: hoy,
          login: user.login,
        },
      });
      const data = await res.json();
      if (data.ok) {
        setShowModal(false);
        navigate(`/vigilancia/${data.data.idReporte}`);
      } else {
        showToast(data.error || "Error al crear reporte", "error");
      }
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setCreando(false);
    }
  };

  const handleCrear = () => crearReporte(modalData.idSitio);

  // Botón "Nuevo Reporte": si solo hay un sitio disponible, crea directo
  // sin mostrar modal (salvo que ya haya un borrador abierto, en cuyo caso
  // lo abre en vez de crear uno nuevo); si hay varios (visor general),
  // pide cuál en un modal simple.
  const handleNuevoReporte = async () => {
    if (sitios.length === 1) {
      const idSitio = sitios[0].idSitio;
      try {
        const res = await apiFetch(`/borrador-activo/${idSitio}`);
        const data = await res.json();
        if (data.ok && data.data) {
          navigate(`/vigilancia/${data.data.idReporte}`);
          return;
        }
      } catch {
        /* si falla la verificación, igual se intenta crear */
      }
      crearReporte(idSitio);
    } else {
      setModalData({ idSitio: sitios[0]?.idSitio || "" });
      setShowModal(true);
    }
  };

  const setFilter = (key, val) => setFilters((f) => ({ ...f, [key]: val }));
  const setModal = (key, val) => setModalData((m) => ({ ...m, [key]: val }));

  const formatFecha = (iso) => {
    if (!iso) return "—";
    // El backend puede mandar solo 'YYYY-MM-DD' o un datetime ISO completo
    // (ej. '2026-10-03T00:00:00.000Z') según el driver — tomar solo la
    // parte de fecha evita 'Invalid Date' al reconstruir con hora local.
    const soloFecha = iso.split("T")[0];
    const d = new Date(soloFecha + "T00:00:00");
    return d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleImprimir = async (idReporte, folio) => {
    try {
      setImprimiendo(idReporte);
      const res = await apiFetch(`/reportes/${idReporte}/pdf`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Error al generar el PDF", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revocar un poco después para dar tiempo a que la pestaña nueva lo cargue
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setImprimiendo(null);
    }
  };

  return (
    <div className="vig-page">
      {/* ── Toast ── */}
      {toast && (
        <div className={`vig-toast vig-toast--${toast.tipo}`}>
          <i
            className={`ti ${toast.tipo === "success" ? "ti-circle-check" : toast.tipo === "error" ? "ti-alert-circle" : "ti-info-circle"}`}
          />
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <PageHero
        arte={arteHero}
        eyebrow="Vigilancia"
        titulo="Reporte de"
        resalte="Novedades"
        sub="Reportes de turno de vigilancia por sitio."
        volver={{ to: "/", label: "Volver al inicio" }}
        acciones={
          <>
            <button
              className="vig-btn vig-btn--ghost"
              onClick={() => navigate("/vigilancia/firmas")}
            >
              <i className="ti ti-signature" /> Firmas
            </button>
            <button
              className="vig-btn vig-btn--primary"
              onClick={handleNuevoReporte}
              disabled={creando}
            >
              {creando ? (
                <i className="ti ti-loader-2 vig-spin" />
              ) : (
                <i className="ti ti-plus" />
              )}{" "}
              Nuevo Reporte
            </button>
          </>
        }
      />

      {/* ── Filtros ── */}
      <div className="vig-filters">
        <div className="vig-filter-group">
          <label>Sitio</label>
          <select
            value={filters.idSitio}
            onChange={(e) => setFilter("idSitio", e.target.value)}
          >
            <option value="">Todos</option>
            {sitios.map((s) => (
              <option key={s.idSitio} value={s.idSitio}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="vig-filter-group">
          <label>Desde</label>
          <input
            type="date"
            value={filters.fechaInicio}
            onChange={(e) => setFilter("fechaInicio", e.target.value)}
          />
        </div>
        <div className="vig-filter-group">
          <label>Hasta</label>
          <input
            type="date"
            value={filters.fechaFin}
            onChange={(e) => setFilter("fechaFin", e.target.value)}
          />
        </div>
        <div className="vig-filter-group">
          <label>Estatus</label>
          <select
            value={filters.estatus}
            onChange={(e) => setFilter("estatus", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="1">Borrador</option>
            <option value="2">Cerrado</option>
          </select>
        </div>
        <button className="vig-btn vig-btn--ghost" onClick={fetchReportes}>
          <i className="ti ti-refresh" />
        </button>
      </div>

      {/* ── Tabla ── */}
      <div className="vig-table-wrap">
        {loading ? (
          <div className="vig-center">
            <i className="ti ti-loader-2 vig-spin" /> Cargando reportes…
          </div>
        ) : error ? (
          <div className="vig-center vig-center--error">
            <i className="ti ti-alert-circle" /> {error}
          </div>
        ) : reportes.length === 0 ? (
          <div className="vig-center vig-center--empty">
            <i className="ti ti-clipboard-off" />
            <p>No hay reportes en el período seleccionado.</p>
          </div>
        ) : (
          <table className="vig-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Sitio</th>
                <th>Fecha</th>
                <th>Turno</th>
                <th>Creado por</th>
                <th>Estatus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reportes.map((r) => (
                <tr
                  key={r.idReporte}
                  className="vig-table__row"
                  onClick={() => navigate(`/vigilancia/${r.idReporte}`)}
                >
                  <td className="vig-table__folio">{r.folioReporte}</td>
                  <td>{r.nombreSitio}</td>
                  <td>{formatFecha(r.fechaInicio)}</td>
                  <td>
                    <span className="vig-turno-badge">GENERAL</span>
                  </td>
                  <td className="vig-table__creator">
                    <i className="ti ti-user-circle" /> {r.nombreRegistro}
                  </td>
                  <td>
                    <span className={`vig-badge ${ESTATUS_CLASS[r.estatus]}`}>
                      {ESTATUS_LABEL[r.estatus]}
                    </span>
                  </td>
                  <td
                    className="vig-table__actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.estatus === 2 && (
                      <button
                        className="vigr-icon-btn"
                        title="Imprimir reporte"
                        disabled={imprimiendo === r.idReporte}
                        onClick={() =>
                          handleImprimir(r.idReporte, r.folioReporte)
                        }
                      >
                        {imprimiendo === r.idReporte ? (
                          <i className="ti ti-loader-2 vig-spin" />
                        ) : (
                          <i className="ti ti-printer" />
                        )}
                      </button>
                    )}
                    <i className="ti ti-chevron-right vig-table__arrow" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal nuevo reporte ── */}
      {showModal && (
        <div className="vig-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="vig-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vig-modal__header">
              <h2>
                <i className="ti ti-shield-plus" /> Nuevo Reporte
              </h2>
              <button
                className="vig-modal__close"
                onClick={() => setShowModal(false)}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            <div className="vig-modal__body">
              <div className="vig-form-group">
                <label>
                  Sitio <span className="vig-req">*</span>
                </label>
                <select
                  value={modalData.idSitio}
                  onChange={(e) => setModal("idSitio", e.target.value)}
                >
                  <option value="">Selecciona un sitio…</option>
                  {sitios.map((s) => (
                    <option key={s.idSitio} value={s.idSitio}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {borradorActivo && (
                <div className="vig-alert vig-alert--warning">
                  <i className="ti ti-alert-triangle" />
                  Ya existe un borrador activo para este sitio:{" "}
                  <strong>{borradorActivo.folioReporte}</strong>. Puedes abrirlo
                  en lugar de crear uno nuevo.
                  <button
                    className="vig-btn vig-btn--sm vig-btn--ghost"
                    onClick={() => {
                      setShowModal(false);
                      navigate(`/vigilancia/${borradorActivo.idReporte}`);
                    }}
                  >
                    Abrir borrador
                  </button>
                </div>
              )}
            </div>

            <div className="vig-modal__footer">
              <button
                className="vig-btn vig-btn--ghost"
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </button>
              <button
                className="vig-btn vig-btn--primary"
                onClick={handleCrear}
                disabled={creando || !modalData.idSitio}
              >
                {creando ? (
                  <>
                    <i className="ti ti-loader-2 vig-spin" /> Creando…
                  </>
                ) : (
                  <>
                    <i className="ti ti-check" /> Crear Reporte
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
