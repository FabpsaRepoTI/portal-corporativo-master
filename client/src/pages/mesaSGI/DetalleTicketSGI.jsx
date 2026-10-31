// pages/mesaSGI/DetalleTicketSGI.jsx
// Detalle de una solicitud con el patrón de la Mesa de Servicio TI:
//   · pestañas Información / Comentarios / Seguimiento
//   · barra de acciones según el estado (sin responsable → asignar primero)
//   · cada cambio de estatus abre un modal; En espera, Resuelta y Cancelada
//     exigen un comentario que ve el solicitante
// Comentarios: línea de tiempo tipo chat; los internos solo los ve el equipo
// SGI y llevan candado. Seguimiento: los movimientos (estatus y asignación).
import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { Avatar, BotonGuardar, Dato, ErrorCarga, Modal, Skel, useToast, TituloSub } from "../sgc/components/ui";
import { fechaHora, hace, sgcApi, sgcRespuesta, useSgc, MSI_ESTATUS, MSI_PRIORIDAD } from "../sgc/sgcApi";
import { EstatusMSI, SLA, slaTexto } from "./MesaSGILayout";

// Acciones de estatus: destino, texto, ícono, tono y si exige comentario
const ACCIONES = {
  atender: { destino: 2, titulo: "Iniciar atención", icono: "ti-player-play", tono: "info", pide: false },
  reanudar: { destino: 2, titulo: "Reanudar atención", icono: "ti-player-play", tono: "info", pide: false },
  espera: { destino: 3, titulo: "Poner en espera", icono: "ti-player-pause", tono: "orange", pide: true, ayuda: "¿Qué información necesitas del solicitante?" },
  resolver: { destino: 4, titulo: "Marcar como resuelta", icono: "ti-circle-check", tono: "ok", pide: true, ayuda: "Describe la solución entregada." },
  reabrir: { destino: 2, titulo: "Reabrir solicitud", icono: "ti-refresh", tono: "info", pide: false },
  cancelar: { destino: 5, titulo: "Cancelar solicitud", icono: "ti-ban", tono: "danger", pide: true, ayuda: "Indica el motivo de la cancelación." },
};

function ModalEstatus({ ticket, accion, onClose, onHecho }) {
  const toast = useToast();
  const a = ACCIONES[accion];
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const confirmar = async () => {
    if (a.pide && !texto.trim()) return setError("El comentario es obligatorio para este cambio.");
    try {
      setGuardando(true);
      await sgcApi(`/mesa-sgi/tickets/${ticket.idTicket}/estatus`, { method: "PUT", body: { idEstatus: a.destino, motivo: texto.trim() || undefined } });
      toast.ok(`${ticket.folio}: ${MSI_ESTATUS[a.destino].label}`);
      onHecho();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };
  return (
    <Modal
      titulo={
        <span className="msi-modal__titulo">
          <span className={`msi-modal__icono t-${a.tono}`}>
            <i className={`ti ${a.icono}`} />
          </span>
          {a.titulo}
        </span>
      }
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>
            Volver
          </button>
          <BotonGuardar className={`btn ${a.destino === 5 ? "btn--peligro btn--solido" : "btn--primario"}`} ocupado={guardando} icono={a.icono} onClick={confirmar}>
            {a.titulo}
          </BotonGuardar>
        </>
      }
    >
      <p className="texto">
        <span className="mono strong">{ticket.folio}</span> · {ticket.titulo}
        <br />
        Pasará de <EstatusMSI id={ticket.idEstatus} /> a <EstatusMSI id={a.destino} />.
      </p>
      <label className="campo" style={{ marginTop: 12 }}>
        <span className="campo__etq">
          Comentario {a.pide ? <span className="t-danger tinta">obligatorio</span> : <span className="muted">(opcional)</span>}
        </span>
        <textarea
          className={`inp${error ? " inp--error" : ""}`}
          rows={4}
          maxLength={2000}
          value={texto}
          autoFocus
          onChange={(e) => {
            setTexto(e.target.value);
            setError(null);
          }}
          placeholder={a.ayuda || "Comentario para el solicitante"}
        />
        {error ? (
          <span className="campo__error">
            <i className="ti ti-alert-circle" /> {error}
          </span>
        ) : (
          <span className="campo__ayuda">
            <i className="ti ti-eye" /> El solicitante verá este comentario.
          </span>
        )}
      </label>
    </Modal>
  );
}

function ModalAsignar({ ticket, onClose, onHecho }) {
  const toast = useToast();
  const { data: equipo } = useSgc(() => sgcRespuesta("/mesa-sgi/admin").then((r) => r.data.equipo), []);
  const [login, setLogin] = useState("");
  const [guardando, setGuardando] = useState(false);
  const asignar = async () => {
    if (!login) return toast.error("Elige a quién asignar la solicitud.");
    try {
      setGuardando(true);
      const r = await sgcApi(`/mesa-sgi/tickets/${ticket.idTicket}/asignar`, { method: "PUT", body: { loginAsignado: login } });
      toast.ok(`Asignada a ${r.asignado}`);
      onHecho();
    } catch (err) {
      toast.error(err.message);
      setGuardando(false);
    }
  };
  return (
    <Modal
      titulo={ticket.loginAsignado ? "Reasignar solicitud" : "Asignar a otro integrante"}
      onClose={onClose}
      bloqueado={guardando}
      pie={
        <>
          <button className="btn" onClick={onClose} disabled={guardando}>
            Volver
          </button>
          <BotonGuardar ocupado={guardando} icono="ti-user-check" onClick={asignar}>
            Asignar
          </BotonGuardar>
        </>
      }
    >
      <div className="msi-equipo" role="radiogroup" aria-label="Equipo SGI">
        {!equipo ? (
          <Skel filas={3} />
        ) : (
          equipo
            .filter((u) => u.login !== ticket.loginAsignado)
            .map((u) => (
              <button key={u.login} type="button" role="radio" aria-checked={login === u.login} className={`msi-equipo__op${login === u.login ? " is-on" : ""}`} onClick={() => setLogin(u.login)}>
                <Avatar nombre={u.nombre} chico />
                <span>
                  <b>{u.nombre}</b>
                  <small>{u.carga} abiertas</small>
                </span>
                {login === u.login && <i className="ti ti-check" />}
              </button>
            ))
        )}
      </div>
    </Modal>
  );
}

/** Barra de acciones según el estado, como la de Atención de incidencias TI. */
function BarraAcciones({ ticket, login, onAccion }) {
  const p = ticket.permisos;
  const e = ticket.idEstatus;
  if (e === 5 || (!p.esSGI && e === 4)) {
    return (
      <div className="msi-barra">
        <i className="ti ti-lock muted" />
        <span className="muted">Solicitud concluida{e === 4 && p.esSGI ? "" : " — sin acciones pendientes"}.</span>
      </div>
    );
  }
  if (!p.esSGI) {
    return p.cancelar ? (
      <div className="msi-barra">
        <span className="msi-barra__label">Tu solicitud</span>
        <button className="btn btn--sm btn--fantasma btn--peligro" onClick={() => onAccion("cancelar")}>
          <i className="ti ti-ban" /> Cancelar solicitud
        </button>
      </div>
    ) : null;
  }
  if (!ticket.loginAsignado && e !== 4) {
    return (
      <div className="msi-barra">
        <span className="msi-barra__label">Acciones rápidas</span>
        <button className="btn btn--sm btn--primario" onClick={() => onAccion("asignarme")}>
          <i className="ti ti-user-plus" /> Asignarme la solicitud
        </button>
        <button className="btn btn--sm" onClick={() => onAccion("asignar")}>
          <i className="ti ti-transfer" /> Asignar a otro
        </button>
        <span className="msi-barra__nota">Asigna un responsable para habilitar el resto de acciones.</span>
      </div>
    );
  }
  const mio = String(ticket.loginAsignado || "").toUpperCase() === String(login || "").toUpperCase();
  return (
    <div className="msi-barra">
      <span className="msi-barra__label">{e === 3 ? "En espera del solicitante" : e === 4 ? "Solicitud resuelta" : "Acciones"}</span>
      {e === 1 && (
        <button className="btn btn--sm btn--primario" onClick={() => onAccion("atender")}>
          <i className="ti ti-player-play" /> Iniciar atención
        </button>
      )}
      {e === 3 && (
        <button className="btn btn--sm btn--primario" onClick={() => onAccion("reanudar")}>
          <i className="ti ti-player-play" /> Reanudar
        </button>
      )}
      {[1, 2, 3].includes(e) && (
        <button className={`btn btn--sm${e === 2 ? " btn--primario" : ""}`} onClick={() => onAccion("resolver")}>
          <i className="ti ti-circle-check" /> Resolver
        </button>
      )}
      {[1, 2].includes(e) && (
        <button className="btn btn--sm" onClick={() => onAccion("espera")}>
          <i className="ti ti-player-pause" /> Poner en espera
        </button>
      )}
      {e === 4 && (
        <button className="btn btn--sm" onClick={() => onAccion("reabrir")}>
          <i className="ti ti-refresh" /> Reabrir
        </button>
      )}
      {e !== 4 && (
        <button className="btn btn--sm btn--fantasma" onClick={() => onAccion("asignar")}>
          <i className="ti ti-transfer" /> {mio ? "Reasignar" : "Asignar a otro"}
        </button>
      )}
      {e !== 4 && (
        <button className="btn btn--sm btn--fantasma btn--peligro" onClick={() => onAccion("cancelar")}>
          <i className="ti ti-ban" /> Cancelar
        </button>
      )}
    </div>
  );
}

function TabInformacion({ t }) {
  const total = t.fechaLimite ? new Date(t.fechaLimite) - new Date(t.fechaCreacion) : 0;
  const fin = t.fechaCierre ? new Date(t.fechaCierre) : new Date();
  const consumido = total > 0 ? Math.min(100, Math.max(0, Math.round(((fin - new Date(t.fechaCreacion)) / total) * 100))) : null;
  const tono = consumido == null ? "neutral" : t.vencido || consumido >= 100 ? "danger" : consumido >= 75 ? "warn" : "ok";
  return (
    <div className="msi-info">
      <section>
        <h3>Descripción</h3>
        <p className="msi-info__desc">{t.descripcion}</p>
      </section>
      <dl className="msi-info__datos">
        <Dato label="Servicio">{t.servicio}</Dato>
        <Dato label="Solicitante">{t.solicitante}</Dato>
        <Dato label="Atiende">{t.asignado || <span className="muted">Por asignar</span>}</Dato>
        <Dato label="Prioridad">
          <span className={`tag t-${MSI_PRIORIDAD[t.prioridad].tono}`}>{t.prioridadLabel}</span>
        </Dato>
        <Dato label="Creada">{fechaHora(t.fechaCreacion)}</Dato>
        <Dato label="Fecha límite">{t.fechaLimite ? fechaHora(t.fechaLimite) : "Sin plazo"}</Dato>
        {t.fechaCierre && <Dato label={t.idEstatus === 4 ? "Resuelta" : "Cerrada"}>{fechaHora(t.fechaCierre)}</Dato>}
      </dl>
      {consumido != null && (
        <section className={`msi-sla-barra t-${tono}`}>
          <div className="msi-sla-barra__cab">
            <h3>Plazo de atención · {slaTexto(Math.round(total / 3600000))}</h3>
            <SLA ticket={t} />
          </div>
          <div className="barra" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={consumido} aria-label="Plazo consumido">
            <span style={{ width: `${consumido}%` }} />
          </div>
          <small className="muted">{consumido}% del plazo {[4, 5].includes(t.idEstatus) ? "usado al concluir" : "consumido"}</small>
        </section>
      )}
    </div>
  );
}

function TabComentarios({ t, login, onEnviado }) {
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const fin = useRef(null);
  const p = t.permisos;
  const lista = t.comentarios.filter((c) => !c.esEvento);
  const esMio = (l) => String(l || "").toUpperCase() === String(login || "").toUpperCase();
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "nearest" });
  }, [lista.length]);

  const comentar = async (e) => {
    e.preventDefault();
    if (!texto.trim()) return;
    try {
      setEnviando(true);
      const r = await sgcApi(`/mesa-sgi/tickets/${t.idTicket}/comentario`, { method: "POST", body: { mensaje: texto.trim(), esInterno: interno } });
      setTexto("");
      if (r.reactivado) toast.ok(`Gracias. Tu solicitud volvió a «${MSI_ESTATUS[2].label}».`);
      onEnviado();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="msi__hilo">
      <ol className="hilo">
        <li className={`hilo__item${esMio(t.loginSolicitante) ? " is-mio" : ""}`}>
          <Avatar nombre={t.solicitante} chico />
          <div className="hilo__burbuja hilo__burbuja--origen">
            <div className="hilo__meta">
              <b>{t.solicitante}</b> abrió la solicitud · <span title={fechaHora(t.fechaCreacion)}>{hace(t.fechaCreacion)}</span>
            </div>
            <p>{t.descripcion}</p>
          </div>
        </li>
        {lista.map((c) => (
          <li key={c.idComentario} className={`hilo__item${esMio(c.login) ? " is-mio" : ""}${c.esInterno ? " is-interno" : ""}`}>
            <Avatar nombre={c.nombre || c.login} chico />
            <div className="hilo__burbuja">
              <div className="hilo__meta">
                {c.esInterno && (
                  <span className="hilo__candado" title="Comentario interno: solo lo ve el equipo SGI">
                    <i className="ti ti-lock" /> Interno
                  </span>
                )}
                <b>{c.nombre || c.login}</b>
                {c.esSGI && !c.esInterno && <span className="hilo__sgi">SGI</span>} · <span title={fechaHora(c.fechaRegistro)}>{hace(c.fechaRegistro)}</span>
              </div>
              <p>{c.mensaje}</p>
            </div>
          </li>
        ))}
        <li ref={fin} aria-hidden="true" />
      </ol>
      {p.comentar ? (
        <form className="hilo__nuevo" onSubmit={comentar}>
          <textarea
            className="inp"
            rows={3}
            maxLength={4000}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) comentar(e);
            }}
            placeholder={interno ? "Nota interna para el equipo SGI…" : p.esSGI ? "Responde al solicitante…" : "Escribe un comentario para el equipo SGI…"}
            aria-label="Comentario"
          />
          <div className="hilo__nuevo-pie">
            {p.esSGI ? (
              <label className="check">
                <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} />
                <i className="ti ti-lock" /> Comentario interno
              </label>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                Ctrl + Enter para enviar
              </span>
            )}
            <BotonGuardar type="submit" className={`btn ${interno ? "" : "btn--primario"}`} ocupado={enviando} icono="ti-send" disabled={!texto.trim()}>
              {interno ? "Guardar nota" : "Enviar"}
            </BotonGuardar>
          </div>
        </form>
      ) : (
        <p className="hilo__cerrado muted">
          <i className="ti ti-lock" /> La solicitud está cancelada.
        </p>
      )}
    </div>
  );
}

function TabSeguimiento({ t }) {
  const eventos = [{ idComentario: "alta", nombre: t.solicitante, mensaje: `Registró la solicitud con folio ${t.folio}.`, fechaRegistro: t.fechaCreacion, alta: true }, ...t.comentarios.filter((c) => c.esEvento)];
  return (
    <ol className="msi-seguimiento">
      {eventos.map((ev) => {
        const [linea, ...resto] = String(ev.mensaje).split("\n");
        const icono = ev.alta ? "ti-inbox" : /Asignó/.test(linea) ? "ti-user-check" : /Resuelta/.test(linea.split("a «").pop() || "") ? "ti-circle-check" : /Cancelada/.test(linea.split("a «").pop() || "") ? "ti-ban" : "ti-arrows-exchange";
        return (
          <li key={ev.idComentario}>
            <span className="msi-seguimiento__punto">
              <i className={`ti ${icono}`} />
            </span>
            <div>
              <p>
                <b>{ev.nombre || ev.login}</b> · {linea.replace(/^Cambió/, "cambió").replace(/^Asignó/, "asignó").replace(/^Registró/, "registró")}
              </p>
              {resto.length > 0 && <p className="msi-seguimiento__motivo">{resto.join("\n")}</p>}
              <small className="muted">{fechaHora(ev.fechaRegistro)}</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function DetalleTicketSGI() {
  const { id } = useParams();
  const { login } = useOutletContext();
  const toast = useToast();
  const { data: t, error, cargando, recargar } = useSgc(() => sgcApi(`/mesa-sgi/tickets/${id}`), [id]);
  const [tab, setTab] = useState("info");
  const [modal, setModal] = useState(null); // clave de ACCIONES | 'asignar'

  const accion = async (clave) => {
    if (clave === "asignarme") {
      try {
        const r = await sgcApi(`/mesa-sgi/tickets/${t.idTicket}/asignar`, { method: "PUT", body: { loginAsignado: login } });
        toast.ok(`Asignada a ${r.asignado}`);
        recargar();
      } catch (err) {
        toast.error(err.message);
      }
      return;
    }
    // Sin comentario obligatorio y sin pedir confirmación: el modal igual
    // permite dejar un comentario opcional, como en la Mesa TI
    setModal(clave);
  };

  if (error)
    return (
      <div className="msi__pagina">
        <ErrorCarga error={error} onReintentar={recargar} />
      </div>
    );
  if (cargando && !t)
    return (
      <div className="msi__pagina">
        <div className="pnl">
          <Skel filas={8} />
        </div>
      </div>
    );

  const p = t.permisos;
  const delSolicitante = String(t.loginSolicitante).toUpperCase() === String(login || "").toUpperCase();
  const nComentarios = t.comentarios.filter((c) => !c.esEvento).length;
  const nEventos = t.comentarios.filter((c) => c.esEvento).length + 1;
  const hecho = () => {
    setModal(null);
    recargar();
  };

  return (
    <div className="msi__pagina">
      <Link to={p.esSGI && !delSolicitante ? "/mesa-sgi/admin" : "/mesa-sgi/mis-tickets"} className="msi__volver">
        <i className="ti ti-arrow-left" /> {p.esSGI && !delSolicitante ? "Gestión SGI" : "Mis solicitudes"}
      </Link>
      <header className="msi__ticket-head">
        <div>
          <span className="mono strong msi__folio">{t.folio}</span>
          <TituloSub texto={t.titulo} />
          <div className="msi__ticket-tags">
            <EstatusMSI id={t.idEstatus} />
            <SLA ticket={t} />
            <span className={`tag t-${MSI_PRIORIDAD[t.prioridad].tono}`}>Prioridad {t.prioridadLabel.toLowerCase()}</span>
            <span className="tag tag--linea">
              <i className="ti ti-user" /> {t.asignado || "Por asignar"}
            </span>
          </div>
        </div>
      </header>

      <section className="pnl msi-detalle">
        <div className="tabs" role="tablist" aria-label="Secciones de la solicitud">
          {[
            ["info", "Información", "ti-info-circle"],
            ["comentarios", "Comentarios", "ti-message", nComentarios],
            ["seguimiento", "Seguimiento", "ti-timeline", nEventos],
          ].map(([clave, label, icono, n]) => (
            <button key={clave} type="button" role="tab" aria-selected={tab === clave} className={`tabs__tab${tab === clave ? " is-on" : ""}`} onClick={() => setTab(clave)}>
              <i className={`ti ${icono}`} />
              {label}
              {n > 0 && <span className="tabs__cuenta">{n}</span>}
            </button>
          ))}
        </div>
        <div className="msi-detalle__cuerpo">
          {tab === "info" && <TabInformacion t={t} />}
          {tab === "comentarios" && <TabComentarios t={t} login={login} onEnviado={recargar} />}
          {tab === "seguimiento" && <TabSeguimiento t={t} />}
        </div>
        <BarraAcciones ticket={t} login={login} onAccion={accion} />
      </section>

      {modal === "asignar" && <ModalAsignar ticket={t} onClose={() => setModal(null)} onHecho={hecho} />}
      {modal && ACCIONES[modal] && <ModalEstatus ticket={t} accion={modal} onClose={() => setModal(null)} onHecho={hecho} />}
    </div>
  );
}
