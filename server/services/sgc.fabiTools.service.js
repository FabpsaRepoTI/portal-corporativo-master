// server/services/sgc.fabiTools.service.js
// Herramientas de SOLO LECTURA de Fab-i en el SGC/SGI. Se registran en
// fabiTools.service.js (mismo ejecutor y misma bitácora fabi_tool_log).
//
// Cada función recibe el login de la SESIÓN y vuelve a leer su rol SGC: el
// Responsable de área (3) solo ve sus NCs y ACs, como en las pantallas; los
// tickets de la Mesa SGI solo los ve completos el equipo SGI (roles 1 y 2).
// Nada de SQL generado por el modelo; solo se devuelven los campos necesarios
// (estos datos se envían a la API de Anthropic para redactar la respuesta).
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { obtenerUsuarioSgc, puedeModulo, ID_EMPRESA } = require("../middleware/sgcAuth.middleware");
const { semaforo } = require("./sgcIndicadores.service");
const { searchDocuments } = require("./sgc.sharepointSearch.service");

const MAX_TEXTO = 400;
const recorta = (v, n = MAX_TEXTO) => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
};
const dia = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);
const SIN_ROL = { sin_acceso: true, motivo: "El usuario no tiene un rol en Sistemas de Gestión." };

async function _perfil(login) {
  const u = await obtenerUsuarioSgc(login);
  return u ? { ...u, soloMias: u.idRol === 3, esSGI: [1, 2].includes(u.idRol) && puedeModulo(u, "mesa_sgi") } : null;
}

function _request(db, u) {
  return db.request()
    // Empresa del usuario en esta petición (1, o 99 en modo demo)
    .input("idEmpresa", sql.Int, u.empresa_id || ID_EMPRESA)
    .input("login", sql.VarChar(255), u.login)
    .input("soloMias", sql.Bit, u.soloMias ? 1 : 0);
}

// Folio "NC-2026-0007"; acepta minúsculas, espacios y el consecutivo sin ceros
// Los folios de la demo llevan D antes del consecutivo: NC-2026-D001
function normalizarFolioSgc(valor) {
  const m = String(valor || "").trim().toUpperCase().match(/^(NC|AC|AUD|MSI)[\s-]*(\d{4})[\s-]*(D?)0*(\d{1,6})$/);
  return m ? { tipo: m[1], folio: `${m[1]}-${m[2]}-${m[3] ? `D${m[4].padStart(3, "0")}` : m[4].padStart(4, "0")}` } : null;
}

// ── sgc_consultar_folio ────────────────────────────────────

async function consultarFolio(login, { folio }) {
  const u = await _perfil(login);
  if (!u) return SIN_ROL;
  const f = normalizarFolioSgc(folio);
  if (!f) return { encontrado: false, motivo: "Folio inválido. Usa el formato NC-2026-0007, AC-2026-0004, AUD-2026-0001 o MSI-2026-0001." };
  const db = await getPool();
  const req = _request(db, u).input("folio", sql.VarChar(20), f.folio);
  const noEncontrado = { encontrado: false, motivo: `No hay un registro ${f.folio} que el usuario pueda consultar.` };
  const MODULO_FOLIO = { NC: "nc", AC: "ac", AUD: "auditorias" };
  if (MODULO_FOLIO[f.tipo] && !puedeModulo(u, MODULO_FOLIO[f.tipo])) return { sin_acceso: true, motivo: "El usuario no tiene acceso a ese módulo del SGC." };

  if (f.tipo === "NC") {
    const r = await req.query(`
      DECLARE @hoy DATE = ${C.HOY_SQL};
      SELECT TOP 1 nc.idNC, nc.folioNC, nc.idEstatus, nc.descripcion, nc.correccionInmediata, o.nombre AS origen,
             c.nombre AS clasificacion, LTRIM(RTRIM(u.name)) AS responsable, nc.fechaDeteccion, nc.fechaCompromiso,
             pr.nombre AS proceso,
             nc.fechaCierre, DATEDIFF(DAY, @hoy, nc.fechaCompromiso) AS diasRestantes,
             (SELECT COUNT(*) FROM sgc_acciones_correctivas ac WHERE ac.idNC = nc.idNC) AS acciones
      FROM sgc_no_conformidades nc
      JOIN sgc_cat_origenes o ON o.idOrigen = nc.idOrigen
      JOIN sgc_cat_clasificaciones c ON c.idClasificacion = nc.idClasificacion
      LEFT JOIN sec_users u ON u.login = nc.loginResponsable
      LEFT JOIN sgc_procesos pr ON pr.idProceso = nc.idProceso
      WHERE nc.folioNC = @folio AND nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login);

      SELECT TOP 3 h.estatusNuevo, h.motivo, h.fechaRegistro, LTRIM(RTRIM(u.name)) AS quien
      FROM sgc_historial_nc h JOIN sgc_no_conformidades nc ON nc.idNC = h.idNC
      LEFT JOIN sec_users u ON u.login = h.login
      WHERE nc.folioNC = @folio ORDER BY h.fechaRegistro DESC, h.idHistorial DESC;
    `);
    const n = r.recordsets[0][0];
    if (!n) return noEncontrado;
    return {
      encontrado: true,
      tipo: "No conformidad",
      folio: n.folioNC,
      estatus: C.NC_ESTATUS[n.idEstatus],
      descripcion: recorta(n.descripcion),
      correccion_inmediata: recorta(n.correccionInmediata, 200),
      origen: n.origen,
      clasificacion: n.clasificacion,
      proceso: n.proceso,
      responsable: n.responsable,
      fecha_deteccion: dia(n.fechaDeteccion),
      fecha_compromiso: dia(n.fechaCompromiso),
      fecha_cierre: dia(n.fechaCierre),
      dias_para_compromiso: [5, 6].includes(n.idEstatus) ? null : n.diasRestantes,
      vencida: ![5, 6].includes(n.idEstatus) && n.diasRestantes < 0,
      acciones_correctivas: n.acciones,
      ultimos_movimientos: r.recordsets[1].map((h) => ({ estatus: C.NC_ESTATUS[h.estatusNuevo], fecha: dia(h.fechaRegistro), quien: h.quien, motivo: recorta(h.motivo, 160) })),
      enlace: `/sgc/no-conformidades/${n.idNC}`,
    };
  }

  if (f.tipo === "AC") {
    const r = await req.query(`
      DECLARE @hoy DATE = ${C.HOY_SQL};
      SELECT TOP 1 ac.idAC, ac.folioAC, ac.idEstatus, COALESCE(ac.titulo, ac.d2_descripcion, ac.descripcion) AS titulo,
             COALESCE(ac.causaRaiz, ac.d4_causaRaiz) AS causaRaiz, nc.folioNC, LTRIM(RTRIM(u.name)) AS responsable,
             ac.fechaCompromiso, ac.fechaCierre, DATEDIFF(DAY, @hoy, ac.fechaCompromiso) AS diasRestantes,
             (SELECT COUNT(*) FROM sgc_acciones_plan p WHERE p.idAC = ac.idAC) AS lineas,
             (SELECT COUNT(*) FROM sgc_acciones_plan p WHERE p.idAC = ac.idAC AND p.idEstatus = 3) AS completadas
      FROM sgc_acciones_correctivas ac
      LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      LEFT JOIN sec_users u ON u.login = ac.loginResponsable
      WHERE ac.folioAC = @folio AND ac.idEmpresa = @idEmpresa
        AND (@soloMias = 0 OR ac.loginResponsable = @login OR nc.loginResponsable = @login);
    `);
    const a = r.recordset[0];
    if (!a) return noEncontrado;
    return {
      encontrado: true,
      tipo: "Acción correctiva",
      folio: a.folioAC,
      nc_origen: a.folioNC,
      estatus: C.AC_ESTATUS[a.idEstatus],
      titulo: recorta(a.titulo, 200),
      causa_raiz: recorta(a.causaRaiz, 300),
      responsable: a.responsable,
      fecha_compromiso: dia(a.fechaCompromiso),
      fecha_cierre: dia(a.fechaCierre),
      dias_para_compromiso: a.idEstatus >= 4 ? null : a.diasRestantes,
      vencida: a.idEstatus < 4 && a.diasRestantes < 0,
      plan: { lineas: a.lineas, completadas: a.completadas, avance_pct: a.lineas ? Math.round((100 * a.completadas) / a.lineas) : 0 },
      enlace: `/sgc/acciones-correctivas/${a.idAC}`,
    };
  }

  if (f.tipo === "AUD") {
    const r = await req.query(`
      DECLARE @hoy DATE = ${C.HOY_SQL};
      SELECT TOP 1 a.idAuditoria, a.folio, a.tipo, a.idEstatus, a.titulo, a.alcance, a.normaAplicable,
             a.fechaPlan, a.fechaFin, a.fechaEjecucion, LTRIM(RTRIM(u.name)) AS auditorLider,
             DATEDIFF(DAY, @hoy, a.fechaPlan) AS diasRestantes,
             (SELECT COUNT(*) FROM sgc_hallazgos h WHERE h.idAuditoria = a.idAuditoria AND h.tipo = 1) AS hallazgosNC,
             (SELECT COUNT(*) FROM sgc_hallazgos h WHERE h.idAuditoria = a.idAuditoria AND h.tipo = 2) AS observaciones,
             (SELECT COUNT(*) FROM sgc_hallazgos h WHERE h.idAuditoria = a.idAuditoria AND h.tipo = 3) AS oportunidades
      FROM sgc_auditorias a
      LEFT JOIN sec_users u ON u.login = a.loginAuditor
      WHERE a.folio = @folio AND a.idEmpresa = @idEmpresa;
    `);
    const a = r.recordset[0];
    if (!a) return noEncontrado;
    return {
      encontrado: true,
      tipo: `Auditoría ${C.AUD_TIPO[a.tipo] || ""}`.trim(),
      folio: a.folio,
      estatus: C.AUD_ESTATUS[a.idEstatus],
      titulo: recorta(a.titulo, 200),
      alcance: recorta(a.alcance, 300),
      norma: a.normaAplicable,
      auditor_lider: a.auditorLider,
      fecha_plan: dia(a.fechaPlan),
      fecha_fin: dia(a.fechaFin),
      dias_para_inicio: a.idEstatus === 1 ? a.diasRestantes : null,
      hallazgos: { no_conformidades: a.hallazgosNC, observaciones: a.observaciones, oportunidades_mejora: a.oportunidades },
      enlace: `/sgc/auditorias/${a.idAuditoria}`,
    };
  }

  // MSI: el equipo SGI ve todas; los demás, solo las suyas
  const r = await req.input("esSGI", sql.Bit, u.esSGI ? 1 : 0).query(`
    SELECT TOP 1 t.idTicket, t.folio, t.idEstatus, t.titulo, t.prioridad, s.nombre AS servicio,
           LTRIM(RTRIM(us.name)) AS solicitante, LTRIM(RTRIM(ua.name)) AS asignado,
           t.fechaCreacion, t.fechaLimite, t.fechaCierre,
           CASE WHEN t.idEstatus IN (1, 2, 3) AND t.fechaLimite < GETDATE() THEN 1 ELSE 0 END AS vencido
    FROM sgc_msi_tickets t
    JOIN sgc_msi_cat_servicios s ON s.idServicio = t.idServicio
    LEFT JOIN sec_users us ON us.login = t.loginSolicitante
    LEFT JOIN sec_users ua ON ua.login = t.loginAsignado
    WHERE t.folio = @folio AND t.idEmpresa = @idEmpresa AND (@esSGI = 1 OR t.loginSolicitante = @login);
  `);
  const t = r.recordset[0];
  if (!t) return noEncontrado;
  return {
    encontrado: true,
    tipo: "Solicitud de Mesa SGI",
    folio: t.folio,
    estatus: C.MSI_ESTATUS[t.idEstatus],
    titulo: recorta(t.titulo, 200),
    servicio: t.servicio,
    prioridad: C.MSI_PRIORIDAD[t.prioridad],
    solicitante: t.solicitante,
    asignado_a: t.asignado,
    creada: dia(t.fechaCreacion),
    fecha_limite: dia(t.fechaLimite),
    fecha_cierre: dia(t.fechaCierre),
    vencida: !!t.vencido,
    enlace: `/mesa-sgi/ticket/${t.idTicket}`,
  };
}

// ── sgc_listado ─────────────────────────────────────────────

const LISTAS = ["nc_vencidas", "nc_abiertas", "ac_por_vencer", "auditorias_proximas", "riesgos_altos", "indicadores_fuera_de_meta", "tickets_mesa_sgi"];

async function listado(login, { lista }) {
  const u = await _perfil(login);
  if (!u) return SIN_ROL;
  if (!LISTAS.includes(lista)) return { error: "Lista no disponible." };
  const MODULO_LISTA = { nc_vencidas: "nc", nc_abiertas: "nc", ac_por_vencer: "ac", auditorias_proximas: "auditorias", riesgos_altos: "riesgos", indicadores_fuera_de_meta: "indicadores" };
  if (MODULO_LISTA[lista] && !puedeModulo(u, MODULO_LISTA[lista])) return { sin_acceso: true, motivo: "El usuario no tiene acceso a ese módulo del SGC." };
  const db = await getPool();
  const req = _request(db, u).input("altoMin", sql.Int, C.NIVEL_ALTO_MIN).input("esSGI", sql.Bit, u.esSGI ? 1 : 0);
  const alcance = u.soloMias ? "solo los registros a cargo del usuario" : "toda la empresa";
  const NC_MIAS = "(@soloMias = 0 OR nc.loginResponsable = @login)";

  const consultas = {
    nc_vencidas: `
      SELECT nc.folioNC AS folio, LEFT(nc.descripcion, 160) AS descripcion, nc.idEstatus, LTRIM(RTRIM(u.name)) AS responsable,
             nc.fechaCompromiso, DATEDIFF(DAY, @hoy, nc.fechaCompromiso) AS dias
      FROM sgc_no_conformidades nc LEFT JOIN sec_users u ON u.login = nc.loginResponsable
      WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus IN (1, 2, 3, 4) AND nc.fechaCompromiso < @hoy AND ${NC_MIAS}
      ORDER BY nc.fechaCompromiso`,
    nc_abiertas: `
      SELECT nc.folioNC AS folio, LEFT(nc.descripcion, 160) AS descripcion, nc.idEstatus, LTRIM(RTRIM(u.name)) AS responsable,
             nc.fechaCompromiso, DATEDIFF(DAY, @hoy, nc.fechaCompromiso) AS dias
      FROM sgc_no_conformidades nc LEFT JOIN sec_users u ON u.login = nc.loginResponsable
      WHERE nc.idEmpresa = @idEmpresa AND nc.idEstatus IN (1, 2, 3, 4) AND ${NC_MIAS}
      ORDER BY nc.fechaCompromiso`,
    ac_por_vencer: `
      SELECT ac.folioAC AS folio, nc.folioNC, COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 160)) AS descripcion, ac.idEstatus,
             LTRIM(RTRIM(u.name)) AS responsable, ac.fechaCompromiso, DATEDIFF(DAY, @hoy, ac.fechaCompromiso) AS dias
      FROM sgc_acciones_correctivas ac
      LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      LEFT JOIN sec_users u ON u.login = ac.loginResponsable
      WHERE ac.idEmpresa = @idEmpresa AND ac.idEstatus IN (1, 2, 3) AND ac.fechaCompromiso <= DATEADD(DAY, 30, @hoy)
        AND (@soloMias = 0 OR ac.loginResponsable = @login OR nc.loginResponsable = @login)
      ORDER BY ac.fechaCompromiso`,
    auditorias_proximas: `
      SELECT a.folio, COALESCE(a.titulo, LEFT(a.alcance, 160)) AS descripcion, a.idEstatus, LTRIM(RTRIM(u.name)) AS responsable,
             a.fechaPlan AS fecha, DATEDIFF(DAY, @hoy, a.fechaPlan) AS dias
      FROM sgc_auditorias a LEFT JOIN sec_users u ON u.login = a.loginAuditor
      WHERE a.idEmpresa = @idEmpresa AND a.idEstatus IN (1, 2)
      ORDER BY a.fechaPlan`,
    riesgos_altos: `
      SELECT r.nombre AS descripcion, r.probabilidad * r.impacto AS nivel, r.impactoEconomico, r.categoria,
             LTRIM(RTRIM(u.name)) AS responsable, r.fechaRevision AS fecha
      FROM sgc_riesgos r LEFT JOIN sec_users u ON u.login = r.loginResponsable
      WHERE r.idEmpresa = @idEmpresa AND r.activo = 1 AND r.idEstatus = 1 AND r.tipo = 1 AND r.probabilidad * r.impacto >= @altoMin
      ORDER BY r.probabilidad * r.impacto DESC, r.impactoEconomico DESC`,
    indicadores_fuera_de_meta: `
      SELECT i.clave AS folio, i.nombre AS descripcion, i.meta, i.unidad, i.sentido, v.valor, v.periodo AS fecha
      FROM sgc_indicadores i
      CROSS APPLY (SELECT TOP 1 valor, periodo FROM sgc_indicadores_valores x WHERE x.idIndicador = i.idIndicador ORDER BY periodo DESC) v
      WHERE i.idEmpresa = @idEmpresa AND i.activo = 1
      ORDER BY i.nombre`,
    tickets_mesa_sgi: `
      SELECT t.folio, t.titulo AS descripcion, t.idEstatus, t.prioridad, s.nombre AS servicio,
             LTRIM(RTRIM(ua.name)) AS responsable, t.fechaLimite AS fecha,
             CASE WHEN t.fechaLimite < GETDATE() THEN 1 ELSE 0 END AS vencido
      FROM sgc_msi_tickets t
      JOIN sgc_msi_cat_servicios s ON s.idServicio = t.idServicio
      LEFT JOIN sec_users ua ON ua.login = t.loginAsignado
      WHERE t.idEmpresa = @idEmpresa AND t.idEstatus IN (1, 2, 3) AND (@esSGI = 1 OR t.loginSolicitante = @login)
      ORDER BY ISNULL(t.fechaLimite, '9999-12-31')`,
  };
  const r = await req.query(`DECLARE @hoy DATE = ${C.HOY_SQL}; ${consultas[lista]}`);
  let filas = r.recordset;
  if (lista === "indicadores_fuera_de_meta") {
    filas = filas
      .map((x) => ({ ...x, semaforo: semaforo(x.valor, x.meta, x.sentido) }))
      .filter((x) => x.semaforo === "rojo" || x.semaforo === "amarillo");
  }
  const total = filas.length;
  const estatus = (x) =>
    lista.startsWith("nc_") ? C.NC_ESTATUS[x.idEstatus]
    : lista === "ac_por_vencer" ? C.AC_ESTATUS[x.idEstatus]
      : lista === "auditorias_proximas" ? C.AUD_ESTATUS[x.idEstatus]
        : lista === "tickets_mesa_sgi" ? C.MSI_ESTATUS[x.idEstatus] : undefined;
  return {
    lista,
    alcance: lista === "tickets_mesa_sgi" && !u.esSGI ? "solo las solicitudes del usuario" : alcance,
    total,
    elementos: filas.slice(0, 10).map((x) => ({
      folio: x.folio,
      nc_origen: x.folioNC,
      descripcion: recorta(x.descripcion, 160),
      estatus: estatus(x),
      responsable: x.responsable,
      fecha: dia(x.fechaCompromiso || x.fecha),
      dias: x.dias,
      nivel: x.nivel,
      impacto_economico_mxn: x.impactoEconomico == null ? undefined : Number(x.impactoEconomico),
      categoria: x.categoria ? C.RIESGO_CATEGORIA[x.categoria] : undefined,
      valor: x.valor == null ? undefined : Number(x.valor),
      meta: x.meta == null ? undefined : Number(x.meta),
      unidad: x.unidad,
      semaforo: x.semaforo,
      prioridad: x.prioridad ? C.MSI_PRIORIDAD[x.prioridad] : undefined,
      servicio: x.servicio,
      vencido: x.vencido == null ? undefined : !!x.vencido,
    })),
  };
}

// ── Definiciones para la API (tool use) ─────────────────────
const HERRAMIENTAS_SGC = [
  {
    name: "sgc_consultar_folio",
    description:
      "Detalle y estado de UN registro del SGC por su folio: no conformidad (NC-2026-0007), acción correctiva (AC-2026-0004), auditoría (AUD-2026-0001) o solicitud de la Mesa SGI (MSI-2026-0001). Devuelve estatus, responsable, fechas, días para el compromiso y si está vencido. Úsala cuando el usuario mencione un folio o pregunte cómo va un registro concreto. Respeta los permisos del usuario.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { folio: { type: "string", description: "Folio, p. ej. NC-2026-0007" } },
      required: ["folio"],
      additionalProperties: false,
    },
  },
  {
    name: "sgc_listado",
    description:
      "Hasta 10 registros del SGC de una lista y el total: nc_vencidas (NCs abiertas con compromiso vencido), nc_abiertas, ac_por_vencer (acciones correctivas abiertas que vencen en 30 días o ya vencidas), auditorias_proximas (planeadas o en curso), riesgos_altos (riesgos activos con nivel mayor a 12, con impacto económico), indicadores_fuera_de_meta (último valor en amarillo o rojo) o tickets_mesa_sgi (solicitudes abiertas de la Mesa SGI). Úsala cuando pidan nombres, folios o detalle más allá de los totales del contexto.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { lista: { type: "string", enum: LISTAS } },
      required: ["lista"],
      additionalProperties: false,
    },
  },
];

HERRAMIENTAS_SGC.push({
  name: "sgc_buscar_documentos",
  description:
    "Busca archivos en la biblioteca documental del SGI (SharePoint del SGC: procedimientos, instructivos, manuales, formatos, registros, FODA, HACCP, listas maestras, etc.). Devuelve hasta 8 archivos con nombre, carpeta, tipo y fecha de modificación. Usa 1 a 4 palabras clave; carpeta es opcional (p. ej. \"Recursos Humanos\", \"HACCP\") y filtra por ruta.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      termino: { type: "string", description: "Palabras clave, p. ej. \"control de documentos\"" },
      carpeta: { type: ["string", "null"], description: "Carpeta donde buscar, o null para toda la biblioteca" },
    },
    required: ["termino", "carpeta"],
    additionalProperties: false,
  },
});

// Solo lectura: nombre, carpeta y fechas; nunca URLs de SharePoint
async function buscarDocumentos(login, { termino, carpeta }) {
  const u = await obtenerUsuarioSgc(login);
  if (!u) return { error: "Sin acceso al SGC." };
  // La biblioteca de SharePoint es la de FABPSA: no se expone en el modo demo
  if (u.demo) return { resultados: [], total: 0, motivo: "En la demostración no hay biblioteca documental conectada." };
  const t = recorta(termino, 120);
  if (!t) return { resultados: [], total: 0 };
  const resultados = await searchDocuments(t, carpeta ? recorta(carpeta, 120) : null);
  return { termino: t, carpeta: carpeta || null, total: resultados.length, resultados };
}

HERRAMIENTAS_SGC.push({
  name: "sgc_prioridades",
  description:
    "Análisis del Centro de control del SGC: las situaciones que requieren atención ya priorizadas por reglas (crítica, alta, media) con su evidencia (folios), los indicadores estratégicos con comparación contra el periodo anterior, dónde se concentran los problemas por proceso y el estado de los objetivos de calidad. Úsala para preguntas como «¿qué debo atender primero?», «¿qué procesos tienen más problemas?», «¿qué está empeorando?», «¿qué revisar antes de una auditoría?» o «¿cómo mejorar el cumplimiento?».",
  strict: true,
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
});

// Mismo análisis que muestra el Centro de control (cifras SQL + reglas), con el alcance del rol
async function prioridades(login) {
  const u = await obtenerUsuarioSgc(login);
  if (!u) return { error: "Sin acceso al SGC." };
  const { analizar } = require("./sgc.inteligencia.service");
  const d = await analizar({ login: u.login, sgcRol: u.idRol, idEmpresa: u.empresa_id || ID_EMPRESA });
  return {
    alcance: d.alcance,
    muestra: d.muestra,
    resultados: d.prioridades.map((p) => ({ nivel: p.nivel, tipo: p.categoria, titulo: p.titulo, detalle: p.detalle, por_que: p.porque, accion: p.accion, proceso: p.proceso, falta_confirmar: p.falta, evidencia: p.evidencia.map((e) => `${e.folio}: ${e.texto}`) })),
    indicadores: d.kpis.map((k) => ({ nombre: k.etiqueta, valor: k.valor, total: k.total ?? null, meta: k.meta ?? null, comparacion: k.comparacion ? `${k.comparacion.valor} ${k.comparacion.texto}` : null })),
    procesos: d.procesos,
    objetivos: d.indicadores.map((i) => ({ clave: i.clave, nombre: i.nombre, ultimo: i.ultimo, meta: i.meta, semaforo: i.semaforo, tendencia: i.tendencia })),
    metodologia: d.metodologia,
    datos_no_registrados: d.datosFaltantes,
  };
}

const EJECUTORES_SGC = {
  sgc_consultar_folio: (login, p) => consultarFolio(login, p),
  sgc_listado: (login, p) => listado(login, p),
  sgc_buscar_documentos: (login, p) => buscarDocumentos(login, p),
  sgc_prioridades: (login) => prioridades(login),
};

module.exports = { HERRAMIENTAS_SGC, EJECUTORES_SGC, normalizarFolioSgc };
