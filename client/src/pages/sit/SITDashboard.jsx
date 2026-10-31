// pages/sit/SITDashboard.jsx
// Tablero del SIT: semáforo de vigencia por empresa calculado sobre los
// documentos de la biblioteca de SharePoint de proveedores, y lista de
// documentos por vencer o vencidos. El servidor guarda el cálculo 15 min.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import EmpresaBadge from "./components/EmpresaBadge";
import SitHeroNube from "./components/SitHeroNube";
import SitPaginador, { usePaginacion } from "./components/SitPaginador";
import SitPreparando from "./components/SitPreparando";
import SITDocumentoViewer from "./components/SITDocumentoViewer";
import { sitApi, fecha, fechaHora, rutaArticulo } from "./sitApi";
import "./sit.css";
import "./SITDashboard.css";
import "./SitNube.css";

const EMPRESAS = ["IAFSA", "FDNC"];

const NIVELES = [
  { campo: "vigentes", semaforo: "VERDE", clase: "verde", label: "Vigentes", ayuda: "Más de 30 días" },
  { campo: "porVencer", semaforo: "AMARILLO", clase: "amarillo", label: "Por vencer", ayuda: "30 días o menos" },
  { campo: "vencidos", semaforo: "ROJO", clase: "rojo", label: "Vencidos", ayuda: "Requieren reemplazo" },
  { campo: "sinFecha", semaforo: "SIN_FECHA", clase: "gris", label: "Sin fecha", ayuda: "Requieren captura" },
];

const SEMAFORO_LABEL = { VERDE: "Vigente", AMARILLO: "Por vencer", ROJO: "Vencido", SIN_FECHA: "Sin fecha" };
const SEMAFORO_CLASE = { VERDE: "verde", AMARILLO: "amarillo", ROJO: "rojo", SIN_FECHA: "gris" };

const queryDashboard = ({ refrescar, filtro } = {}) => {
  const p = new URLSearchParams();
  if (refrescar) p.set("refrescar", "1");
  if (filtro) {
    p.set("semaforo", filtro.semaforo);
    p.set("empresa", filtro.empresa);
  }
  const q = p.toString();
  return "/dashboard" + (q ? "?" + q : "");
};

export default function SITDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [viendo, setViendo] = useState(null);
  const [cumplimiento, setCumplimiento] = useState(null); // null = cargando, false = error
  // KPI seleccionado ({ empresa, semaforo }): filtra la lista de documentos;
  // los conteos de las tarjetas no cambian.
  const [filtro, setFiltro] = useState(null);
  const [lista, setLista] = useState(null); // { alertas, totalAlertas } con el filtro aplicado
  const [cargandoLista, setCargandoLista] = useState(false);

  const cargar = useCallback(async (refrescar = false) => {
    try {
      setCargando(true);
      setError(null);
      setData(await sitApi(queryDashboard({ refrescar })));
      setFiltro(null);
      setLista(null);
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
    // El cumplimiento usa el mismo índice ya calculado: se pide después
    setCumplimiento(null);
    sitApi("/tablero/cumplimiento")
      .then(setCumplimiento)
      .catch(() => setCumplimiento(false));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!filtro) {
      setLista(null);
      return;
    }
    let vivo = true;
    setCargandoLista(true);
    sitApi(queryDashboard({ filtro }))
      .then((d) => vivo && setLista({ alertas: d.alertas || [], totalAlertas: d.totalAlertas || 0 }))
      .catch(() => vivo && setLista({ alertas: [], totalAlertas: 0, error: true }))
      .finally(() => vivo && setCargandoLista(false));
    return () => {
      vivo = false;
    };
  }, [filtro]);

  const toggleFiltro = (empresa, semaforo) =>
    setFiltro((f) => (f && f.empresa === empresa && f.semaforo === semaforo ? null : { empresa, semaforo }));

  const empresas = EMPRESAS.filter((e) => data?.[e]);
  const vista = lista || data;
  const nivelActivo = filtro && NIVELES.find((n) => n.semaforo === filtro.semaforo);
  // Andrea y Mónica (administradoras documentales) entran directo a su
  // dashboard; el tablero general queda a un clic con /sit?general=1.
  // Una sola vez y solo si ESTA página está en /sit: las pestañas del portal
  // mantienen montadas las páginas ocultas y, si no, redirigía en cada clic.
  const location = useLocation();
  const redirigido = useRef(false);
  const enInicio = location.pathname.replace(/\/+$/, "") === "/sit" && new URLSearchParams(location.search).get("general") !== "1";
  useEffect(() => {
    if (!redirigido.current && enInicio && data?.permisos?.esAdministradoraDocumental) {
      redirigido.current = true;
      navigate("/sit/dashboard", { replace: true });
    }
  }, [data, enInicio, navigate]);

  const pag = usePaginacion(vista?.alertas, filtro ? `${filtro.empresa}|${filtro.semaforo}` : "");

  return (
    <main className="sit-root sit-nube">
      <SitHeroNube
        eyebrow="Compras · Documentación técnica"
        antes="Sistema de"
        resalte="Información Técnica"
        despues=""
        sub="Vigencia de la documentación técnica de artículos y proveedores."
        volver={data?.permisos?.esAdministradoraDocumental ? { to: "/sit/dashboard", label: "Volver a Indicadores documentales" } : { to: "/", label: "Volver al inicio" }}
        acciones={
          <>
            <button className="sit-btn" onClick={() => cargar(true)} disabled={cargando} title="Vuelve a leer los cambios de SharePoint">
              <i className={`ti ti-refresh${cargando ? " sit-spin" : ""}`} /> Actualizar
            </button>
            {data?.permisos?.esAdministradoraDocumental && (
              <>
                <button className="sit-btn" onClick={() => navigate("/sit/dashboard")}>
                  <i className="ti ti-chart-dots-3" /> Indicadores documentales
                </button>
                <button className="sit-btn" onClick={() => navigate("/sit/control")}>
                  <i className="ti ti-shield-lock" /> Centro de control
                </button>
              </>
            )}
            <button className="sit-btn sit-btn--primary" onClick={() => navigate("/sit/articulos")}>
              <i className="ti ti-list-search" /> Ver artículos
            </button>
          </>
        }
      />

      {cargando && !data ? (
        <SitPreparando />
      ) : error ? (
        <div className="sit-state sit-state--error">
          <i className={`ti ${error.status === 403 ? "ti-lock" : "ti-cloud-off"}`} />
          <h3>{error.status === 403 ? "Sin acceso" : "No pudimos preparar el tablero"}</h3>
          <p>
            {error.status === 403
              ? error.message
              : `${error.message}. Tus documentos no se modificaron; puedes intentarlo de nuevo.`}
          </p>
          {error.status !== 403 && (
            <button className="sit-btn sit-btn--primary" onClick={() => cargar()}>
              <i className="ti ti-refresh" /> Reintentar
            </button>
          )}
        </div>
      ) : (
        <>
          <section className="sit-dash__plantas">
            {empresas.map((empresa) => {
              const c = data[empresa];
              return (
                <article key={empresa} className="sit-card sit-dash__planta">
                  <header className="sit-dash__planta-head">
                    <h2>
                      <i className="ti ti-building-factory" /> {empresa}
                    </h2>
                    <span>{c.total.toLocaleString("es-MX")} documentos</span>
                  </header>
                  <div className="sit-dash__niveles">
                    {NIVELES.map((n) => {
                      const activo = filtro?.empresa === empresa && filtro?.semaforo === n.semaforo;
                      return (
                        <button
                          type="button"
                          key={n.campo}
                          className={`sit-dash__nivel sit-dash__nivel--${n.clase}${activo ? " is-active" : ""}`}
                          aria-pressed={activo}
                          title={activo ? "Quitar filtro" : `Ver documentos: ${n.label} · ${empresa}`}
                          onClick={() => toggleFiltro(empresa, n.semaforo)}
                        >
                          <span className="sit-dash__dot" aria-hidden="true" />
                          <strong>{c[n.campo].toLocaleString("es-MX")}</strong>
                          <span className="sit-dash__label">{n.label}</span>
                          <small>{n.ayuda}</small>
                        </button>
                      );
                    })}
                  </div>
                  {data.validaciones?.[empresa] && (
                    <div className="sit-dash__valid">
                      <p className="sit-dash__valid-head">
                        <i className="ti ti-rosette-discount-check" />
                        <strong>{data.validaciones[empresa].total.toLocaleString("es-MX")}</strong> documentos validados por Calidad
                        {data.validaciones[empresa].ultimaSemana > 0 && (
                          <span> · {data.validaciones[empresa].ultimaSemana} esta semana</span>
                        )}
                      </p>
                      {data.validaciones[empresa].porArticulo.length > 0 && (
                        <ul className="sit-dash__valid-lista">
                          {data.validaciones[empresa].porArticulo.map((a) => (
                            <li key={a.codigoArticulo}>
                              <button type="button" onClick={() => navigate(rutaArticulo({ codigoArticulo: a.codigoArticulo, empresa }))}>
                                {a.codigoArticulo}
                              </button>
                              <span>
                                {a.count} {a.count === 1 ? "documento" : "documentos"} · {fecha(a.ultima)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          <section className="sit-card sit-dash__cumpl">
            <h2 className="sit-card__title">
              <i className="ti ti-list-check" /> Cumplimiento de requisitoriedad
              <small className="sit-dash__cumpl-nota">
                Pares artículo + proveedor con al menos el {cumplimiento?.umbral ?? 80}% de sus documentos requeridos en SharePoint
              </small>
            </h2>
            {cumplimiento === null ? (
              <div className="sit-state">
                <i className="ti ti-loader-2 sit-spin" />
              </div>
            ) : cumplimiento === false ? (
              <p className="sit-dash__nota">No se pudo calcular el cumplimiento.</p>
            ) : (
              <div className="sit-dash__cumpl-grid">
                {EMPRESAS.filter((e) => cumplimiento[e]).map((empresa) => {
                  const c = cumplimiento[empresa];
                  const tono = c.porcentaje >= 80 ? "verde" : c.porcentaje >= 50 ? "amarillo" : "rojo";
                  return (
                    <div key={empresa} className="sit-dash__cumpl-item">
                      <div className="sit-dash__cumpl-head">
                        <EmpresaBadge empresa={empresa} />
                        <span>
                          <strong>{c.cumplen.toLocaleString("es-MX")}</strong> de {c.pares.toLocaleString("es-MX")} pares cumplen
                        </span>
                        <span className={`sit-dash__cumpl-pct sit-dash__cumpl-pct--${tono}`}>{c.porcentaje}%</span>
                      </div>
                      <div className={`sit-dash__cumpl-barra sit-dash__cumpl-barra--${tono}`} role="progressbar" aria-valuenow={c.porcentaje} aria-valuemin={0} aria-valuemax={100}>
                        <span style={{ width: `${Math.min(100, c.porcentaje)}%` }} />
                      </div>
                      <div className="sit-dash__cumpl-detalle">
                        <span><span className="sit-dash__cumpl-dot sit-dash__cumpl-dot--verde" /> ≥80%: {c.cumplen}</span>
                        <span><span className="sit-dash__cumpl-dot sit-dash__cumpl-dot--amarillo" /> 50–79%: {c.parcial}</span>
                        <span><span className="sit-dash__cumpl-dot sit-dash__cumpl-dot--rojo" /> &lt;50%: {c.bajo}</span>
                        {c.sinDocumentos > 0 && <span className="sit-dash__cumpl-sin">{c.sinDocumentos} sin ningún documento</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="sit-card">
            <h2 className="sit-card__title">
              {filtro ? `Documentos · ${nivelActivo.label}` : "Documentos por vencer y vencidos"}
              {!cargandoLista && vista.totalAlertas > 0 && <span className="sit-tag">{vista.totalAlertas.toLocaleString("es-MX")}</span>}
              {filtro && (
                <button type="button" className="sit-dash__chip" onClick={() => setFiltro(null)} title="Quitar filtro">
                  {filtro.empresa} · {nivelActivo.label} <i className="ti ti-x" />
                </button>
              )}
            </h2>

            {cargandoLista ? (
              <div className="sit-state">
                <i className="ti ti-loader-2 sit-spin" />
              </div>
            ) : lista?.error ? (
              <p className="sit-dash__nota">No se pudo aplicar el filtro. Intenta de nuevo.</p>
            ) : !vista.alertas?.length ? (
              <div className="sit-state">
                <i className="ti ti-file-off" />
                <h3>{filtro ? "Sin documentos" : "Todo en orden"}</h3>
                <p>
                  {filtro
                    ? `${filtro.empresa} no tiene documentos en «${nivelActivo.label}».`
                    : "No hay documentos vencidos ni próximos a vencer."}
                </p>
              </div>
            ) : (
              <>
                {vista.totalAlertas > vista.alertas.length && (
                  <p className="sit-dash__nota">Se muestran los primeros {vista.alertas.length} de {vista.totalAlertas.toLocaleString("es-MX")}.</p>
                )}
                <div className="sit-table-wrap">
                  <table className="sit-table">
                    <thead>
                      <tr>
                        <th className="sit-col-fit">Empresa</th>
                        <th className="sit-col-fit">Artículo</th>
                        <th>Proveedor</th>
                        <th>Tipo doc</th>
                        <th className="sit-col-fit">Vencimiento</th>
                        <th className="sit-col-fit">Semáforo</th>
                        <th className="sit-col-fit" aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody key={`${filtro ? filtro.empresa + filtro.semaforo : "todo"}-${pag.pagina}-${pag.porPagina}`} className="sit-fade">
                      {pag.visibles.map((a) => (
                        <tr key={a.sharepointId} className="sit-dash__fila" onClick={() => navigate(rutaArticulo(a))} title="Ver artículo">
                          <td className="sit-col-fit">
                            {a.empresas.map((e) => (
                              <EmpresaBadge key={e} empresa={e} />
                            ))}
                          </td>
                          <td className="sit-col-fit">
                            <strong>{a.codigoArticulo}</strong>
                          </td>
                          <td className="sit-col-texto">{a.proveedor}</td>
                          <td className="sit-col-texto">
                            {a.tipoDocumento}
                            <small className="sit-col-archivo" title={a.nombreArchivo}>{a.nombreArchivo}</small>
                          </td>
                          <td className="sit-col-fit">{a.fechaVencimiento ? fecha(a.fechaVencimiento) : "—"}</td>
                          <td className="sit-col-fit">
                            <span className={`sit-dash__sem sit-dash__sem--${SEMAFORO_CLASE[a.semaforo] || "gris"}`}>
                              <span className="sit-dash__sem-dot" /> {SEMAFORO_LABEL[a.semaforo]}
                            </span>
                          </td>
                          <td className="sit-col-fit">
                            <button
                              className="sit-btn sit-btn--sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViendo(a);
                              }}
                            >
                              <i className="ti ti-eye" /> PDF
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <SitPaginador {...pag} />
                </div>
              </>
            )}
          </section>
        </>
      )}

      {viendo && (
        <SITDocumentoViewer documento={{ tipo: "sharepoint", id: viendo.sharepointId }} nombreArchivo={viendo.nombreArchivo} onClose={() => setViendo(null)} />
      )}
    </main>
  );
}
