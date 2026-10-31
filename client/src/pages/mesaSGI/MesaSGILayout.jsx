// pages/mesaSGI/MesaSGILayout.jsx
// Mesa de Servicio SGI: solicitudes de cualquier colaborador al departamento
// SGI (sin correo). Vive dentro del layout del portal, pero usa el sistema de
// diseño del SGI (sgc.css) en modo embebido con el tema del portal.
// Por el contexto del Outlet: { servicios, esSGI, login, recargarServicios }.
import { useContext, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { ErrorCarga, Skel, ToastProvider } from "../sgc/components/ui";
import { sgcRespuesta, useSgc, MSI_ESTATUS } from "../sgc/sgcApi";
import "../sgc/sgc.css";

const FUENTE_ID = "sgc-fuente";
function cargarFuente() {
  if (document.getElementById(FUENTE_ID)) return;
  const link = document.createElement("link");
  link.id = FUENTE_ID;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap";
  document.head.appendChild(link);
}

/** Plazo contra el SLA: «2 d», «5 h», «vencido hace 3 h»; final → estatus. */
export function SLA({ ticket }) {
  if ([4, 5].includes(ticket.idEstatus)) {
    const e = MSI_ESTATUS[ticket.idEstatus];
    if (ticket.idEstatus === 4 && ticket.cumplioSLA != null) {
      return <span className={`tag t-${ticket.cumplioSLA ? "ok" : "danger"}`}>{ticket.cumplioSLA ? "En SLA" : "Fuera de SLA"}</span>;
    }
    return <span className={`tag t-${e.tono}`}>{e.label}</span>;
  }
  const h = ticket.horasRestantes;
  if (h == null) return <span className="tag t-neutral">Sin SLA</span>;
  if (h < 0) {
    const v = -h;
    return <span className="tag t-danger num">Vencido {v >= 24 ? `${Math.floor(v / 24)} d` : `${v} h`}</span>;
  }
  if (h < 24) return <span className="tag t-warn num">{h} h</span>;
  return <span className="tag t-ok num">{Math.floor(h / 24)} d</span>;
}

export function EstatusMSI({ id }) {
  const e = MSI_ESTATUS[id];
  return <span className={`tag t-${e.tono}`}>{e.label}</span>;
}

const ICONOS_SERVICIO = [
  [/procedimiento|alta/i, "ti-file-plus"],
  [/documento|actualiz/i, "ti-file-pencil"],
  [/auditor/i, "ti-clipboard-check"],
  [/capacita|norma/i, "ti-school"],
  [/consulta/i, "ti-message-question"],
];
export const iconoServicio = (nombre) => (ICONOS_SERVICIO.find(([re]) => re.test(nombre)) || [null, "ti-lifebuoy"])[1];

export function slaTexto(horas) {
  if (horas == null) return "sin plazo definido";
  if (horas < 24) return `${horas} h`;
  return horas % 24 === 0 ? `${horas / 24} ${horas / 24 === 1 ? "día" : "días"}` : `${horas} h`;
}

export default function MesaSGILayout() {
  const { user } = useContext(AuthContext);
  // Respeta el tema elegido en el portal (claro / oscuro)
  const { theme } = useTheme() || {};
  const tema = theme === "dark" ? "oscuro" : "claro";
  const { data, error, cargando, recargar } = useSgc(cargarServicios, []);

  useEffect(() => {
    cargarFuente();
  }, []);

  return (
    <div className="sgc-app sgc-app--embebido" data-tema={tema}>
      <ToastProvider>
        <div className="msi">
          <header className="msi__top">
            <div className="msi__marca">
              <span className="sg-marca__sello" aria-hidden="true">
                SGI
              </span>
              <div>
                <strong>Mesa de Servicio SGI</strong>
                <span>Solicitudes al departamento de Sistemas de Gestión</span>
              </div>
            </div>
            <nav className="msi__nav" aria-label="Mesa SGI">
              <NavLink end to="/mesa-sgi">
                <i className="ti ti-layout-grid" /> Servicios
              </NavLink>
              <NavLink to="/mesa-sgi/nueva">
                <i className="ti ti-plus" /> Nueva solicitud
              </NavLink>
              <NavLink to="/mesa-sgi/mis-tickets">
                <i className="ti ti-inbox" /> Mis solicitudes
              </NavLink>
              {data?.esSGI && (
                <NavLink to="/mesa-sgi/admin">
                  <i className="ti ti-adjustments" /> Gestión SGI
                </NavLink>
              )}
            </nav>
          </header>
          {error ? (
            <ErrorCarga error={error} onReintentar={recargar} />
          ) : cargando && !data ? (
            <div className="pnl">
              <Skel filas={6} />
            </div>
          ) : (
            <Outlet context={{ servicios: data.servicios, esSGI: data.esSGI, rol: data.idRol, login: user?.login, recargarServicios: recargar }} />
          )}
        </div>
      </ToastProvider>
    </div>
  );
}

// /servicios devuelve además esSGI (fuera de `data`)
async function cargarServicios() {
  const r = await sgcRespuesta("/mesa-sgi/servicios");
  return { servicios: r.data, esSGI: !!r.esSGI, idRol: r.idRol || null };
}
