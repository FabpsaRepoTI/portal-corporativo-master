// pages/sit/components/Requisitoriedad.jsx
// Cumplimiento de la matriz de requisitoriedad por proveedor: barra de
// avance con color semáforo y los tipos de documento que faltan.
// Props: proveedores [{ codigoProveedor, nombreProveedor, empresa, proveedorInactivo,
//                        requisitos: [{ idTipoDoc, nombreTipo, cumple }],
//                        cumplimiento: { total, cumplidos, porcentaje } }]
import EmpresaBadge from "./EmpresaBadge";
import "./Requisitoriedad.css";

const tono = (pct) => (pct >= 80 ? "verde" : pct >= 50 ? "amarillo" : "rojo");

export default function Requisitoriedad({ proveedores }) {
  if (!proveedores?.length) return null;

  return (
    <section className="sit-card sit-req">
      <h2 className="sit-card__title">
        <i className="ti ti-list-check" /> Requisitoriedad
        <small className="sit-req__nota">Matriz de información técnica · cubierto = hay un documento de ese tipo en SharePoint</small>
      </h2>

      <div className="sit-req__lista">
        {proveedores.map((p) => {
          const { total, cumplidos, porcentaje } = p.cumplimiento;
          const faltantes = p.requisitos.filter((r) => !r.cumple);
          const t = tono(porcentaje);
          return (
            <article key={p.codigoProveedor} className="sit-req__prov">
              <header className="sit-req__head">
                <div className="sit-req__nombre">
                  <strong>{p.nombreProveedor}</strong>
                  <small>
                    {p.codigoProveedor}
                    {p.proveedorInactivo && " · inactivo en el ERP"}
                  </small>
                </div>
                <EmpresaBadge empresa={p.empresa} />
              </header>

              <div className="sit-req__avance">
                <div
                  className={`sit-req__barra sit-req__barra--${t}`}
                  role="progressbar"
                  aria-valuenow={porcentaje}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${cumplidos} de ${total} documentos requeridos`}
                >
                  <span style={{ width: `${Math.min(100, porcentaje)}%` }} />
                </div>
                <span className={`sit-req__pct sit-req__pct--${t}`}>
                  {cumplidos}/{total} ({porcentaje}%)
                </span>
              </div>

              {faltantes.length ? (
                <ul className="sit-req__faltantes" aria-label="Documentos faltantes">
                  {faltantes.map((r) => (
                    <li key={r.idTipoDoc}>
                      <i className="ti ti-circle-x" /> {r.nombreTipo}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sit-req__completo">
                  <i className="ti ti-circle-check" /> Todos los documentos requeridos están en SharePoint
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
