// pages/mesaSGI/MisTicketsSGI.jsx
// Mis solicitudes a SGI: abiertas primero, con el plazo restante contra el SLA.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorCarga, Skel, Vacio } from "../sgc/components/ui";
import { fechaCorta, hace, sgcRespuesta, useSgc, MSI_PRIORIDAD } from "../sgc/sgcApi";
import { EstatusMSI, SLA } from "./MesaSGILayout";

const VISTAS = [
  { id: "abiertas", label: "Abiertas", filtro: (t) => [1, 2, 3].includes(t.idEstatus) },
  { id: "concluidas", label: "Concluidas", filtro: (t) => [4, 5].includes(t.idEstatus) },
  { id: "todas", label: "Todas", filtro: () => true },
];

export default function MisTicketsSGI() {
  const navigate = useNavigate();
  const [vista, setVista] = useState("abiertas");
  const { data, error, cargando, recargar } = useSgc(() => sgcRespuesta("/mesa-sgi/mis-tickets"), []);
  const tickets = data?.data || [];
  const v = VISTAS.find((x) => x.id === vista);
  const lista = tickets.filter(v.filtro);

  return (
    <div className="msi__pagina">
      <header className="msi__titulo msi__titulo--fila">
        <div>
          <h1>Mis solicitudes</h1>
          <p>
            {data ? (
              <>
                {data.resumen.abiertos} abiertas{data.resumen.vencidos ? <span className="t-danger tinta"> · {data.resumen.vencidos} fuera de plazo</span> : null} · {data.resumen.resueltos} resueltas
              </>
            ) : (
              "Cargando…"
            )}
          </p>
        </div>
        <Link to="/mesa-sgi/nueva" className="btn btn--primario">
          <i className="ti ti-plus" /> Nueva solicitud
        </Link>
      </header>

      <div className="seg seg--chico" role="radiogroup" aria-label="Vista" style={{ marginBottom: 12 }}>
        {VISTAS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={vista === x.id} className={vista === x.id ? "is-on" : ""} onClick={() => setVista(x.id)}>
            {x.label} <span className="num muted">{tickets.filter(x.filtro).length}</span>
          </button>
        ))}
      </div>

      {error ? (
        <ErrorCarga error={error} onReintentar={recargar} />
      ) : cargando && !data ? (
        <div className="pnl">
          <Skel filas={6} />
        </div>
      ) : !lista.length ? (
        <div className="pnl">
          <Vacio
            icono="ti-inbox"
            titulo={tickets.length ? `Sin solicitudes ${v.label.toLowerCase()}` : "Aún no has hecho solicitudes a SGI"}
            texto={tickets.length ? "Cambia de vista para ver las demás." : "Elige un servicio del catálogo para empezar."}
            accion={
              !tickets.length && (
                <Link to="/mesa-sgi" className="btn btn--primario">
                  Ver servicios
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="pnl">
          <div className="tabla-wrap">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Solicitud</th>
                  <th>Estatus</th>
                  <th>Plazo</th>
                  <th>Atiende</th>
                  <th className="der">Actividad</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.idTicket} className="link" tabIndex={0} onClick={() => navigate(`/mesa-sgi/ticket/${t.idTicket}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/mesa-sgi/ticket/${t.idTicket}`)}>
                    <td className="mono strong">{t.folio}</td>
                    <td>
                      <span className="strong ink">{t.titulo}</span>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {t.servicio}
                        {t.prioridad === 3 && <span className={`tag t-${MSI_PRIORIDAD[3].tono}`} style={{ marginLeft: 6 }}>Alta</span>}
                      </div>
                    </td>
                    <td>
                      <EstatusMSI id={t.idEstatus} />
                    </td>
                    <td>
                      <SLA ticket={t} />
                      {t.fechaLimite && [1, 2, 3].includes(t.idEstatus) && (
                        <div className="muted" style={{ fontSize: 11.5 }}>
                          {fechaCorta(new Date(t.fechaLimite).toISOString())}
                        </div>
                      )}
                    </td>
                    <td className="muted">{t.asignado || "Por asignar"}</td>
                    <td className="der muted">
                      {t.comentarios > 0 && (
                        <span title="Comentarios" style={{ marginRight: 8 }}>
                          <i className="ti ti-message" /> {t.comentarios}
                        </span>
                      )}
                      {hace(t.fechaCreacion)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
