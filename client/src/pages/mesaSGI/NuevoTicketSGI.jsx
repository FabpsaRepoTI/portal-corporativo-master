// pages/mesaSGI/NuevoTicketSGI.jsx
// Nueva solicitud a SGI con el mismo flujo que la Mesa de Servicio TI:
// 1 Servicio → 2 Detalle → 3 Confirmación, y pantalla de éxito con el folio.
import { useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { BotonGuardar, Campo, useToast } from "../sgc/components/ui";
import { fechaHora, sgcApi, MSI_PRIORIDAD } from "../sgc/sgcApi";
import { iconoServicio, slaTexto } from "./MesaSGILayout";

const PASOS = ["Servicio", "Detalle", "Confirmación"];

function Stepper({ paso }) {
  return (
    <ol className="msi-pasos" aria-label="Pasos de la solicitud">
      {PASOS.map((label, i) => {
        const num = i + 1;
        const estado = num < paso ? "hecho" : num === paso ? "actual" : "";
        return (
          <li key={label} className={`msi-pasos__item${estado ? ` is-${estado}` : ""}`} aria-current={num === paso ? "step" : undefined}>
            <span className="msi-pasos__num">{num < paso ? <i className="ti ti-check" /> : num}</span>
            <span className="msi-pasos__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PantallaExito({ ticket, onNueva }) {
  return (
    <div className="msi-exito pnl">
      <span className="msi-exito__icono">
        <i className="ti ti-circle-check" />
      </span>
      <h2>¡Solicitud registrada!</h2>
      <p>El equipo SGI ya la recibió. Te avisaremos aquí cada vez que cambie de estatus.</p>
      <span className="msi-exito__folio mono">{ticket.folio}</span>
      {ticket.fechaLimite && <p className="muted">Fecha límite de atención: {fechaHora(ticket.fechaLimite)}</p>}
      <div className="msi-exito__acciones">
        <Link to={`/mesa-sgi/ticket/${ticket.idTicket}`} className="btn btn--primario">
          <i className="ti ti-eye" /> Ver mi solicitud
        </Link>
        <button type="button" className="btn" onClick={onNueva}>
          <i className="ti ti-plus" /> Nueva solicitud
        </button>
        <Link to="/mesa-sgi/mis-tickets" className="btn btn--fantasma">
          Mis solicitudes
        </Link>
      </div>
    </div>
  );
}

export default function NuevoTicketSGI() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const { servicios } = useOutletContext();
  const inicial = servicios.some((s) => String(s.idServicio) === params.get("servicio")) ? params.get("servicio") : "";
  const [paso, setPaso] = useState(inicial ? 2 : 1);
  const [f, setF] = useState({ idServicio: inicial, titulo: "", descripcion: "", prioridad: 2 });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [creado, setCreado] = useState(null);
  const servicio = servicios.find((s) => String(s.idServicio) === String(f.idServicio));
  const limite = servicio?.slaHoras ? new Date(Date.now() + servicio.slaHoras * 3600000) : null;

  const validarDetalle = () => {
    const er = {};
    if (!f.titulo.trim()) er.titulo = "Escribe un título breve.";
    if (!f.descripcion.trim()) er.descripcion = "Describe lo que necesitas.";
    setErrores(er);
    return !Object.keys(er).length;
  };

  const enviar = async () => {
    try {
      setGuardando(true);
      const r = await sgcApi("/mesa-sgi/tickets", { method: "POST", body: { ...f, idServicio: Number(f.idServicio) } });
      setCreado(r);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const reiniciar = () => {
    setCreado(null);
    setF({ idServicio: "", titulo: "", descripcion: "", prioridad: 2 });
    setPaso(1);
  };

  if (creado) {
    return (
      <div className="msi__pagina msi__pagina--angosta">
        <PantallaExito ticket={creado} onNueva={reiniciar} />
      </div>
    );
  }

  return (
    <div className="msi__pagina msi__pagina--angosta">
      <header className="msi__titulo">
        <h1>Nueva solicitud</h1>
        <p>El equipo SGI la recibe con folio y plazo de atención.</p>
      </header>
      <Stepper paso={paso} />

      {paso === 1 && (
        <div className="msi-elegir">
          {servicios.map((s) => {
            const on = String(s.idServicio) === String(f.idServicio);
            return (
              <button
                key={s.idServicio}
                type="button"
                className={`msi-elegir__op${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => {
                  setF({ ...f, idServicio: String(s.idServicio) });
                  setPaso(2);
                }}
              >
                <span className="msi__servicio-icono">
                  <i className={`ti ${iconoServicio(s.nombre)}`} />
                </span>
                <span>
                  <strong>{s.nombre}</strong>
                  {s.descripcion && <small>{s.descripcion}</small>}
                </span>
                <span className="tag t-brand">
                  <i className="ti ti-clock" /> {slaTexto(s.slaHoras)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {paso === 2 && servicio && (
        <form
          className="pnl msi__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (validarDetalle()) setPaso(3);
          }}
        >
          <div className="msi__sla t-brand">
            <i className={`ti ${iconoServicio(servicio.nombre)}`} />
            <div>
              <b>{servicio.nombre}</b>
              <span>Atención en {slaTexto(servicio.slaHoras)}</span>
            </div>
            <button type="button" className="btn btn--fantasma btn--sm" style={{ marginLeft: "auto" }} onClick={() => setPaso(1)}>
              Cambiar
            </button>
          </div>
          <Campo etq="Título" error={errores.titulo}>
            <input className={`inp${errores.titulo ? " inp--error" : ""}`} maxLength={200} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ej. Actualizar el procedimiento de recepción de materia prima" autoFocus />
          </Campo>
          <Campo etq="Descripción" error={errores.descripcion} ayuda="Incluye código del documento, área o planta si aplica.">
            <textarea className={`inp${errores.descripcion ? " inp--error" : ""}`} rows={6} maxLength={4000} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} />
          </Campo>
          <div className="campo">
            <span className="campo__etq">Prioridad</span>
            <div className="seg" role="radiogroup" aria-label="Prioridad">
              {Object.entries(MSI_PRIORIDAD).map(([id, p]) => (
                <button key={id} type="button" role="radio" aria-checked={f.prioridad === Number(id)} className={f.prioridad === Number(id) ? "is-on" : ""} onClick={() => setF({ ...f, prioridad: Number(id) })}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="msi__form-pie">
            <button type="button" className="btn" onClick={() => setPaso(1)}>
              <i className="ti ti-arrow-left" /> Atrás
            </button>
            <button type="submit" className="btn btn--primario">
              Continuar <i className="ti ti-arrow-right" />
            </button>
          </div>
        </form>
      )}

      {paso === 3 && servicio && (
        <section className="pnl msi__form" aria-label="Confirmación">
          <h2 className="msi-resumen__titulo">Revisa tu solicitud</h2>
          <dl className="msi-resumen">
            <dt>Servicio</dt>
            <dd>{servicio.nombre}</dd>
            <dt>Título</dt>
            <dd className="strong ink">{f.titulo}</dd>
            <dt>Descripción</dt>
            <dd className="msi-resumen__texto">{f.descripcion}</dd>
            <dt>Prioridad</dt>
            <dd>
              <span className={`tag t-${MSI_PRIORIDAD[f.prioridad].tono}`}>{MSI_PRIORIDAD[f.prioridad].label}</span>
            </dd>
            <dt>Fecha límite estimada</dt>
            <dd>{limite ? fechaHora(limite) : "Sin plazo definido"}</dd>
            {servicio.responsable && (
              <>
                <dt>La recibe</dt>
                <dd>{servicio.responsable}</dd>
              </>
            )}
          </dl>
          <div className="msi__form-pie">
            <button type="button" className="btn" onClick={() => setPaso(2)} disabled={guardando}>
              <i className="ti ti-pencil" /> Editar
            </button>
            <button type="button" className="btn btn--fantasma" onClick={() => navigate("/mesa-sgi")} disabled={guardando}>
              Cancelar
            </button>
            <BotonGuardar ocupado={guardando} icono="ti-send" onClick={enviar}>
              Enviar solicitud
            </BotonGuardar>
          </div>
        </section>
      )}
    </div>
  );
}
