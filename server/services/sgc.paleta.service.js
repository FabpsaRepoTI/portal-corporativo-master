// server/services/sgc.paleta.service.js
// Paleta de comandos (Ctrl+K) del SGC.
//   GET    /api/sgc/paleta/buscar?q=   documentos SharePoint + registros NC/AC + vistas guardadas
//   POST   /api/sgc/paleta/vistas      guarda una vista { nombre, ruta, global? }
//   DELETE /api/sgc/paleta/vistas/:id  borra una vista propia (o global, el Coordinador)
// Documentos: misma búsqueda de la biblioteca SGI que usa Fab-i. Nunca se envían
// URLs de SharePoint: url_preview es la ruta del proxy del backend.
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { searchDocuments } = require("./sgc.sharepointSearch.service");

const MAX_VISTAS = 50;
// Rutas de listas que se pueden guardar como vista
const MODULO_RUTA = [
  [/^\/sgc\/no-conformidades(\?|$)/, "nc"],
  [/^\/sgc\/acciones-correctivas(\?|$)/, "ac"],
  [/^\/sgc\/auditorias(\?|$)/, "auditorias"],
  [/^\/sgc\/indicadores(\?|$)/, "indicadores"],
  [/^\/sgc\/riesgos(\?|$)/, "riesgos"],
];

async function _documentos(texto, idEmpresa) {
  const encontrados = await searchDocuments(texto);
  if (!encontrados.length) return [];
  const db = await getPool();
  const req = db.request().input("idEmpresa", sql.Int, idEmpresa);
  const r = await req.query(`
    SELECT spItemId, idEstatus FROM sgc_documentos
    WHERE idEmpresa = @idEmpresa AND ${C._in(req, "spItemId", "sp", encontrados.map((d) => d.driveItemId), sql.VarChar(100))}`);
  const estatus = new Map(r.recordset.map((x) => [x.spItemId, x.idEstatus]));
  return encontrados.map((d) => ({
    id: d.driveItemId,
    nombre: d.nombre,
    extension: d.extension,
    area: d.carpeta || null,
    // Solo los registrados en el SGI tienen estatus; los demás: null (sin control)
    vigente: estatus.has(d.driveItemId) ? estatus.get(d.driveItemId) === 3 : null,
    url_preview: `/api/sgc/documentos/preview/${encodeURIComponent(d.driveItemId)}`,
  }));
}

async function _registrosYVistas(req, texto) {
  const db = await getPool();
  const r = await db.request()
    .input("idEmpresa", sql.Int, req.idEmpresa)
    .input("login", sql.VarChar(255), req.login)
    .input("soloMias", sql.Bit, req.sgcRol === 3 ? 1 : 0)
    .input("q", sql.NVarChar(130), C._like(texto))
    .query(`
      SELECT TOP 6 'nc' AS tipo, nc.idNC AS id, nc.folioNC AS folio, LEFT(nc.descripcion, 140) AS descripcion, nc.idEstatus
      FROM sgc_no_conformidades nc
      WHERE nc.idEmpresa = @idEmpresa AND (@soloMias = 0 OR nc.loginResponsable = @login)
        AND (nc.folioNC LIKE @q OR nc.descripcion LIKE @q OR nc.descripcionDetallada LIKE @q)
      ORDER BY CASE WHEN nc.idEstatus IN (1, 2, 3, 4) THEN 0 ELSE 1 END, nc.fechaCreacion DESC;

      SELECT TOP 6 'ac' AS tipo, ac.idAC AS id, ac.folioAC AS folio,
             LEFT(COALESCE(ac.titulo, ac.d2_descripcion, ac.descripcion, ''), 140) AS descripcion, ac.idEstatus
      FROM sgc_acciones_correctivas ac LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      WHERE ac.idEmpresa = @idEmpresa AND (@soloMias = 0 OR ac.loginResponsable = @login OR nc.loginResponsable = @login)
        AND (ac.folioAC LIKE @q OR ac.titulo LIKE @q OR ac.descripcion LIKE @q OR ac.d2_descripcion LIKE @q OR ac.causaRaiz LIKE @q)
      ORDER BY CASE WHEN ac.idEstatus IN (1, 2, 3) THEN 0 ELSE 1 END, ac.fechaCreacion DESC;

      SELECT TOP 8 v.id, v.nombre, v.modulo, v.filtros, CAST(v.es_global AS BIT) AS es_global,
             CASE WHEN v.login = @login THEN 1 ELSE 0 END AS propia
      FROM sgc_vistas_guardadas v
      WHERE v.idEmpresa = @idEmpresa AND (v.login = @login OR v.es_global = 1) AND v.nombre LIKE @q
      ORDER BY v.es_global, v.nombre;
    `);
  const [nc, ac, vistas] = r.recordsets;
  return {
    registros: [...nc, ...ac].map((x) => ({
      tipo: x.tipo,
      id: x.id,
      folio: x.folio,
      descripcion: x.descripcion,
      estado: (x.tipo === "nc" ? C.NC_ESTATUS : C.AC_ESTATUS)[x.idEstatus],
    })),
    vistas: vistas.map(_vista),
  };
}

function _vista(v) {
  let filtros = {};
  try {
    filtros = JSON.parse(v.filtros) || {};
  } catch {
    /* JSON inválido: vista sin filtros */
  }
  return { id: v.id, nombre: v.nombre, modulo: v.modulo, filtros, es_global: !!v.es_global, propia: !!v.propia };
}

/** GET /api/sgc/paleta/buscar?q= — si SharePoint falla, el resto responde igual. */
async function buscar(req, res) {
  const texto = C._texto(req.query.q, 100);
  if (!texto || texto.length < 2) return res.json({ ok: true, data: { documentos: [], registros: [], vistas: [] } });
  try {
    const [docs, resto] = await Promise.allSettled([_documentos(texto, req.idEmpresa), _registrosYVistas(req, texto)]);
    if (resto.status === "rejected") throw resto.reason;
    if (docs.status === "rejected") console.error("[sgc.paleta] documentos:", docs.reason?.response?.status, docs.reason?.message);
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      data: {
        documentos: docs.status === "fulfilled" ? docs.value : [],
        documentosError: docs.status === "rejected" ? "No se pudo consultar la biblioteca documental." : undefined,
        ...resto.value,
      },
    });
  } catch (err) {
    console.error("[sgc.paleta] buscar:", err);
    C._err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/paleta/vistas — mis vistas y las globales (para la paleta sin texto). */
async function listarVistas(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .input("login", sql.VarChar(255), req.login)
      .query(`
        SELECT TOP ${MAX_VISTAS} v.id, v.nombre, v.modulo, v.filtros, CAST(v.es_global AS BIT) AS es_global,
               CASE WHEN v.login = @login THEN 1 ELSE 0 END AS propia
        FROM sgc_vistas_guardadas v
        WHERE v.idEmpresa = @idEmpresa AND (v.login = @login OR v.es_global = 1)
        ORDER BY v.es_global, v.nombre`);
    res.json({ ok: true, data: r.recordset.map(_vista) });
  } catch (err) {
    console.error("[sgc.paleta] listarVistas:", err);
    C._err(res, 500, "Error interno");
  }
}

/** POST /api/sgc/paleta/vistas  body { nombre, ruta, global? } */
async function guardarVista(req, res) {
  const nombre = C._texto(req.body?.nombre, 100);
  const ruta = C._texto(req.body?.ruta, 500);
  if (!nombre) return C._err(res, 400, "Ponle un nombre a la vista.");
  const modulo = ruta && MODULO_RUTA.find(([re]) => re.test(ruta))?.[1];
  if (!modulo) return C._err(res, 400, "Solo se pueden guardar vistas de las listas del SGC.");
  const global = req.body?.global === true && req.sgcRol === 1;
  try {
    const db = await getPool();
    const cuenta = await db.request().input("login", sql.VarChar(255), req.login).input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT COUNT(*) AS n FROM sgc_vistas_guardadas WHERE idEmpresa = @idEmpresa AND login = @login`);
    if (cuenta.recordset[0].n >= MAX_VISTAS) return C._err(res, 400, `Tienes ${MAX_VISTAS} vistas guardadas; borra alguna antes de guardar otra.`);
    const r = await db.request()
      .input("nombre", sql.NVarChar(100), nombre)
      .input("modulo", sql.NVarChar(50), modulo)
      .input("filtros", sql.NVarChar(sql.MAX), JSON.stringify({ ruta }))
      .input("login", sql.VarChar(255), req.login)
      .input("global", sql.Bit, global ? 1 : 0)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`INSERT INTO sgc_vistas_guardadas (nombre, modulo, filtros, login, es_global, idEmpresa)
              OUTPUT INSERTED.id VALUES (@nombre, @modulo, @filtros, @login, @global, @idEmpresa)`);
    res.status(201).json({ ok: true, data: { id: r.recordset[0].id, nombre, modulo, filtros: { ruta }, es_global: global, propia: true } });
  } catch (err) {
    console.error("[sgc.paleta] guardarVista:", err);
    C._err(res, 500, "Error interno");
  }
}

/** DELETE /api/sgc/paleta/vistas/:id */
async function borrarVista(req, res) {
  const id = C._int(req.params.id);
  if (!id) return C._err(res, 400, "Vista inválida");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("login", sql.VarChar(255), req.login)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .input("coordinador", sql.Bit, req.sgcRol === 1 ? 1 : 0)
      .query(`DELETE FROM sgc_vistas_guardadas
              WHERE id = @id AND idEmpresa = @idEmpresa AND (login = @login OR (es_global = 1 AND @coordinador = 1))`);
    if (!r.rowsAffected[0]) return C._err(res, 404, "Vista no encontrada");
    res.json({ ok: true, data: { id } });
  } catch (err) {
    console.error("[sgc.paleta] borrarVista:", err);
    C._err(res, 500, "Error interno");
  }
}

module.exports = { buscar, listarVistas, guardarVista, borrarVista };
