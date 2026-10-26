// server/services/fabiTools.service.js
// Herramientas de SOLO LECTURA de Fabi (asistente de Mesa de Servicio).
//
// Claude no toca la base de datos: solo puede pedir una de estas herramientas
// por su nombre, con parámetros validados aquí. Cada función recibe el login
// de la SESIÓN (req.user.login, nunca un dato que mande el modelo o el
// usuario en el chat), así que una persona solo ve sus propias solicitudes.
// Las consultas son las mismas que usa la pantalla "Mis solicitudes"
// (solicitudesUsuario.service.js) y el panel de Servicios TI (home.service.js),
// con sus mismas reglas. Nada de SQL generado por el modelo.
//
// Solo se devuelven los campos necesarios para responder: nada de bitácora
// interna, comentarios internos ni archivos (estos datos se envían a la API
// de Anthropic para redactar la respuesta).
const { getPool, sql } = require("../db");
const { getMisSolicitudes, getDetalleSolicitud } = require("./solicitudesUsuario.service");
const { getEstadoServicios } = require("./home.service");
const { resolverPermisoSit } = require("../middleware/sit.middleware");
const sitSvc = require("./sit.service");
const ejecutivo = require("./ejecutivo.service");

// Estatus de cat_estatusTI que cuentan como "abiertas o en atención"
const ESTATUS_ABIERTOS = new Set([1, 2, 6, 7, 8]); // Abierto, En progreso, En pausa, En diagnóstico, Escalado
const MAX_COMENTARIOS = 10;
const MAX_TEXTO = 500;

const recorta = (v, n = MAX_TEXTO) => {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
};
const fecha = (v) => (v ? new Date(v).toISOString().slice(0, 16).replace("T", " ") : null);

// Folio "TI-00135"; también acepta "135", "ti 135", "TI-135"
function normalizarFolio(valor) {
  const m = String(valor || "").trim().toUpperCase().match(/^(?:TI[\s-]*)?0*(\d{1,8})$/);
  return m ? `TI-${m[1].padStart(5, "0")}` : null;
}

// ── Herramientas ────────────────────────────────────────────

// estado: "abiertas" (en atención), "cerradas" (resueltas, cerradas o
// canceladas) o "todas". Siempre devuelve el resumen por estatus de TODAS las
// solicitudes del usuario, para preguntas como "¿cuántas me han resuelto?".
async function misSolicitudes(login, { estado = "abiertas" } = {}) {
  const todas = await getMisSolicitudes(login, {});
  const filtro =
    estado === "todas" ? () => true
    : estado === "cerradas" ? (s) => !ESTATUS_ABIERTOS.has(s.idEstatus)
      : (s) => ESTATUS_ABIERTOS.has(s.idEstatus);
  const elegidas = todas.filter(filtro);
  const porEstatus = {};
  for (const x of todas) porEstatus[x.estatusNombre] = (porEstatus[x.estatusNombre] || 0) + 1;
  return {
    filtro: estado,
    total_solicitudes: todas.length,
    total_abiertas: todas.filter((x) => ESTATUS_ABIERTOS.has(x.idEstatus)).length,
    total_cerradas: todas.filter((x) => !ESTATUS_ABIERTOS.has(x.idEstatus)).length,
    resumen_por_estatus: porEstatus,
    total_en_filtro: elegidas.length,
    solicitudes: elegidas.slice(0, 10).map((s) => ({
      folio: s.folio,
      titulo: recorta(s.titulo, 160),
      estado: s.estatusNombre,
      fecha_creacion: fecha(s.fechaCreacion),
      area_asignada: s.servicio,
      tecnico_asignado: s.nombreTecnico || null,
    })),
  };
}

async function estatusSolicitud(login, { folio }) {
  const normal = normalizarFolio(folio);
  if (!normal) return { encontrada: false, motivo: "Folio con formato inválido. Ejemplo válido: TI-00135." };
  const db = await getPool();
  const r = await db.request()
    .input("folio", sql.VarChar(20), normal)
    .input("login", sql.VarChar(255), login)
    .query(`SELECT TOP 1 idSolicitud FROM solicitudTI WHERE folio = @folio AND idUsuario = @login AND idServicio != 2`);
  const id = r.recordset[0]?.idSolicitud;
  // Mismo mensaje si no existe o si es de otra persona: no revela folios ajenos
  if (!id) return { encontrada: false, motivo: `No hay una solicitud ${normal} a nombre de este usuario.` };
  const d = await getDetalleSolicitud(id, login);
  if (!d) return { encontrada: false, motivo: `No hay una solicitud ${normal} a nombre de este usuario.` };
  const ultimaActividad = [d.fechaCreacion, d.fechaResolucion, ...(d.comentarios || []).map((c) => c.fecha)]
    .filter(Boolean)
    .map((v) => new Date(v))
    .sort((a, b) => b - a)[0];
  return {
    encontrada: true,
    folio: d.folio,
    titulo: recorta(d.titulo, 160),
    descripcion: recorta(d.descripcion),
    estado: d.estatusNombre,
    prioridad: d.prioridadNombre,
    servicio: d.servicio,
    tecnico_asignado: d.nombreTecnico || null,
    escalado_a: d.nombreProveedor || null,
    fecha_creacion: fecha(d.fechaCreacion),
    fecha_limite_resolucion: fecha(d.fechaLimiteResol),
    fecha_resolucion: fecha(d.fechaResolucion),
    fecha_actualizacion: fecha(ultimaActividad),
    comentarios: (d.comentarios || []).slice(-MAX_COMENTARIOS).map((c) => ({
      de: c.idUsuario === login ? "el usuario" : c.nombreUsuario || "Mesa de Servicio",
      fecha: fecha(c.fecha),
      texto: recorta(c.comentario, 300),
    })),
  };
}

// Estadísticas generales de la Mesa de Servicio: solo para el equipo de TI
// (área SISTEMAS en sec_users, la misma regla del resto del portal; se lee
// de la base de datos, no de lo que mande el navegador). Son las mismas
// cifras del Visor Ejecutivo, agregadas: sin títulos, descripciones ni datos
// de los solicitantes. La carga por técnico solo nombra al personal de TI.
const PERIODOS = new Set([7, 30, 90, 180, 365]);
async function _esEquipoTi(login) {
  const db = await getPool();
  const r = await db.request()
    .input("login", sql.VarChar(255), login)
    .query("SELECT TOP 1 UPPER(LTRIM(RTRIM(area))) AS area FROM sec_users WHERE login = @login AND active = 'Y'");
  return ["SISTEMAS", "SYSTEMS"].includes(r.recordset[0]?.area);
}

async function estadisticasMesa(login, { periodo_dias }) {
  if (!(await _esEquipoTi(login))) {
    return {
      sin_acceso: true,
      motivo: "Las estadísticas generales de la Mesa de Servicio solo están disponibles para el equipo de TI. Puedo darte el resumen de tus propias solicitudes.",
    };
  }
  const periodo = PERIODOS.has(Number(periodo_dias)) ? Number(periodo_dias) : 30;
  const [resumen, distribucion, carga, sla] = await Promise.all([
    ejecutivo.getResumen({ periodo }),
    ejecutivo.getDistribucion({ periodo }),
    ejecutivo.getCargaEquipo({}),
    ejecutivo.getSLA({ periodo }),
  ]);
  return {
    periodo_dias: periodo,
    backlog_actual: {
      activas: resumen.activosAhora,
      abiertas_sin_atender: resumen.pendientes,
      en_progreso: resumen.enProceso,
      en_pausa: resumen.enPausa,
      en_diagnostico: resumen.enDiagnostico,
      escaladas: resumen.escalados,
      sin_tecnico_asignado: resumen.sinAsignar,
      criticas: resumen.criticas,
      fuera_de_sla: resumen.vencidosSLA,
      sla_vence_en_4_horas: resumen.porVencer,
      servicio_con_mas_activas: resumen.servicioTopActivo || null,
      sitio_con_mas_activas: resumen.sitioTopActivo || null,
    },
    periodo: {
      creadas: resumen.total,
      resueltas: resumen.resueltas,
      variacion_creadas_vs_periodo_anterior_pct: resumen.deltas?.total ?? null,
      cumplimiento_sla_pct: resumen.pctSLA,
      tiempo_promedio_resolucion_horas: resumen.tiempoPromedioHrs,
      satisfaccion_promedio_1a5: resumen.satisfaccion,
      evaluaciones: resumen.totalEval,
    },
    creadas_por_prioridad: (distribucion.prioridad || []).map((x) => ({ prioridad: x.prioridad, total: x.total })),
    creadas_por_estado: (distribucion.estado || []).map((x) => ({ estado: x.estatus, total: x.total })),
    creadas_por_sitio: (distribucion.sitio || []).map((x) => ({ sitio: x.sitio, total: x.total })),
    creadas_por_area_solicitante: (distribucion.area || []).slice(0, 8).map((x) => ({ area: x.area, total: x.total })),
    sla_por_servicio: (sla || []).slice(0, 10).map((x) => ({
      servicio: x.servicio,
      resueltas: x.total,
      dentro_sla: x.dentroSLA,
      fuera_sla: x.fueraSLA,
      promedio_resolucion_horas: x.promedioMin != null ? Math.round(x.promedioMin / 6) / 10 : null,
    })),
    carga_por_tecnico: (carga.tecnicos || []).map((t) => ({
      tecnico: t.nombre,
      activas: t.activas,
      fuera_sla: t.fueraSLA,
      criticas: t.criticas,
    })),
    activas_sin_asignar: carga.sinAsignar,
  };
}

async function serviciosTiEstado() {
  const servicios = await getEstadoServicios();
  return {
    servicios: servicios.map((s) => ({
      servicio: s.nombre,
      estado: s.estado,
      detalle: recorta(s.detalle, 200) || null,
      ultima_actualizacion: fecha(s.fechaRegistro),
    })),
  };
}

async function buscarGuia(login, { tema }) {
  const texto = String(tema || "").trim().slice(0, 80);
  if (texto.length < 2) return { resultados: [], motivo: "Tema demasiado corto." };
  // Comodines de LIKE del texto del usuario se tratan como texto literal
  const like = "%" + texto.replace(/[%_[\]]/g, (c) => `[${c}]`) + "%";
  const db = await getPool();
  const r = await db.request()
    .input("q", sql.NVarChar(120), like)
    .query(`
      SELECT TOP 3 idArticulo, titulo, extracto, categoria, fechaPublicacion
      FROM blog_articulo
      WHERE estatus = 2
        AND (titulo LIKE @q OR extracto LIKE @q OR categoria LIKE @q OR contenido LIKE @q)
      ORDER BY CASE WHEN titulo LIKE @q THEN 0 ELSE 1 END, fechaPublicacion DESC
    `);
  return {
    resultados: r.recordset.map((a) => ({
      titulo: a.titulo,
      resumen: recorta(a.extracto, 280),
      categoria: a.categoria,
      url_interna: "/cultura-digital",
    })),
  };
}

// ── Herramientas del SIT (Sistema de Información Técnica) ────
// Mismas fuentes y permisos que el módulo SIT: artículos del ERP, documentos de
// SharePoint y proveedores del ERP, solo de las plantas que permite el perfil
// SIT del usuario. Sin acceso al SIT (sin módulo, suspendido o revocado) no
// devuelven nada. El enlace es a la ficha del artículo en el portal (ahí el
// visor aplica los permisos de consulta/descarga/impresión), nunca la URL del
// archivo en SharePoint.
const MENSAJE_SIN_SIT = {
  SIN_MODULO: "El usuario no tiene acceso a Información Técnica (SIT).",
  SUSPENDIDO: "El acceso del usuario a Información Técnica está suspendido.",
  REVOCADO: "El acceso del usuario a Información Técnica fue retirado.",
  SIN_PERFIL: "El perfil del usuario no permite consultar Información Técnica.",
};
async function _permisoSit(login) {
  const r = await resolverPermisoSit(login);
  return r.denegado ? { error: MENSAJE_SIN_SIT[r.denegado] || MENSAJE_SIN_SIT.SIN_PERFIL } : { plantas: r.permiso.plantas };
}

async function sitBuscarArticulo(login, { termino }) {
  const p = await _permisoSit(login);
  if (p.error) return { sin_acceso: true, motivo: p.error };
  const articulos = await sitSvc.fabiBuscarArticulos(p.plantas, termino);
  return { articulos, ...(articulos.length ? {} : { motivo: "No hay artículos activos que coincidan en las plantas que puede consultar." }) };
}

async function sitDetalleArticulo(login, { codigoArticulo, empresa }) {
  const p = await _permisoSit(login);
  if (p.error) return { sin_acceso: true, motivo: p.error };
  const d = await sitSvc.fabiDetalleArticulo(p.plantas, codigoArticulo, empresa || null);
  // Mismo mensaje si no existe o si es de una planta que no puede ver
  return d ? { encontrado: true, ...d } : { encontrado: false, motivo: `No hay un artículo activo ${String(codigoArticulo).slice(0, 50)} en las plantas que puede consultar.` };
}

async function sitAlertasVencimiento(login) {
  const p = await _permisoSit(login);
  if (p.error) return { sin_acceso: true, motivo: p.error };
  return sitSvc.fabiAlertasVencimiento(p.plantas);
}

// ── Definiciones para la API (tool use) ─────────────────────
// strict: true → los parámetros que mande el modelo cumplen exactamente el esquema
// Herramientas de Fabi en Mesa de Servicio
const HERRAMIENTAS = [
  {
    name: "mis_solicitudes",
    description:
      "Solicitudes de Mesa de Servicio del usuario que está platicando contigo: su resumen por estatus (abiertas, resueltas, cerradas, canceladas…) y hasta 10 solicitudes del filtro pedido. Úsala cuando pregunte por sus solicitudes, tickets o incidencias sin un folio concreto, incluidas las ya resueltas o cerradas y cuántas lleva. No incluye solicitudes de desarrollo de software.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        estado: {
          type: "string",
          enum: ["abiertas", "cerradas", "todas"],
          description: "abiertas = en atención; cerradas = resueltas, cerradas o canceladas; todas = sin filtro",
        },
      },
      required: ["estado"],
      additionalProperties: false,
    },
  },
  {
    name: "estatus_solicitud",
    description:
      "Detalle y estatus de UNA solicitud del usuario por su folio (por ejemplo TI-00135; acepta también solo el número). Úsala cuando el usuario mencione un folio o pregunte cómo va una solicitud concreta. Solo devuelve solicitudes a nombre del propio usuario.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { folio: { type: "string", description: "Folio de la solicitud, p. ej. TI-00135 o 135" } },
      required: ["folio"],
      additionalProperties: false,
    },
  },
  {
    name: "estadisticas_mesa",
    description:
      "Estadísticas generales de la Mesa de Servicio (todas las solicitudes, no solo las del usuario): backlog actual por estado, críticas, sin asignar y fuera de SLA; en el periodo, creadas y resueltas, cumplimiento de SLA, tiempo promedio de resolución, satisfacción, distribución por prioridad, sitio y área, SLA por servicio y carga por técnico. Solo responde con datos al equipo de TI; a los demás les indica que no tienen acceso. Úsala para preguntas como '¿cuántos tickets se resolvieron este mes?', '¿cómo vamos de SLA?' o '¿quién tiene más carga?'.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        periodo_dias: { type: "integer", enum: [7, 30, 90, 180, 365], description: "Ventana de tiempo hacia atrás desde hoy; 30 si no se indica" },
      },
      required: ["periodo_dias"],
      additionalProperties: false,
    },
  },
  {
    name: "servicios_ti_estado",
    description:
      "Estado actual de los servicios de TI del portal (correo, ERP, red/internet, Office 365, telefonía): operando, con intermitencias o caído, y el detalle publicado por TI. Úsala cuando el usuario reporte que algo no funciona o pregunte si hay una falla general.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "buscar_guia",
    description:
      "Busca artículos publicados en Cultura Digital (guías y tips) sobre un tema. Devuelve hasta 3 con título y resumen. Úsala cuando el usuario quiera aprender a hacer algo o resolverlo por su cuenta.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { tema: { type: "string", description: "Tema a buscar, en pocas palabras (p. ej. 'contraseña correo', 'Teams')" } },
      required: ["tema"],
      additionalProperties: false,
    },
  },
];

// Herramientas del asistente del SIT (Fabi · Información Técnica)
const HERRAMIENTAS_SIT = [
  {
    name: "sit_buscar_articulo",
    description:
      "Busca artículos (materias primas, ingredientes, empaques) en el Sistema de Información Técnica por código o descripción, p. ej. 'lecitina de soya' o '1-050'. Devuelve hasta 5 con su código y empresa (IAFSA o FDNC). Úsala antes de sit_detalle_articulo cuando el usuario nombre un artículo sin dar su código. Solo busca en las plantas que el usuario puede consultar.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { termino: { type: "string", description: "Código o parte de la descripción del artículo" } },
      required: ["termino"],
      additionalProperties: false,
    },
  },
  {
    name: "sit_detalle_articulo",
    description:
      "Ficha técnica de UN artículo del SIT: sus documentos en SharePoint (tipo, proveedor, vencimiento y estado: vigente, por vencer, vencido, sin fecha o no vence) , sus proveedores con contacto técnico y correo, y su requisitoriedad (matriz de documentos obligatorios por proveedor: requeridos, faltantes y porcentaje de cumplimiento). Necesita el código exacto y, si se conoce, la empresa (vienen de sit_buscar_articulo). Úsala para preguntas como '¿quién es el proveedor de X?' o '¿qué documentos tiene X?', '¿qué nivel de requisitoriedad tiene X?' o '¿qué documentos le faltan?'.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        codigoArticulo: { type: "string", description: "Código exacto del artículo, p. ej. 1-050" },
        empresa: { type: "string", enum: ["IAFSA", "FDNC", ""], description: "Empresa del artículo; vacío si no se sabe" },
      },
      required: ["codigoArticulo", "empresa"],
      additionalProperties: false,
    },
  },
  {
    name: "sit_alertas_vencimiento",
    description:
      "Documentos técnicos ya vencidos o que vencen en los próximos 30 días, en las plantas que el usuario puede consultar: los 10 más urgentes, con artículo, tipo de documento, proveedor y fecha, más los totales. Úsala cuando pregunten qué documentos están por vencer o vencidos.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
];

const EJECUTORES = {
  mis_solicitudes: (login, p) => misSolicitudes(login, p),
  estadisticas_mesa: (login, p) => estadisticasMesa(login, p),
  estatus_solicitud: (login, p) => estatusSolicitud(login, p),
  servicios_ti_estado: () => serviciosTiEstado(),
  buscar_guia: (login, p) => buscarGuia(login, p),
  sit_buscar_articulo: (login, p) => sitBuscarArticulo(login, p),
  sit_detalle_articulo: (login, p) => sitDetalleArticulo(login, p),
  sit_alertas_vencimiento: (login) => sitAlertasVencimiento(login),
};

// Filas del resultado para la auditoría
const contarFilas = (r) =>
  Array.isArray(r?.articulos) ? r.articulos.length
  : Array.isArray(r?.documentos) && !r?.codigoArticulo ? r.documentos.length
  : r?.encontrado === true ? 1
  : Array.isArray(r?.solicitudes) ? r.solicitudes.length
    : Array.isArray(r?.servicios) ? r.servicios.length
      : Array.isArray(r?.resultados) ? r.resultados.length
        : r?.encontrada === true ? 1 : 0;

async function _registrar(login, nombre, params, filas, error) {
  try {
    const db = await getPool();
    await db.request()
      .input("login", sql.VarChar(255), login)
      .input("tool", sql.VarChar(60), nombre)
      .input("params", sql.NVarChar(1000), JSON.stringify(params || {}).slice(0, 1000))
      .input("filas", sql.Int, filas)
      .input("error", sql.NVarChar(300), error ? String(error).slice(0, 300) : null)
      .query(`INSERT INTO fabi_tool_log (login, tool_name, params_json, resultado_rows, error) VALUES (@login, @tool, @params, @filas, @error)`);
  } catch (err) {
    // La auditoría no debe tumbar la respuesta, pero sí quedar en la consola
    console.error("[fabi] no se pudo registrar en fabi_tool_log:", err.message);
  }
}

/**
 * Ejecuta una herramienta pedida por el modelo. `login` es SIEMPRE el de la
 * sesión; `permitidas` es el juego del asistente que la pide (Mesa o SIT).
 * Devuelve { ok, contenido } listo para un bloque tool_result.
 */
async function ejecutarHerramienta(nombre, login, params, permitidas = HERRAMIENTAS) {
  // Cada asistente solo puede ejecutar SUS herramientas (Mesa o SIT)
  const ejecutor = permitidas.some((h) => h.name === nombre) ? EJECUTORES[nombre] : null;
  if (!ejecutor) {
    await _registrar(login, String(nombre).slice(0, 60), params, 0, "herramienta desconocida");
    return { ok: false, contenido: JSON.stringify({ error: "Herramienta no disponible." }) };
  }
  try {
    const resultado = await ejecutor(login, params || {});
    await _registrar(login, nombre, params, contarFilas(resultado), null);
    return { ok: true, contenido: JSON.stringify(resultado) };
  } catch (err) {
    console.error(`[fabi] herramienta ${nombre}:`, err.message);
    await _registrar(login, nombre, params, 0, err.message);
    return { ok: false, contenido: JSON.stringify({ error: "No se pudo consultar esa información en este momento." }) };
  }
}

module.exports = { HERRAMIENTAS, HERRAMIENTAS_SIT, ejecutarHerramienta, normalizarFolio };
