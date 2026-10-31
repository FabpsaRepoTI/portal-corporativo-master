// ============================================================
// VigilanciaReporte.jsx
// Módulo: Vigilancia — Detalle y edición del Reporte de Novedades
// ============================================================

import { useState, useEffect, useContext, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import "./VigilanciaReporte.css";
import TabEvidencias from "./TabEvidencias";

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

// Backend almacena tipo como TinyInt; mapeos distintos para ejecutivos y vehículos
const TIPO_MOV_EJEC = { ENTRADA: 1, SALIDA: 2 };
const TIPO_MOV_EJEC_LABEL = { 1: "ENTRADA", 2: "SALIDA" };
const TIPO_MOV_VEH = { SALIDA: 1, ENTRADA: 2 };
const TIPO_MOV_VEH_LABEL = { 1: "SALIDA", 2: "ENTRADA" };

// Máximo 8 movimientos (4 pares salida/entrada) por unidad y reporte —
// mismo límite que ya aplica el backend.
const MOV_SLOTS = 8;
const tipoParaSlot = (i) => (i % 2 === 0 ? "SALIDA" : "ENTRADA");

function siguienteTipoVeh(v) {
  const ultimo = v.movimientos?.length
    ? v.movimientos[v.movimientos.length - 1]
    : null;
  const ultimoTipo = ultimo ? TIPO_MOV_VEH_LABEL[ultimo.tipo] : null;
  return ultimoTipo === null
    ? "SALIDA"
    : ultimoTipo === "SALIDA"
      ? "ENTRADA"
      : "SALIDA";
}

// ── Navegación tipo spreadsheet (↑↓←→) entre celdas de la tabla de Vehículos ──
// Columnas: 0=Observaciones, 1..8=Salida/Entrada 1-4, 9=Km salida, 10=Km entrada.
const VEH_COL = { OBS: 0, SLOT: (i) => 1 + i, KM_SALIDA: 9, KM_ENTRADA: 10 };

function handleVehGridArrowKeys(e) {
  const delta = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }[e.key];
  if (!delta) return false;

  const el = e.currentTarget;
  const row = parseInt(el.dataset.row, 10);
  const col = parseInt(el.dataset.col, 10);
  if (Number.isNaN(row) || Number.isNaN(col)) return false;

  const table = el.closest("table");
  if (!table) return false;

  e.preventDefault();
  const target = table.querySelector(
    `[data-row="${row + delta[0]}"][data-col="${col + delta[1]}"]`,
  );
  target?.focus();
  if (target?.select) target.select();
  return true;
}

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const TABS = [
  { key: "personal", label: "Personal", icon: "ti-users" },
  { key: "ejecutivos", label: "Ejecutivos", icon: "ti-id-badge" },
  { key: "vehiculos", label: "Vehículos", icon: "ti-car" },
  { key: "ubicacion", label: "Ubicación", icon: "ti-map-pin" },
  { key: "rondines", label: "Rondines", icon: "ti-route" },
  { key: "evidencias", label: "Evidencias", icon: "ti-photo" },
];

export default function VigilanciaReporte() {
  const { idReporte } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("personal");
  const [cerrando, setCerrando] = useState(false);

  // ── Toast ───────────────────────────────────────────────────
  const showToast = (msg, tipo = "success") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 4500);
  };

  // ── Carga ───────────────────────────────────────────────────
  useEffect(() => {
    fetchReporte();
  }, [idReporte]);

  // silent=true evita el parpadeo de pantalla completa cuando se
  // refresca tras guardar un movimiento/observación (no es la carga inicial)
  const fetchReporte = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await apiFetch(`/reportes/${idReporte}`);
      const d = await res.json();
      if (d.ok) setData(d.data);
      else setError(d.error || "Error al cargar el reporte");
    } catch {
      setError("Error de conexión");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const refreshSilent = () => fetchReporte(true);

  // Al volver a la pestaña, recargar: otro sitio pudo haber capturado km
  // de las mismas unidades mientras tanto
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchReporte(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [idReporte]);

  // ── Cerrar reporte ──────────────────────────────────────────
  const vigilantesRecibio = data?.vigilantesRecibio || [];

  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const abrirCerrar = () => setConfirmarCierre(true);

  const ejecutarCerrar = async () => {
    try {
      setCerrando(true);
      const res = await apiFetch(`/reportes/${idReporte}/cerrar`, {
        method: "POST",
        body: { login: user.login },
      });
      const d = await res.json();
      if (d.ok) {
        setConfirmarCierre(false);
        setCierreOk(true);
        fetchReporte();
      } else {
        setConfirmarCierre(false);
        showToast(d.error || "Error al cerrar", "error");
      }
    } catch {
      setConfirmarCierre(false);
      showToast("Error de conexión", "error");
    } finally {
      setCerrando(false);
    }
  };

  const [cierreOk, setCierreOk] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  // Abre el PDF en una pestaña nueva y luego regresa al grid. Si falla, se
  // queda aquí para mostrar el error.
  const generarPdfYSalir = async () => {
    try {
      setGenerandoPdf(true);
      const res = await apiFetch(`/reportes/${idReporte}/pdf`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Error al generar el PDF", "error");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setCierreOk(false);
      navigate("/vigilancia");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setGenerandoPdf(false);
    }
  };

  // ── Tabs visibles según config del sitio ───────────────────
  const visibleTabs = () => {
    if (!data) return TABS;
    const cfg = data.reporte || {};
    return TABS.filter((t) => {
      if (t.key === "ubicacion") return cfg.tieneUbicacionIncidencia;
      return true;
    });
  };

  // ── Render ──────────────────────────────────────────────────
  if (loading)
    return (
      <div className="vigr-loading">
        <i className="ti ti-loader-2 vig-spin" /> Cargando reporte…
      </div>
    );
  if (error)
    return (
      <div className="vigr-loading vigr-loading--error">
        <i className="ti ti-alert-circle" /> {error}
        <button
          className="vig-btn vig-btn--ghost"
          onClick={() => navigate("/vigilancia")}
        >
          <i className="ti ti-arrow-left" /> Volver
        </button>
      </div>
    );

  const {
    reporte,
    personal,
    ejecutivos,
    vehiculos,
    rondines,
    ubicaciones,
    catalogoUbicacion,
  } = data;
  const isBorrador = reporte.estatus === 1;
  const tabs = visibleTabs();
  // Los flags de config del sitio (tieneUbicacionIncidencia, tieneSiniestros...)
  // vienen embebidos en `reporte` (JOIN con vig_sitios en el backend) — no
  // existe un objeto `config` separado en la respuesta.
  const config = { sitio: reporte };

  return (
    <div className="vigr-page">
      {toast && (
        <div className={`vig-toast vig-toast--${toast.tipo}`}>
          <i
            className={`ti ${toast.tipo === "success" ? "ti-circle-check" : "ti-alert-circle"}`}
          />
          {toast.msg}
        </div>
      )}

      {/* ── Confirmar cierre ── */}
      {confirmarCierre && (
        <div className="vig-modal-overlay" onClick={() => !cerrando && setConfirmarCierre(false)}>
          <div className="vig-modal cierre-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cierre-modal__icono"><i className="ti ti-lock" /></div>
            <h2>¿Cerrar el reporte {reporte.folioReporte}?</h2>
            <p>Una vez cerrado ya no podrás editarlo. Se imprimirá con los datos actuales.</p>
            <div className="cierre-modal__acciones">
              <button className="vig-btn vig-btn--ghost" disabled={cerrando} onClick={() => setConfirmarCierre(false)}>
                Cancelar
              </button>
              <button className="vig-btn vig-btn--primary" disabled={cerrando} onClick={ejecutarCerrar}>
                {cerrando ? <><i className="ti ti-loader-2 vig-spin" /> Cerrando…</> : <><i className="ti ti-lock" /> Sí, cerrar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reporte cerrado ── */}
      {cierreOk && (
        <div className="vig-modal-overlay cierre-ok">
          <div className="cierre-ok__card">
            <div className="cierre-ok__check"><i className="ti ti-check" /></div>
            <h2>¡Reporte cerrado!</h2>
            <p>¿Quieres generar el PDF de {reporte.folioReporte} ahora?</p>
            <div className="cierre-modal__acciones">
              <button className="vig-btn vig-btn--ghost" disabled={generandoPdf} onClick={() => navigate("/vigilancia")}>
                Sin abrir
              </button>
              <button className="vig-btn vig-btn--primary" disabled={generandoPdf} onClick={generarPdfYSalir}>
                {generandoPdf ? <><i className="ti ti-loader-2 vig-spin" /> Generando…</> : <><i className="ti ti-printer" /> Generar PDF</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Breadcrumb + acciones ── */}
      <div className="vigr-topbar">
        <button
          className="vig-btn vig-btn--ghost vig-btn--sm"
          onClick={() => navigate("/vigilancia")}
        >
          <i className="ti ti-arrow-left" /> Reportes
        </button>
        {isBorrador && (
          <button
            className="vig-btn vig-btn--danger"
            onClick={abrirCerrar}
            disabled={cerrando}
          >
            {cerrando ? (
              <>
                <i className="ti ti-loader-2 vig-spin" /> Cerrando…
              </>
            ) : (
              <>
                <i className="ti ti-lock" /> Cerrar Reporte
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Cabecera del reporte ── */}
      <div className="vigr-cabecera">
        <div className="vigr-cabecera__left">
          <i className="ti ti-shield-lock vigr-cabecera__icon" />
          <div>
            <div className="vigr-cabecera__folio">{reporte.folioReporte}</div>
            <div className="vigr-cabecera__sitio">{reporte.nombreSitio}</div>
          </div>
        </div>
        <div className="vigr-cabecera__meta">
          <div className="vigr-meta-item">
            <i className="ti ti-calendar" />
            {fmt(reporte.fechaInicio)}
            {reporte.fechaFin && (
              <> <span className="vigr-meta-sep">→</span> {fmt(reporte.fechaFin)}</>
            )}
          </div>
          <div className="vigr-meta-item">
            <i className="ti ti-user" />
            {reporte.loginCreador || reporte.loginRegistro}
          </div>
          <span
            className={`vig-badge ${isBorrador ? "badge-draft" : "badge-closed"}`}
          >
            {isBorrador ? "Borrador" : "Cerrado"}
          </span>
        </div>
      </div>

      {/* ── Cabecera editable (solo Borrador) ── */}
      {isBorrador && (
        <CabeceraEditable
          reporte={reporte}
          idReporte={idReporte}
          onSave={refreshSilent}
          showToast={showToast}
        />
      )}

      {/* ── Tabs ── */}
      <div className="vigr-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`vigr-tab ${activeTab === t.key ? "vigr-tab--active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            <i className={`ti ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Contenido del tab activo ── */}
      <div className="vigr-tab-content">
        {activeTab === "personal" && (
          <TabPersonal
            personal={personal}
            config={config}
            idReporte={idReporte}
            isBorrador={isBorrador}
            onSave={refreshSilent}
            showToast={showToast}
          />
        )}
        {activeTab === "ejecutivos" && (
          <TabEjecutivos
            ejecutivos={ejecutivos}
            isBorrador={isBorrador}
            onSave={refreshSilent}
            showToast={showToast}
          />
        )}
        {activeTab === "vehiculos" && (
          <TabVehiculos
            key={reporte.idReporte}
            vehiculos={vehiculos}
            isBorrador={isBorrador}
            onSave={refreshSilent}
            showToast={showToast}
          />
        )}
        {activeTab === "rondines" && (
          <>
            <TabRondines
              rondines={rondines}
              isBorrador={isBorrador}
              onSave={refreshSilent}
              showToast={showToast}
            />
            <ResponsablesReporte
              reporte={reporte}
              idReporte={idReporte}
              vigilantesRecibio={vigilantesRecibio}
              isBorrador={isBorrador}
              onSave={refreshSilent}
              showToast={showToast}
            />
            {config?.sitio?.tieneObservacionesGen && (
              <ObservacionesGenerales
                reporte={reporte}
                idReporte={idReporte}
                isBorrador={isBorrador}
                onSave={refreshSilent}
                showToast={showToast}
              />
            )}
          </>
        )}
        {activeTab === "ubicacion" && (
          <TabUbicacion
            idReporte={idReporte}
            ubicaciones={ubicaciones}
            vehiculos={catalogoUbicacion || []}
            isBorrador={isBorrador}
            onSave={refreshSilent}
            showToast={showToast}
          />
        )}
        {activeTab === "siniestros" && (
          <TabSiniestros
            idReporte={idReporte}
            config={config}
            isBorrador={isBorrador}
            showToast={showToast}
          />
        )}
        {activeTab === "evidencias" && (
          <TabEvidencias
            idReporte={idReporte}
            isBorrador={isBorrador}
            user={user}
            showToast={showToast}
          />
        )}
      </div>

    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RESPONSABLES / FIRMAS DEL TURNO (footer tipo PDF)
// ═══════════════════════════════════════════════════════════
// Solo nombres — la firma gráfica se estampa al generar el PDF, no aquí.
function ResponsablesReporte({
  reporte,
  idReporte,
  vigilantesRecibio,
  isBorrador,
  onSave,
  showToast,
}) {
  const jefe = vigilantesRecibio.find((v) => v.esJefeVigilancia);
  const [recibio, setRecibio] = useState(reporte.recibio || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRecibio(reporte.recibio || "");
  }, [reporte.recibio]);

  const guardarRecibio = async (val) => {
    setRecibio(val);
    try {
      setSaving(true);
      const res = await apiFetch(`/reportes/${idReporte}/recibio`, {
        method: "PATCH",
        body: { recibio: val },
      });
      const d = await res.json();
      if (d.ok) onSave();
      else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vigr-section">
      <div className="vigr-section__head">
        <h3>
          <i className="ti ti-signature" /> Responsables del Turno
        </h3>
      </div>
      <div className="vigr-responsables-grid">
        <div className="vigr-responsable-card">
          <div className="vigr-responsable-card__nombre">
            {reporte.reporto || (
              <em className="vigr-responsable-card__hint">—</em>
            )}
          </div>
          <div className="vigr-responsable-card__label">
            Reportó — Vigilante en turno
          </div>
        </div>

        <div className="vigr-responsable-card">
          {isBorrador && vigilantesRecibio.length > 0 ? (
            <select
              className="vigr-select-sm"
              value={recibio}
              onChange={(e) => guardarRecibio(e.target.value)}
              disabled={saving}
            >
              <option value="">Selecciona…</option>
              {vigilantesRecibio.map((v) => (
                <option key={v.login} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="vigr-responsable-card__nombre">
              {reporte.recibio || (
                <em className="vigr-responsable-card__hint">
                  {isBorrador ? "Pendiente de seleccionar" : "Sin registrar"}
                </em>
              )}
            </div>
          )}
          <div className="vigr-responsable-card__label">
            Recibió — Vigilante que recibe
          </div>
        </div>

        <div className="vigr-responsable-card">
          <div className="vigr-responsable-card__nombre">
            {reporte.enterado1 || jefe?.name || (
              <em className="vigr-responsable-card__hint">—</em>
            )}
          </div>
          <div className="vigr-responsable-card__label">
            Enterado — Jefe de Vigilancia
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CABECERA EDITABLE
// ═══════════════════════════════════════════════════════════
function CabeceraEditable({ reporte, idReporte, onSave, showToast }) {
  const fechaInicioStr = toDateStr(reporte.fechaInicio);
  const fechaFinStr    = toDateStr(reporte.fechaFin) || addDays(fechaInicioStr, 1);

  // "Reportó" no se edita aquí: siempre es quien creó el reporte (fijo
  // desde el backend al momento de crearlo).
  const [form, setForm] = useState({
    fechaInicio: fechaInicioStr,
    fechaFin:    fechaFinStr,
  });
  const [saving, setSaving] = useState(false);
  const [open, setOpen]     = useState(false);

  // Al cambiar fechaInicio, auto-ajustar fechaFin = +1 día
  const setFechaInicio = (val) => {
    setForm((f) => ({
      ...f,
      fechaInicio: val,
      fechaFin: addDays(val, 1),
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await apiFetch(`/reportes/${idReporte}/cabecera`, {
        method: "PATCH",
        body: form,
      });
      const d = await res.json();
      if (d.ok) {
        showToast("Cabecera actualizada");
        setOpen(false);
        onSave();
      } else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vigr-cab-edit">
      <button
        className="vig-btn vig-btn--ghost vig-btn--sm"
        onClick={() => setOpen((o) => !o)}
      >
        <i className={`ti ${open ? "ti-chevron-up" : "ti-edit"}`} />
        {open ? "Cancelar" : "Editar cabecera"}
      </button>
      {open && (
        <div className="vigr-cab-edit__form">
          <div className="vig-form-group">
            <label>Fecha inicio</label>
            <input
              type="date"
              value={form.fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div className="vig-form-group">
            <label>Fecha fin</label>
            <input
              type="date"
              value={form.fechaFin}
              onChange={(e) => setForm((f) => ({ ...f, fechaFin: e.target.value }))}
            />
          </div>
          <button
            className="vig-btn vig-btn--primary vig-btn--sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <i className="ti ti-loader-2 vig-spin" />
            ) : (
              <i className="ti ti-check" />
            )}{" "}
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: PERSONAL
// ═══════════════════════════════════════════════════════════
const PERSONAL_AREAS = [
  { key: "deptAdministracion", label: "Administración",        desc: "Personal de administración que permaneció en instalaciones" },
  { key: "deptAlmacen",        label: "Almacén",               desc: "Personal de almacén" },
  { key: "deptReparto",        label: "Reparto",               desc: "Personal de reparto" },
  { key: "retardos",           label: "Retardos",              desc: "Personal que se regresó por retardos" },
  { key: "faltas",             label: "Faltas",                desc: "Personas que faltaron a sus labores" },
  { key: "incapacitados",      label: "Personal incapacitado", desc: "Personal incapacitado durante el turno" },
  { key: "pasesAutorizados",   label: "Pases autorizados",     desc: "Personas que salieron con pase autorizado" },
];

function TabPersonal({ personal, idReporte, isBorrador, onSave, showToast, onDirtyChange }) {
  const [form, setForm]     = useState(personal || {});
  const [dirty, setDirty]   = useState(false);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(personal || {});

  useEffect(() => {
    setForm(personal || {});
    savedRef.current = personal || {};
    setDirty(false);
  }, [personal]);

  useEffect(() => {
    if (onDirtyChange) onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const set = (key, val) => {
    setForm((f) => {
      const next = { ...f, [key]: val };
      const isDirty = Object.keys({ ...next, ...savedRef.current }).some(
        (k) => (next[k] ?? "") !== (savedRef.current[k] ?? "")
      );
      setDirty(isDirty);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const body = {
        deptAdministracion: form.deptAdministracion || "",
        deptAlmacen:        form.deptAlmacen        || "",
        deptReparto:        form.deptReparto         || "",
        retardos:           form.retardos            || "",
        faltas:             form.faltas              || "",
        incapacitados:      form.incapacitados       || "",
        pasesAutorizados:   form.pasesAutorizados    || "",
        personalExtraNum:   parseInt(form.personalExtraNum) || 0,
        personalExtraDepts: form.personalExtraDepts  || "",
        autorizadoPor:      form.autorizadoPor       || "",
        horarioAutorizado:  form.horarioAutorizado   || "",
      };
      const res = await apiFetch(`/reportes/${idReporte}/personal`, {
        method: "PUT",
        body,
      });
      const d = await res.json();
      if (d.ok) {
        savedRef.current = { ...form };
        setDirty(false);
        showToast("Personal guardado");
        onSave();
      } else {
        showToast(d.error || "Error al guardar", "error");
      }
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setForm({ ...savedRef.current });
    setDirty(false);
  };

  return (
    <div className="vigr-section">
      <div className="vigr-section__head">
        <div className="vigr-section__title-group">
          <i className="ti ti-users" />
          <div>
            <h3>Personal del Turno</h3>
            <p className="vigr-section__subtitle">Personal que permaneció en instalaciones y novedades del turno</p>
          </div>
        </div>
        {isBorrador && (
          <div className="vigr-section__actions">
            {dirty && (
              <button className="vig-btn vig-btn--ghost vig-btn--sm" onClick={handleDiscard}>
                <i className="ti ti-x" /> Descartar
              </button>
            )}
            <button
              className={`vig-btn vig-btn--sm ${dirty ? "vig-btn--primary" : "vig-btn--ghost"}`}
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving
                ? <><i className="ti ti-loader-2 vig-spin" /> Guardando…</>
                : <><i className={`ti ${dirty ? "ti-device-floppy" : "ti-check"}`} /> {dirty ? "Guardar" : "Guardado"}</>
              }
            </button>
          </div>
        )}
      </div>

      {dirty && isBorrador && (
        <div className="vigr-dirty-banner">
          <i className="ti ti-alert-circle" />
          Tienes cambios sin guardar en esta sección
        </div>
      )}

      <div className="vigr-personal-grid">
        {PERSONAL_AREAS.map(({ key, label, desc }) => (
          <div key={key} className="vigr-personal-field">
            <div className="vigr-personal-field__label">
              <span className="vigr-personal-field__name">{label}</span>
              <span className="vigr-personal-field__desc">{desc}</span>
            </div>
            {isBorrador ? (
              <textarea
                className="vigr-textarea"
                value={form[key] ?? ""}
                onChange={(e) => set(key, e.target.value)}
                placeholder="NINGUNO"
                rows={2}
              />
            ) : (
              <div className="vigr-personal-field__value">
                {form[key] || <span className="vigr-muted">NINGUNO</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="vigr-personal-extra">
        <div className="vigr-personal-extra__header">
          <i className="ti ti-clock-plus" />
          <span>Personal laborando fuera de horario</span>
        </div>
        <div className="vigr-personal-extra__row">
          <div className="vigr-personal-field vigr-personal-field--sm">
            <div className="vigr-personal-field__label">
              <span className="vigr-personal-field__name">No. de personas</span>
            </div>
            {isBorrador ? (
              <input
                type="number"
                min="0"
                className="vigr-input"
                value={form.personalExtraNum ?? 0}
                onChange={(e) => set("personalExtraNum", e.target.value)}
              />
            ) : (
              <div className="vigr-personal-field__value">{form.personalExtraNum ?? 0}</div>
            )}
          </div>
          <div className="vigr-personal-field vigr-personal-field--grow">
            <div className="vigr-personal-field__label">
              <span className="vigr-personal-field__name">Departamentos</span>
            </div>
            {isBorrador ? (
              <input
                type="text"
                className="vigr-input"
                value={form.personalExtraDepts ?? ""}
                onChange={(e) => set("personalExtraDepts", e.target.value)}
                placeholder="NINGUNO"
              />
            ) : (
              <div className="vigr-personal-field__value">
                {form.personalExtraDepts || <span className="vigr-muted">NINGUNO</span>}
              </div>
            )}
          </div>
        </div>
        <div className="vigr-personal-extra__row">
          <div className="vigr-personal-field vigr-personal-field--grow">
            <div className="vigr-personal-field__label">
              <span className="vigr-personal-field__name">Autorizado por</span>
            </div>
            {isBorrador ? (
              <input
                type="text"
                className="vigr-input"
                value={form.autorizadoPor ?? ""}
                onChange={(e) => set("autorizadoPor", e.target.value)}
                placeholder="Nombre del autorizante"
              />
            ) : (
              <div className="vigr-personal-field__value">
                {form.autorizadoPor || <span className="vigr-muted">—</span>}
              </div>
            )}
          </div>
          <div className="vigr-personal-field vigr-personal-field--grow">
            <div className="vigr-personal-field__label">
              <span className="vigr-personal-field__name">Horario autorizado</span>
            </div>
            {isBorrador ? (
              <input
                type="text"
                className="vigr-input"
                value={form.horarioAutorizado ?? ""}
                onChange={(e) => set("horarioAutorizado", e.target.value)}
                placeholder="Ej. 18:00 – 22:00"
              />
            ) : (
              <div className="vigr-personal-field__value">
                {form.horarioAutorizado || <span className="vigr-muted">—</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Popover de acción rápida, montado vía portal para no quedar
// recortado por el overflow:hidden de las tarjetas (.vigr-card) ──
function QuickActionPopover({ anchorRef, onClose, children }) {
  const popRef = useRef(null);
  const [style, setStyle] = useState(null);

  useEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      const width = 220;
      setStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: Math.min(
          Math.max(8, rect.right - width),
          window.innerWidth - width - 8,
        ),
        width,
      });
    }

    const handlePointer = (e) => {
      if (
        popRef.current?.contains(e.target) ||
        anchorRef.current?.contains(e.target)
      )
        return;
      onClose();
    };
    const handleKey = (e) => e.key === "Escape" && onClose();

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchorRef, onClose]);

  if (!style) return null;

  return createPortal(
    <div
      ref={popRef}
      className="vigr-quick-popover vigr-quick-popover--portal"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: EJECUTIVOS
// ═══════════════════════════════════════════════════════════
function TabEjecutivos({ ejecutivos, isBorrador, onSave, showToast }) {
  const [expanded, setExpanded] = useState(null);

  const toggle = (id) => setExpanded((e) => (e === id ? null : id));

  return (
    <div className="vigr-section">
      <div className="vigr-section__head">
        <h3>
          <i className="ti ti-id-badge" /> Ejecutivos
        </h3>
      </div>
      {ejecutivos?.length === 0 && (
        <div
          className="vig-center vig-center--empty"
          style={{ padding: "2rem" }}
        >
          <i className="ti ti-user-off" />
          <p>Sin ejecutivos configurados para este sitio.</p>
        </div>
      )}
      {ejecutivos?.map((ej) => (
        <EjecutivoCard
          key={ej.idEjecutivoRep}
          ej={ej}
          open={expanded === ej.idEjecutivoRep}
          onToggle={() => toggle(ej.idEjecutivoRep)}
          isBorrador={isBorrador}
          onSave={onSave}
          showToast={showToast}
        />
      ))}
    </div>
  );
}

function EjecutivoCard({ ej, open, onToggle, isBorrador, onSave, showToast }) {
  const [obs, setObs] = useState(ej.observaciones || "");
  const [savingObs, setSavingObs] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickHora, setQuickHora] = useState(nowHHMM());
  const [savingMov, setSavingMov] = useState(false);
  const quickBtnRef = useRef(null);

  const ultimoMov = ej.movimientos?.length
    ? ej.movimientos[ej.movimientos.length - 1]
    : null;
  const ultimoTipo = ultimoMov ? TIPO_MOV_EJEC_LABEL[ultimoMov.tipo] : null;
  // Sin movimientos → la primera acción del día es ENTRADA.
  // Con movimientos → alterna respecto al último (entrada↔salida).
  const siguienteTipo =
    ultimoTipo === null ? "ENTRADA" : ultimoTipo === "SALIDA" ? "ENTRADA" : "SALIDA";

  // Un clic registra YA con la hora actual — es el caso normal.
  const registrarAhora = async (e) => {
    e.stopPropagation();
    await postMovimiento(nowHHMM());
  };

  // Icono de reloj: para el caso excepcional de capturar con hora distinta
  // a la actual (ej. "se me olvidó registrarlo hace 10 minutos").
  const openQuick = (e) => {
    e.stopPropagation();
    setQuickHora(nowHHMM());
    setQuickOpen(true);
  };

  const confirmQuick = async () => {
    if (!quickHora) {
      showToast("Indica la hora del movimiento", "warning");
      return;
    }
    await postMovimiento(quickHora);
    setQuickOpen(false);
  };

  const postMovimiento = async (hora) => {
    try {
      setSavingMov(true);
      const res = await apiFetch(
        `/ejecutivos/${ej.idEjecutivoRep}/movimientos`,
        {
          method: "POST",
          body: { tipo: TIPO_MOV_EJEC[siguienteTipo], hora },
        },
      );
      const d = await res.json();
      if (d.ok) {
        showToast(`${siguienteTipo === "SALIDA" ? "Salida" : "Entrada"} registrada`);
        onSave();
      } else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSavingMov(false);
    }
  };

  const delMov = async (id) => {
    try {
      const res = await apiFetch(`/ejecutivos/movimientos/${id}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (d.ok) {
        showToast("Eliminado");
        onSave();
      } else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    }
  };

  const editMovHora = async (id, tipoNumerico, hora) => {
    try {
      const res = await apiFetch(`/ejecutivos/movimientos/${id}`, {
        method: "PUT",
        body: { tipo: tipoNumerico, hora },
      });
      const d = await res.json();
      if (d.ok) onSave();
      else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    }
  };

  const saveObs = async () => {
    try {
      setSavingObs(true);
      const res = await apiFetch(
        `/ejecutivos/${ej.idEjecutivoRep}/observaciones`,
        {
          method: "PUT",
          body: { observaciones: obs },
        },
      );
      const d = await res.json();
      if (d.ok) {
        showToast("Observación guardada");
        onSave();
      } else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSavingObs(false);
    }
  };

  return (
    <div className="vigr-card">
      <div className="vigr-card__header" onClick={onToggle}>
        <div className="vigr-card__title">
          <i className="ti ti-user-circle" />
          <span>{ej.nombre}</span>
          {ultimoMov ? (
            <span
              className={`vigr-status-badge vigr-status-badge--${ultimoTipo.toLowerCase()}`}
            >
              <i
                className={`ti ${ultimoTipo === "SALIDA" ? "ti-arrow-up-right" : "ti-arrow-down-left"}`}
              />
              {ultimoTipo === "SALIDA" ? "Fuera" : "En sitio"} · {ultimoMov.hora}
            </span>
          ) : (
            <span className="vigr-status-badge vigr-status-badge--none">
              Sin movimientos
            </span>
          )}
        </div>
        <div className="vigr-card__actions" onClick={(e) => e.stopPropagation()}>
          {isBorrador && (
            <div className="vigr-quick-wrap">
              <button
                className="vig-btn vig-btn--primary vig-btn--sm"
                onClick={registrarAhora}
                disabled={savingMov}
              >
                {savingMov ? (
                  <i className="ti ti-loader-2 vig-spin" />
                ) : (
                  <i
                    className={`ti ${siguienteTipo === "SALIDA" ? "ti-arrow-up-right" : "ti-arrow-down-left"}`}
                  />
                )}
                Registrar {siguienteTipo === "SALIDA" ? "salida" : "entrada"} ahora
              </button>
              <button
                ref={quickBtnRef}
                className="vigr-icon-btn"
                onClick={openQuick}
                title="Registrar con otra hora"
              >
                <i className="ti ti-clock" />
              </button>
              {quickOpen && (
                <QuickActionPopover
                  anchorRef={quickBtnRef}
                  onClose={() => setQuickOpen(false)}
                >
                  <label>Hora</label>
                  <input
                    type="time"
                    className="vigr-input-sm"
                    autoFocus
                    value={quickHora}
                    onChange={(e) => setQuickHora(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && confirmQuick()}
                  />
                  <div className="vigr-quick-popover__actions">
                    <button
                      className="vig-btn vig-btn--ghost vig-btn--sm"
                      onClick={() => setQuickOpen(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="vig-btn vig-btn--primary vig-btn--sm"
                      onClick={confirmQuick}
                      disabled={savingMov}
                    >
                      {savingMov ? (
                        <i className="ti ti-loader-2 vig-spin" />
                      ) : (
                        "Confirmar"
                      )}
                    </button>
                  </div>
                </QuickActionPopover>
              )}
            </div>
          )}
          <i
            className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"} vigr-card__arrow`}
          />
        </div>
      </div>

      {open && (
        <div className="vigr-card__body">
          {/* Movimientos */}
          <div className="vigr-sub-head">Historial de movimientos</div>
          {ej.movimientos?.length === 0 && (
            <p className="vigr-empty-sm">Sin movimientos registrados.</p>
          )}
          {ej.movimientos?.map((m) => (
            <div key={m.idMovEjec} className="vigr-mov-row">
              <span
                className={`vigr-mov-tipo vigr-mov-tipo--${TIPO_MOV_EJEC_LABEL[m.tipo].toLowerCase()}`}
              >
                <i
                  className={`ti ${TIPO_MOV_EJEC_LABEL[m.tipo] === "SALIDA" ? "ti-arrow-up-right" : "ti-arrow-down-left"}`}
                />
                {TIPO_MOV_EJEC_LABEL[m.tipo]}
              </span>
              {isBorrador ? (
                <input
                  type="time"
                  className="vigr-mov-hora vigr-mov-hora--edit"
                  defaultValue={m.hora}
                  onBlur={(e) =>
                    e.target.value !== m.hora &&
                    editMovHora(m.idMovEjec, m.tipo, e.target.value)
                  }
                />
              ) : (
                <span className="vigr-mov-hora">{m.hora}</span>
              )}
              {isBorrador && (
                <button
                  className="vigr-icon-btn vigr-icon-btn--danger"
                  onClick={() => delMov(m.idMovEjec)}
                >
                  <i className="ti ti-trash" />
                </button>
              )}
            </div>
          ))}

          {/* Observaciones */}
          <div className="vigr-sub-head" style={{ marginTop: "1rem" }}>
            Observaciones
          </div>
          {isBorrador ? (
            <div className="vigr-obs-row">
              <textarea
                className="vigr-textarea"
                rows={2}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Observaciones del ejecutivo…"
              />
              <button
                className="vig-btn vig-btn--ghost vig-btn--sm"
                onClick={saveObs}
                disabled={savingObs}
              >
                {savingObs ? (
                  <i className="ti ti-loader-2 vig-spin" />
                ) : (
                  <i className="ti ti-device-floppy" />
                )}{" "}
                Guardar
              </button>
            </div>
          ) : (
            <p className="vigr-obs-text">
              {ej.observaciones || "Sin observaciones."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: VEHÍCULOS
// ═══════════════════════════════════════════════════════════
function TabVehiculos({ vehiculos, isBorrador, onSave, showToast }) {
  const [selected, setSelected] = useState(() => new Set());
  const [bulkHoraManual, setBulkHoraManual] = useState(null); // null = usar "ahora"
  const [bulkSaving, setBulkSaving] = useState(false);

  const toggleSelect = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    if (selected.size === (vehiculos?.length || 0)) setSelected(new Set());
    else setSelected(new Set((vehiculos || []).map((v) => v.idVehiculoRep)));
  };

  const aplicarLote = async () => {
    const hora = bulkHoraManual || nowHHMM();
    const objetivo = (vehiculos || []).filter((v) =>
      selected.has(v.idVehiculoRep),
    );
    if (objetivo.length === 0) return;
    try {
      setBulkSaving(true);
      const resultados = await Promise.all(
        objetivo.map((v) =>
          apiFetch(`/vehiculos/${v.idVehiculoRep}/movimientos`, {
            method: "POST",
            body: {
              tipo: TIPO_MOV_VEH[siguienteTipoVeh(v)],
              hora,
            },
          }).then((r) => r.json()),
        ),
      );
      const fallos = resultados.filter((r) => !r.ok).length;
      if (fallos === 0) {
        showToast(`Movimiento registrado en ${objetivo.length} unidades`);
      } else {
        showToast(
          `${objetivo.length - fallos} registrados, ${fallos} con error`,
          "warning",
        );
      }
      setSelected(new Set());
      setBulkHoraManual(null);
      onSave();
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <div className="vigr-section">
      <div className="vigr-section__head">
        <h3>
          <i className="ti ti-car" /> Vehículos
        </h3>
      </div>
      {vehiculos?.length === 0 && (
        <div
          className="vig-center vig-center--empty"
          style={{ padding: "2rem" }}
        >
          <i className="ti ti-car-off" />
          <p>Sin vehículos configurados para este sitio.</p>
        </div>
      )}
      {vehiculos?.length > 0 && (
        <>
          {isBorrador && (
            <div className="vigr-veh-toolbar">
              <span className="vigr-veh-toolbar__count">
                {selected.size > 0
                  ? `${selected.size} seleccionados`
                  : "Selecciona unidades para aplicar una acción en lote"}
              </span>
              {selected.size > 0 && (
                <div className="vigr-veh-toolbar__action">
                  <button
                    className="vig-btn vig-btn--primary vig-btn--sm"
                    onClick={aplicarLote}
                    disabled={bulkSaving}
                  >
                    {bulkSaving ? (
                      <i className="ti ti-loader-2 vig-spin" />
                    ) : (
                      <i className="ti ti-check" />
                    )}{" "}
                    Registrar {bulkHoraManual ? `a las ${bulkHoraManual}` : "ahora"} en{" "}
                    {selected.size}
                  </button>
                  {bulkHoraManual === null ? (
                    <button
                      className="vigr-icon-btn"
                      title="Usar otra hora"
                      onClick={() => setBulkHoraManual(nowHHMM())}
                    >
                      <i className="ti ti-clock" />
                    </button>
                  ) : (
                    <input
                      type="time"
                      className="vigr-input-sm"
                      autoFocus
                      value={bulkHoraManual}
                      onChange={(e) => setBulkHoraManual(e.target.value)}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          <div className="vigr-veh-table-wrap">
            <table className="vigr-veh-table">
              <thead>
                <tr>
                  {isBorrador && (
                    <th className="vigr-veh-th--check">
                      <input
                        type="checkbox"
                        checked={
                          selected.size > 0 &&
                          selected.size === vehiculos.length
                        }
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th>Unidad</th>
                  <th>Observaciones</th>
                  {Array.from({ length: MOV_SLOTS }).map((_, i) => (
                    <th key={i} className="vigr-veh-th--mov">
                      {tipoParaSlot(i) === "SALIDA" ? "Salida" : "Entrada"}
                    </th>
                  ))}
                  <th>Km salida</th>
                  <th>Km entrada</th>
                </tr>
              </thead>
              <tbody>
                {vehiculos.map((v, rowIndex) => (
                  <VehiculoRow
                    key={v.idVehiculoRep}
                    v={v}
                    rowIndex={rowIndex}
                    isBorrador={isBorrador}
                    onSave={onSave}
                    showToast={showToast}
                    selected={selected.has(v.idVehiculoRep)}
                    onToggleSelect={() => toggleSelect(v.idVehiculoRep)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function VehiculoRow({
  v,
  rowIndex,
  isBorrador,
  onSave,
  showToast,
  selected,
  onToggleSelect,
}) {
  const [obs, setObs] = useState(v.observacion || "");
  // Sin km salida guardado se sugiere el último km válido de la unidad
  // (capturado en cualquier sitio). La sugerencia no se guarda sola: se
  // confirma al capturar el km entrada, al editarla o al registrar la salida.
  const kmSalidaServidor = v.kmSalida ?? v.kmUltimo ?? "";
  const [kmSalida, setKmSalida] = useState(kmSalidaServidor);
  const [kmEntrada, setKmEntrada] = useState(v.kmEntrada ?? "");
  const [salidaTocada, setSalidaTocada] = useState(false);
  const salidaEsSugerida =
    v.kmSalida == null && v.kmUltimo != null && !salidaTocada;

  // Refleja lo que guardaron otros sitios/turnos al recargar el reporte
  useEffect(() => {
    if (!salidaTocada) setKmSalida(kmSalidaServidor);
  }, [kmSalidaServidor]);
  useEffect(() => {
    setKmEntrada(v.kmEntrada ?? "");
  }, [v.kmEntrada]);
  const [savingVeh, setSavingVeh] = useState(false);
  const [slotDraft, setSlotDraft] = useState({}); // { [slot]: "HH:MM" } valores en edición aún no guardados
  const [savingSlot, setSavingSlot] = useState(null);
  const [editingSlot, setEditingSlot] = useState(null); // slot abierto para corrección manual
  const rowRef = useRef(null);

  // Cada movimiento va en la siguiente casilla de su tipo (Salida/Entrada).
  // Así una unidad puede registrar primero una ENTRADA (sin salida previa):
  // queda en la casilla "Entrada 1" y la "Salida 1" se queda vacía.
  const slots = Array(MOV_SLOTS).fill(null);
  {
    let pos = 0;
    for (const m of v.movimientos || []) {
      const t = TIPO_MOV_VEH_LABEL[m.tipo];
      while (pos < MOV_SLOTS && tipoParaSlot(pos) !== t) pos++;
      if (pos < MOV_SLOTS) slots[pos++] = m;
    }
  }
  // El km solo se captura si ya está registrada la hora de ese movimiento
  const tieneSalida = !!v.movimientos?.some((m) => m.tipo === TIPO_MOV_VEH.SALIDA);
  const tieneEntrada = !!v.movimientos?.some((m) => m.tipo === TIPO_MOV_VEH.ENTRADA);

  const persistVehiculo = async (overrides = {}) => {
    try {
      setSavingVeh(true);
      // Guardar solo la observación no convierte la sugerencia en km salida
      const confirmaSalida =
        !salidaEsSugerida || "kmSalida" in overrides || "kmEntrada" in overrides;
      const body = {
        kmSalida: !tieneSalida
          ? (v.kmSalida ?? null)
          : confirmaSalida && (overrides.kmSalida ?? kmSalida) !== ""
            ? parseInt(overrides.kmSalida ?? kmSalida)
            : null,
        kmEntrada: !tieneEntrada
          ? (v.kmEntrada ?? null)
          : (overrides.kmEntrada ?? kmEntrada) !== ""
            ? parseInt(overrides.kmEntrada ?? kmEntrada)
            : null,
        estado: v.estado ?? 1,
        observacion: (overrides.obs ?? obs) || null,
      };
      if (
        body.kmSalida != null &&
        body.kmEntrada != null &&
        body.kmEntrada < body.kmSalida
      ) {
        showToast(
          "El km de entrada no puede ser menor al de salida",
          "warning",
        );
        setSavingVeh(false);
        return;
      }
      const res = await apiFetch(`/vehiculos/${v.idVehiculoRep}`, {
        method: "PUT",
        body,
      });
      const d = await res.json();
      if (d.ok) {
        setSalidaTocada(false);
        onSave();
      } else {
        showToast(d.error || "Error", "error");
        if (res.status === 409) {
          // El km quedó por debajo del último registrado (quizá otro sitio
          // lo capturó mientras tanto): regresar a lo que hay guardado
          setSalidaTocada(false);
          setKmSalida(kmSalidaServidor);
          setKmEntrada(v.kmEntrada ?? "");
          onSave();
        }
      }
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSavingVeh(false);
    }
  };

  const focusSlot = (i) => {
    const el = rowRef.current?.querySelector(`[data-slot="${i}"]`);
    el?.focus();
  };

  const saveSlot = async (i, hora) => {
    const mov = slots[i];
    if (!hora) {
      setEditingSlot(null);
      return;
    }
    if (mov && mov.hora === hora) {
      setEditingSlot(null);
      return;
    }
    try {
      setSavingSlot(i);
      const tipo = TIPO_MOV_VEH[tipoParaSlot(i)];
      const res = mov
        ? await apiFetch(`/vehiculos/movimientos/${mov.idMovVehiculo}`, {
            method: "PUT",
            body: { tipo, hora },
          })
        : await apiFetch(`/vehiculos/${v.idVehiculoRep}/movimientos`, {
            method: "POST",
            body: { tipo, hora },
          });
      const d = await res.json();
      if (d.ok) {
        onSave();
      } else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSavingSlot(null);
      setEditingSlot(null);
      setSlotDraft((sd) => {
        const next = { ...sd };
        delete next[i];
        return next;
      });
    }
  };

  // Un clic registra YA con la hora actual — sin teclear nada.
  const registrarSlotAhora = (i) => saveSlot(i, nowHHMM());

  const deleteSlot = async (i) => {
    const mov = slots[i];
    if (!mov) return;
    try {
      const res = await apiFetch(`/vehiculos/movimientos/${mov.idMovVehiculo}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (d.ok) onSave();
      else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    }
  };

  const ultimaConDatos = slots.reduce(
    (max, m, i) => (m ? i : max),
    -1,
  );

  return (
    <tr ref={rowRef} className={selected ? "vigr-veh-row--selected" : ""}>
      {isBorrador && (
        <td className="vigr-veh-td--check">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
          />
        </td>
      )}
      <td className="vigr-veh-td--unidad">
        <div className="vigr-veh-unidad">
          <span>{v.numero}</span>
          {v.descripcion && (
            <span className="vigr-placa">{v.descripcion}</span>
          )}
        </div>
      </td>
      <td>
        {isBorrador ? (
          <input
            type="text"
            data-row={rowIndex}
            data-col={VEH_COL.OBS}
            className="vigr-input-sm vigr-input-sm--full"
            value={obs}
            placeholder="—"
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => persistVehiculo({ obs })}
            onKeyDown={handleVehGridArrowKeys}
          />
        ) : (
          <span className="vigr-veh-obs-ro">{v.observacion || "—"}</span>
        )}
      </td>
      {slots.map((mov, i) => {
        // Sin movimientos también se puede empezar por la Entrada 1
        const isNextSlot = i === ultimaConDatos + 1 || (ultimaConDatos === -1 && i === 1);
        const puedeInteractuar = isBorrador && (mov || isNextSlot);
        const isEditing = editingSlot === i;
        const value = slotDraft[i] ?? mov?.hora ?? "";

        return (
          <td key={i} className="vigr-veh-td--mov">
            <div className="vigr-veh-mov-cell">
              {savingSlot === i ? (
                <i className="ti ti-loader-2 vig-spin vigr-veh-mov-saving" />
              ) : isEditing ? (
                <input
                  type="time"
                  data-slot={i}
                  data-row={rowIndex}
                  data-col={VEH_COL.SLOT(i)}
                  autoFocus
                  className="vigr-input-sm vigr-time-cell"
                  value={value}
                  onChange={(e) =>
                    setSlotDraft((sd) => ({ ...sd, [i]: e.target.value }))
                  }
                  onBlur={(e) => saveSlot(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (handleVehGridArrowKeys(e)) return;
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                      focusSlot(i + 1);
                    }
                    if (e.key === "Escape") {
                      setEditingSlot(null);
                      setSlotDraft((sd) => {
                        const next = { ...sd };
                        delete next[i];
                        return next;
                      });
                    }
                  }}
                />
              ) : mov ? (
                <button
                  data-row={rowIndex}
                  data-col={VEH_COL.SLOT(i)}
                  className="vigr-time-badge"
                  disabled={!isBorrador}
                  onClick={() => setEditingSlot(i)}
                  onKeyDown={handleVehGridArrowKeys}
                  title="Clic para corregir la hora"
                >
                  {mov.hora}
                </button>
              ) : isNextSlot && isBorrador ? (
                <button
                  data-row={rowIndex}
                  data-col={VEH_COL.SLOT(i)}
                  className="vigr-time-badge vigr-time-badge--empty"
                  onClick={() => registrarSlotAhora(i)}
                  onKeyDown={handleVehGridArrowKeys}
                  title={`Registrar ${tipoParaSlot(i).toLowerCase()} ahora`}
                >
                  <i className="ti ti-plus" /> Ahora
                </button>
              ) : (
                <span
                  data-row={rowIndex}
                  data-col={VEH_COL.SLOT(i)}
                  tabIndex={-1}
                  className="vigr-time-dash"
                  onKeyDown={handleVehGridArrowKeys}
                >
                  —
                </span>
              )}

              {puedeInteractuar && !isEditing && isNextSlot && !mov && (
                <button
                  className="vigr-icon-btn vigr-veh-mov-edit"
                  onClick={() => setEditingSlot(i)}
                  title="Usar otra hora"
                >
                  <i className="ti ti-clock" />
                </button>
              )}
              {isBorrador && mov && (
                <button
                  className="vigr-icon-btn vigr-icon-btn--danger vigr-veh-mov-del"
                  onClick={() => deleteSlot(i)}
                  title="Eliminar movimiento"
                >
                  <i className="ti ti-x" />
                </button>
              )}
            </div>
          </td>
        );
      })}
      <td>
        {isBorrador ? (
          <input
            type="number"
            data-row={rowIndex}
            data-col={VEH_COL.KM_SALIDA}
            className="vigr-input-sm"
            value={kmSalida}
            onChange={(e) => {
              setSalidaTocada(true);
              setKmSalida(e.target.value);
            }}
            onBlur={() => {
              if (salidaTocada) persistVehiculo({ kmSalida });
            }}
            onKeyDown={handleVehGridArrowKeys}
            disabled={!tieneSalida}
            title={
              !tieneSalida
                ? "Registra la hora de salida para capturar el km"
                : v.kmUltimo != null
                  ? `Último km registrado: ${Number(v.kmUltimo).toLocaleString("es-MX")}` +
                    (v.kmUltimoSitio ? ` en ${v.kmUltimoSitio}` : "")
                  : "Sin km previo: captura el km inicial de la unidad"
            }
            style={{
              width: "90px",
              ...(salidaEsSugerida ? { fontStyle: "italic", opacity: 0.7 } : {}),
            }}
          />
        ) : (
          <span>{v.kmSalida ?? "—"}</span>
        )}
      </td>
      <td>
        {isBorrador ? (
          <input
            type="number"
            data-row={rowIndex}
            data-col={VEH_COL.KM_ENTRADA}
            className="vigr-input-sm"
            style={{ width: "90px" }}
            value={kmEntrada}
            onChange={(e) => setKmEntrada(e.target.value)}
            onBlur={() => persistVehiculo({ kmEntrada })}
            onKeyDown={handleVehGridArrowKeys}
            disabled={!tieneEntrada}
            title={!tieneEntrada ? "Registra la hora de entrada para capturar el km" : undefined}
          />
        ) : (
          <span>{v.kmEntrada ?? "—"}</span>
        )}
        {savingVeh && <i className="ti ti-loader-2 vig-spin" />}
      </td>
    </tr>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: RONDINES
// ═══════════════════════════════════════════════════════════
// "20:00" → "20:00 Hrs"   ·   "01:00" → "01:00 AM"  (mismo criterio que el PDF)
function formatHoraRondin(hora) {
  if (!hora) return "";
  const h = parseInt(hora.split(":")[0], 10);
  return `${hora} ${h < 12 ? "AM" : "Hrs"}`;
}

function TabRondines({ rondines, isBorrador, onSave, showToast }) {
  const saveObs = async (r, observaciones) => {
    try {
      const res = await apiFetch(`/rondines/${r.idRondinRep}`, {
        method: "PUT",
        body: { observaciones, area: "General" },
      });
      const d = await res.json();
      if (d.ok) onSave();
      else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    }
  };

  return (
    <div className="vigr-section">
      <div className="vigr-section__head">
        <h3>
          <i className="ti ti-route" /> Rondines del Turno
        </h3>
      </div>
      {rondines?.length === 0 && (
        <div
          className="vig-center vig-center--empty"
          style={{ padding: "2rem" }}
        >
          <i className="ti ti-route-off" />
          <p>Sin rondines configurados.</p>
        </div>
      )}
      <div className="vigr-rondines-grid">
        {rondines?.map((r) => (
          <div key={r.idRondinRep} className="vigr-rondin-card">
            <div className="vigr-rondin-name">
              {formatHoraRondin(r.horaReferencia)}
              {r.horaReferencia && " - "}
              {r.etiqueta}
            </div>
            <div className="vigr-rondin-area">
              <i className="ti ti-map-pin" /> {r.area || "General"}
            </div>
            {isBorrador ? (
              <textarea
                className="vigr-textarea"
                rows={1}
                placeholder="SIN NOVEDAD"
                defaultValue={r.observaciones || ""}
                onBlur={(e) => {
                  if (e.target.value !== (r.observaciones || ""))
                    saveObs(r, e.target.value || "SIN NOVEDAD");
                }}
              />
            ) : (
              <p className="vigr-obs-text">{r.observaciones || "SIN NOVEDAD"}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: UBICACIÓN / INCIDENCIA
// ═══════════════════════════════════════════════════════════
function TabUbicacion({ idReporte, ubicaciones, vehiculos, isBorrador, onSave, showToast }) {
  const [modoRapido, setModoRapido] = useState(false);

  return (
    <div className="vigr-section">
      <div className="vigr-section__head">
        <h3>
          <i className="ti ti-map-pin" /> Ubicación e Incidencia de Vehículos
        </h3>
        {ubicaciones?.length > 0 && (
          <button
            className="vig-btn vig-btn--ghost vig-btn--sm"
            onClick={() => setModoRapido((v) => !v)}
          >
            <i className={`ti ${modoRapido ? "ti-list" : "ti-bolt"}`} />
            {modoRapido ? "Ver por destino" : "Asignación rápida"}
          </button>
        )}
      </div>
      {(!ubicaciones || ubicaciones.length === 0) && (
        <div
          className="vig-center vig-center--empty"
          style={{ padding: "2rem" }}
        >
          <i className="ti ti-map-pin-off" />
          <p>Sin destinos configurados para este sitio.</p>
        </div>
      )}
      {ubicaciones?.length > 0 && modoRapido ? (
        <AsignacionRapida
          idReporte={idReporte}
          ubicaciones={ubicaciones}
          vehiculos={vehiculos || []}
          isBorrador={isBorrador}
          onSave={onSave}
          showToast={showToast}
        />
      ) : (
        ubicaciones?.map((u) => (
          <DestinoRow
            key={u.idUbicacionRep}
            u={u}
            catalogo={vehiculos || []}
            isBorrador={isBorrador}
            onSave={onSave}
            showToast={showToast}
          />
        ))
      )}
    </div>
  );
}

function AsignacionRapida({ idReporte, ubicaciones, vehiculos, isBorrador, onSave, showToast }) {
  const [pendientes, setPendientes] = useState(new Set());

  const asignacionActual = new Map();
  ubicaciones.forEach((u) => {
    u.vehiculos.forEach((v) => asignacionActual.set(v.idVehiculo, u.idUbicacionRep));
  });

  const reasignar = async (idVehiculo, valor) => {
    const idUbicacionRep = valor ? parseInt(valor) : null;
    setPendientes((prev) => new Set(prev).add(idVehiculo));
    try {
      const res = await apiFetch(
        `/reportes/${idReporte}/vehiculos-ubicacion/${idVehiculo}`,
        { method: "PUT", body: { idUbicacionRep } },
      );
      const d = await res.json();
      if (d.ok) onSave();
      else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setPendientes((prev) => {
        const next = new Set(prev);
        next.delete(idVehiculo);
        return next;
      });
    }
  };

  return (
    <div className="vigr-asignacion-rapida">
      <table className="vigr-table">
        <thead>
          <tr>
            <th>Unidad</th>
            <th>Destino</th>
          </tr>
        </thead>
        <tbody>
          {vehiculos.map((v) => (
            <tr key={v.idVehiculo}>
              <td className="vigr-veh-td--unidad">{v.numero}</td>
              <td>
                <select
                  className="vigr-input-sm"
                  style={{ width: "220px" }}
                  value={asignacionActual.get(v.idVehiculo) || ""}
                  disabled={!isBorrador || pendientes.has(v.idVehiculo)}
                  onChange={(e) => reasignar(v.idVehiculo, e.target.value)}
                >
                  <option value="">— Sin asignar —</option>
                  {ubicaciones.map((u) => (
                    <option key={u.idUbicacionRep} value={u.idUbicacionRep}>
                      {u.destino}
                    </option>
                  ))}
                </select>
                {pendientes.has(v.idVehiculo) && (
                  <i className="ti ti-loader-2 vig-spin" style={{ marginLeft: "0.4rem" }} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DestinoRow({ u, catalogo, isBorrador, onSave, showToast }) {
  const [obs, setObs] = useState(u.observaciones || "");
  const [saving, setSaving] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [showSug, setShowSug] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const searchRef = useRef(null);
  const blurTimeout = useRef(null);

  const asignadosIds = new Set(u.vehiculos.map((v) => v.idVehiculo));
  const sugerencias = busqueda
    ? catalogo
        .filter(
          (v) =>
            !asignadosIds.has(v.idVehiculo) && v.numero.includes(busqueda),
        )
        .slice(0, 6)
    : [];

  // Autoguarda de inmediato — sin botón "Aceptar" ni estado pendiente que perder.
  const persist = async (idVehiculos) => {
    try {
      setSaving(true);
      const res = await apiFetch(`/ubicaciones/${u.idUbicacionRep}`, {
        method: "PUT",
        body: { idVehiculos, observaciones: obs },
      });
      const d = await res.json();
      if (d.ok) onSave();
      else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  const persistObs = async () => {
    try {
      setSaving(true);
      const res = await apiFetch(`/ubicaciones/${u.idUbicacionRep}`, {
        method: "PUT",
        body: { idVehiculos: u.vehiculos.map((v) => v.idVehiculo), observaciones: obs },
      });
      const d = await res.json();
      if (d.ok) onSave();
      else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  const quitar = (idVehiculo) => {
    const nuevos = u.vehiculos.filter((v) => v.idVehiculo !== idVehiculo).map((v) => v.idVehiculo);
    persist(nuevos);
  };

  const agregar = (idVehiculo) => {
    const nuevos = [...u.vehiculos.map((v) => v.idVehiculo), idVehiculo];
    persist(nuevos);
    setBusqueda("");
    setShowSug(false);
    searchRef.current?.focus();
  };

  const handleSearchBlur = () => {
    // pequeño delay para permitir que el click en una sugerencia se registre
    blurTimeout.current = setTimeout(() => setShowSug(false), 150);
  };

  return (
    <div className="vigr-destino-row">
      <div className="vigr-destino-row__head">
        <span className="vigr-destino-row__nombre">{u.destino}</span>
        {saving && <i className="ti ti-loader-2 vig-spin" />}
      </div>

      <div className="vigr-destino-row__chips">
        {u.vehiculos.length === 0 && (
          <span className="vigr-veh-obs-ro">NINGUNO</span>
        )}
        {u.vehiculos.map((v) => (
          <span key={v.idVehiculo} className="vigr-chip">
            {v.numero}
            {isBorrador && (
              <button
                className="vigr-chip__remove"
                onClick={() => quitar(v.idVehiculo)}
                title="Quitar unidad"
              >
                <i className="ti ti-x" />
              </button>
            )}
          </span>
        ))}

        {isBorrador && (
          <div className="vigr-typeahead">
            <input
              ref={searchRef}
              type="text"
              className="vigr-input-sm"
              style={{ width: "140px" }}
              placeholder="+ Agregar unidad…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setShowSug(true);
                setHighlightIndex(0);
              }}
              onFocus={() => setShowSug(true)}
              onBlur={handleSearchBlur}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setShowSug(true);
                  setHighlightIndex((i) =>
                    sugerencias.length ? (i + 1) % sugerencias.length : 0,
                  );
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setShowSug(true);
                  setHighlightIndex((i) =>
                    sugerencias.length
                      ? (i - 1 + sugerencias.length) % sugerencias.length
                      : 0,
                  );
                }
                if (e.key === "Enter" && sugerencias.length > 0) {
                  e.preventDefault();
                  clearTimeout(blurTimeout.current);
                  const elegido = sugerencias[highlightIndex] || sugerencias[0];
                  agregar(elegido.idVehiculo);
                }
                if (e.key === "Escape") {
                  setBusqueda("");
                  setShowSug(false);
                }
              }}
            />
            {showSug && busqueda && (
              <div className="vigr-typeahead__list">
                {sugerencias.length === 0 ? (
                  <div className="vigr-typeahead__empty">Sin coincidencias</div>
                ) : (
                  sugerencias.map((v, i) => (
                    <button
                      key={v.idVehiculo}
                      className={`vigr-typeahead__item ${i === highlightIndex ? "vigr-typeahead__item--active" : ""}`}
                      onMouseEnter={() => setHighlightIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault(); // evita que el blur del input cierre antes del click
                        clearTimeout(blurTimeout.current);
                        agregar(v.idVehiculo);
                      }}
                    >
                      {v.numero}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isBorrador ? (
        <input
          type="text"
          className="vigr-input-sm vigr-input-sm--full"
          value={obs}
          placeholder="Observaciones (opcional)"
          onChange={(e) => setObs(e.target.value)}
          onBlur={persistObs}
        />
      ) : (
        u.observaciones && <p className="vigr-obs-text">{u.observaciones}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: SINIESTROS
// ═══════════════════════════════════════════════════════════
function TabSiniestros({ idReporte, config, isBorrador, showToast }) {
  const [siniestros, setSiniestros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    tipo: "",
    descripcion: "",
    afectado: "",
    acciones: "",
  });
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchSiniestros();
  }, [idReporte]);

  const fetchSiniestros = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/reportes/${idReporte}/siniestros`);
      const d = await res.json();
      if (d.ok) setSiniestros(d.data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!form.descripcion) {
      showToast("La descripción es requerida", "warning");
      return;
    }
    try {
      setAdding(true);
      const res = await apiFetch(`/reportes/${idReporte}/siniestros`, {
        method: "POST",
        body: form,
      });

      const d = await res.json();
      if (d.ok) {
        showToast("Siniestro registrado");
        setForm({ tipo: "", descripcion: "", afectado: "", acciones: "" });
        setShowForm(false);
        fetchSiniestros();
      } else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await apiFetch(`/siniestros/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (d.ok) {
        showToast("Eliminado");
        fetchSiniestros();
      } else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    }
  };

  const esSimple = config?.sitio?.tieneSiniestrosSimple;

  return (
    <div className="vigr-section">
      <div className="vigr-section__head">
        <h3>
          <i className="ti ti-alert-triangle" /> Siniestros
        </h3>
        {isBorrador && (
          <button
            className="vig-btn vig-btn--primary vig-btn--sm"
            onClick={() => setShowForm((s) => !s)}
          >
            <i className={`ti ${showForm ? "ti-x" : "ti-plus"}`} />
            {showForm ? "Cancelar" : "Agregar"}
          </button>
        )}
      </div>

      {loading && (
        <div className="vig-center" style={{ padding: "1.5rem" }}>
          <i className="ti ti-loader-2 vig-spin" />
        </div>
      )}

      {!loading && siniestros.length === 0 && !showForm && (
        <div
          className="vig-center vig-center--empty"
          style={{ padding: "2rem" }}
        >
          <i className="ti ti-mood-happy" />
          <p>Sin siniestros registrados en este turno.</p>
        </div>
      )}

      {showForm && isBorrador && (
        <div className="vigr-siniestro-form">
          {!esSimple && (
            <div className="vig-form-group">
              <label>Tipo de siniestro</label>
              <input
                type="text"
                value={form.tipo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tipo: e.target.value }))
                }
                placeholder="Robo, accidente, incendio…"
              />
            </div>
          )}
          <div className="vig-form-group">
            <label>
              Descripción <span className="vig-req">*</span>
            </label>
            <textarea
              className="vigr-textarea"
              rows={3}
              value={form.descripcion}
              onChange={(e) =>
                setForm((f) => ({ ...f, descripcion: e.target.value }))
              }
              placeholder="Describe el siniestro…"
            />
          </div>
          {!esSimple && (
            <>
              <div className="vig-form-group">
                <label>Afectado</label>
                <input
                  type="text"
                  value={form.afectado}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, afectado: e.target.value }))
                  }
                  placeholder="Nombre o área afectada…"
                />
              </div>
              <div className="vig-form-group">
                <label>Acciones tomadas</label>
                <textarea
                  className="vigr-textarea"
                  rows={2}
                  value={form.acciones}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, acciones: e.target.value }))
                  }
                  placeholder="Acciones inmediatas…"
                />
              </div>
            </>
          )}
          <button
            className="vig-btn vig-btn--primary"
            onClick={handleAdd}
            disabled={adding}
          >
            {adding ? (
              <>
                <i className="ti ti-loader-2 vig-spin" /> Guardando…
              </>
            ) : (
              <>
                <i className="ti ti-check" /> Registrar Siniestro
              </>
            )}
          </button>
        </div>
      )}

      {siniestros.map((s) => (
        <div key={s.idSiniestro} className="vigr-siniestro-card">
          <div className="vigr-siniestro-card__head">
            {s.tipo && (
              <span className="vigr-mov-tipo vigr-mov-tipo--salida">
                {s.tipo}
              </span>
            )}
            <span className="vigr-mov-hora">
              {s.fechaRegistro
                ? new Date(s.fechaRegistro).toLocaleString("es-MX")
                : ""}
            </span>
            {isBorrador && (
              <button
                className="vigr-icon-btn vigr-icon-btn--danger"
                onClick={() => handleDelete(s.idSiniestro)}
              >
                <i className="ti ti-trash" />
              </button>
            )}
          </div>
          <p className="vigr-obs-text">{s.descripcion}</p>
          {s.afectado && (
            <p className="vigr-obs-text">
              <strong>Afectado:</strong> {s.afectado}
            </p>
          )}
          {s.acciones && (
            <p className="vigr-obs-text">
              <strong>Acciones:</strong> {s.acciones}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// OBSERVACIONES GENERALES (footer del reporte)
// ═══════════════════════════════════════════════════════════
function ObservacionesGenerales({
  reporte,
  idReporte,
  isBorrador,
  onSave,
  showToast,
}) {
  const [obs, setObs] = useState(reporte.observacionesGenerales || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await apiFetch(`/reportes/${idReporte}/cabecera`, {
        method: "PATCH",
        body: { observacionesGenerales: obs },
      });
      const d = await res.json();
      if (d.ok) {
        showToast("Observaciones guardadas");
        onSave();
      } else showToast(d.error || "Error", "error");
    } catch {
      showToast("Error de conexión", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vigr-section vigr-obs-gen">
      <div className="vigr-section__head">
        <h3>
          <i className="ti ti-notes" /> Observaciones Generales
        </h3>
        {isBorrador && (
          <button
            className="vig-btn vig-btn--primary vig-btn--sm"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <i className="ti ti-loader-2 vig-spin" />
            ) : (
              <i className="ti ti-device-floppy" />
            )}{" "}
            Guardar
          </button>
        )}
      </div>
      {isBorrador ? (
        <textarea
          className="vigr-textarea"
          rows={4}
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observaciones generales del turno…"
        />
      ) : (
        <p className="vigr-obs-text">
          {reporte.observacionesGenerales || "Sin observaciones generales."}
        </p>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────
function fmt(iso) {
  if (!iso) return "—";
  // SQL Server puede devolver un objeto Date o un string ISO con zona horaria
  let str;
  if (iso instanceof Date) {
    // Usar fecha local para evitar desfase UTC
    const y = iso.getFullYear();
    const m = String(iso.getMonth() + 1).padStart(2, "0");
    const d = String(iso.getDate()).padStart(2, "0");
    str = `${y}-${m}-${d}`;
  } else {
    // Tomar solo los primeros 10 caracteres "YYYY-MM-DD"
    str = String(iso).slice(0, 10);
  }
  if (!str || str === "null" || str === "undefined") return "—";
  return new Date(str + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Extrae "YYYY-MM-DD" de un Date o string ISO, sin importar zona horaria
function toDateStr(iso) {
  if (!iso) return "";
  if (iso instanceof Date) {
    const y = iso.getFullYear();
    const m = String(iso.getMonth() + 1).padStart(2, "0");
    const d = String(iso.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(iso).slice(0, 10);
}

// Suma N días a un string "YYYY-MM-DD"
function addDays(dateStr, n) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
