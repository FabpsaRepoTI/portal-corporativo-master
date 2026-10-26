import MantenimientoExecutive from "./MantenimientoExecutive";
// client/src/pages/mantenimiento/MantenimientoPage.jsx
import {
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { AuthContext } from "../../context/AuthContext";
import "./MantenimientoPage.css";

// ─────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────
const getToken = () => localStorage.getItem("fabpsa_token");
const claveLecturaMensajes = (login, idSolicitud) =>
  `mnt_mensajes_leidos:${login || "usuario"}:${idSolicitud}`;
const mensajesNoLeidos = (sol, login) => {
  const recibidos =
    sol?.mensajesRecibidos === undefined || sol?.mensajesRecibidos === null
      ? Number(sol?.totalMensajes || 0)
      : Number(sol.mensajesRecibidos || 0);
  const leidos = Number(
    localStorage.getItem(claveLecturaMensajes(login, sol?.idSolicitud)) || 0,
  );
  return Math.max(0, recibidos - leidos);
};
const marcarMensajesLeidos = (sol, login, esMto) => {
  const recibidosDetalle = sol?.mensajes?.filter((mensaje) =>
    esMto
      ? mensaje.areaAutor !== "MANTENIMIENTO"
      : mensaje.loginAutor !== login,
  ).length;
  const recibidos = Number.isFinite(recibidosDetalle)
    ? recibidosDetalle
    : Number(sol?.mensajesRecibidos || 0);
  localStorage.setItem(
    claveLecturaMensajes(login, sol?.idSolicitud),
    String(recibidos),
  );
  window.dispatchEvent(new CustomEvent("mnt-mensajes-leidos"));
};

function useSincronizarMensajesLeidos() {
  const [, renderizar] = useState(0);
  useEffect(() => {
    const actualizar = () => renderizar((valor) => valor + 1);
    window.addEventListener("mnt-mensajes-leidos", actualizar);
    return () => window.removeEventListener("mnt-mensajes-leidos", actualizar);
  }, []);
}
const STATIC =
  window.location.hostname === "localhost" ? "http://localhost:3001" : "";

const apiFetch = async (path, opts = {}) => {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...opts.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) data.__error = true;
  return data;
};

const ESTATUS = {
  0: { label: "Sin atención", color: "#94a3b8", bg: "rgba(148,163,184,.12)" },
  1: { label: "En proceso", color: "#4cc9a6", bg: "rgba(76,201,166,.12)" },
  2: { label: "Pdte. material", color: "#f97316", bg: "rgba(249,115,22,.12)" },
  3: {
    label: "Pdte. visto bueno",
    color: "#06b6d4",
    bg: "rgba(6,182,212,.12)",
  },
  4: { label: "Rechazada", color: "#ef4444", bg: "rgba(239,68,68,.12)" },
  5: { label: "Reabierta", color: "#a855f7", bg: "rgba(168,85,247,.12)" },
  6: { label: "Cerrada", color: "#2baf8b", bg: "rgba(43,175,139,.12)" },
};

const estatusVisual = (sol) =>
  sol?.idEstatus === 3 && (sol?.evaluacionVB === 1 || sol?.pendienteVB === 0)
    ? 6
    : sol?.idEstatus;

const PRIORIDAD = {
  "001": { label: "Alta", color: "#ef4444", horas: 24 },
  "002": { label: "Media", color: "#f97316", horas: 48 },
};

function fmtFecha(f, short = false) {
  if (!f) return "—";
  const fecha = f instanceof Date ? f : new Date(f);
  if (Number.isNaN(fecha.getTime())) return "—";
  return fecha.toLocaleString(
    "es-MX",
    short
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
  );
}

function fmtMin(min) {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
}

function EvaluacionVisual({ texto }) {
  const valor = String(texto || "");
  const atencion = Number(valor.match(/Atención:\s*(\d)\/5/i)?.[1] || 0);
  const servicio = Number(valor.match(/Servicio:\s*(\d)\/5/i)?.[1] || 0);
  const comentario = valor
    .replace(/Atención:\s*\d\/5\s*·?\s*/i, "")
    .replace(/Servicio:\s*\d\/5\s*·?\s*/i, "")
    .trim();
  if (!atencion && !servicio) return <p>{valor}</p>;
  return (
    <div className="mnt-rating-summary">
      {[
        ["Atención", atencion],
        ["Servicio", servicio],
      ].map(([nombre, puntos]) => (
        <div key={nombre}>
          <span>{nombre}</span>
          <span className="mnt-rating-summary__stars">
            {[1, 2, 3, 4, 5].map((numero) => (
              <i
                key={numero}
                className={`ti ${numero <= puntos ? "ti-star-filled" : "ti-star"}`}
              />
            ))}
          </span>
          <strong>{puntos}</strong>
        </div>
      ))}
      {comentario && <p>{comentario}</p>}
    </div>
  );
}

function diffMin(a, b) {
  if (!a || !b) return null;
  const inicio = new Date(a);
  const fin = new Date(b);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()))
    return null;
  return Math.round((fin - inicio) / 60000);
}

function fmtSoloFecha(valor) {
  if (!valor) return "—";
  const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "—";
  const fecha = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return fecha.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtSoloHora(valor) {
  if (!valor) return "—";
  const match = String(valor).match(/(?:T|\s|^)(\d{1,2}):(\d{2})/);
  if (!match) return "—";
  const horas = Number(match[1]);
  const minutos = match[2];
  const periodo = horas >= 12 ? "p.m." : "a.m.";
  return `${horas % 12 || 12}:${minutos} ${periodo}`;
}

function combinarFechaHora(fecha, hora) {
  if (!fecha || !hora) return null;
  const base = new Date(fecha);
  if (Number.isNaN(base.getTime())) return null;
  let horas;
  let minutos;
  let segundos;
  if (hora instanceof Date && !Number.isNaN(hora.getTime())) {
    horas = hora.getUTCHours();
    minutos = hora.getUTCMinutes();
    segundos = hora.getUTCSeconds();
  } else {
    const partes = String(hora).match(
      /(?:T|\s|^)(\d{1,2}):(\d{2})(?::(\d{2}))?/,
    );
    if (!partes) return null;
    horas = Number(partes[1]);
    minutos = Number(partes[2]);
    segundos = Number(partes[3] || 0);
  }
  base.setHours(horas, minutos, segundos, 0);
  return Number.isNaN(base.getTime()) ? null : base;
}

function semaforo(sol) {
  if (sol.idEstatus === 0) return "rojo";
  const creada = new Date(sol.fechaCreacion);
  if (Number.isNaN(creada.getTime())) return "verde";
  const h = Math.floor((Date.now() - creada) / 3_600_000);
  const lim = PRIORIDAD[sol.prioridad]?.horas ?? 48;
  if (h >= lim) return "rojo";
  if (h >= lim * 0.75) return "amarillo";
  return "verde";
}

function Chip({ idEstatus }) {
  const e = ESTATUS[idEstatus] ?? {
    label: "—",
    color: "#888",
    bg: "rgba(136,136,136,.1)",
  };
  return (
    <span className="mnt-chip" style={{ background: e.bg, color: e.color }}>
      {e.label}
    </span>
  );
}
function PrioChip({ prioridad }) {
  const p = PRIORIDAD[prioridad] ?? { label: "—", color: "#888" };
  return (
    <span className="mnt-prio" style={{ color: p.color }}>
      ● {p.label}
    </span>
  );
}
function Semaforo({ sol }) {
  const s = semaforo(sol);
  return <span className={`mnt-semaforo mnt-semaforo--${s}`} />;
}

// ─────────────────────────────────────────────────────────────
// SPLASH
// ─────────────────────────────────────────────────────────────
function Splash() {
  const [progreso, setProgreso] = useState(8);

  useEffect(() => {
    const inicio = performance.now();
    const intervalo = window.setInterval(() => {
      setProgreso(
        Math.min(
          99,
          Math.round(3 + ((performance.now() - inicio) / 5000) * 97),
        ),
      );
    }, 45);
    return () => window.clearInterval(intervalo);
  }, []);

  const mensaje =
    progreso < 25
      ? "Conectando con Mantenimiento..."
      : progreso < 58
        ? "Cargando tus solicitudes..."
        : progreso < 88
          ? "Preparando tu espacio de trabajo..."
          : "Organizando los últimos detalles...";

  return (
    <div className="mnt-splash">
      <div className="mnt-splash__ambient mnt-splash__ambient--mint" />
      <div className="mnt-splash__ambient mnt-splash__ambient--violet" />
      <div className="mnt-splash__center">
        <div className="mnt-splash__icon">
          <i className="ti ti-tool" />
        </div>
        <h1>Mantenimiento</h1>
        <p className="mnt-splash__title">Estamos preparando tus solicitudes</p>
        <div className="mnt-splash__progress-row">
          <div className="mnt-splash__bar">
            <div
              className="mnt-splash__fill"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
        <p className="mnt-splash__sub">{mensaje}</p>
      </div>
      <div className="mnt-splash__brand">
        <p>Portal Corporativo FABPSA</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SELECTOR MÚLTIPLE DE PERSONAL
// ─────────────────────────────────────────────────────────────
function SelectorPersonal({ lista, seleccionados, onChange, placeholder }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef();
  const sinOpciones = !lista.length;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (id) => {
    if (seleccionados.includes(id))
      onChange(seleccionados.filter((x) => x !== id));
    else onChange([...seleccionados, id]);
  };

  const nombresSeleccionados = lista
    .filter((p) => seleccionados.includes(p.idPersonal))
    .map((p) => p.nombre);
  const resumenSeleccion = nombresSeleccionados.length
    ? nombresSeleccionados.length === 1
      ? nombresSeleccionados[0]
      : `${nombresSeleccionados[0]} y ${nombresSeleccionados.length - 1} más`
    : placeholder;

  return (
    <div className="mnt-selector-multi" ref={ref}>
      <button
        type="button"
        className="mnt-selector-multi__trigger"
        onClick={() => !sinOpciones && setAbierto((o) => !o)}
        disabled={sinOpciones}
      >
        <span title={nombresSeleccionados.join(", ")}>
          {sinOpciones ? "Sin personal disponible" : resumenSeleccion}
        </span>
        <i className="ti ti-chevron-down" />
      </button>
      {abierto && !sinOpciones && (
        <div className="mnt-selector-multi__dropdown">
          {lista.map((p) => (
            <label key={p.idPersonal} className="mnt-selector-multi__item">
              <input
                type="checkbox"
                checked={seleccionados.includes(p.idPersonal)}
                onChange={() => toggle(p.idPersonal)}
              />
              <span>{p.nombre}</span>
              {p.numero && <small>({p.numero})</small>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL CAMBIO DE ESTADO
// ─────────────────────────────────────────────────────────────
function ModalCambioEstatus({ sol, onConfirm, onClose, estatusInicial = "" }) {
  const [personalMto, setPersonalMto] = useState([]);
  const [personalConst, setPersonalConst] = useState([]);
  const [listaMto, setListaMto] = useState([]);
  const [listaConst, setListaConst] = useState([]);
  const [estatusNuevo, setEstatusNuevo] = useState(estatusInicial);
  const [tipoTrabajo, setTipoTrabajo] = useState("");
  const [diagnostico, setDiagnostico] = useState(sol.textoDiagnostico || "");
  const [compromiso, setCompromiso] = useState(
    sol.fechaCompromiso ? sol.fechaCompromiso.slice(0, 10) : "",
  );
  const [material, setMaterial] = useState(sol.materialRequerido || "");
  const [motivo, setMotivo] = useState("");
  const [tipoActividad, setTipoActividad] = useState("");
  const [tipoMant, setTipoMant] = useState("");
  const [origen, setOrigen] = useState("");
  const [actividades, setActividades] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [fechaTermino, setFechaTermino] = useState("");
  const [horaTermino, setHoraTermino] = useState("");
  const [archivos, setArchivos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    apiFetch("/api/mantenimiento/catalogos/personal?tipo=mantenimiento").then(
      (d) => !d.__error && setListaMto(d),
    );
    apiFetch("/api/mantenimiento/catalogos/personal?tipo=externo").then(
      (d) => !d.__error && setListaConst(d),
    );
    // precargar participantes existentes
    if (sol.participantes?.length) {
      setPersonalMto(
        sol.participantes
          .filter((p) => p.tipoParticipacion === 1)
          .map((p) => p.idPersonal),
      );
      setPersonalConst(
        sol.participantes
          .filter((p) => p.tipoParticipacion === 2)
          .map((p) => p.idPersonal),
      );
    }
  }, []);

  const TRANS = {
    0: [
      { v: "1", label: "En proceso" },
      { v: "4", label: "Rechazada" },
    ],
    1: [
      { v: "2", label: "Pendiente material" },
      { v: "3", label: "Concluida pdte. VB" },
      { v: "4", label: "Rechazada" },
    ],
    2: [
      { v: "1", label: "En proceso" },
      { v: "4", label: "Rechazada" },
    ],
    3: [],
    4: [],
    5: [{ v: "1", label: "En proceso" }],
  };
  const opciones = TRANS[sol.idEstatus] ?? [];

  const esRechazo = estatusNuevo === "4";
  const esProceso = estatusNuevo === "1";
  const esMaterial = estatusNuevo === "2";
  const esCierre = estatusNuevo === "3";

  async function confirmar() {
    setError("");
    if (!estatusNuevo) {
      setError("Selecciona el nuevo estado");
      return;
    }
    if (esRechazo && !motivo.trim()) {
      setError("El motivo es obligatorio");
      return;
    }
    if (esProceso && !tipoTrabajo) {
      setError("Selecciona el tipo de trabajo");
      return;
    }
    if ((esProceso || esMaterial) && !compromiso) {
      setError("La fecha compromiso es obligatoria");
      return;
    }
    if (esMaterial && !material.trim()) {
      setError("Describe el material pendiente");
      return;
    }
    if (esCierre) {
      if (!personalMto.length) {
        setError("Selecciona al menos un técnico de Mantenimiento");
        return;
      }
      if (!tipoActividad || !tipoMant || !origen) {
        setError("Completa tipo de actividad, mantenimiento y origen");
        return;
      }
      if (!actividades.trim()) {
        setError("Las actividades realizadas son obligatorias");
        return;
      }
      if (!fechaInicio || !horaInicio || !fechaTermino || !horaTermino) {
        setError("Completa fechas y horas");
        return;
      }
    }

    setEnviando(true);
    const body = {
      estatusNuevo: Number(estatusNuevo),
      motivo: esRechazo ? motivo : undefined,
      tipoTrabajo: esProceso || esMaterial ? Number(tipoTrabajo) : undefined,
      textoDiagnostico: diagnostico || undefined,
      fechaCompromiso: esProceso || esMaterial ? compromiso : undefined,
      materialRequerido: esMaterial ? material : undefined,
      ...(esCierre
        ? {
            tipoActividad: Number(tipoActividad),
            tipoMantenimiento: Number(tipoMant),
            origenEvento: Number(origen),
            actividadesRealizadas: actividades,
            observacionesCierre: observaciones || undefined,
            fechaInicio,
            horaInicio,
            fechaTermino,
            horaTermino,
            personalMto,
            personalConstruccion: personalConst,
          }
        : {}),
    };

    await onConfirm(sol.idSolicitud, body, archivos);
    setEnviando(false);
  }

  return createPortal(
    <div
      className="mnt-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`mnt-modal ${esCierre ? "mnt-modal--cierre" : ""}`}>
        <div className="mnt-modal__head">
          <div>
            <strong>Cambiar estado</strong>
            <span className="mnt-modal__folio">{sol.folio}</span>
          </div>
          <button onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>

        <div className="mnt-modal__body">
          <div className="mnt-field">
            <label>
              Nuevo estado <span>*</span>
            </label>
            <select
              value={estatusNuevo}
              onChange={(e) => {
                setEstatusNuevo(e.target.value);
                setError("");
              }}
            >
              <option value="">Selecciona…</option>
              {opciones.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Rechazo */}
          {esRechazo && (
            <div className="mnt-field">
              <label>
                Motivo del rechazo <span>*</span>
              </label>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Describe el motivo del rechazo…"
              />
            </div>
          )}

          {/* En proceso o Pendiente material */}
          {(esProceso || esMaterial) && (
            <>
              <div className="mnt-field">
                <label>
                  Tipo de trabajo <span>*</span>
                </label>
                <select
                  value={tipoTrabajo}
                  onChange={(e) => setTipoTrabajo(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  <option value="1">Nuevo / Fabricación</option>
                  <option value="2">Existente / Mantenimiento</option>
                </select>
              </div>
              <div className="mnt-field">
                <label>Diagnóstico</label>
                <textarea
                  rows={2}
                  value={diagnostico}
                  onChange={(e) => setDiagnostico(e.target.value)}
                  placeholder="Describe lo que encontraste…"
                />
              </div>
              <div className="mnt-field">
                <label>
                  Fecha compromiso <span>*</span>
                </label>
                <input
                  type="date"
                  value={compromiso}
                  onChange={(e) => setCompromiso(e.target.value)}
                />
              </div>
              <div className="mnt-field">
                <label>Personal de Mantenimiento</label>
                <SelectorPersonal
                  lista={listaMto}
                  seleccionados={personalMto}
                  onChange={setPersonalMto}
                  placeholder="Selecciona técnicos…"
                />
              </div>
              <div className="mnt-field">
                <label>
                  Personal de Construcción <small>(opcional)</small>
                </label>
                <SelectorPersonal
                  lista={listaConst}
                  seleccionados={personalConst}
                  onChange={setPersonalConst}
                  placeholder="Selecciona si aplica…"
                />
              </div>
            </>
          )}

          {/* Material pendiente extra */}
          {esMaterial && (
            <div className="mnt-field">
              <label>
                Material requerido <span>*</span>
              </label>
              <textarea
                rows={2}
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="Describe el material o refacción necesaria…"
              />
            </div>
          )}

          {/* Cierre */}
          {esCierre && (
            <>
              <div className="mnt-modal__sep">Datos del cierre</div>
              <div className="mnt-two-cols mnt-final-participants">
                <div className="mnt-field mnt-field--final-personal">
                  <label>
                    Personal de Mantenimiento <span>*</span>
                  </label>
                  <SelectorPersonal
                    lista={listaMto}
                    seleccionados={personalMto}
                    onChange={setPersonalMto}
                    placeholder="Selecciona uno o varios técnicos…"
                  />
                </div>
                <div className="mnt-field mnt-field--final-personal">
                  <label>
                    Personal externo <small>(opcional)</small>
                  </label>
                  <SelectorPersonal
                    lista={listaConst}
                    seleccionados={personalConst}
                    onChange={setPersonalConst}
                    placeholder="Selecciona si participó…"
                  />
                </div>
              </div>
              {sol.fechaCompromiso && (
                <div className="mnt-info-readonly">
                  <i className="ti ti-calendar-check" />
                  <span>
                    Fecha compromiso:{" "}
                    <strong>{sol.fechaCompromiso?.slice?.(0, 10)}</strong>
                  </span>
                </div>
              )}
              <div className="mnt-two-cols">
                <div className="mnt-field">
                  <label>
                    Tipo de actividad <span>*</span>
                  </label>
                  <select
                    value={tipoActividad}
                    onChange={(e) => setTipoActividad(e.target.value)}
                  >
                    <option value="">Selecciona…</option>
                    <option value="1">Equipo</option>
                    <option value="2">Máquina</option>
                    <option value="3">Infraestructura</option>
                    <option value="4">Mantenimiento</option>
                  </select>
                </div>
                <div className="mnt-field">
                  <label>
                    Tipo de mantenimiento <span>*</span>
                  </label>
                  <select
                    value={tipoMant}
                    onChange={(e) => setTipoMant(e.target.value)}
                  >
                    <option value="">Selecciona…</option>
                    <option value="1">Preventivo</option>
                    <option value="2">Correctivo</option>
                  </select>
                </div>
              </div>
              <div className="mnt-field">
                <label>
                  Origen del evento <span>*</span>
                </label>
                <select
                  value={origen}
                  onChange={(e) => setOrigen(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  <option value="1">Interno</option>
                  <option value="2">Externo</option>
                </select>
              </div>
              <div className="mnt-two-cols">
                <div className="mnt-field">
                  <label>
                    Fecha inicio <span>*</span>
                  </label>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>
                <div className="mnt-field">
                  <label>
                    Hora inicio <span>*</span>
                  </label>
                  <input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                  />
                </div>
              </div>
              <div className="mnt-two-cols">
                <div className="mnt-field">
                  <label>
                    Fecha término <span>*</span>
                  </label>
                  <input
                    type="date"
                    value={fechaTermino}
                    onChange={(e) => setFechaTermino(e.target.value)}
                  />
                </div>
                <div className="mnt-field">
                  <label>
                    Hora término <span>*</span>
                  </label>
                  <input
                    type="time"
                    value={horaTermino}
                    onChange={(e) => setHoraTermino(e.target.value)}
                  />
                </div>
              </div>
              <div className="mnt-field">
                <label>
                  Actividades realizadas <span>*</span>
                </label>
                <textarea
                  rows={3}
                  value={actividades}
                  onChange={(e) => setActividades(e.target.value)}
                  placeholder="Describe detalladamente las actividades…"
                />
              </div>
              <div className="mnt-field">
                <label>Observaciones</label>
                <textarea
                  rows={2}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Observaciones adicionales…"
                />
              </div>
              <div className="mnt-field">
                <label>Evidencias del trabajo</label>
                <button
                  className="mnt-btn-upload"
                  type="button"
                  onClick={() => fileRef.current?.click()}
                >
                  <i className="ti ti-upload" /> Adjuntar archivos
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  multiple
                  accept="image/*,application/pdf"
                  onChange={(e) => setArchivos(Array.from(e.target.files))}
                />
                {archivos.length > 0 && (
                  <ul className="mnt-file-list">
                    {archivos.map((f, i) => (
                      <li key={i}>
                        <i className="ti ti-file" /> {f.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="mnt-error-banner">
              <i className="ti ti-alert-circle" /> {error}
            </div>
          )}
        </div>

        <div className="mnt-modal__foot">
          <button className="mnt-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="mnt-btn-primary"
            disabled={!estatusNuevo || enviando}
            onClick={confirmar}
          >
            {enviando ? (
              <>
                <i className="ti ti-loader-2 mnt-spin" /> Guardando…
              </>
            ) : (
              <>
                <i className="ti ti-check" /> Confirmar
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL VISTO BUENO
// ─────────────────────────────────────────────────────────────
function ModalVistoBueno({ sol, onConfirm, onClose }) {
  const [calificacionAtencion, setCalificacionAtencion] = useState(0);
  const [calificacionServicio, setCalificacionServicio] = useState(0);
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    if (!calificacionAtencion || !calificacionServicio) {
      setError("Califica la atención y el resultado del servicio");
      return;
    }
    const evaluacion =
      calificacionAtencion <= 2 || calificacionServicio <= 2 ? 2 : 1;
    if (evaluacion === 2 && !observacion.trim()) {
      setError("Cuéntanos qué debemos corregir");
      return;
    }
    setEnviando(true);
    const detalle = `Atención: ${calificacionAtencion}/5 · Servicio: ${calificacionServicio}/5${observacion.trim() ? ` · ${observacion.trim()}` : ""}`;
    await onConfirm(
      sol.idSolicitud,
      evaluacion,
      detalle,
      calificacionAtencion,
      calificacionServicio,
    );
    setEnviando(false);
  }

  return createPortal(
    <div
      className="mnt-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mnt-modal mnt-modal--sm">
        <div className="mnt-modal__head">
          <div>
            <strong>Visto bueno</strong>
            <span className="mnt-modal__folio">{sol.folio}</span>
          </div>
          <button onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="mnt-modal__body">
          <p className="mnt-modal__desc">
            Mantenimiento concluyó el trabajo. Tu evaluación nos ayuda a
            mejorar.
          </p>
          {[
            [
              "Atención recibida",
              calificacionAtencion,
              setCalificacionAtencion,
            ],
            [
              "Resultado del servicio",
              calificacionServicio,
              setCalificacionServicio,
            ],
          ].map(([titulo, valor, cambiar]) => (
            <div className="mnt-rating" key={titulo}>
              <span>{titulo}</span>
              <div>
                {[1, 2, 3, 4, 5].map((numero) => (
                  <button
                    type="button"
                    key={numero}
                    className={numero <= valor ? "active" : ""}
                    onClick={() => {
                      cambiar(numero);
                      setError("");
                    }}
                    aria-label={`${numero} de 5`}
                  >
                    <i
                      className={`ti ${numero <= valor ? "ti-star-filled" : "ti-star"}`}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {calificacionAtencion > 0 && calificacionServicio > 0 && (
            <div className="mnt-field" style={{ marginTop: 10 }}>
              <label>
                Comentario{" "}
                {(calificacionAtencion <= 2 || calificacionServicio <= 2) && (
                  <span>*</span>
                )}
              </label>
              <textarea
                rows={3}
                value={observacion}
                onChange={(e) => {
                  setObservacion(e.target.value);
                  setError("");
                }}
                placeholder="Cuéntanos cómo fue la atención y el resultado…"
              />
              {error && <small className="mnt-error">{error}</small>}
            </div>
          )}
        </div>
        <div className="mnt-modal__foot">
          <button className="mnt-btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="mnt-btn-primary"
            disabled={
              !calificacionAtencion || !calificacionServicio || enviando
            }
            onClick={confirmar}
          >
            {enviando ? (
              <>
                <i className="ti ti-loader-2 mnt-spin" />
                Enviando…
              </>
            ) : (
              <>
                <i
                  className={`ti ${calificacionAtencion <= 2 || calificacionServicio <= 2 ? "ti-send" : "ti-circle-check"}`}
                />
                {calificacionAtencion <= 2 || calificacionServicio <= 2
                  ? "Enviar evaluación"
                  : "Dar visto bueno y cerrar"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────
// TAB MENSAJES
// ─────────────────────────────────────────────────────────────
function TabMensajes({ idSolicitud, loginActual, esMto }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const bottomRef = useRef();

  const cargar = useCallback(async () => {
    const data = await apiFetch(
      `/api/mantenimiento/solicitudes/${idSolicitud}/mensajes`,
    );
    if (!data.__error) setMensajes(data);
  }, [idSolicitud]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Polling cada 8s
  useEffect(() => {
    const iv = setInterval(cargar, 8000);
    return () => clearInterval(iv);
  }, [cargar]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    await apiFetch(`/api/mantenimiento/solicitudes/${idSolicitud}/mensajes`, {
      method: "POST",
      body: JSON.stringify({ mensaje: texto.trim() }),
    });
    setTexto("");
    setEnviando(false);
    cargar();
  }

  return (
    <div className="mnt-chat">
      <div className="mnt-chat__list">
        {!mensajes.length && (
          <div className="mnt-empty">
            Sin mensajes aún. Inicia la conversación.
          </div>
        )}
        {mensajes.map((m) => {
          const esMio = m.loginAutor === loginActual;
          const esTecnico = m.areaAutor === "MANTENIMIENTO";
          return (
            <div
              key={m.idMensaje}
              className={`mnt-chat__msg ${esMio ? "mnt-chat__msg--mio" : "mnt-chat__msg--otro"}`}
            >
              <div className="mnt-chat__av">
                {m.nombreAutor?.substring(0, 2).toUpperCase()}
              </div>
              <div className="mnt-chat__bubble">
                <div className="mnt-chat__meta">
                  <strong>{m.nombreAutor}</strong>
                  <span
                    className={`mnt-chat__rol ${esTecnico ? "mnt-chat__rol--mto" : ""}`}
                  >
                    {esTecnico ? "Mantenimiento" : "Solicitante"}
                  </span>
                  <span className="mnt-chat__fecha">
                    {fmtFecha(m.fechaEnvio, true)}
                  </span>
                </div>
                <div className="mnt-chat__texto">{m.mensaje}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="mnt-chat__input">
        <textarea
          placeholder="Escribe un mensaje…"
          value={texto}
          rows={2}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
        />
        <button
          className="mnt-chat__send"
          disabled={!texto.trim() || enviando}
          onClick={enviar}
        >
          {enviando ? (
            <i className="ti ti-loader-2 mnt-spin" />
          ) : (
            <i className="ti ti-send" />
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BLOQUE TIEMPOS DE ATENCIÓN
// ─────────────────────────────────────────────────────────────
function BloqueTimempos({ sol }) {
  const tRespuesta = diffMin(sol.fechaCreacion, sol.fechaInicioProceso);
  const tEjecucion = sol.tiempoEjecucionMin;

  const tInicio = combinarFechaHora(sol.fechaInicio, sol.horaInicio);
  const tTermino = combinarFechaHora(sol.fechaTermino, sol.horaTermino);

  const tTotal = diffMin(sol.fechaCreacion, sol.fechaRegistroCierre);

  let cumplioCompromiso = null;
  if (sol.fechaCompromiso && sol.fechaRegistroCierre) {
    const cierre = new Date(sol.fechaRegistroCierre);
    const compromiso = new Date(sol.fechaCompromiso);
    if (
      !Number.isNaN(cierre.getTime()) &&
      !Number.isNaN(compromiso.getTime())
    ) {
      cumplioCompromiso = cierre <= compromiso;
    }
  }

  const filas = [
    ["Registro de solicitud", fmtFecha(sol.fechaCreacion)],
    [
      "Primera atención",
      sol.fechaInicioProceso ? fmtFecha(sol.fechaInicioProceso) : "—",
    ],
    ["Tiempo de respuesta", tRespuesta !== null ? fmtMin(tRespuesta) : "—"],
    ["Inicio del trabajo", tInicio ? fmtFecha(tInicio.toISOString()) : "—"],
    ["Término del trabajo", tTermino ? fmtFecha(tTermino.toISOString()) : "—"],
    ["Tiempo de ejecución", tEjecucion !== null ? fmtMin(tEjecucion) : "—"],
    ["Tiempo total", tTotal !== null ? fmtMin(tTotal) : "—"],
    [
      "Fecha compromiso",
      sol.fechaCompromiso ? sol.fechaCompromiso.slice?.(0, 10) : "—",
    ],
  ];

  return (
    <div className="mnt-tiempos">
      <div className="mnt-det-title">Tiempos de atención</div>
      <div className="mnt-tiempos__grid">
        {filas.map(([l, v]) => (
          <div key={l} className="mnt-tiempos__row">
            <span>{l}</span>
            <strong>{v}</strong>
          </div>
        ))}
        {cumplioCompromiso !== null && (
          <div
            className={`mnt-tiempos__compromiso ${cumplioCompromiso ? "ok" : "no"}`}
          >
            <i
              className={`ti ${cumplioCompromiso ? "ti-circle-check" : "ti-circle-x"}`}
            />
            {cumplioCompromiso
              ? "Fecha compromiso cumplida"
              : "Fecha compromiso no cumplida"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PANEL DETALLE
// ─────────────────────────────────────────────────────────────
function PanelDetalle({ sol, esMto, onAccion, loginActual }) {
  const [tab, setTab] = useState(0);
  const [imagenPreview, setImagenPreview] = useState(null);
  const descargaEnCurso = useRef(new Set());

  const descargarEvidencia = async (archivo, url) => {
    const clave = archivo.idArchivo ?? url;
    if (descargaEnCurso.current.has(clave)) return;
    descargaEnCurso.current.add(clave);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("No fue posible descargar el archivo");
      const blobUrl = URL.createObjectURL(await response.blob());
      const enlace = document.createElement("a");
      enlace.href = blobUrl;
      enlace.download = archivo.nombreOriginal || "evidencia";
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("[MNT] No se pudo descargar la evidencia:", error);
    } finally {
      window.setTimeout(() => descargaEnCurso.current.delete(clave), 1500);
    }
  };

  const tabs = [
    { label: "Detalles" },
    { label: "Historial", badge: sol.historial?.length },
    { label: "Evidencias", badge: sol.archivos?.length || null },
    { label: "Mensajes", badge: sol.mensajes?.length || null },
    ...(sol.tiempoEjecucionMin != null ? [{ label: "Ejecución" }] : []),
  ];

  return (
    <div className="mnt-panel">
      <div className="mnt-panel__tabs">
        {tabs.map((t, i) => (
          <button
            key={i}
            className={`mnt-panel__tab ${tab === i ? "active" : ""}`}
            onClick={() => {
              setTab(i);
              if (i === 3) marcarMensajesLeidos(sol, loginActual, esMto);
            }}
          >
            {t.label}
            {t.badge ? <span className="mnt-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div className="mnt-panel__content">
        {/* DETALLES */}
        {tab === 0 && (
          <div className="mnt-det-grid">
            <div className="mnt-det-card">
              <div className="mnt-det-title">Solicitud</div>
              {[
                ["Folio", sol.folio],
                ["Servicio", sol.servicio],
                [
                  "Prioridad",
                  PRIORIDAD[sol.prioridadSnapshot]?.label ??
                    sol.prioridadSnapshot,
                ],
                ["Sitio", sol.sitio === "IAFSA" ? "CEDIS" : sol.sitio],
                ["Área", sol.nombreArea || sol.area],
                ["Ubicación", sol.ubicacionDetalle],
                ["Solicitante", sol.nombreSolicitante],
                ["Correo", sol.emailSolicitante],
                ["Creado", fmtFecha(sol.fechaCreacion)],
                ...(sol.fechaCompromiso
                  ? [["Compromiso", sol.fechaCompromiso.slice?.(0, 10)]]
                  : []),
              ].map(([l, v]) => (
                <div key={l} className="mnt-det-row">
                  <span>{l}</span>
                  <strong>{v ?? "—"}</strong>
                </div>
              ))}
              {sol.participantes?.length > 0 && (
                <>
                  <div className="mnt-det-title" style={{ marginTop: 10 }}>
                    Personal que participó
                  </div>
                  {sol.participantes
                    .filter((p) => p.tipoParticipacion === 1)
                    .map((p) => (
                      <div key={p.idParticipante} className="mnt-det-row">
                        <span>Mantenimiento</span>
                        <strong>
                          {p.nombre} {p.numero ? `(${p.numero})` : ""}
                        </strong>
                      </div>
                    ))}
                  {sol.participantes
                    .filter((p) => p.tipoParticipacion === 2)
                    .map((p) => (
                      <div key={p.idParticipante} className="mnt-det-row">
                        <span>Personal externo</span>
                        <strong>
                          {p.nombre} {p.numero ? `(${p.numero})` : ""}
                        </strong>
                      </div>
                    ))}
                </>
              )}
            </div>
            <div className="mnt-det-card">
              <div className="mnt-det-title">Descripción</div>
              <p className="mnt-det-desc">{sol.descripcion}</p>
              {sol.textoDiagnostico && (
                <>
                  <div className="mnt-det-title" style={{ marginTop: 12 }}>
                    Diagnóstico
                  </div>
                  <p className="mnt-det-desc">{sol.textoDiagnostico}</p>
                </>
              )}
              {sol.materialRequerido && (
                <>
                  <div className="mnt-det-title" style={{ marginTop: 12 }}>
                    Material requerido
                  </div>
                  <p className="mnt-det-desc">{sol.materialRequerido}</p>
                </>
              )}
              {sol.actividadesRealizadas && (
                <>
                  <div className="mnt-det-title" style={{ marginTop: 12 }}>
                    Actividades realizadas
                  </div>
                  <p className="mnt-det-desc">{sol.actividadesRealizadas}</p>
                </>
              )}
              {sol.evaluacionVB && (
                <div
                  className={`mnt-vb-resultado ${sol.evaluacionVB === 1 ? "ok" : "no"}`}
                >
                  <i
                    className={`ti ${sol.evaluacionVB === 1 ? "ti-circle-check" : "ti-circle-x"}`}
                  />
                  {sol.evaluacionVB === 1
                    ? "Usuario conforme"
                    : "Usuario no conforme"}
                  {sol.observacionVB && (
                    <EvaluacionVisual texto={sol.observacionVB} />
                  )}
                </div>
              )}
              {/* Tiempos solo si ya hay cierre */}
              {sol.fechaRegistroCierre && <BloqueTimempos sol={sol} />}
            </div>
          </div>
        )}

        {/* HISTORIAL */}
        {tab === 1 && (
          <div className="mnt-timeline">
            {sol.historial?.map((h, i) => (
              <div key={h.idHistorial} className="mnt-timeline__item">
                {i < sol.historial.length - 1 && (
                  <div className="mnt-timeline__line" />
                )}
                <div className="mnt-timeline__dot" />
                <div className="mnt-timeline__body">
                  <div className="mnt-timeline__meta">
                    <span>{fmtFecha(h.fechaCambio, true)}</span>
                    <strong>{h.nombreActor}</strong>
                    {h.estatusAnterior !== 0 && (
                      <span className="mnt-timeline__trans">
                        {ESTATUS[h.estatusAnterior]?.label} →{" "}
                        {ESTATUS[h.estatusNuevo]?.label}
                      </span>
                    )}
                    {h.estatusAnterior === 0 && h.estatusNuevo === 0 && (
                      <span className="mnt-timeline__trans">
                        Solicitud creada
                      </span>
                    )}
                  </div>
                  {(h.motivo || h.nota) && (
                    <div className="mnt-timeline__nota">
                      {h.motivo || h.nota}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* EVIDENCIAS */}
        {tab === 2 && (
          <div className="mnt-evid-grid">
            {!sol.archivos?.length && (
              <p className="mnt-empty">Sin evidencias adjuntas.</p>
            )}
            {sol.archivos?.map((a) => {
              const url = `${STATIC}/${a.rutaServidor}`;
              const esImg = a.tipoMime?.startsWith("image/");
              return (
                <button
                  type="button"
                  key={a.idArchivo}
                  className="mnt-evid-item"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (esImg) setImagenPreview({ ...a, url });
                    else descargarEvidencia(a, url);
                  }}
                  onDoubleClick={(event) => event.preventDefault()}
                >
                  <div className="mnt-evid-thumb">
                    {esImg ? (
                      <img src={url} alt={a.nombreOriginal} />
                    ) : (
                      <i className="ti ti-file" />
                    )}
                  </div>
                  <span>{a.nombreOriginal}</span>
                  <small className="mnt-evid-etapa">
                    {a.momento === 1
                      ? "Del usuario"
                      : a.momento === 2
                        ? "Diagnóstico"
                        : "Cierre"}
                  </small>
                  <small className="mnt-evid-action">
                    <i
                      className={`ti ${esImg ? "ti-zoom-in" : "ti-download"}`}
                    />
                    {esImg ? " Ver imagen" : " Descargar"}
                  </small>
                </button>
              );
            })}
          </div>
        )}

        {/* MENSAJES */}
        {tab === 3 && (
          <TabMensajes
            idSolicitud={sol.idSolicitud}
            loginActual={loginActual}
            esMto={esMto}
          />
        )}

        {/* EJECUCIÓN */}
        {tab === 4 && (
          <div className="mnt-det-grid">
            <div className="mnt-det-card">
              <div className="mnt-det-title">Datos de ejecución</div>
              {[
                [
                  "Personal de mantenimiento",
                  sol.participantes
                    ?.filter((p) => p.tipoParticipacion === 1)
                    .map((p) => p.nombre)
                    .join(", ") || sol.loginTecnico,
                ],
                [
                  "Tipo trabajo",
                  sol.tipoTrabajo === 1
                    ? "Nuevo / Fabricación"
                    : "Existente / Mantenimiento",
                ],
                [
                  "Tipo actividad",
                  ["", "Equipo", "Máquina", "Infraestructura", "Mantenimiento"][
                    sol.tipoActividad
                  ],
                ],
                [
                  "Tipo mant.",
                  sol.tipoMantenimiento === 1 ? "Preventivo" : "Correctivo",
                ],
                ["Origen", sol.origenEvento === 1 ? "Interno" : "Externo"],
                ["Fecha inicio", fmtSoloFecha(sol.fechaInicio)],
                ["Hora inicio", fmtSoloHora(sol.horaInicio)],
                ["Fecha término", fmtSoloFecha(sol.fechaTermino)],
                ["Hora término", fmtSoloHora(sol.horaTermino)],
                [
                  "Tiempo ejec.",
                  sol.tiempoEjecucionMin != null
                    ? fmtMin(sol.tiempoEjecucionMin)
                    : "—",
                ],
                ["Cierre registrado", fmtFecha(sol.fechaRegistroCierre)],
              ].map(([l, v]) => (
                <div key={l} className="mnt-det-row">
                  <span>{l}</span>
                  <strong>{v ?? "—"}</strong>
                </div>
              ))}
            </div>
            <div className="mnt-det-card mnt-vb-execution">
              <div className="mnt-det-title">Visto bueno del usuario</div>
              {sol.evaluacionVB ? (
                <>
                  <div
                    className={`mnt-vb-execution__status ${sol.evaluacionVB === 1 ? "ok" : "no"}`}
                  >
                    <i
                      className={`ti ${sol.evaluacionVB === 1 ? "ti-circle-check" : "ti-alert-circle"}`}
                    />
                    <div>
                      <strong>
                        {sol.evaluacionVB === 1
                          ? "Solicitud aprobada y cerrada"
                          : "Trabajo no conforme"}
                      </strong>
                      <span>
                        {sol.evaluacionVB === 1
                          ? "El usuario confirmó satisfactoriamente el trabajo."
                          : "La solicitud fue reabierta para seguimiento."}
                      </span>
                    </div>
                  </div>
                  <div className="mnt-det-row">
                    <span>Evaluado por</span>
                    <strong>
                      {sol.loginEvaluador || "Usuario solicitante"}
                    </strong>
                  </div>
                  <div className="mnt-det-row">
                    <span>Fecha de evaluación</span>
                    <strong>{fmtFecha(sol.fechaEvaluacion)}</strong>
                  </div>
                  {sol.observacionVB && (
                    <div className="mnt-vb-execution__comment">
                      <span>Evaluación y comentarios</span>
                      <EvaluacionVisual texto={sol.observacionVB} />
                    </div>
                  )}
                </>
              ) : (
                <div className="mnt-vb-execution__pending">
                  <i className="ti ti-clock" />
                  <strong>Pendiente de visto bueno</strong>
                  <span>El usuario todavía no ha evaluado el trabajo.</span>
                </div>
              )}
              {(sol.evaluacionVB
                ? sol.evaluaciones?.slice(1)
                : sol.evaluaciones
              )?.length > 0 && (
                <div className="mnt-vb-history">
                  <span>Evaluaciones anteriores</span>
                  {(sol.evaluacionVB
                    ? sol.evaluaciones.slice(1)
                    : sol.evaluaciones
                  ).map((evaluacion, indice) => (
                    <div key={evaluacion.idEvaluacion} className="mnt-det-row">
                      <span>Ciclo {sol.evaluaciones.length - indice - 1}</span>
                      <strong>
                        {evaluacion.evaluacion === 1
                          ? "Conforme"
                          : "No conforme"}
                        {evaluacion.calificacionAtencion
                          ? ` · ${evaluacion.calificacionAtencion}/5 atención`
                          : ""}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="mnt-panel__actions">
        {esMto && ![3, 4, 6].includes(estatusVisual(sol)) && (
          <button
            className="mnt-action-btn mnt-action-btn--primary"
            onClick={() => onAccion("cambiarEstatus", sol)}
          >
            <i className="ti ti-refresh" /> Cambiar estado
          </button>
        )}
        {esMto && sol.idEstatus === 3 && sol.evaluacionVB === null && (
          <span className="mnt-action-info">
            <i className="ti ti-clock" /> Esperando visto bueno del usuario
          </span>
        )}
        {!esMto && sol.idEstatus === 3 && sol.evaluacionVB === null && (
          <button
            className="mnt-action-btn mnt-action-btn--vb"
            onClick={() => onAccion("vistoBueno", sol)}
          >
            <i className="ti ti-star" /> Dar visto bueno
          </button>
        )}
        {sol.idEstatus === 4 && (
          <span className="mnt-action-info mnt-action-info--danger">
            <i className="ti ti-ban" /> Solicitud rechazada
          </span>
        )}
      </div>
      {imagenPreview && (
        <div
          className="mnt-image-viewer"
          onMouseDown={() => setImagenPreview(null)}
        >
          <div
            className="mnt-image-viewer__dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="mnt-image-viewer__head">
              <strong>{imagenPreview.nombreOriginal}</strong>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    descargarEvidencia(imagenPreview, imagenPreview.url)
                  }
                  aria-label="Descargar imagen"
                >
                  <i className="ti ti-download" />
                </button>
                <button
                  type="button"
                  onClick={() => setImagenPreview(null)}
                  aria-label="Cerrar imagen"
                >
                  <i className="ti ti-x" />
                </button>
              </div>
            </div>
            <div className="mnt-image-viewer__body">
              <img src={imagenPreview.url} alt={imagenPreview.nombreOriginal} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TARJETA
// ─────────────────────────────────────────────────────────────
function ModalDetalleSolicitud({
  sol,
  detalle,
  esMto,
  onClose,
  onAccion,
  loginActual,
}) {
  useEffect(() => {
    const cerrarConEscape = (event) => event.key === "Escape" && onClose();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", cerrarConEscape);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", cerrarConEscape);
    };
  }, [onClose]);

  const solicitud = detalle || sol;
  const puedeGestionar = esMto && ![3, 4, 6].includes(estatusVisual(solicitud));
  const puedeFinalizar = esMto && [1, 2].includes(solicitud.idEstatus);

  return createPortal(
    <div className="mnt-detail-overlay" onMouseDown={onClose}>
      <section
        className="mnt-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`mnt-detail-title-${sol.idSolicitud}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mnt-detail-modal__head">
          <div className="mnt-detail-modal__title">
            <span>Solicitud de mantenimiento</span>
            <h2 id={`mnt-detail-title-${sol.idSolicitud}`}>{sol.folio}</h2>
            <p>{sol.servicio}</p>
          </div>
          <div className="mnt-detail-modal__head-actions">
            <PrioChip prioridad={sol.prioridad ?? sol.prioridadSnapshot} />
            <Chip idEstatus={estatusVisual(solicitud)} />
            {puedeGestionar && (
              <button
                className="mnt-detail-action"
                type="button"
                onClick={() => onAccion("cambiarEstatus", solicitud)}
              >
                <i className="ti ti-refresh" /> Cambiar estado
              </button>
            )}
            {puedeFinalizar && (
              <button
                className="mnt-detail-action mnt-detail-action--primary"
                type="button"
                onClick={() => onAccion("cambiarEstatus", solicitud, "3")}
              >
                <i className="ti ti-check" /> Finalizar trabajo
              </button>
            )}
            <button
              className="mnt-detail-close"
              type="button"
              onClick={onClose}
              aria-label="Cerrar detalle"
            >
              <i className="ti ti-x" />
            </button>
          </div>
        </header>
        <div className="mnt-detail-modal__body">
          {detalle ? (
            <PanelDetalle
              sol={detalle}
              esMto={esMto}
              onAccion={onAccion}
              loginActual={loginActual}
            />
          ) : (
            <div className="mnt-loading-panel">
              <i className="ti ti-loader-2 mnt-spin" /> Cargando…
            </div>
          )}
        </div>
        <footer className="mnt-detail-modal__foot">
          <span>
            {esMto
              ? "Gestiona la atención de esta solicitud."
              : "Consulta el seguimiento de tu solicitud."}
          </span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function TarjetaSolicitud({
  sol,
  expandido,
  onToggle,
  esMto,
  detalle,
  onAccion,
  loginActual,
}) {
  const noLeidos = mensajesNoLeidos(sol, loginActual);
  const nombresParticipantes = String(sol.personalMto || "")
    .split(",")
    .map((nombre) => nombre.trim())
    .filter(Boolean);
  const personalResumen = nombresParticipantes.length
    ? `${nombresParticipantes[0]}${nombresParticipantes.length > 1 ? ` +${nombresParticipantes.length - 1}` : ""}`
    : "Sin asignar";
  const personalCompleto = nombresParticipantes.join(", ");

  return (
    <div className={`mnt-card ${expandido ? "mnt-card--exp" : ""}`}>
      <div
        className={`mnt-card__head ${esMto ? "mnt-card__head--mto" : "mnt-card__head--usuario"}`}
        onClick={onToggle}
      >
        <span className="mnt-card__signal">
          <Semaforo sol={sol} />
        </span>
        <div className="mnt-card__folio">{sol.folio}</div>
        {esMto && (
          <span className="mnt-card__user">
            <strong>{sol.nombreSolicitante || "—"}</strong>
            <small>{sol.emailSolicitante || ""}</small>
          </span>
        )}
        {esMto && (
          <span className="mnt-card__area">{sol.nombreArea || "—"}</span>
        )}
        {esMto && (
          <span className="mnt-card__sitio">
            {sol.nombreSitio ??
              (sol.sitio === "IAFSA" ? "CEDIS" : sol.sitio) ??
              "—"}
          </span>
        )}
        <div className="mnt-card__servicio">{sol.servicio}</div>
        <span className="mnt-card__priority">
          <PrioChip prioridad={sol.prioridad ?? sol.prioridadSnapshot} />
        </span>
        <span className="mnt-card__status">
          <Chip idEstatus={estatusVisual(sol)} />
        </span>
        {esMto && (
          <span className="mnt-card__personal" title={personalCompleto}>
            {personalResumen}
          </span>
        )}
        <span className="mnt-card__fecha">
          {fmtFecha(sol.fechaCreacion, true)}
        </span>
        <span
          className={`mnt-card__msgs ${sol.totalMensajes > 0 ? "mnt-card__msgs--active" : ""} ${noLeidos > 0 ? "mnt-messages-unread" : ""}`}
          title={
            noLeidos > 0
              ? `${noLeidos} mensaje${noLeidos === 1 ? "" : "s"} nuevo${noLeidos === 1 ? "" : "s"}`
              : sol.totalMensajes > 0
                ? `${sol.totalMensajes} mensajes en esta solicitud`
                : "Sin mensajes"
          }
          aria-label={
            sol.totalMensajes > 0
              ? `${sol.totalMensajes} mensajes en esta solicitud`
              : "Sin mensajes"
          }
        >
          {sol.totalMensajes > 0 ? (
            <>
              <i className="ti ti-message-circle" />
              <strong>{noLeidos || sol.totalMensajes}</strong>
              {noLeidos > 0 && <span className="mnt-card__msg-dot" />}
            </>
          ) : (
            "—"
          )}
        </span>
        <i
          className={`ti ${expandido ? "ti-chevron-up" : "ti-chevron-down"} mnt-card__chevron`}
        />
      </div>
      {false &&
        expandido &&
        (detalle ? (
          <PanelDetalle
            sol={detalle}
            esMto={esMto}
            onAccion={onAccion}
            loginActual={loginActual}
          />
        ) : (
          <div className="mnt-loading-panel">
            <i className="ti ti-loader-2 mnt-spin" /> Cargando…
          </div>
        ))}
      {expandido && (
        <ModalDetalleSolicitud
          sol={sol}
          detalle={detalle}
          esMto={esMto}
          onClose={onToggle}
          onAccion={onAccion}
          loginActual={loginActual}
        />
      )}
    </div>
  );
}

function EncabezadoSolicitudes({ esMto }) {
  return (
    <div
      className={`mnt-list__header ${esMto ? "mnt-list__header--mto" : "mnt-list__header--usuario"}`}
      aria-hidden="true"
    >
      <span />
      <span>Folio</span>
      {esMto && <span>Usuario</span>}
      {esMto && <span>Área</span>}
      {esMto && <span>Sitio</span>}
      <span>Servicio</span>
      <span>Prioridad</span>
      <span>Estado</span>
      {esMto && <span>Personal asignado</span>}
      <span>Creación</span>
      <span>Mensajes</span>
      <span />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────
function KpiCard({ icon, color, label, value, active, onClick }) {
  return (
    <button
      className={`mnt-kpi ${active ? "mnt-kpi--active" : ""}`}
      style={{ "--kpi-color": color }}
      onClick={onClick}
    >
      <i className={`ti ${icon}`} style={{ color }} />
      <div>
        <span
          className="mnt-kpi__num"
          style={{ color: active ? color : undefined }}
        >
          {value ?? 0}
        </span>
        <span className="mnt-kpi__label">{label}</span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// VISTA USUARIO
// ─────────────────────────────────────────────────────────────
function VistaUsuario({ user }) {
  const REGISTROS_POR_PAGINA = 6;
  useSincronizarMensajesLeidos();
  const navigate = useNavigate();
  const [solicitudes, setSolicitudes] = useState([]);
  const [detalles, setDetalles] = useState({});
  const [expandido, setExpandido] = useState(null);
  const [modal, setModal] = useState(null);
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroPrioridad, setFiltroPrioridad] = useState("");
  const [filtroServicio, setFiltroServicio] = useState("");
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState("recientes");
  const [actualizando, setActualizando] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(msg, tipo = "ok") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }

  const cargar = useCallback(async () => {
    const data = await apiFetch("/api/mantenimiento/solicitudes/mis");
    if (!data.__error) setSolicitudes(data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const intervalo = window.setInterval(cargar, 15000);
    return () => window.clearInterval(intervalo);
  }, [cargar]);

  async function actualizarSolicitudes() {
    setActualizando(true);
    await cargar();
    setActualizando(false);
  }

  async function toggleExpandir(sol) {
    if (expandido === sol.idSolicitud) {
      setExpandido(null);
      return;
    }
    setExpandido(sol.idSolicitud);
    setDetalles((previos) => {
      const siguientes = { ...previos };
      delete siguientes[sol.idSolicitud];
      return siguientes;
    });
    const d = await apiFetch(
      `/api/mantenimiento/solicitudes/${sol.idSolicitud}`,
    );
    if (!d.__error) setDetalles((p) => ({ ...p, [sol.idSolicitud]: d }));
  }

  async function confirmarVB(
    id,
    evaluacion,
    observacion,
    calificacionAtencion,
    calificacionServicio,
  ) {
    const res = await apiFetch(
      `/api/mantenimiento/solicitudes/${id}/visto-bueno`,
      {
        method: "POST",
        body: JSON.stringify({
          evaluacion,
          observacion,
          calificacionAtencion,
          calificacionServicio,
        }),
      },
    );
    setModal(null);
    if (!res.__error) {
      showToast("Visto bueno registrado correctamente.");
      cargar();
      setDetalles((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      setExpandido(null);
    } else {
      showToast(res.error || "Error al registrar el visto bueno.", "error");
    }
  }

  const listaPorPestana =
    filtroEstatus === "3"
      ? solicitudes.filter((s) => Boolean(s.pendienteVB))
      : filtroEstatus
        ? solicitudes.filter((s) => String(s.idEstatus) === filtroEstatus)
        : solicitudes;
  const termino = busqueda.trim().toLocaleLowerCase("es-MX");
  const listaFiltrada = listaPorPestana.filter((s) => {
    const coincideBusqueda =
      !termino ||
      [s.folio, s.servicio, s.descripcion, s.ubicacionDetalle]
        .filter(Boolean)
        .some((valor) =>
          String(valor).toLocaleLowerCase("es-MX").includes(termino),
        );
    const coincidePrioridad =
      !filtroPrioridad || s.prioridad === filtroPrioridad;
    const coincideServicio = !filtroServicio || s.servicio === filtroServicio;
    return coincideBusqueda && coincidePrioridad && coincideServicio;
  });
  const listaOrdenada = [...listaFiltrada].sort((a, b) => {
    const diferencia = new Date(b.fechaCreacion) - new Date(a.fechaCreacion);
    return orden === "recientes" ? diferencia : -diferencia;
  });
  const totalPaginas = Math.max(
    1,
    Math.ceil(listaOrdenada.length / REGISTROS_POR_PAGINA),
  );
  const lista = listaOrdenada.slice(
    (pagina - 1) * REGISTROS_POR_PAGINA,
    pagina * REGISTROS_POR_PAGINA,
  );
  const serviciosDisponibles = [...new Set(solicitudes.map((s) => s.servicio))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));

  useEffect(() => {
    setPagina(1);
  }, [filtroEstatus, busqueda, filtroPrioridad, filtroServicio, orden]);

  useEffect(() => {
    if (pagina > totalPaginas) setPagina(totalPaginas);
  }, [pagina, totalPaginas]);

  const c = {
    sinAtencion: solicitudes.filter((s) => s.idEstatus === 0).length,
    enProceso: solicitudes.filter((s) => s.idEstatus === 1).length,
    pndVB: solicitudes.filter((s) => Boolean(s.pendienteVB)).length,
    rechazadas: solicitudes.filter((s) => s.idEstatus === 4).length,
  };

  const iconoServicio = (servicio = "") => {
    const texto = servicio.toLowerCase();
    if (texto.includes("cosedora")) return "ti-needle-thread";
    if (texto.includes("báscula") || texto.includes("bascula"))
      return "ti-scale";
    if (texto.includes("plomería") || texto.includes("plomeria"))
      return "ti-droplet";
    if (texto.includes("secador")) return "ti-wind";
    if (texto.includes("maquinaria") || texto.includes("componentes"))
      return "ti-settings";
    if (texto.includes("infraestructura") && texto.includes("limpieza"))
      return "ti-building-community";
    if (texto.includes("patín") || texto.includes("patin")) return "ti-pallet";
    if (texto.includes("electricidad")) return "ti-bulb";
    if (texto.includes("ventilación") || texto.includes("ventilacion"))
      return "ti-air-conditioning";
    if (texto.includes("montacargas")) return "ti-forklift";
    if (texto.includes("pintura") || texto.includes("grietas"))
      return "ti-paint";
    if (texto.includes("necesidades")) return "ti-clipboard-text";
    if (texto.includes("señal")) return "ti-sign-right";
    if (texto.includes("cctv")) return "ti-video";
    if (texto.includes("limpieza")) return "ti-spray";
    if (texto.trim() === "otro") return "ti-dots";
    return "ti-tool";
  };
  const bloqueaNuevaSolicitud = c.pndVB > 1;

  return (
    <div className="mnt-page mnt-user-page">
      {toast && (
        <div className={`mnt-toast mnt-toast--${toast.tipo}`}>
          <i
            className={`ti ${toast.tipo === "ok" ? "ti-circle-check" : "ti-alert-circle"}`}
          />
          {toast.msg}
        </div>
      )}
      <div className="mnt-user-hero">
        <div className="mnt-user-hero__intro">
          <div>
            <button
              className="apps-back"
              type="button"
              onClick={() => navigate("/")}
            >
              <i className="ti ti-arrow-left" /> Volver al inicio
            </button>
            <span className="mnt-user-hero__eyebrow">Portal Corporativo</span>
            <h1>
              Mantenimiento <em>FABPSA</em>
            </h1>
            <p>
              Consulta el avance de tus solicitudes y revisa las que necesitan
              tu confirmación.
            </p>
          </div>
        </div>
        <div className="mnt-user-hero__actions">
          <button
            className="mnt-user-refresh"
            type="button"
            onClick={actualizarSolicitudes}
            disabled={actualizando}
          >
            <i className={`ti ti-refresh ${actualizando ? "mnt-spin" : ""}`} />
            {actualizando ? "Actualizando…" : "Actualizar"}
          </button>
          <button
            className="mnt-btn-new"
            disabled={bloqueaNuevaSolicitud}
            title={
              bloqueaNuevaSolicitud
                ? "Califica tus solicitudes pendientes antes de crear una nueva."
                : "Crear una nueva solicitud"
            }
            onClick={() =>
              !bloqueaNuevaSolicitud && navigate("/mantenimiento/nueva")
            }
          >
            <i className="ti ti-plus" /> Nueva solicitud
          </button>
        </div>
      </div>

      <div className="mnt-user-tabs">
        <div>
          <button
            className={!filtroEstatus ? "active" : ""}
            onClick={() => setFiltroEstatus("")}
          >
            Todas <span>{solicitudes.length}</span>
          </button>
          <button
            className={filtroEstatus === "3" ? "active" : ""}
            onClick={() => setFiltroEstatus("3")}
          >
            Requieren mi atención <span>{c.pndVB}</span>
          </button>
          <button
            className={filtroEstatus === "4" ? "active" : ""}
            onClick={() => setFiltroEstatus("4")}
          >
            Rechazadas <span>{c.rechazadas}</span>
          </button>
        </div>
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
          aria-label="Ordenar solicitudes"
        >
          <option value="recientes">Más recientes</option>
          <option value="antiguas">Más antiguas</option>
        </select>
      </div>

      <div className="mnt-user-filters">
        <label className="mnt-user-search">
          <i className="ti ti-search" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, servicio o descripción..."
            aria-label="Buscar solicitudes"
          />
        </label>
        <select
          value={filtroEstatus}
          onChange={(e) => setFiltroEstatus(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTATUS).map(([id, estado]) => (
            <option key={id} value={id}>
              {estado.label}
            </option>
          ))}
        </select>
        <select
          value={filtroPrioridad}
          onChange={(e) => setFiltroPrioridad(e.target.value)}
          aria-label="Filtrar por prioridad"
        >
          <option value="">Todas las prioridades</option>
          {Object.entries(PRIORIDAD).map(([id, prioridad]) => (
            <option key={id} value={id}>
              {prioridad.label}
            </option>
          ))}
        </select>
        <select
          value={filtroServicio}
          onChange={(e) => setFiltroServicio(e.target.value)}
          aria-label="Filtrar por tipo de solicitud"
        >
          <option value="">Todos los tipos</option>
          {serviciosDisponibles.map((servicio) => (
            <option key={servicio} value={servicio}>
              {servicio}
            </option>
          ))}
        </select>
      </div>

      <div className="mnt-user-list">
        <h2>Tus solicitudes</h2>
        {!lista.length && (
          <div className="mnt-empty-state">
            <i className="ti ti-inbox" />
            <strong>
              {filtroEstatus
                ? "Sin solicitudes con ese estado"
                : "Aún no tienes solicitudes"}
            </strong>
            {!filtroEstatus && (
              <button
                className="mnt-btn-new"
                onClick={() => navigate("/mantenimiento/nueva")}
              >
                <i className="ti ti-plus" /> Crear primera solicitud
              </button>
            )}
          </div>
        )}
        {lista.map((sol) => {
          const noLeidos = mensajesNoLeidos(sol, user.login);
          return (
            <div
              className="mnt-user-row"
              role="button"
              tabIndex={0}
              key={sol.idSolicitud}
              onClick={() => toggleExpandir(sol)}
              onKeyDown={(e) => e.key === "Enter" && toggleExpandir(sol)}
            >
              <span className="mnt-user-row__icon">
                <i className={`ti ${iconoServicio(sol.servicio)}`} />
              </span>
              <span className="mnt-user-row__service">
                <strong>{sol.servicio}</strong>
                <small>{sol.folio}</small>
                <span
                  className="mnt-user-row__description"
                  title={sol.descripcion || "Sin descripción"}
                >
                  {sol.descripcion || "Sin descripción"}
                </span>
              </span>
              <span className="mnt-user-row__date">
                <i className="ti ti-calendar" />{" "}
                {fmtFecha(sol.fechaCreacion, true)}
              </span>
              <span className="mnt-user-row__priority">
                <PrioChip prioridad={sol.prioridad} />
              </span>
              <span className="mnt-user-row__status">
                <Chip idEstatus={estatusVisual(sol)} />
                <small>
                  {sol.pendienteVB
                    ? "Requiere tu confirmación"
                    : estatusVisual(sol) === 6
                      ? "Solicitud finalizada"
                      : sol.idEstatus === 4
                        ? "Consulta el motivo"
                        : "Seguimiento en curso"}
                </small>
              </span>
              <span
                className={`mnt-user-row__messages ${sol.totalMensajes > 0 ? "has-messages" : ""} ${noLeidos > 0 ? "mnt-messages-unread" : ""}`}
                title={
                  noLeidos > 0
                    ? `${noLeidos} mensaje${noLeidos === 1 ? "" : "s"} nuevo${noLeidos === 1 ? "" : "s"}`
                    : "Mensajes de la solicitud"
                }
              >
                {sol.totalMensajes > 0 ? (
                  <>
                    <i className="ti ti-message-circle" />{" "}
                    {noLeidos || sol.totalMensajes}
                    {noLeidos > 0 && <span className="mnt-card__msg-dot" />}
                  </>
                ) : (
                  "—"
                )}
              </span>
              {sol.pendienteVB ? (
                <button
                  className="mnt-user-row__rate"
                  type="button"
                  title="Calificar atención y servicio"
                  aria-label="Calificar atención y servicio"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ tipo: "vistoBueno", sol });
                  }}
                >
                  <i className="ti ti-star" />
                </button>
              ) : (
                <span className="mnt-user-row__rate-placeholder" />
              )}
              <i className="ti ti-chevron-right mnt-user-row__arrow" />
            </div>
          );
        })}
        {listaOrdenada.length > 0 && (
          <div className="mnt-user-pagination">
            <span>
              Mostrando {(pagina - 1) * REGISTROS_POR_PAGINA + 1}–
              {Math.min(pagina * REGISTROS_POR_PAGINA, listaOrdenada.length)} de{" "}
              {listaOrdenada.length}
            </span>
            <div>
              <button
                type="button"
                disabled={pagina === 1}
                onClick={() => setPagina((valor) => valor - 1)}
                aria-label="Página anterior"
              >
                <i className="ti ti-chevron-left" />
              </button>
              {Array.from(
                { length: totalPaginas },
                (_, indice) => indice + 1,
              ).map((numero) => (
                <button
                  type="button"
                  key={numero}
                  className={pagina === numero ? "active" : ""}
                  onClick={() => setPagina(numero)}
                >
                  {numero}
                </button>
              ))}
              <button
                type="button"
                disabled={pagina === totalPaginas}
                onClick={() => setPagina((valor) => valor + 1)}
                aria-label="Página siguiente"
              >
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </div>

      {expandido && (
        <ModalDetalleSolicitud
          sol={solicitudes.find((s) => s.idSolicitud === expandido)}
          detalle={detalles[expandido]}
          esMto={false}
          onClose={() => setExpandido(null)}
          onAccion={(tipo, s) => {
            if (tipo === "vistoBueno") setModal({ tipo, sol: s });
          }}
          loginActual={user.login}
        />
      )}

      {modal?.tipo === "vistoBueno" && (
        <ModalVistoBueno
          sol={modal.sol}
          onConfirm={confirmarVB}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VISTA MANTENIMIENTO
// ─────────────────────────────────────────────────────────────
function VistaMantenimiento({ user }) {
  useSincronizarMensajesLeidos();
  const REGISTROS_POR_PAGINA = 10;
  const [solicitudes, setSolicitudes] = useState([]);
  const [solicitudesResumen, setSolicitudesResumen] = useState([]);
  const [detalles, setDetalles] = useState({});
  const [expandido, setExpandido] = useState(null);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [sitiosCatalogo, setSitiosCatalogo] = useState([]);
  // Filtros
  const [filtroEstatus, setFiltroEstatus] = useState("");
  const [filtroSitio, setFiltroSitio] = useState("");
  const [filtroPrioridad, setFiltroPrioridad] = useState("");
  const [filtroTipoMant, setFiltroTipoMant] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);

  function showToast(msg, tipo = "ok") {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3500);
  }

  const cargar = useCallback(async () => {
    const params = new URLSearchParams();
    if (filtroEstatus) params.set("estatus", filtroEstatus);
    if (filtroSitio) params.set("sitio", filtroSitio);
    if (filtroPrioridad) params.set("prioridad", filtroPrioridad);
    if (filtroTipoMant) params.set("tipoMantenimiento", filtroTipoMant);
    if (busqueda.trim()) params.set("busqueda", busqueda.trim());
    const data = await apiFetch(`/api/mantenimiento/bandeja?${params}`);
    if (!data.__error) setSolicitudes(data);
  }, [filtroEstatus, filtroSitio, filtroPrioridad, filtroTipoMant, busqueda]);

  const cargarResumen = useCallback(async () => {
    const data = await apiFetch("/api/mantenimiento/bandeja");
    if (!data.__error) setSolicitudesResumen(data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  useEffect(() => {
    const intervalo = window.setInterval(() => {
      cargar();
      cargarResumen();
    }, 15000);
    return () => window.clearInterval(intervalo);
  }, [cargar, cargarResumen]);

  useEffect(() => {
    setPagina(1);
  }, [filtroEstatus, filtroSitio, filtroPrioridad, filtroTipoMant, busqueda]);

  useEffect(() => {
    apiFetch("/api/mantenimiento/catalogos/sitios-bandeja").then(
      (d) => !d.__error && setSitiosCatalogo(d),
    );
  }, []);

  async function toggleExpandir(sol) {
    if (expandido === sol.idSolicitud) {
      setExpandido(null);
      return;
    }
    setExpandido(sol.idSolicitud);
    setDetalles((previos) => {
      const siguientes = { ...previos };
      delete siguientes[sol.idSolicitud];
      return siguientes;
    });
    const d = await apiFetch(
      `/api/mantenimiento/solicitudes/${sol.idSolicitud}`,
    );
    if (!d.__error) setDetalles((p) => ({ ...p, [sol.idSolicitud]: d }));
  }

  async function confirmarCambio(idSolicitud, body, archivos) {
    let res;
    if (archivos?.length) {
      const fd = new FormData();
      Object.entries(body).forEach(([k, v]) => {
        if (v === undefined) return;
        if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
        else fd.append(k, v);
      });
      archivos.forEach((f) => fd.append("archivos", f));
      const raw = await fetch(
        `/api/mantenimiento/solicitudes/${idSolicitud}/estatus`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: fd,
        },
      );
      res = await raw.json();
    } else {
      res = await apiFetch(
        `/api/mantenimiento/solicitudes/${idSolicitud}/estatus`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
    }
    setModal(null);
    if (!res.__error && !res.error) {
      showToast("Estado actualizado correctamente.");
      cargar();
      cargarResumen();
      setDetalles((p) => {
        const n = { ...p };
        delete n[idSolicitud];
        return n;
      });
      setExpandido(null);
    } else {
      showToast(res.error || "Error al cambiar el estado.", "error");
    }
  }

  function limpiarFiltros() {
    setFiltroEstatus("");
    setFiltroSitio("");
    setFiltroPrioridad("");
    setFiltroTipoMant("");
    setBusqueda("");
  }

  const hayFiltros =
    filtroEstatus ||
    filtroSitio ||
    filtroPrioridad ||
    filtroTipoMant ||
    busqueda.trim();

  const c = {
    sinAtencion: solicitudesResumen.filter((s) => s.idEstatus === 0).length,
    enProceso: solicitudesResumen.filter((s) => s.idEstatus === 1).length,
    pndMaterial: solicitudesResumen.filter((s) => s.idEstatus === 2).length,
    pndVB: solicitudesResumen.filter(
      (s) => s.idEstatus === 3 && s.evaluacionVB == null,
    ).length,
    rechazadas: solicitudesResumen.filter((s) => s.idEstatus === 4).length,
    reabiertas: solicitudesResumen.filter((s) => s.idEstatus === 5).length,
  };

  const mostrarFiltroTipoMant = true;
  const totalPaginas = Math.max(
    1,
    Math.ceil(solicitudes.length / REGISTROS_POR_PAGINA),
  );
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaActual - 1) * REGISTROS_POR_PAGINA;
  const solicitudesPagina = solicitudes.slice(
    inicioPagina,
    inicioPagina + REGISTROS_POR_PAGINA,
  );
  const fechaActual = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="mnt-page mnt-page--operativo">
      {toast && (
        <div className={`mnt-toast mnt-toast--${toast.tipo}`}>
          <i
            className={`ti ${toast.tipo === "ok" ? "ti-circle-check" : "ti-alert-circle"}`}
          />
          {toast.msg}
        </div>
      )}

      <div className="mnt-page__header">
        <div className="mnt-page__header-main">
          <span className="mnt-page__header-icon">
            <i className="ti ti-tool" />
          </span>
          <div>
            <h1>Bandeja de Mantenimiento</h1>
            <p>Seguimiento y ejecución de trabajos</p>
          </div>
          <span className="mnt-page__header-date">
            <i className="ti ti-calendar" /> {fechaActual}
          </span>
        </div>
        <button
          className="mnt-btn-refresh"
          onClick={() => {
            cargar();
            cargarResumen();
          }}
        >
          <i className="ti ti-refresh" /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="mnt-kpis">
        <KpiCard
          icon="ti-clock"
          color="#94a3b8"
          label="Sin atención"
          value={c.sinAtencion}
          active={filtroEstatus === "0"}
          onClick={() => setFiltroEstatus((p) => (p === "0" ? "" : "0"))}
        />
        <KpiCard
          icon="ti-tool"
          color="#4cc9a6"
          label="En proceso"
          value={c.enProceso}
          active={filtroEstatus === "1"}
          onClick={() => setFiltroEstatus((p) => (p === "1" ? "" : "1"))}
        />
        <KpiCard
          icon="ti-package"
          color="#f97316"
          label="Pdte. material"
          value={c.pndMaterial}
          active={filtroEstatus === "2"}
          onClick={() => setFiltroEstatus((p) => (p === "2" ? "" : "2"))}
        />
        <KpiCard
          icon="ti-star"
          color="#06b6d4"
          label="Pdte. VB"
          value={c.pndVB}
          active={filtroEstatus === "3"}
          onClick={() => setFiltroEstatus((p) => (p === "3" ? "" : "3"))}
        />
        <KpiCard
          icon="ti-refresh"
          color="#a855f7"
          label="Reabiertas"
          value={c.reabiertas}
          active={filtroEstatus === "5"}
          onClick={() => setFiltroEstatus((p) => (p === "5" ? "" : "5"))}
        />
        <KpiCard
          icon="ti-circle-x"
          color="#ef4444"
          label="Rechazadas"
          value={c.rechazadas}
          active={filtroEstatus === "4"}
          onClick={() => setFiltroEstatus((p) => (p === "4" ? "" : "4"))}
        />
      </div>

      {/* Filtros */}
      <div className="mnt-filters">
        <div className="mnt-search-wrap">
          <i className="ti ti-search" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, nombre, correo, descripción…"
          />
          {busqueda && (
            <button onClick={() => setBusqueda("")}>
              <i className="ti ti-x" />
            </button>
          )}
        </div>
        <div className="mnt-filter-selects">
          <select
            value={filtroSitio}
            onChange={(e) => setFiltroSitio(e.target.value)}
          >
            <option value="">Todos los sitios</option>
            {sitiosCatalogo.map((s) => (
              <option key={s.sitio} value={s.sitio}>
                {s.nombreSitio}
              </option>
            ))}
          </select>
          <select
            value={filtroPrioridad}
            onChange={(e) => setFiltroPrioridad(e.target.value)}
          >
            <option value="">Todas las prioridades</option>
            <option value="001">Alta (24h)</option>
            <option value="002">Media (48h)</option>
          </select>
          {mostrarFiltroTipoMant && (
            <select
              value={filtroTipoMant}
              onChange={(e) => setFiltroTipoMant(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              <option value="1">Preventivo</option>
              <option value="2">Correctivo</option>
            </select>
          )}
          {hayFiltros && (
            <button className="mnt-btn-limpiar" onClick={limpiarFiltros}>
              <i className="ti ti-x" /> Limpiar filtros
            </button>
          )}
        </div>
        <div className="mnt-resultado-count">
          {solicitudes.length} resultado{solicitudes.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Lista */}
      <div className="mnt-list">
        {!!solicitudes.length && <EncabezadoSolicitudes esMto />}
        {!solicitudes.length && (
          <div className="mnt-empty-state">
            <i className="ti ti-inbox-off" />
            <strong>
              {hayFiltros
                ? "Sin resultados con esos filtros"
                : "Sin solicitudes en la bandeja"}
            </strong>
            {hayFiltros && (
              <button className="mnt-btn-ghost" onClick={limpiarFiltros}>
                Limpiar filtros
              </button>
            )}
          </div>
        )}
        {solicitudesPagina.map((sol) => (
          <TarjetaSolicitud
            key={sol.idSolicitud}
            sol={sol}
            expandido={expandido === sol.idSolicitud}
            onToggle={() => toggleExpandir(sol)}
            esMto={true}
            detalle={detalles[sol.idSolicitud]}
            onAccion={(tipo, s, estatusInicial) => {
              if (tipo === "cambiarEstatus")
                setModal({ tipo, sol: s, estatusInicial });
            }}
            loginActual={user.login}
          />
        ))}
        {!!solicitudes.length && (
          <div className="mnt-pagination">
            <span>
              Mostrando {inicioPagina + 1}–
              {Math.min(
                inicioPagina + REGISTROS_POR_PAGINA,
                solicitudes.length,
              )}{" "}
              de {solicitudes.length}
            </span>
            <div className="mnt-pagination__controls">
              <button
                type="button"
                disabled={paginaActual === 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <i className="ti ti-chevron-left" />
              </button>
              {Array.from(
                { length: totalPaginas },
                (_, index) => index + 1,
              ).map((numero) => (
                <button
                  type="button"
                  key={numero}
                  className={numero === paginaActual ? "active" : ""}
                  onClick={() => setPagina(numero)}
                >
                  {numero}
                </button>
              ))}
              <button
                type="button"
                disabled={paginaActual === totalPaginas}
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                aria-label="Página siguiente"
              >
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          </div>
        )}
      </div>

      {modal?.tipo === "cambiarEstatus" && (
        <ModalCambioEstatus
          sol={
            modal.sol.idSolicitud
              ? (detalles[modal.sol.idSolicitud] ?? modal.sol)
              : modal.sol
          }
          onConfirm={confirmarCambio}
          onClose={() => setModal(null)}
          estatusInicial={modal.estatusInicial}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function MantenimientoPage() {
  const [vista,setVista]=useState("bandeja");
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [listo, setListo] = useState(
    () => !location.state?.mostrarEntradaMantenimiento,
  );

  useEffect(() => {
    if (!location.state?.mostrarEntradaMantenimiento) {
      setListo(true);
      return undefined;
    }
    setListo(false);
    const t = setTimeout(() => {
      setListo(true);
      navigate("/mantenimiento", { replace: true, state: null });
    }, 5000);
    return () => clearTimeout(t);
  }, [location.key, location.state, navigate]);

  if (!listo) return <Splash />;
  if (!user) return null;

  return user.esMto ? (
    <><div className="mnt-view-tabs"><button aria-pressed={vista==="bandeja"} onClick={()=>setVista("bandeja")}>Solicitudes</button><button aria-pressed={vista==="ejecutivo"} onClick={()=>setVista("ejecutivo")}>Indicadores</button></div>{vista==="ejecutivo"?<MantenimientoExecutive/>:<VistaMantenimiento user={user}/>}</>
  ) : (
    <VistaUsuario user={user} />
  );
}
