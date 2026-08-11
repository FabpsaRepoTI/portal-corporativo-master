import { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthContext } from "../../../context/AuthContext";

const API = "";
function authH() {
  const t = localStorage.getItem("fabpsa_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}
import "./MisDesarrollosPage.css";
import "./MisDesarrollosPage.mobile.css";

// ── Helpers ──────────────────────────────────────────────────────────────────

const STEPPER_STEPS = [
  { key: "solicitud", label: "Solicitud", ids: [1] },
  { key: "analisis", label: "Análisis", ids: [2] },
  { key: "asignacion", label: "Asignación", ids: [3] },
  { key: "desarrollo", label: "Desarrollo", ids: [4] },
  { key: "revision", label: "Revisión", ids: [5] },
  { key: "concluido", label: "Concluido", ids: [6, 7] },
];

function stepIndex(idEstatus) {
  const idx = STEPPER_STEPS.findIndex((s) => s.ids.includes(idEstatus));
  return idx === -1 ? 0 : idx;
}

function fmtFecha(iso) {
  if (!iso) return null;
  return new Date(iso)
    .toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}

function diasRestantes(iso) {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const comp = new Date(iso);
  comp.setHours(0, 0, 0, 0);
  return Math.round((comp - hoy) / 86400000);
}

function TipoIcon({ tipo }) {
  // ND = nuevo desarrollo, MA = mejora
  if (!tipo)
    return (
      <span className="md-type-icon md-type-icon--nd">
        <i className="ti ti-code" />
      </span>
    );
  if (
    tipo.toLowerCase().includes("mejora") ||
    tipo.toLowerCase().startsWith("ma")
  )
    return (
      <span className="md-type-icon md-type-icon--ma">
        <i className="ti ti-trending-up" />
      </span>
    );
  return (
    <span className="md-type-icon md-type-icon--nd">
      <i className="ti ti-code" />
    </span>
  );
}

function EntregaChip({ fechaCompromiso, fechaConcluido, evaluada }) {
  if (fechaConcluido) {
    return (
      <div className="md-entrega">
        <span className="md-entrega__label">Entregado el</span>
        <span className="md-entrega__fecha">{fmtFecha(fechaConcluido)}</span>
        {evaluada ? (
          <span className="md-badge md-badge--eval-ok">
            <i className="ti ti-circle-check" /> Evaluación completada
          </span>
        ) : (
          <span className="md-badge md-badge--eval-pend">
            <i className="ti ti-clock" /> Puedes evaluar
          </span>
        )}
      </div>
    );
  }
  if (!fechaCompromiso) {
    return (
      <div className="md-entrega">
        <span className="md-entrega__label">Entrega estimada</span>
        <span className="md-entrega__fecha md-entrega__fecha--nd">
          Sin fecha definida
        </span>
      </div>
    );
  }
  const dias = diasRestantes(fechaCompromiso);
  let diasClass = "md-entrega__dias";
  let diasText = `Faltan ${dias} día${dias !== 1 ? "s" : ""}`;
  if (dias < 0) {
    diasClass += " md-entrega__dias--vencida";
    diasText = "Fecha vencida";
  } else if (dias <= 2) diasClass += " md-entrega__dias--urgente";
  return (
    <div className="md-entrega">
      <span className="md-entrega__label">Entrega estimada</span>
      <span className="md-entrega__fecha">
        <i className="ti ti-calendar" /> {fmtFecha(fechaCompromiso)}
      </span>
      <span className={diasClass}>
        {dias < 0 || dias <= 2 ? <i className="ti ti-alert-triangle" /> : null}
        {diasText}
      </span>
    </div>
  );
}

function Stepper({ idEstatus }) {
  const current = stepIndex(idEstatus);
  return (
    <div className="md-stepper">
      {STEPPER_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const pending = i > current;
        return (
          <div key={step.key} className="md-stepper__step">
            {i > 0 && (
              <div
                className={`md-stepper__line ${done || active ? "md-stepper__line--done" : ""}`}
              />
            )}
            <div
              className={`md-stepper__dot ${done ? "md-stepper__dot--done" : ""} ${active ? "md-stepper__dot--active" : ""} ${pending ? "md-stepper__dot--pending" : ""}`}
            >
              {done ? <i className="ti ti-check" /> : null}
            </div>
            <span
              className={`md-stepper__label ${active ? "md-stepper__label--active" : ""}`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function KpiStrip({ data }) {
  const total = data.length;
  const proceso = data.filter((d) => d.estatus.id <= 5).length;
  const concluidas = data.filter(
    (d) => d.estatus.id === 6 || d.estatus.id === 7,
  ).length;
  const accion = data.filter(
    (d) => (d.estatus.id === 6 || d.estatus.id === 7) && !d.evaluada,
  ).length;
  const proxima = data
    .filter((d) => d.fechaCompromiso && d.estatus.id <= 5)
    .sort(
      (a, b) => new Date(a.fechaCompromiso) - new Date(b.fechaCompromiso),
    )[0];

  return (
    <div className="md-kpi-strip">
      <div className="md-kpi">
        <i className="ti ti-layout-grid md-kpi__icon md-kpi__icon--total" />
        <div>
          <span className="md-kpi__num">{total}</span>
          <span className="md-kpi__lbl">Total</span>
        </div>
      </div>
      <div className="md-kpi">
        <i className="ti ti-code md-kpi__icon md-kpi__icon--proceso" />
        <div>
          <span className="md-kpi__num">{proceso}</span>
          <span className="md-kpi__lbl">En proceso</span>
        </div>
      </div>
      <div className="md-kpi">
        <i className="ti ti-circle-check md-kpi__icon md-kpi__icon--concluidas" />
        <div>
          <span className="md-kpi__num">{concluidas}</span>
          <span className="md-kpi__lbl">Concluidas</span>
        </div>
      </div>
      {accion > 0 && (
        <div className="md-kpi md-kpi--accion">
          <i className="ti ti-alert-circle md-kpi__icon md-kpi__icon--accion" />
          <div>
            <span className="md-kpi__num">{accion}</span>
            <span className="md-kpi__lbl">Por evaluar</span>
          </div>
        </div>
      )}
      {proxima && (
        <div className="md-kpi md-kpi--proxima">
          <i className="ti ti-calendar-due md-kpi__icon md-kpi__icon--proxima" />
          <div>
            <span className="md-kpi__num">
              {fmtFecha(proxima.fechaCompromiso)}
            </span>
            <span className="md-kpi__lbl">Próxima entrega</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tarjeta de solicitud ──────────────────────────────────────────────────────

function SolicitudCard({ sol, onClick }) {
  const needsAction =
    (sol.estatus.id === 6 || sol.estatus.id === 7) && !sol.evaluada;

  return (
    <article
      className={`md-card ${needsAction ? "md-card--accion" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      {/* Columna izquierda: icono */}
      <div className="md-card__icon-col">
        <TipoIcon tipo={sol.tipo} />
      </div>

      {/* Columna central: info + stepper */}
      <div className="md-card__body">
        <div className="md-card__meta">
          <span className="md-card__folio">{sol.folio}</span>
          <span className="md-card__tipo">{sol.tipo || "Solicitud"}</span>
        </div>
        <h3 className="md-card__titulo">{sol.titulo}</h3>
        {sol.sistema && (
          <p className="md-card__sistema">
            <i className="ti ti-database" /> {sol.sistema}
          </p>
        )}
        <Stepper idEstatus={sol.estatus.id} />
      </div>

      {/* Columna derecha: estatus + entrega + responsable */}
      <div className="md-card__aside">
        <span
          className="md-estatus-pill"
          style={{ color: sol.estatus.color, background: sol.estatus.bg }}
        >
          {sol.estatus.nombre}
        </span>

        <EntregaChip
          fechaCompromiso={sol.fechaCompromiso}
          fechaConcluido={sol.fechaConcluido}
          evaluada={sol.evaluada}
        />

        {sol.responsable && (
          <div className="md-card__responsable">
            <span className="md-card__responsable-label">Responsable TI</span>
            <span className="md-card__responsable-name">
              <i className="ti ti-user-circle" /> {sol.responsable}
            </span>
          </div>
        )}

        <button className="md-btn-ver">
          Ver detalle <i className="ti ti-chevron-right" />
        </button>
      </div>

      {needsAction && (
        <div className="md-card__action-banner">
          <i className="ti ti-star" /> Puedes evaluar este desarrollo
        </div>
      )}
    </article>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MisDesarrollosPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [filtroEstatus, setFiltroEstatus] = useState(
    searchParams.get("filtro") || "todas",
  );
  const [search, setSearch] = useState("");
  const [orden, setOrden] = useState("recientes");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filtroEstatus !== "todas") params.set("estatus", filtroEstatus);
      if (search.trim()) params.set("search", search.trim());
      if (orden !== "recientes") params.set("orden", orden);

      const res = await fetch(
        `${API}/api/solicitudes-desarrollo/mis-solicitudes?${params}`,
        { headers: authH() },
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.message);
      setSolicitudes(json.data);
    } catch (e) {
      setError(e.message || "Error al cargar solicitudes");
    } finally {
      setLoading(false);
    }
  }, [filtroEstatus, search, orden]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Sincronizar filtro con URL
  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    if (filtroEstatus === "todas") p.delete("filtro");
    else p.set("filtro", filtroEstatus);
    setSearchParams(p, { replace: true });
  }, [filtroEstatus]);

  const abrirDetalle = (sol) => {
    navigate(`/mesa-de-servicio/mis-desarrollos/${sol.idSolicitud}`);
  };

  // Conteos para tabs
  const counts = {
    todas: solicitudes.length,
    proceso: solicitudes.filter((s) => s.estatus.id <= 5).length,
    concluidas: solicitudes.filter((s) => s.estatus.id >= 6).length,
    accion: solicitudes.filter((s) => s.estatus.id >= 6 && !s.evaluada).length,
  };

  // Filtrado local adicional sobre los datos ya filtrados del server
  // (el server filtra por estatus/search; aquí solo re-aplicamos si cambia search en tiempo real)
  const FILTROS = [
    { key: "todas", label: "Todas" },
    { key: "proceso", label: "En proceso" },
    { key: "concluidas", label: "Concluidas" },
    { key: "accion", label: "Por evaluar" },
  ];

  return (
    <div className="md-root">
      {/* ── Header ── */}
      <div className="md-header">
        <div className="md-header__left">
          <div className="md-header__icon-wrap">
            <i className="ti ti-code" />
          </div>
          <div>
            <h1 className="md-header__title">Mis solicitudes de desarrollo</h1>
            <p className="md-header__sub">
              Consulta el estado y avance de las solicitudes que has creado.
            </p>
          </div>
        </div>
        <button
          className="md-btn-nueva"
          onClick={() => navigate("/mesa-de-servicio/desarrollo/nueva")}
        >
          <i className="ti ti-plus" /> Nueva solicitud
        </button>
      </div>

      {/* ── KPI Strip ── */}
      {!loading && !error && solicitudes.length > 0 && (
        <KpiStrip data={solicitudes} />
      )}

      {/* ── Toolbar ── */}
      <div className="md-toolbar">
        {/* Filtros tab */}
        <div className="md-toolbar__tabs">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              className={`md-tab ${filtroEstatus === f.key ? "md-tab--active" : ""}`}
              onClick={() => setFiltroEstatus(f.key)}
            >
              {f.label}
              {counts[f.key] > 0 && (
                <span className="md-tab__count">{counts[f.key]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Controles derecha */}
        <div className="md-toolbar__controls">
          <div className="md-search">
            <i className="ti ti-search" />
            <input
              type="text"
              placeholder="Buscar por folio o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")}>
                <i className="ti ti-x" />
              </button>
            )}
          </div>
          <div className="md-orden">
            <label>Ordenar:</label>
            <select value={orden} onChange={(e) => setOrden(e.target.value)}>
              <option value="recientes">Más recientes</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="md-content">
        {loading && (
          <div className="md-state md-state--loading">
            <div className="md-spinner" />
            <p>Cargando tus solicitudes...</p>
          </div>
        )}

        {!loading && error && (
          <div className="md-state md-state--error">
            <i className="ti ti-alert-circle" />
            <p>{error}</p>
            <button onClick={cargar}>Reintentar</button>
          </div>
        )}

        {!loading && !error && solicitudes.length === 0 && (
          <div className="md-state md-state--empty">
            <div className="md-empty-icon">
              <i className="ti ti-code-off" />
            </div>
            <h3>
              {filtroEstatus === "todas"
                ? "Aún no tienes solicitudes de desarrollo"
                : "No hay solicitudes en esta categoría"}
            </h3>
            <p>
              {filtroEstatus === "todas"
                ? "Cuando envíes una solicitud a Sistemas, aparecerá aquí para que puedas darle seguimiento."
                : "Prueba con otro filtro o revisa todas tus solicitudes."}
            </p>
            {filtroEstatus === "todas" && (
              <button
                className="md-btn-nueva md-btn-nueva--ghost"
                onClick={() => navigate("/mesa-de-servicio/desarrollo/nueva")}
              >
                <i className="ti ti-plus" /> Crear primera solicitud
              </button>
            )}
          </div>
        )}

        {!loading && !error && solicitudes.length > 0 && (
          <div className="md-list">
            {solicitudes.map((sol) => (
              <SolicitudCard
                key={sol.idSolicitud}
                sol={sol}
                onClick={() => abrirDetalle(sol)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer hint ── */}
      {!loading && !error && (
        <div className="md-footer-hint">
          <i className="ti ti-info-circle" />
          <span>
            Si tu solicitud requiere más detalles o archivos, el equipo de
            Sistemas te lo hará saber en el seguimiento.
          </span>
          <button
            className="md-btn-nueva md-btn-nueva--sm"
            onClick={() => navigate("/mesa-de-servicio/desarrollo/nueva")}
          >
            <i className="ti ti-plus" /> Crear nueva solicitud
          </button>
        </div>
      )}
    </div>
  );
}
