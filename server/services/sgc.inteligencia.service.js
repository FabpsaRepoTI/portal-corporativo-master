// server/services/sgc.inteligencia.service.js
// Centro de control del SGC: inteligencia para la toma de decisiones.
//
//   Capa 1 · Datos (SQL)       cifras exactas, comparaciones contra el periodo anterior,
//                              tendencia mensual, mapa por proceso y estado de indicadores.
//   Capa 2 · Reglas            detecta situaciones con umbrales explícitos y las prioriza
//                              (METODOLOGIA). Nada de esto lo decide la IA.
//   Capa 3 · IA (diagnóstico)  sgc.diagnostico.service interpreta SOLO el resultado de las
//                              capas 1 y 2 y debe citar la evidencia.
//
// Alcance: Coordinador, Auditor y Dirección ven la empresa; el Responsable de área
// ve sus NCs y ACs (las reglas de procesos, indicadores, riesgos y auditorías son
// de la empresa y no se le muestran).
const crypto = require("crypto");
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { semaforo } = require("./sgcIndicadores.service");

// ── Umbrales de las reglas (editables aquí) ────────────────────────────────
const U = {
  vencidaCriticaDias: 30, // NC/AC vencida hace más de esto → crítica
  acEstancadaDias: 21, // AC abierta hace más de esto sin ninguna actividad completada
  ncSinAcDias: 15, // NC en análisis o más, sin AC, detectada hace más de esto
  concentracionMin: 3, // NCs abiertas mínimas en la empresa para hablar de concentración
  concentracionPct: 40, // % de las NCs abiertas en un solo proceso
  patronVentanaDias: 180, // NCs del mismo proceso y origen en esta ventana → patrón a validar
  hallazgoSinNcDias: 7, // hallazgo tipo NC sin NC generada hace más de esto
  auditoriaProximaDias: 14,
};

const NIVEL = { critica: 3, alta: 2, media: 1 };

const METODOLOGIA = [
  "Cada situación sale de una regla con umbral fijo sobre los registros; la IA no decide qué es prioritario.",
  `Crítica: NC clasificación Mayor vencida, o NC/AC vencida hace más de ${U.vencidaCriticaDias} días, o riesgo alto sin plan de tratamiento.`,
  "Alta: vencimientos, acciones sin avance, NCs sin acción correctiva, concentración en un proceso, indicadores fuera de meta, auditorías atrasadas, eficacia por debajo de la meta.",
  "Media: tendencias por confirmar (indicador que empeora, patrón repetido), mediciones atrasadas y fechas próximas.",
  "Dentro del mismo nivel se ordena por número de registros afectados y por días de atraso.",
];

// Lo que el sistema todavía no registra y limitaría el análisis
const DATOS_FALTANTES = [
  "Los indicadores no están ligados a un proceso: no se puede cruzar el desempeño de un proceso con sus NCs.",
  "No hay objetivos de calidad como registro propio; se toman los indicadores con meta como objetivos medibles.",
  "La eficacia se registra por acción correctiva, sin fecha de verificación de que el problema no se repitió en un periodo definido.",
];

const _ruta = {
  nc: (id) => `/sgc/no-conformidades/${id}`,
  ac: (id) => `/sgc/acciones-correctivas/${id}`,
  aud: (id) => `/sgc/auditorias/${id}`,
  ind: (id) => `/sgc/indicadores/${id}`,
  riesgo: (id) => `/sgc/riesgos/${id}`,
};
const _pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const _plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Capa 1: todas las cifras en una lectura. */
async function _datos(req) {
  const db = await getPool();
  const soloMias = req.sgcRol === 3 ? 1 : 0;
  const r = await db.request()
    .input("idEmpresa", sql.Int, req.idEmpresa)
    .input("login", sql.VarChar(255), req.login)
    .input("soloMias", sql.Bit, soloMias)
    .input("altoMin", sql.Int, C.NIVEL_ALTO_MIN)
    .query(`
      DECLARE @hoy DATE = ${C.HOY_SQL};
      DECLARE @hace30 DATE = DATEADD(DAY, -30, @hoy);
      DECLARE @hace90 DATE = DATEADD(DAY, -90, @hoy);
      DECLARE @hace180 DATE = DATEADD(DAY, -180, @hoy);
      DECLARE @hace365 DATE = DATEADD(DAY, -365, @hoy);
      DECLARE @mes0 DATE = DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(@hoy), MONTH(@hoy), 1));

      -- [0] NCs visibles (abiertas y cerradas recientes) con proceso y AC
      SELECT nc.idNC, nc.folioNC AS folio, nc.idEstatus, nc.idClasificacion, c.nombre AS clasificacion,
             nc.idOrigen, o.nombre AS origen, nc.idProceso, pr.nombre AS proceso,
             LEFT(nc.descripcion, 140) AS descripcion, nc.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable,
             nc.fechaDeteccion, nc.fechaCompromiso, nc.fechaCierre, nc.esReincidencia, nc.idNCPadre,
             DATEDIFF(DAY, @hoy, nc.fechaCompromiso) AS diasRestantes,
             DATEDIFF(DAY, nc.fechaDeteccion, @hoy) AS diasDesdeDeteccion,
             (SELECT COUNT(*) FROM sgc_acciones_correctivas ac WHERE ac.idNC = nc.idNC) AS numAC
      FROM sgc_no_conformidades nc
      JOIN sgc_cat_clasificaciones c ON c.idClasificacion = nc.idClasificacion
      JOIN sgc_cat_origenes o ON o.idOrigen = nc.idOrigen
      LEFT JOIN sgc_procesos pr ON pr.idProceso = nc.idProceso
      LEFT JOIN sec_users u ON u.login = nc.loginResponsable
      WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login)
        AND (nc.idEstatus IN (1, 2, 3, 4) OR nc.fechaDeteccion >= @hace365 OR nc.fechaCierre >= @hace365);

      -- [1] ACs visibles con avance del plan
      SELECT ac.idAC, ac.folioAC AS folio, ac.idEstatus, ac.idNC, nc.folioNC, nc.idProceso, pr.nombre AS proceso,
             COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 140), LEFT(ac.descripcion, 140)) AS descripcion,
             LTRIM(RTRIM(u.name)) AS responsable, ac.fechaCompromiso, ac.fechaCierre, ac.fechaCreacion,
             DATEDIFF(DAY, @hoy, ac.fechaCompromiso) AS diasRestantes,
             DATEDIFF(DAY, ac.fechaCreacion, @hoy) AS diasDesdeAlta,
             pl.total AS lineas, pl.completadas
      FROM sgc_acciones_correctivas ac
      LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      LEFT JOIN sgc_procesos pr ON pr.idProceso = nc.idProceso
      LEFT JOIN sec_users u ON u.login = ac.loginResponsable
      OUTER APPLY (SELECT COUNT(*) AS total, ISNULL(SUM(CASE WHEN p.idEstatus = 3 THEN 1 ELSE 0 END), 0) AS completadas
                   FROM sgc_acciones_plan p WHERE p.idAC = ac.idAC) pl
      WHERE ac.idEmpresa = @idEmpresa AND (@soloMias = 0 OR ac.loginResponsable = @login OR nc.loginResponsable = @login);

      -- [2] Indicadores activos con sus dos últimas mediciones
      SELECT i.idIndicador, i.clave, i.nombre, i.unidad, i.meta, i.sentido, i.frecuencia,
             LTRIM(RTRIM(u.name)) AS responsable,
             v1.valor AS ultimo, v1.periodo AS ultimoPeriodo, v2.valor AS anterior, v2.periodo AS anteriorPeriodo,
             v3.valor AS antepenultimo
      FROM sgc_indicadores i
      LEFT JOIN sec_users u ON u.login = i.loginResponsable
      OUTER APPLY (SELECT valor, periodo FROM sgc_indicadores_valores WHERE idIndicador = i.idIndicador ORDER BY periodo DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY) v1
      OUTER APPLY (SELECT valor, periodo FROM sgc_indicadores_valores WHERE idIndicador = i.idIndicador ORDER BY periodo DESC OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY) v2
      OUTER APPLY (SELECT valor FROM sgc_indicadores_valores WHERE idIndicador = i.idIndicador ORDER BY periodo DESC OFFSET 2 ROWS FETCH NEXT 1 ROWS ONLY) v3
      WHERE i.idEmpresa = @idEmpresa AND i.activo = 1;

      -- [3] Riesgos altos activos
      SELECT rg.idRiesgo, rg.nombre, rg.probabilidad * rg.impacto AS nivel, rg.impactoEconomico,
             NULLIF(LTRIM(RTRIM(rg.planTratamiento)), '') AS planTratamiento, rg.fechaRevision,
             DATEDIFF(DAY, @hoy, rg.fechaRevision) AS diasRevision
      FROM sgc_riesgos rg
      WHERE rg.idEmpresa = @idEmpresa AND rg.activo = 1 AND rg.idEstatus = 1 AND rg.tipo = 1
        AND rg.probabilidad * rg.impacto >= @altoMin;

      -- [4] Auditorías del año y planeadas
      SELECT a.idAuditoria, a.folio, COALESCE(a.titulo, LEFT(a.alcance, 120)) AS titulo, a.idEstatus, a.fechaPlan,
             DATEDIFF(DAY, @hoy, a.fechaPlan) AS diasRestantes,
             (SELECT COUNT(*) FROM sgc_auditoria_auditores x WHERE x.idAuditoria = a.idAuditoria) + CASE WHEN a.loginAuditor IS NULL THEN 0 ELSE 1 END AS auditores
      FROM sgc_auditorias a
      WHERE a.idEmpresa = @idEmpresa AND a.idEstatus <> 4 AND (YEAR(a.fechaPlan) = YEAR(@hoy) OR a.idEstatus IN (1, 2));

      -- [5] Hallazgos tipo NC sin NC generada
      SELECT h.idHallazgo, a.idAuditoria, a.folio, LEFT(h.descripcion, 140) AS descripcion,
             DATEDIFF(DAY, h.fechaCreacion, @hoy) AS dias
      FROM sgc_hallazgos h JOIN sgc_auditorias a ON a.idAuditoria = h.idAuditoria
      WHERE a.idEmpresa = @idEmpresa AND h.tipo = 1 AND h.idNC IS NULL AND a.idEstatus <> 4;

      -- [6] Tendencia mensual (12 meses): NCs registradas y cerradas, ACs cerradas
      SELECT m.mes,
             (SELECT COUNT(*) FROM sgc_no_conformidades nc WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login)
                AND nc.fechaDeteccion >= m.mes AND nc.fechaDeteccion < DATEADD(MONTH, 1, m.mes)) AS ncRegistradas,
             (SELECT COUNT(*) FROM sgc_no_conformidades nc WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login)
                AND nc.idEstatus = 5 AND nc.fechaCierre >= m.mes AND nc.fechaCierre < DATEADD(MONTH, 1, m.mes)) AS ncCerradas,
             (SELECT COUNT(*) FROM sgc_acciones_correctivas ac WHERE ac.idEmpresa = @idEmpresa AND (@soloMias = 0 OR ac.loginResponsable = @login)
                AND ac.idEstatus = 5 AND ac.fechaCierre >= m.mes AND ac.fechaCierre < DATEADD(MONTH, 1, m.mes)) AS acCerradas
      FROM (SELECT DATEADD(MONTH, n, @mes0) AS mes FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11)) v(n)) m
      ORDER BY m.mes;

      -- [7] Procesos activos
      SELECT idProceso, nombre, tipo FROM sgc_procesos WHERE idEmpresa = @idEmpresa AND activo = 1;

      -- [8] Comparaciones contra el periodo anterior (empresa o personal)
      SELECT
        -- NCs abiertas hace 30 días (abiertas entonces y no canceladas)
        (SELECT COUNT(*) FROM sgc_no_conformidades nc WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login)
           AND nc.idEstatus <> 6 AND nc.fechaDeteccion <= @hace30 AND (nc.fechaCierre IS NULL OR nc.fechaCierre > @hace30)) AS ncAbiertasHace30,
        -- Vencidas hace 30 días
        (SELECT COUNT(*) FROM sgc_no_conformidades nc WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login)
           AND nc.idEstatus <> 6 AND nc.fechaDeteccion <= @hace30 AND (nc.fechaCierre IS NULL OR nc.fechaCierre > @hace30)
           AND nc.fechaCompromiso < @hace30) AS ncVencidasHace30,
        -- Días promedio de cierre: cerradas en los últimos 90 días y en los 90 anteriores
        (SELECT AVG(CAST(DATEDIFF(DAY, nc.fechaDeteccion, nc.fechaCierre) AS DECIMAL(9, 1))) FROM sgc_no_conformidades nc
          WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login) AND nc.idEstatus = 5 AND nc.fechaCierre >= @hace90) AS cierreDias90,
        (SELECT COUNT(*) FROM sgc_no_conformidades nc
          WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login) AND nc.idEstatus = 5 AND nc.fechaCierre >= @hace90) AS cerradas90,
        (SELECT AVG(CAST(DATEDIFF(DAY, nc.fechaDeteccion, nc.fechaCierre) AS DECIMAL(9, 1))) FROM sgc_no_conformidades nc
          WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login) AND nc.idEstatus = 5
            AND nc.fechaCierre >= @hace180 AND nc.fechaCierre < @hace90) AS cierreDiasPrev,
        -- Meta del indicador de eficacia de AC (si existe uno con ese nombre)
        (SELECT TOP 1 meta FROM sgc_indicadores WHERE idEmpresa = @idEmpresa AND activo = 1 AND nombre LIKE '%eficacia%acci%correctiva%') AS metaEficacia;
    `);
  const [ncs, acs, indicadores, riesgos, auditorias, hallazgos, tendencia, procesos, [comp]] = r.recordsets;
  return { ncs, acs, indicadores, riesgos, auditorias, hallazgos, tendencia, procesos, comp, soloMias: !!soloMias };
}

const _abierta = (n) => [1, 2, 3, 4].includes(n.idEstatus);
const _acAbierta = (a) => [1, 2, 3].includes(a.idEstatus);

/** Indicador → semáforo, tendencia (mejora/empeora) y si su medición está al día. */
function _estadoIndicador(i, hoy) {
  const meta = i.meta == null ? null : Number(i.meta);
  const ultimo = i.ultimo == null ? null : Number(i.ultimo);
  const anterior = i.anterior == null ? null : Number(i.anterior);
  const ante = i.antepenultimo == null ? null : Number(i.antepenultimo);
  const mejor = (a, b) => (i.sentido === 2 ? a < b : a > b);
  let tendencia = null;
  if (ultimo != null && anterior != null) tendencia = ultimo === anterior ? "igual" : mejor(ultimo, anterior) ? "mejora" : "empeora";
  const empeoraDos = ultimo != null && anterior != null && ante != null && !mejor(ultimo, anterior) && ultimo !== anterior && !mejor(anterior, ante) && anterior !== ante;
  // Medición atrasada: el último periodo es más viejo que su frecuencia + un periodo de gracia
  const meses = { 1: 1, 2: 3, 3: 6, 4: 12 }[i.frecuencia] || 1;
  let atrasado = true;
  if (i.ultimoPeriodo) {
    const p = new Date(i.ultimoPeriodo);
    const limite = new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + meses * 2, 1));
    atrasado = hoy >= limite;
  }
  return { meta, ultimo, anterior, tendencia, empeoraDos, atrasado, semaforo: semaforo(ultimo, meta, i.sentido) };
}

/** Capa 2: situaciones que merecen atención, cada una con su evidencia. */
function _detectar(d, hoy) {
  const out = [];
  const add = (p) => out.push({ falta: null, proceso: null, ...p });
  const ncAbiertas = d.ncs.filter(_abierta);

  // R1 · NCs vencidas
  const ncVenc = ncAbiertas.filter((n) => n.diasRestantes < 0).sort((a, b) => a.diasRestantes - b.diasRestantes);
  if (ncVenc.length) {
    const criticas = ncVenc.filter((n) => n.idClasificacion === 1 || -n.diasRestantes > U.vencidaCriticaDias);
    const mayores = ncVenc.filter((n) => n.idClasificacion === 1).length;
    const procesos = [...new Set(ncVenc.map((n) => n.proceso).filter(Boolean))];
    add({
      id: "nc-vencidas", regla: "NC vencida", nivel: criticas.length ? "critica" : "alta", categoria: "hecho",
      titulo: `${_plural(ncVenc.length, "no conformidad vencida", "no conformidades vencidas")}`,
      detalle: `${ncVenc.length} de ${ncAbiertas.length} NCs abiertas ya pasaron su fecha compromiso${mayores ? `; ${mayores} ${mayores === 1 ? "es" : "son"} clasificación Mayor` : ""}. La más atrasada lleva ${_plural(-ncVenc[0].diasRestantes, "día", "días")}.`,
      porque: "Una NC vencida significa que el incumplimiento sigue sin corregirse en el plazo comprometido; en auditoría se evidencia como falta de control (ISO 9001 cl. 10.2).",
      accion: "Revisar con cada responsable el motivo del atraso, reprogramar con justificación en el historial o escalar las de clasificación Mayor.",
      proceso: procesos.length === 1 ? procesos[0] : procesos.length ? `${procesos.length} procesos` : null,
      evidencia: ncVenc.map((n) => ({ folio: n.folio, texto: `${n.clasificacion} · ${-n.diasRestantes} d vencida · ${n.responsable || "sin responsable"}`, ruta: _ruta.nc(n.idNC), dias: -n.diasRestantes })),
      ruta: "/sgc/no-conformidades?vencidas=1",
    });
  }

  // R2 · ACs vencidas
  const acVenc = d.acs.filter((a) => _acAbierta(a) && a.diasRestantes < 0).sort((a, b) => a.diasRestantes - b.diasRestantes);
  if (acVenc.length) {
    add({
      id: "ac-vencidas", regla: "AC vencida", nivel: acVenc.some((a) => -a.diasRestantes > U.vencidaCriticaDias) ? "critica" : "alta", categoria: "hecho",
      titulo: _plural(acVenc.length, "acción correctiva vencida", "acciones correctivas vencidas"),
      detalle: `La más atrasada lleva ${_plural(-acVenc[0].diasRestantes, "día", "días")}; avance de su plan: ${acVenc[0].lineas ? Math.round((100 * acVenc[0].completadas) / acVenc[0].lineas) : 0}%.`,
      porque: "Mientras la acción no se completa, la causa raíz sigue activa y el problema puede repetirse.",
      accion: "Confirmar qué actividades del plan faltan y si los plazos eran realistas; reprogramar con evidencia o reforzar recursos.",
      proceso: [...new Set(acVenc.map((a) => a.proceso).filter(Boolean))].join(", ") || null,
      evidencia: acVenc.map((a) => ({ folio: a.folio, texto: `${-a.diasRestantes} d vencida · ${a.completadas}/${a.lineas} actividades · ${a.responsable || "sin responsable"}`, ruta: _ruta.ac(a.idAC), dias: -a.diasRestantes })),
      ruta: "/sgc/acciones-correctivas?vencidas=1",
    });
  }

  // R3 · ACs sin avance
  const estancadas = d.acs.filter((a) => _acAbierta(a) && a.diasDesdeAlta > U.acEstancadaDias && !a.completadas);
  if (estancadas.length) {
    add({
      id: "ac-sin-avance", regla: "AC sin avance", nivel: "alta", categoria: "hecho",
      titulo: `${_plural(estancadas.length, "acción correctiva", "acciones correctivas")} sin ninguna actividad completada`,
      detalle: `Abiertas hace más de ${U.acEstancadaDias} días y con 0 actividades del plan completadas.`,
      porque: "Una acción sin avance suele indicar falta de recursos, de responsable efectivo o un plan poco realista; tiende a vencerse.",
      accion: "Verificar con el responsable si el plan sigue siendo válido y registrar el avance real o replantear las actividades.",
      evidencia: estancadas.map((a) => ({ folio: a.folio, texto: `${a.diasDesdeAlta} d desde el alta · ${a.lineas} actividades`, ruta: _ruta.ac(a.idAC), dias: a.diasDesdeAlta })),
      ruta: "/sgc/acciones-correctivas",
    });
  }

  // R4 · NCs sin acción correctiva
  const sinAc = ncAbiertas.filter((n) => n.idEstatus >= 2 && !n.numAC && n.diasDesdeDeteccion > U.ncSinAcDias);
  if (sinAc.length) {
    add({
      id: "nc-sin-ac", regla: "NC sin acción correctiva", nivel: "alta", categoria: "hecho",
      titulo: `${_plural(sinAc.length, "NC en análisis o ejecución", "NCs en análisis o ejecución")} sin acción correctiva`,
      detalle: `Detectadas hace más de ${U.ncSinAcDias} días y sin ninguna AC registrada.`,
      porque: "Sin acción correctiva no hay forma de demostrar que se eliminó la causa raíz.",
      accion: "Completar el análisis de causa raíz y registrar la AC desde la propia NC.",
      evidencia: sinAc.map((n) => ({ folio: n.folio, texto: `${C.NC_ESTATUS[n.idEstatus]} · ${n.diasDesdeDeteccion} d desde la detección`, ruta: _ruta.nc(n.idNC), dias: n.diasDesdeDeteccion })),
      ruta: "/sgc/no-conformidades?estatus=abiertas",
    });
  }

  // R5 · Concentración por proceso
  if (!d.soloMias && ncAbiertas.length >= U.concentracionMin) {
    const porProceso = new Map();
    for (const n of ncAbiertas) if (n.idProceso) porProceso.set(n.idProceso, [...(porProceso.get(n.idProceso) || []), n]);
    for (const [idProceso, lista] of porProceso) {
      const pct = _pct(lista.length, ncAbiertas.length);
      if (lista.length >= 2 && pct >= U.concentracionPct) {
        add({
          id: `concentracion-${idProceso}`, regla: "Concentración por proceso", nivel: "alta", categoria: "tendencia",
          titulo: `${lista[0].proceso} concentra el ${pct}% de las NCs abiertas`,
          detalle: `${lista.length} de ${ncAbiertas.length} NCs abiertas pertenecen a este proceso.`,
          porque: "Cuando un proceso acumula incumplimientos puede haber una causa común (método, recursos, capacitación) que las acciones individuales no atienden.",
          accion: "Revisar las NCs del proceso en conjunto con su dueño y evaluar si conviene un análisis de causa raíz común.",
          falta: "Confirmar si las NCs comparten causa; hoy cada NC registra su análisis por separado.",
          proceso: lista[0].proceso,
          evidencia: lista.map((n) => ({ folio: n.folio, texto: `${n.clasificacion} · ${n.origen}`, ruta: _ruta.nc(n.idNC) })),
          ruta: `/sgc/no-conformidades?proceso=${idProceso}`,
        });
      }
    }
  }

  // R6 · Reincidencias declaradas y patrones (mismo proceso + mismo origen)
  const reinc = d.ncs.filter((n) => (n.esReincidencia || n.idNCPadre) && n.diasDesdeDeteccion <= 365);
  if (reinc.length) {
    add({
      id: "reincidencias", regla: "Reincidencia", nivel: "alta", categoria: "hecho",
      titulo: `${_plural(reinc.length, "NC marcada como reincidencia", "NCs marcadas como reincidencia")} en 12 meses`,
      detalle: "El problema volvió a ocurrir después de haberse atendido.",
      porque: "Una reincidencia indica que la acción correctiva anterior no fue eficaz.",
      accion: "Revisar la eficacia de la acción original y reabrir el análisis de causa raíz.",
      evidencia: reinc.map((n) => ({ folio: n.folio, texto: `${n.proceso || "sin proceso"} · ${n.origen}`, ruta: _ruta.nc(n.idNC) })),
      ruta: "/sgc/no-conformidades",
    });
  }
  if (!d.soloMias) {
    const grupos = new Map();
    for (const n of d.ncs) {
      if (!n.idProceso || n.diasDesdeDeteccion > U.patronVentanaDias || n.idEstatus === 6) continue;
      const k = `${n.idProceso}|${n.idOrigen}`;
      grupos.set(k, [...(grupos.get(k) || []), n]);
    }
    for (const [k, lista] of grupos) {
      if (lista.length < 2) continue;
      add({
        id: `patron-${k}`, regla: "Patrón a validar", nivel: "media", categoria: "riesgo",
        titulo: `${lista.length} NCs de ${lista[0].proceso} con el mismo origen (${lista[0].origen}) en 6 meses`,
        detalle: "Coinciden proceso y origen; no está confirmado que sea el mismo problema.",
        porque: "Puede ser el mismo problema repitiéndose sin marcarse como reincidencia.",
        accion: "Comparar las descripciones y causas raíz; si es el mismo problema, marcar la reincidencia y revisar la eficacia de la acción.",
        falta: "Validar si comparten causa raíz (hipótesis, no confirmado).",
        proceso: lista[0].proceso,
        evidencia: lista.map((n) => ({ folio: n.folio, texto: n.descripcion, ruta: _ruta.nc(n.idNC) })),
        ruta: `/sgc/no-conformidades?proceso=${lista[0].idProceso}`,
      });
    }
  }

  if (!d.soloMias) {
    // R7 · Indicadores
    const inds = d.indicadores.map((i) => ({ ...i, ...(_estadoIndicador(i, hoy)) }));
    const rojos = inds.filter((i) => i.semaforo === "rojo");
    if (rojos.length) {
      add({
        id: "ind-fuera-meta", regla: "Indicador fuera de meta", nivel: "alta", categoria: "hecho",
        titulo: `${_plural(rojos.length, "indicador fuera de meta", "indicadores fuera de meta")}`,
        detalle: rojos.map((i) => `${i.nombre}: ${i.ultimo}${i.unidad ? ` ${i.unidad}` : ""} (meta ${i.sentido === 2 ? "≤" : "≥"} ${i.meta})`).join("; "),
        porque: "Un objetivo de calidad fuera de meta exige análisis y acciones (ISO 9001 cl. 6.2 y 9.1).",
        accion: "Analizar la causa de la desviación con el responsable del indicador y, si persiste, registrar una NC o una acción.",
        evidencia: rojos.map((i) => ({ folio: i.clave, texto: `${i.ultimo} vs meta ${i.meta} · ${i.tendencia === "empeora" ? "empeoró" : i.tendencia === "mejora" ? "mejoró" : "sin comparación"}`, ruta: _ruta.ind(i.idIndicador) })),
        ruta: "/sgc/indicadores?semaforo=rojo",
      });
    }
    const empeoran = inds.filter((i) => i.empeoraDos && i.semaforo !== "rojo");
    if (empeoran.length) {
      add({
        id: "ind-empeora", regla: "Indicador en deterioro", nivel: "media", categoria: "tendencia",
        titulo: `${_plural(empeoran.length, "indicador empeoró", "indicadores empeoraron")} dos mediciones seguidas`,
        detalle: empeoran.map((i) => `${i.nombre}: ${i.antepenultimo} → ${i.anterior} → ${i.ultimo}`).join("; "),
        porque: "Aún dentro de meta, dos caídas seguidas anticipan un incumplimiento si la tendencia continúa.",
        accion: "Revisar con el responsable qué cambió en el proceso medido.",
        evidencia: empeoran.map((i) => ({ folio: i.clave, texto: `${i.anterior} → ${i.ultimo}`, ruta: _ruta.ind(i.idIndicador) })),
        ruta: "/sgc/indicadores",
      });
    }
    const atrasados = inds.filter((i) => i.atrasado);
    if (atrasados.length) {
      add({
        id: "ind-sin-medicion", regla: "Medición atrasada", nivel: "media", categoria: "hecho",
        titulo: `${_plural(atrasados.length, "indicador sin medición al día", "indicadores sin medición al día")}`,
        detalle: "No tienen valor registrado en el periodo que corresponde a su frecuencia.",
        porque: "Sin medición no se puede demostrar el seguimiento de los objetivos.",
        accion: "Pedir a los responsables que registren el valor del periodo.",
        evidencia: atrasados.map((i) => ({ folio: i.clave, texto: `${i.nombre} · último: ${i.ultimoPeriodo ? String(i.ultimoPeriodo.toISOString?.() || i.ultimoPeriodo).slice(0, 7) : "nunca"} · ${i.responsable || "sin responsable"}`, ruta: _ruta.ind(i.idIndicador) })),
        ruta: "/sgc/indicadores",
      });
    }

    // R8 · Riesgos altos
    const sinPlan = d.riesgos.filter((g) => !g.planTratamiento);
    if (sinPlan.length) {
      add({
        id: "riesgo-sin-plan", regla: "Riesgo alto sin plan", nivel: "critica", categoria: "riesgo",
        titulo: `${_plural(sinPlan.length, "riesgo alto sin plan de tratamiento", "riesgos altos sin plan de tratamiento")}`,
        detalle: sinPlan.map((g) => `${g.nombre} (nivel ${g.nivel})`).join("; "),
        porque: "Un riesgo alto sin tratamiento puede materializarse sin ninguna respuesta preparada (ISO 9001 cl. 6.1).",
        accion: "Definir plan de tratamiento y responsable.",
        evidencia: sinPlan.map((g) => ({ folio: `Nivel ${g.nivel}`, texto: g.nombre, ruta: _ruta.riesgo(g.idRiesgo) })),
        ruta: "/sgc/riesgos",
      });
    }
    const revVencida = d.riesgos.filter((g) => g.planTratamiento && g.diasRevision != null && g.diasRevision < 0);
    if (revVencida.length) {
      add({
        id: "riesgo-revision", regla: "Revisión de riesgo vencida", nivel: "media", categoria: "riesgo",
        titulo: `${_plural(revVencida.length, "riesgo alto con revisión vencida", "riesgos altos con revisión vencida")}`,
        detalle: "Pasó su fecha de próxima revisión.",
        porque: "Sin reevaluación no se sabe si el plan de tratamiento está reduciendo el riesgo.",
        accion: "Reevaluar probabilidad e impacto y actualizar la fecha de revisión.",
        evidencia: revVencida.map((g) => ({ folio: `Nivel ${g.nivel}`, texto: `${g.nombre} · ${-g.diasRevision} d vencida`, ruta: _ruta.riesgo(g.idRiesgo), dias: -g.diasRevision })),
        ruta: "/sgc/riesgos",
      });
    }

    // R9 · Auditorías
    const atrasadas = d.auditorias.filter((a) => a.idEstatus === 1 && a.diasRestantes < 0);
    if (atrasadas.length) {
      add({
        id: "aud-atrasada", regla: "Auditoría atrasada", nivel: "alta", categoria: "hecho",
        titulo: `${_plural(atrasadas.length, "auditoría planeada", "auditorías planeadas")} con fecha pasada sin iniciar`,
        detalle: "Siguen como «Planeada» aunque su fecha ya pasó.",
        porque: "El incumplimiento del programa de auditorías es un hallazgo frecuente en auditorías de certificación (cl. 9.2).",
        accion: "Iniciarla, reprogramarla con justificación o cancelarla si ya no aplica.",
        evidencia: atrasadas.map((a) => ({ folio: a.folio, texto: `${a.titulo} · ${-a.diasRestantes} d de atraso`, ruta: _ruta.aud(a.idAuditoria), dias: -a.diasRestantes })),
        ruta: "/sgc/auditorias",
      });
    }
    const proximas = d.auditorias.filter((a) => a.idEstatus === 1 && a.diasRestantes >= 0 && a.diasRestantes <= U.auditoriaProximaDias);
    if (proximas.length) {
      add({
        id: "aud-proxima", regla: "Auditoría próxima", nivel: proximas.some((a) => !a.auditores) ? "alta" : "media", categoria: "hecho",
        titulo: `${_plural(proximas.length, "auditoría", "auditorías")} en los próximos ${U.auditoriaProximaDias} días`,
        detalle: proximas.map((a) => `${a.folio} en ${a.diasRestantes} días${a.auditores ? "" : " · sin auditor asignado"}`).join("; "),
        porque: "Conviene llegar con las NCs y acciones del alcance al día y la documentación vigente.",
        accion: "Revisar NCs abiertas y acciones vencidas de los procesos del alcance antes de la fecha.",
        evidencia: proximas.map((a) => ({ folio: a.folio, texto: a.titulo, ruta: _ruta.aud(a.idAuditoria), dias: a.diasRestantes })),
        ruta: "/sgc/auditorias",
      });
    }
    const hallSinNc = d.hallazgos.filter((h) => h.dias > U.hallazgoSinNcDias);
    if (hallSinNc.length) {
      add({
        id: "hallazgo-sin-nc", regla: "Hallazgo sin NC", nivel: "alta", categoria: "hecho",
        titulo: `${_plural(hallSinNc.length, "hallazgo de no conformidad", "hallazgos de no conformidad")} sin NC registrada`,
        detalle: `Registrados hace más de ${U.hallazgoSinNcDias} días en auditoría y sin convertir en NC.`,
        porque: "Un hallazgo de auditoría que no se gestiona como NC queda sin seguimiento ni acción correctiva.",
        accion: "Generar la NC desde el hallazgo en la auditoría correspondiente.",
        evidencia: hallSinNc.map((h) => ({ folio: h.folio, texto: h.descripcion, ruta: _ruta.aud(h.idAuditoria), dias: h.dias })),
        ruta: "/sgc/auditorias",
      });
    }
  }

  // Orden: nivel, registros afectados, máximo atraso
  const maxDias = (p) => Math.max(0, ...p.evidencia.map((e) => e.dias || 0));
  return out.sort((a, b) => NIVEL[b.nivel] - NIVEL[a.nivel] || b.evidencia.length - a.evidencia.length || maxDias(b) - maxDias(a));
}

/** Capa 1: indicadores estratégicos con su comparación. */
function _kpis(d, hoy) {
  const abiertas = d.ncs.filter(_abierta);
  const vencidas = abiertas.filter((n) => n.diasRestantes < 0);
  const acAbiertas = d.acs.filter(_acAbierta);
  const acVencidas = acAbiertas.filter((a) => a.diasRestantes < 0);
  const exigibles = d.acs.filter((a) => a.fechaCompromiso && new Date(a.fechaCompromiso) < hoy);
  const eficaces = exigibles.filter((a) => [4, 5].includes(a.idEstatus));
  const eficacia = exigibles.length ? Math.round((100 * eficaces.length) / exigibles.length) : null;
  const metaEf = d.comp.metaEficacia == null ? null : Number(d.comp.metaEficacia);
  const reinc = d.ncs.filter((n) => (n.esReincidencia || n.idNCPadre) && n.diasDesdeDeteccion <= 365).length;
  const cierre = d.comp.cierreDias90 == null ? null : Math.round(Number(d.comp.cierreDias90));
  const cierrePrev = d.comp.cierreDiasPrev == null ? null : Math.round(Number(d.comp.cierreDiasPrev));
  const kpis = [
    {
      id: "nc-abiertas", principal: true, etiqueta: "NCs abiertas", pregunta: "¿Cuántos incumplimientos siguen sin cerrarse?",
      valor: abiertas.length, comparacion: { valor: d.comp.ncAbiertasHace30, texto: "hace 30 días", menorEsMejor: true },
      estado: vencidas.length ? "atencion" : "ok", ruta: "/sgc/no-conformidades?estatus=abiertas",
    },
    {
      id: "nc-vencidas", principal: true, etiqueta: "NCs vencidas", pregunta: "¿Cuántas superaron su fecha compromiso?",
      valor: vencidas.length, sub: abiertas.length ? `${_pct(vencidas.length, abiertas.length)}% de las abiertas` : null,
      comparacion: { valor: d.comp.ncVencidasHace30, texto: "hace 30 días", menorEsMejor: true },
      estado: vencidas.length ? "critico" : "ok", ruta: "/sgc/no-conformidades?vencidas=1",
    },
    {
      id: "ac-vencidas", principal: true, etiqueta: "ACs vencidas", pregunta: "¿Qué acciones no se completaron a tiempo?",
      valor: acVencidas.length, sub: `${acAbiertas.length} abiertas en total`,
      estado: acVencidas.length ? "critico" : "ok", ruta: "/sgc/acciones-correctivas?vencidas=1",
    },
    {
      id: "eficacia", principal: true, etiqueta: "Eficacia de ACs", pregunta: "¿Las acciones están resolviendo los problemas?",
      valor: eficacia, unidad: "%", sub: exigibles.length ? `${eficaces.length} eficaces de ${exigibles.length} con plazo cumplido` : "Aún no hay ACs con plazo cumplido",
      meta: metaEf, estado: eficacia == null ? null : metaEf != null && eficacia < metaEf ? "atencion" : "ok", ruta: "/sgc/acciones-correctivas",
    },
    {
      id: "cierre", etiqueta: "Días para cerrar una NC", pregunta: "¿Qué tan rápido se resuelven?",
      valor: cierre, unidad: "d", sub: d.comp.cerradas90 ? `promedio de ${_plural(d.comp.cerradas90, "NC cerrada", "NCs cerradas")} en 90 días` : "Sin NCs cerradas en 90 días",
      comparacion: cierrePrev == null ? null : { valor: cierrePrev, texto: "90 días previos", menorEsMejor: true },
      estado: null, ruta: "/sgc/no-conformidades",
    },
    {
      id: "reincidencia", etiqueta: "Reincidencias (12 meses)", pregunta: "¿Se están repitiendo problemas?",
      valor: reinc, sub: "NCs marcadas como reincidencia", estado: reinc ? "atencion" : "ok", ruta: "/sgc/no-conformidades",
    },
  ];
  if (!d.soloMias) {
    const inds = d.indicadores.map((i) => _estadoIndicador(i, hoy));
    const medidos = inds.filter((i) => i.semaforo);
    const enMeta = medidos.filter((i) => i.semaforo === "verde").length;
    const delAnio = d.auditorias.filter((a) => new Date(a.fechaPlan).getUTCFullYear() === hoy.getUTCFullYear());
    const exigiblesAud = delAnio.filter((a) => a.diasRestantes < 0 || a.idEstatus !== 1);
    const hechas = exigiblesAud.filter((a) => a.idEstatus === 3).length;
    kpis.push(
      {
        id: "objetivos", etiqueta: "Indicadores en meta", pregunta: "¿Se están cumpliendo los objetivos de calidad?",
        valor: medidos.length ? enMeta : null, total: medidos.length, sub: `${inds.length - medidos.length} sin medición`,
        estado: medidos.length && enMeta < medidos.length ? "atencion" : medidos.length ? "ok" : null, ruta: "/sgc/indicadores",
      },
      {
        id: "programa", etiqueta: "Programa de auditorías", pregunta: "¿Se cumple lo programado a la fecha?",
        valor: exigiblesAud.length ? hechas : null, total: exigiblesAud.length,
        sub: `${delAnio.length} programadas en el año`, estado: exigiblesAud.length && hechas < exigiblesAud.length ? "atencion" : exigiblesAud.length ? "ok" : null,
        ruta: "/sgc/auditorias",
      },
    );
  }
  return kpis;
}

/** Mapa por proceso: dónde se acumulan los problemas. */
function _procesos(d) {
  if (d.soloMias) return [];
  const filas = d.procesos.map((p) => {
    const ncs = d.ncs.filter((n) => n.idProceso === p.idProceso);
    const ab = ncs.filter(_abierta);
    const acs = d.acs.filter((a) => a.idProceso === p.idProceso && _acAbierta(a));
    return {
      idProceso: p.idProceso, nombre: p.nombre, tipo: p.tipo,
      ncAbiertas: ab.length,
      ncVencidas: ab.filter((n) => n.diasRestantes < 0).length,
      ncMayores: ab.filter((n) => n.idClasificacion === 1).length,
      nc12m: ncs.filter((n) => n.diasDesdeDeteccion <= 365).length,
      acAbiertas: acs.length,
      acVencidas: acs.filter((a) => a.diasRestantes < 0).length,
    };
  });
  return filas.filter((f) => f.nc12m || f.acAbiertas).sort((a, b) => b.ncVencidas - a.ncVencidas || b.ncAbiertas - a.ncAbiertas || b.nc12m - a.nc12m);
}

/** Todo el análisis determinístico (capas 1 y 2). */
async function analizar(req) {
  const d = await _datos(req);
  const hoy = new Date();
  const kpis = _kpis(d, hoy);
  const prioridades = _detectar(d, hoy);
  // R10 · Eficacia de ACs por debajo de la meta del indicador de eficacia
  const ef = kpis.find((k) => k.id === "eficacia");
  if (ef && ef.valor != null && ef.meta != null && ef.valor < ef.meta) {
    const exigibles = d.acs.filter((a) => a.fechaCompromiso && new Date(a.fechaCompromiso) < hoy);
    const noEficaces = exigibles.filter((a) => ![4, 5].includes(a.idEstatus));
    const indEf = d.indicadores.find((i) => /eficacia/i.test(i.nombre) && /correctiva/i.test(i.nombre));
    const registrado = indEf?.ultimo != null ? Number(indEf.ultimo) : null;
    prioridades.push({
      id: "eficacia-ac", regla: "Eficacia bajo la meta", nivel: "alta", categoria: "hecho", proceso: null,
      titulo: `Eficacia de acciones correctivas en ${ef.valor}% (meta ${ef.meta}%)`,
      detalle: `${ef.sub}.${registrado != null && Math.round(registrado) !== ef.valor ? ` El indicador ${indEf.clave} tiene capturado ${registrado}%: conviene revisar cómo se calcula ese registro.` : ""}`,
      porque: "Si las acciones no se verifican eficaces a tiempo no hay evidencia de que los problemas se resolvieron (cl. 10.2.1 d).",
      accion: "Verificar la eficacia de las acciones con plazo cumplido y cerrar o replantear las que no la demuestren.",
      falta: registrado != null && Math.round(registrado) !== ef.valor ? "Aclarar la diferencia entre la eficacia calculada de los registros y la capturada en el indicador." : null,
      evidencia: noEficaces.map((a) => ({ folio: a.folio, texto: `${C.AC_ESTATUS[a.idEstatus]} · plazo cumplido`, ruta: _ruta.ac(a.idAC) })),
      ruta: "/sgc/acciones-correctivas",
    });
    const maxDias = (p) => Math.max(0, ...p.evidencia.map((e) => e.dias || 0));
    prioridades.sort((a, b) => NIVEL[b.nivel] - NIVEL[a.nivel] || b.evidencia.length - a.evidencia.length || maxDias(b) - maxDias(a));
  }
  const indicadores = d.soloMias ? [] : d.indicadores.map((i) => {
    const e = _estadoIndicador(i, hoy);
    return { idIndicador: i.idIndicador, clave: i.clave, nombre: i.nombre, unidad: i.unidad, sentido: i.sentido, meta: e.meta, ultimo: e.ultimo, anterior: e.anterior, tendencia: e.tendencia, semaforo: e.semaforo, atrasado: e.atrasado, ruta: _ruta.ind(i.idIndicador) };
  });
  const conteo = { critica: 0, alta: 0, media: 0 };
  for (const p of prioridades) conteo[p.nivel] += 1;
  const datos = {
    alcance: d.soloMias ? "personal" : "empresa",
    conteo,
    kpis,
    prioridades,
    procesos: _procesos(d),
    indicadores,
    tendencia: d.tendencia.map((t) => ({ mes: t.mes, ncRegistradas: t.ncRegistradas, ncCerradas: t.ncCerradas, acCerradas: t.acCerradas })),
    muestra: { ncs: d.ncs.length, acs: d.acs.length, desde: d.ncs.reduce((m, n) => (!m || n.fechaDeteccion < m ? n.fechaDeteccion : m), null) },
    metodologia: METODOLOGIA,
    datosFaltantes: DATOS_FALTANTES,
  };
  // Huella de las cifras: si cambia, un diagnóstico guardado ya no corresponde a los datos actuales
  const huella = JSON.stringify({ k: kpis.map((k) => [k.id, k.valor, k.total]), p: prioridades.map((p) => [p.id, p.nivel, p.evidencia.map((e) => e.folio)]) });
  datos.hash = crypto.createHash("sha1").update(huella).digest("hex");
  return datos;
}

/** GET /api/sgc/inteligencia */
async function getInteligencia(req, res) {
  try {
    const datos = await analizar(req);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data: { generado: new Date().toISOString(), ...datos } });
  } catch (err) {
    console.error("[sgc.inteligencia] getInteligencia:", err);
    C._err(res, 500, "Error interno");
  }
}

module.exports = { analizar, getInteligencia, METODOLOGIA, U };
