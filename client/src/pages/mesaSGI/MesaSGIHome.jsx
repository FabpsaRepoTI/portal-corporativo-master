// pages/mesaSGI/MesaSGIHome.jsx
// Catálogo de servicios del departamento SGI en tarjetas. Cada tarjeta abre
// la solicitud con el servicio ya elegido. Arriba, el estado de mis
// solicitudes abiertas.
import { Link, useOutletContext } from "react-router-dom";
import { Vacio } from "../sgc/components/ui";
import { sgcRespuesta, useSgc } from "../sgc/sgcApi";
import { iconoServicio, slaTexto } from "./MesaSGILayout";
import AdminSGI from "./AdminSGI";

export default function MesaSGIHome() {
  const { servicios, esSGI } = useOutletContext();

  // El equipo SGI ve AdminSGI directamente, sin redirigir la URL
  if (esSGI) return <AdminSGI />;
  const { data: resumen } = useSgc(() => sgcRespuesta("/mesa-sgi/mis-tickets").then((r) => r.resumen), []);

  return (
    <div className="msi__pagina">
      <section className="msi__intro">
        <div>
          <h1>¿Qué necesitas del departamento SGI?</h1>
          <p>Elige un servicio. Tu solicitud queda con folio, plazo de atención y seguimiento en un solo lugar.</p>
        </div>
        {resumen && (resumen.abiertos > 0 || resumen.resueltos > 0) && (
          <Link to="/mesa-sgi/mis-tickets" className="msi__resumen">
            <span>
              <b className="num">{resumen.abiertos}</b> abiertas
            </span>
            {resumen.vencidos > 0 && (
              <span className="t-danger tinta">
                <b className="num">{resumen.vencidos}</b> fuera de plazo
              </span>
            )}
            <span>
              <b className="num">{resumen.resueltos}</b> resueltas
            </span>
            <i className="ti ti-arrow-right" />
          </Link>
        )}
      </section>

      {!servicios.length ? (
        <div className="pnl">
          <Vacio icono="ti-lifebuoy-off" titulo="No hay servicios disponibles" texto="El departamento SGI aún no publica su catálogo de servicios." />
        </div>
      ) : (
        <div className="msi__servicios">
          {servicios.map((s) => (
            <Link key={s.idServicio} to={`/mesa-sgi/nueva?servicio=${s.idServicio}`} className="msi__servicio">
              <span className="msi__servicio-icono">
                <i className={`ti ${iconoServicio(s.nombre)}`} />
              </span>
              <strong>{s.nombre}</strong>
              {s.descripcion && <p>{s.descripcion}</p>}
              <span className="msi__servicio-pie">
                <span className="tag t-brand">
                  <i className="ti ti-clock" /> Atención en {slaTexto(s.slaHoras)}
                </span>
                <span className="msi__servicio-ir">
                  Solicitar <i className="ti ti-arrow-right" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
