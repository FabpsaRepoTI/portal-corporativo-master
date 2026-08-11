import { useNavigate } from "react-router-dom";
//import { IconBellOff } from '@tabler/icons-react';

const ICONOS_TABLER = {
  "circle-plus": "＋", // se reemplazan con Tabler abajo
};

export default function NotificationPanel({
  grupos,
  marcarLeida,
  marcarTodas,
  eliminar,
  tiempoRelativo,
  onClose,
}) {
  const navigate = useNavigate();

  const handleClick = (n) => {
    if (!n.leida) marcarLeida(n.idNotificacion);
    onClose();
    navigate(n.urlDestino);
  };

  const totalNotifs = Object.values(grupos).flat().length;

  return (
    <div className="nt-panel">
      {/* Header */}
      <div className="nt-header">
        <span className="nt-title">Notificaciones</span>
        <div className="nt-header-actions">
          <button className="nt-btn-text" onClick={marcarTodas}>
            Marcar todas como leídas
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="nt-scroll">
        {totalNotifs === 0 ? (
          <div className="nt-empty">
            <i
              className="ti ti-bell-off"
              style={{ fontSize: 40 }}
              aria-hidden="true"
            />
            <p>Sin notificaciones</p>
          </div>
        ) : (
          Object.entries(grupos).map(([grupo, items]) =>
            items.length === 0 ? null : (
              <div key={grupo}>
                <div className="nt-group-label">{grupo}</div>
                {items.map((n) => (
                  <div
                    key={n.idNotificacion}
                    className={`nt-item${!n.leida ? " nt-item--unread" : ""}`}
                    onClick={() => handleClick(n)}
                  >
                    {!n.leida && <span className="nt-unread-dot" />}

                    {/* Ícono */}
                    <div
                      className="nt-icon-wrap"
                      style={{ background: `${n.colorHex}22` }}
                    >
                      <i
                        className={`ti ti-${n.icono}`}
                        style={{ color: n.colorHex, fontSize: 16 }}
                        aria-hidden="true"
                      />
                    </div>

                    {/* Contenido */}
                    <div className="nt-content">
                      <div
                        className={`nt-item-title${n.leida ? " nt-item-title--read" : ""}`}
                      >
                        {n.titulo}
                      </div>
                      <div className="nt-item-desc">{n.descripcion}</div>
                      <div className="nt-item-meta">
                        {n.idSolicitud && (
                          <span className="nt-folio">#{n.idSolicitud}</span>
                        )}
                        <span className="nt-time">
                          {tiempoRelativo(n.fechaCreacion)}
                        </span>
                      </div>
                    </div>

                    {/* Eliminar */}
                    <button
                      className="nt-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        eliminar(n.idNotificacion);
                      }}
                      title="Eliminar"
                    >
                      <i className="ti ti-x" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
