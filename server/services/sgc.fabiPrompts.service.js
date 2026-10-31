// server/services/sgc.fabiPrompts.service.js
// Modos de trabajo de Fab-i (SGC). La intención se detecta antes de llamar al
// modelo y solo agrega instrucciones al system prompt: las herramientas
// (incluida la búsqueda documental) siempre están disponibles y el modelo
// decide cuándo usarlas. Así "registra una NC" no se confunde con buscar un
// "registro" documental.

const PROMPT_BASE = `CAPACIDADES ADICIONALES:
- Conoces ISO 9001:2015, ISO 14001:2015, ISO 45001:2018 e ISO 27001:2022, y el contexto de FABPSA (manufactura y distribución de alimentos: plantas, CEDIS, HACCP, inocuidad).
- Tienes acceso a la biblioteca documental del SGI en SharePoint con la herramienta sgc_buscar_documentos. Úsala siempre que el usuario pida, mencione o necesite un documento, procedimiento, instructivo, manual, formato, registro, FODA, diagrama o carpeta. Busca con 1 a 4 palabras clave (por ejemplo "control de documentos", "HACCP", "FODA"), no con la frase completa. Si no hay resultados prueba otra palabra clave antes de rendirte.
- Cuando encuentres documentos, el portal los muestra como tarjetas con botones para verlos y descargarlos: en tu texto solo di cuántos encontraste y cuál parece el indicado, sin repetir la lista completa ni inventar nombres.
- Para preguntas de análisis («¿qué atiendo primero?», «¿qué procesos tienen más problemas?», «¿qué está empeorando?», «¿qué revisar antes de una auditoría?») usa sgc_prioridades: es el mismo análisis del Centro de control. Respeta su orden de prioridad, cita los folios de la evidencia y distingue hechos de hipótesis; si los datos no alcanzan para responder, dilo.
- Si te preguntan quién eres: eres Fab-i, la asistente del equipo SGI de FABPSA. Nunca menciones el modelo, la empresa ni la tecnología detrás de ti.`;

const MODOS = {
  redactar_nc: `MODO: REDACTAR NO CONFORMIDAD.
Cuando el usuario describe un problema o hallazgo, ayúdale a estructurarlo como una No Conformidad:
- DESCRIPCIÓN: qué ocurrió exactamente (objetivo, claro, sin juicios)
- EVIDENCIA SUGERIDA: qué documentos o registros deberían adjuntarse
- ÁREA AFECTADA: área o proceso involucrado
- CLASIFICACIÓN SUGERIDA: tipo (proceso/producto/sistema) y origen probable
- REQUISITO INCUMPLIDO: cláusula ISO o procedimiento interno relacionado (si encuentras el procedimiento con sgc_buscar_documentos, cítalo por su nombre)
Si falta información clave (qué, dónde, cuándo, cuánto), pregunta primero, máximo dos preguntas a la vez.
CAMPO borrador_nc DE TU SALIDA: mientras falte información deja borrador_nc en null. En cuanto tengas qué ocurrió, dónde y alguna evidencia, llénalo: descripcion (corta y objetiva, máx. 300 caracteres), descripcion_detallada (qué, dónde, cuándo, cuánto y evidencia), clasificacion (Mayor: afecta inocuidad o al cliente, o incumple un requisito de forma sistemática; Menor: falla puntual sin impacto en producto liberado; Observación: riesgo potencial sin incumplimiento), afectacion, proceso_sugerido (uno del mapa de procesos o null) y area_sugerida (o null). El portal muestra ese borrador como tarjeta con un botón para abrirlo en el formulario ya prellenado: en respuesta da solo la evidencia sugerida y el requisito incumplido, sin repetir el borrador. Tú no la registras: el usuario revisa y guarda en el formulario.`,

  causa_raiz: `MODO: ANÁLISIS DE CAUSA RAÍZ (5 ¿Por qué?).
Guía al usuario con la metodología de 5 ¿Por qué?: haz UNA pregunta a la vez, espera su respuesta y profundiza a partir de ella. No respondas tú los porqués: los responde el usuario con lo que sabe del proceso.
Cuando llegues a una causa raíz real (algo del sistema que se puede corregir, no "error humano"), preséntala así:
**Problema** → **Por qué 1** → **Por qué 2** → **Por qué 3** → **Por qué 4** → **Por qué 5** → **CAUSA RAÍZ**
y sugiere un Ishikawa (6M: método, mano de obra, máquina, material, medición, medio ambiente) si hay varias causas posibles.`,

  accion_correctiva: `MODO: PLAN DE ACCIÓN CORRECTIVA.
Con base en la causa raíz identificada (si no la conoces, pídela o propón hacer primero los 5 ¿Por qué?), propón un plan estructurado:
- **ACCIÓN INMEDIATA (contención):** qué hacer ya para detener el problema
- **ACCIÓN CORRECTIVA:** qué elimina la causa raíz
- **ACCIÓN PREVENTIVA:** qué evita que vuelva a ocurrir
Para cada acción: descripción, responsable sugerido (puesto, no nombres inventados), plazo razonable y evidencia de cierre esperada. Basa las sugerencias en manufactura de alimentos (BPM, HACCP, inocuidad). El usuario captura la AC en el módulo de Acciones correctivas.
CAMPO borrador_ac DE TU SALIDA: null mientras no conozcas el problema y su causa probable. Cuando las tengas, llénalo: titulo (qué se hará, una línea), descripcion_problema, causa_raiz, actividades (de 2 a 6: descripcion, responsable_sugerido como puesto, plazo_dias desde hoy), proceso_sugerido (uno del mapa o null) y nc_origen_folio (solo si el usuario mencionó un folio NC-AAAA-NNNN; si no, null). El portal muestra el borrador con un botón para abrir el formulario prellenado: en respuesta no repitas la lista, solo explica en 2–3 líneas el enfoque y la evidencia de cierre.
Ejemplo: "en la línea 2 se descalibra la báscula y sale producto bajo peso, ¿qué acción correctiva?" → borrador_ac con calibración, programa de verificación diaria y capacitación.`,

  auditoria: `MODO: PROGRAMAR AUDITORÍA.
El usuario quiere programar una auditoría. CAMPO borrador_auditoria DE TU SALIDA: llénalo en cuanto sepas qué se audita: nombre (título claro), tipo (Interna, Externa o Certificación), norma, alcance (procesos, áreas y cláusulas), proceso_sugerido (uno del mapa o null), fecha_sugerida (AAAA-MM-DD; si dice un mes, usa un día hábil de la primera quincena de ese mes en el futuro respecto a la fecha de hoy del CONTEXTO; si no menciona fecha, null) y auditor_sugerido siempre null (lo elige el usuario). Si no sabe qué auditar, pregunta y deja borrador_auditoria en null. En respuesta da 2–3 líneas de recomendación (preparación, documentos a revisar), sin repetir el borrador.
Ejemplo: "quiero hacer una auditoría de calidad a compras en noviembre" → Interna, ISO 9001:2015, alcance Compras y evaluación de proveedores (8.4), fecha en noviembre.`,

  riesgo: `MODO: REGISTRAR RIESGO U OPORTUNIDAD.
El usuario describe un riesgo (algo negativo que podría pasar) o una oportunidad (algo positivo que se puede aprovechar). CAMPO borrador_riesgo DE TU SALIDA: llénalo SIEMPRE en cuanto entiendas el caso, aunque la descripción sea breve (no lo dejes solo en el texto de respuesta): tipo (Riesgo u Oportunidad), nombre (corto), descripcion (causa → evento → consecuencia), categoria, probabilidad_sugerida e impacto_sugerido de 1 a 5 (probabilidad: 1 rara … 5 casi segura; impacto: 1 insignificante … 5 catastrófico; justifica en una línea en respuesta), proceso_sugerido (uno del mapa o null) y controles_sugeridos (controles existentes que mencionó o, si no mencionó, null), plan_sugerido (1–3 acciones concretas: de tratamiento si es riesgo, para aprovecharla si es oportunidad) e impacto_economico (monto en MXN SOLO si el usuario o los datos lo dan; si no, null — nunca lo inventes). En una oportunidad, probabilidad = qué tan factible es e impacto = qué tan grande es el beneficio. Nivel = probabilidad × impacto: mayor a 12 alto, 5 a 12 medio, menor a 5 bajo. En respuesta da 1–2 líneas de justificación, sin repetir el borrador.
Ejemplo: "el proveedor único de envase podría fallar" → categoría Operativo, probabilidad 3, impacto 4.`,

  buscar_documento: `MODO: BÚSQUEDA DOCUMENTAL. El usuario busca un documento: usa sgc_buscar_documentos antes de responder.`,
};

// Orden: lo más específico primero
const REGLAS = [
  ["causa_raiz", /causa ra[ií]z|5 porqu[eé]s|cinco porqu[eé]s|\bishikawa\b|espina de pescado|origen del problema|\bpor ?qu[eé] (pas[oó]|ocurri[oó]|sucedi[oó]|fall[oó])/i],
  ["accion_correctiva", /acci[oó]n(es)? correctiva|\bAC\b(?!-)|plan de acci[oó]n|qu[eé] hacemos|c[oó]mo (lo )?resolvemos|prop[oó]n(er|me)? acciones|acciones? (preventiva|de contenci[oó]n)/i],
  ["auditoria", /(program|agend|plane|calendariz|organiz)(a|ar|o|emos)?\w* (una |la |otra )?auditor[ií]a|(hacer|realizar|tener) (una )?auditor[ií]a|nueva auditor[ií]a/i],
  ["riesgo", /(redact|registr|identific|nuev|gener|crea|levant|agreg|captur|propon|document|escrib)\w* (un |una |el |la |otr[oa] |este |esta )?(riesgo|oportunidad)|oportunidad(es)? (de|para) (ahorr|crec|negoci|reduc|mejor|aprovech|venta|export|automatiz|certific)|\briesgos? de\b|identific\w* (un |el )?riesgo|registra\w* (un |el )?riesgo|nuevo riesgo|podr[ií]a (fallar|afectar|detener|provocar|causar)|corremos el riesgo/i],
  ["redactar_nc", /redact|\bescrib[ea]|crea(r)? una nc|levanta(r)? una nc|registra(r)? una nc|no conformidad|encontr[eé]|detect[eé]|hallazgo|problema (en|con)/i],
  ["buscar_documento", /\b(documento|archivo|procedimiento|instructivo|manual|formato|carpeta|haccp|foda|diagrama|lista maestra|pol[ií]tica)s?\b|\bbusca|\bencuentra|necesito el|tienes el|d[oó]nde est[aá]/i],
];

/** detectarIntencion(mensaje) → "redactar_nc" | "causa_raiz" | "accion_correctiva" | "buscar_documento" | "conversacion_general" */
function detectarIntencion(mensaje) {
  const t = String(mensaje || "");
  for (const [intencion, re] of REGLAS) if (re.test(t)) return intencion;
  return "conversacion_general";
}

/** Instrucciones extra para el system prompt según la intención del último mensaje. */
function instruccionesModo(intencion) {
  return [PROMPT_BASE, MODOS[intencion]].filter(Boolean).join("\n\n");
}

// Los modos de redacción necesitan más espacio que una respuesta de chat
// (también se "pegan" a la conversación: la respuesta a una pregunta de seguimiento sigue en el modo)
const LARGO = new Set(["redactar_nc", "accion_correctiva", "causa_raiz", "auditoria", "riesgo"]);

// Folio exacto (NC-2026-0012, AC-2026-4, AUD-2026-0003): consulta directa a la base, sin LLM
// (con D antes del consecutivo en la demo: NC-2026-D001)
const RE_FOLIO = /\b(NC|AC|AUD)[\s-]?(\d{4})[\s-]?(D?)0*(\d{1,6})\b/i;
// …salvo que el mensaje pida trabajo de análisis sobre ese folio
const RE_TRABAJO = /causa ra[ií]z|porqu[eé]s|ishikawa|redact|plan de acci[oó]n|prop[oó]n|ay[uú]dame a|analiza/i;
/** Folio a consultar directo, o null. */
function folioDirecto(mensaje) {
  const t = String(mensaje || "");
  const m = t.match(RE_FOLIO);
  if (!m || RE_TRABAJO.test(t)) return null;
  return `${m[1].toUpperCase()}-${m[2]}-${m[3] ? `D${m[4].padStart(3, "0")}` : m[4].padStart(4, "0")}`;
}

// ── Borrador de NC (campo extra de la salida en modo redactar_nc) ──
// Mismos nombres que sgc_cat_clasificaciones / sgc_cat_afectaciones: el portal los mapea a sus ids.
const CLASIFICACIONES = ["Mayor", "Menor", "Observación"];
const AFECTACIONES = ["Seguridad alimentaria", "Calidad del producto", "Legal", "Operativa", "Cliente"];
const _nulo = (t) => ({ anyOf: [{ type: "null" }, t] });

const SALIDA_BORRADOR_NC = {
  borrador_nc: _nulo({
    type: "object",
    additionalProperties: false,
    required: ["descripcion", "descripcion_detallada", "clasificacion", "afectacion", "proceso_sugerido", "area_sugerida"],
    properties: {
      descripcion: { type: "string" },
      descripcion_detallada: { type: "string" },
      clasificacion: { type: "string", enum: CLASIFICACIONES },
      afectacion: { type: "string", enum: AFECTACIONES },
      proceso_sugerido: _nulo({ type: "string" }),
      area_sugerida: _nulo({ type: "string" }),
    },
  }),
};

/** Borrador del modelo → borrador limpio (o null). */
function limpiarBorradorNC(b) {
  if (!b || typeof b !== "object") return null;
  const t = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const descripcion = t(b.descripcion, 300);
  if (!descripcion) return null;
  return {
    descripcion,
    descripcion_detallada: t(b.descripcion_detallada, 4000),
    clasificacion: CLASIFICACIONES.includes(b.clasificacion) ? b.clasificacion : null,
    afectacion: AFECTACIONES.includes(b.afectacion) ? b.afectacion : null,
    proceso_sugerido: t(b.proceso_sugerido, 120),
    area_sugerida: t(b.area_sugerida, 120),
  };
}

const _txt = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const _entero = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);

// ── Borrador de AC (modo accion_correctiva) ──
const SALIDA_BORRADOR_AC = {
  borrador_ac: _nulo({
    type: "object",
    additionalProperties: false,
    required: ["titulo", "descripcion_problema", "causa_raiz", "actividades", "proceso_sugerido", "nc_origen_folio"],
    properties: {
      titulo: { type: "string" },
      descripcion_problema: { type: "string" },
      causa_raiz: { type: "string" },
      actividades: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["descripcion", "responsable_sugerido", "plazo_dias"],
          properties: { descripcion: { type: "string" }, responsable_sugerido: { type: "string" }, plazo_dias: { type: "integer" } },
        },
      },
      proceso_sugerido: _nulo({ type: "string" }),
      nc_origen_folio: _nulo({ type: "string" }),
    },
  }),
};

function limpiarBorradorAC(b) {
  if (!b || typeof b !== "object") return null;
  const titulo = _txt(b.titulo, 200) || _txt(b.descripcion_problema, 200);
  if (!titulo) return null;
  const folio = _txt(b.nc_origen_folio, 30)?.toUpperCase().match(/^NC-\d{4}-\d{1,6}$/)?.[0] || null;
  return {
    titulo,
    descripcion_problema: _txt(b.descripcion_problema, 2000),
    causa_raiz: _txt(b.causa_raiz, 2000),
    actividades: (Array.isArray(b.actividades) ? b.actividades : []).slice(0, 10)
      .map((a) => ({ descripcion: _txt(a?.descripcion, 500), responsable_sugerido: _txt(a?.responsable_sugerido, 120), plazo_dias: _entero(a?.plazo_dias, 1, 365) ?? 30 }))
      .filter((a) => a.descripcion),
    proceso_sugerido: _txt(b.proceso_sugerido, 120),
    nc_origen_folio: folio,
  };
}

// ── Borrador de auditoría (modo auditoria) ──
const AUD_TIPOS = ["Interna", "Externa", "Certificación"];
const NORMAS = ["ISO 9001:2015", "ISO 14001:2015", "ISO 45001:2018", "ISO 27001:2022", "ISO 22000:2018", "FSSC 22000 v6"];
const SALIDA_BORRADOR_AUDITORIA = {
  borrador_auditoria: _nulo({
    type: "object",
    additionalProperties: false,
    required: ["nombre", "tipo", "norma", "alcance", "proceso_sugerido", "fecha_sugerida", "auditor_sugerido"],
    properties: {
      nombre: { type: "string" },
      tipo: { type: "string", enum: AUD_TIPOS },
      norma: { type: "string", enum: NORMAS },
      alcance: { type: "string" },
      proceso_sugerido: _nulo({ type: "string" }),
      fecha_sugerida: _nulo({ type: "string" }),
      auditor_sugerido: { type: "null" },
    },
  }),
};

function limpiarBorradorAuditoria(b) {
  if (!b || typeof b !== "object") return null;
  const nombre = _txt(b.nombre, 200);
  if (!nombre) return null;
  const f = _txt(b.fecha_sugerida, 10);
  const fechaOk = f && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(new Date(`${f}T00:00:00Z`).getTime());
  return {
    nombre,
    tipo: AUD_TIPOS.includes(b.tipo) ? b.tipo : "Interna",
    norma: NORMAS.includes(b.norma) ? b.norma : null,
    alcance: _txt(b.alcance, 500),
    proceso_sugerido: _txt(b.proceso_sugerido, 120),
    fecha_sugerida: fechaOk ? f : null,
    auditor_sugerido: null,
  };
}

// ── Borrador de riesgo (modo riesgo). Categorías = RIESGO_CATEGORIA de sgcComun ──
const CATEGORIAS_RIESGO = ["Operativo", "Calidad", "Inocuidad", "Legal y cumplimiento", "Financiero"];
const ESCALA = { type: "integer", enum: [1, 2, 3, 4, 5] };
const SALIDA_BORRADOR_RIESGO = {
  borrador_riesgo: _nulo({
    type: "object",
    additionalProperties: false,
    required: ["tipo", "nombre", "descripcion", "categoria", "probabilidad_sugerida", "impacto_sugerido", "proceso_sugerido", "controles_sugeridos", "plan_sugerido", "impacto_economico"],
    properties: {
      tipo: { type: "string", enum: ["Riesgo", "Oportunidad"] },
      nombre: { type: "string" },
      descripcion: { type: "string" },
      categoria: { type: "string", enum: CATEGORIAS_RIESGO },
      probabilidad_sugerida: ESCALA,
      impacto_sugerido: ESCALA,
      proceso_sugerido: _nulo({ type: "string" }),
      controles_sugeridos: _nulo({ type: "string" }),
      plan_sugerido: _nulo({ type: "string" }),
      impacto_economico: _nulo({ type: "number" }),
    },
  }),
};

function limpiarBorradorRiesgo(b) {
  if (!b || typeof b !== "object") return null;
  const nombre = _txt(b.nombre, 150);
  if (!nombre) return null;
  const monto = Number(b.impacto_economico);
  return {
    tipo: b.tipo === "Oportunidad" ? "Oportunidad" : "Riesgo",
    nombre,
    descripcion: _txt(b.descripcion, 2000),
    categoria: CATEGORIAS_RIESGO.includes(b.categoria) ? b.categoria : null,
    probabilidad_sugerida: _entero(b.probabilidad_sugerida, 1, 5) ?? 3,
    impacto_sugerido: _entero(b.impacto_sugerido, 1, 5) ?? 3,
    proceso_sugerido: _txt(b.proceso_sugerido, 120),
    controles_sugeridos: _txt(b.controles_sugeridos, 1000),
    plan_sugerido: _txt(b.plan_sugerido, 1500),
    impacto_economico: b.impacto_economico != null && Number.isFinite(monto) && monto >= 0 ? Math.round(monto) : null,
  };
}

// Intención → { campo de salida, esquema, limpieza, tipo de respuesta }
const BORRADORES = {
  redactar_nc: { campo: "borrador_nc", salida: SALIDA_BORRADOR_NC, limpiar: limpiarBorradorNC, tipo: "nc" },
  accion_correctiva: { campo: "borrador_ac", salida: SALIDA_BORRADOR_AC, limpiar: limpiarBorradorAC, tipo: "ac" },
  auditoria: { campo: "borrador_auditoria", salida: SALIDA_BORRADOR_AUDITORIA, limpiar: limpiarBorradorAuditoria, tipo: "auditoria" },
  riesgo: { campo: "borrador_riesgo", salida: SALIDA_BORRADOR_RIESGO, limpiar: limpiarBorradorRiesgo, tipo: "riesgo" },
};

// ── Perfil de empresa en las instrucciones (demo automotriz, idEmpresa 99) ──
// Las instrucciones están escritas para FABPSA (alimentos). En la demo se cambian
// la empresa, la industria, las normas y el vocabulario; nada más.
const DEMO_EMPRESA = {
  nombre: "Transmisiones del Bajío",
  contexto: `CONTEXTO DE LA EMPRESA (demostración): Transmisiones del Bajío, planta Tier 1 en Querétaro que fabrica transmisiones manuales y automáticas para los OEM Stellantis y Ford.
- Norma principal: IATF 16949:2016 (con ISO 9001:2015 como base); también ISO 14001:2015 e ISO 45001:2018. Requisitos específicos del cliente (CSR) de cada OEM.
- Procesos: estampado, soldadura MIG, tratamiento térmico, ensamble de transmisiones, inspección final; apoyo: compras y desarrollo de proveedores, mantenimiento y metrología, competencia y capacitación.
- Vocabulario: PPM, OEE, OTIF, PPAP, APQP, PFMEA, plan de control, características especiales, MSA, SPC, Cpk, contención controlada (CS1/CS2), 8D, scorecard del cliente, Tier 1, OEM.
- Clasifica y razona como en la industria automotriz (no uses HACCP, BPM ni inocuidad alimentaria). Cita cláusulas de IATF 16949 cuando aplique.
- Es una demostración con datos ficticios: no hay biblioteca documental conectada; si piden un documento, explica que en la demo no está disponible.`,
  reemplazos: [
    [/FABPSA/g, "Transmisiones del Bajío"],
    [/manufactura y distribución de alimentos: plantas, CEDIS, HACCP, inocuidad/g, "manufactura automotriz Tier 1: estampado, soldadura, tratamiento térmico, ensamble de transmisiones"],
    [/manufactura y distribución de alimentos; ISO 9001, inocuidad/g, "manufactura automotriz Tier 1; IATF 16949, ISO 9001"],
    [/manufactura de alimentos \(BPM, HACCP, inocuidad\)/g, "manufactura automotriz (APQP, PPAP, PFMEA, plan de control)"],
    [/ISO 9001:2015, ISO 14001:2015, ISO 45001:2018 e ISO 27001:2022/g, "IATF 16949:2016, ISO 9001:2015, ISO 14001:2015 e ISO 45001:2018"],
    [/afecta inocuidad o al cliente/g, "afecta al cliente OEM, a una característica especial"],
    [/Seguridad alimentaria/g, "Cliente"],
  ],
};

/** Ajusta unas instrucciones al perfil de la empresa activa (sin cambios para FABPSA). */
function adaptarEmpresa(texto, idEmpresa) {
  if (idEmpresa !== 99) return texto;
  let t = String(texto);
  for (const [re, por] of DEMO_EMPRESA.reemplazos) t = t.replace(re, por);
  return `${t}\n\n${DEMO_EMPRESA.contexto}`;
}

module.exports = {
  PROMPT_BASE, MODOS, detectarIntencion, instruccionesModo, esRespuestaLarga: (i) => LARGO.has(i),
  SALIDA_BORRADOR_NC, limpiarBorradorNC, BORRADORES, folioDirecto, adaptarEmpresa,
};
