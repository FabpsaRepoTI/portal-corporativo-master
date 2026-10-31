// components/sgc/PanelLateral.jsx
// Panel lateral contextual del SGC (generaliza el cajón de Riesgos): consulta un
// registro sin salir de la lista. Dentro de <PanelSplit> ocupa la columna derecha;
// con modo="cajon" se superpone (pantallas donde la derecha ya está ocupada).
//   registro         { id, folio? }  — el panel carga el resto
//   modulo           'nc' | 'ac' | 'auditoria' | 'indicador' | 'documento'
//   onClose()        cierra el panel
//   onAbrirCompleto(modulo, id)  abre la vista completa del registro mostrado
//   onEditar?(modulo, id) / onComentar?(modulo, id) — el botón aparece solo si se da
// Los vínculos ("Conectado con") abren el registro relacionado en el mismo panel.
import { useEffect, useState } from "react";
import { sgcApi, useSgc, fechaCorta, fechaHora, periodoLabel, NC_ESTATUS, AC_ESTATUS, AUD_ESTATUS, AUD_TIPO, HALLAZGO_TIPO, SEMAFORO, FRECUENCIA } from "../../pages/sgc/sgcApi";
import { Dato, ErrorCarga, Persona, Skel, Spark, Vence } from "../../pages/sgc/components/ui";
import TimelineCaso from "./TimelineCaso";

const DOC_ESTATUS = { 1: { label: "Borrador", tono: "neutral" }, 2: { label: "En revisión", tono: "info" }, 3: { label: "Vigente", tono: "ok" }, 4: { label: "Obsoleto", tono: "danger" } };
const DOC_TIPO = { 1: "Procedimiento", 2: "Instructivo", 3: "Formato", 4: "Registro", 5: "Manual" };
const KICKER = { nc: "No conformidad", ac: "Acción correctiva", auditoria: "Auditoría", indicador: "Indicador", documento: "Documento", riesgo: "Riesgo" };
const ICONO = { nc: "ti-alert-circle", ac: "ti-circle-check", auditoria: "ti-clipboard-check", indicador: "ti-chart-bar", documento: "ti-file-text", riesgo: "ti-shield-exclamation" };
const RIESGO_ESTATUS = { 1: { label: "Activo", tono: "warn" }, 2: { label: "Mitigado", tono: "ok" }, 3: { label: "Aceptado", tono: "neutral" } };

const CARGAR = {
  nc: (id) => sgcApi(`/caso/nc/${id}`),
  ac: (id) => sgcApi(`/caso/ac/${id}`),
  auditoria: (id) => sgcApi(`/auditorias/${id}`),
  indicador: (id) => sgcApi(`/indicadores/${id}`),
  documento: (id) => sgcApi(`/documentos/${id}`),
  riesgo: (id) => sgcApi(`/riesgos/${id}`),
};

/** Respuesta de cada endpoint → { folio, titulo, estatus, texto, campos[] } */
function normalizar(modulo, d) {
  if (modulo === "nc" || modulo === "ac") {
    const r = d.registro;
    const cerrada = modulo === "nc" ? [5, 6].includes(r.idEstatus) : [4, 5].includes(r.idEstatus);
    const campos = modulo === "nc"
      ? [["Clasificación", r.clasificacion], ["Origen", r.origen], ["Afectación", r.afectacion || "—"], ["Proceso", r.proceso || "—"]]
      : [["Avance", r.pctAvance != null ? `${r.pctAvance}%` : "—"], ["Proceso", r.proceso || "—"]];
    return {
      folio: r.folio,
      titulo: r.descripcion,
      estatus: (modulo === "nc" ? NC_ESTATUS : AC_ESTATUS)[r.idEstatus],
      texto: modulo === "nc" ? r.descripcionDetallada : r.causaRaiz || r.d4_causaRaiz,
      etiquetaTexto: modulo === "nc" ? "Detalle" : "Causa raíz",
      campos: [
        ["Responsable", <Persona nombre={r.responsable} login={r.loginResponsable} />],
        ["Compromiso", <Vence fecha={r.fechaCompromiso} dias={r.diasRestantes} cerrada={cerrada} />],
        ...campos,
      ],
    };
  }
  if (modulo === "auditoria") {
    const hallazgosNC = d.hallazgos.filter((h) => h.tipo === 1).length;
    return {
      folio: d.folio,
      titulo: d.titulo,
      estatus: AUD_ESTATUS[d.idEstatus],
      texto: d.alcance,
      etiquetaTexto: "Alcance",
      campos: [
        ["Tipo", AUD_TIPO[d.tipo]],
        ["Fechas", `${fechaCorta(d.fechaInicio)} – ${fechaCorta(d.fechaFin)}`],
        ["Auditor líder", <Persona nombre={d.auditorLider} login={d.loginAuditor} />],
        ["Norma", d.normaAplicable || "—"],
        ["Hallazgos", `${d.hallazgos.length} (${hallazgosNC} NC)`],
        ["Áreas", d.areas.map((a) => a.departamento).join(", ") || "—"],
      ],
      vinculos: d.hallazgos.filter((h) => h.idNC).map((h) => ({ modulo: "nc", id: h.idNC, folio: h.folioNC, sub: h.estatusNCLabel })),
      hallazgos: d.hallazgos,
    };
  }
  if (modulo === "indicador") {
    const s = SEMAFORO[d.semaforo];
    return {
      folio: d.clave,
      titulo: d.nombre,
      estatus: s || { label: "Sin medición", tono: "neutral" },
      texto: d.descripcion,
      etiquetaTexto: "Descripción",
      campos: [
        ["Último valor", d.ultimoValor != null ? `${d.ultimoValor} ${d.unidad || ""}` : "—"],
        ["Meta", d.meta != null ? `${d.meta} ${d.unidad || ""}` : "—"],
        ["Frecuencia", FRECUENCIA[d.frecuencia] || "—"],
        ["Responsable", <Persona nombre={d.responsable} login={d.loginResponsable} />],
        ["Cláusula ISO", d.clausulaISO || "—"],
        ["Mediciones", d.valores?.length ?? 0],
      ],
      // Evolución (como el gráfico de Riesgos): últimas 12 mediciones
      evolucion: { serie: (d.valores || []).slice(-12).map((v) => ({ valor: v.valor })), meta: d.meta, tono: s?.tono || "brand", valores: [...(d.valores || [])].reverse().slice(0, 6), unidad: d.unidad },
    };
  }
  if (modulo === "riesgo") {
    const nivel = d.nivel ?? d.probabilidad * d.impacto;
    return {
      folio: `Nivel ${nivel}`,
      titulo: d.nombre,
      estatus: RIESGO_ESTATUS[d.idEstatus],
      texto: d.descripcion,
      etiquetaTexto: "Descripción",
      campos: [
        ["Probabilidad × impacto", `${d.probabilidad} × ${d.impacto} = ${nivel}`],
        ["Categoría", d.categoriaLabel || "—"],
        ["Responsable", <Persona nombre={d.responsable} login={d.loginResponsable} />],
        ["Impacto económico", d.impactoEconomico != null ? `$${Math.round(Number(d.impactoEconomico)).toLocaleString("es-MX")} MXN` : "—"],
        ["Próxima revisión", d.fechaRevision ? fechaCorta(d.fechaRevision) : "Sin fecha"],
        ["Plan de tratamiento", d.planTratamiento || "Sin plan registrado"],
      ],
    };
  }
  return {
    folio: d.codigo,
    titulo: d.titulo,
    estatus: DOC_ESTATUS[d.idEstatus],
    texto: null,
    campos: [
      ["Tipo", DOC_TIPO[d.tipo] || "—"],
      ["Versión", d.version ? `v${d.version}` : "—"],
      ["Cláusula ISO", d.clausulaISO || "—"],
      ["Vencimiento", d.fechaVencimiento ? fechaCorta(d.fechaVencimiento) : "—"],
      ["Carpeta", d.spCarpeta || "—"],
      ["Versiones", d.versiones?.length ?? 0],
    ],
  };
}

export default function PanelLateral({ registro, modulo, onClose, onAbrirCompleto, onEditar, onComentar, modo = "cajon" }) {
  // Pila de navegación interna: el registro inicial y los vínculos abiertos desde él
  const [pila, setPila] = useState([{ modulo, id: registro.id }]);
  useEffect(() => setPila([{ modulo, id: registro.id }]), [modulo, registro.id]);
  const actual = pila[pila.length - 1];
  const { data, error, cargando, recargar } = useSgc(() => CARGAR[actual.modulo](actual.id), [actual.modulo, actual.id]);
  const listo = data && !cargando;
  const v = listo ? normalizar(actual.modulo, data) : null;

  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const abrirVinculo = (m, id) => setPila((p) => [...p, { modulo: m, id }]);

  const panel = (
    <aside className={`cajon pl${modo === "columna" ? " pl--columna" : ""}`} aria-label={`Detalle: ${KICKER[actual.modulo]}`}>
      <header className="cajon__head">
        <div className="pl__head">
          <span className="cajon__kicker">
            {pila.length > 1 && (
              <button type="button" className="pl__atras" onClick={() => setPila((p) => p.slice(0, -1))} aria-label="Volver al registro anterior">
                <i className="ti ti-arrow-left" />
              </button>
            )}
            <i className={`ti ${ICONO[actual.modulo]}`} /> {KICKER[actual.modulo]}
          </span>
          <div className="pl__folio">
            <span className="mp-folio">{v?.folio || registro.folio || "…"}</span>
            {v?.estatus && <span className={`tag t-${v.estatus.tono}`}>{v.estatus.label}</span>}
          </div>
          <h2>{v?.titulo || " "}</h2>
        </div>
        <button className="btn btn--fantasma btn--icono" onClick={onClose} aria-label="Cerrar panel"><i className="ti ti-x" /></button>
      </header>

      <div className="cajon__cuerpo">
        {error ? (
          <ErrorCarga error={error} onReintentar={recargar} />
        ) : !v ? (
          <Skel filas={7} />
        ) : (
          <>
            <div className="cajon__datos">
              {v.campos.map(([label, valor]) => <Dato key={label} label={label}>{valor}</Dato>)}
            </div>
            {v.texto && (
              <div className="cajon__bloque"><h3>{v.etiquetaTexto}</h3><p>{v.texto}</p></div>
            )}
            {(actual.modulo === "nc" || actual.modulo === "ac") && <TimelineCaso caso={data} onAbrir={abrirVinculo} />}
            {v.vinculos && (
              <div className="cajon__bloque">
                <h3>Vinculado con</h3>
                {v.vinculos.length ? (
                  <div className="tl-badges">
                    {v.vinculos.map((x) => (
                      <button key={`${x.modulo}${x.id}`} type="button" className="tl-badge is-link" onClick={() => abrirVinculo(x.modulo, x.id)}>
                        <i className="ti ti-alert-circle" /><span className="tl-badge__txt">{x.folio}</span>{x.sub && <span className="tl-badge__sub">{x.sub}</span>}
                      </button>
                    ))}
                  </div>
                ) : <p className="muted">Ningún hallazgo ha generado NC.</p>}
              </div>
            )}
            {v.hallazgos && (
              <div className="cajon__bloque">
                <h3>Hallazgos <span className="cuenta">{v.hallazgos.length}</span></h3>
                {!v.hallazgos.length ? <p className="muted">Sin hallazgos registrados.</p> : (
                  <ol className="evolucion">
                    {v.hallazgos.map((h) => (
                      <li key={h.idHallazgo}>
                        <span className={`tag t-${HALLAZGO_TIPO[h.tipo]?.tono || "neutral"}`}>{HALLAZGO_TIPO[h.tipo]?.corto || "—"}</span>
                        <div>
                          <p>{h.descripcion}</p>
                          <small>{[h.clausulaISO && `Cl. ${h.clausulaISO}`, h.responsable, h.folioNC].filter(Boolean).join(" · ") || "—"}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            {v.evolucion && (
              <div className="cajon__bloque">
                <h3>Evolución</h3>
                {v.evolucion.serie.length ? (
                  <>
                    <div className="cajon__spark"><Spark serie={v.evolucion.serie} meta={v.evolucion.meta} tono={v.evolucion.tono} /></div>
                    <ol className="evolucion">
                      {v.evolucion.valores.map((x) => (
                        <li key={x.idValor}>
                          <span className={`tag t-${SEMAFORO[x.semaforo]?.tono || "neutral"}`}>{x.valor} {v.evolucion.unidad || ""}</span>
                          <div>
                            <p>{periodoLabel(x.periodo)}{x.observaciones ? ` · ${x.observaciones}` : ""}</p>
                            <small>{x.nombre || x.login} · {fechaHora(x.fechaRegistro)}</small>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : <p className="muted">Aún no hay mediciones.</p>}
              </div>
            )}
          </>
        )}
      </div>

      <footer className="cajon__pie">
        {onEditar && <button className="btn" onClick={() => onEditar(actual.modulo, actual.id)}><i className="ti ti-pencil" /> Editar</button>}
        {onComentar && <button className="btn" onClick={() => onComentar(actual.modulo, actual.id)}><i className="ti ti-message" /> Comentar</button>}
        <button className="btn btn--primario" onClick={() => onAbrirCompleto(actual.modulo, actual.id)}>
          <i className="ti ti-arrows-maximize" /> Abrir completo
        </button>
      </footer>
    </aside>
  );

  if (modo === "columna") return panel;
  return (
    <>
      <div className="cajon-fondo" onClick={onClose} />
      {panel}
    </>
  );
}

/** Lista + panel: el panel se abre como cajón superpuesto a toda la altura (igual que Riesgos). */
export function PanelSplit({ abierto, children, panel }) {
  return (
    <>
      {children}
      {abierto && panel}
    </>
  );
}

/** Ruta de la vista completa de cada módulo. */
export const RUTA_COMPLETA = {
  nc: (id) => `/sgc/no-conformidades/${id}`,
  ac: (id) => `/sgc/acciones-correctivas/${id}`,
  auditoria: (id) => `/sgc/auditorias/${id}`,
  indicador: (id) => `/sgc/indicadores/${id}`,
  riesgo: (id) => `/sgc/riesgos/${id}`,
};

/** Ruta de la vista completa → { modulo, id } para abrirla en el panel (o null). */
export function panelDesdeRuta(ruta) {
  const m = String(ruta || "").match(/^\/sgc\/(no-conformidades|acciones-correctivas|auditorias|indicadores|riesgos)\/(\d+)$/);
  if (!m) return null;
  const modulo = { "no-conformidades": "nc", "acciones-correctivas": "ac", auditorias: "auditoria", indicadores: "indicador", riesgos: "riesgo" }[m[1]];
  return { modulo, id: Number(m[2]) };
}
