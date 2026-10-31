// server/services/sgc.diagnostico.service.js
// Capa 3 del Centro de control: diagnóstico ejecutivo con IA.
//
// La IA NO calcula cifras ni decide prioridades: recibe el resultado exacto de
// sgc.inteligencia.service (cifras SQL + situaciones detectadas por reglas) y lo
// interpreta. Cada hallazgo debe citar evidencia (folios / claves) que exista en
// esos datos; lo que no se puede verificar se marca. No modifica registros.
//
// Se genera bajo demanda (botón) y se guarda en sgc_ia_diagnosticos con la huella
// de los datos: al entrar se muestra el último y se avisa si los datos cambiaron.
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { conversar } = require("./asistenteMotor.service");
const { HERRAMIENTAS_SGC } = require("./fabiTools.service");
const { analizar } = require("./sgc.inteligencia.service");
const { adaptarEmpresa } = require("./sgc.fabiPrompts.service");

// Diagnóstico ejecutivo: un análisis por solicitud, se usa el modelo más capaz por defecto
const MODELO = process.env.SGC_DIAGNOSTICO_MODEL || "claude-opus-5-5";
const REUSO_MS = 10 * 60000; // mismo alcance y mismos datos en 10 min → se reutiliza
const enCurso = new Set();

const TIPOS = ["hecho", "tendencia", "riesgo", "hipotesis"];
const _nulo = (t) => ({ anyOf: [{ type: "null" }, t] });

const SALIDA = {
  diagnostico: {
    type: "object",
    additionalProperties: false,
    required: ["estado_general", "hallazgos", "recomendaciones", "limitaciones"],
    properties: {
      estado_general: { type: "string" },
      hallazgos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["titulo", "resumen", "tipo", "prioridad_ref", "explicacion", "por_que_importa", "si_no_se_atiende", "recomendacion", "evidencia", "proceso", "informacion_faltante"],
          properties: {
            titulo: { type: "string" },
            resumen: { type: "string" },
            tipo: { type: "string", enum: TIPOS },
            prioridad_ref: _nulo({ type: "string" }),
            explicacion: { type: "string" },
            por_que_importa: { type: "string" },
            si_no_se_atiende: { type: "string" },
            recomendacion: { type: "string" },
            evidencia: { type: "array", items: { type: "string" } },
            proceso: _nulo({ type: "string" }),
            informacion_faltante: _nulo({ type: "string" }),
          },
        },
      },
      recomendaciones: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["accion", "motivo", "plazo", "responsable_sugerido", "prioridad_ref", "referencia"],
          properties: {
            accion: { type: "string" },
            motivo: { type: "string" },
            plazo: { type: "string" },
            responsable_sugerido: _nulo({ type: "string" }),
            prioridad_ref: _nulo({ type: "string" }),
            referencia: _nulo({ type: "string" }),
          },
        },
      },
      limitaciones: { type: "array", items: { type: "string" } },
    },
  },
};

const INSTRUCCIONES = `Eres el analista de calidad del Centro de control del SGC de FABPSA (manufactura y distribución de alimentos; ISO 9001, inocuidad).
Recibes en DATOS el análisis exacto del sistema: cifras calculadas con SQL y situaciones detectadas por reglas con su nivel (critica, alta, media). Tu trabajo es interpretarlo para quien decide: qué está pasando, por qué importa, qué podría pasar y qué hacer primero.

REGLAS ESTRICTAS:
- Usa SOLO DATOS. No inventes folios, cifras, personas, fechas ni porcentajes. No recalcules: cita las cifras tal cual.
- No cambies el orden de importancia de las prioridades; puedes relacionarlas entre sí (por ejemplo, mismo proceso o mismo responsable).
- Cada hallazgo lleva en "evidencia" los folios o claves EXACTOS que aparecen en DATOS (NC-AAAA-NNNN, AC-AAAA-NNNN, AUD-AAAA-NNNN, IND-..., o "Nivel N" de un riesgo). Sin evidencia no hay hallazgo de tipo "hecho".
- "tipo": hecho = comprobado en los registros; tendencia = comparación entre periodos; riesgo = algo que podría ocurrir; hipotesis = posible causa que requiere validación. Nunca presentes una hipótesis como causa raíz confirmada.
- prioridad_ref: el "id" de la prioridad de DATOS a la que se refiere el hallazgo o la recomendación, o null.
- La muestra es pequeña o reciente si "muestra" lo indica: dilo en limitaciones y no afirmes tendencias con pocos datos.
- Recomendaciones concretas y verificables (qué, quién por puesto, en qué plazo). No propongas que el sistema cambie registros por su cuenta.
- De 3 a 6 hallazgos, de 3 a 5 recomendaciones. Español claro, sin jerga innecesaria, sin markdown.
- estado_general: síntesis ejecutiva de máximo 2 frases y 45 palabras que responda "¿qué necesito saber hoy sobre la calidad en FABPSA?": la situación más importante, por qué requiere atención y qué revisar primero.
- En cada hallazgo, "resumen": una sola línea de máximo 15 palabras que se entienda sin leer el resto; "titulo": máximo 8 palabras.
- En cada recomendación: "accion" en imperativo y máximo 14 palabras; "motivo": máximo 12 palabras; "referencia": el folio o clave EXACTO de DATOS más relacionado (o null); ordénalas de la más a la menos urgente.
- En "respuesta" escribe una sola frase de titular. Destino siempre vacío.`;

/** DATOS compactos para el modelo (solo lo necesario). */
function _paraModelo(datos) {
  return {
    alcance: datos.alcance,
    muestra: datos.muestra,
    indicadores_estrategicos: datos.kpis.map((k) => ({ id: k.id, nombre: k.etiqueta, valor: k.valor, total: k.total ?? null, unidad: k.unidad ?? null, meta: k.meta ?? null, comparacion: k.comparacion ? `${k.comparacion.valor} ${k.comparacion.texto}` : null, detalle: k.sub ?? null })),
    prioridades: datos.prioridades.map((p) => ({ id: p.id, nivel: p.nivel, tipo: p.categoria, titulo: p.titulo, detalle: p.detalle, proceso: p.proceso, falta_confirmar: p.falta, evidencia: p.evidencia.map((e) => `${e.folio}: ${e.texto}`) })),
    procesos: datos.procesos,
    objetivos_de_calidad: datos.indicadores.map((i) => ({ clave: i.clave, nombre: i.nombre, ultimo: i.ultimo, anterior: i.anterior, meta: i.meta, sentido: i.sentido === 2 ? "menor es mejor" : "mayor es mejor", semaforo: i.semaforo, tendencia: i.tendencia, medicion_atrasada: i.atrasado })),
    tendencia_mensual: datos.tendencia.filter((t) => t.ncRegistradas || t.ncCerradas || t.acCerradas).map((t) => ({ mes: String(t.mes.toISOString?.() || t.mes).slice(0, 7), nc_registradas: t.ncRegistradas, nc_cerradas: t.ncCerradas, ac_cerradas: t.acCerradas })),
    datos_que_el_sistema_no_registra: datos.datosFaltantes,
  };
}

/** Valida la salida: solo evidencia que exista en DATOS (con su ruta) y referencias reales. */
function _validar(diag, datos) {
  const rutas = new Map();
  for (const p of datos.prioridades) for (const e of p.evidencia) rutas.set(String(e.folio).toUpperCase(), e.ruta);
  for (const i of datos.indicadores) rutas.set(i.clave.toUpperCase(), i.ruta);
  const ids = new Set(datos.prioridades.map((p) => p.id));
  const t = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const ref = (v) => (typeof v === "string" && ids.has(v) ? v : null);
  const hallazgos = (Array.isArray(diag?.hallazgos) ? diag.hallazgos : []).slice(0, 8).map((h) => {
    const evidencia = [...new Set((h.evidencia || []).map((x) => String(x).trim().toUpperCase()))]
      .filter((x) => rutas.has(x))
      .map((x) => ({ ref: x, ruta: rutas.get(x) }));
    let tipo = TIPOS.includes(h.tipo) ? h.tipo : "hipotesis";
    // Un "hecho" sin evidencia verificable se presenta como hipótesis
    const sinEvidencia = !evidencia.length;
    if (sinEvidencia && tipo === "hecho") tipo = "hipotesis";
    return {
      titulo: t(h.titulo, 160) || "Hallazgo",
      resumen: t(h.resumen, 200),
      tipo,
      prioridadRef: ref(h.prioridad_ref),
      explicacion: t(h.explicacion, 900),
      porQueImporta: t(h.por_que_importa, 600),
      siNoSeAtiende: t(h.si_no_se_atiende, 600),
      recomendacion: t(h.recomendacion, 600),
      evidencia,
      sinEvidencia,
      proceso: t(h.proceso, 120),
      informacionFaltante: t(h.informacion_faltante, 400),
    };
  });
  return {
    estadoGeneral: t(diag?.estado_general, 900),
    hallazgos,
    recomendaciones: (Array.isArray(diag?.recomendaciones) ? diag.recomendaciones : []).slice(0, 6).map((r) => {
      // Referencia solo si es un folio/clave real de DATOS (con su ruta para el panel lateral)
      const clave = typeof r.referencia === "string" ? r.referencia.trim().toUpperCase() : null;
      return {
        accion: t(r.accion, 400), motivo: t(r.motivo, 300), plazo: t(r.plazo, 80), responsable: t(r.responsable_sugerido, 120),
        prioridadRef: ref(r.prioridad_ref), referencia: clave && rutas.has(clave) ? { ref: clave, ruta: rutas.get(clave) } : null,
      };
    }).filter((r) => r.accion),
    limitaciones: (Array.isArray(diag?.limitaciones) ? diag.limitaciones : []).map((x) => t(x, 300)).filter(Boolean).slice(0, 5),
  };
}

const _alcance = (req) => (req.sgcRol === 3 ? String(req.login).toUpperCase() : "empresa");

async function _ultimo(db, req) {
  const r = await db.request()
    .input("idEmpresa", sql.Int, req.idEmpresa)
    .input("alcance", sql.VarChar(255), _alcance(req))
    .query(`SELECT TOP 1 d.idDiagnostico, d.hashDatos, d.contenido, d.modelo, d.fechaGeneracion, d.login, LTRIM(RTRIM(u.name)) AS nombre
            FROM sgc_ia_diagnosticos d LEFT JOIN sec_users u ON u.login = d.login
            WHERE d.idEmpresa = @idEmpresa AND d.alcance = @alcance ORDER BY d.fechaGeneracion DESC, d.idDiagnostico DESC`);
  const x = r.recordset[0];
  if (!x) return null;
  let contenido = null;
  try {
    contenido = JSON.parse(x.contenido);
  } catch {
    return null;
  }
  return { idDiagnostico: x.idDiagnostico, hash: x.hashDatos, fecha: x.fechaGeneracion, generadoPor: x.nombre || x.login, modelo: x.modelo, ...contenido };
}

/** GET /api/sgc/inteligencia/diagnostico → último diagnóstico y si corresponde a los datos actuales. */
async function getDiagnostico(req, res) {
  try {
    const db = await getPool();
    const [ultimo, datos] = await Promise.all([_ultimo(db, req), analizar(req)]);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data: ultimo ? { ...ultimo, vigente: ultimo.hash === datos.hash } : null });
  } catch (err) {
    console.error("[sgc.diagnostico] getDiagnostico:", err);
    C._err(res, 500, "Error interno");
  }
}

/** POST /api/sgc/inteligencia/diagnostico → genera (o reutiliza si nada cambió en 10 min). */
async function generarDiagnostico(req, res) {
  const alcance = _alcance(req);
  if (enCurso.has(alcance)) return C._err(res, 429, "Ya se está generando un diagnóstico; espera unos segundos.");
  enCurso.add(alcance);
  try {
    const db = await getPool();
    const datos = await analizar(req);
    const previo = await _ultimo(db, req);
    if (previo && previo.hash === datos.hash && Date.now() - new Date(previo.fecha).getTime() < REUSO_MS) {
      return res.json({ ok: true, data: { ...previo, vigente: true, reutilizado: true } });
    }

    const result = await conversar({
      // En la demo automotriz cambian empresa, industria y normas
      system: adaptarEmpresa(INSTRUCCIONES, req.idEmpresa),
      // Solo consulta de folios (lectura) por si necesita confirmar un registro
      herramientas: HERRAMIENTAS_SGC.filter((h) => h.name === "sgc_consultar_folio"),
      messages: [{ role: "user", content: `DATOS (generados ${new Date().toISOString()}):\n${JSON.stringify(_paraModelo(datos))}` }],
      login: req.login,
      destinos: new Map(),
      model: MODELO,
      effort: "medium",
      maxTokens: 8000,
      maxRespuesta: 600,
      salidaExtra: SALIDA,
      timeoutMs: 150000,
    });
    const contenido = { titular: String(result.respuesta || "").slice(0, 300), ..._validar(result.diagnostico, datos) };

    const ins = await db.request()
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .input("alcance", sql.VarChar(255), alcance)
      .input("hash", sql.Char(40), datos.hash)
      .input("contenido", sql.NVarChar(sql.MAX), JSON.stringify(contenido))
      .input("modelo", sql.VarChar(60), MODELO)
      .input("login", sql.VarChar(255), req.login)
      .query(`INSERT INTO sgc_ia_diagnosticos (idEmpresa, alcance, hashDatos, contenido, modelo, login)
              OUTPUT INSERTED.idDiagnostico, INSERTED.fechaGeneracion
              VALUES (@idEmpresa, @alcance, @hash, @contenido, @modelo, @login)`);
    const x = ins.recordset[0];
    res.json({ ok: true, data: { idDiagnostico: x.idDiagnostico, hash: datos.hash, fecha: x.fechaGeneracion, generadoPor: req.sgcUser?.nombre || req.login, modelo: MODELO, vigente: true, ...contenido } });
  } catch (err) {
    console.error("[sgc.diagnostico] generar:", err.detalle || err.message);
    C._err(res, 503, "No se pudo generar el diagnóstico en este momento. Las cifras y prioridades del tablero siguen disponibles.");
  } finally {
    enCurso.delete(alcance);
  }
}

module.exports = { getDiagnostico, generarDiagnostico };
