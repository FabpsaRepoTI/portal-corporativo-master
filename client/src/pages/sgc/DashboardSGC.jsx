// pages/sgc/DashboardSGC.jsx
// Centro de control del SGC · Diagnóstico integral del SGC.
//   1. Diagnóstico del sistema   síntesis + cifras clave en una sola franja
//   2. Hallazgos relevantes      cada situación integra: dato calculado, registros
//                                (con responsables), por qué importa, acción sugerida
//                                y, si existe, su análisis de contexto
//   3. Prioridades de atención   acciones sugeridas ligadas a los hallazgos (sujetas a
//                                validación), con una sola leyenda sobre el análisis asistido
//   4. Objetivos de calidad, procesos, tendencia, preguntas y Mis pendientes
// Transparencia: se distinguen (a) registros del SGC, (b) cálculos del sistema
// (reglas y cifras de /inteligencia) y (c) interpretaciones del análisis asistido
// (/inteligencia/diagnostico). La IA no se presenta como autora de los datos.
// Todo detalle de un registro se abre en el panel lateral (PanelLateral).
import { createContext, useCallback, useContext, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorCarga, Encabezado, Skel, useMigas, useToast } from "./components/ui";
import MisPendientes from "../../components/sgc/MisPendientes";
import { useAvisarListo } from "../../components/sgc/sgiEntrada";
import PanelLateral, { RUTA_COMPLETA, panelDesdeRuta } from "../../components/sgc/PanelLateral";
import { sgcApi, useSgc, hace, fechaHora, mesCorto, PROCESO_TIPO } from "./sgcApi";

// Severidad: rojo crítico · violeta atención (token --orange, ya violeta) · azul seguimiento
const NIVEL = {
  critica: { label: "Crítica", tono: "danger" },
  alta: { label: "Atención", tono: "orange" },
  media: { label: "Seguimiento", tono: "info" },
};
const TIPO_ANALISIS = { hecho: "Hecho registrado", tendencia: "Tendencia", riesgo: "Riesgo", hipotesis: "Hipótesis por validar" };
const LEYENDA = "Análisis asistido por IA basado en los registros disponibles del SGC. Las recomendaciones requieren validación del responsable correspondiente.";
const PREGUNTAS = [
  "¿Qué debería atender primero?",
  "¿Qué procesos presentan más problemas?",
  "¿Qué acciones correctivas no han demostrado eficacia?",
  "¿Qué debo revisar antes de la próxima auditoría?",
];

// Abre un registro en el panel lateral (o navega si no tiene vista de panel)
const PanelCtx = createContext(() => {});

/** Enlace a un registro: abre el panel lateral si se puede; si no, navega. */
function Registro({ ruta, className, title, children }) {
  const abrir = useContext(PanelCtx);
  const destino = panelDesdeRuta(ruta);
  if (!destino) return <Link to={ruta} className={className} title={title}>{children}</Link>;
  return (
    <button type="button" className={className} title={title} onClick={() => abrir(destino.modulo, destino.id)}>
      {children}
    </button>
  );
}

// ── 1. Diagnóstico del sistema ──────────────────────────────────────────────
/** Cifra en línea (sin tarjeta): valor, etiqueta y contexto; abre su lista en el módulo. */
function Cifra({ etiqueta, valor, tono = "neutral", sub, ruta, titulo }) {
  const Tag = ruta ? Link : "div";
  return (
    <Tag to={ruta} className={`dg-cifra t-${tono}`} title={titulo}>
      <span className="dg-cifra__valor">{valor}</span>
      <span className="dg-cifra__etq">{etiqueta}</span>
      {sub && <span className="dg-cifra__sub">{sub}</span>}
    </Tag>
  );
}

function DiagnosticoSistema({ d, diag, generando, errorDiag, onAnalizar }) {
  const [criterios, setCriterios] = useState(false);
  const k = Object.fromEntries(d.kpis.map((x) => [x.id, x]));
  const fueraMeta = d.indicadores.filter((i) => i.semaforo === "rojo").length;
  const medidos = d.indicadores.filter((i) => i.semaforo).length;
  const { critica, alta, media } = d.conteo;
  const total = critica + alta + media;
  const vs = (x) => (x?.comparacion && x.comparacion.valor != null ? `${x.comparacion.valor} ${x.comparacion.texto}` : null);
  const desde = d.muestra.desde ? new Date(d.muestra.desde).toLocaleDateString("es-MX", { month: "short", year: "numeric", timeZone: "UTC" }) : null;
  // Síntesis: la del análisis de contexto si existe; si no, una frase calculada de los registros
  const sintesis = diag?.estadoGeneral;
  const calculada = total
    ? `${total} ${total === 1 ? "situación requiere" : "situaciones requieren"} atención${critica ? `, ${critica} ${critica === 1 ? "crítica" : "críticas"}` : ""}.`
    : "No se detectaron situaciones que requieran atención con los criterios actuales.";
  return (
    <section className="pnl dg" aria-label="Diagnóstico del sistema">
      <header className="dg__head">
        <div>
          <h2>Diagnóstico del sistema</h2>
          <span className="dg__meta">Datos al {fechaHora(d.generado)} · {d.muestra.ncs} NCs y {d.muestra.acs} ACs{desde ? ` desde ${desde}` : ""}{d.alcance === "personal" ? " · tus registros" : ""}</span>
        </div>
        <div className="dg__acciones">
          <button type="button" className="dg-btn" onClick={() => setCriterios((v) => !v)} aria-expanded={criterios}>Criterios del análisis</button>
          <button type="button" className="dg-btn" onClick={onAnalizar} disabled={generando} title="Interpreta las cifras y hallazgos actuales; no modifica registros">
            <i className={`ti ${generando ? "ti-loader-2 giro" : "ti-refresh"}`} /> {generando ? "Actualizando análisis…" : diag ? "Actualizar análisis de contexto" : "Generar análisis de contexto"}
          </button>
        </div>
      </header>
      {criterios && <ul className="dg__criterios">{d.metodologia.map((m) => <li key={m}>{m}</li>)}</ul>}

      <div className="dg__cuerpo">
        <div className="dg__sintesis">
          <p className={`dg__texto${generando ? " is-actualizando" : ""}`}>{sintesis || calculada}</p>
          <span className="dg__origen">
            {sintesis
              ? <>Análisis de contexto · {hace(diag.fecha)}{diag.vigente ? "" : " · los datos cambiaron después"}</>
              : "Cálculo con los registros del SGC"}
          </span>
          {errorDiag && <span className="dg__error"><i className="ti ti-alert-circle" /> {errorDiag}</span>}
        </div>
        <div className="dg__cifras">
          <Cifra etiqueta="Hallazgos relevantes" valor={total} tono={critica ? "danger" : total ? "orange" : "ok"}
            sub={total ? [critica && `${critica} crítica${critica === 1 ? "" : "s"}`, alta && `${alta} atención`, media && `${media} seguimiento`].filter(Boolean).join(" · ") : "Sin pendientes"} />
          {k["nc-abiertas"] && <Cifra etiqueta="NCs pendientes" valor={k["nc-abiertas"].valor} ruta={k["nc-abiertas"].ruta}
            tono={k["nc-vencidas"]?.valor ? "danger" : "neutral"} sub={`${k["nc-vencidas"]?.valor ?? 0} vencidas${vs(k["nc-vencidas"]) ? ` (${vs(k["nc-vencidas"])})` : ""}`} />}
          {k["ac-vencidas"] && <Cifra etiqueta="ACs vencidas" valor={k["ac-vencidas"].valor} ruta={k["ac-vencidas"].ruta}
            tono={k["ac-vencidas"].valor ? "danger" : "ok"} sub={k["ac-vencidas"].sub} />}
          {k.eficacia && <Cifra etiqueta="Eficacia de ACs" valor={k.eficacia.valor == null ? "—" : `${k.eficacia.valor}%`} ruta={k.eficacia.ruta}
            tono={k.eficacia.valor == null ? "neutral" : k.eficacia.meta != null && k.eficacia.valor < k.eficacia.meta ? "orange" : "ok"}
            sub={k.eficacia.meta != null ? `meta ${k.eficacia.meta}%` : k.eficacia.sub} titulo={k.eficacia.sub} />}
          {d.alcance === "empresa" && <Cifra etiqueta="Indicadores fuera de meta" valor={medidos ? fueraMeta : "—"} ruta="/sgc/indicadores?semaforo=rojo"
            tono={fueraMeta ? "danger" : "ok"} sub={medidos ? `de ${medidos} con medición` : "sin mediciones"} />}
          {k.programa && <Cifra etiqueta="Programa de auditorías" valor={k.programa.valor == null ? "—" : `${k.programa.valor}/${k.programa.total}`} ruta={k.programa.ruta}
            tono={k.programa.estado === "atencion" ? "orange" : "neutral"} sub="realizadas a la fecha" titulo={k.programa.sub} />}
          {k.cierre && <Cifra etiqueta="Días para cerrar una NC" valor={k.cierre.valor ?? "—"} ruta={k.cierre.ruta}
            sub={vs(k.cierre) ? `vs ${vs(k.cierre)}` : k.cierre.sub} titulo={k.cierre.sub} />}
        </div>
      </div>
    </section>
  );
}

// ── 2. Hallazgos relevantes ─────────────────────────────────────────────────
function Hallazgo({ p, analisis, abierto, onToggle }) {
  const abrir = useContext(PanelCtx);
  const n = NIVEL[p.nivel];
  const primero = p.evidencia.map((e) => panelDesdeRuta(e.ruta)).find(Boolean);
  return (
    <li className={`dg-hall t-${n.tono}${abierto ? " is-abierto" : ""}`} id={`prio-${p.id}`}>
      <button type="button" className="dg-hall__fila" onClick={onToggle} aria-expanded={abierto}>
        <span className="dg-hall__nivel">{n.label}</span>
        <span className="dg-hall__txt">
          <span className="dg-hall__titulo">{p.titulo}</span>
          <span className="dg-hall__dato">{p.detalle}</span>
        </span>
        <span className="dg-hall__meta">
          {p.proceso && <span>{p.proceso}</span>}
          <span>{p.evidencia.length} {p.evidencia.length === 1 ? "registro" : "registros"}</span>
          <i className={`ti ti-chevron-${abierto ? "up" : "down"}`} aria-hidden="true" />
        </span>
      </button>

      {abierto && (
        <div className="dg-hall__ficha">
          <dl className="dg-ficha">
            <dt>Situación</dt>
            <dd>{p.detalle}<span className="dg-origen">Cálculo del sistema</span></dd>
            <dt>Por qué importa</dt>
            <dd>{p.porque}</dd>
            <dt>Acción sugerida</dt>
            <dd>{p.accion}</dd>
            {p.falta && <><dt>Por confirmar</dt><dd>{p.falta}</dd></>}
            <dt>Registros relacionados</dt>
            <dd>
              <div className="dg-regs">
                {p.evidencia.map((e) => (
                  <Registro key={`${e.folio}${e.ruta}`} ruta={e.ruta} className="dg-reg" title="Consultar registro">
                    <b>{e.folio}</b><span>{e.texto}</span>
                  </Registro>
                ))}
              </div>
            </dd>
            {analisis && (
              <>
                <dt>Análisis de contexto</dt>
                <dd className="dg-contexto">
                  <span className="dg-contexto__tipo">{TIPO_ANALISIS[analisis.tipo]}</span>
                  {analisis.explicacion && <p>{analisis.explicacion}</p>}
                  {analisis.siNoSeAtiende && <p><b>Si no se atiende:</b> {analisis.siNoSeAtiende}</p>}
                  {analisis.informacionFaltante && <p className="muted">Para confirmarlo: {analisis.informacionFaltante}</p>}
                </dd>
              </>
            )}
          </dl>
          <div className="dg-hall__botones">
            {primero && <button type="button" className="dg-btn" onClick={() => abrir(primero.modulo, primero.id)}>Consultar registros</button>}
            <Link to={p.ruta} className="dg-btn">Ir al módulo</Link>
          </div>
        </div>
      )}
    </li>
  );
}

/** Observación del análisis que no corresponde a un hallazgo calculado (riesgo, tendencia, hipótesis). */
function Observacion({ h, abierto, onToggle }) {
  return (
    <li className={`dg-hall t-neutral${abierto ? " is-abierto" : ""}`}>
      <button type="button" className="dg-hall__fila" onClick={onToggle} aria-expanded={abierto}>
        <span className="dg-hall__nivel">{TIPO_ANALISIS[h.tipo]}</span>
        <span className="dg-hall__txt">
          <span className="dg-hall__titulo">{h.titulo}</span>
          <span className="dg-hall__dato">{h.resumen || h.explicacion}</span>
        </span>
        <span className="dg-hall__meta"><i className={`ti ti-chevron-${abierto ? "up" : "down"}`} aria-hidden="true" /></span>
      </button>
      {abierto && (
        <div className="dg-hall__ficha">
          <dl className="dg-ficha">
            {h.explicacion && <><dt>Análisis</dt><dd>{h.explicacion}</dd></>}
            {h.porQueImporta && <><dt>Por qué importa</dt><dd>{h.porQueImporta}</dd></>}
            {h.recomendacion && <><dt>Acción sugerida</dt><dd>{h.recomendacion}</dd></>}
            {h.informacionFaltante && <><dt>Por confirmar</dt><dd>{h.informacionFaltante}</dd></>}
            <dt>Registros relacionados</dt>
            <dd>
              {h.sinEvidencia ? <span className="muted">Sin registros que lo respalden: tómalo como hipótesis.</span> : (
                <div className="dg-regs">{h.evidencia.map((e) => <Registro key={e.ref} ruta={e.ruta} className="dg-reg"><b>{e.ref}</b></Registro>)}</div>
              )}
            </dd>
          </dl>
        </div>
      )}
    </li>
  );
}

function Hallazgos({ d, diag }) {
  const [abierto, setAbierto] = useState(null); // uno a la vez
  const toggle = (id) => setAbierto((a) => (a === id ? null : id));
  // Cada hallazgo calculado lleva su análisis de contexto (si el análisis lo referencia)
  const porRef = new Map((diag?.hallazgos || []).filter((h) => h.prioridadRef).map((h) => [h.prioridadRef, h]));
  // Las que no corresponden a un hallazgo calculado se listan aparte (sin repetir ninguna)
  const otras = (diag?.hallazgos || []).filter((h) => !h.prioridadRef || !d.prioridades.some((p) => p.id === h.prioridadRef));
  return (
    <section className="pnl dg-col" aria-label="Hallazgos relevantes" id="ci-prioridades">
      <header className="dg-col__head">
        <h2>Hallazgos relevantes <span className="dg-cuenta">{d.prioridades.length}</span></h2>
        <span className="dg-col__sub">De mayor a menor importancia</span>
      </header>
      {!d.prioridades.length ? (
        <div className="ci-vacio">Sin situaciones que requieran atención.</div>
      ) : (
        <ol className="dg-lista">
          {d.prioridades.map((p) => <Hallazgo key={p.id} p={p} analisis={porRef.get(p.id)} abierto={abierto === p.id} onToggle={() => toggle(p.id)} />)}
        </ol>
      )}
      {otras.length > 0 && (
        <>
          <div className="dg-col__sep">Otras observaciones del análisis</div>
          <ol className="dg-lista">
            {otras.map((h, i) => <Observacion key={`o${i}`} h={h} abierto={abierto === `o${i}`} onToggle={() => toggle(`o${i}`)} />)}
          </ol>
        </>
      )}
    </section>
  );
}

// ── 3. Prioridades de atención ──────────────────────────────────────────────
function Prioridades({ d, diag, generando }) {
  const titulos = Object.fromEntries(d.prioridades.map((p) => [p.id, p.titulo]));
  const irHallazgo = (id) => document.getElementById(`prio-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  // Con análisis de contexto: sus acciones sugeridas. Sin él: la acción de cada hallazgo calculado.
  const sugeridas = diag?.recomendaciones?.length
    ? diag.recomendaciones.map((r) => ({ accion: r.accion, motivo: r.motivo, responsable: r.responsable, plazo: r.plazo, referencia: r.referencia, ref: r.prioridadRef }))
    : d.prioridades.map((p) => ({ accion: p.accion, motivo: p.titulo, referencia: p.evidencia[0] ? { ref: p.evidencia[0].folio, ruta: p.evidencia[0].ruta } : null, ref: p.id, calculada: true }));
  return (
    <section className={`pnl dg-col${generando ? " is-actualizando" : ""}`} aria-label="Prioridades de atención">
      <header className="dg-col__head">
        <h2>Prioridades de atención</h2>
        <span className="dg-col__sub">Acciones sugeridas, sujetas a validación</span>
      </header>
      {!sugeridas.length ? (
        <div className="ci-vacio">Sin acciones pendientes.</div>
      ) : (
        <ol className="dg-acciones">
          {sugeridas.map((s, i) => (
            <li key={i}>
              <span className="dg-acciones__num">{i + 1}</span>
              <div className="dg-acciones__txt">
                <b>{s.accion}</b>
                {s.motivo && !s.calculada && <span>{s.motivo}</span>}
                <span className="dg-acciones__meta">
                  {s.referencia && <Registro ruta={s.referencia.ruta} className="dg-reg dg-reg--mini"><b>{s.referencia.ref}</b></Registro>}
                  {s.responsable && <span>{s.responsable}</span>}
                  {s.plazo && <span>{s.plazo}</span>}
                  {s.ref && titulos[s.ref] && (
                    <button type="button" className="dg-acciones__rel" onClick={() => irHallazgo(s.ref)} title="Ver el hallazgo relacionado">{titulos[s.ref]}</button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <footer className="dg-col__pie">
        {diag?.recomendaciones?.length ? (
          <>
            <p>{LEYENDA}</p>
            {diag.limitaciones?.length > 0 && (
              <details>
                <summary>Límites del análisis ({diag.limitaciones.length})</summary>
                <ul>{diag.limitaciones.map((l) => <li key={l}>{l}</li>)}</ul>
              </details>
            )}
          </>
        ) : (
          <p>Acciones calculadas a partir de los criterios del sistema. Genera el análisis de contexto para priorizarlas con más detalle.</p>
        )}
      </footer>
    </section>
  );
}

// ── 4. Objetivos de calidad y procesos ──────────────────────────────────────
function Objetivos({ lista }) {
  const abrir = useContext(PanelCtx);
  const SEM = { verde: ["ok", "En meta"], amarillo: ["warn", "En riesgo"], rojo: ["danger", "Fuera de meta"] };
  const TEND = { mejora: ["ti-trending-up", "t-ok", "Mejora"], empeora: ["ti-trending-down", "t-danger", "Empeora"], igual: ["ti-minus", "", "Igual"] };
  return (
    <section className="pnl ci-panel" aria-label="Objetivos de calidad">
      <header className="ci-panel__head">
        <h2><i className="ti ti-target-arrow" /> Objetivos de calidad</h2>
        <Link to="/sgc/indicadores" className="ci-info">Módulo <i className="ti ti-arrow-right" /></Link>
      </header>
      <ul className="ci-obj">
        {lista.map((i) => {
          const [tono, estado] = SEM[i.semaforo] || ["neutral", "Sin medición"];
          const t = TEND[i.tendencia];
          return (
            <li key={i.idIndicador}>
              <button type="button" className="ci-obj__fila" onClick={() => abrir("indicador", i.idIndicador)} title="Ver detalle">
                <span className={`ci-obj__sem t-${tono}`} title={estado} />
                <span className="ci-obj__nombre"><b>{i.nombre}</b><small>{i.clave} · {estado}{i.atrasado ? " · medición atrasada" : ""}</small></span>
                <span className={`ci-obj__valor num t-${tono}`}>{i.ultimo ?? "—"}{i.ultimo != null && i.unidad === "%" ? "%" : ""}</span>
                <span className="ci-obj__meta num">meta {i.sentido === 2 ? "≤" : "≥"} {i.meta}</span>
                <span className={`ci-obj__tend ${t?.[1] || ""}`} title={t ? `${t[2]} respecto a la medición anterior` : "Sin medición anterior"}>
                  {t ? <><i className={`ti ${t[0]}`} /> {t[2]}</> : <span className="muted">—</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Procesos({ filas }) {
  const max = Math.max(1, ...filas.map((f) => f.nc12m));
  return (
    <section className="pnl ci-panel" aria-label="Problemas por proceso">
      <header className="ci-panel__head">
        <h2><i className="ti ti-hierarchy-3" /> Dónde se acumulan los problemas</h2>
        <Link to="/sgc/procesos" className="ci-info">Mapa <i className="ti ti-arrow-right" /></Link>
      </header>
      {!filas.length ? (
        <div className="ci-vacio">Ningún proceso con NCs vinculadas.</div>
      ) : (
        <table className="ci-tabla">
          <thead>
            <tr><th>Proceso</th><th className="der" title="NCs abiertas">Abiertas</th><th className="der" title="NCs vencidas">Vencidas</th><th className="der" title="ACs abiertas / vencidas">ACs</th><th title="NCs en 12 meses">12 meses</th></tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.idProceso}>
                <td>
                  <Link to={`/sgc/no-conformidades?proceso=${f.idProceso}`} className="ci-tabla__proc" title="Ver sus NCs en el módulo">
                    <i style={{ background: PROCESO_TIPO[f.tipo]?.color }} /> {f.nombre}
                    {f.ncMayores > 0 && <span className="ci-tabla__mayor" title={`${f.ncMayores} NC Mayor abierta`}>{f.ncMayores} Mayor</span>}
                  </Link>
                </td>
                <td className="der num">{f.ncAbiertas || <span className="muted">0</span>}</td>
                <td className={`der num${f.ncVencidas ? " t-danger tinta" : ""}`}>{f.ncVencidas || <span className="muted">0</span>}</td>
                <td className="der num">{f.acAbiertas}{f.acVencidas ? <span className="t-danger tinta"> / {f.acVencidas}</span> : ""}</td>
                <td><span className="ci-barra"><i style={{ width: `${(100 * f.nc12m) / max}%` }} /><b>{f.nc12m}</b></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── 5. Tendencia y preguntas ────────────────────────────────────────────────
function Tendencia({ serie }) {
  // Desde el primer mes con datos (mínimo los últimos 4 meses): sin meses vacíos de relleno
  const primero = serie.findIndex((t) => t.ncRegistradas || t.ncCerradas || t.acCerradas);
  const desde = primero === -1 ? serie.length - 4 : Math.min(primero, serie.length - 4);
  const datos = serie.slice(Math.max(0, desde)).map((t) => ({ mes: mesCorto(String(t.mes)), registradas: t.ncRegistradas, cerradas: t.ncCerradas, acCerradas: t.acCerradas }));
  const reg = datos.reduce((a, t) => a + t.registradas, 0);
  const cer = datos.reduce((a, t) => a + t.cerradas, 0);
  return (
    <section className="pnl ci-panel" aria-label="Tendencia mensual">
      <header className="ci-panel__head">
        <h2><i className="ti ti-chart-histogram" /> ¿Se cierra al ritmo que se abre?</h2>
        <span className={`ci-balance t-${reg > cer ? "warn" : "ok"}`}>{reg} registradas · {cer} cerradas</span>
      </header>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={datos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--brand-soft)" }} contentStyle={{ borderRadius: 10, border: "1px solid var(--line)", fontSize: 12 }} />
          <Bar dataKey="registradas" name="NCs registradas" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="cerradas" name="NCs cerradas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Line dataKey="acCerradas" name="ACs cerradas" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="ci-leyenda">
        <span><i style={{ background: "#ef4444" }} /> NCs registradas</span>
        <span><i style={{ background: "#10b981" }} /> NCs cerradas</span>
        <span><i style={{ background: "#8b5cf6" }} /> ACs cerradas</span>
      </div>
    </section>
  );
}

function Preguntar() {
  const [q, setQ] = useState("");
  const enviar = (texto) => {
    const t = texto.trim();
    if (!t) return;
    window.dispatchEvent(new CustomEvent("sgc:abrirFabi", { detail: { pregunta: t } }));
    setQ("");
  };
  return (
    <section className="pnl ci-panel ci-preg" aria-label="Consultar el SGC">
      <header className="ci-panel__head">
        <h2><i className="ti ti-message-question" /> Consultar el SGC</h2>
      </header>
      <form className="ci-preg__form" onSubmit={(e) => { e.preventDefault(); enviar(q); }}>
        <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ej. ¿Por qué tenemos tantas NCs en Producción?" aria-label="Pregunta" />
        <button type="submit" className="btn btn--primario" disabled={!q.trim()} aria-label="Preguntar"><i className="ti ti-arrow-up" /></button>
      </form>
      <div className="ci-preg__chips">
        {PREGUNTAS.map((p) => <button key={p} type="button" onClick={() => enviar(p)}>{p}</button>)}
      </div>
      <p className="ci-preg__nota">Las respuestas usan los mismos registros y criterios de este diagnóstico.</p>
    </section>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function DashboardSGC() {
  const navigate = useNavigate();
  const toast = useToast();
  const { rol } = useOutletContext();
  const { data: d, error, cargando, recargar } = useSgc(() => sgcApi("/inteligencia"));
  const diagCarga = useSgc(() => sgcApi("/inteligencia/diagnostico"));
  const [diagNuevo, setDiagNuevo] = useState(null);
  const [generando, setGenerando] = useState(false);
  const [errorDiag, setErrorDiag] = useState(null);
  const [panel, setPanel] = useState(null); // { modulo, id } abierto en el panel lateral
  useMigas([{ label: "Centro de control" }]);
  // Entrada al SGI: la transición se retira cuando el tablero tiene sus datos (o un error que mostrar)
  useAvisarListo(!!d || !!error);

  const diag = diagNuevo || diagCarga.data;
  const puedeCrear = rol === 1 || rol === 3;
  const abrirPanel = useCallback((modulo, id) => setPanel({ modulo, id }), []);
  const cerrarPanel = useCallback(() => setPanel(null), []);

  // El análisis de contexto solo actualiza su parte (el resto del tablero no se recarga)
  const analizar = async () => {
    try {
      setGenerando(true);
      setErrorDiag(null);
      const r = await sgcApi("/inteligencia/diagnostico", { method: "POST" });
      setDiagNuevo(r);
      if (r.reutilizado) toast.aviso("Los datos no cambiaron: se conserva el análisis más reciente.");
    } catch (err) {
      setErrorDiag(err.message);
    } finally {
      setGenerando(false);
    }
  };

  return (
    <PanelCtx.Provider value={abrirPanel}>
      <div className="sg-page dash-page ci-page">
        <Encabezado
          titulo="Centro de control"
          acciones={
            <>
              <button className="btn" onClick={() => { recargar(); diagCarga.recargar(); }} disabled={cargando} aria-label="Actualizar datos" title="Actualizar datos">
                <i className={`ti ti-refresh${cargando ? " giro" : ""}`} />
              </button>
              {puedeCrear && (
                <button className="btn btn--primario" onClick={() => navigate("/sgc/no-conformidades/nueva")}>
                  <i className="ti ti-plus" /> Nueva NC
                </button>
              )}
            </>
          }
        />

        {error && !d ? (
          <div className="pnl"><ErrorCarga error={error} onReintentar={recargar} /></div>
        ) : !d ? (
          <div className="ci-skel"><div className="pnl"><Skel filas={3} /></div><div className="pnl"><Skel filas={8} /></div></div>
        ) : (
          <div className={`ci${cargando ? " recargando" : ""}`}>
            <DiagnosticoSistema d={d} diag={diag} generando={generando} errorDiag={errorDiag} onAnalizar={analizar} />

            {/* Hallazgos (izq.) y las acciones que se derivan de ellos (der.), con la misma altura */}
            <div className="dg-fila">
              <Hallazgos d={d} diag={diag} />
              <Prioridades d={d} diag={diag} generando={generando} />
            </div>

            {d.alcance === "empresa" ? (
              <>
                <div className="ci-fila">
                  <Objetivos lista={d.indicadores} />
                  <Procesos filas={d.procesos} />
                </div>
                <div className="ci-fila">
                  <Tendencia serie={d.tendencia} />
                  <Preguntar />
                </div>
              </>
            ) : (
              <div className="ci-fila">
                <Tendencia serie={d.tendencia} />
                <Preguntar />
              </div>
            )}

            <MisPendientes onVer={abrirPanel} />

            {d.datosFaltantes?.length > 0 && (
              <details className="ci-faltantes">
                <summary><i className="ti ti-database-question" /> Información que el sistema aún no registra y limita este diagnóstico</summary>
                <ul>{d.datosFaltantes.map((x) => <li key={x}>{x}</li>)}</ul>
              </details>
            )}
          </div>
        )}

        {/* Detalle de registros: panel lateral existente, sobre el tablero (no se navega) */}
        {panel && (
          <PanelLateral
            key={`${panel.modulo}-${panel.id}`}
            registro={{ id: panel.id }}
            modulo={panel.modulo}
            onClose={cerrarPanel}
            onAbrirCompleto={(m, id) => navigate(RUTA_COMPLETA[m](id))}
          />
        )}
      </div>
    </PanelCtx.Provider>
  );
}
