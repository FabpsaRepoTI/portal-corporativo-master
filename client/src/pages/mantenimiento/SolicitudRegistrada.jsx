import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./SolicitudRegistrada.css";

const token = () => localStorage.getItem("fabpsa_token");

export default function SolicitudRegistrada() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [folio, setFolio] = useState(location.state?.folio || "");
  const [cargando, setCargando] = useState(!location.state?.folio);

  useEffect(() => {
    if (folio) return undefined;
    let activo = true;
    fetch(`/api/mantenimiento/solicitudes/${id}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then((respuesta) => {
        if (!respuesta.ok) throw new Error("No fue posible consultar la solicitud");
        return respuesta.json();
      })
      .then((solicitud) => activo && setFolio(solicitud.folio || ""))
      .catch(() => activo && setFolio(`Solicitud #${id}`))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [folio, id]);

  return (
    <main className="mnt-success-page">
      <section className="mnt-success-card">
        <span className="mnt-success-card__icon">
          <i className="ti ti-circle-check" />
        </span>
        <span className="mnt-success-card__eyebrow">Solicitud registrada</span>
        <h1>¡Todo listo!</h1>
        <p>
          Tu solicitud fue registrada correctamente con el folio
          <strong>{cargando ? " Consultando…" : ` ${folio}`}</strong>.
        </p>
        <p className="mnt-success-card__hint">
          El equipo de Mantenimiento revisará la información y se comunicará
          contigo para dar seguimiento.
        </p>
        <div className="mnt-success-card__actions">
          <button type="button" className="secondary" onClick={() => navigate("/mantenimiento")}>
            <i className="ti ti-list" /> Ir a mis solicitudes
          </button>
          <button type="button" className="primary" onClick={() => navigate("/mantenimiento/nueva")}>
            <i className="ti ti-plus" /> Agregar otra solicitud
          </button>
        </div>
      </section>
    </main>
  );
}
