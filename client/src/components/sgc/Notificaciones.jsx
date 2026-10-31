// components/sgc/Notificaciones.jsx
// Campana de notificaciones del SGC (barra superior del SGI y de la Mesa SGI).
// Consulta GET /api/sgc/notificaciones al montar, cada 60 s y al volver a la
// pestaña. Al elegir una, navega al registro y la marca como leída.
// Publica el total de no leídas en el evento "sgc:noLeidas" (lo usa Fab-i).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hace, sgcApi } from "../../pages/sgc/sgcApi";
import { SelectUsuario } from "../../pages/sgc/components/ui";

const TIPO = {
  NC_ASIGNADA: { icono: "ti-user-exclamation", tono: "brand" },
  NC_POR_VENCER: { icono: "ti-alarm", tono: "warn" },
  AC_POR_VENCER: { icono: "ti-clock-exclamation", tono: "warn" },
  TICKET_ACTUALIZADO: { icono: "ti-message-dots", tono: "info" },
  AUDITORIA_PROXIMA: { icono: "ti-calendar-event", tono: "brand" },
  RIESGO_ALTO: { icono: "ti-flame", tono: "danger" },
  DOC_POR_VENCER: { icono: "ti-file-alert", tono: "warn" },
  DELEGADO: { icono: "ti-share-3", tono: "info" },
};
const RUTA = {
  NC: (id) => `/sgc/no-conformidades/${id}`,
  AC: (id) => `/sgc/acciones-correctivas/${id}`,
  AUD: (id) => `/sgc/auditorias/${id}`,
  MSI: (id) => `/mesa-sgi/ticket/${id}`,
  RIESGO: (id) => `/sgc/riesgos/${id}`,
};
const INTERVALO = 60000;

// conRol: el usuario tiene rol SGC (solo entonces puede delegar a otro integrante)
export default function Notificaciones({ conRol = false }) {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState({ items: [], noLeidas: 0 });
  const [error, setError] = useState(null);
  const [delegar, setDelegar] = useState(null); // { id, login }
  const caja = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const d = await sgcApi("/notificaciones");
      setDatos(d);
      setError(null);
      window.dispatchEvent(new CustomEvent("sgc:noLeidas", { detail: d.noLeidas }));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, INTERVALO);
    const visible = () => document.visibilityState === "visible" && cargar();
    const cambio = () => cargar();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("sgc:cambio", cambio);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("sgc:cambio", cambio);
    };
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => caja.current && !caja.current.contains(e.target) && setAbierto(false);
    const esc = (e) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  const abrir = async (n) => {
    setAbierto(false);
    if (!n.leida) {
      setDatos((d) => ({ items: d.items.map((x) => (x.idNotificacion === n.idNotificacion ? { ...x, leida: true } : x)), noLeidas: Math.max(0, d.noLeidas - 1) }));
      sgcApi(`/notificaciones/${n.idNotificacion}/leer`, { method: "PUT" }).then(cargar).catch(() => {});
    }
    if (RUTA[n.entidad] && n.idEntidad) navigate(RUTA[n.entidad](n.idEntidad));
  };

  // ver | posponer | delegar (PATCH /notificaciones/:id/accion)
  const accionar = async (n, accion, extra = {}) => {
    try {
      await sgcApi(`/notificaciones/${n.idNotificacion}/accion`, { method: "PATCH", body: { accion, ...extra } });
      setDelegar(null);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const leerTodo = async () => {
    try {
      await sgcApi("/notificaciones/leer-todo", { method: "PUT" });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="notif" ref={caja}>
      <button type="button" className="notif__boton" onClick={() => setAbierto((a) => !a)} aria-label={`Notificaciones${datos.noLeidas ? `: ${datos.noLeidas} sin leer` : ""}`} aria-expanded={abierto}>
        <i className="ti ti-bell" />
        {datos.noLeidas > 0 && <span className="notif__cuenta num">{datos.noLeidas > 99 ? "99+" : datos.noLeidas}</span>}
      </button>
      {abierto && (
        <div className="notif__panel" role="dialog" aria-label="Notificaciones">
          <header className="notif__head">
            <b>Notificaciones</b>
            {datos.noLeidas > 0 && <span className="muted">{datos.noLeidas} sin leer</span>}
          </header>
          <ul className="notif__lista">
            {error && <li className="notif__vacio t-danger">{error}</li>}
            {!error && !datos.items.length && (
              <li className="notif__vacio">
                <i className="ti ti-bell-check" />
                Estás al día.
              </li>
            )}
            {datos.items.map((n) => {
              const t = TIPO[n.tipo] || { icono: "ti-bell", tono: "neutral" };
              const destino = RUTA[n.entidad] && n.idEntidad;
              return (
                <li key={n.idNotificacion} className="notif__fila">
                  <button type="button" className={`notif__item${n.leida ? "" : " is-nueva"}`} onClick={() => abrir(n)}>
                    <span className={`notif__icono t-${t.tono}`}>
                      <i className={`ti ${t.icono}`} />
                    </span>
                    <span className="notif__texto">
                      <b>{n.titulo}</b>
                      {n.mensaje && <span>{n.mensaje}</span>}
                      <small>{hace(n.fechaCreacion)}</small>
                    </span>
                  </button>
                  <div className="notif__acciones">
                    {destino && (
                      <button type="button" className="btn btn--sm" onClick={() => abrir(n)}>
                        <i className="ti ti-eye" /> Ver
                      </button>
                    )}
                    <button type="button" className="btn btn--fantasma btn--sm" title="Ocultar hasta mañana" onClick={() => accionar(n, "posponer", { dias: 1 })}>
                      <i className="ti ti-clock-pause" /> Posponer
                    </button>
                    {conRol && (
                      <button type="button" className="btn btn--fantasma btn--sm" aria-expanded={delegar?.id === n.idNotificacion}
                        onClick={() => setDelegar((d) => (d?.id === n.idNotificacion ? null : { id: n.idNotificacion, login: "" }))}>
                        <i className="ti ti-share-3" /> Delegar
                      </button>
                    )}
                  </div>
                  {delegar?.id === n.idNotificacion && (
                    <div className="notif__delegar">
                      <SelectUsuario value={delegar.login} onChange={(login) => setDelegar({ id: n.idNotificacion, login })} placeholder="¿A quién?" />
                      <button type="button" className="btn btn--primario btn--sm" disabled={!delegar.login} onClick={() => accionar(n, "delegar", { login: delegar.login })}>
                        <i className="ti ti-send" /> Enviar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <footer className="notif__pie">
            <button type="button" className="btn btn--fantasma btn--sm" onClick={leerTodo} disabled={!datos.noLeidas}>
              <i className="ti ti-checks" /> Marcar todas como leídas
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}
