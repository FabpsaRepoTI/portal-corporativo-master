// pages/sit/components/SitModal.jsx
// Contenedor de modal del módulo SIT. Cierra con Esc o clic en el fondo
// (salvo mientras `bloqueado`, p. ej. durante un guardado).
// Se dibuja en <body> (portal): dentro de la página, las secciones con
// animación de entrada atrapaban el position: fixed y el modal aparecía al
// fondo de la sección en vez de centrado en la pantalla. El envoltorio
// sit-root sit-portal conserva las variables de color del módulo.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./SitModal.css";
import "../SitNube.css";

export default function SitModal({
  titulo,
  icono = "ti-file",
  subtitulo,
  ancho = 520,
  bloqueado = false,
  onClose,
  children,
  pie,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !bloqueado) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [bloqueado, onClose]);

  return createPortal(
    <div className="sit-root sit-portal sit-nube">
      <div
        className="sit-modal-overlay"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !bloqueado) onClose();
        }}
      >
        <div
          className="sit-modal"
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          style={{ maxWidth: ancho }}
        >
          <header className="sit-modal__header">
            <span className="sit-modal__icon">
              <i className={`ti ${icono}`} />
            </span>
            <div className="sit-modal__titles">
              <h2>{titulo}</h2>
              {subtitulo && <p title={subtitulo}>{subtitulo}</p>}
            </div>
            <button
              className="sit-modal__close"
              onClick={onClose}
              disabled={bloqueado}
              aria-label="Cerrar"
            >
              <i className="ti ti-x" />
            </button>
          </header>
          <div className="sit-modal__body">{children}</div>
          {pie && <footer className="sit-modal__footer">{pie}</footer>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
