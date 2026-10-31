// pages/sit/DashboardAdminPage.jsx
// Dashboard de las administradoras documentales (sit_administradores).
// Una sola llamada: GET /api/sit/tablero/dashboard (el servidor responde 403
// a cualquier otra cuenta). Inspirado en el Visor Ejecutivo: banner de
// situación con ilustración y acceso al asistente, KPIs animados y gráficas
// interactivas en SVG/CSS (sin librerías). Los colores siguen una escala
// continua según el valor (rojo → ámbar → verde), no tonos fijos.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SitHero from "./components/SitHero";
import SitPreparando from "./components/SitPreparando";
import SITDocumentoViewer from "./components/SITDocumentoViewer";
import IlustracionDocumental from "./components/IlustracionDocumental";
import { sitApi, fecha, fechaHora, rutaArticulo } from "./sitApi";
import "./sit.css";
import "./SitNube.css";
import "./DashboardAdminPage.css";

const KPIS = [
  { campo: "vigentes", estado: "VERDE", tono: "ok", icono: "ti-circle-check", label: "Vigentes", sub: "Más de 30 días de vigencia" },
  { campo: "porVencer", estado: "AMARILLO", tono: "warn", icono: "ti-clock-exclamation", label: "Por vencer", sub: "Vencen en 30 días o menos" },
  { campo: "vencidos", estado: "ROJO", tono: "risk", icono: "ti-alert-octagon", label: "Vencidos", sub: "Requieren reemplazo" },
  { campo: "sinFecha", estado: "SIN_FECHA", tono: "neutral", icono: "ti-calendar-question", label: "Sin fecha", sub: "Requieren captura de vigencia" },
];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const FILTROS_DIAS = [
  { id: 30, label: "30 días" },
  { id: 15, label: "≤ 15" },
  { id: 7, label: "≤ 7" },
];
const ACCIONES = { VIEW_DOC: "consultó", DOWNLOAD: "descargó", DESCARGAR: "descargó", IMPRIMIR: "imprimió", PRINT: "imprimió", UPLOAD: "cargó", VALIDAR: "validó", EDITAR_FECHA: "editó la vigencia de", ACCESS_ROLE: "cambió el rol de acceso de", ACCESS_RESTORE: "restauró el acceso de", ACCESS_REVOKE: "revocó el acceso de", ACCESS_GRANT: "otorgó acceso a" };

const n = (x) => Number(x || 0).toLocaleString("es-MX");
const pct1 = (a, b) => (b ? Math.round((a * 1000) / b) / 10 : 0);

/** Escala continua: 0 → rojo, 50 → ámbar, 100 → verde */
const PARADAS = [
  [0, [255, 49, 88]],
  [50, [255, 159, 10]],
  [80, [34, 197, 140]],
  [100, [6, 173, 118]],
];
function colorEscala(valor) {
  const v = Math.max(0, Math.min(100, valor));
  for (let i = 1; i < PARADAS.length; i++) {
    const [b, cb] = PARADAS[i];
    const [a, ca] = PARADAS[i - 1];
    if (v <= b) {
      const t = (v - a) / (b - a);
      return `rgb(${ca.map((c, k) => Math.round(c + (cb[k] - c) * t)).join(",")})`;
    }
  }
  return "rgb(6,173,118)";
}
/** Calor (para cantidades de pendientes): 0 → azul tenue, 1 → rojo intenso */
function colorCalor(t) {
  const paradas = [
    [0, [122, 168, 255]],
    [0.45, [155, 63, 242]],
    [0.75, [255, 120, 60]],
    [1, [255, 49, 88]],
  ];
  const v = Math.max(0, Math.min(1, t));
  for (let i = 1; i < paradas.length; i++) {
    const [b, cb] = paradas[i];
    const [a, ca] = paradas[i - 1];
    if (v <= b) {
      const k = (v - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(",")})`;
    }
  }
  return "rgb(255,49,88)";
}

/** Número que cuenta hasta su valor al aparecer (y al cambiar) */
function Cifra({ valor, decimales = 0, sufijo = "" }) {
  const [v, setV] = useState(0);
  const desde = useRef(0);
  useEffect(() => {
    const reducir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const ini = desde.current;
    const fin = Number(valor || 0);
    if (reducir) {
      setV(fin);
      desde.current = fin;
      return undefined;
    }
    let raf;
    const t0 = performance.now();
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setV(ini + (fin - ini) * e);
      if (k < 1) raf = requestAnimationFrame(paso);
      else desde.current = fin;
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return (
    <>
      {v.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}
      {sufijo}
    </>
  );
}

/** Aparece en 0 y anima hacia su valor después del primer pintado */
function useMontado() {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setListo(true)));
    return () => cancelAnimationFrame(id);
  }, []);
  return listo;
}

function Gauge({ porcentaje }) {
  const listo = useMontado();
  const r = 54;
  const c = 2 * Math.PI * r;
  const valor = Math.max(0, Math.min(100, porcentaje));
  const color = colorEscala(valor);
  return (
    <div className="adm-gauge" style={{ "--adm-c": color }}>
      <svg viewBox="0 0 132 132" role="img" aria-label={`${porcentaje}% de cumplimiento`}>
        <circle className="adm-gauge__pista" cx="66" cy="66" r={r} />
        <circle
          className="adm-gauge__valor"
          cx="66"
          cy="66"
          r={r}
          stroke={color}
          strokeDasharray={`${((listo ? valor : 0) / 100) * c} ${c}`}
          transform="rotate(-90 66 66)"
        />
      </svg>
      <div className="adm-gauge__centro">
        <strong>
          <Cifra valor={porcentaje} decimales={1} sufijo="%" />
        </strong>
        <small>cumplimiento</small>
      </div>
    </div>
  );
}

/** Dona del semáforo: segmentos interactivos, el centro muestra el resaltado */
function DonaSemaforo({ semaforo, activo, onActivo, onClick }) {
  const listo = useMontado();
  const r = 70;
  const c = 2 * Math.PI * r;
  const total = semaforo.total || 1;
  let acumulado = 0;
  const k = KPIS.find((x) => x.campo === activo);
  return (
    <div className="adm-dona">
      <svg viewBox="0 0 180 180" role="img" aria-label="Distribución de documentos por estado">
        <circle cx="90" cy="90" r={r} className="adm-dona__pista" />
        {KPIS.map((x) => {
          const largo = (semaforo[x.campo] / total) * c;
          const seg = (
            <circle
              key={x.campo}
              cx="90"
              cy="90"
              r={r}
              className={`adm-dona__seg adm-tono--${x.tono}${activo && activo !== x.campo ? " is-tenue" : ""}`}
              strokeDasharray={`${listo ? Math.max(0, largo - 2) : 0} ${c}`}
              strokeDashoffset={-acumulado}
              transform="rotate(-90 90 90)"
              onMouseEnter={() => onActivo(x.campo)}
              onMouseLeave={() => onActivo(null)}
              onClick={() => onClick(x.estado)}
            >
              <title>{`${x.label}: ${n(semaforo[x.campo])}`}</title>
            </circle>
          );
          acumulado += largo;
          return seg;
        })}
      </svg>
      <div className="adm-dona__centro">
        <strong>{k ? n(semaforo[k.campo]) : n(semaforo.total)}</strong>
        <small>{k ? `${k.label} · ${pct1(semaforo[k.campo], semaforo.total)}%` : "documentos"}</small>
      </div>
    </div>
  );
}

function Calendario({ meses, empresas }) {
  const listo = useMontado();
  const [sel, setSel] = useState(null);
  const max = Math.max(1, ...meses.map((m) => m.total));
  const total = meses.reduce((s, m) => s + m.total, 0);
  const pico = meses.reduce((a, m) => (m.total > a.total ? m : a), meses[0]);
  const m = sel !== null ? meses[sel] : null;
  return (
    <div className="adm-cal">
      <div className="adm-cal__resumen">
        {m ? (
          <>
            <strong>{n(m.total)}</strong>
            <span>
              vencen en {MESES_LARGOS[m.mes - 1]} {m.anio}
              {empresas.length > 1 && " · " + empresas.map((e) => `${e} ${n(m.porEmpresa[e])}`).join(" · ")}
            </span>
          </>
        ) : (
          <>
            <strong>{n(total)}</strong>
            <span>
              documentos vencen en los próximos 12 meses · pico en <b>{MESES_LARGOS[pico.mes - 1]}</b> ({n(pico.total)})
            </span>
          </>
        )}
      </div>
      <div className="adm-cal__barras" onMouseLeave={() => setSel(null)}>
        {meses.map((x, i) => {
          const t = x.total / max;
          return (
            <button
              type="button"
              key={`${x.anio}-${x.mes}`}
              className={"adm-cal__col" + (sel === i ? " is-sel" : "") + (i === 0 ? " is-actual" : "")}
              onMouseEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              aria-label={`${MESES_LARGOS[x.mes - 1]} ${x.anio}: ${x.total} documentos`}
            >
              <span className="adm-cal__valor">{x.total ? n(x.total) : ""}</span>
              <span className="adm-cal__pista">
                <span
                  className="adm-cal__barra"
                  style={{ height: `${listo ? Math.max(t * 100, x.total ? 4 : 0) : 0}%`, background: `linear-gradient(180deg, ${colorCalor(t)}, ${colorCalor(t * 0.55)})`, transitionDelay: `${i * 35}ms` }}
                />
              </span>
              <span className="adm-cal__mes">
                {MESES[x.mes - 1]}
                {x.mes === 1 && <small>{String(x.anio).slice(2)}</small>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EstadoPorTipo({ tipos, onClick }) {
  const listo = useMontado();
  const [hover, setHover] = useState(null);
  return (
    <ul className="adm-tipos">
      {tipos.map((t) => (
        <li key={t.tipo}>
          <div className="adm-tipos__txt">
            <span title={t.tipo}>{t.tipo}</span>
            <small>
              {hover?.tipo === t.tipo ? `${KPIS.find((k) => k.campo === hover.campo).label}: ${n(t[hover.campo])} (${pct1(t[hover.campo], t.total)}%)` : `${n(t.total)} docs`}
            </small>
          </div>
          <div className="adm-tipos__barra">
            {KPIS.map((k) =>
              t[k.campo] ? (
                <button
                  type="button"
                  key={k.campo}
                  className={`adm-tono--${k.tono}`}
                  style={{ width: listo ? `${(t[k.campo] / t.total) * 100}%` : 0 }}
                  onMouseEnter={() => setHover({ tipo: t.tipo, campo: k.campo })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onClick(k.estado)}
                  aria-label={`${t.tipo}, ${k.label}: ${t[k.campo]}`}
                />
              ) : null,
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

const iniciales = (nombre) =>
  String(nombre || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
function hace(f) {
  const min = Math.round((Date.now() - new Date(f)) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return fecha(f);
}

export default function DashboardAdminPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [viendo, setViendo] = useState(null);
  const [kpiActivo, setKpiActivo] = useState(null);
  const [filtroDias, setFiltroDias] = useState(30);

  const cargar = useCallback(async (refrescar = false) => {
    try {
      setCargando(true);
      setError(null);
      setData(await sitApi(`/tablero/dashboard${refrescar ? "?refrescar=1" : ""}`));
    } catch (err) {
      setError(err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const aArticulos = (estadoDoc) => navigate(`/sit/articulos?estadoDoc=${estadoDoc}`);

  const resumen = useMemo(() => {
    if (!data) return null;
    const emp = Object.values(data.empresas);
    const pares = emp.reduce((s, e) => s + e.pares, 0);
    const cumplen = emp.reduce((s, e) => s + e.paresCumplen, 0);
    const global = pct1(cumplen, pares);
    const nivel =
      global >= data.umbral
        ? { id: "estable", label: "Estable", icono: "ti-shield-check", texto: "La mayoría de los pares artículo-proveedor cumple con su documentación requerida." }
        : global >= 50
          ? { id: "atencion", label: "Requiere atención", icono: "ti-alert-triangle", texto: "Hay brechas relevantes en la documentación requerida. Conviene priorizar los tipos con más huecos." }
          : { id: "critico", label: "Crítico", icono: "ti-flame", texto: `Solo el ${global}% de los pares artículo-proveedor llega al ${data.umbral}% de sus documentos requeridos vigentes.` };
    const pico = (data.calendario || []).reduce((a, m) => (!a || m.total > a.total ? m : a), null);
    const enSemana = data.porVencer.filter((d) => d.diasRestantes <= 7).length;
    return { global, nivel, pico, enSemana };
  }, [data]);

  const criticos = useMemo(() => (data ? data.porVencer.filter((d) => d.diasRestantes <= filtroDias) : []), [data, filtroDias]);
  const maxHuecos = Math.max(1, ...(data?.huecosPorTipo || []).map((t) => t.articulos));
  const actividad = (data?.actividad || []).filter((a) => !/^sharepointId\b/i.test(a.descripcion || "")).slice(0, 6);

  return (
    <main className="sit-root sit-nube adm-root">
      <SitHero
        eyebrow="Información Técnica · Administración"
        titulo="Indicadores de"
        resalte="documentación técnica"
        volver={{ to: "/", label: "Volver al inicio" }}
        acciones={
          <>
            <button className="sit-btn" onClick={() => cargar(true)} disabled={cargando} title="Vuelve a leer los cambios de SharePoint">
              <i className={`ti ti-refresh${cargando ? " sit-spin" : ""}`} /> Actualizar
            </button>
            <button className="sit-btn" onClick={() => navigate("/sit?general=1")} title="Tablero por planta con la lista de documentos">
              <i className="ti ti-layout-grid" /> Tablero general
            </button>
            {!error && (
              <button className="sit-btn" onClick={() => navigate("/sit/control")}>
                <i className="ti ti-shield-lock" /> Centro de control
              </button>
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
          <h3>{error.status === 403 ? "Acceso reservado" : "No pudimos preparar el dashboard"}</h3>
          <p>{error.status === 403 ? "El dashboard es exclusivo de las responsables de la documentación." : error.message}</p>
          {error.status !== 403 && (
            <button className="sit-btn sit-btn--primary" onClick={() => cargar()}>
              <i className="ti ti-refresh" /> Reintentar
            </button>
          )}
        </div>
      ) : (
        <div className="adm-contenido">
          {/* ══ Banner de situación ══ */}
          <section className="adm-banner" aria-label="Situación documental">
            <div className="adm-banner__estado">
              <span className="adm-eyebrow">Situación documental</span>
              <h2 className={`adm-nivel adm-nivel--${resumen.nivel.id}`}>
                {resumen.nivel.label} <i className={`ti ${resumen.nivel.icono}`} aria-hidden="true" />
              </h2>
              <p>{resumen.nivel.texto}</p>
              <div className="adm-banner__global">
                <div className="adm-banner__pista">
                  <span style={{ width: `${resumen.global}%`, background: colorEscala(resumen.global) }} />
                  <i style={{ left: `${data.umbral}%` }} title={`Meta: ${data.umbral}%`} />
                </div>
                <small>
                  <strong style={{ color: colorEscala(resumen.global) }}>{resumen.global}%</strong> global · meta {data.umbral}%
                </small>
              </div>
            </div>

            <div className="adm-banner__centro" aria-hidden="true">
              <IlustracionDocumental className="adm-banner__imagen" />
            </div>

            <ul className="adm-banner__bullets">
              <li className="adm-bullet adm-tono--risk">
                <i className="ti ti-alert-octagon" />
                <span>
                  <strong>{n(data.semaforo.vencidos)}</strong> documentos vencidos requieren reemplazo
                </span>
              </li>
              <li className="adm-bullet adm-tono--warn">
                <i className="ti ti-clock-exclamation" />
                <span>
                  <strong>{n(resumen.enSemana)}</strong> vencen en los próximos 7 días · {n(data.totalPorVencer)} en 30
                </span>
              </li>
              {resumen.pico && resumen.pico.total > 0 && (
                <li className="adm-bullet adm-tono--info">
                  <i className="ti ti-calendar-stats" />
                  <span>
                    <strong>{MESES_LARGOS[resumen.pico.mes - 1]}</strong> concentra {n(resumen.pico.total)} vencimientos
                  </span>
                </li>
              )}
              <li className="adm-bullet adm-tono--neutral">
                <i className="ti ti-folder-off" />
                <span>
                  <strong>{n(data.articulosSinDocumentos)}</strong> artículos activos sin ningún documento
                </span>
              </li>
            </ul>
          </section>

          {/* ══ KPIs ══ */}
          <section className="adm-kpis">
            {KPIS.map((k) => {
              const valor = data.semaforo[k.campo];
              const parte = pct1(valor, data.semaforo.total);
              return (
                <button
                  type="button"
                  key={k.campo}
                  className={`adm-card adm-kpi adm-tono--${k.tono}${kpiActivo === k.campo ? " is-activo" : ""}`}
                  onClick={() => aArticulos(k.estado)}
                  onMouseEnter={() => setKpiActivo(k.campo)}
                  onMouseLeave={() => setKpiActivo(null)}
                  title={`Ver artículos con documentos: ${k.label.toLowerCase()}`}
                >
                  <span className="adm-kpi__top">
                    <span className="adm-kpi__icono">
                      <i className={`ti ${k.icono}`} />
                    </span>
                    <span className="adm-kpi__parte">{parte}%</span>
                  </span>
                  <span className="adm-kpi__num">
                    <Cifra valor={valor} />
                  </span>
                  <span className="adm-kpi__label">{k.label}</span>
                  <span className="adm-kpi__barra">
                    <span style={{ width: `${parte}%` }} />
                  </span>
                  <span className="adm-kpi__sub">{k.sub}</span>
                  <i className="ti ti-arrow-up-right adm-kpi__ir" aria-hidden="true" />
                </button>
              );
            })}
          </section>

          {/* ══ Plantas + composición ══ */}
          <section className="adm-fila adm-fila--plantas">
            {Object.entries(data.empresas).map(([empresa, e]) => {
              const cobertura = pct1(e.articulosActivos - e.articulosSinDocumentos, e.articulosActivos);
              const partes = [
                { id: "cumplen", label: `≥ ${data.umbral}%`, valor: e.paresCumplen, color: colorEscala(90) },
                { id: "parcial", label: `50–${data.umbral - 1}%`, valor: e.paresParcial ?? 0, color: colorEscala(55) },
                { id: "bajo", label: "< 50%", valor: e.paresBajo ?? Math.max(0, e.pares - e.paresCumplen), color: colorEscala(8) },
              ];
              return (
                <article key={empresa} className="adm-card adm-planta" style={{ "--adm-c": colorEscala(e.cumplimiento) }}>
                  <header>
                    <span className="adm-eyebrow">
                      <i className="ti ti-building-factory-2" /> Planta
                    </span>
                    <h3>{empresa}</h3>
                  </header>
                  <div className="adm-planta__cuerpo">
                    <Gauge porcentaje={e.cumplimiento} />
                    <div className="adm-planta__datos">
                      <div className="adm-planta__metricas">
                        <span>
                          <strong>
                            <Cifra valor={e.articulosActivos} />
                          </strong>
                          <small>artículos activos</small>
                        </span>
                        <span>
                          <strong style={{ color: colorEscala(cobertura) }}>{cobertura}%</strong>
                          <small>con documentos</small>
                        </span>
                      </div>
                      <div className="adm-dist">
                        <div className="adm-dist__barra">
                          {partes.map((p) =>
                            p.valor ? (
                              <span key={p.id} style={{ flexGrow: p.valor, background: p.color }} title={`${p.label}: ${n(p.valor)} pares`} />
                            ) : null,
                          )}
                        </div>
                        <div className="adm-dist__leyenda">
                          {partes.map((p) => (
                            <span key={p.id}>
                              <i style={{ background: p.color }} /> {p.label} <strong>{n(p.valor)}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <small className="adm-planta__nota">{n(e.pares)} pares artículo + proveedor en la matriz de requisitoriedad</small>
                </article>
              );
            })}

            <article className="adm-card adm-composicion">
              <header className="adm-card__head">
                <h3>
                  <i className="ti ti-chart-donut-3 adm-i--info" /> Composición documental
                </h3>
              </header>
              <div className="adm-composicion__cuerpo">
                <DonaSemaforo semaforo={data.semaforo} activo={kpiActivo} onActivo={setKpiActivo} onClick={aArticulos} />
                <ul className="adm-leyenda">
                  {KPIS.map((k) => (
                    <li
                      key={k.campo}
                      className={`adm-tono--${k.tono}${kpiActivo === k.campo ? " is-activo" : ""}`}
                      onMouseEnter={() => setKpiActivo(k.campo)}
                      onMouseLeave={() => setKpiActivo(null)}
                    >
                      <i /> {k.label}
                      <strong>{pct1(data.semaforo[k.campo], data.semaforo.total)}%</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </section>

          {/* ══ Calendario + estado por tipo ══ */}
          <section className="adm-fila adm-fila--graficas">
            <article className="adm-card">
              <header className="adm-card__head">
                <h3>
                  <i className="ti ti-calendar-event adm-i--info" /> Calendario de vencimientos
                </h3>
                <span className="adm-card__meta">Próximos 12 meses</span>
              </header>
              <Calendario meses={data.calendario || []} empresas={Object.keys(data.empresas)} />
            </article>

            <article className="adm-card">
              <header className="adm-card__head">
                <h3>
                  <i className="ti ti-stack-2 adm-i--info" /> Estado por tipo de documento
                </h3>
                <span className="adm-card__meta">Pasa el cursor por cada tramo</span>
              </header>
              <EstadoPorTipo tipos={data.estadoPorTipo || []} onClick={aArticulos} />
            </article>
          </section>

          {/* ══ Críticos + huecos ══ */}
          <section className="adm-fila adm-fila--dos">
            <article className="adm-card">
              <header className="adm-card__head">
                <h3>
                  <i className="ti ti-alarm adm-i--warn" /> Documentos más críticos
                </h3>
                <div className="adm-chips" role="group" aria-label="Filtrar por días restantes">
                  {FILTROS_DIAS.map((f) => (
                    <button type="button" key={f.id} className={filtroDias === f.id ? "is-activo" : ""} onClick={() => setFiltroDias(f.id)}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </header>
              {!criticos.length ? (
                <div className="adm-vacio">
                  <i className="ti ti-circle-check adm-i--ok" />
                  <p>{filtroDias === 30 ? "Ningún documento vence en los próximos 30 días." : `Ningún documento vence en ${filtroDias} días o menos.`}</p>
                </div>
              ) : (
                <>
                  <ul className="adm-alertas">
                    {criticos.slice(0, 7).map((d) => {
                      const c = colorEscala((d.diasRestantes / 30) * 60);
                      return (
                        <li key={d.sharepointId} className="adm-alerta" style={{ "--adm-c": c }}>
                          <span className="adm-alerta__dias">
                            <strong>{d.diasRestantes}</strong>
                            <small>{d.diasRestantes === 1 ? "día" : "días"}</small>
                          </span>
                          <button
                            type="button"
                            className="adm-alerta__info"
                            onClick={() => navigate(rutaArticulo({ codigoArticulo: d.codigoArticulo, empresa: d.empresas[0] }))}
                            title="Ver artículo"
                          >
                            <strong>{d.tipoDocumento}</strong>
                            <span>
                              {d.codigoArticulo} · {d.proveedor}
                            </span>
                            <small>
                              {d.diasRestantes === 0 ? "Vence hoy" : `Vence ${fecha(d.fechaVencimiento)}`} · {d.empresas.join(" · ")}
                            </small>
                          </button>
                          <button type="button" className="adm-icono-btn" onClick={() => setViendo(d)} title="Ver PDF" aria-label="Ver PDF">
                            <i className="ti ti-eye" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {criticos.length > 7 && (
                    <button className="adm-link" onClick={() => aArticulos("AMARILLO")}>
                      Ver los {n(criticos.length)} documentos <i className="ti ti-chevron-right" />
                    </button>
                  )}
                </>
              )}
            </article>

            <article className="adm-card">
              <header className="adm-card__head">
                <h3>
                  <i className="ti ti-puzzle adm-i--info" /> Tipos de documento con más huecos
                </h3>
              </header>
              <p className="adm-card__nota">Artículos que exigen el documento en la matriz y no lo tienen vigente: aquí conviene enfocar la recolección.</p>
              {!data.huecosPorTipo.length ? (
                <div className="adm-vacio">
                  <i className="ti ti-circle-check adm-i--ok" />
                  <p>Ningún tipo de documento tiene huecos.</p>
                </div>
              ) : (
                <ol className="adm-huecos">
                  {data.huecosPorTipo.map((t, i) => {
                    const k = t.articulos / maxHuecos;
                    return (
                      <li key={t.idTipoDoc} style={{ "--adm-c": colorCalor(k), "--adm-d": `${i * 45}ms` }}>
                        <span className="adm-huecos__pos">{i + 1}</span>
                        <div className="adm-huecos__fila">
                          <div className="adm-huecos__txt">
                            <span>{t.nombre}</span>
                            <strong>{n(t.articulos)}</strong>
                          </div>
                          <div className="adm-huecos__pista">
                            <span style={{ width: `${k * 100}%` }} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </article>
          </section>

          {/* ══ Menor cumplimiento + actividad ══ */}
          <section className="adm-fila adm-fila--dos">
            <article className="adm-card">
              <header className="adm-card__head">
                <h3>
                  <i className="ti ti-trending-down adm-i--risk" /> Artículos con menor cumplimiento
                </h3>
              </header>
              <ul className="adm-peores">
                {(data.menorCumplimiento || []).slice(0, 6).map((a) => (
                  <li key={`${a.empresa}-${a.codigoArticulo}`}>
                    <button type="button" onClick={() => navigate(rutaArticulo(a))} title="Ver ficha del artículo">
                      <span className="adm-peores__txt">
                        <strong>{a.descripcion || a.codigoArticulo}</strong>
                        <small>
                          {a.codigoArticulo} · {a.empresa} · {a.cumplidos} de {a.total} requisitos
                        </small>
                      </span>
                      <span className="adm-peores__pct" style={{ color: colorEscala(a.porcentaje) }}>
                        {a.porcentaje}%
                      </span>
                      <span className="adm-peores__pista">
                        <span style={{ width: `${Math.max(a.porcentaje, 3)}%`, background: colorEscala(a.porcentaje) }} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="adm-card">
              <header className="adm-card__head">
                <h3>
                  <i className="ti ti-activity adm-i--info" /> Actividad reciente
                </h3>
              </header>
              {!actividad.length ? (
                <div className="adm-vacio">
                  <i className="ti ti-moon adm-i--muted" />
                  <p>Sin movimientos recientes.</p>
                </div>
              ) : (
                <ul className="adm-actividad">
                  {actividad.map((a) => (
                    <li key={a.idAuditoria}>
                      <span className="adm-avatar">{iniciales(a.nombreUsuario)}</span>
                      <span className="adm-actividad__txt">
                        <span>
                          <strong>{a.nombreUsuario}</strong> {ACCIONES[String(a.accion || "").toUpperCase().replace(/\s+/g, "_")] || String(a.accion || "").toLowerCase().replace(/_/g, " ")}
                        </span>
                        {a.descripcion && <small>{a.descripcion}</small>}
                      </span>
                      <time>{hace(a.fecha)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          {/* ══ Pie ══ */}
          <section className="adm-pie">
            <button type="button" className="adm-card adm-mini" onClick={() => aArticulos("SIN_VALIDAR")} disabled={!data.validacionesPendientes}>
              <i className="ti ti-checklist adm-i--info" />
              <span>
                <strong>
                  <Cifra valor={data.validacionesPendientes} />
                </strong>
                <small>documentos sin revisar por Calidad</small>
              </span>
            </button>
            <div className="adm-card adm-mini">
              <i className="ti ti-folder-off adm-i--warn" />
              <span>
                <strong>
                  <Cifra valor={data.articulosSinDocumentos} />
                </strong>
                <small>
                  artículos huérfanos sin documentos en SharePoint
                  {Object.keys(data.empresas).length > 1 &&
                    ` (${Object.entries(data.empresas)
                      .map(([e, x]) => `${e} ${n(x.articulosSinDocumentos)}`)
                      .join(" · ")})`}
                </small>
              </span>
            </div>
            <div className="adm-card adm-mini">
              <i className="ti ti-clock-hour-4 adm-i--muted" />
              <span>
                <strong className="adm-mini__fecha">{fechaHora(data.calculadoEn)}</strong>
                <small>último recálculo · se renueva cada 15 min o con «Actualizar»</small>
              </span>
            </div>
          </section>
        </div>
      )}

      {viendo && (
        <SITDocumentoViewer documento={{ tipo: "sharepoint", id: viendo.sharepointId }} nombreArchivo={viendo.nombreArchivo} onClose={() => setViendo(null)} />
      )}
    </main>
  );
}
