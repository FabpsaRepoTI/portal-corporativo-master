import operationIcon from "../../../assets/mesa-operacion-ti.svg";
import serviceAtlas from "../../../assets/mesa-servicios-atlas.png";
import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";
import {
  SERVICIOS_GRID,
  INCIDENTES_CHIPS,
} from "../../../data/mesaDeServicioData";
import robot from "../../../assets/fabi.png";
import MesaAsistente from "./MesaAsistente";
import MesaRobotSaludo from "./MesaRobotSaludo";
import CommonServiceArt from "./CommonServiceArt";
import EncuestaMesaServicio from "./EncuestaMesaServicio";
import { getEstadoEncuesta } from "../../../services/encuestaMesaServicio";
import "./MesaUsuario.css";
const chips = [
  ["Laptop", "Monitor", "Teclado", "Más…"],
  ["Office 365", "Teams", "Multivisión", "Más…"],
  ["Correo", "Red", "Sistemas", "Más…"],
  ["Internet", "Impresoras", "Telefonía", "Más…"],
  ["Nuevo desarrollo", "Mejora", "Soporte"],
  ["Sitios web", "Archivos", "Navegación"],
];
const descriptions = [
  "Solicita equipo, reporta fallas o problemas con tus dispositivos.",
  "Instalación, configuración o acceso a una aplicación puntual.",
  "Altas, bajas, modificaciones de usuario o problemas de acceso.",
  "Asesoría en el uso de una app, cambios de precios, ingreso de mercancía, listas de correo y otros trámites.",
  "Solicitudes de nuevos desarrollos o mejoras a sistemas existentes.",
  "Desbloqueo de sitios, revisión de archivos o permisos de navegación.",
];
const common = [
  ["Office 365", "office365", "inc-office365"],
  ["Teams", "teams", "inc-correo"],
  ["Impresoras", "printer", "inc-impresoras"],
  ["Internet / Red", "network", "inc-red"],
  ["Telefonía", "phone", "inc-telefonia"],
  ["Multivisión", "chart", "inc-erp"],
  ["Correo", "mail", "inc-correo"],
  ["Antivirus", "shield", "inc-seguridad"],
];
function ServiceArt({ index }) {
  return (
    <div
      className={"mesa-art mesa-art-" + index}
      style={{ "--mesa-art-image": `url(${serviceAtlas})` }}
      aria-hidden="true"
    />
  );
}
export default function MesaDeServicioPage() {
  const navigate = useNavigate(),
    { user } = useContext(AuthContext);
  const [incident, setIncident] = useState(false),
    [bot, setBot] = useState(null),
    [query, setQuery] = useState(""),
    [encuesta, setEncuesta] = useState(false);
  const systems = ["SISTEMAS", "SYSTEMS"].includes(
    user?.area?.trim().toUpperCase(),
  );
  const openBot = (text = "") => setBot({ initial: text });
  // Encuesta: si ya respondió no vuelve a aparecer; "Ahora no" la pospone 7 días.
  const encuestaKey = `mesa_encuesta_${user?.login || "anon"}`;
  const leerEncuesta = () => {
    try {
      return JSON.parse(localStorage.getItem(encuestaKey)) || {};
    } catch {
      return {};
    }
  };
  const guardarEncuesta = (v) => {
    try {
      localStorage.setItem(encuestaKey, JSON.stringify(v));
    } catch {}
  };
  const posponerEncuesta = () => {
    guardarEncuesta({ posponerHasta: Date.now() + 7 * 24 * 60 * 60 * 1000 });
    setEncuesta(false);
  };
  const encuestaRespondida = () => {
    guardarEncuesta({ respondida: true });
    setEncuesta(false);
  };
  useEffect(() => {
    if (systems) return;
    const local = leerEncuesta();
    if (local.respondida || (local.posponerHasta && local.posponerHasta > Date.now())) return;
    let vivo = true;
    getEstadoEncuesta()
      .then((r) => {
        if (vivo && !r.respondida) setEncuesta(true);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [systems, encuestaKey]);
  return (
    <div
      className={
        "mesa-user " + (systems ? "mesa-user-ti" : "mesa-user-general")
      }
    >
      <div className="mesa-topline">
        <button onClick={() => navigate("/")}>← Volver al inicio</button>
      </div>
      <section className="mesa-welcome">
        <div className="mesa-greeting">
          <span>← MESA DE SERVICIO</span>
          <h1>
            Hola, <em>{user?.name?.split(" ")[0] || "Usuario"}</em>
          </h1>
          <p>¿Cómo podemos ayudarte hoy?</p>
        </div>
        <div className="mesa-helper">
          <MesaRobotSaludo robot={robot} />
          <div className="mesa-helper-search">
            <b>💡 También puedes buscar</b>
            <p>
              Escribe lo que necesitas y te sugerimos
              <br />
              la categoría más adecuada.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                openBot(query);
              }}
            >
              <i className="ti ti-search" aria-hidden="true" />
              <input
                aria-label="Buscar ayuda"
                placeholder="Ej. impresora, correo, acceso, laptop…"
                value={query}
                maxLength={1500}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button aria-label="Buscar con asistente">→</button>
            </form>
          </div>
        </div>
      </section>
      <section className="mesa-actions">
        <article className="mesa-action mesa-action-incident">
          <span className="mesa-recommended">RECOMENDADO</span>
          <div className="mesa-action-icon">
            <i className="ti ti-bolt" />
          </div>
          <div>
            <h2>Reportar un incidente o falla</h2>
            <p>
              ¿Tienes un problema con algún servicio o herramienta? Repórtalo y
              nuestro equipo de TI te ayudará.
            </p>
            <button
              className="mesa-primary"
              aria-expanded={incident}
              onClick={() => setIncident((v) => !v)}
            >
              ⊕ Nueva incidencia <span>→</span>
            </button>
          </div>
          <button className="mesa-more" onClick={() => setIncident((v) => !v)}>
            ⓘ Más información
          </button>
        </article>
        {systems && (
          <article className="mesa-action mesa-action-admin">
            <div>
              <h2>Mesa de Servicio TI</h2>
              <p>
                Gestiona tickets, solicitudes de hardware y desarrollos desde
                una sola vista.
              </p>
            </div>
            <button
              className="mesa-outline"
              onClick={() => navigate("/mesa-de-servicio/admin")}
            >
              Abrir Mesa de Servicio TI <span>→</span>
            </button>
          </article>
        )}
        <article className="mesa-action">
          <div>
            <h2>Mis solicitudes</h2>
            <p>
              Consulta el estado, historial y comentarios de tus solicitudes.
            </p>
          </div>
          <button
            className="mesa-outline"
            onClick={() => navigate("/mesa-de-servicio/mis-solicitudes")}
          >
            Ver mis solicitudes <span>→</span>
          </button>
        </article>
      </section>
      {incident && (
        <section
          className="mesa-incident-options"
          aria-label="Tipos de incidente"
        >
          <h2>¿Qué dejó de funcionar?</h2>
          <div>
            {INCIDENTES_CHIPS.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate("/mesa-de-servicio/solicitud/" + c.id)}
              >
                {c.label} →
              </button>
            ))}
          </div>
        </section>
      )}
      <header className="mesa-section-title">
        <h2>Servicios disponibles</h2>
        <p>Selecciona la categoría que mejor describa tu necesidad.</p>
      </header>
      <section className="mesa-services">
        {SERVICIOS_GRID.map((s, i) => (
          <article
            key={s.to}
            className={"mesa-service mesa-service-" + i}
            onClick={() => navigate(s.to)}
            style={{ cursor: "pointer" }}
          >
            <ServiceArt index={i} />
            <button className="mesa-service-link">
              <h3>{s.nombre}</h3>
              <p>{descriptions[i]}</p>
              <span className="mesa-service-arrow">›</span>
            </button>
            <div className="mesa-chips" aria-hidden="true">
              {chips[i].map((label) => (
                <button
                  key={label}
                  type="button"
                  tabIndex={-1}
                  style={{ pointerEvents: "none" }}
                >
                  {label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="mesa-help-row">
        <article>
          <h2>¿No encuentras la opción?</h2>
          <p>
            Cuéntanos brevemente tu necesidad y te ayudamos a identificar la
            categoría correcta. Nuestro asistente te hará algunas preguntas.
          </p>
          <button className="mesa-outline" onClick={() => openBot()}>
            <i className="ti ti-headset" /> Buscar con asistente
          </button>
          <img src={robot} alt="" />
        </article>
        {systems && (
          <button
            className="mesa-operation-card"
            onClick={() => navigate("/visor-ti")}
          >
            <img src={operationIcon} alt="" />
            <span>
              <strong>Panel de Operación TI</strong>
              <span>Monitoreo y estado de incidencias</span>
            </span>
            <b aria-hidden="true">›</b>
          </button>
        )}
      </section>
      <header className="mesa-section-title">
        <h2>Servicios más solicitados</h2>
        <p>Accesos directos a los temas más comunes.</p>
      </header>
      <section className="mesa-common">
        {common.map(([name, art, slug], i) => (
          <button
            key={name}
            onClick={() => navigate("/mesa-de-servicio/solicitud/" + slug)}
            style={{
              "--common-color": [
                "#d65b21",
                "#6858c8",
                "#2877c9",
                "#168a72",
                "#ba4e85",
                "#178c9a",
                "#2872bd",
                "#19866d",
              ][i],
            }}
          >
            <span className="mesa-common-art-wrap">
              <CommonServiceArt type={art} id={i} />
            </span>
            <span>{name}</span>
          </button>
        ))}
      </section>
      <footer className="mesa-footer">
        <span>◷ Horario de atención: Lun–Vie 6:00–18:00 | Sáb 7:00–13:00</span>
        <span>▤ Consulta el seguimiento desde el portal</span>
        {user?.login === "JMRAMIREZ" && (
          <button
            className="mesa-footer-admin-link"
            onClick={() => navigate("/mesa-de-servicio/encuesta-resultados")}
          >
            ★ Resultados de la encuesta
          </button>
        )}
      </footer>
      {bot && (
        <MesaAsistente initial={bot.initial} onClose={() => setBot(null)} />
      )}
      {encuesta && (
        <EncuestaMesaServicio
          onClose={posponerEncuesta}
          onRespondida={encuestaRespondida}
        />
      )}
    </div>
  );
}
