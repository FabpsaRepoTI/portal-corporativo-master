// server/services/sharepoint.service.js
// Documentos técnicos de proveedores en SharePoint (módulo SIT).
//
// Estructura real del sitio "Información técnica de proveedores",
// biblioteca "Documentos":
//   Información Técnica Actualizada Compras/
//     {código} {descripción}, {proveedor}/
//       {código}, {descripción}, {tipo de documento}.pdf
//   Carpeta Proveedores B/                  ← proveedores alternos "(b)"
//     {código} (b) {descripción}, {proveedor}/ …
//
// SHAREPOINT_MOCK = true  → datos de prueba (no toca la red)
// SHAREPOINT_MOCK = false → Graph API real
const SHAREPOINT_MOCK = false;

const { getAccessToken } = require("./dev/sharepoint.service");
const { getPool, sql } = require("../db");

const GRAPH = "https://graph.microsoft.com/v1.0";
const enc = encodeURIComponent;
const SITE_PATH = () => process.env.SIT_DOCS_SITE_PATH || "fabp.sharepoint.com:/sites/Informacintcnicadeproveedores";
const BIBLIOTECA = () => process.env.SIT_DOCS_DRIVE_NAME || "Documentos";
const CARPETAS = [
  { ruta: "Información Técnica Actualizada Compras", alterno: false },
  { ruta: "Carpeta Proveedores B", alterno: true },
];
const CACHE_MS = 10 * 60 * 1000;

// ────────────────────────────────────────────────────────────
// MOCK
// ────────────────────────────────────────────────────────────

function _mockDocumentos(codigoArticulo) {
  return [
    {
      nombreArchivo: `${codigoArticulo}, Descripción Ejemplo, Carta Garantía.pdf`,
      proveedor: "Ingredion México, S.A. de C.V.",
      tipoDocumento: "Carta Garantía",
      sharepointId: `mock-${codigoArticulo}-001`,
      webUrl: null,
      fechaModificacion: "2024-03-15T00:00:00Z",
    },
    {
      nombreArchivo: `${codigoArticulo}, Descripción Ejemplo, Ficha Técnica.pdf`,
      proveedor: "Ingredion México, S.A. de C.V.",
      tipoDocumento: "Ficha Técnica",
      sharepointId: `mock-${codigoArticulo}-002`,
      webUrl: null,
      fechaModificacion: "2023-11-01T00:00:00Z",
    },
    {
      nombreArchivo: `${codigoArticulo}, Descripción Ejemplo, Certificado Kosher.pdf`,
      proveedor: "Proveedor Alterno S.A. (b)",
      tipoDocumento: "Certificado Kosher",
      sharepointId: `mock-${codigoArticulo}-003`,
      webUrl: null,
      fechaModificacion: "2022-06-20T00:00:00Z",
    },
  ];
}

/** PDF mínimo válido (una página con texto), generado en memoria. */
function pdfDePrueba(titulo) {
  // Solo ASCII imprimible dentro del string del PDF
  const texto = String(titulo || "Documento de prueba")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\\()]/g, (c) => "\\" + c)
    .slice(0, 90);

  const contenido =
    "BT /F1 20 Tf 72 720 Td (Documento de prueba - SIT) Tj ET\n" +
    `BT /F1 11 Tf 72 690 Td (${texto}) Tj ET\n` +
    "BT /F1 11 Tf 72 670 Td (Generado por el mock de SharePoint. No es un documento real.) Tj ET";

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objetos.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (pdf += String(o).padStart(10, "0") + " 00000 n \n"));
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// ────────────────────────────────────────────────────────────
// GRAPH API (real)
// ────────────────────────────────────────────────────────────

async function _graph(path) {
  const token = await getAccessToken();
  const res = await fetch(path.startsWith("http") ? path : GRAPH + path, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw Object.assign(new Error(`Graph HTTP ${res.status}`), { status: res.status });
  return res.json();
}

async function _listarTodo(path) {
  const items = [];
  let url = path;
  while (url) {
    const data = await _graph(url);
    items.push(...(data.value || []));
    const next = data["@odata.nextLink"];
    if (next && !next.startsWith(GRAPH + "/")) throw new Error("Paginación inválida");
    url = next || null;
  }
  return items;
}

let _driveCache = null;
async function _driveId() {
  if (_driveCache) return _driveCache;
  const site = await _graph(`/sites/${SITE_PATH()}?$select=id`);
  const drives = await _graph(`/sites/${enc(site.id)}/drives?$select=id,name`);
  const drive = drives.value.find((d) => d.name === BIBLIOTECA());
  if (!drive) throw new Error(`No se encontró la biblioteca "${BIBLIOTECA()}"`);
  _driveCache = drive.id;
  return _driveCache;
}

// Carpetas de artículo por carpeta raíz (se cachean: son cientos)
const _carpetasCache = new Map();
async function _carpetasArticulo(drive, carpeta) {
  const hit = _carpetasCache.get(carpeta.ruta);
  if (hit && hit.expira > Date.now()) return hit.items;
  const ruta = carpeta.ruta.split("/").map(enc).join("/");
  const items = (await _listarTodo(`/drives/${enc(drive)}/root:/${ruta}:/children?$select=id,name,folder&$top=999`))
    .filter((i) => i.folder);
  _carpetasCache.set(carpeta.ruta, { items, expira: Date.now() + CACHE_MS });
  return items;
}

/** "1-001 Aceite de Maíz, Ingredion  México, S.A. de C.V" → proveedor tras la primera coma */
function _proveedorDeCarpeta(nombre, alterno) {
  const i = nombre.indexOf(",");
  const proveedor = (i >= 0 ? nombre.slice(i + 1) : nombre).replace(/\s+/g, " ").trim();
  return alterno && !/\(b\)/i.test(proveedor) ? `${proveedor} (b)` : proveedor;
}

/** "1-001, Aceite de Maíz, Carta Garantía.pdf" → "Carta Garantía" (todo lo que sigue a la descripción) */
function _tipoDeArchivo(nombre) {
  const sinExt = nombre.replace(/\.[^.]+$/, "");
  const partes = sinExt.split(",").map((p) => p.trim()).filter(Boolean);
  return partes.length >= 3 ? partes.slice(2).join(", ") : partes[partes.length - 1] || sinExt;
}

function _esCarpetaDe(nombre, codigo) {
  const n = nombre.trim().toUpperCase();
  const c = String(codigo).trim().toUpperCase();
  // "1-040 Azúcar…", "1-040 (b) Azúcar…", "1-088(b) Fabpsaproy…"
  return n === c || n.startsWith(c + " ") || n.startsWith(c + "(");
}

async function _documentosReales(codigoArticulo) {
  const drive = await _driveId();
  const documentos = [];
  for (const carpeta of CARPETAS) {
    let carpetas;
    try {
      carpetas = await _carpetasArticulo(drive, carpeta);
    } catch (err) {
      if (err.status === 404) continue; // carpeta raíz inexistente
      throw err;
    }
    for (const c of carpetas.filter((c) => _esCarpetaDe(c.name, codigoArticulo))) {
      const archivos = await _listarTodo(
        `/drives/${enc(drive)}/items/${enc(c.id)}/children?$select=id,name,file,webUrl,lastModifiedDateTime&$top=999`,
      );
      for (const a of archivos.filter((a) => a.file)) {
        documentos.push({
          nombreArchivo: a.name,
          proveedor: _proveedorDeCarpeta(c.name, carpeta.alterno),
          tipoDocumento: _tipoDeArchivo(a.name),
          sharepointId: a.id,
          webUrl: a.webUrl || null,
          fechaModificacion: a.lastModifiedDateTime || null,
        });
      }
    }
  }
  return documentos;
}

/**
 * Metadatos de un archivo, solo si está dentro de las carpetas de
 * documentación técnica (CARPETAS). Cualquier otro id → error 404.
 */
async function _itemPermitido(sharepointId) {
  const drive = await _driveId();
  let item;
  try {
    item = await _graph(`/drives/${enc(drive)}/items/${enc(sharepointId)}?$select=id,name,file,size,parentReference`);
  } catch (err) {
    if (err.status === 404 || err.status === 400) throw Object.assign(new Error("No encontrado"), { status: 404 });
    throw err;
  }
  // parentReference.path: "/drives/{id}/root:/Información Técnica Actualizada Compras/1-001 …"
  const ruta = decodeURIComponent(String(item.parentReference?.path || "").split("root:")[1] || "");
  const permitido = CARPETAS.some((c) => ruta === "/" + c.ruta || ruta.startsWith("/" + c.ruta + "/"));
  if (!item.file || !permitido) throw Object.assign(new Error("Fuera de las carpetas permitidas"), { status: 404 });
  return { drive, item };
}

/**
 * Abre un archivo de la biblioteca de proveedores para mandarlo por
 * streaming. Solo sirve archivos que estén dentro de las carpetas de
 * documentación técnica (CARPETAS); cualquier otro id responde 404.
 * Devuelve { body (ReadableStream), nombre, tipo, tamano }.
 */
async function abrirDocumento(sharepointId) {
  const { drive, item } = await _itemPermitido(sharepointId);

  const token = await getAccessToken();
  const res = await fetch(`${GRAPH}/drives/${enc(drive)}/items/${enc(sharepointId)}/content`, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok || !res.body) throw Object.assign(new Error(`Graph HTTP ${res.status}`), { status: res.status === 404 ? 404 : 502 });

  return {
    body: res.body,
    nombre: item.name,
    tipo: item.file.mimeType || "application/pdf",
    tamano: res.headers.get("content-length") || item.size || null,
  };
}

/**
 * Descarga completa (en memoria) de un archivo de las carpetas técnicas.
 * Mismo control de acceso que abrirDocumento. Devuelve { buffer, nombre, tipo }.
 */
async function descargarDocumento(sharepointId) {
  if (esMock(sharepointId)) {
    return { buffer: pdfDePrueba(sharepointId), nombre: `${sharepointId}.pdf`, tipo: "application/pdf" };
  }
  const archivo = await abrirDocumento(sharepointId);
  const buffer = Buffer.from(await new Response(archivo.body).arrayBuffer());
  return { buffer, nombre: archivo.nombre, tipo: archivo.tipo };
}

// ────────────────────────────────────────────────────────────
// VIGENCIA: tipo de documento (alias) → fecha de vencimiento → semáforo
// ────────────────────────────────────────────────────────────

const DIAS_POR_VENCER = 30;
const SEMAFORO = { VERDE: "VERDE", AMARILLO: "AMARILLO", ROJO: "ROJO", SIN_FECHA: "SIN_FECHA" };

/** Minúsculas, sin acentos y con espacios colapsados (para comparar alias). */
function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

let _clasificador = null; // { expira, alias: [{ norm, tipo }] } — alias más largos primero
async function _cargarClasificador() {
  if (_clasificador && _clasificador.expira > Date.now()) return _clasificador;
  const db = await getPool();
  const r = await db.request().query(`
    SELECT a.alias, t.idTipoDoc, t.nombre, t.reglasVigencia, t.diasVigencia
    FROM sit_tipo_documento_alias a
    JOIN sit_tipos_documento t ON t.idTipoDoc = a.idTipoDoc AND t.activo = 1
  `);
  const alias = r.recordset
    .map((x) => ({
      norm: normalizar(x.alias),
      tipo: { idTipoDoc: x.idTipoDoc, nombre: x.nombre, reglasVigencia: x.reglasVigencia, diasVigencia: x.diasVigencia },
    }))
    .filter((x) => x.norm)
    .sort((a, b) => b.norm.length - a.norm.length);
  _clasificador = { alias, expira: Date.now() + 5 * 60 * 1000 };
  return _clasificador;
}

/**
 * Tipo de documento para el nombre parseado del archivo: coincidencia exacta
 * o por prefijo a límite de palabra ("Carta Garantía, Referencia Normativa"
 * → "Carta Garantía"; "FT" no casa con "FTX"). Gana el alias más largo.
 */
function _clasificar(clasificador, tipoParseado) {
  const n = normalizar(tipoParseado);
  if (!n) return null;
  for (const { norm, tipo } of clasificador.alias) {
    if (n === norm || (n.startsWith(norm) && !/[a-z0-9]/.test(n.charAt(norm.length)))) return tipo;
  }
  return null;
}

/**
 * Lo que el nombre del archivo dice que trae además de su tipo: en
 * "FT, Tabla Nutrimental, Ref Normativa, GMO's, GRAS" el tipo es "FT" y cada
 * elemento siguiente que corresponde a un tipo del catálogo (por sus alias)
 * es un contenido: [{ idTipoDoc, nombre, pagina: null, origen: 'NOMBRE', texto }].
 * Los elementos sin tipo ("Ref Normativa") se ignoran aquí; el buscador de la
 * ficha los encuentra igual por texto.
 */
function _contenidosDelNombre(clasificador, tipoParseado, idTipoPropio) {
  const partes = String(tipoParseado || "").split(",").map((s) => s.trim()).filter(Boolean);
  const vistos = new Set(idTipoPropio != null ? [idTipoPropio] : []);
  const out = [];
  for (const parte of partes.slice(1)) {
    const t = _clasificar(clasificador, parte);
    if (!t || vistos.has(t.idTipoDoc)) continue;
    vistos.add(t.idTipoDoc);
    out.push({ idTipoDoc: t.idTipoDoc, nombre: t.nombre, pagina: null, origen: "NOMBRE", texto: parte });
  }
  return out;
}

function _hoyMx() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

function _sumarDias(ymd, dias) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Fecha (YYYY-MM-DD, hora de México) de un timestamp ISO de SharePoint */
function _fechaMx(iso) {
  return iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(iso)) : null;
}

function _semaforo(fechaVencimiento, hoy = _hoyMx()) {
  if (!fechaVencimiento) return SEMAFORO.SIN_FECHA;
  if (fechaVencimiento < hoy) return SEMAFORO.ROJO;
  return fechaVencimiento <= _sumarDias(hoy, DIAS_POR_VENCER) ? SEMAFORO.AMARILLO : SEMAFORO.VERDE;
}

/**
 * Fecha final de un documento, en este orden de precedencia:
 * 0) No vence → siempre VERDE, sin fecha: el archivo se marcó "No vence"
 *    (sit_documento_fecha.noVence) o su tipo es regla 4 (Documento de
 *    Referencia: GRAS, declaraciones FDA).
 * 1) Fecha registrada para el archivo (sit_documento_fecha): tecleada por el
 *    usuario (origen MANUAL) o tomada de la lectura del PDF (origen IA).
 * 2) Calculada por la regla del tipo (2 = modificación + 365,
 *    3 = modificación + 730).
 * 3) null → SIN_FECHA (regla 1 de fecha explícita, o tipo desconocido).
 * `registro` = { fecha, esManual, noVence } | undefined
 */
const REGLA_NO_VENCE = 4;
function _vigencia(doc, tipo, registro, hoy) {
  if (registro?.noVence || tipo?.reglasVigencia === REGLA_NO_VENCE) {
    return { fechaVencimiento: null, origenFecha: "NO_VENCE", semaforo: SEMAFORO.VERDE, noVence: !!registro?.noVence };
  }
  let fechaVencimiento = null;
  let origenFecha = null;
  if (registro?.fecha) {
    fechaVencimiento = registro.fecha;
    origenFecha = registro.esManual ? "MANUAL" : "IA";
  } else if (tipo && (tipo.reglasVigencia === 2 || tipo.reglasVigencia === 3) && tipo.diasVigencia && doc.fechaModificacion) {
    fechaVencimiento = _sumarDias(_fechaMx(doc.fechaModificacion), tipo.diasVigencia);
    origenFecha = "REGLA";
  }
  return { fechaVencimiento, origenFecha, semaforo: _semaforo(fechaVencimiento, hoy) };
}

const _ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

/** Vencimientos registrados: Map sharepointId → { fecha: 'YYYY-MM-DD'|null, esManual, noVence } (todas, o solo las de `ids`) */
async function _fechasManuales(ids) {
  const db = await getPool();
  const request = db.request();
  let filtro = "";
  if (ids) {
    if (!ids.length) return new Map();
    filtro = "WHERE sharepointId IN (SELECT value FROM OPENJSON(@ids))";
    request.input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids));
  }
  const r = await request.query(`SELECT sharepointId, fechaVencimiento, esManual, noVence FROM sit_documento_fecha ${filtro}`);
  return new Map(
    r.recordset.map((x) => [x.sharepointId, { fecha: _ymd(x.fechaVencimiento), esManual: !!x.esManual, noVence: !!x.noVence }])
  );
}

/** Validaciones de Calidad: Map sharepointId → { estadoValidacion, notasValidacion, validadoPor, fechaValidacion } */
async function _validaciones(ids) {
  if (!ids.length) return new Map();
  const db = await getPool();
  const r = await db.request()
    .input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids))
    .query(`
      SELECT v.sharepointId, v.estadoValidacion, v.notasValidacion,
             COALESCE(u.name, v.validadoPor) AS validadoPor, v.fechaValidacion
      FROM sit_documento_validacion v
      LEFT JOIN sec_users u ON u.login = v.validadoPor
      WHERE v.sharepointId IN (SELECT value FROM OPENJSON(@ids))
    `);
  return new Map(r.recordset.map((x) => [x.sharepointId, x]));
}

/** Agrega tipo oficial, fecha de vencimiento, semáforo y validación de Calidad a una lista de documentos. */
async function _conVigencia(documentos) {
  const ids = documentos.map((d) => d.sharepointId);
  const [clasificador, manuales, validaciones] = await Promise.all([
    _cargarClasificador(),
    _fechasManuales(ids),
    _validaciones(ids),
  ]);
  const hoy = _hoyMx();
  return documentos.map((d) => {
    const tipo = _clasificar(clasificador, d.tipoDocumento);
    const v = validaciones.get(d.sharepointId);
    return {
      ...d,
      contenidosNombre: _contenidosDelNombre(clasificador, d.tipoDocumento, tipo?.idTipoDoc),
      idTipoDoc: tipo?.idTipoDoc ?? null,
      tipoOficial: tipo?.nombre ?? null,
      reglasVigencia: tipo?.reglasVigencia ?? null,
      ..._vigencia(d, tipo, manuales.get(d.sharepointId), hoy),
      estadoValidacion: v?.estadoValidacion ?? null,
      notasValidacion: v?.notasValidacion ?? null,
      validadoPor: v?.validadoPor ?? null,
      fechaValidacion: v?.fechaValidacion ?? null,
    };
  });
}

/** Guarda (o reemplaza) la validación de Calidad de un archivo de SharePoint. */
async function validarDocumento(sharepointId, estadoValidacion, notasValidacion, login) {
  if (!esMock(sharepointId)) await _itemPermitido(sharepointId); // existe y es de las carpetas técnicas
  const db = await getPool();
  await db.request()
    .input("id",     sql.NVarChar(200),  sharepointId)
    .input("estado", sql.TinyInt,        estadoValidacion)
    .input("notas",  sql.NVarChar(2000), notasValidacion || null)
    .input("login",  sql.VarChar(255),   login)
    .query(`
      UPDATE sit_documento_validacion
      SET estadoValidacion = @estado, notasValidacion = @notas, validadoPor = @login, fechaValidacion = GETDATE()
      WHERE sharepointId = @id;
      IF @@ROWCOUNT = 0
        INSERT INTO sit_documento_validacion (sharepointId, estadoValidacion, notasValidacion, validadoPor)
        VALUES (@id, @estado, @notas, @login);
    `);
}

/**
 * Guarda (o reemplaza) el vencimiento registrado de un archivo.
 * { fechaVencimiento: 'YYYY-MM-DD'|null, esManual, noVence } — con noVence
 * la fecha se guarda en NULL.
 */
async function registrarVencimiento(sharepointId, { fechaVencimiento, esManual, noVence }, login) {
  if (!esMock(sharepointId)) await _itemPermitido(sharepointId); // existe y es de las carpetas técnicas
  const db = await getPool();
  await db.request()
    .input("id",       sql.NVarChar(200), sharepointId)
    .input("fecha",    sql.Date,          noVence ? null : fechaVencimiento)
    .input("esManual", sql.Bit,           !!esManual)
    .input("noVence",  sql.Bit,           !!noVence)
    .input("login",    sql.NVarChar(50),  String(login || "").slice(0, 50))
    .query(`
      UPDATE sit_documento_fecha
      SET fechaVencimiento = @fecha, esManual = @esManual, noVence = @noVence,
          registradoPor = @login, fechaRegistro = GETDATE()
      WHERE sharepointId = @id;
      IF @@ROWCOUNT = 0
        INSERT INTO sit_documento_fecha (sharepointId, fechaVencimiento, esManual, noVence, registradoPor)
        VALUES (@id, @fecha, @esManual, @noVence, @login);
    `);
  _tablero = null; // el conteo del tablero debe reflejar la fecha nueva
}

// ────────────────────────────────────────────────────────────
// ÍNDICE DE LA BIBLIOTECA (tablero)
// Recorre toda la biblioteca con /delta. La primera vez son ~10 mil
// elementos (~20 s); después solo se piden los cambios (deltaLink).
// ────────────────────────────────────────────────────────────

const TABLERO_MS = 15 * 60 * 1000;
const _indice = { items: new Map(), deltaLink: null, rootId: null };
let _tablero = null;        // { generadoEn, expira, documentos }
let _tableroPromesa = null; // una sola reconstrucción a la vez

async function _sincronizarIndice() {
  const drive = await _driveId();
  if (!_indice.rootId) _indice.rootId = (await _graph(`/drives/${enc(drive)}/root?$select=id`)).id;

  let url = _indice.deltaLink ||
    `/drives/${enc(drive)}/root/delta?$select=id,name,file,folder,parentReference,lastModifiedDateTime,deleted`;
  try {
    while (url) {
      const data = await _graph(url);
      for (const it of data.value || []) {
        if (it.deleted) _indice.items.delete(it.id);
        else _indice.items.set(it.id, it);
      }
      if (data["@odata.deltaLink"]) {
        _indice.deltaLink = data["@odata.deltaLink"];
        url = null;
      } else {
        url = data["@odata.nextLink"] || null;
      }
    }
  } catch (err) {
    // deltaLink vencido (410) u otro error: la próxima vez se recorre completo
    _indice.items.clear();
    _indice.deltaLink = null;
    throw err;
  }
}

/** Documentos de todas las carpetas de artículo, desde el índice */
function _documentosDelIndice() {
  const items = _indice.items;
  const raices = new Map(); // id carpeta raíz → { alterno }
  for (const it of items.values()) {
    if (!it.folder || it.parentReference?.id !== _indice.rootId) continue;
    const c = CARPETAS.find((c) => c.ruta === it.name);
    if (c) raices.set(it.id, c);
  }
  const carpetas = new Map(); // id carpeta de artículo → { nombre, alterno }
  for (const it of items.values()) {
    const raiz = it.folder && raices.get(it.parentReference?.id);
    if (raiz) carpetas.set(it.id, { nombre: it.name, alterno: raiz.alterno });
  }
  const documentos = [];
  for (const it of items.values()) {
    const carpeta = it.file && carpetas.get(it.parentReference?.id);
    if (!carpeta) continue;
    documentos.push({
      codigoArticulo: (carpeta.nombre.trim().match(/^[^\s(]+/) || [""])[0].toUpperCase(),
      nombreArchivo: it.name,
      proveedor: _proveedorDeCarpeta(carpeta.nombre, carpeta.alterno),
      tipoDocumento: _tipoDeArchivo(it.name),
      sharepointId: it.id,
      fechaModificacion: it.lastModifiedDateTime || null,
    });
  }
  return documentos;
}

/**
 * Todos los documentos de la biblioteca con su vigencia, en caché 15 min.
 * { generadoEn, documentos: [...] }. `forzar` reconstruye (incremental).
 */
async function getDocumentosBiblioteca({ forzar = false } = {}) {
  if (SHAREPOINT_MOCK) return { generadoEn: new Date().toISOString(), documentos: [] };
  if (!forzar && _tablero && _tablero.expira > Date.now()) return _tablero;
  if (!_tableroPromesa) {
    _tableroPromesa = (async () => {
      await _sincronizarIndice();
      const documentos = await _conVigenciaEnLote(_documentosDelIndice());
      _tablero = { generadoEn: new Date().toISOString(), expira: Date.now() + TABLERO_MS, documentos };
      return _tablero;
    })().finally(() => {
      _tableroPromesa = null;
    });
  }
  return _tableroPromesa;
}

/** Igual que _conVigencia pero leyendo todas las fechas manuales de una vez */
async function _conVigenciaEnLote(documentos) {
  const [clasificador, manuales] = await Promise.all([_cargarClasificador(), _fechasManuales(null)]);
  const hoy = _hoyMx();
  return documentos.map((d) => {
    const tipo = _clasificar(clasificador, d.tipoDocumento);
    return {
      ...d,
      idTipoDoc: tipo?.idTipoDoc ?? null,
      tipoOficial: tipo?.nombre ?? null,
      contenidosNombre: _contenidosDelNombre(clasificador, d.tipoDocumento, tipo?.idTipoDoc),
      ..._vigencia(d, tipo, manuales.get(d.sharepointId), hoy),
    };
  });
}

// ────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────

/**
 * Documentos de SharePoint de un artículo (todas sus carpetas de proveedor),
 * con tipo oficial, fecha de vencimiento y semáforo.
 * [{ nombreArchivo, proveedor, tipoDocumento, sharepointId, webUrl, fechaModificacion,
 *    idTipoDoc, tipoOficial, reglasVigencia, fechaVencimiento, origenFecha, semaforo }]
 */
async function getDocumentosArticulo(codigoArticulo) {
  if (!codigoArticulo) return [];
  const documentos = SHAREPOINT_MOCK ? _mockDocumentos(codigoArticulo) : await _documentosReales(codigoArticulo);
  return _conVigencia(documentos);
}

function esMock(sharepointId) {
  return String(sharepointId || "").startsWith("mock-");
}

module.exports = {
  SHAREPOINT_MOCK,
  SEMAFORO,
  getDocumentosArticulo,
  getDocumentosBiblioteca,
  registrarVencimiento,
  validarDocumento,
  abrirDocumento,
  descargarDocumento,
  pdfDePrueba,
  esMock,
};
