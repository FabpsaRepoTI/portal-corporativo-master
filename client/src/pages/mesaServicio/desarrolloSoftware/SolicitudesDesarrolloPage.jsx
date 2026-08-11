// ╔══════════════════════════════════════════════════════════════╗
// ║  SolicitudesDesarrolloPage.jsx  v4                          ║
// ║  + Tabs: Subtareas, Horas, Bloqueos                        ║
// ║  + Folio rediseñado (identificador secundario)             ║
// ║  + Evaluación solo para solicitante original               ║
// ║  + Reporte PDF individual por desarrollo                   ║
// ╚══════════════════════════════════════════════════════════════╝
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useContext,
} from "react";
import ReactDOM from "react-dom";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import "./SolicitudesDesarrolloPage.css";
import jsPDF from "jspdf";
import "jspdf-autotable";
import "./SolicitudesDesarrolloPage.mobile.css";

/* ── Constantes ─────────────────────────────────────────────── */
const STATIC_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:3001"
    : window.location.hostname === "192.168.16.198"
      ? "http://192.168.16.198:3001"
      : "http://201.151.218.138:3001";

const PAGE_SIZE = 15;

const TABS = [
  { key: "resumen", label: "Resumen", icon: "ti-layout-grid" },
  { key: "seguimiento", label: "Seguimiento", icon: "ti-chart-line" },
  { key: "actividades", label: "Actividades", icon: "ti-activity" },
  { key: "subtareas", label: "Subtareas", icon: "ti-subtask" },
  { key: "horas", label: "Horas", icon: "ti-clock-hour-4" },
  { key: "bloqueos", label: "Bloqueos", icon: "ti-lock" },
  { key: "comentarios", label: "Comentarios", icon: "ti-message-circle" },
  { key: "archivos", label: "Archivos", icon: "ti-paperclip" },
  { key: "evaluacion", label: "Evaluación", icon: "ti-star" },
];

const KPI_DEFS = [
  {
    key: "todos",
    label: "Todos",
    icon: "ti-stack-2",
    color: "#4f46e5",
    estatusParam: null,
  },
  {
    key: "pendientes",
    label: "Pendientes",
    icon: "ti-clock",
    color: "#6b7280",
    estatusParam: "1",
  },
  {
    key: "enEvaluacion",
    label: "En evaluación",
    icon: "ti-eye",
    color: "#8b5cf6",
    estatusParam: "2",
  },
  {
    key: "enDesarrollo",
    label: "En desarrollo",
    icon: "ti-code",
    color: "#3b82f6",
    estatusParam: "3",
  },
  {
    key: "enRevision",
    label: "En revisión",
    icon: "ti-refresh",
    color: "#f59e0b",
    estatusParam: "4",
  },
  {
    key: "enPruebas",
    label: "En pruebas",
    icon: "ti-test-pipe",
    color: "#06b6d4",
    estatusParam: "5",
  },
  {
    key: "concluidos",
    label: "Concluidos",
    icon: "ti-circle-check",
    color: "#10b981",
    estatusParam: "7",
  },
  {
    key: "cancelados",
    label: "Cancelados",
    icon: "ti-circle-x",
    color: "#9ca3af",
    estatusParam: "6",
  },
  {
    key: "vencidos",
    label: "Vencidos",
    icon: "ti-alert-triangle",
    color: "#ef4444",
    estatusParam: null,
    isVencidos: true,
  },
];

/* ── Helpers ─────────────────────────────────────────────────── */
function fmtDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtDateTime(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function iniciales(nombre) {
  if (!nombre) return "?";
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}
function fmtMinutos(min) {
  if (!min) return "0h";
  const h = Math.floor(min / 60),
    m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function calcBarra(row) {
  const {
    tiempoEstado,
    diasRestantes,
    duracionTotal,
    diasTranscurridos,
    fechaCompromiso,
  } = row;
  if (!fechaCompromiso || tiempoEstado === "sin_fecha")
    return { estado: "sin_fecha", label: "Fecha pendiente", pct: 0 };
  if (tiempoEstado === "terminal")
    return { estado: "terminal", label: "Concluido", pct: 100 };
  const total = Math.max(duracionTotal ?? 1, 1),
    transcu = Math.max(diasTranscurridos ?? 0, 0);
  const pct = Math.min(Math.round((transcu / total) * 100), 100),
    rest = diasRestantes ?? 0;
  if (tiempoEstado === "vencido")
    return {
      estado: "vencido",
      label: `Vencido hace ${Math.abs(rest)}d`,
      pct: 100,
    };
  if (tiempoEstado === "proximo")
    return { estado: "proximo", label: `${rest}d restantes`, pct };
  return {
    estado: "en_tiempo",
    label: rest === 0 ? "Vence hoy" : `${rest}d restantes`,
    pct,
  };
}
function fileIcon(nombre) {
  if (!nombre) return "ti-file";
  const ext = nombre.split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "ti-photo";
  if (ext === "pdf") return "ti-file-type-pdf";
  if (["xlsx", "xls", "csv"].includes(ext)) return "ti-table";
  if (["docx", "doc"].includes(ext)) return "ti-file-word";
  if (["zip", "rar", "7z"].includes(ext)) return "ti-file-zip";
  return "ti-paperclip";
}
const stop = (fn) => (e) => {
  e.stopPropagation();
  fn(e);
};

/* ── Componentes visuales ────────────────────────────────────── */
function Avatar({ nombre, size = 28 }) {
  const colors = [
    "#4f46e5",
    "#7c3aed",
    "#0891b2",
    "#059669",
    "#d97706",
    "#dc2626",
  ];
  const idx = nombre ? nombre.charCodeAt(0) % colors.length : 0;
  return (
    <div
      className="sdp-avatar"
      style={{
        width: size,
        height: size,
        background: colors[idx],
        fontSize: size * 0.38,
      }}
    >
      {iniciales(nombre)}
    </div>
  );
}

function StarRating({ value, onChange, size = 22 }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star-btn${(hover || value) >= n ? " star-btn--on" : ""}`}
          style={{ fontSize: size }}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          onClick={() => onChange?.(n)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function MiniBarraTiempo({ row }) {
  const b = calcBarra(row);
  const colorMap = {
    sin_fecha: "#d1d5db",
    terminal: "#10b981",
    en_tiempo: "#4f46e5",
    proximo: "#f59e0b",
    vencido: "#ef4444",
  };
  const color = colorMap[b.estado] || "#4f46e5";
  if (b.estado === "terminal")
    return (
      <span className="sdp-time-chip sdp-time-chip--done">
        <i className="ti ti-circle-check" /> Concluido
      </span>
    );
  if (b.estado === "sin_fecha")
    return <span className="sdp-time-chip sdp-time-chip--none">Sin fecha</span>;
  return (
    <div className="sdp-mini-barra">
      <div className="sdp-mini-track">
        <div
          className="sdp-mini-fill"
          style={{ width: `${b.pct}%`, background: color }}
        />
      </div>
      <span className="sdp-mini-label" style={{ color }}>
        {b.label}
      </span>
    </div>
  );
}

function BarraTiempo({ row }) {
  const b = calcBarra(row);
  const colorMap = {
    sin_fecha: "#9ca3af",
    terminal: "#10b981",
    en_tiempo: "#4f46e5",
    proximo: "#f59e0b",
    vencido: "#ef4444",
  };
  const color = colorMap[b.estado] || "#4f46e5";
  if (b.estado === "sin_fecha" || b.estado === "terminal")
    return (
      <div className="bt-simple">
        <i
          className={`ti ${b.estado === "terminal" ? "ti-circle-check" : "ti-calendar-off"}`}
          style={{ color }}
        />
        <span style={{ color }}>{b.label}</span>
      </div>
    );
  return (
    <div className="bt-full">
      <div className="bt-header">
        <span className="bt-label" style={{ color }}>
          {b.estado === "vencido" || b.estado === "proximo" ? (
            <i className="ti ti-alert-triangle" />
          ) : (
            <i className="ti ti-clock" />
          )}{" "}
          {b.label}
        </span>
        <span className="bt-pct" style={{ color }}>
          {b.pct}%
        </span>
      </div>
      <div className="bt-track">
        <div
          className="bt-fill"
          style={{ width: `${b.pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function SemaforoSLA({ row }) {
  const b = calcBarra(row);
  const map = {
    sin_fecha: { color: "#9ca3af", label: "Sin fecha" },
    terminal: { color: "#10b981", label: "Concluido" },
    en_tiempo: { color: "#10b981", label: "En tiempo" },
    proximo: { color: "#f59e0b", label: "Por vencer" },
    vencido: { color: "#ef4444", label: "Vencido" },
  };
  const m = map[b.estado] || map.en_tiempo;
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        color: m.color,
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: m.color,
          display: "inline-block",
        }}
      />
      {m.label}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className="info-row-val">{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function SolicitudesDesarrolloPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const token = localStorage.getItem("fabpsa_token");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const [kpis, setKpis] = useState({});
  const [catalogos, setCatalogos] = useState({
    estatus: [],
    tipos: [],
    sistemas: [],
    prioridades: [],
    tecnicos: [],
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [buscar, setBuscar] = useState("");
  const [fEstatus, setFEstatus] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fSistema, setFSistema] = useState("");
  const [fResponsable, setFResponsable] = useState("");
  const [fVencidos, setFVencidos] = useState(false);
  const [activeKpi, setActiveKpi] = useState("todos");
  const [orderBy, setOrderBy] = useState("fecha");
  const [dir, setDir] = useState("DESC");

  const [expandedId, setExpandedId] = useState(null);
  const [panelData, setPanelData] = useState(null);
  const [panelTab, setPanelTab] = useState("resumen");
  const [panelLoading, setPanelLoading] = useState(false);

  const [modal, setModal] = useState(null);
  const [mAsignar, setMAsignar] = useState({ login: "", nombre: "" });
  const [mEstatus, setMEstatus] = useState("");
  const [mMotivo, setMMotivo] = useState("");
  const [mFecha, setMFecha] = useState("");
  const [mAvance, setMAvance] = useState(0);
  const [mActividad, setMActividad] = useState("");
  const [mActividadesConcluir, setMActividadesConcluir] = useState("");
  const [mImpacta, setMImpacta] = useState(false);
  const [mImpactos, setMImpactos] = useState([{ area: "", motivo: "" }]);
  // Horas
  const [mHorasH, setMHorasH] = useState(0);
  const [mHorasM, setMHorasM] = useState(0);
  const [mHorasDesc, setMHorasDesc] = useState("");
  const [mHorasFecha, setMHorasFecha] = useState("");
  // Subtarea
  const [mSubTitulo, setMSubTitulo] = useState("");
  const [mSubDesc, setMSubDesc] = useState("");
  const [mSubEstatus, setMSubEstatus] = useState("1");
  const [mSubPrio, setMSubPrio] = useState("");
  const [mSubResp, setMSubResp] = useState({ login: "", nombre: "" });
  const [mSubFI, setMSubFI] = useState("");
  const [mSubFC, setMSubFC] = useState("");
  const [mSubEditing, setMSubEditing] = useState(null);
  // Bloqueo
  const [mBloqueoMotivo, setMBloqueoMotivo] = useState("");

  const [comentario, setComentario] = useState("");

  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  function showToast(msg, type = "ok") {
    setToast({ msg, type });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    fetch("/api/solicitudes-desarrollo/catalogos", { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.estatus) setCatalogos(d);
      });
    fetchKpis();
    // eslint-disable-next-line
  }, []);

  function fetchKpis() {
    fetch("/api/solicitudes-desarrollo/kpis", { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.pendientes !== undefined) setKpis(d);
      });
  }

  const fetchRows = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page,
      limit: PAGE_SIZE,
      orderBy,
      dir,
      ...(buscar ? { buscar } : {}),
      ...(fEstatus ? { estatus: fEstatus } : {}),
      ...(fTipo ? { tipo: fTipo } : {}),
      ...(fSistema ? { sistema: fSistema } : {}),
      ...(fResponsable ? { responsable: fResponsable } : {}),
      ...(fVencidos ? { vencidas: "true" } : {}),
    });
    fetch(`/api/solicitudes-desarrollo?${params}`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setRows(d.data);
          setTotal(d.total ?? 0);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line
  }, [
    page,
    buscar,
    fEstatus,
    fTipo,
    fSistema,
    fResponsable,
    fVencidos,
    orderBy,
    dir,
  ]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  function loadPanel(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setPanelData(null);
      return;
    }
    setExpandedId(id);
    setPanelTab("resumen");
    setPanelLoading(true);
    setPanelData(null);
    fetch(`/api/solicitudes-desarrollo/${id}`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.idSolicitud) setPanelData(d);
        setPanelLoading(false);
      })
      .catch(() => setPanelLoading(false));
  }

  function reloadPanel(updatedFields) {
    if (!expandedId) return;
    if (updatedFields && panelData)
      setPanelData((prev) => ({ ...prev, ...updatedFields }));
    fetch(`/api/solicitudes-desarrollo/${expandedId}`, { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.idSolicitud) setPanelData(d);
      });
  }

  function handleKpiClick(kpi) {
    setActiveKpi(kpi.key);
    setPage(1);
    setExpandedId(null);
    setFVencidos(!!kpi.isVencidos);
    setFEstatus(kpi.isVencidos ? "" : kpi.estatusParam || "");
  }

  async function apiPut(path, body) {
    return fetch(`/api/solicitudes-desarrollo/${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    }).then((r) => r.json());
  }
  async function apiPost(path, body) {
    return fetch(`/api/solicitudes-desarrollo/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }).then((r) => r.json());
  }
  async function apiDelete(path) {
    return fetch(`/api/solicitudes-desarrollo/${path}`, {
      method: "DELETE",
      headers,
    }).then((r) => r.json());
  }

  async function handleAsignarme(sol) {
    const r = await apiPut(`${sol.idSolicitud}/asignar`, {});
    if (r.ok) {
      showToast("Te asignaste como responsable");
      fetchRows();
      fetchKpis();
      reloadPanel({
        nombreTecnico: user.name,
        tecnicoAsignado: user.login,
        nombreResponsable: user.name,
        loginResponsable: user.login,
      });
    } else showToast(r.message || "Error", "err");
  }

  function openModal(type, sol) {
    setModal({ type, sol });
    setMAsignar({
      login: sol.loginResponsable || "",
      nombre: sol.nombreResponsable || "",
    });
    setMEstatus(String(sol.idEstatus || ""));
    setMMotivo("");
    setMFecha(sol.fechaCompromiso ? sol.fechaCompromiso.slice(0, 10) : "");
    setMAvance(sol.porcentajeAvance ?? 0);
    setMImpacta(false);
    setMImpactos([{ area: "", motivo: "" }]);
    setMActividad("");
    setMActividadesConcluir("");
    setMHorasH(0);
    setMHorasM(0);
    setMHorasDesc("");
    setMHorasFecha(new Date().toISOString().slice(0, 10));
    setMSubTitulo("");
    setMSubDesc("");
    setMSubEstatus("1");
    setMSubPrio("");
    setMSubResp({ login: "", nombre: "" });
    setMSubFI("");
    setMSubFC("");
    setMSubEditing(null);
    setMBloqueoMotivo("");
  }

  async function handleAsignar() {
    if (!mAsignar.login) return;
    const r = await apiPut(`${modal.sol.idSolicitud}/asignar`, {
      loginResponsable: mAsignar.login,
      nombreResponsable: mAsignar.nombre,
    });
    if (r.ok) {
      showToast("Responsable asignado");
      setModal(null);
      fetchRows();
      fetchKpis();
      reloadPanel({
        nombreTecnico: mAsignar.nombre,
        tecnicoAsignado: mAsignar.login,
        nombreResponsable: mAsignar.nombre,
        loginResponsable: mAsignar.login,
      });
    } else showToast(r.message || "Error", "err");
  }

  async function handleEstatus() {
    const id = parseInt(mEstatus, 10);
    if (!id) return;
    if ((id === 4 || id === 6) && !mMotivo.trim()) {
      showToast(
        id === 4
          ? "El motivo de revisión es obligatorio"
          : "El motivo de cancelación es obligatorio",
        "err",
      );
      return;
    }
    if (id === 3 && !mFecha) {
      showToast(
        "La fecha compromiso es obligatoria al iniciar el desarrollo",
        "err",
      );
      return;
    }
    const body = {
      idEstatus: id,
      ...(id === 4 ? { motivoRevision: mMotivo } : {}),
      ...(id === 6 ? { motivoRechazo: mMotivo } : {}),
      ...(id === 3 ? { fechaCompromiso: mFecha } : {}),
    };
    const r = await apiPut(`${modal.sol.idSolicitud}/estatus`, body);
    if (r.ok) {
      showToast("Estatus actualizado");
      setModal(null);
      fetchRows();
      fetchKpis();
      reloadPanel();
    } else showToast(r.message || "Error", "err");
  }

  async function handleConcluir() {
    if (!mActividadesConcluir.trim()) {
      showToast("Describe las actividades realizadas para concluir", "err");
      return;
    }
    if (mImpacta && !mImpactos.some((i) => i.area.trim() && i.motivo.trim())) {
      showToast("Agrega al menos un área impactada con su motivo", "err");
      return;
    }
    const r = await apiPost(`${modal.sol.idSolicitud}/concluir`, {
      actividadesRealizadas: mActividadesConcluir,
      impactaOtrasAreas: mImpacta,
      impactos: mImpacta
        ? mImpactos.filter((i) => i.area.trim() && i.motivo.trim())
        : [],
    });
    if (r.ok) {
      showToast("Desarrollo concluido ✓");
      setModal(null);
      fetchRows();
      fetchKpis();
      reloadPanel();
    } else showToast(r.message || "Error", "err");
  }

  async function handleDetalle() {
    const r = await apiPut(`${modal.sol.idSolicitud}/detalle`, {
      fechaCompromiso: mFecha || undefined,
      porcentajeAvance: mAvance ?? undefined,
    });
    if (r.ok) {
      showToast("Guardado");
      setModal(null);
      fetchRows();
      reloadPanel();
    } else showToast(r.message || "Error", "err");
  }

  async function handleActividad() {
    if (!mActividad.trim()) return;
    const r = await apiPost(`${modal.sol.idSolicitud}/actividad`, {
      actividad: mActividad,
    });
    if (r.ok) {
      showToast("Actividad registrada");
      setModal(null);
      reloadPanel();
    } else showToast(r.message || "Error", "err");
  }

  async function handleHoras() {
    const min = (parseInt(mHorasH) || 0) * 60 + (parseInt(mHorasM) || 0);
    if (!min) {
      showToast("Indica el tiempo trabajado", "err");
      return;
    }
    const r = await apiPost(`${modal.sol.idSolicitud}/horas`, {
      minutosTrabajos: min,
      descripcion: mHorasDesc || undefined,
      fechaTrabajo: mHorasFecha,
    });
    if (r.ok) {
      showToast("Tiempo registrado");
      setModal(null);
      reloadPanel();
    } else showToast(r.message || "Error", "err");
  }

  async function handleSubtarea() {
    if (!mSubTitulo.trim()) {
      showToast("El título es obligatorio", "err");
      return;
    }
    const body = {
      titulo: mSubTitulo,
      descripcion: mSubDesc || undefined,
      idEstatus: parseInt(mSubEstatus) || 1,
      idPrioridad: mSubPrio || undefined,
      loginResponsable: mSubResp.login || undefined,
      nombreResponsable: mSubResp.nombre || undefined,
      fechaInicio: mSubFI || undefined,
      fechaCompromiso: mSubFC || undefined,
    };
    let r;
    if (mSubEditing) {
      r = await apiPut(
        `${modal.sol.idSolicitud}/subtareas/${mSubEditing}`,
        body,
      );
    } else {
      r = await apiPost(`${modal.sol.idSolicitud}/subtareas`, body);
    }
    if (r.ok) {
      showToast(mSubEditing ? "Subtarea actualizada" : "Subtarea creada");
      setModal(null);
      reloadPanel();
    } else showToast(r.message || "Error", "err");
  }

  async function handleBloqueo() {
    if (!mBloqueoMotivo.trim()) {
      showToast("El motivo es obligatorio", "err");
      return;
    }
    const r = await apiPost(`${modal.sol.idSolicitud}/bloqueos`, {
      motivo: mBloqueoMotivo,
    });
    if (r.ok) {
      showToast("Bloqueo registrado");
      setModal(null);
      fetchRows();
      reloadPanel();
    } else showToast(r.message || "Error", "err");
  }

  async function postComentario(idSolicitud) {
    if (!comentario.trim()) return;
    const r = await apiPost(`${idSolicitud}/comentario`, { comentario });
    if (r.ok) {
      showToast("Comentario agregado");
      setComentario("");
      reloadPanel();
    } else showToast(r.message || "Error", "err");
  }

  /* ── Exportar Excel (grid) ─────────────────────────────────── */
  function exportarExcel() {
    import("xlsx")
      .then((XLSX) => {
        const fecha = new Date()
          .toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })
          .replace(/\//g, "-");
        const datos = rows.map((sol) => ({
          Folio: sol.folioDesarrollo || "—",
          Tipo: sol.tipoNombre || "—",
          Título: sol.titulo || "—",
          Solicitante: sol.solicitante || "—",
          Área: sol.area || "—",
          Sistema: sol.sistemaNombre || "—",
          Prioridad: sol.prioridadNombre || "—",
          Estatus: sol.estatusNombre || "—",
          Responsable: sol.nombreResponsable || "Sin asignar",
          "Avance %": sol.porcentajeAvance ?? 0,
          "Fecha registro": sol.fechaCreacion
            ? new Date(sol.fechaCreacion).toLocaleDateString("es-MX")
            : "—",
          "Fecha compromiso": sol.fechaCompromiso
            ? new Date(sol.fechaCompromiso).toLocaleDateString("es-MX")
            : "—",
        }));
        const ws = XLSX.utils.json_to_sheet(datos);
        ws["!cols"] = [
          { wch: 24 },
          { wch: 20 },
          { wch: 40 },
          { wch: 22 },
          { wch: 16 },
          { wch: 22 },
          { wch: 12 },
          { wch: 18 },
          { wch: 22 },
          { wch: 10 },
          { wch: 16 },
          { wch: 18 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Desarrollos TI");
        XLSX.writeFile(wb, `Desarrollos-TI-${fecha}.xlsx`);
      })
      .catch(() => showToast("Instala xlsx: npm i xlsx", "err"));
  }

  /* ── Exportar PDF (grid) ─────────────────────────────────────  */
  function exportarPDF() {
    import("jspdf")
      .then(({ default: jsPDF }) =>
        import("jspdf-autotable").then(() => {
          const fecha = new Date().toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
          const doc = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: "a4",
          });
          doc.setFontSize(16);
          doc.setTextColor(79, 70, 229);
          doc.text("Desarrollos TI — FABPSA", 14, 16);
          doc.setFontSize(9);
          doc.setTextColor(107, 114, 128);
          doc.text(
            `Generado: ${fecha}  ·  Total: ${total} solicitudes`,
            14,
            22,
          );
          doc.autoTable({
            startY: 28,
            styles: {
              fontSize: 8,
              cellPadding: 2.5,
              lineColor: [229, 231, 235],
              lineWidth: 0.1,
            },
            headStyles: {
              fillColor: [79, 70, 229],
              textColor: 255,
              fontStyle: "bold",
              fontSize: 8,
            },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            columns: [
              { header: "Folio", dataKey: "folio" },
              { header: "Tipo", dataKey: "tipo" },
              { header: "Título", dataKey: "titulo" },
              { header: "Solicitante", dataKey: "solicitante" },
              { header: "Sistema", dataKey: "sistema" },
              { header: "Estatus", dataKey: "estatus" },
              { header: "Responsable", dataKey: "responsable" },
              { header: "Avance", dataKey: "avance" },
              { header: "F. Compromiso", dataKey: "fechaComp" },
            ],
            body: rows.map((sol) => ({
              folio: sol.folioDesarrollo || "—",
              tipo: sol.tipoNombre || "—",
              titulo: (sol.titulo || "—").slice(0, 45),
              solicitante: sol.solicitante || "—",
              sistema: sol.sistemaNombre || "—",
              estatus: sol.estatusNombre || "—",
              responsable: sol.nombreResponsable || "Sin asignar",
              avance: `${sol.porcentajeAvance ?? 0}%`,
              fechaComp: sol.fechaCompromiso
                ? new Date(sol.fechaCompromiso).toLocaleDateString("es-MX")
                : "—",
            })),
            columnStyles: {
              folio: { cellWidth: 28 },
              titulo: { cellWidth: 48 },
              avance: { halign: "center" },
            },
          });
          const pc = doc.internal.getNumberOfPages();
          for (let i = 1; i <= pc; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(156, 163, 175);
            doc.text(
              `Página ${i} de ${pc} — FABPSA TI`,
              doc.internal.pageSize.getWidth() / 2,
              doc.internal.pageSize.getHeight() - 6,
              { align: "center" },
            );
          }
          doc.save(`Desarrollos-TI-${fecha.replace(/\//g, "-")}.pdf`);
        }),
      )
      .catch(() =>
        showToast("Instala jspdf: npm i jspdf jspdf-autotable", "err"),
      );
  }

  /* ── Reporte PDF individual ────────────────────────────────── */
  function generarReportePDF(data) {
    import("jspdf")
      .then(({ default: jsPDF }) =>
        import("jspdf-autotable").then(() => {
          const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4",
          });
          const W = doc.internal.pageSize.getWidth();
          const ahora = new Date().toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const folio = data.folioDesarrollo || data.folio || "—";

          // ── Encabezado ──
          doc.setFillColor(79, 70, 229);
          doc.rect(0, 0, W, 22, "F");
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(14);
          doc.setFont(undefined, "bold");
          doc.text("FABPSA — Reporte de Desarrollo TI", 14, 9);
          doc.setFontSize(9);
          doc.setFont(undefined, "normal");
          doc.text(folio, 14, 16);
          doc.setFontSize(8);
          doc.text(`Generado: ${ahora}`, W - 14, 16, { align: "right" });

          let y = 30;
          function seccion(titulo) {
            doc.setFillColor(241, 245, 249);
            doc.rect(14, y, W - 28, 7, "F");
            doc.setTextColor(79, 70, 229);
            doc.setFontSize(9);
            doc.setFont(undefined, "bold");
            doc.text(titulo, 16, y + 4.8);
            doc.setTextColor(30, 30, 30);
            doc.setFont(undefined, "normal");
            y += 10;
          }
          function campo(label, val, col = 0) {
            const x = 14 + col * 92;
            doc.setFontSize(7.5);
            doc.setTextColor(120, 120, 120);
            doc.text(label, x, y);
            doc.setTextColor(30, 30, 30);
            doc.setFontSize(8.5);
            doc.setFont(undefined, "bold");
            const texto = String(val || "—").slice(0, 55);
            doc.text(texto, x, y + 4.5);
            doc.setFont(undefined, "normal");
            if (col === 1) y += 12;
          }
          function texto(content, indent = 14) {
            if (!content) return;
            doc.setFontSize(8);
            doc.setTextColor(60, 60, 60);
            const lines = doc.splitTextToSize(content, W - 28);
            doc.text(lines, indent, y);
            y += lines.length * 4 + 3;
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
          }
          function checky() {
            if (y > 270) {
              doc.addPage();
              y = 20;
            }
          }

          // 01 Información general
          seccion("01  INFORMACIÓN GENERAL");
          campo("Folio", folio, 0);
          campo("Tipo", data.tipoNombre, 1);
          campo("Sistema", data.sistemaNombre, 0);
          campo("Estatus", data.estatusNombre, 1);
          campo("Solicitante", data.nombreUsuario || data.solicitante, 0);
          campo("Área", data.areaUsuario || data.area, 1);
          campo(
            "Responsable TI",
            data.nombreTecnico || data.nombreResponsable,
            0,
          );
          campo("Prioridad", data.prioridadNombre, 1);
          campo("Fecha solicitud", fmtDate(data.fechaCreacion), 0);
          campo("Fecha inicio", fmtDate(data.fechaInicio), 1);
          campo("Fecha compromiso", fmtDate(data.fechaCompromiso), 0);
          campo("Fecha conclusión", fmtDate(data.fechaConclusión), 1);
          checky();
          if (data.horasEstimadas) {
            campo("Horas estimadas", `${data.horasEstimadas}h`, 0);
            y += 12;
          }
          if (data.horasResumen?.totalMinutos) {
            campo(
              "Horas registradas",
              fmtMinutos(data.horasResumen.totalMinutos),
              1,
            );
            y += 0;
          } else y += 0;
          y += 4;

          // Descripción
          if (data.descripcion) {
            seccion("DESCRIPCIÓN");
            texto(data.descripcion);
          }
          if (data.objetivo) {
            doc.setFontSize(8.5);
            doc.setTextColor(79, 70, 229);
            doc.setFont(undefined, "bold");
            doc.text("Objetivo", 14, y);
            doc.setFont(undefined, "normal");
            y += 5;
            texto(data.objetivo);
          }
          checky();

          // 02 Seguimiento
          if (data.bitacora?.length) {
            seccion("02  SEGUIMIENTO");
            doc.autoTable({
              startY: y,
              margin: { left: 14, right: 14 },
              styles: { fontSize: 7.5, cellPadding: 2 },
              headStyles: {
                fillColor: [79, 70, 229],
                textColor: 255,
                fontSize: 7.5,
                fontStyle: "bold",
              },
              alternateRowStyles: { fillColor: [248, 250, 252] },
              columns: [
                { header: "Fecha", dataKey: "f" },
                { header: "Usuario", dataKey: "u" },
                { header: "Evento", dataKey: "n" },
              ],
              body: data.bitacora.map((b) => ({
                f: fmtDateTime(b.fecha),
                u: b.nombreUsuario || b.idUsuario,
                n: (b.nota || "").slice(0, 120),
              })),
              columnStyles: { f: { cellWidth: 32 }, u: { cellWidth: 30 } },
            });
            y = doc.lastAutoTable.finalY + 6;
            checky();
          }

          // 03 Actividades
          if (data.actividades?.length) {
            seccion("03  ACTIVIDADES");
            doc.autoTable({
              startY: y,
              margin: { left: 14, right: 14 },
              styles: { fontSize: 7.5, cellPadding: 2 },
              headStyles: {
                fillColor: [79, 70, 229],
                textColor: 255,
                fontSize: 7.5,
                fontStyle: "bold",
              },
              alternateRowStyles: { fillColor: [248, 250, 252] },
              columns: [
                { header: "Fecha", dataKey: "f" },
                { header: "Responsable", dataKey: "u" },
                { header: "Actividad realizada", dataKey: "a" },
              ],
              body: data.actividades.map((a) => ({
                f: fmtDateTime(a.fecha),
                u: a.nombreUsuario || a.idUsuario,
                a: (a.actividad || "").slice(0, 150),
              })),
              columnStyles: { f: { cellWidth: 32 }, u: { cellWidth: 30 } },
            });
            y = doc.lastAutoTable.finalY + 6;
            checky();
          }

          // 04 Subtareas
          if (data.subtareas?.length) {
            seccion("04  SUBTAREAS");
            doc.autoTable({
              startY: y,
              margin: { left: 14, right: 14 },
              styles: { fontSize: 7.5, cellPadding: 2 },
              headStyles: {
                fillColor: [79, 70, 229],
                textColor: 255,
                fontSize: 7.5,
                fontStyle: "bold",
              },
              alternateRowStyles: { fillColor: [248, 250, 252] },
              columns: [
                { header: "Subtarea", dataKey: "t" },
                { header: "Estatus", dataKey: "e" },
                { header: "Responsable", dataKey: "r" },
                { header: "F. Compromiso", dataKey: "fc" },
              ],
              body: data.subtareas.map((s) => ({
                t: (s.titulo || "").slice(0, 50),
                e: s.estatusNombre || "—",
                r: s.nombreResponsable || "—",
                fc: fmtDate(s.fechaCompromiso),
              })),
            });
            y = doc.lastAutoTable.finalY + 6;
            checky();
          }

          // 05 Horas trabajadas
          if (data.horas?.length) {
            seccion("05  HORAS TRABAJADAS");
            doc.autoTable({
              startY: y,
              margin: { left: 14, right: 14 },
              styles: { fontSize: 7.5, cellPadding: 2 },
              headStyles: {
                fillColor: [79, 70, 229],
                textColor: 255,
                fontSize: 7.5,
                fontStyle: "bold",
              },
              alternateRowStyles: { fillColor: [248, 250, 252] },
              columns: [
                { header: "Fecha", dataKey: "f" },
                { header: "Usuario", dataKey: "u" },
                { header: "Tiempo", dataKey: "t" },
                { header: "Descripción", dataKey: "d" },
              ],
              body: data.horas.map((h) => ({
                f: fmtDate(h.fechaTrabajo),
                u: h.nombreUsuario,
                t: fmtMinutos(h.minutosTrabajos),
                d: (h.descripcion || "—").slice(0, 80),
              })),
              columnStyles: {
                f: { cellWidth: 24 },
                u: { cellWidth: 28 },
                t: { cellWidth: 16, halign: "center" },
              },
            });
            y = doc.lastAutoTable.finalY + 6;
            checky();
          }

          // 06 Bloqueos
          if (data.bloqueos?.length) {
            seccion("06  BLOQUEOS");
            doc.autoTable({
              startY: y,
              margin: { left: 14, right: 14 },
              styles: { fontSize: 7.5, cellPadding: 2 },
              headStyles: {
                fillColor: [79, 70, 229],
                textColor: 255,
                fontSize: 7.5,
                fontStyle: "bold",
              },
              alternateRowStyles: { fillColor: [248, 250, 252] },
              columns: [
                { header: "Motivo", dataKey: "m" },
                { header: "Registrado", dataKey: "f" },
                { header: "Resolución", dataKey: "r" },
              ],
              body: data.bloqueos.map((b) => ({
                m: (b.motivo || "").slice(0, 80),
                f: fmtDate(b.fechaBloqueo),
                r: b.fechaResolucion
                  ? fmtDate(b.fechaResolucion)
                  : "Sin resolver",
              })),
            });
            y = doc.lastAutoTable.finalY + 6;
            checky();
          }

          // 07 Archivos
          if (data.adjuntos?.length) {
            seccion("07  ARCHIVOS Y EVIDENCIAS");
            data.adjuntos.forEach((f) => {
              doc.setFontSize(8);
              doc.setTextColor(60, 60, 60);
              doc.text(`✓  ${f.nombreArchivo}`, 18, y);
              y += 5;
              checky();
            });
            y += 4;
          }

          // 08 Evaluación (solo si existe)
          if (data.evaluacion) {
            const ev = data.evaluacion;
            const prom = (
              (ev.satisfaccion +
                ev.cumplimiento +
                ev.tiempoEntrega +
                ev.calidad) /
              4
            ).toFixed(1);
            seccion("08  EVALUACIÓN DEL USUARIO");
            doc.setFontSize(8);
            doc.setTextColor(60, 60, 60);
            [
              ["Satisfacción general", ev.satisfaccion],
              ["Cumplimiento", ev.cumplimiento],
              ["Tiempo de entrega", ev.tiempoEntrega],
              ["Calidad", ev.calidad],
            ].forEach(([l, v]) => {
              doc.text(
                `${l}: ${"★".repeat(v)}${"☆".repeat(5 - v)}  (${v}/5)`,
                18,
                y,
              );
              y += 5;
            });
            doc.setFont(undefined, "bold");
            doc.text(`Promedio general: ${prom}/5`, 18, y);
            doc.setFont(undefined, "normal");
            y += 6;
            if (ev.comentarios) {
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              doc.text(`"${ev.comentarios}"`, 18, y);
              y += 6;
            }
            doc.setFontSize(7.5);
            doc.setTextColor(150, 150, 150);
            doc.text(
              `Evaluación recibida: ${fmtDate(ev.fechaEvaluacion)}`,
              18,
              y,
            );
            y += 8;
          }

          // Footer en todas las páginas
          const totalPags = doc.internal.getNumberOfPages();
          for (let i = 1; i <= totalPags; i++) {
            doc.setPage(i);
            doc.setDrawColor(229, 231, 235);
            doc.line(
              14,
              doc.internal.pageSize.getHeight() - 12,
              W - 14,
              doc.internal.pageSize.getHeight() - 12,
            );
            doc.setFontSize(7);
            doc.setTextColor(156, 163, 175);
            doc.text(
              "FABPSA — Portal Corporativo · Reporte generado automáticamente",
              14,
              doc.internal.pageSize.getHeight() - 7,
            );
            doc.text(
              `Página ${i} de ${totalPags}`,
              W - 14,
              doc.internal.pageSize.getHeight() - 7,
              { align: "right" },
            );
          }

          doc.save(`${folio}-Reporte.pdf`);
        }),
      )
      .catch(() =>
        showToast("Instala jspdf: npm i jspdf jspdf-autotable", "err"),
      );
  }

  const kpiTotal =
    (kpis.pendientes || 0) +
    (kpis.enEvaluacion || 0) +
    (kpis.enDesarrollo || 0) +
    (kpis.enRevision || 0) +
    (kpis.enPruebas || 0) +
    (kpis.concluidos || 0) +
    (kpis.cancelados || 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="sdp-root">
      {/* KPI Strip */}
      <div className="sdp-kpi-strip">
        {KPI_DEFS.map((kpi) => {
          const count = kpi.key === "todos" ? kpiTotal : kpis[kpi.key] || 0;
          return (
            <button
              key={kpi.key}
              className={[
                "sdp-kpi-chip",
                activeKpi === kpi.key ? "active" : "",
                kpi.isVencidos && count > 0 ? "chip-alert" : "",
              ]
                .join(" ")
                .trim()}
              onClick={() => handleKpiClick(kpi)}
            >
              <div
                className="kpi-icon-wrap"
                style={{ background: kpi.color + "18", color: kpi.color }}
              >
                <i className={`ti ${kpi.icon}`} />
              </div>
              <div className="kpi-text">
                <span
                  className="kpi-count"
                  style={{
                    color: activeKpi === kpi.key ? kpi.color : undefined,
                  }}
                >
                  {count}
                </span>
                <span className="kpi-label">{kpi.label}</span>
              </div>
              {kpi.isVencidos && count > 0 && <span className="kpi-pulse" />}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="sdp-toolbar">
        <div className="sdp-search-wrap">... {/* sin cambios */}</div>

        {/* ← NUEVO wrapper para filtros */}
        <div className="sdp-toolbar-filters">
          <select
            className="sdp-filter-select"
            value={fTipo}
            onChange={(e) => {
              setFTipo(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los tipos</option>
            {catalogos.tipos.map((t) => (
              <option key={t.idTipo} value={t.idTipo}>
                {t.nombre}
              </option>
            ))}
          </select>
          <select
            className="sdp-filter-select"
            value={fSistema}
            onChange={(e) => {
              setFSistema(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los sistemas</option>
            {catalogos.sistemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.desarrollo}
              </option>
            ))}
          </select>
          <select
            className="sdp-filter-select"
            value={fResponsable}
            onChange={(e) => {
              setFResponsable(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los responsables</option>
            {catalogos.tecnicos.map((t) => (
              <option key={t.login} value={t.login}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="sdp-toolbar-spacer" />
        <button
          className="sdp-btn sdp-btn-outline sdp-btn-excel"
          onClick={exportarExcel}
        >
          <i className="ti ti-table-export" /> Exportar Excel
        </button>
        <button
          className="sdp-btn sdp-btn-outline sdp-btn-pdf"
          onClick={exportarPDF}
        >
          <i className="ti ti-file-type-pdf" /> Exportar PDF
        </button>
        {/* ← agrega sdp-toolbar-new */}
        <button
          className="sdp-btn sdp-btn-primary sdp-toolbar-new"
          onClick={() => navigate("/mesa-de-servicio/desarrollo/nueva")}
        >
          <i className="ti ti-plus" /> Nueva solicitud
        </button>
      </div>

      {/* Tabla */}
      <div className="sdp-table-wrap">
        {loading ? (
          <div className="sdp-spinner-wrap">
            <div className="sdp-spinner" />
          </div>
        ) : rows.length === 0 ? (
          <div className="sdp-empty">
            <i className="ti ti-code-circle" />
            <p>No hay desarrollos con los filtros actuales</p>
          </div>
        ) : (
          <table className="sdp-table">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Título / Folio</th>
                <th>Solicitante</th>
                <th>Sistema</th>
                <th>Prioridad</th>
                <th>Estatus</th>
                <th>Responsable</th>
                <th>Avance</th>
                <th>Fecha</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((sol) => {
                const isExpanded = expandedId === sol.idSolicitud;
                const sinResponsable = !sol.loginResponsable;
                const puedeAvanzar = !sinResponsable;
                const bloqueado = sol.bloqueosActivos > 0;
                return (
                  <React.Fragment key={sol.idSolicitud}>
                    <tr
                      className={isExpanded ? "row-expanded" : ""}
                      onClick={() => loadPanel(sol.idSolicitud)}
                    >
                      <td
                        className="col-chevron"
                        onClick={stop(() => loadPanel(sol.idSolicitud))}
                      >
                        <i
                          className={`ti ${isExpanded ? "ti-chevron-up" : "ti-chevron-down"}`}
                        />
                      </td>
                      {/* Título como elemento principal, folio secundario */}
                      <td className="col-titulo-main">
                        <div className="titulo-principal">
                          {bloqueado && (
                            <span
                              className="sdp-bloqueo-badge"
                              title="Desarrollo bloqueado"
                            >
                              <i className="ti ti-lock" />
                            </span>
                          )}
                          <span className="titulo-text">{sol.titulo}</span>
                          {sol.motivoRevision && (
                            <span
                              className="sdp-revision-dot"
                              title={`En revisión: ${sol.motivoRevision}`}
                            >
                              <i className="ti ti-alert-circle" />
                            </span>
                          )}
                        </div>
                        <div className="titulo-meta">
                          <span className="sdp-folio-tag">
                            {sol.folioDesarrollo}
                          </span>
                          {sol.tipoCodigo && (
                            <span
                              className={`sdp-tipo-mini sdp-tipo-mini--${sol.tipoCodigo.toLowerCase()}`}
                            >
                              {sol.tipoNombre}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* NUEVA celda — solo visible en móvil */}
                      <td className="col-solicitante">
                        <span className="sol-nombre">{sol.solicitante}</span>
                        {sol.area && (
                          <span className="sol-area">{sol.area}</span>
                        )}
                      </td>
                      <td className="col-sistema">
                        {sol.sistemaNombre || "—"}
                      </td>
                      <td>
                        {sol.prioridadNombre ? (
                          <span className="sdp-prio">
                            <span
                              className="sdp-prio-dot"
                              style={{
                                background: sol.prioridadColor || "#9ca3af",
                              }}
                            />
                            {sol.prioridadNombre}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {sol.estatusNombre ? (
                          <span
                            className="sdp-estatus-pill"
                            style={{
                              background: sol.estatusBg || "#f3f4f6",
                              color: sol.estatusColor || "#6b7280",
                            }}
                          >
                            {sol.estatusNombre}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="col-responsable">
                        {sol.nombreResponsable ? (
                          <div className="sdp-resp-cell">
                            <Avatar nombre={sol.nombreResponsable} size={26} />
                            <span>{sol.nombreResponsable}</span>
                          </div>
                        ) : (
                          <button
                            className="sdp-asignarme-btn"
                            onClick={stop(() => handleAsignarme(sol))}
                          >
                            <i className="ti ti-user-plus" /> Asignarme
                          </button>
                        )}
                      </td>
                      <td className="col-avance">
                        <div className="avance-cell">
                          <div className="avance-track">
                            <div
                              className="avance-fill"
                              style={{ width: `${sol.porcentajeAvance ?? 0}%` }}
                            />
                          </div>
                          <span className="avance-num">
                            {sol.porcentajeAvance ?? 0}%
                          </span>
                        </div>
                        <MiniBarraTiempo row={sol} />
                      </td>
                      <td className="col-fecha">
                        {fmtDate(sol.fechaCreacion)}
                      </td>
                      <td
                        className="col-acciones"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="sdp-row-actions">
                          <button
                            className="sdp-icon-btn"
                            title="Ver detalle"
                            onClick={stop(() => loadPanel(sol.idSolicitud))}
                          >
                            <i className="ti ti-eye" />
                          </button>
                          <div className="sdp-menu-wrap">
                            <button
                              className="sdp-icon-btn sdp-menu-trigger"
                              onClick={stop((e) => {
                                e.currentTarget.nextSibling.classList.toggle(
                                  "open",
                                );
                              })}
                            >
                              <i className="ti ti-dots-vertical" />
                            </button>
                            <div className="sdp-menu-dropdown">
                              <button
                                onClick={stop(() => openModal("asignar", sol))}
                              >
                                <i className="ti ti-user-check" /> Asignar
                                responsable
                              </button>
                              <button
                                disabled={sinResponsable}
                                title={
                                  sinResponsable
                                    ? "Asigna un responsable primero"
                                    : ""
                                }
                                onClick={stop(() => {
                                  if (puedeAvanzar) openModal("estatus", sol);
                                })}
                              >
                                <i className="ti ti-refresh" /> Cambiar estatus
                              </button>
                              <button
                                disabled={sinResponsable}
                                onClick={stop(() => {
                                  if (puedeAvanzar) openModal("horas", sol);
                                })}
                              >
                                <i className="ti ti-clock-hour-4" /> Registrar
                                tiempo
                              </button>
                              <button
                                disabled={sinResponsable}
                                onClick={stop(() => {
                                  if (puedeAvanzar) openModal("actividad", sol);
                                })}
                              >
                                <i className="ti ti-activity" /> Registrar
                                actividad
                              </button>
                              <button
                                disabled={sinResponsable}
                                onClick={stop(() => {
                                  if (puedeAvanzar) openModal("bloqueo", sol);
                                })}
                              >
                                <i className="ti ti-lock" /> Registrar bloqueo
                              </button>
                              <button
                                disabled={sinResponsable}
                                onClick={stop(() => {
                                  if (puedeAvanzar) openModal("detalle", sol);
                                })}
                              >
                                <i className="ti ti-calendar-event" /> Fecha /
                                Avance
                              </button>
                              {[3, 4, 5].includes(sol.idEstatus) && (
                                <button
                                  disabled={sinResponsable}
                                  className="menu-item-danger"
                                  onClick={stop(() => {
                                    if (puedeAvanzar)
                                      openModal("concluir", sol);
                                  })}
                                >
                                  <i className="ti ti-circle-check" /> Concluir
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="sdp-expand-row">
                        <td colSpan={10}>
                          {panelLoading ? (
                            <div className="sdp-spinner-wrap">
                              <div className="sdp-spinner" />
                            </div>
                          ) : panelData ? (
                            <PanelExpandido
                              data={panelData}
                              tab={panelTab}
                              onTabChange={setPanelTab}
                              comentario={comentario}
                              setComentario={setComentario}
                              onPostComentario={() =>
                                postComentario(sol.idSolicitud)
                              }
                              onAsignar={() => openModal("asignar", sol)}
                              onAsignarme={() => handleAsignarme(sol)}
                              onEstatus={() => openModal("estatus", sol)}
                              onDetalle={() => openModal("detalle", sol)}
                              onConcluir={() => openModal("concluir", sol)}
                              onActividad={() => openModal("actividad", sol)}
                              onHoras={() => openModal("horas", sol)}
                              onBloqueo={() => openModal("bloqueo", sol)}
                              onNuevaSubtarea={() => openModal("subtarea", sol)}
                              onEditarSubtarea={(sub) => {
                                openModal("subtarea", sol);
                                setMSubEditing(sub.idSubtarea);
                                setMSubTitulo(sub.titulo);
                                setMSubDesc(sub.descripcion || "");
                                setMSubEstatus(String(sub.idEstatus));
                                setMSubPrio(String(sub.idPrioridad || ""));
                                setMSubResp({
                                  login: sub.loginResponsable || "",
                                  nombre: sub.nombreResponsable || "",
                                });
                                setMSubFI(
                                  sub.fechaInicio
                                    ? sub.fechaInicio.slice(0, 10)
                                    : "",
                                );
                                setMSubFC(
                                  sub.fechaCompromiso
                                    ? sub.fechaCompromiso.slice(0, 10)
                                    : "",
                                );
                              }}
                              onResolverBloqueo={async (idB) => {
                                const r = await apiPut(
                                  `${sol.idSolicitud}/bloqueos/${idB}/resolver`,
                                  {},
                                );
                                if (r.ok) {
                                  showToast("Bloqueo resuelto");
                                  fetchRows();
                                  reloadPanel();
                                } else showToast(r.message || "Error", "err");
                              }}
                              onEliminarHoras={async (idR) => {
                                const r = await apiDelete(
                                  `${sol.idSolicitud}/horas/${idR}`,
                                );
                                if (r.ok) {
                                  showToast("Registro eliminado");
                                  reloadPanel();
                                } else showToast(r.message || "Error", "err");
                              }}
                              onReportePDF={() => generarReportePDF(panelData)}
                              user={user}
                              catalogos={catalogos}
                            />
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      {!loading && total > 0 && (
        <div className="sdp-pagination">
          <span className="sdp-pagination-info">
            Mostrando {Math.min((page - 1) * PAGE_SIZE + 1, total)}–
            {Math.min(page * PAGE_SIZE, total)} de {total} solicitudes
          </span>
          <div className="sdp-page-btns">
            <button
              className="sdp-page-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <i className="ti ti-chevron-left" />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return (
                <button
                  key={p}
                  className={`sdp-page-btn${page === p ? " active" : ""}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              );
            })}
            <button
              className="sdp-page-btn"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <i className="ti ti-chevron-right" />
            </button>
          </div>
        </div>
      )}

      {/* MODALES */}
      {modal &&
        ReactDOM.createPortal(
          <div className="sdp-modal-backdrop" onClick={() => setModal(null)}>
            <div className="sdp-modal" onClick={(e) => e.stopPropagation()}>
              {modal.type === "asignar" && (
                <>
                  <p className="sdp-modal-title">
                    <i className="ti ti-user-check" /> Asignar responsable
                  </p>
                  <div className="sdp-modal-field">
                    <label>Responsable TI</label>
                    <select
                      value={mAsignar.login}
                      onChange={(e) => {
                        const t = catalogos.tecnicos.find(
                          (t) => t.login === e.target.value,
                        );
                        setMAsignar({
                          login: e.target.value,
                          nombre: t?.nombre || "",
                        });
                      }}
                    >
                      <option value="">— Sin asignar —</option>
                      {catalogos.tecnicos.map((t) => (
                        <option key={t.login} value={t.login}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sdp-modal-footer">
                    <button
                      className="sdp-btn sdp-btn-ghost"
                      onClick={() => setModal(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="sdp-btn sdp-btn-primary"
                      onClick={handleAsignar}
                    >
                      Guardar
                    </button>
                  </div>
                </>
              )}

              {modal.type === "estatus" && (
                <>
                  <p className="sdp-modal-title">
                    <i className="ti ti-refresh" /> Cambiar estatus
                  </p>
                  {!modal.sol.loginResponsable && (
                    <div className="sdp-modal-warn">
                      <i className="ti ti-alert-triangle" /> Asigna un
                      responsable antes de avanzar el estatus.
                    </div>
                  )}
                  <div className="sdp-modal-field">
                    <label>Nuevo estatus</label>
                    <select
                      value={mEstatus}
                      onChange={(e) => setMEstatus(e.target.value)}
                      disabled={!modal.sol.loginResponsable}
                    >
                      <option value="">— Selecciona —</option>
                      {catalogos.estatus.map((e) => (
                        <option key={e.idEstatus} value={e.idEstatus}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  {mEstatus === "3" && (
                    <div className="sdp-modal-field">
                      <label>
                        Fecha compromiso{" "}
                        <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        type="date"
                        value={mFecha}
                        onChange={(e) => setMFecha(e.target.value)}
                      />
                      <div className="sdp-modal-hint">
                        <i className="ti ti-info-circle" /> El contador de
                        tiempo comenzará desde este momento.
                      </div>
                    </div>
                  )}
                  {(mEstatus === "4" || mEstatus === "6") && (
                    <div className="sdp-modal-field">
                      <label>
                        {mEstatus === "4"
                          ? "Motivo de revisión *"
                          : "Motivo de cancelación *"}
                      </label>
                      <textarea
                        rows={3}
                        value={mMotivo}
                        onChange={(e) => setMMotivo(e.target.value)}
                        placeholder={
                          mEstatus === "4"
                            ? "¿Qué requiere revisión?"
                            : "¿Por qué se cancela?"
                        }
                      />
                    </div>
                  )}
                  {mEstatus === "7" && (
                    <div className="sdp-modal-hint sdp-modal-hint--warn">
                      <i className="ti ti-alert-triangle" /> Para concluir usa
                      el botón "Concluir" en el panel.
                    </div>
                  )}
                  <div className="sdp-modal-footer">
                    <button
                      className="sdp-btn sdp-btn-ghost"
                      onClick={() => setModal(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="sdp-btn sdp-btn-primary"
                      onClick={
                        mEstatus === "7" ? () => setModal(null) : handleEstatus
                      }
                    >
                      {mEstatus === "7" ? "Entendido" : "Guardar"}
                    </button>
                  </div>
                </>
              )}

              {modal.type === "detalle" && (
                <>
                  <p className="sdp-modal-title">
                    <i className="ti ti-calendar-event" /> Seguimiento
                  </p>
                  <div className="sdp-modal-field">
                    <label>Fecha compromiso</label>
                    <input
                      type="date"
                      value={mFecha}
                      onChange={(e) => setMFecha(e.target.value)}
                    />
                  </div>
                  <div className="sdp-modal-field">
                    <label>
                      Avance — <strong>{mAvance}%</strong>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={mAvance}
                      className="sdp-range"
                      onChange={(e) => setMAvance(parseInt(e.target.value))}
                    />
                    <div className="sdp-range-labels">
                      {[0, 25, 50, 75, 100].map((n) => (
                        <span key={n}>{n}%</span>
                      ))}
                    </div>
                  </div>
                  <div className="sdp-modal-footer">
                    <button
                      className="sdp-btn sdp-btn-ghost"
                      onClick={() => setModal(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="sdp-btn sdp-btn-primary"
                      onClick={handleDetalle}
                    >
                      Guardar
                    </button>
                  </div>
                </>
              )}

              {modal.type === "concluir" && (
                <>
                  <p className="sdp-modal-title">
                    <i className="ti ti-circle-check" /> Concluir desarrollo
                  </p>
                  <p className="sdp-modal-subtitle">
                    Folio:{" "}
                    <span className="sdp-mono">
                      {modal.sol.folioDesarrollo}
                    </span>
                  </p>
                  <div className="sdp-modal-field">
                    <label>
                      Actividades realizadas{" "}
                      <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <textarea
                      rows={4}
                      value={mActividadesConcluir}
                      onChange={(e) => setMActividadesConcluir(e.target.value)}
                      autoFocus
                      placeholder="Describe el trabajo realizado…"
                    />
                    <div className="sdp-modal-hint">
                      <i className="ti ti-info-circle" /> Quedará en la pestaña
                      Actividades automáticamente.
                    </div>
                  </div>
                  <div className="sdp-modal-field">
                    <label>¿Impactó a otras áreas?</label>
                    <div className="sdp-radio-group">
                      <label className="sdp-radio-opt">
                        <input
                          type="radio"
                          name="impacta"
                          checked={!mImpacta}
                          onChange={() => setMImpacta(false)}
                        />
                        <span>No</span>
                      </label>
                      <label className="sdp-radio-opt">
                        <input
                          type="radio"
                          name="impacta"
                          checked={mImpacta}
                          onChange={() => setMImpacta(true)}
                        />
                        <span>Sí</span>
                      </label>
                    </div>
                  </div>
                  {mImpacta && (
                    <div className="sdp-impactos">
                      <label className="sdp-impactos-label">
                        Áreas impactadas *
                      </label>
                      {mImpactos.map((imp, i) => (
                        <div key={i} className="sdp-impacto-row">
                          <input
                            type="text"
                            placeholder="Área"
                            value={imp.area}
                            onChange={(e) => {
                              const n = [...mImpactos];
                              n[i].area = e.target.value;
                              setMImpactos(n);
                            }}
                          />
                          <textarea
                            rows={2}
                            placeholder="Descripción"
                            value={imp.motivo}
                            onChange={(e) => {
                              const n = [...mImpactos];
                              n[i].motivo = e.target.value;
                              setMImpactos(n);
                            }}
                          />
                          {mImpactos.length > 1 && (
                            <button
                              className="sdp-btn sdp-btn-danger-sm"
                              onClick={() =>
                                setMImpactos((p) => p.filter((_, j) => j !== i))
                              }
                            >
                              <i className="ti ti-trash" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        className="sdp-btn sdp-btn-ghost sdp-btn-sm"
                        onClick={() =>
                          setMImpactos((p) => [...p, { area: "", motivo: "" }])
                        }
                      >
                        <i className="ti ti-plus" /> Agregar área
                      </button>
                    </div>
                  )}
                  <div className="sdp-modal-footer">
                    <button
                      className="sdp-btn sdp-btn-ghost"
                      onClick={() => setModal(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="sdp-btn sdp-btn-primary"
                      onClick={handleConcluir}
                    >
                      <i className="ti ti-circle-check" /> Concluir
                    </button>
                  </div>
                </>
              )}

              {modal.type === "actividad" && (
                <>
                  <p className="sdp-modal-title">
                    <i className="ti ti-activity" /> Registrar actividad
                  </p>
                  <div className="sdp-modal-field">
                    <label>Actividad realizada *</label>
                    <textarea
                      rows={4}
                      value={mActividad}
                      onChange={(e) => setMActividad(e.target.value)}
                      autoFocus
                      placeholder="Describe el trabajo realizado en esta sesión."
                    />
                  </div>
                  <div className="sdp-modal-footer">
                    <button
                      className="sdp-btn sdp-btn-ghost"
                      onClick={() => setModal(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="sdp-btn sdp-btn-primary"
                      onClick={handleActividad}
                    >
                      Registrar
                    </button>
                  </div>
                </>
              )}

              {modal.type === "horas" && (
                <>
                  <p className="sdp-modal-title">
                    <i className="ti ti-clock-hour-4" /> Registrar tiempo
                    trabajado
                  </p>
                  <p className="sdp-modal-subtitle">
                    <span className="sdp-mono">
                      {modal.sol.folioDesarrollo}
                    </span>
                  </p>
                  <div className="sdp-modal-field">
                    <label>Tiempo trabajado *</label>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={mHorasH}
                        onChange={(e) =>
                          setMHorasH(Math.max(0, parseInt(e.target.value) || 0))
                        }
                        style={{ width: 70 }}
                        placeholder="0"
                      />{" "}
                      <span style={{ fontSize: 13 }}>horas</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        step={5}
                        value={mHorasM}
                        onChange={(e) =>
                          setMHorasM(Math.max(0, parseInt(e.target.value) || 0))
                        }
                        style={{ width: 70 }}
                        placeholder="0"
                      />{" "}
                      <span style={{ fontSize: 13 }}>minutos</span>
                    </div>
                  </div>
                  <div className="sdp-modal-field">
                    <label>Fecha del trabajo</label>
                    <input
                      type="date"
                      value={mHorasFecha}
                      onChange={(e) => setMHorasFecha(e.target.value)}
                    />
                  </div>
                  <div className="sdp-modal-field">
                    <label>¿Qué hiciste? (opcional)</label>
                    <textarea
                      rows={3}
                      value={mHorasDesc}
                      onChange={(e) => setMHorasDesc(e.target.value)}
                      placeholder="Breve descripción del trabajo realizado…"
                    />
                  </div>
                  <div className="sdp-modal-footer">
                    <button
                      className="sdp-btn sdp-btn-ghost"
                      onClick={() => setModal(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="sdp-btn sdp-btn-primary"
                      onClick={handleHoras}
                    >
                      <i className="ti ti-clock-hour-4" /> Registrar tiempo
                    </button>
                  </div>
                </>
              )}

              {modal.type === "subtarea" && (
                <>
                  <p className="sdp-modal-title">
                    <i className="ti ti-subtask" />{" "}
                    {mSubEditing ? "Editar subtarea" : "Nueva subtarea"}
                  </p>
                  <div className="sdp-modal-field">
                    <label>Título *</label>
                    <input
                      type="text"
                      value={mSubTitulo}
                      onChange={(e) => setMSubTitulo(e.target.value)}
                      placeholder="Resumen de la subtarea"
                      autoFocus
                    />
                  </div>
                  <div className="sdp-modal-field">
                    <label>Descripción</label>
                    <textarea
                      rows={3}
                      value={mSubDesc}
                      onChange={(e) => setMSubDesc(e.target.value)}
                      placeholder="Detalle de lo que hay que hacer…"
                    />
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div className="sdp-modal-field">
                      <label>Estatus</label>
                      <select
                        value={mSubEstatus}
                        onChange={(e) => setMSubEstatus(e.target.value)}
                      >
                        {catalogos.estatus.map((e) => (
                          <option key={e.idEstatus} value={e.idEstatus}>
                            {e.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sdp-modal-field">
                      <label>Prioridad</label>
                      <select
                        value={mSubPrio}
                        onChange={(e) => setMSubPrio(e.target.value)}
                      >
                        <option value="">— Sin prioridad —</option>
                        {catalogos.prioridades.map((p) => (
                          <option key={p.idPrioridad} value={p.idPrioridad}>
                            {p.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="sdp-modal-field">
                    <label>Responsable</label>
                    <select
                      value={mSubResp.login}
                      onChange={(e) => {
                        const t = catalogos.tecnicos.find(
                          (t) => t.login === e.target.value,
                        );
                        setMSubResp({
                          login: e.target.value,
                          nombre: t?.nombre || "",
                        });
                      }}
                    >
                      <option value="">— Sin asignar —</option>
                      {catalogos.tecnicos.map((t) => (
                        <option key={t.login} value={t.login}>
                          {t.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    <div className="sdp-modal-field">
                      <label>Fecha inicio</label>
                      <input
                        type="date"
                        value={mSubFI}
                        onChange={(e) => setMSubFI(e.target.value)}
                      />
                    </div>
                    <div className="sdp-modal-field">
                      <label>Fecha compromiso</label>
                      <input
                        type="date"
                        value={mSubFC}
                        onChange={(e) => setMSubFC(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="sdp-modal-footer">
                    <button
                      className="sdp-btn sdp-btn-ghost"
                      onClick={() => setModal(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="sdp-btn sdp-btn-primary"
                      onClick={handleSubtarea}
                    >
                      {mSubEditing ? "Actualizar" : "Crear subtarea"}
                    </button>
                  </div>
                </>
              )}

              {modal.type === "bloqueo" && (
                <>
                  <p className="sdp-modal-title">
                    <i className="ti ti-lock" /> Registrar bloqueo
                  </p>
                  <p className="sdp-modal-subtitle">
                    <span className="sdp-mono">
                      {modal.sol.folioDesarrollo}
                    </span>
                  </p>
                  <div className="sdp-modal-field">
                    <label>¿Qué está bloqueando el desarrollo? *</label>
                    <textarea
                      rows={4}
                      value={mBloqueoMotivo}
                      onChange={(e) => setMBloqueoMotivo(e.target.value)}
                      autoFocus
                      placeholder="Ej. Esperando acceso a servidor de producción, pendiente información del área de Finanzas…"
                    />
                  </div>
                  <div className="sdp-modal-hint sdp-modal-hint--warn">
                    <i className="ti ti-alert-triangle" /> El bloqueo quedará
                    visible en el grid y en el historial.
                  </div>
                  <div className="sdp-modal-footer">
                    <button
                      className="sdp-btn sdp-btn-ghost"
                      onClick={() => setModal(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="sdp-btn sdp-btn-primary"
                      onClick={handleBloqueo}
                    >
                      <i className="ti ti-lock" /> Registrar bloqueo
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {toast &&
        ReactDOM.createPortal(
          <div className={`sdp-toast sdp-toast--${toast.type}`}>
            {toast.msg}
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   PanelExpandido
══════════════════════════════════════════════════════════════ */
function PanelExpandido({
  data,
  tab,
  onTabChange,
  comentario,
  setComentario,
  onPostComentario,
  onAsignar,
  onAsignarme,
  onEstatus,
  onDetalle,
  onConcluir,
  onActividad,
  onHoras,
  onBloqueo,
  onNuevaSubtarea,
  onEditarSubtarea,
  onResolverBloqueo,
  onEliminarHoras,
  onReportePDF,
  user,
  catalogos,
}) {
  const {
    adjuntos = [],
    comentarios = [],
    bitacora = [],
    actividades = [],
    evaluacion = null,
    impactos = [],
    horas = [],
    horasResumen = { totalMinutos: 0, minutosHoy: 0, minutosSemana: 0 },
    subtareas = [],
    bloqueos = [],
    ...sol
  } = data;
  const esConcluido = sol.idEstatus === 7;
  const sinResponsable = !sol.tecnicoAsignado && !sol.nombreTecnico;
  const puedeAvanzar = !sinResponsable;
  const puedeConcluir = !sinResponsable && [3, 4, 5].includes(sol.idEstatus);
  const esSolicitante = user?.login === sol.idUsuario;
  const bloqueosActivos = bloqueos.filter((b) => !b.fechaResolucion);

  const counts = {
    actividades: actividades.length,
    subtareas: subtareas.length,
    horas: horas.length,
    bloqueos: bloqueosActivos.length,
    comentarios: comentarios.length,
    archivos: adjuntos.length,
  };

  return (
    <div className="sdp-panel">
      {sinResponsable && (
        <div className="sdp-panel-warn">
          <i className="ti ti-alert-circle" />
          <span>Asigna un responsable para poder avanzar este desarrollo.</span>
          <button
            className="sdp-btn sdp-btn-primary sdp-btn-sm"
            onClick={stop(onAsignarme)}
          >
            <i className="ti ti-user-plus" /> Asignarme
          </button>
          <button
            className="sdp-btn sdp-btn-ghost sdp-btn-sm"
            onClick={stop(onAsignar)}
          >
            Asignar otro
          </button>
        </div>
      )}
      {bloqueosActivos.length > 0 && (
        <div className="sdp-panel-bloqueado">
          <i className="ti ti-lock" />
          <span>
            <strong>Desarrollo bloqueado:</strong> {bloqueosActivos[0].motivo}
          </span>
        </div>
      )}

      <div className="sdp-tabs">
        <div className="sdp-tabs-left">
          {TABS.map((t) => {
            const cnt = counts[t.key];
            return (
              <button
                key={t.key}
                className={`sdp-tab-btn${tab === t.key ? " active" : ""}`}
                onClick={stop(() => onTabChange(t.key))}
              >
                <i className={`ti ${t.icon}`} />
                {t.label}
                {cnt > 0 && (
                  <span
                    className={`sdp-tab-badge${t.key === "bloqueos" ? " sdp-tab-badge--danger" : ""}`}
                  >
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="sdp-tabs-right">
          <button
            className="sdp-btn sdp-btn-ghost sdp-btn-sm"
            onClick={stop(onReportePDF)}
            title="Generar reporte PDF de este desarrollo"
          >
            <i className="ti ti-file-type-pdf" /> Reporte PDF
          </button>
          {puedeConcluir && (
            <button
              className="sdp-btn sdp-btn-primary sdp-btn-sm"
              onClick={stop(onConcluir)}
            >
              <i className="ti ti-circle-check" /> Concluir
            </button>
          )}
        </div>
      </div>

      <div className="sdp-tab-content" key={tab}>
        {tab === "resumen" && (
          <TabResumen
            sol={sol}
            impactos={impactos}
            actividades={actividades}
            comentarios={comentarios}
            adjuntos={adjuntos}
            subtareas={subtareas}
            horas={horas}
            horasResumen={horasResumen}
            bloqueosActivos={bloqueosActivos}
            onAsignar={onAsignar}
            onAsignarme={onAsignarme}
            onEstatus={onEstatus}
            onDetalle={onDetalle}
            onConcluir={onConcluir}
            onActividad={onActividad}
            onHoras={onHoras}
            puedeAvanzar={puedeAvanzar}
            puedeConcluir={puedeConcluir}
          />
        )}
        {tab === "seguimiento" && (
          <TabSeguimiento
            sol={sol}
            bitacora={bitacora}
            onDetalle={onDetalle}
            onConcluir={onConcluir}
            puedeConcluir={puedeConcluir}
          />
        )}
        {tab === "actividades" && (
          <TabActividades
            actividades={actividades}
            bitacora={bitacora}
            onNueva={onActividad}
            puedeAvanzar={puedeAvanzar}
          />
        )}
        {tab === "subtareas" && (
          <TabSubtareas
            subtareas={subtareas}
            onNueva={onNuevaSubtarea}
            onEditar={onEditarSubtarea}
            puedeAvanzar={puedeAvanzar}
          />
        )}
        {tab === "horas" && (
          <TabHoras
            horas={horas}
            horasResumen={horasResumen}
            onNueva={onHoras}
            onEliminar={onEliminarHoras}
            puedeAvanzar={puedeAvanzar}
            userLogin={user?.login}
          />
        )}
        {tab === "bloqueos" && (
          <TabBloqueos
            bloqueos={bloqueos}
            onNuevo={onBloqueo}
            onResolver={onResolverBloqueo}
            puedeAvanzar={puedeAvanzar}
          />
        )}
        {tab === "comentarios" && (
          <TabComentarios
            comentarios={comentarios}
            comentario={comentario}
            setComentario={setComentario}
            onPost={onPostComentario}
          />
        )}
        {tab === "archivos" && <TabArchivos adjuntos={adjuntos} />}
        {tab === "evaluacion" && (
          <TabEvaluacion
            evaluacion={evaluacion}
            esConcluido={esConcluido}
            esSolicitante={esSolicitante}
            idSolicitud={sol.idSolicitud}
          />
        )}
      </div>
    </div>
  );
}

/* ── Tab Resumen ─────────────────────────────────────────────── */
function TabResumen({
  sol,
  impactos,
  actividades,
  comentarios,
  adjuntos,
  subtareas,
  horas,
  horasResumen,
  bloqueosActivos,
  onAsignar,
  onAsignarme,
  onEstatus,
  onDetalle,
  onActividad,
  onHoras,
  puedeAvanzar,
  puedeConcluir,
}) {
  return (
    <div className="tab-resumen">
      <div className="resumen-block resumen-block--info">
        <p className="resumen-block-title">Información general</p>
        <div className="info-rows">
          <InfoRow
            label="Folio"
            value={<span className="sdp-mono">{sol.folioDesarrollo}</span>}
          />
          <InfoRow label="Tipo" value={sol.tipoNombre || "—"} />
          <InfoRow label="Sistema" value={sol.sistemaNombre || "—"} />
          <InfoRow
            label="Área solicitante"
            value={sol.areaUsuario || sol.area || "—"}
          />
          <InfoRow label="Sitio" value={sol.sitioUsuario || sol.sitio || "—"} />
          <InfoRow
            label="Fecha registro"
            value={fmtDateTime(sol.fechaCreacion)}
          />
          <InfoRow
            label="Solicitante"
            value={
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Avatar
                  nombre={sol.nombreUsuario || sol.solicitante}
                  size={22}
                />
                {sol.nombreUsuario || sol.solicitante || "—"}
              </div>
            }
          />
        </div>
      </div>
      <div className="resumen-block resumen-block--desc">
        <p className="resumen-block-title">Descripción</p>
        <p className="desc-text">{sol.descripcion || "—"}</p>
        {sol.objetivo && (
          <>
            <p className="resumen-block-subtitle">Objetivo</p>
            <p className="desc-text">{sol.objetivo}</p>
          </>
        )}
        {sol.justificacion && (
          <>
            <p className="resumen-block-subtitle">Justificación</p>
            <p className="desc-text desc-text--sm">{sol.justificacion}</p>
          </>
        )}
        {sol.motivoRevision && (
          <div className="desc-alert desc-alert--warn">
            <i className="ti ti-alert-circle" />
            <div>
              <strong>En revisión:</strong> {sol.motivoRevision}
            </div>
          </div>
        )}
        {sol.motivoRechazo && (
          <div className="desc-alert desc-alert--danger">
            <i className="ti ti-circle-x" />
            <div>
              <strong>Cancelado:</strong> {sol.motivoRechazo}
            </div>
          </div>
        )}
        {bloqueosActivos.length > 0 && (
          <div className="desc-alert desc-alert--bloqueo">
            <i className="ti ti-lock" />
            <div>
              <strong>Bloqueado:</strong> {bloqueosActivos[0].motivo}
            </div>
          </div>
        )}
      </div>
      <div className="resumen-block resumen-block--tiempo">
        <p className="resumen-block-title">Progreso y tiempos</p>
        <div className="prog-row">
          <span className="prog-label">Avance</span>
          <div className="avance-track avance-track--lg">
            <div
              className="avance-fill"
              style={{ width: `${sol.porcentajeAvance ?? 0}%` }}
            />
          </div>
          <span className="prog-pct">{sol.porcentajeAvance ?? 0}%</span>
        </div>
        <div className="tiempo-rows">
          <div className="tiempo-row">
            <span className="tiempo-label">Tiempo transcurrido</span>
            <span className="tiempo-val">
              {sol.diasTranscurridos ?? sol.diasAbiertos ?? 0} días
            </span>
          </div>
          <div className="tiempo-row">
            <span className="tiempo-label">Tiempo restante</span>
            <span className="tiempo-val">
              <MiniBarraTiempo row={sol} />
            </span>
          </div>
          <div className="tiempo-row">
            <span className="tiempo-label">Fecha compromiso</span>
            <span className="tiempo-val">{fmtDate(sol.fechaCompromiso)}</span>
          </div>
          <div className="tiempo-row">
            <span className="tiempo-label">Inicio real</span>
            <span className="tiempo-val">{fmtDate(sol.fechaInicio)}</span>
          </div>
          <div className="tiempo-row">
            <span className="tiempo-label">Semáforo</span>
            <span className="tiempo-val">
              <SemaforoSLA row={sol} />
            </span>
          </div>
          {sol.horasEstimadas && (
            <div className="tiempo-row">
              <span className="tiempo-label">Horas estimadas</span>
              <span className="tiempo-val">{sol.horasEstimadas}h</span>
            </div>
          )}
          {horasResumen.totalMinutos > 0 && (
            <div className="tiempo-row">
              <span className="tiempo-label">Horas registradas</span>
              <span
                className="tiempo-val"
                style={{ color: "#4f46e5", fontWeight: 600 }}
              >
                {fmtMinutos(horasResumen.totalMinutos)}
              </span>
            </div>
          )}
        </div>
        <div className="prog-responsable">
          <span className="prog-label">Responsable</span>
          {sol.nombreTecnico || sol.nombreResponsable ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 4,
              }}
            >
              <Avatar
                nombre={sol.nombreTecnico || sol.nombreResponsable}
                size={28}
              />
              <span style={{ fontWeight: 600 }}>
                {sol.nombreTecnico || sol.nombreResponsable}
              </span>
            </div>
          ) : (
            <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
              <button
                className="sdp-btn sdp-btn-primary sdp-btn-sm"
                onClick={stop(onAsignarme)}
              >
                <i className="ti ti-user-plus" /> Asignarme
              </button>
              <button
                className="sdp-btn sdp-btn-ghost sdp-btn-sm"
                onClick={stop(onAsignar)}
              >
                Asignar
              </button>
            </div>
          )}
        </div>
        <div className="prog-acciones">
          <button
            className="sdp-btn sdp-btn-ghost sdp-btn-sm"
            onClick={stop(onDetalle)}
          >
            <i className="ti ti-edit" /> Actualizar
          </button>
          <button
            className="sdp-btn sdp-btn-ghost sdp-btn-sm"
            onClick={stop(onEstatus)}
            disabled={!puedeAvanzar}
            title={!puedeAvanzar ? "Asigna un responsable primero" : ""}
          >
            <i className="ti ti-refresh" /> Estatus
          </button>
          <button
            className="sdp-btn sdp-btn-ghost sdp-btn-sm"
            onClick={stop(onActividad)}
            disabled={!puedeAvanzar}
          >
            <i className="ti ti-activity" /> Actividad
          </button>
          <button
            className="sdp-btn sdp-btn-ghost sdp-btn-sm"
            onClick={stop(onHoras)}
            disabled={!puedeAvanzar}
          >
            <i className="ti ti-clock-hour-4" /> Tiempo
          </button>
        </div>
      </div>
      <div className="resumen-block resumen-block--rapido">
        <p className="resumen-block-title">Resumen rápido</p>
        <div className="rapido-items">
          <div className="rapido-item">
            <i className="ti ti-activity" style={{ color: "#4f46e5" }} />
            <span>Actividades</span>
            <strong>{actividades.length}</strong>
          </div>
          <div className="rapido-item">
            <i className="ti ti-subtask" style={{ color: "#7c3aed" }} />
            <span>Subtareas</span>
            <strong>{subtareas.length}</strong>
          </div>
          <div className="rapido-item">
            <i className="ti ti-clock-hour-4" style={{ color: "#0891b2" }} />
            <span>Horas hoy</span>
            <strong>{fmtMinutos(horasResumen.minutosHoy)}</strong>
          </div>
          <div className="rapido-item">
            <i className="ti ti-message-circle" style={{ color: "#8b5cf6" }} />
            <span>Comentarios</span>
            <strong>{comentarios.length}</strong>
          </div>
          <div className="rapido-item">
            <i className="ti ti-paperclip" style={{ color: "#6b7280" }} />
            <span>Archivos</span>
            <strong
              style={{ color: adjuntos.length > 0 ? "#0891b2" : undefined }}
            >
              {adjuntos.length}
            </strong>
          </div>
          {impactos.length > 0 && (
            <div className="rapido-item">
              <i className="ti ti-alert-circle" style={{ color: "#f59e0b" }} />
              <span>Áreas impactadas</span>
              <strong style={{ color: "#f59e0b" }}>{impactos.length}</strong>
            </div>
          )}
          <div className="rapido-item">
            <i className="ti ti-calendar" style={{ color: "#6b7280" }} />
            <span>Días abierto</span>
            <strong>{sol.diasAbiertos ?? 0}</strong>
          </div>
        </div>
        <div className="rapido-estatus">
          {sol.estatusNombre && (
            <span
              className="sdp-estatus-pill"
              style={{
                background: sol.estatusBg || "#f3f4f6",
                color: sol.estatusColor || "#6b7280",
              }}
            >
              {sol.estatusNombre}
            </span>
          )}
          {sol.prioridadNombre && (
            <span className="sdp-prio">
              <span
                className="sdp-prio-dot"
                style={{ background: sol.prioridadColor || "#9ca3af" }}
              />
              {sol.prioridadNombre}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Tab Seguimiento ─────────────────────────────────────────── */
function TabSeguimiento({
  sol,
  bitacora,
  onDetalle,
  onConcluir,
  puedeConcluir,
}) {
  return (
    <div className="tab-seguimiento">
      <div className="seg-cols">
        <div className="seg-col-left">
          <div className="seg-card">
            <p className="seg-card-title">
              <i className="ti ti-clock" /> Tiempo de desarrollo
            </p>
            <BarraTiempo row={sol} />
            <div className="seg-tiempo-rows">
              <div className="seg-tiempo-row">
                <span>Inicio real</span>
                <span>{fmtDate(sol.fechaInicio)}</span>
              </div>
              <div className="seg-tiempo-row">
                <span>Compromiso</span>
                <span>{fmtDate(sol.fechaCompromiso)}</span>
              </div>
              <div className="seg-tiempo-row">
                <span>Conclusión</span>
                <span>{fmtDate(sol.fechaConclusión)}</span>
              </div>
              <div className="seg-tiempo-row">
                <span>Días abierto</span>
                <span>{sol.diasAbiertos ?? 0} días</span>
              </div>
            </div>
            <div className="seg-avance-section">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span className="seg-card-title" style={{ margin: 0 }}>
                  <i className="ti ti-chart-bar" /> Avance
                </span>
                <span style={{ fontWeight: 700, color: "#4f46e5" }}>
                  {sol.porcentajeAvance ?? 0}%
                </span>
              </div>
              <div className="avance-track avance-track--lg">
                <div
                  className="avance-fill"
                  style={{ width: `${sol.porcentajeAvance ?? 0}%` }}
                />
              </div>
            </div>
            <div className="seg-acciones">
              <button
                className="sdp-btn sdp-btn-ghost sdp-btn-sm"
                onClick={stop(onDetalle)}
              >
                <i className="ti ti-edit" /> Actualizar fecha y avance
              </button>
              {puedeConcluir && (
                <button
                  className="sdp-btn sdp-btn-primary sdp-btn-sm"
                  onClick={stop(onConcluir)}
                >
                  <i className="ti ti-circle-check" /> Concluir
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="seg-col-right">
          <p className="seg-timeline-title">Historial de cambios</p>
          {!bitacora.length ? (
            <div className="sdp-empty-inline">
              <i className="ti ti-git-commit" />
              <p>Sin eventos aún.</p>
            </div>
          ) : (
            <div className="seg-timeline">
              {[...bitacora].reverse().map((b, i) => (
                <div key={b.idBitacora || i} className="seg-event">
                  <div className="seg-event-dot" />
                  <div className="seg-event-body">
                    <div className="seg-event-meta">
                      <span className="seg-event-fecha">
                        {fmtDateTime(b.fecha)}
                      </span>
                      <span className="seg-event-autor">
                        {b.nombreUsuario || b.idUsuario}
                      </span>
                    </div>
                    <p className="seg-event-nota">{b.nota}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Tab Actividades ─────────────────────────────────────────── */
function TabActividades({ actividades, bitacora, onNueva, puedeAvanzar }) {
  const todos = [
    ...actividades.map((a) => ({ ...a, _tipo: "actividad" })),
    ...bitacora.map((b) => ({ ...b, _tipo: "bitacora" })),
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return (
    <div className="tab-actividades">
      <div className="act-header">
        <p className="act-titulo">Registro de trabajo</p>
        <button
          className="sdp-btn sdp-btn-primary sdp-btn-sm"
          onClick={stop(onNueva)}
          disabled={!puedeAvanzar}
          title={!puedeAvanzar ? "Asigna un responsable primero" : ""}
        >
          <i className="ti ti-plus" /> Registrar actividad
        </button>
      </div>
      {todos.length === 0 ? (
        <div className="sdp-empty-inline">
          <i className="ti ti-activity" />
          <p>Sin actividades registradas.</p>
        </div>
      ) : (
        <div className="act-timeline">
          {todos.map((item, i) => (
            <div
              key={i}
              className={`act-item${item._tipo === "bitacora" ? " act-item--bitacora" : ""}`}
            >
              <div className="act-dot">
                <i
                  className={`ti ${item._tipo === "actividad" ? "ti-tool" : "ti-git-commit"}`}
                />
              </div>
              <div className="act-body">
                <div className="act-meta">
                  <span className="act-autor">
                    {item.nombreUsuario || item.idUsuario}
                  </span>
                  <span className="act-fecha">{fmtDateTime(item.fecha)}</span>
                  {item._tipo === "bitacora" && (
                    <span className="act-sistema-badge">Sistema</span>
                  )}
                </div>
                <p className="act-texto">{item.actividad || item.nota}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tab Subtareas ───────────────────────────────────────────── */
function TabSubtareas({ subtareas, onNueva, onEditar, puedeAvanzar }) {
  return (
    <div className="tab-subtareas">
      <div className="act-header">
        <p className="act-titulo">Subtareas ({subtareas.length})</p>
        <button
          className="sdp-btn sdp-btn-primary sdp-btn-sm"
          onClick={stop(onNueva)}
          disabled={!puedeAvanzar}
        >
          <i className="ti ti-plus" /> Nueva subtarea
        </button>
      </div>
      {subtareas.length === 0 ? (
        <div className="sdp-empty-inline">
          <i className="ti ti-subtask" />
          <p>
            Sin subtareas. Divide el desarrollo en tareas más pequeñas para
            facilitar el seguimiento.
          </p>
        </div>
      ) : (
        <div className="sub-lista">
          {subtareas.map((sub) => (
            <div
              key={sub.idSubtarea}
              className="sub-item"
              onClick={stop(() => onEditar(sub))}
            >
              <div className="sub-item-left">
                <span
                  className="sub-estatus"
                  style={{
                    background: sub.estatusBg || "#f3f4f6",
                    color: sub.estatusColor || "#6b7280",
                  }}
                >
                  {sub.estatusNombre || "—"}
                </span>
                <div>
                  <p className="sub-titulo">{sub.titulo}</p>
                  {sub.descripcion && (
                    <p className="sub-desc">
                      {sub.descripcion.slice(0, 80)}
                      {sub.descripcion.length > 80 ? "…" : ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="sub-item-right">
                {sub.nombreResponsable && (
                  <div className="sdp-resp-cell">
                    <Avatar nombre={sub.nombreResponsable} size={22} />
                    <span style={{ fontSize: 12 }}>
                      {sub.nombreResponsable}
                    </span>
                  </div>
                )}
                {sub.prioridadNombre && (
                  <span className="sdp-prio" style={{ fontSize: 12 }}>
                    <span
                      className="sdp-prio-dot"
                      style={{ background: sub.prioridadColor || "#9ca3af" }}
                    />
                    {sub.prioridadNombre}
                  </span>
                )}
                {sub.fechaCompromiso && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-secondary,#9ca3af)",
                    }}
                  >
                    {fmtDate(sub.fechaCompromiso)}
                  </span>
                )}
                {sub.porcentajeAvance > 0 && (
                  <div className="avance-cell">
                    <div className="avance-track" style={{ width: 60 }}>
                      <div
                        className="avance-fill"
                        style={{ width: `${sub.porcentajeAvance}%` }}
                      />
                    </div>
                    <span className="avance-num">{sub.porcentajeAvance}%</span>
                  </div>
                )}
                <i
                  className="ti ti-chevron-right"
                  style={{
                    color: "var(--text-secondary,#9ca3af)",
                    fontSize: 14,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tab Horas ───────────────────────────────────────────────── */
function TabHoras({
  horas,
  horasResumen,
  onNueva,
  onEliminar,
  puedeAvanzar,
  userLogin,
}) {
  return (
    <div className="tab-horas">
      <div className="act-header">
        <p className="act-titulo">Tiempo trabajado</p>
        <button
          className="sdp-btn sdp-btn-primary sdp-btn-sm"
          onClick={stop(onNueva)}
          disabled={!puedeAvanzar}
        >
          <i className="ti ti-plus" /> Registrar tiempo
        </button>
      </div>
      <div className="horas-resumen">
        <div className="horas-stat">
          <span className="horas-stat-val">
            {fmtMinutos(horasResumen.totalMinutos)}
          </span>
          <span className="horas-stat-label">Total acumulado</span>
        </div>
        <div className="horas-stat">
          <span className="horas-stat-val">
            {fmtMinutos(horasResumen.minutosSemana)}
          </span>
          <span className="horas-stat-label">Esta semana</span>
        </div>
        <div className="horas-stat">
          <span className="horas-stat-val">
            {fmtMinutos(horasResumen.minutosHoy)}
          </span>
          <span className="horas-stat-label">Hoy</span>
        </div>
      </div>
      {horas.length === 0 ? (
        <div className="sdp-empty-inline">
          <i className="ti ti-clock-hour-4" />
          <p>
            Sin registros de tiempo. Registra el tiempo dedicado a este
            desarrollo.
          </p>
        </div>
      ) : (
        <div className="horas-lista">
          {horas.map((h) => (
            <div key={h.idRegistro} className="hora-item">
              <div className="hora-item-left">
                <span className="hora-fecha">{fmtDate(h.fechaTrabajo)}</span>
                <span className="hora-tiempo">
                  {fmtMinutos(h.minutosTrabajos)}
                </span>
              </div>
              <div className="hora-item-center">
                <span className="hora-autor">{h.nombreUsuario}</span>
                {h.descripcion && (
                  <span className="hora-desc">"{h.descripcion}"</span>
                )}
              </div>
              {h.loginUsuario === userLogin && (
                <button
                  className="sdp-icon-btn"
                  title="Eliminar (solo dentro de 24h)"
                  onClick={stop(() => onEliminar(h.idRegistro))}
                  style={{ color: "#9ca3af" }}
                >
                  <i className="ti ti-trash" style={{ fontSize: 14 }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tab Bloqueos ────────────────────────────────────────────── */
function TabBloqueos({ bloqueos, onNuevo, onResolver, puedeAvanzar }) {
  const activos = bloqueos.filter((b) => !b.fechaResolucion);
  const resueltos = bloqueos.filter((b) => b.fechaResolucion);
  return (
    <div className="tab-bloqueos">
      <div className="act-header">
        <p className="act-titulo">Bloqueos e impedimentos</p>
        <button
          className="sdp-btn sdp-btn-primary sdp-btn-sm"
          onClick={stop(onNuevo)}
          disabled={!puedeAvanzar}
        >
          <i className="ti ti-plus" /> Registrar bloqueo
        </button>
      </div>
      {bloqueos.length === 0 ? (
        <div className="sdp-empty-inline">
          <i className="ti ti-lock" />
          <p>Sin bloqueos registrados. ¡Buen trabajo!</p>
        </div>
      ) : (
        <>
          {activos.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ef4444",
                  margin: "0 0 8px",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                Activos ({activos.length})
              </p>
              {activos.map((b) => (
                <div
                  key={b.idBloqueo}
                  className="bloqueo-item bloqueo-item--activo"
                >
                  <div>
                    <i
                      className="ti ti-lock"
                      style={{ color: "#ef4444", fontSize: 16 }}
                    />
                  </div>
                  <div className="bloqueo-body">
                    <p className="bloqueo-motivo">{b.motivo}</p>
                    <div className="bloqueo-meta">
                      <span>{b.nombreRegistro}</span>
                      <span>{fmtDate(b.fechaBloqueo)}</span>
                    </div>
                  </div>
                  <button
                    className="sdp-btn sdp-btn-ghost sdp-btn-sm"
                    onClick={stop(() => onResolver(b.idBloqueo))}
                  >
                    <i className="ti ti-check" /> Resolver
                  </button>
                </div>
              ))}
            </>
          )}
          {resueltos.length > 0 && (
            <>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#10b981",
                  margin: "16px 0 8px",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                Resueltos ({resueltos.length})
              </p>
              {resueltos.map((b) => (
                <div
                  key={b.idBloqueo}
                  className="bloqueo-item bloqueo-item--resuelto"
                >
                  <div>
                    <i
                      className="ti ti-lock-open"
                      style={{ color: "#10b981", fontSize: 16 }}
                    />
                  </div>
                  <div className="bloqueo-body">
                    <p className="bloqueo-motivo">{b.motivo}</p>
                    <div className="bloqueo-meta">
                      <span>{b.nombreRegistro}</span>
                      <span>Resuelto: {fmtDate(b.fechaResolucion)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Tab Comentarios ─────────────────────────────────────────── */
function TabComentarios({ comentarios, comentario, setComentario, onPost }) {
  return (
    <div className="sdp-comments">
      {comentarios.length === 0 ? (
        <div className="sdp-empty-inline">
          <i className="ti ti-message-circle" />
          <p>Sin comentarios aún.</p>
        </div>
      ) : (
        comentarios.map((c, i) => (
          <div key={c.idComentario || i} className="sdp-comment-item">
            <div className="sdp-comment-header">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar nombre={c.nombreUsuario || c.idUsuario} size={26} />
                <span className="sdp-comment-author">
                  {c.nombreUsuario || c.idUsuario}
                </span>
              </div>
              <span className="sdp-comment-date">{fmtDateTime(c.fecha)}</span>
            </div>
            <p className="sdp-comment-text">{c.comentario}</p>
          </div>
        ))
      )}
      <div className="sdp-comment-form">
        <textarea
          placeholder="Escribe un comentario…"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          className="sdp-btn sdp-btn-primary sdp-btn-sm"
          style={{ alignSelf: "flex-end" }}
          onClick={stop(onPost)}
        >
          <i className="ti ti-send" /> Enviar
        </button>
      </div>
    </div>
  );
}

/* ── Tab Archivos ────────────────────────────────────────────── */
function TabArchivos({ adjuntos }) {
  if (!adjuntos.length)
    return (
      <div className="sdp-empty-inline">
        <i className="ti ti-paperclip" />
        <p>Sin archivos adjuntos.</p>
      </div>
    );
  return (
    <div className="sdp-files-grid">
      {adjuntos.map((f, i) => (
        <a
          key={f.idArchivo || i}
          href={`${STATIC_BASE}${f.rutaServidor}`}
          target="_blank"
          rel="noreferrer"
          className="sdp-file-item"
          onClick={(e) => e.stopPropagation()}
        >
          <i className={`ti ${fileIcon(f.nombreArchivo)}`} />
          <span className="sdp-file-name">{f.nombreArchivo}</span>
        </a>
      ))}
    </div>
  );
}

/* ── Tab Evaluación — solo para el solicitante original ─────── */
function TabEvaluacion({
  evaluacion,
  esConcluido,
  esSolicitante,
  idSolicitud,
}) {
  const token = localStorage.getItem("fabpsa_token");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const [form, setForm] = useState({
    satisfaccion: 0,
    cumplimiento: 0,
    tiempoEntrega: 0,
    calidad: 0,
    comentarios: "",
  });
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Resultado visible para todos
  if (evaluacion) {
    const prom = (
      (evaluacion.satisfaccion +
        evaluacion.cumplimiento +
        evaluacion.tiempoEntrega +
        evaluacion.calidad) /
      4
    ).toFixed(1);
    return (
      <div className="tab-eval">
        <div className="eval-header">
          <i
            className="ti ti-star-filled"
            style={{ color: "#f59e0b", fontSize: 22 }}
          />
          <span>Evaluación del solicitante</span>
          <span className="eval-fecha">
            {fmtDate(evaluacion.fechaEvaluacion)}
          </span>
        </div>
        <div className="eval-promedio">
          <span className="eval-promedio-num">{prom}</span>
          <StarRating value={Math.round(parseFloat(prom))} size={20} />
          <span className="eval-promedio-label">Promedio general</span>
        </div>
        <div className="eval-grid">
          {[
            ["Satisfacción general", evaluacion.satisfaccion],
            ["Cumplimiento solicitado", evaluacion.cumplimiento],
            ["Tiempo de entrega", evaluacion.tiempoEntrega],
            ["Calidad de la solución", evaluacion.calidad],
          ].map(([label, val]) => (
            <div key={label} className="eval-row">
              <span className="eval-dim">{label}</span>
              <StarRating value={val} size={16} />
              <span className="eval-val">{val}/5</span>
            </div>
          ))}
        </div>
        {evaluacion.comentarios && (
          <div className="eval-comentarios">
            <label>Comentarios</label>
            <p>"{evaluacion.comentarios}"</p>
          </div>
        )}
      </div>
    );
  }

  // Solo el solicitante puede ver el formulario
  if (!esConcluido)
    return (
      <div className="sdp-empty-inline">
        <i className="ti ti-star" />
        <p>
          La evaluación estará disponible cuando el desarrollo sea concluido.
        </p>
      </div>
    );

  if (!esSolicitante)
    return (
      <div className="sdp-empty-inline">
        <i className="ti ti-star" />
        <p>
          La evaluación corresponde exclusivamente al usuario solicitante.
          Estará disponible cuando la complete.
        </p>
      </div>
    );

  async function handleEnviar() {
    if (
      !form.satisfaccion ||
      !form.cumplimiento ||
      !form.tiempoEntrega ||
      !form.calidad
    ) {
      setError("Califica todas las dimensiones.");
      return;
    }
    setLoading(true);
    setError("");
    const r = await fetch(
      `/api/solicitudes-desarrollo/${idSolicitud}/evaluacion`,
      { method: "POST", headers, body: JSON.stringify(form) },
    ).then((r) => r.json());
    setLoading(false);
    if (r.ok) setEnviado(true);
    else setError(r.message || "Error al enviar");
  }

  if (enviado)
    return (
      <div className="sdp-empty-inline">
        <i className="ti ti-circle-check" style={{ color: "#10b981" }} />
        <p>
          Evaluación enviada correctamente. ¡Gracias por tu retroalimentación!
        </p>
      </div>
    );

  return (
    <div className="tab-eval">
      <p className="eval-intro">
        El desarrollo está concluido. Califica el desempeño del equipo de
        Sistemas.
      </p>
      {[
        ["satisfaccion", "Satisfacción general"],
        ["cumplimiento", "Cumplimiento de lo solicitado"],
        ["tiempoEntrega", "Tiempo de entrega"],
        ["calidad", "Calidad de la solución"],
      ].map(([key, label]) => (
        <div key={key} className="eval-form-row">
          <span className="eval-form-label">{label}</span>
          <StarRating
            value={form[key]}
            onChange={(v) => setForm((p) => ({ ...p, [key]: v }))}
          />
        </div>
      ))}
      <div className="sdp-modal-field" style={{ marginTop: 12 }}>
        <label
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary,#6b7280)",
          }}
        >
          Comentarios adicionales (opcional)
        </label>
        <textarea
          rows={3}
          placeholder="¿Qué te pareció el desarrollo?"
          value={form.comentarios}
          onChange={(e) =>
            setForm((p) => ({ ...p, comentarios: e.target.value }))
          }
        />
      </div>
      {error && (
        <p style={{ color: "#dc2626", fontSize: 12, margin: 0 }}>{error}</p>
      )}
      <div
        style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}
      >
        <button
          className="sdp-btn sdp-btn-primary"
          disabled={loading}
          onClick={handleEnviar}
        >
          {loading ? (
            <>
              <i className="ti ti-loader-2 sdp-spin" /> Enviando…
            </>
          ) : (
            <>
              <i className="ti ti-send" /> Enviar evaluación
            </>
          )}
        </button>
      </div>
    </div>
  );
}
