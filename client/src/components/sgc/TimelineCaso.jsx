// components/sgc/TimelineCaso.jsx
// Línea de tiempo de un caso NC/AC (GET /api/sgc/caso/:tipo/:folio) y sus vínculos.
// Tonos: vencido (rojo) · proceso (amarillo) · completado (verde) · creada/accion (violeta).
// Los badges de "Conectado con" llaman onAbrir(modulo, id) para verlos en el panel lateral.
import { fechaHora } from "../../pages/sgc/sgcApi";

const TONO = { vencido: "danger", proceso: "warn", completado: "ok", creada: "brand", accion: "brand", neutral: "neutral" };

function Badge({ icono, texto, sub, onClick }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag type={onClick ? "button" : undefined} className={`tl-badge${onClick ? " is-link" : ""}`} onClick={onClick} title={sub || undefined}>
      <i className={`ti ${icono}`} />
      <span className="tl-badge__txt">{texto}</span>
      {sub && <span className="tl-badge__sub">{sub}</span>}
    </Tag>
  );
}

export default function TimelineCaso({ caso, onAbrir }) {
  const { historial = [], relacionados: rel = {} } = caso || {};
  const abrir = (modulo, id) => (onAbrir ? () => onAbrir(modulo, id) : undefined);
  const acs = rel.acs?.length ? rel.acs : rel.ac ? [rel.ac] : [];
  const hayVinculos = rel.auditoria || acs.length || rel.nc_origen || rel.proceso || rel.documentos?.length;

  return (
    <div className="tl">
      <div className="cajon__bloque">
        <h3>Conectado con</h3>
        {!hayVinculos ? (
          <p className="muted">Sin registros vinculados.</p>
        ) : (
          <div className="tl-badges">
            {rel.auditoria && <Badge icono="ti-clipboard-check" texto={rel.auditoria.folio} sub={rel.auditoria.nombre} onClick={abrir("auditoria", rel.auditoria.id)} />}
            {rel.nc_origen && <Badge icono="ti-alert-circle" texto={rel.nc_origen.folio} sub={rel.nc_origen.descripcion} onClick={abrir("nc", rel.nc_origen.id)} />}
            {acs.map((a) => <Badge key={a.id} icono="ti-circle-check" texto={a.folio} sub={a.estatusLabel || a.descripcion} onClick={abrir("ac", a.id)} />)}
            {rel.proceso && <Badge icono="ti-hierarchy-3" texto={rel.proceso.nombre} sub="Proceso" />}
            {rel.documentos?.map((d) => <Badge key={d.id} icono="ti-paperclip" texto={d.nombre} />)}
          </div>
        )}
      </div>

      <div className="cajon__bloque">
        <h3>Historial <span className="cuenta">{historial.length}</span></h3>
        {!historial.length ? (
          <p className="muted">Sin movimientos registrados.</p>
        ) : (
          <ol className="tl-lista">
            {historial.map((e, i) => (
              <li key={i} className={`tl-evento t-${TONO[e.tono] || "neutral"}`}>
                <span className="tl-evento__dot" aria-hidden="true" />
                <div className="tl-evento__cuerpo">
                  <b>{e.evento}</b>
                  {e.detalle && <p>{e.detalle}</p>}
                  <small>{[e.usuario, e.fecha ? fechaHora(e.fecha) : "Hoy"].filter(Boolean).join(" · ")}</small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
