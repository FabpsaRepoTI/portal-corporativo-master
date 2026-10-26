// ============================================================
// sit.service.js
// Módulo: SIT — Sistema de Información Técnica
// Documentación técnica (fichas, certificados, HDS…) de artículos por
// proveedor, plantas IAFSA (1) y FDNC (2). Los PDF viven en SharePoint y
// se sirven por streaming: el frontend nunca recibe una URL de SharePoint.
// Portal Corporativo v4 · FABPSA
// ============================================================

const crypto = require("crypto");
const { Readable } = require("stream");
const { getPool, sql } = require("../db");
const { getCedisPool } = require("../db.cedis");
const { getPool: getFdncPool } = require("../db.fdnc");
const { getAccessToken } = require("./dev/sharepoint.service");
const spDocs = require("./sharepoint.service");
const fechaIA = require("./sitFechaIA.service");
const contenidoIA = require("./sitContenidoIA.service");
const { crearNotificacion } = require("./notificaciones.service");
const { emitirTicket } = require("../middleware/sit.middleware");

const GRAPH = "https://graph.microsoft.com/v1.0";
const enc = encodeURIComponent;
const SP_SITE = () => process.env.SIT_SP_SITE_ID || process.env.SP_SITE_ID;
const SP_DRIVE = () => process.env.SIT_SP_DRIVE_ID || process.env.SP_DRIVE_ID;
const SP_CARPETA = () => process.env.SIT_SP_FOLDER || "SIT";

const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const PLANTAS = { 1: "IAFSA", 2: "FDNC" };
const DIAS_POR_VENCER = 30;

// ── Semáforo ────────────────────────────────────────────────
// Se calcula al leer (no depende de un job): 1=verde (>30 días),
// 2=amarillo (≤30 días), 3=rojo (vencido), NULL=sin fecha.
const HOY_SQL = "CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Central Standard Time (Mexico)' AS DATE)";
const semaforoSql = (col) => `
  CASE WHEN ${col} IS NULL THEN NULL
       WHEN ${col} < ${HOY_SQL} THEN 3
       WHEN ${col} <= DATEADD(day, ${DIAS_POR_VENCER}, ${HOY_SQL}) THEN 2
       ELSE 1 END`;

function _hoyMx() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

function _sumarDias(ymd, dias) {
  const [y, m, d] = ymd.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

function _semaforoDe(vencimiento) {
  if (!vencimiento) return 1;
  const hoy = _hoyMx();
  if (vencimiento < hoy) return 3;
  return vencimiento <= _sumarDias(hoy, DIAS_POR_VENCER) ? 2 : 1;
}

const _esFecha = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && !isNaN(Date.parse(v + "T00:00:00Z"));

// ── Utilidades ──────────────────────────────────────────────
const _plantasSql = (req) => (req.sitPermiso.plantas.length ? req.sitPermiso.plantas.join(",") : "0");

function _like(texto) {
  return "%" + String(texto).replace(/[[\]%_]/g, (c) => "[" + c + "]") + "%";
}

const _ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const _err = (res, status, error) => res.status(status).json({ ok: false, error });

function _esDuplicado(err) {
  return err?.number === 2627 || err?.number === 2601;
}

async function _auditar(req, accion, entidad, idEntidad, descripcion) {
  try {
    const db = await getPool();
    await db.request()
      .input("login",       sql.VarChar(255),      req.user?.login || "?")
      .input("accion",      sql.NVarChar(50),      accion)
      .input("entidad",     sql.NVarChar(50),      entidad)
      .input("idEntidad",   sql.Int,               idEntidad ?? null)
      .input("descripcion", sql.NVarChar(sql.MAX), descripcion || null)
      .input("ip",          sql.NVarChar(45),      String(req.ip || req.socket?.remoteAddress || "").slice(0, 45))
      .input("ua",          sql.NVarChar(300),     String(req.headers["user-agent"] || "").slice(0, 300))
      .query(`
        INSERT INTO sit_auditoria (loginUsuario, accion, entidad, idEntidad, descripcion, ipOrigen, userAgent)
        VALUES (@login, @accion, @entidad, @idEntidad, @descripcion, @ip, @ua)
      `);
  } catch (err) {
    console.error("[sit.service] auditoría:", err.message);
  }
}

/**
 * Par artículo-proveedor activo y visible para el usuario (planta permitida,
 * artículo activo salvo que pueda ver inactivos). null si no aplica.
 */
async function _parAccesible(request, idArticuloProveedor, req) {
  const r = await request
    .input("idAP", sql.Int, idArticuloProveedor)
    .input("verInactivos", sql.Bit, req.sitPermiso.puedeVerInactivos ? 1 : 0)
    .query(`
      SELECT ap.idArticuloProveedor, a.idArticulo, a.codigoArticulo, a.idPlanta, p.razonSocial
      FROM sit_articulo_proveedor ap
      JOIN sit_articulos a   ON a.idArticulo = ap.idArticulo
      JOIN sit_proveedores p ON p.idProveedor = ap.idProveedor
      WHERE ap.idArticuloProveedor = @idAP
        AND ap.activo = 1
        AND (a.activo = 1 OR @verInactivos = 1)
        AND a.idPlanta IN (${_plantasSql(req)})
    `);
  return r.recordset[0] || null;
}

// ────────────────────────────────────────────────────────────
// CATÁLOGOS
// ────────────────────────────────────────────────────────────

/** GET /api/sit/tipos-documento */
async function getTiposDocumento(req, res) {
  try {
    const db = await getPool();
    const r = await db.request().query(`
      SELECT idTipoDoc AS idTipoDocumento, nombre, clave, reglasVigencia, diasVigencia,
             requiereValidacion, validadorPuesto
      FROM sit_tipos_documento
      WHERE activo = 1
      ORDER BY idTipoDoc
    `);
    _ok(res, r.recordset);
  } catch (err) {
    console.error("[sit.service] getTiposDocumento:", err);
    _err(res, 500, "Error interno");
  }
}

// ────────────────────────────────────────────────────────────
// DASHBOARD
// ────────────────────────────────────────────────────────────

// Códigos de artículo activos por empresa (para asignar planta a las
// carpetas de SharePoint, que no la indican). Caché de 15 minutos.
let _codigosErp = null; // { expira, porEmpresa: { IAFSA: Set, FDNC: Set } }
async function _codigosPorEmpresa() {
  if (_codigosErp && _codigosErp.expira > Date.now()) return _codigosErp.porEmpresa;
  const listas = await Promise.all(ERP_ARTICULOS.map((f) => _articulosErp(f, null)));
  const porEmpresa = {};
  ERP_ARTICULOS.forEach((f, i) => {
    porEmpresa[f.empresa] = new Set(listas[i].map((a) => String(a.codigoArticulo).trim().toUpperCase()));
  });
  _codigosErp = { porEmpresa, expira: Date.now() + 15 * 60 * 1000 };
  return porEmpresa;
}

const _conteoVacio = () => ({ vigentes: 0, porVencer: 0, vencidos: 0, sinFecha: 0, total: 0 });
const CAMPO_SEMAFORO = { VERDE: "vigentes", AMARILLO: "porVencer", ROJO: "vencidos", SIN_FECHA: "sinFecha" };

/**
 * Documentos validados por Calidad, por empresa:
 * { IAFSA: { total, ultimaSemana, porArticulo: [{ codigoArticulo, count, ultima }] } }
 * porArticulo = los 5 artículos con validación más reciente (count = cuántos
 * documentos de ese artículo están validados). La empresa sale del ERP,
 * igual que en los conteos del semáforo.
 */
async function _validacionesPorEmpresa(documentos, codigos, empresasVisibles) {
  const vacio = () => ({ total: 0, ultimaSemana: 0, porArticulo: [] });
  const out = Object.fromEntries(empresasVisibles.map((e) => [e, vacio()]));
  let filas;
  try {
    const db = await getPool();
    filas = (await db.request().query(`SELECT sharepointId, fechaValidacion FROM sit_documento_validacion`)).recordset;
  } catch (err) {
    if (/Invalid object name/i.test(err.message)) return out;
    throw err;
  }
  const docPorId = new Map(documentos.map((d) => [d.sharepointId, d]));
  const haceUnaSemana = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const articulos = Object.fromEntries(empresasVisibles.map((e) => [e, new Map()])); // codigo → { count, ultima }

  for (const v of filas) {
    const doc = docPorId.get(v.sharepointId);
    if (!doc) continue; // ya no está en la biblioteca
    const fecha = new Date(v.fechaValidacion);
    for (const empresa of empresasVisibles) {
      if (!codigos[empresa]?.has(doc.codigoArticulo)) continue;
      out[empresa].total++;
      if (fecha.getTime() >= haceUnaSemana) out[empresa].ultimaSemana++;
      const a = articulos[empresa].get(doc.codigoArticulo) || { codigoArticulo: doc.codigoArticulo, count: 0, ultima: null };
      a.count++;
      if (!a.ultima || fecha > a.ultima) a.ultima = fecha;
      articulos[empresa].set(doc.codigoArticulo, a);
    }
  }
  for (const empresa of empresasVisibles) {
    out[empresa].porArticulo = [...articulos[empresa].values()].sort((a, b) => b.ultima - a.ultima).slice(0, 5);
  }
  return out;
}

/**
 * GET /api/sit/dashboard[?refrescar=1]  (alias: /api/sit/tablero)[&semaforo=VERDE|AMARILLO|ROJO|SIN_FECHA][&empresa=IAFSA|FDNC]
 * Semáforo por empresa calculado sobre los documentos de SharePoint
 * (caché de 15 min) y alertas de documentos por vencer / vencidos.
 * La planta sale del ERP: un código que existe en IAFSA y en FDNC cuenta
 * en ambas.
 * semaforo/empresa (clic en un KPI) solo filtran la lista `alertas`; los
 * conteos siempre son sobre todos los documentos visibles.
 */
async function getDashboard(req, res) {
  try {
    const filtroSemaforo = CAMPO_SEMAFORO[req.query.semaforo] ? req.query.semaforo : null;
    const filtroEmpresa = req.query.empresa ? String(req.query.empresa) : null;
    const entraEnLista = (semaforo, visibles) =>
      (filtroSemaforo ? semaforo === filtroSemaforo : semaforo === "AMARILLO" || semaforo === "ROJO") &&
      (!filtroEmpresa || visibles.some((f) => f.empresa === filtroEmpresa));

    const [biblioteca, codigos] = await Promise.all([
      spDocs.getDocumentosBiblioteca({ forzar: req.query.refrescar === "1" }),
      _codigosPorEmpresa(),
    ]);

    const empresas = ERP_ARTICULOS.filter((f) => req.sitPermiso.plantas.includes(f.idPlanta));
    const conteo = Object.fromEntries(empresas.map((f) => [f.empresa, _conteoVacio()]));
    const alertas = [];
    let sinArticuloErp = 0;

    for (const d of biblioteca.documentos) {
      const deEmpresas = ERP_ARTICULOS.filter((f) => codigos[f.empresa]?.has(d.codigoArticulo));
      if (!deEmpresas.length) {
        sinArticuloErp++;
        continue;
      }
      const visibles = deEmpresas.filter((f) => conteo[f.empresa]);
      for (const f of visibles) {
        conteo[f.empresa][CAMPO_SEMAFORO[d.semaforo]]++;
        conteo[f.empresa].total++;
      }
      if (visibles.length && entraEnLista(d.semaforo, visibles)) {
        const empresasDoc = filtroEmpresa ? [filtroEmpresa] : visibles.map((f) => f.empresa);
        alertas.push({
          sharepointId: d.sharepointId,
          codigoArticulo: d.codigoArticulo,
          empresa: empresasDoc[0],
          empresas: empresasDoc,
          proveedor: d.proveedor,
          tipoDocumento: d.tipoOficial || d.tipoDocumento,
          nombreArchivo: d.nombreArchivo,
          fechaVencimiento: d.fechaVencimiento,
          semaforo: d.semaforo,
        });
      }
    }

    // Sin fecha al final; el resto, del vencimiento más próximo al más lejano
    alertas.sort((a, b) =>
      !a.fechaVencimiento ? 1 : !b.fechaVencimiento ? -1 : String(a.fechaVencimiento).localeCompare(String(b.fechaVencimiento))
    );

    const validaciones = await _validacionesPorEmpresa(biblioteca.documentos, codigos, Object.keys(conteo));

    _ok(res, {
      ...conteo,
      validaciones,
      generadoEn: biblioteca.generadoEn,
      totalDocumentos: biblioteca.documentos.length,
      sinArticuloErp,
      alertas: alertas.slice(0, 2000), // la tabla pagina en el cliente
      totalAlertas: alertas.length,
      filtro: { semaforo: filtroSemaforo, empresa: filtroEmpresa },
      permisos: req.sitPermiso,
    });
  } catch (err) {
    console.error("[sit.service] getDashboard:", err);
    _err(res, 502, "No se pudo calcular el tablero desde SharePoint");
  }
}

// ────────────────────────────────────────────────────────────
// ARTÍCULOS
// ────────────────────────────────────────────────────────────

// Bases de ERP por empresa: IAFSA (planta 1) y FDNC (planta 2)
const ERP_ARTICULOS = [
  { empresa: "IAFSA", idPlanta: 1, getPool: getCedisPool },
  { empresa: "FDNC", idPlanta: 2, getPool: getFdncPool },
];

const ORDEN_EMPRESA = Object.fromEntries(ERP_ARTICULOS.map((f, i) => [f.empresa, i]));

async function _articulosErp({ empresa, idPlanta, getPool: pool }, busqueda, codigo) {
  const db = await pool();
  const request = db.request();
  let filtro = "";
  if (codigo) {
    request.input("codigo", sql.VarChar(50), codigo);
    filtro = "AND codigoArticulo = @codigo";
  } else if (busqueda) {
    request.input("q", sql.VarChar(310), _like(busqueda));
    filtro = "AND (codigoArticulo LIKE @q OR descripcion LIKE @q)";
  }
  const r = await request.query(`
    SELECT codigoArticulo, descripcion, tipoMaterial, tipo, familia, proveedorLP
    FROM ARTICULO
    WHERE descripcion NOT LIKE '%Inactivo%' ${filtro}
  `);
  return r.recordset.map((a) => ({
    ...a,
    proveedorLP: a.proveedorLP ? String(a.proveedorLP).trim() : null,
    empresa,
    idPlanta,
  }));
}

/**
 * GET /api/sit/articulos?idPlanta=1&busqueda=sal
 * Artículos activos leídos del ERP de ambas empresas (IAFSA y FDNC) en
 * paralelo, cada uno marcado con su empresa. Solo de las plantas que el
 * perfil del usuario puede ver.
 */
async function getArticulos(req, res) {
  try {
    const idPlanta = parseInt(req.query.idPlanta) || null;
    const busqueda = String(req.query.busqueda || "").trim().slice(0, 100);

    const fuentes = ERP_ARTICULOS.filter(
      (f) => req.sitPermiso.plantas.includes(f.idPlanta) && (!idPlanta || f.idPlanta === idPlanta),
    );

    const resultados = await Promise.all(fuentes.map((f) => _articulosErp(f, busqueda)));

    // ?estadoDoc=VERDE|AMARILLO|ROJO|SIN_FECHA|SIN_VALIDAR: solo artículos con al
    // menos un documento de SharePoint en ese estado
    const estadoDoc = String(req.query.estadoDoc || "");
    let conEstado = null;
    if (estadoDoc) {
      if (!CAMPO_SEMAFORO[estadoDoc] && estadoDoc !== "SIN_VALIDAR") return _err(res, 400, "Estado de documento inválido");
      const biblioteca = await spDocs.getDocumentosBiblioteca();
      let docs = biblioteca.documentos;
      if (estadoDoc === "SIN_VALIDAR") {
        const db = await getPool();
        const validadas = new Set((await db.request().query(`SELECT sharepointId FROM sit_documento_validacion`)).recordset.map((x) => x.sharepointId));
        docs = docs.filter((d) => !validadas.has(d.sharepointId));
      } else {
        docs = docs.filter((d) => d.semaforo === estadoDoc);
      }
      conEstado = new Set(docs.map((d) => String(d.codigoArticulo).trim().toUpperCase()));
    }

    const articulos = resultados
      .flat()
      .filter((a) => !conEstado || conEstado.has(String(a.codigoArticulo).trim().toUpperCase()))
      .sort(
        (a, b) =>
          ORDEN_EMPRESA[a.empresa] - ORDEN_EMPRESA[b.empresa] ||
          String(a.codigoArticulo).localeCompare(String(b.codigoArticulo), "es", { numeric: true }),
      );

    _ok(res, articulos);
  } catch (err) {
    console.error("[sit.service] getArticulos:", err);
    _err(res, 502, "No se pudieron consultar los artículos del ERP");
  }
}

/**
 * Busca un artículo del ERP por código. El mismo código puede existir en
 * IAFSA y en FDNC: con `empresa` se busca solo en esa; sin ella, se toma
 * la primera empresa (IAFSA, luego FDNC) donde exista. Agrega idArticulo
 * del espejo en sit_articulos (null si aún no tiene proveedores ni documentos).
 */
async function _resolverArticulo(req, codigo, empresa) {
  const fuentes = ERP_ARTICULOS.filter(
    (f) => req.sitPermiso.plantas.includes(f.idPlanta) && (!empresa || f.empresa === empresa),
  );
  let erp = null;
  for (const f of fuentes) {
    [erp] = await _articulosErp(f, null, codigo);
    if (erp) break;
  }
  if (!erp) return null;

  const db = await getPool();
  const r = await db.request()
    .input("codigo",   sql.NVarChar(50), erp.codigoArticulo)
    .input("idPlanta", sql.TinyInt,      erp.idPlanta)
    .query(`SELECT idArticulo FROM sit_articulos WHERE codigoArticulo = @codigo AND idPlanta = @idPlanta`);
  return { ...erp, idArticulo: r.recordset[0]?.idArticulo ?? null };
}

const _trim = (v) => (v === null || v === undefined ? null : String(v).trim() || null);

/**
 * Proveedores de un artículo leídos del ERP (PROVEE) de su empresa, sin
 * los inactivos. Primero por ARTICULO.proveedorLP; como en la práctica ese
 * campo guarda el origen (FABPSA / EXTERNO) y no un código de proveedor,
 * si no hay coincidencias se usan los proveedores de la matriz de
 * requisitoriedad (sit_ap_requisitos.codigoProveedor).
 * [{ codigoProveedor, razonSocial, nombreFabricante, tipoProveedor,
 *    contactoTecnico, emailTecnico, certificacionProveedor, categoria, origen }]
 */
async function getProveedoresArticuloErp(codigoArticulo, empresa) {
  const fuente = ERP_ARTICULOS.find((f) => f.empresa === empresa);
  if (!fuente || !codigoArticulo) return [];
  const erp = await fuente.getPool();

  const columnas = `
    LTRIM(RTRIM(p.codigoProveedor)) AS codigoProveedor, p.nombre1 AS razonSocial, p.nombreFabricante,
    p.tipoProveedor, p.contactoTecnico, p.emailTecnico, p.certificacionProveedor, p.categoria`;

  const porLP = await erp.request()
    .input("codigo", sql.VarChar(50), codigoArticulo)
    .query(`
      SELECT ${columnas}
      FROM PROVEE p
      INNER JOIN ARTICULO a ON a.proveedorLP = p.codigoProveedor
      WHERE a.codigoArticulo = @codigo
        AND p.categoria <> 'INACTIVO'
    `);

  let filas = porLP.recordset.map((p) => ({ ...p, origen: "ERP" }));

  if (!filas.length) {
    // Proveedores del artículo según la matriz (si la tabla aún no existe, no hay)
    let codigos = [];
    try {
      const db = await getPool();
      const m = await db.request()
        .input("codigo",  sql.NVarChar(50), codigoArticulo)
        .input("empresa", sql.VarChar(10),  empresa)
        .query(`
          SELECT DISTINCT LTRIM(RTRIM(codigoProveedor)) AS codigoProveedor
          FROM sit_ap_requisitos
          WHERE codigoArticulo = @codigo AND empresa = @empresa
        `);
      codigos = m.recordset.map((x) => x.codigoProveedor).filter(Boolean);
    } catch (err) {
      if (!/Invalid object name/i.test(err.message)) throw err;
    }

    if (codigos.length) {
      const request = erp.request();
      const params = codigos.slice(0, 50).map((c, i) => {
        request.input(`p${i}`, sql.VarChar(50), c);
        return `@p${i}`;
      });
      const r = await request.query(`
        SELECT ${columnas}
        FROM PROVEE p
        WHERE LTRIM(RTRIM(p.codigoProveedor)) IN (${params.join(", ")})
          AND p.categoria <> 'INACTIVO'
      `);
      filas = r.recordset.map((p) => ({ ...p, origen: "MATRIZ" }));
    }
  }

  return filas.map((p) => ({
    codigoProveedor: p.codigoProveedor,
    razonSocial: _trim(p.razonSocial),
    nombreFabricante: _trim(p.nombreFabricante),
    tipoProveedor: _trim(p.tipoProveedor),
    contactoTecnico: _trim(p.contactoTecnico),
    emailTecnico: _trim(p.emailTecnico),
    certificacionProveedor: _trim(p.certificacionProveedor),
    categoria: _trim(p.categoria),
    origen: p.origen,
  }));
}

/** Nombres de proveedor del ERP de la empresa (incluye inactivos): Map código → { nombre, inactivo } */
async function _nombresProveedores(empresa, codigos) {
  const fuente = ERP_ARTICULOS.find((f) => f.empresa === empresa);
  if (!fuente || !codigos.length) return new Map();
  const erp = await fuente.getPool();
  const request = erp.request();
  const params = codigos.slice(0, 100).map((c, i) => {
    request.input(`p${i}`, sql.VarChar(50), c);
    return `@p${i}`;
  });
  const r = await request.query(`
    SELECT LTRIM(RTRIM(codigoProveedor)) AS codigoProveedor, nombre1, categoria
    FROM PROVEE
    WHERE LTRIM(RTRIM(codigoProveedor)) IN (${params.join(", ")})
  `);
  return new Map(r.recordset.map((p) => [p.codigoProveedor, { nombre: _trim(p.nombre1), inactivo: _trim(p.categoria) === "INACTIVO" }]));
}

/**
 * Tipos de documento cubiertos por una lista de documentos de SharePoint.
 * Los documentos sin tipo reconocido no cuentan.
 */
// Un requisito se cumple solo con un documento vigente: VERDE o AMARILLO.
// Vencido (ROJO) = incumplimiento; sin fecha tampoco cuenta.
const SEMAFOROS_QUE_CUMPLEN = new Set(["VERDE", "AMARILLO"]);

// contenidos: Map sharepointId → [{ idTipoDoc }] ("También contiene"). Un tipo
// contenido en un documento vigente cuenta como cubierto: p. ej. la Tabla
// Nutrimental que viene dentro de una Ficha Técnica vigente.
function _tiposCubiertos(documentos, contenidos) {
  const vigentes = (documentos || []).filter((d) => SEMAFOROS_QUE_CUMPLEN.has(d.semaforo));
  const cubiertos = new Set(vigentes.map((d) => d.idTipoDoc).filter((id) => id != null));
  for (const d of vigentes) {
    // Lo que dice el nombre del archivo ("FT, Tabla Nutrimental, …") y lo marcado en el SIT
    for (const c of d.contenidosNombre || []) cubiertos.add(c.idTipoDoc);
    for (const c of contenidos?.get(d.sharepointId) || []) cubiertos.add(c.idTipoDoc);
  }
  // Tipo 4 se cubre con tipo 1 por diseño de la matriz.
  if (cubiertos.has(1)) cubiertos.add(4);
  return cubiertos;
}

/**
 * "También contiene" de los archivos de SharePoint (sit_documento_contenido):
 * Map sharepointId → [{ idTipoDoc, nombre, pagina, origen }]. Tabla chica: se
 * lee completa. Devuelve un Map vacío si la tabla aún no existe.
 */
async function _contenidosPorDoc() {
  try {
    const db = await getPool();
    const r = await db.request().query(`
      SELECT c.sharepointId, c.idTipoDoc, t.nombre, c.pagina, c.origen
      FROM sit_documento_contenido c
      JOIN sit_tipos_documento t ON t.idTipoDoc = c.idTipoDoc
      ORDER BY c.sharepointId, t.nombre
    `);
    const m = new Map();
    for (const x of r.recordset) {
      if (!m.has(x.sharepointId)) m.set(x.sharepointId, []);
      m.get(x.sharepointId).push({ idTipoDoc: x.idTipoDoc, nombre: x.nombre, pagina: x.pagina, origen: x.origen });
    }
    return m;
  } catch (err) {
    if (/Invalid object name/i.test(err.message)) return new Map();
    throw err;
  }
}

const UMBRAL_CUMPLE = 80; // % de documentos requeridos para considerar que un par cumple

/**
 * GET /api/sit/tablero/cumplimiento[?refrescar=1]
 * Por planta: cuántos pares artículo+proveedor de la matriz tienen al menos
 * el 80% de sus documentos requeridos en SharePoint y vigentes (un
 * documento vencido no cuenta, ver _tiposCubiertos). Se calcula sobre el
 * mismo índice de la biblioteca que el tablero y se guarda 15 minutos.
 */
let _cumplimiento = null; // { generadoEn, expira, porEmpresa, porArticulo }

/**
 * Cumplimiento de requisitoriedad (cacheado 15 min y por versión de la
 * biblioteca). Un requisito se cumple con un documento vigente del tipo
 * (ver _tiposCubiertos). Devuelve:
 *  - porEmpresa: { IAFSA: { pares, cumplen, parcial, bajo, sinDocumentos, porcentaje } }
 *    (porcentaje = % de pares artículo+proveedor que llegan al UMBRAL_CUMPLE)
 *  - porArticulo: Map 'EMPRESA|CODIGO' → { empresa, codigoArticulo, total, cumplidos }
 *    (requisitos de todos sus proveedores sumados)
 *  - huecosPorTipo: Map idTipoDoc → Set('EMPRESA|CODIGO') de artículos que
 *    exigen ese tipo y no lo tienen vigente
 *  - docsPorCodigo: Set de códigos con al menos un documento en SharePoint
 *  - calculadoEn: cuándo se recalculó (el caché dura 15 min)
 */
async function _calcularCumplimiento(biblioteca) {
  if (_cumplimiento && _cumplimiento.generadoEn === biblioteca.generadoEn && _cumplimiento.expira > Date.now()) {
    return _cumplimiento;
  }
  // Tipos cubiertos por código de artículo (las carpetas no indican la empresa)
  const docsPorCodigo = new Map();
  for (const d of biblioteca.documentos) {
    if (!docsPorCodigo.has(d.codigoArticulo)) docsPorCodigo.set(d.codigoArticulo, []);
    docsPorCodigo.get(d.codigoArticulo).push(d);
  }
  const contenidos = await _contenidosPorDoc();
  const cubiertosPorCodigo = new Map([...docsPorCodigo].map(([c, docs]) => [c, _tiposCubiertos(docs, contenidos)]));

  let filas = [];
  try {
    const db = await getPool();
    const r = await db.request().query(`
      SELECT empresa, UPPER(LTRIM(RTRIM(codigoArticulo))) AS codigoArticulo,
             LTRIM(RTRIM(codigoProveedor)) AS codigoProveedor, idTipoDoc
      FROM sit_ap_requisitos
      WHERE esObligatorio = 1
    `);
    filas = r.recordset;
  } catch (err) {
    if (!/Invalid object name/i.test(err.message)) throw err;
  }

  const pares = new Map(); // empresa|articulo|proveedor → { total, cumplidos }
  const porArticulo = new Map(); // empresa|articulo → { total, cumplidos }
  const huecosPorTipo = new Map(); // idTipoDoc → Set(empresa|articulo)
  for (const f of filas) {
    const cumple = !!cubiertosPorCodigo.get(f.codigoArticulo)?.has(f.idTipoDoc);
    const k = `${f.empresa}|${f.codigoArticulo}|${f.codigoProveedor}`;
    if (!pares.has(k)) pares.set(k, { empresa: f.empresa, total: 0, cumplidos: 0 });
    const p = pares.get(k);
    p.total++;
    if (cumple) p.cumplidos++;
    const ka = `${f.empresa}|${f.codigoArticulo}`;
    if (!porArticulo.has(ka)) porArticulo.set(ka, { empresa: f.empresa, codigoArticulo: f.codigoArticulo, total: 0, cumplidos: 0 });
    const a = porArticulo.get(ka);
    a.total++;
    if (cumple) a.cumplidos++;
    else {
      if (!huecosPorTipo.has(f.idTipoDoc)) huecosPorTipo.set(f.idTipoDoc, new Set());
      huecosPorTipo.get(f.idTipoDoc).add(ka);
    }
  }

  const porEmpresa = {};
  for (const f of ERP_ARTICULOS) {
    porEmpresa[f.empresa] = { pares: 0, cumplen: 0, parcial: 0, bajo: 0, sinDocumentos: 0, porcentaje: 0 };
  }
  for (const p of pares.values()) {
    const e = porEmpresa[p.empresa];
    if (!e) continue;
    const pct = p.total ? (p.cumplidos * 100) / p.total : 0;
    e.pares++;
    if (pct >= UMBRAL_CUMPLE) e.cumplen++;
    else if (pct >= 50) e.parcial++;
    else e.bajo++;
    if (!p.cumplidos) e.sinDocumentos++;
  }
  for (const e of Object.values(porEmpresa)) {
    e.porcentaje = e.pares ? Math.round((e.cumplen * 1000) / e.pares) / 10 : 0;
  }

  _cumplimiento = {
    generadoEn: biblioteca.generadoEn,
    calculadoEn: new Date().toISOString(),
    expira: Date.now() + 15 * 60 * 1000,
    porEmpresa,
    porArticulo,
    huecosPorTipo,
    docsPorCodigo: new Set(docsPorCodigo.keys()),
  };
  return _cumplimiento;
}

async function getCumplimientoTablero(req, res) {
  try {
    const biblioteca = await spDocs.getDocumentosBiblioteca({ forzar: req.query.refrescar === "1" });
    const cumplimiento = await _calcularCumplimiento(biblioteca);
    const visibles = Object.fromEntries(
      ERP_ARTICULOS.filter((f) => req.sitPermiso.plantas.includes(f.idPlanta)).map((f) => [f.empresa, cumplimiento.porEmpresa[f.empresa]]),
    );
    _ok(res, { ...visibles, umbral: UMBRAL_CUMPLE, generadoEn: cumplimiento.generadoEn });
  } catch (err) {
    console.error("[sit.service] getCumplimientoTablero:", err);
    _err(res, 502, "No se pudo calcular el cumplimiento");
  }
}

const _diasHasta = (ymd) => {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
  return Math.round((Date.parse(String(ymd).slice(0, 10)) - Date.parse(hoy)) / 86400000);
};

/**
 * GET /api/sit/tablero/dashboard[?refrescar=1]  — solo administradoras documentales
 * Todo el dashboard en una llamada:
 *  empresas:   { IAFSA: { cumplimiento, pares, articulosActivos } }
 *  semaforo:   { vigentes, porVencer, vencidos, sinFecha, total } — cada documento una vez
 *  porVencer:  documentos que vencen en ≤30 días, por días restantes ascendente
 *  menorCumplimiento: los 10 artículos con peor % de requisitos cubiertos
 *  validacionesPendientes: documentos de SharePoint sin validación de Calidad
 *  actividad:  últimas 10 entradas de sit_auditoria
 */
async function getDashboardAdmin(req, res) {
  try {
    const [biblioteca, codigos] = await Promise.all([
      spDocs.getDocumentosBiblioteca({ forzar: req.query.refrescar === "1" }),
      _codigosPorEmpresa(),
    ]);
    const fuentes = ERP_ARTICULOS.filter((f) => req.sitPermiso.plantas.includes(f.idPlanta));
    const cumplimiento = await _calcularCumplimiento(biblioteca);

    const empresas = Object.fromEntries(
      fuentes.map((f) => [
        f.empresa,
        {
          cumplimiento: cumplimiento.porEmpresa[f.empresa]?.porcentaje ?? 0,
          pares: cumplimiento.porEmpresa[f.empresa]?.pares ?? 0,
          paresCumplen: cumplimiento.porEmpresa[f.empresa]?.cumplen ?? 0,
          paresParcial: cumplimiento.porEmpresa[f.empresa]?.parcial ?? 0,
          paresBajo: cumplimiento.porEmpresa[f.empresa]?.bajo ?? 0,
          articulosActivos: codigos[f.empresa]?.size ?? 0,
          // Activos en el ERP sin ningún documento en SharePoint
          articulosSinDocumentos: [...(codigos[f.empresa] || [])].filter((c) => !cumplimiento.docsPorCodigo.has(c)).length,
        },
      ]),
    );

    // Documentos de artículos activos de las plantas visibles (cada uno una vez)
    const empresasDe = (codigo) => fuentes.filter((f) => codigos[f.empresa]?.has(codigo)).map((f) => f.empresa);
    const docs = biblioteca.documentos
      .map((d) => ({ d, empresas: empresasDe(d.codigoArticulo) }))
      .filter((x) => x.empresas.length);

    const semaforo = { vigentes: 0, porVencer: 0, vencidos: 0, sinFecha: 0, total: docs.length };
    for (const { d } of docs) semaforo[CAMPO_SEMAFORO[d.semaforo]]++;

    const porVencer = docs
      .filter(({ d }) => d.semaforo === "AMARILLO" && d.fechaVencimiento)
      .map(({ d, empresas: e }) => ({
        sharepointId: d.sharepointId,
        nombreArchivo: d.nombreArchivo,
        tipoDocumento: d.tipoOficial || d.tipoDocumento,
        codigoArticulo: d.codigoArticulo,
        proveedor: d.proveedor,
        empresas: e,
        fechaVencimiento: d.fechaVencimiento,
        diasRestantes: _diasHasta(d.fechaVencimiento),
      }))
      .sort((a, b) => a.diasRestantes - b.diasRestantes || String(a.codigoArticulo).localeCompare(String(b.codigoArticulo)));

    // Calendario de vencimientos: documentos que vencen en cada uno de los
    // próximos 12 meses (mes en curso incluido), por empresa
    const hoyMx = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
    const [anioHoy, mesHoy] = hoyMx.split("-").map(Number);
    const calendario = Array.from({ length: 12 }, (_, i) => {
      const m = mesHoy - 1 + i;
      return { anio: anioHoy + Math.floor(m / 12), mes: (m % 12) + 1, total: 0, porEmpresa: Object.fromEntries(fuentes.map((x) => [x.empresa, 0])) };
    });
    for (const { d, empresas: e } of docs) {
      if (!d.fechaVencimiento || d.semaforo === "ROJO") continue;
      const [a, m] = String(d.fechaVencimiento).slice(0, 7).split("-").map(Number);
      const i = (a - anioHoy) * 12 + (m - mesHoy);
      if (i < 0 || i >= 12) continue;
      calendario[i].total++;
      for (const emp of e) calendario[i].porEmpresa[emp]++;
    }

    // Estado de los documentos por tipo (los 8 tipos con más documentos)
    const porTipo = new Map();
    for (const { d } of docs) {
      const t = d.tipoOficial || d.tipoDocumento || "Sin tipo reconocido";
      if (!porTipo.has(t)) porTipo.set(t, { tipo: t, vigentes: 0, porVencer: 0, vencidos: 0, sinFecha: 0, total: 0 });
      const x = porTipo.get(t);
      x[CAMPO_SEMAFORO[d.semaforo]]++;
      x.total++;
    }
    const estadoPorTipo = [...porTipo.values()].sort((a, b) => b.total - a.total).slice(0, 8);

    // Artículos con menor cumplimiento (activos en el ERP y de plantas visibles)
    const peores = [...cumplimiento.porArticulo.values()]
      .filter((a) => fuentes.some((f) => f.empresa === a.empresa) && codigos[a.empresa]?.has(a.codigoArticulo) && a.total)
      .map((a) => ({ ...a, porcentaje: Math.round((a.cumplidos * 1000) / a.total) / 10 }))
      .sort((a, b) => a.porcentaje - b.porcentaje || b.total - a.total)
      .slice(0, 10);
    // Descripción desde el ERP (10 consultas puntuales por código)
    await Promise.all(
      peores.map(async (a) => {
        const fuente = ERP_ARTICULOS.find((f) => f.empresa === a.empresa);
        const r = await _articulosErp(fuente, null, a.codigoArticulo).catch(() => []);
        a.descripcion = r[0]?.descripcion || null;
      }),
    );

    // Tipos de documento con más huecos: artículos (activos, de plantas
    // visibles) que exigen el tipo en la matriz y no lo tienen vigente
    const visibleYActivo = (k) => {
      const [empresa, codigo] = k.split("|");
      return fuentes.some((f) => f.empresa === empresa) && codigos[empresa]?.has(codigo);
    };
    const db = await getPool();
    const nombresTipo = new Map(
      (await db.request().query(`SELECT idTipoDoc, nombre FROM sit_tipos_documento`)).recordset.map((t) => [t.idTipoDoc, t.nombre]),
    );
    const huecosPorTipo = [...cumplimiento.huecosPorTipo]
      .map(([idTipoDoc, arts]) => ({
        idTipoDoc,
        nombre: nombresTipo.get(idTipoDoc) || `Tipo ${idTipoDoc}`,
        articulos: [...arts].filter(visibleYActivo).length,
      }))
      .filter((t) => t.articulos > 0)
      .sort((a, b) => b.articulos - a.articulos)
      .slice(0, 10);

    // Validaciones pendientes y actividad reciente
    const [validadas, actividad] = await Promise.all([
      db.request().query(`SELECT sharepointId FROM sit_documento_validacion`).then((r) => new Set(r.recordset.map((x) => x.sharepointId))),
      db.request().query(`
        SELECT TOP 10 a.idAuditoria, a.loginUsuario, COALESCE(u.name, a.loginUsuario) AS nombreUsuario,
               a.accion, a.entidad, a.descripcion, a.fecha
        FROM sit_auditoria a
        LEFT JOIN sec_users u ON u.login = a.loginUsuario
        ORDER BY a.idAuditoria DESC
      `).then((r) => r.recordset),
    ]);
    const validacionesPendientes = docs.filter(({ d }) => !validadas.has(d.sharepointId)).length;

    _ok(res, {
      empresas,
      semaforo,
      porVencer: porVencer.slice(0, 500),
      totalPorVencer: porVencer.length,
      menorCumplimiento: peores,
      umbral: UMBRAL_CUMPLE,
      validacionesPendientes,
      huecosPorTipo,
      calendario,
      estadoPorTipo,
      articulosSinDocumentos: Object.values(empresas).reduce((n, e) => n + e.articulosSinDocumentos, 0),
      calculadoEn: cumplimiento.calculadoEn,
      actividad,
      generadoEn: biblioteca.generadoEn,
    });
  } catch (err) {
    console.error("[sit.service] getDashboardAdmin:", err);
    _err(res, 502, "No se pudo armar el dashboard");
  }
}

/**
 * Requisitoriedad del artículo por proveedor (matriz sit_ap_requisitos):
 * qué tipos de documento se exigen y cuáles ya tienen al menos un documento
 * del artículo en SharePoint con ese tipo. Las carpetas de SharePoint traen
 * el nombre del proveedor, no su código, así que la cobertura se mide por
 * artículo. Documentos sin tipo reconocido no cuentan.
 * Devuelve [] si el artículo no está en la matriz (o la tabla no existe).
 */
async function _requisitoriedad(articulo, documentosSharePoint) {
  let filas;
  try {
    const db = await getPool();
    const r = await db.request()
      .input("codigo",  sql.NVarChar(50), articulo.codigoArticulo)
      .input("empresa", sql.VarChar(10),  articulo.empresa)
      .query(`
        SELECT LTRIM(RTRIM(r.codigoProveedor)) AS codigoProveedor, r.idTipoDoc, t.nombre AS nombreTipo
        FROM sit_ap_requisitos r
        JOIN sit_tipos_documento t ON t.idTipoDoc = r.idTipoDoc
        WHERE r.codigoArticulo = @codigo AND r.empresa = @empresa AND r.esObligatorio = 1
        ORDER BY r.codigoProveedor, r.idTipoDoc
      `);
    filas = r.recordset;
  } catch (err) {
    if (/Invalid object name/i.test(err.message)) return []; // matriz aún no cargada
    throw err;
  }
  if (!filas.length) return [];

  const cubiertos = _tiposCubiertos(documentosSharePoint, await _contenidosPorDoc());

  const porProveedor = new Map();
  for (const f of filas) {
    if (!porProveedor.has(f.codigoProveedor)) porProveedor.set(f.codigoProveedor, []);
    porProveedor.get(f.codigoProveedor).push({ idTipoDoc: f.idTipoDoc, nombreTipo: f.nombreTipo, cumple: cubiertos.has(f.idTipoDoc) });
  }

  let nombres = new Map();
  try {
    nombres = await _nombresProveedores(articulo.empresa, [...porProveedor.keys()]);
  } catch (err) {
    console.error("[sit.service] nombres de proveedor:", err.message);
  }

  return [...porProveedor.entries()].map(([codigoProveedor, requisitos]) => {
    const cumplidos = requisitos.filter((r) => r.cumple).length;
    return {
      codigoProveedor,
      nombreProveedor: nombres.get(codigoProveedor)?.nombre || codigoProveedor,
      proveedorInactivo: !!nombres.get(codigoProveedor)?.inactivo,
      empresa: articulo.empresa,
      requisitos,
      cumplimiento: {
        total: requisitos.length,
        cumplidos,
        porcentaje: requisitos.length ? Math.round((cumplidos * 1000) / requisitos.length) / 10 : 0,
      },
    };
  });
}

const _empresaQuery = (req) => {
  const e = String(req.query.empresa || req.body?.empresa || "").trim().toUpperCase();
  return ORDEN_EMPRESA[e] !== undefined ? e : null;
};

/**
 * GET /api/sit/articulos/:codigoArticulo?empresa=IAFSA
 * Artículo del ERP más los documentos vigentes que tiene en SIT
 * (de cualquiera de sus proveedores) y los de la biblioteca de SharePoint.
 */
async function getArticuloDetalle(req, res) {
  try {
    const articulo = await _resolverArticulo(req, req.params.codigoArticulo, _empresaQuery(req));
    if (!articulo) return _err(res, 404, "Artículo no encontrado");

    const db = await getPool();
    const docs = await db.request()
      .input("codigo",   sql.NVarChar(50), articulo.codigoArticulo)
      .input("idPlanta", sql.TinyInt,      articulo.idPlanta)
      .query(`
        SELECT d.idDocumento, ap.idArticuloProveedor, p.razonSocial AS proveedor,
               d.idTipoDoc AS idTipoDocumento, t.nombre AS tipoDocumento, d.version,
               d.nombreOriginal AS nombreArchivo, d.fechaVencimientoCalc AS fechaVencimiento,
               ${semaforoSql("d.fechaVencimientoCalc")} AS semaforo,
               d.estatusValidacion AS estadoValidacion
        FROM sit_documentos d
        JOIN sit_articulo_proveedor ap ON ap.idArticuloProveedor = d.idArticuloProveedor AND ap.activo = 1
        JOIN sit_articulos a           ON a.idArticulo = ap.idArticulo
        JOIN sit_proveedores p         ON p.idProveedor = ap.idProveedor
        JOIN sit_tipos_documento t     ON t.idTipoDoc = d.idTipoDoc
        WHERE a.codigoArticulo = @codigo
          AND a.idPlanta = @idPlanta
          AND d.esVersionActiva = 1
        ORDER BY p.razonSocial, d.idTipoDoc
      `);

    // Documentos de la biblioteca de SharePoint de proveedores. Si SharePoint
    // falla, el detalle se muestra igual y la sección indica el error.
    let documentosSharePoint = null;
    try {
      documentosSharePoint = await spDocs.getDocumentosArticulo(articulo.codigoArticulo);
      // "También contiene" de cada archivo (con su página), para la ficha
      const contenidos = await _contenidosPorDoc();
      // Marcado en el SIT (con página) + lo que dice el nombre del archivo; lo marcado gana
      documentosSharePoint = documentosSharePoint.map((d) => {
        const marcados = contenidos.get(d.sharepointId) || [];
        const ids = new Set(marcados.map((c) => c.idTipoDoc));
        return { ...d, contenidos: [...marcados, ...(d.contenidosNombre || []).filter((c) => !ids.has(c.idTipoDoc))] };
      });
    } catch (err) {
      console.error("[sit.service] documentos SharePoint:", err.message);
    }

    // Proveedores del artículo en el ERP de su empresa
    let proveedoresErp = null;
    try {
      proveedoresErp = await getProveedoresArticuloErp(articulo.codigoArticulo, articulo.empresa);
    } catch (err) {
      console.error("[sit.service] proveedores ERP:", err.message);
    }

    // Requisitoriedad por proveedor contra los documentos de SharePoint
    let proveedores = [];
    try {
      proveedores = await _requisitoriedad(articulo, documentosSharePoint);
    } catch (err) {
      console.error("[sit.service] requisitoriedad:", err.message);
    }

    _ok(res, {
      ...articulo,
      documentos: docs.recordset,
      proveedores,
      proveedoresErp,
      documentosSharePoint,
      sharepointMock: spDocs.SHAREPOINT_MOCK,
    });
  } catch (err) {
    console.error("[sit.service] getArticuloDetalle:", err);
    _err(res, 502, "No se pudo consultar el artículo");
  }
}

/** POST /api/sit/articulos  Body: { codigoArticulo, descripcion, idPlanta, nombreComercial? } */
async function crearArticulo(req, res) {
  const codigo = String(req.body?.codigoArticulo || "").trim();
  const descripcion = String(req.body?.descripcion || "").trim();
  const nombreComercial = String(req.body?.nombreComercial || "").trim();
  const idPlanta = parseInt(req.body?.idPlanta);

  if (!codigo || codigo.length > 50) return _err(res, 400, "El código es obligatorio (máximo 50 caracteres)");
  if (!descripcion || descripcion.length > 300) return _err(res, 400, "La descripción es obligatoria (máximo 300 caracteres)");
  if (nombreComercial.length > 200) return _err(res, 400, "El nombre comercial admite hasta 200 caracteres");
  if (!PLANTAS[idPlanta]) return _err(res, 400, "Selecciona una planta válida");
  if (!req.sitPermiso.plantas.includes(idPlanta)) return _err(res, 403, "No tienes acceso a esa planta");

  try {
    const db = await getPool();
    const r = await db.request()
      .input("codigo",          sql.NVarChar(50),  codigo)
      .input("idPlanta",        sql.TinyInt,       idPlanta)
      .input("descripcion",     sql.NVarChar(300), descripcion)
      .input("nombreComercial", sql.NVarChar(200), nombreComercial || null)
      .input("login",           sql.VarChar(255),  req.user.login)
      .query(`
        INSERT INTO sit_articulos (codigoArticulo, idPlanta, descripcion, nombreComercial, loginAlta)
        OUTPUT INSERTED.idArticulo
        VALUES (@codigo, @idPlanta, @descripcion, @nombreComercial, @login)
      `);
    const idArticulo = r.recordset[0].idArticulo;
    await _auditar(req, "ADMIN_CHANGE", "sit_articulos", idArticulo, `Alta de artículo ${codigo} (${PLANTAS[idPlanta]})`);
    _ok(res, { idArticulo }, 201);
  } catch (err) {
    if (_esDuplicado(err)) return _err(res, 409, `Ya existe el artículo ${codigo} en ${PLANTAS[idPlanta]}`);
    console.error("[sit.service] crearArticulo:", err);
    _err(res, 500, "Error interno");
  }
}

/** PUT /api/sit/articulos/:id/inactivar */
async function inactivarArticulo(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("id",    sql.Int,          parseInt(req.params.id))
      .input("login", sql.VarChar(255), req.user.login)
      .query(`
        UPDATE sit_articulos SET
          activo = 0, fechaInactivacion = GETDATE(), loginInactivacion = @login
        OUTPUT INSERTED.codigoArticulo
        WHERE idArticulo = @id AND activo = 1 AND idPlanta IN (${_plantasSql(req)})
      `);
    if (!r.recordset.length) return _err(res, 404, "Artículo no encontrado o ya inactivo");
    await _auditar(req, "INACTIVATE_ART", "sit_articulos", parseInt(req.params.id), `Inactivación de ${r.recordset[0].codigoArticulo}`);
    _ok(res, null);
  } catch (err) {
    console.error("[sit.service] inactivarArticulo:", err);
    _err(res, 500, "Error interno");
  }
}

// ────────────────────────────────────────────────────────────
// PROVEEDORES
// ────────────────────────────────────────────────────────────

/** GET /api/sit/proveedores?busqueda=... */
async function getProveedores(req, res) {
  try {
    const db = await getPool();
    const request = db.request();
    let filtro = "";
    if (req.query.busqueda && String(req.query.busqueda).trim()) {
      request.input("q", sql.NVarChar(310), _like(String(req.query.busqueda).trim().slice(0, 100)));
      filtro = "AND (razonSocial LIKE @q OR rfc LIKE @q)";
    }
    const r = await request.query(`
      SELECT TOP 50 idProveedor, razonSocial, rfc, tipo, esFabricante
      FROM sit_proveedores
      WHERE activo = 1 ${filtro}
      ORDER BY razonSocial
    `);
    _ok(res, r.recordset);
  } catch (err) {
    console.error("[sit.service] getProveedores:", err);
    _err(res, 500, "Error interno");
  }
}

/** POST /api/sit/proveedores  Body: { razonSocial, rfc?, tipo, esFabricante } */
async function crearProveedor(req, res) {
  const razonSocial = String(req.body?.razonSocial || "").trim();
  const rfc = String(req.body?.rfc || "").trim().toUpperCase();
  const tipo = parseInt(req.body?.tipo) || 1;
  const esFabricante = !!req.body?.esFabricante;

  if (!razonSocial || razonSocial.length > 300) return _err(res, 400, "La razón social es obligatoria (máximo 300 caracteres)");
  if (rfc && !/^[A-ZÑ&0-9]{10,13}$/.test(rfc)) return _err(res, 400, "El RFC no tiene un formato válido");
  if (![1, 2].includes(tipo)) return _err(res, 400, "Tipo de proveedor inválido");

  try {
    const db = await getPool();
    const r = await db.request()
      .input("razonSocial",  sql.NVarChar(300), razonSocial)
      .input("rfc",          sql.NVarChar(20),  rfc || null)
      .input("tipo",         sql.TinyInt,       tipo)
      .input("esFabricante", sql.Bit,           esFabricante ? 1 : 0)
      .input("login",        sql.VarChar(255),  req.user.login)
      .query(`
        INSERT INTO sit_proveedores (razonSocial, rfc, tipo, esFabricante, loginAlta)
        OUTPUT INSERTED.idProveedor, INSERTED.razonSocial, INSERTED.rfc, INSERTED.tipo, INSERTED.esFabricante
        VALUES (@razonSocial, @rfc, @tipo, @esFabricante, @login)
      `);
    const prov = r.recordset[0];
    await _auditar(req, "ADMIN_CHANGE", "sit_proveedores", prov.idProveedor, `Alta de proveedor ${razonSocial}`);
    _ok(res, prov, 201);
  } catch (err) {
    if (_esDuplicado(err)) return _err(res, 409, `Ya existe un proveedor con el RFC ${rfc}`);
    console.error("[sit.service] crearProveedor:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sit/articulos/:codigoArticulo/proveedores?empresa=IAFSA */
async function getProveedoresArticulo(req, res) {
  try {
    const articulo = await _resolverArticulo(req, req.params.codigoArticulo, _empresaQuery(req));
    if (!articulo) return _err(res, 404, "Artículo no encontrado");
    if (!articulo.idArticulo) return _ok(res, []); // sin proveedores vinculados todavía

    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, articulo.idArticulo)
      .query(`
        SELECT ap.idArticuloProveedor, p.idProveedor, p.razonSocial, p.rfc, p.tipo, p.esFabricante,
               ISNULL(docs.totalDocs, 0) AS totalDocs, docs.semaforoMax
        FROM sit_articulo_proveedor ap
        JOIN sit_articulos a   ON a.idArticulo = ap.idArticulo
        JOIN sit_proveedores p ON p.idProveedor = ap.idProveedor
        OUTER APPLY (
          SELECT COUNT(*) AS totalDocs, MAX(s.semaforo) AS semaforoMax
          FROM sit_documentos d
          CROSS APPLY (SELECT ${semaforoSql("d.fechaVencimientoCalc")} AS semaforo) s
          WHERE d.idArticuloProveedor = ap.idArticuloProveedor AND d.esVersionActiva = 1
        ) docs
        WHERE ap.idArticulo = @id
          AND ap.activo = 1
          AND a.idPlanta IN (${_plantasSql(req)})
        ORDER BY p.tipo, p.razonSocial
      `);
    _ok(res, r.recordset);
  } catch (err) {
    console.error("[sit.service] getProveedoresArticulo:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * POST /api/sit/articulos/:codigoArticulo/proveedores  Body: { idProveedor, empresa }
 * El artículo viene del ERP; la primera vinculación crea su espejo en
 * sit_articulos (al que cuelgan proveedores y documentos). Al vincular se
 * dan de alta como requisitos todos los tipos de documento activos; la
 * administradora ajusta después cuáles aplican.
 */
async function vincularProveedor(req, res) {
  const idProveedor = parseInt(req.body?.idProveedor);
  if (!idProveedor) return _err(res, 400, "Selecciona un proveedor");

  let articulo;
  try {
    articulo = await _resolverArticulo(req, req.params.codigoArticulo, _empresaQuery(req));
  } catch (err) {
    console.error("[sit.service] vincularProveedor (ERP):", err);
    return _err(res, 502, "No se pudo consultar el artículo en el ERP");
  }
  if (!articulo) return _err(res, 404, "Artículo no encontrado");

  const db = await getPool();
  const transaction = new sql.Transaction(db);
  try {
    await transaction.begin();

    // Espejo del artículo del ERP (se crea una sola vez)
    const espejo = await transaction.request()
      .input("codigo",      sql.NVarChar(50),  articulo.codigoArticulo)
      .input("idPlanta",    sql.TinyInt,       articulo.idPlanta)
      .input("descripcion", sql.NVarChar(300), String(articulo.descripcion || articulo.codigoArticulo).slice(0, 300))
      .input("login",       sql.VarChar(255),  req.user.login)
      .query(`
        SELECT idArticulo, activo FROM sit_articulos WITH (UPDLOCK, HOLDLOCK)
        WHERE codigoArticulo = @codigo AND idPlanta = @idPlanta;

        IF @@ROWCOUNT = 0
          INSERT INTO sit_articulos (codigoArticulo, idPlanta, descripcion, loginAlta)
          OUTPUT INSERTED.idArticulo, INSERTED.activo
          VALUES (@codigo, @idPlanta, @descripcion, @login);
      `);
    const fila = espejo.recordsets.find((rs) => rs.length)?.[0];
    if (!fila?.activo) { await transaction.rollback(); return _err(res, 409, "El artículo está inactivo en SIT"); }
    const idArticulo = fila.idArticulo;

    const ok = await transaction.request()
      .input("idProveedor", sql.Int, idProveedor)
      .query(`SELECT COUNT(*) AS proveedor FROM sit_proveedores WHERE idProveedor = @idProveedor AND activo = 1`);
    if (!ok.recordset[0].proveedor) { await transaction.rollback(); return _err(res, 404, "Proveedor no encontrado"); }

    const existente = await transaction.request()
      .input("idArticulo",  sql.Int, idArticulo)
      .input("idProveedor", sql.Int, idProveedor)
      .query(`
        SELECT idArticuloProveedor, activo
        FROM sit_articulo_proveedor WITH (UPDLOCK, HOLDLOCK)
        WHERE idArticulo = @idArticulo AND idProveedor = @idProveedor
      `);

    let idArticuloProveedor;
    if (existente.recordset.length) {
      if (existente.recordset[0].activo) {
        await transaction.rollback();
        return _err(res, 409, "El proveedor ya está vinculado a este artículo");
      }
      idArticuloProveedor = existente.recordset[0].idArticuloProveedor;
      await transaction.request()
        .input("idAP", sql.Int, idArticuloProveedor)
        .query(`UPDATE sit_articulo_proveedor SET activo = 1 WHERE idArticuloProveedor = @idAP`);
    } else {
      const ins = await transaction.request()
        .input("idArticulo",  sql.Int,          idArticulo)
        .input("idProveedor", sql.Int,          idProveedor)
        .input("login",       sql.VarChar(255), req.user.login)
        .query(`
          INSERT INTO sit_articulo_proveedor (idArticulo, idProveedor, loginAlta)
          OUTPUT INSERTED.idArticuloProveedor
          VALUES (@idArticulo, @idProveedor, @login)
        `);
      idArticuloProveedor = ins.recordset[0].idArticuloProveedor;
    }

    await transaction.request()
      .input("idAP",  sql.Int,          idArticuloProveedor)
      .input("login", sql.VarChar(255), req.user.login)
      .query(`
        INSERT INTO sit_requisitos_par (idArticuloProveedor, idTipoDoc, loginAlta)
        SELECT @idAP, t.idTipoDoc, @login
        FROM sit_tipos_documento t
        WHERE t.activo = 1
          AND NOT EXISTS (SELECT 1 FROM sit_requisitos_par r
                          WHERE r.idArticuloProveedor = @idAP AND r.idTipoDoc = t.idTipoDoc)
      `);

    await transaction.commit();
    await _auditar(req, "ADMIN_CHANGE", "sit_articulo_proveedor", idArticuloProveedor,
      `Vinculación artículo ${articulo.codigoArticulo} (${articulo.empresa}) — proveedor ${idProveedor}`);
    _ok(res, { idArticuloProveedor }, 201);
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ya revertida */ }
    console.error("[sit.service] vincularProveedor:", err);
    _err(res, 500, "Error interno");
  }
}

// ────────────────────────────────────────────────────────────
// REQUISITOS POR PAR
// ────────────────────────────────────────────────────────────

/** GET /api/sit/articulo-proveedor/:id/requisitos — todos los tipos, con aplica 1/0 */
async function getRequisitos(req, res) {
  try {
    const db = await getPool();
    const par = await _parAccesible(db.request(), parseInt(req.params.id), req);
    if (!par) return _err(res, 404, "Proveedor del artículo no encontrado");

    const r = await db.request()
      .input("idAP", sql.Int, par.idArticuloProveedor)
      .query(`
        SELECT r.idRequisito, t.idTipoDoc AS idTipoDocumento, t.nombre AS tipoDocumento,
               t.reglasVigencia, t.diasVigencia,
               CAST(CASE WHEN r.activo = 1 THEN 1 ELSE 0 END AS BIT) AS aplica,
               r.esObligatorio, NULL AS observaciones
        FROM sit_tipos_documento t
        LEFT JOIN sit_requisitos_par r
          ON r.idTipoDoc = t.idTipoDoc AND r.idArticuloProveedor = @idAP
        WHERE t.activo = 1
        ORDER BY t.idTipoDoc
      `);
    _ok(res, r.recordset);
  } catch (err) {
    console.error("[sit.service] getRequisitos:", err);
    _err(res, 500, "Error interno");
  }
}

/** PUT /api/sit/articulo-proveedor/:id/requisitos  Body: { requisitos: [{ idTipoDocumento, aplica }] } */
async function setRequisitos(req, res) {
  const lista = req.body?.requisitos;
  if (!Array.isArray(lista) || !lista.length || lista.length > 100) return _err(res, 400, "Lista de requisitos inválida");

  const db = await getPool();
  const par = await _parAccesible(db.request(), parseInt(req.params.id), req);
  if (!par) return _err(res, 404, "Proveedor del artículo no encontrado");

  const transaction = new sql.Transaction(db);
  try {
    await transaction.begin();
    for (const item of lista) {
      const idTipo = parseInt(item?.idTipoDocumento);
      if (!idTipo) continue;
      await transaction.request()
        .input("idAP",   sql.Int,          par.idArticuloProveedor)
        .input("idTipo", sql.TinyInt,      idTipo)
        .input("activo", sql.Bit,          item.aplica ? 1 : 0)
        .input("login",  sql.VarChar(255), req.user.login)
        .query(`
          IF EXISTS (SELECT 1 FROM sit_tipos_documento WHERE idTipoDoc = @idTipo)
          BEGIN
            UPDATE sit_requisitos_par SET activo = @activo
            WHERE idArticuloProveedor = @idAP AND idTipoDoc = @idTipo;
            IF @@ROWCOUNT = 0 AND @activo = 1
              INSERT INTO sit_requisitos_par (idArticuloProveedor, idTipoDoc, loginAlta)
              VALUES (@idAP, @idTipo, @login);
          END
        `);
    }
    await transaction.commit();
    await _auditar(req, "ADMIN_CHANGE", "sit_requisitos_par", par.idArticuloProveedor, "Actualización de requisitos");
    _ok(res, null);
  } catch (err) {
    try { await transaction.rollback(); } catch { /* ya revertida */ }
    console.error("[sit.service] setRequisitos:", err);
    _err(res, 500, "Error interno");
  }
}

// ────────────────────────────────────────────────────────────
// DOCUMENTOS
// ────────────────────────────────────────────────────────────

/** GET /api/sit/articulo-proveedor/:id/documentos — versión vigente de cada tipo */
async function getDocumentos(req, res) {
  try {
    const db = await getPool();
    const par = await _parAccesible(db.request(), parseInt(req.params.id), req);
    if (!par) return _err(res, 404, "Proveedor del artículo no encontrado");

    const r = await db.request()
      .input("idAP", sql.Int, par.idArticuloProveedor)
      .query(`
        SELECT d.idDocumento, d.idTipoDoc AS idTipoDocumento, t.nombre AS tipoDocumento, t.reglasVigencia,
               d.version, d.nombreOriginal AS nombreArchivo, d.fechaEmision, d.fechaRecepcion,
               d.fechaVencimientoCalc AS fechaVencimiento,
               ${semaforoSql("d.fechaVencimientoCalc")} AS semaforo,
               DATEDIFF(day, ${HOY_SQL}, d.fechaVencimientoCalc) AS diasRestantes,
               d.estatusValidacion AS estadoValidacion, d.observacionesValidacion AS notasValidacion,
               COALESCE(uv.name, d.loginValidador) AS validadoPor, d.fechaValidacion,
               COALESCE(uc.name, d.loginCarga) AS cargadoPor, d.fechaCarga, d.observaciones
        FROM sit_documentos d
        JOIN sit_tipos_documento t ON t.idTipoDoc = d.idTipoDoc
        LEFT JOIN sec_users uc ON uc.login = d.loginCarga
        LEFT JOIN sec_users uv ON uv.login = d.loginValidador
        WHERE d.idArticuloProveedor = @idAP AND d.esVersionActiva = 1
        ORDER BY d.idTipoDoc
      `);
    _ok(res, r.recordset);
  } catch (err) {
    console.error("[sit.service] getDocumentos:", err);
    _err(res, 500, "Error interno");
  }
}

// ── SharePoint ──────────────────────────────────────────────

function _nombreSeguro(texto) {
  return String(texto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80) || "archivo";
}

async function _subirASharePoint(buffer, ruta) {
  const drive = SP_DRIVE();
  if (!drive || !SP_SITE()) throw Object.assign(new Error("SharePoint no configurado"), { configuracion: true });

  const token = await getAccessToken();
  const sesion = await fetch(
    `${GRAPH}/drives/${enc(drive)}/root:/${ruta.split("/").map(enc).join("/")}:/createUploadSession`,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename" } }),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!sesion.ok) throw Object.assign(new Error("Sesión de carga " + sesion.status), { spStatus: sesion.status });

  const { uploadUrl } = await sesion.json();
  if (!uploadUrl?.startsWith("https://")) throw new Error("Sesión de carga inválida");

  // La URL de sesión ya está autenticada: no se le manda el token de Graph
  const subida = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(buffer.length),
      "Content-Range": `bytes 0-${buffer.length - 1}/${buffer.length}`,
    },
    body: buffer,
    signal: AbortSignal.timeout(120000),
  });
  if (!subida.ok) {
    try { await fetch(uploadUrl, { method: "DELETE", signal: AbortSignal.timeout(5000) }); } catch { /* best effort */ }
    throw Object.assign(new Error("Carga " + subida.status), { spStatus: subida.status });
  }

  const item = await subida.json();
  if (!item?.id) throw new Error("SharePoint no devolvió el archivo");
  return { siteId: SP_SITE(), driveId: drive, itemId: item.id, webUrl: item.webUrl || null };
}

async function _borrarDeSharePoint(driveId, itemId) {
  try {
    const token = await getAccessToken();
    await fetch(`${GRAPH}/drives/${enc(driveId)}/items/${enc(itemId)}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    console.error("[sit.service] no se pudo borrar el archivo huérfano de SharePoint:", itemId, err.message);
  }
}

/**
 * POST /api/sit/documentos  (multipart/form-data)
 * Campos: archivo (PDF), idArticuloProveedor, idTipoDocumento,
 *         fechaEmision?, fechaVencimiento? (solo tipos con fecha explícita),
 *         observaciones?
 * Si el par ya tiene documento de ese tipo, la versión anterior pasa a
 * sit_versiones_historial y se reinicia la validación.
 */
async function cargarDocumento(req, res) {
  const file = req.file;
  const idAP = parseInt(req.body?.idArticuloProveedor);
  const idTipo = parseInt(req.body?.idTipoDocumento);
  const fechaEmision = String(req.body?.fechaEmision || "").trim() || null;
  const fechaVencimientoExp = String(req.body?.fechaVencimiento || "").trim() || null;
  const observaciones = String(req.body?.observaciones || "").trim();

  if (!file?.buffer?.length) return _err(res, 400, "Selecciona un archivo PDF");
  if (file.buffer.length > UPLOAD_MAX_BYTES) return _err(res, 413, "El archivo supera el límite de 20 MB");
  if (file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return _err(res, 400, "El archivo no es un PDF válido");
  if (!idAP || !idTipo) return _err(res, 400, "Faltan el proveedor del artículo o el tipo de documento");
  if (fechaEmision && !_esFecha(fechaEmision)) return _err(res, 400, "Fecha de emisión inválida");
  if (fechaVencimientoExp && !_esFecha(fechaVencimientoExp)) return _err(res, 400, "Fecha de vencimiento inválida");
  if (observaciones.length > 500) return _err(res, 400, "Las observaciones admiten hasta 500 caracteres");

  const db = await getPool();
  let subido = null;

  try {
    const par = await _parAccesible(db.request(), idAP, req);
    if (!par) return _err(res, 404, "Proveedor del artículo no encontrado");

    const tipoRes = await db.request()
      .input("idTipo", sql.TinyInt, idTipo)
      .query(`SELECT idTipoDoc, nombre, clave, reglasVigencia, diasVigencia FROM sit_tipos_documento WHERE idTipoDoc = @idTipo AND activo = 1`);
    const tipo = tipoRes.recordset[0];
    if (!tipo) return _err(res, 400, "Tipo de documento inválido");

    // Vigencia según la regla del tipo
    const hoy = _hoyMx();
    let vencimiento = null;
    if (tipo.reglasVigencia === 1) {
      if (!fechaVencimientoExp) return _err(res, 400, `${tipo.nombre} requiere la fecha de vencimiento del certificado`);
      vencimiento = fechaVencimientoExp;
    } else if (tipo.reglasVigencia === 2) {
      if (!fechaEmision) return _err(res, 400, `${tipo.nombre} requiere la fecha de emisión`);
      if (fechaEmision > hoy) return _err(res, 400, "La fecha de emisión no puede ser futura");
      vencimiento = _sumarDias(fechaEmision, tipo.diasVigencia);
    } else {
      vencimiento = _sumarDias(hoy, tipo.diasVigencia);
    }

    const nombreOriginal = decodeURIComponent(String(file.originalname || "documento.pdf")).normalize("NFC").slice(0, 255);
    const ruta = [
      SP_CARPETA(),
      PLANTAS[par.idPlanta],
      _nombreSeguro(par.codigoArticulo),
      `${idAP}_${_nombreSeguro(tipo.clave)}_${Date.now()}.pdf`,
    ].join("/");

    subido = await _subirASharePoint(file.buffer, ruta);
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");

    const transaction = new sql.Transaction(db);
    let idDocumento, reemplazo = false;
    try {
      await transaction.begin();

      const actual = await transaction.request()
        .input("idAP",   sql.Int,     idAP)
        .input("idTipo", sql.TinyInt, idTipo)
        .query(`
          SELECT idDocumento FROM sit_documentos WITH (UPDLOCK, HOLDLOCK)
          WHERE idArticuloProveedor = @idAP AND idTipoDoc = @idTipo AND esVersionActiva = 1
        `);

      const datos = (r) => r
        .input("siteId",        sql.NVarChar(200), subido.siteId)
        .input("driveId",       sql.NVarChar(200), subido.driveId)
        .input("itemId",        sql.NVarChar(200), subido.itemId)
        .input("webUrl",        sql.NVarChar(500), subido.webUrl)
        .input("nombre",        sql.NVarChar(255), nombreOriginal)
        .input("tamano",        sql.Int,           file.buffer.length)
        .input("hash",          sql.NVarChar(64),  hash)
        .input("emision",       sql.Date,          fechaEmision)
        .input("recepcion",     sql.Date,          hoy)
        .input("explicita",     sql.Date,          tipo.reglasVigencia === 1 ? vencimiento : null)
        .input("vencimiento",   sql.Date,          vencimiento)
        .input("semaforo",      sql.TinyInt,       _semaforoDe(vencimiento))
        .input("observaciones", sql.NVarChar(500), observaciones || null)
        .input("login",         sql.VarChar(255),  req.user.login);

      if (actual.recordset.length) {
        reemplazo = true;
        idDocumento = actual.recordset[0].idDocumento;

        await transaction.request()
          .input("id",    sql.Int,          idDocumento)
          .input("login", sql.VarChar(255), req.user.login)
          .query(`
            INSERT INTO sit_versiones_historial
              (idDocumento, versionNumero, spSiteId, spDriveId, spItemId, nombreOriginal, tamanoBytes,
               hashSHA256, fechaVencimientoCalc, semaforoEstado, fechaCarga, loginCarga,
               motivoReemplazo, loginReemplazo)
            SELECT idDocumento, version, spSiteId, spDriveId, spItemId, nombreOriginal, tamanoBytes,
                   hashSHA256, fechaVencimientoCalc, semaforoEstado, fechaCarga, loginCarga,
                   N'Reemplazado por una nueva versión', @login
            FROM sit_documentos WHERE idDocumento = @id
          `);

        await datos(transaction.request())
          .input("id", sql.Int, idDocumento)
          .query(`
            UPDATE sit_documentos SET
              version = version + 1,
              spSiteId = @siteId, spDriveId = @driveId, spItemId = @itemId, spWebUrl = @webUrl,
              nombreOriginal = @nombre, tamanoBytes = @tamano, hashSHA256 = @hash,
              fechaEmision = @emision, fechaRecepcion = @recepcion,
              fechaVigenciaExplicita = @explicita, fechaVencimientoCalc = @vencimiento,
              semaforoEstado = @semaforo,
              estatusValidacion = NULL, loginValidador = NULL, fechaValidacion = NULL,
              observacionesValidacion = NULL,
              observaciones = @observaciones,
              fechaCarga = GETDATE(), loginCarga = @login
            WHERE idDocumento = @id
          `);
      } else {
        const ins = await datos(transaction.request())
          .input("idAP",   sql.Int,     idAP)
          .input("idTipo", sql.TinyInt, idTipo)
          .query(`
            INSERT INTO sit_documentos
              (idArticuloProveedor, idTipoDoc, spSiteId, spDriveId, spItemId, spWebUrl,
               nombreOriginal, tamanoBytes, hashSHA256, fechaEmision, fechaRecepcion,
               fechaVigenciaExplicita, fechaVencimientoCalc, semaforoEstado, observaciones, loginCarga)
            OUTPUT INSERTED.idDocumento
            VALUES
              (@idAP, @idTipo, @siteId, @driveId, @itemId, @webUrl,
               @nombre, @tamano, @hash, @emision, @recepcion,
               @explicita, @vencimiento, @semaforo, @observaciones, @login)
          `);
        idDocumento = ins.recordset[0].idDocumento;
      }

      await transaction.commit();
    } catch (err) {
      try { await transaction.rollback(); } catch { /* ya revertida */ }
      throw err;
    }

    subido = null; // ya quedó registrado: no borrar
    await _auditar(req, reemplazo ? "REPLACE_DOC" : "UPLOAD", "sit_documentos", idDocumento,
      `${tipo.nombre} · ${par.codigoArticulo} · ${par.razonSocial} · ${nombreOriginal}`);
    _ok(res, { idDocumento, fechaVencimiento: vencimiento, reemplazo }, 201);
  } catch (err) {
    if (subido) await _borrarDeSharePoint(subido.driveId, subido.itemId);
    if (err.configuracion) return _err(res, 503, "El almacenamiento en SharePoint no está configurado para SIT");
    if (err.spStatus === 403) return _err(res, 502, "SharePoint rechazó la carga. Verifica los permisos de escritura de la aplicación.");
    if (err.spStatus) return _err(res, 502, "SharePoint no pudo completar la carga. Intenta nuevamente.");
    console.error("[sit.service] cargarDocumento:", err);
    _err(res, 500, "Error interno al cargar el documento");
  }
}

/**
 * GET /api/sit/documentos/:id/ver[?historial=idHistorial]
 * Sirve el PDF por streaming desde SharePoint (versión vigente o una del historial).
 */
// ── Entrega de archivos ─────────────────────────────────────
// Consultar, descargar e imprimir se autorizan por separado. El frontend
// pide un ticket (con su sesión) para UNA operación sobre UN documento; el
// endpoint del archivo vuelve a comprobar el permiso de esa operación con
// los permisos actuales de la BD (una revocación posterior al ticket gana).
const PERMISO_POR_MODO = { ver: "puedeConsultarDocs", descargar: "puedeDescargar", imprimir: "puedeImprimir" };
const ACCION_ARCHIVO = { ver: "VIEW_DOC", descargar: "DOWNLOAD_DOC", imprimir: "PRINT_DOC" };
const MENSAJE_SIN_PERMISO = {
  ver: "Tu rol no permite consultar documentos.",
  descargar: "Tu rol no permite descargar documentos.",
  imprimir: "Tu rol no permite imprimir documentos.",
};
const _recursoSp = (sharepointId) => `sp:${sharepointId}`;
const _recursoSit = (idDocumento, idHistorial) => `sit:${idDocumento}:${idHistorial || ""}`;

function _autorizarArchivo(req, res, recurso) {
  const modo = req.sitTicket?.modo;
  if (!PERMISO_POR_MODO[modo] || req.sitTicket.recurso !== recurso) {
    _err(res, 403, "El enlace no corresponde a este documento.");
    return null;
  }
  if (!req.sitPermiso[PERMISO_POR_MODO[modo]]) {
    _err(res, 403, MENSAJE_SIN_PERMISO[modo]);
    return null;
  }
  return modo;
}

/**
 * POST /api/sit/documentos/ticket
 * { tipo: 'sharepoint' | 'sit', id, historial?, modo: 'ver' | 'descargar' | 'imprimir' }
 * → { url } de un solo uso, válida 60 segundos.
 */
async function solicitarTicket(req, res) {
  const tipo = req.body?.tipo;
  const modo = req.body?.modo;
  if (!PERMISO_POR_MODO[modo]) return _err(res, 400, "Operación inválida");
  if (!req.sitPermiso[PERMISO_POR_MODO[modo]]) return _err(res, 403, MENSAJE_SIN_PERMISO[modo]);

  let recurso, ruta;
  if (tipo === "sharepoint") {
    const id = String(req.body?.id || "");
    if (!/^[A-Za-z0-9!._-]{1,200}$/.test(id)) return _err(res, 400, "Identificador de documento inválido");
    recurso = _recursoSp(id);
    ruta = `/sit/documentos/${encodeURIComponent(id)}/stream`;
  } else if (tipo === "sit") {
    const id = parseInt(req.body?.id);
    const historial = req.body?.historial ? parseInt(req.body.historial) : null;
    if (!id) return _err(res, 400, "Identificador de documento inválido");
    recurso = _recursoSit(id, historial);
    ruta = `/sit/documentos/${id}/ver${historial ? `?historial=${historial}` : ""}`;
  } else {
    return _err(res, 400, "Tipo de documento inválido");
  }

  // Abrir un PDF para consultarlo queda auditado al pedir el enlace: el
  // intento cuenta aunque el enlace expire sin que el PDF termine de verse.
  // (La entrega del archivo deja además VIEW_DOC / DOWNLOAD_DOC / PRINT_DOC.)
  if (modo === "ver") {
    const detalle = tipo === "sharepoint"
      ? `sharepointId ${req.body.id}`
      : `idDocumento ${parseInt(req.body.id)}${req.body?.historial ? ` · historial ${parseInt(req.body.historial)}` : ""}`;
    await _auditar(req, "VISUALIZAR", tipo === "sharepoint" ? "sharepoint" : "sit_documentos",
      tipo === "sharepoint" ? null : parseInt(req.body.id), detalle);
  }

  const ticket = emitirTicket({ login: req.user.login, recurso, modo });
  _ok(res, { ruta: `${ruta}${ruta.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket)}`, expiraEnSegundos: 60 });
}

async function verDocumento(req, res) {
  try {
    const db = await getPool();
    const idDocumento = parseInt(req.params.id);
    const idHistorial = req.query.historial ? parseInt(req.query.historial) : null;
    const modo = _autorizarArchivo(req, res, _recursoSit(idDocumento, idHistorial));
    if (!modo) return;

    const r = await db.request()
      .input("id",           sql.Int, idDocumento)
      .input("idHistorial",  sql.Int, idHistorial)
      .input("verInactivos", sql.Bit, req.sitPermiso.puedeVerInactivos ? 1 : 0)
      .query(`
        SELECT
          COALESCE(h.spDriveId, d.spDriveId)           AS spDriveId,
          COALESCE(h.spItemId, d.spItemId)             AS spItemId,
          COALESCE(h.nombreOriginal, d.nombreOriginal) AS nombreOriginal,
          CASE WHEN @idHistorial IS NOT NULL AND h.idHistorial IS NULL THEN 1 ELSE 0 END AS historialInvalido
        FROM sit_documentos d
        JOIN sit_articulo_proveedor ap ON ap.idArticuloProveedor = d.idArticuloProveedor AND ap.activo = 1
        JOIN sit_articulos a           ON a.idArticulo = ap.idArticulo
        LEFT JOIN sit_versiones_historial h ON h.idHistorial = @idHistorial AND h.idDocumento = d.idDocumento
        WHERE d.idDocumento = @id
          AND a.idPlanta IN (${_plantasSql(req)})
          AND (a.activo = 1 OR @verInactivos = 1)
      `);

    const doc = r.recordset[0];
    if (!doc || doc.historialInvalido) return _err(res, 404, "Documento no encontrado");

    const token = await getAccessToken();
    const archivo = await fetch(`${GRAPH}/drives/${enc(doc.spDriveId)}/items/${enc(doc.spItemId)}/content`, {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(60000),
    });
    if (!archivo.ok || !archivo.body) {
      return _err(res, archivo.status === 404 ? 404 : 502, "No se pudo obtener el documento de SharePoint");
    }

    await _auditar(req, ACCION_ARCHIVO[modo], "sit_documentos", idDocumento,
      idHistorial ? `Versión del historial ${idHistorial}` : null);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${modo === "descargar" ? "attachment" : "inline"}; filename*=UTF-8''${enc(doc.nombreOriginal)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const largo = archivo.headers.get("content-length");
    if (largo) res.setHeader("Content-Length", largo);

    Readable.fromWeb(archivo.body)
      .on("error", (err) => {
        console.error("[sit.service] verDocumento stream:", err.message);
        res.destroy(err);
      })
      .pipe(res);
  } catch (err) {
    console.error("[sit.service] verDocumento:", err);
    if (!res.headersSent) _err(res, 500, "Error interno");
  }
}

/**
 * GET /api/sit/documentos/:sharepointId/stream
 * PDF de un documento de la biblioteca de SharePoint de proveedores.
 * Los ids "mock-…" (SHAREPOINT_MOCK = true) devuelven un PDF de prueba.
 */
async function streamDocumentoSharePoint(req, res) {
  const id = String(req.params.sharepointId || "");
  if (!/^[A-Za-z0-9!._-]{1,200}$/.test(id)) return _err(res, 400, "Identificador de documento inválido");
  const modo = _autorizarArchivo(req, res, _recursoSp(id));
  if (!modo) return;
  const disposicion = modo === "descargar" ? "attachment" : "inline";

  try {
    if (spDocs.esMock(id)) {
      const pdf = spDocs.pdfDePrueba(id);
      await _auditar(req, ACCION_ARCHIVO[modo], "sharepoint", null, `Documento de prueba ${id}`);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `${disposicion}; filename="${id}.pdf"`);
      res.setHeader("Content-Length", pdf.length);
      res.setHeader("Cache-Control", "private, no-store");
      return res.end(pdf);
    }

    // Archivo real de la biblioteca de proveedores (Graph API)
    const archivo = await spDocs.abrirDocumento(id);
    await _auditar(req, ACCION_ARCHIVO[modo], "sharepoint", null, archivo.nombre);

    res.setHeader("Content-Type", archivo.tipo);
    res.setHeader("Content-Disposition", `${disposicion}; filename*=UTF-8''${enc(archivo.nombre)}`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (archivo.tamano) res.setHeader("Content-Length", archivo.tamano);

    Readable.fromWeb(archivo.body)
      .on("error", (err) => {
        console.error("[sit.service] streamDocumentoSharePoint stream:", err.message);
        res.destroy(err);
      })
      .pipe(res);
  } catch (err) {
    if (err.status === 404) return _err(res, 404, "Documento no encontrado");
    console.error("[sit.service] streamDocumentoSharePoint:", err);
    if (!res.headersSent) _err(res, 502, "No se pudo obtener el documento de SharePoint");
  }
}

/**
 * POST /api/sit/documentos/registrar-vencimiento
 * Body: { sharepointId, fechaVencimiento: 'YYYY-MM-DD' }
 * Guarda el vencimiento de un documento de SharePoint que no lo tiene por
 * regla (certificaciones con fecha explícita o tipos no reconocidos).
 * Tiene prioridad sobre la fecha calculada.
 */
/**
 * POST /api/sit/documentos/registrar-vencimiento   { sharepointId, ... }
 * PUT  /api/sit/documentos/sharepoint/:sharepointId/fecha
 * Body: { fechaVencimiento: 'YYYY-MM-DD'|null, esManual?: bool, noVence?: bool }
 *  - noVence: true  → se guarda sin fecha y el documento queda VERDE siempre
 *  - esManual: true → la fecha la tecleó el usuario; false → se tomó de la
 *    lectura automática del PDF. Por defecto true.
 */
async function registrarVencimiento(req, res) {
  const id = String(req.params.sharepointId || req.body?.sharepointId || "").trim();
  const noVence = req.body?.noVence === true;
  const esManual = req.body?.esManual !== false;
  const fecha = noVence ? null : String(req.body?.fechaVencimiento || "").trim();
  if (!/^[A-Za-z0-9!._-]{1,200}$/.test(id)) return _err(res, 400, "Identificador de documento inválido");
  if (!noVence && !_esFecha(fecha)) return _err(res, 400, "Fecha de vencimiento inválida");

  try {
    await spDocs.registrarVencimiento(id, { fechaVencimiento: fecha, esManual, noVence }, req.user.login);
    const detalle = noVence ? "No vence" : `Vencimiento ${fecha} (${esManual ? "manual" : "leída del PDF"})`;
    await _auditar(req, "ADMIN_CHANGE", "sit_documento_fecha", null, `${detalle} · ${id}`);
    _ok(res, { sharepointId: id, fechaVencimiento: fecha, esManual, noVence });
  } catch (err) {
    if (err.status === 404) return _err(res, 404, "Documento no encontrado");
    console.error("[sit.service] registrarVencimiento:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * PUT /api/sit/documentos/sharepoint/:sharepointId/validar
 * Body: { estadoValidacion: 1|2|3, notasValidacion }
 * Validación de Calidad de un documento de la biblioteca de SharePoint.
 */
async function validarDocumentoSharePoint(req, res) {
  const id = String(req.params.sharepointId || "");
  const estado = parseInt(req.body?.estadoValidacion);
  const notas = String(req.body?.notasValidacion || "").trim();
  if (!/^[A-Za-z0-9!._-]{1,200}$/.test(id)) return _err(res, 400, "Identificador de documento inválido");
  if (![1, 2, 3].includes(estado)) return _err(res, 400, "Selecciona el resultado de la validación");
  if (notas.length > 2000) return _err(res, 400, "Las notas admiten hasta 2,000 caracteres");
  if (estado !== 1 && !notas) return _err(res, 400, "Explica en las notas por qué el documento no está OK");

  try {
    await spDocs.validarDocumento(id, estado, notas, req.user.login);
    const etiqueta = { 1: "OK", 2: "Parcial", 3: "No corresponde" }[estado];
    await _auditar(req, "VALIDATE", "sharepoint", null, `${etiqueta} · ${id}${notas ? " · " + notas : ""}`);
    _ok(res, null);
    // Aviso interno a la Administradora SIT (sin correo) — DESACTIVADO hasta
    // configurar los permisos de usuarios reales. Para activarlo, descomentar
    // y correr la sección 3 de 20261016_sit_reunion_calidad.sql.
    // _notificarValidacion(req, id, etiqueta).catch((err) =>
    //   console.error("[sit.service] notificar validación:", err.message)
    // );
  } catch (err) {
    if (err.status === 404) return _err(res, 404, "Documento no encontrado");
    console.error("[sit.service] validarDocumentoSharePoint:", err);
    _err(res, 500, "Error interno");
  }
}

const PERFIL_ADMIN_SIT = "Administradora SIT";

/**
 * Notificación interna (Centro de Notificaciones, sin correo) a los usuarios
 * con perfil Administradora SIT cuando Calidad valida un documento:
 * "Calidad validó [tipo] de [artículo] - [proveedor]: [estado]".
 */
async function _notificarValidacion(req, sharepointId, etiqueta) {
  const biblioteca = await spDocs.getDocumentosBiblioteca();
  const doc = biblioteca.documentos.find((d) => d.sharepointId === sharepointId);
  const tipo = doc?.tipoOficial || doc?.tipoDocumento || "un documento";
  const articulo = doc?.codigoArticulo || "artículo";
  const proveedor = doc?.proveedor || "proveedor";

  const db = await getPool();
  const [destinos, tipoNotif] = await Promise.all([
    db.request()
      .input("perfil", sql.NVarChar(100), PERFIL_ADMIN_SIT)
      .input("login",  sql.VarChar(255),  req.user.login)
      .query(`
        SELECT DISTINCT u.login
        FROM sec_users u
        LEFT JOIN sit_usuario_permiso up ON up.login = u.login
        LEFT JOIN sit_area_permiso ap    ON UPPER(LTRIM(RTRIM(ap.area))) = UPPER(LTRIM(RTRIM(u.area)))
        JOIN sit_permisos_puestos p      ON p.idPermiso = COALESCE(up.idPermiso, ap.idPermiso) AND p.activo = 1
        WHERE p.puesto = @perfil AND u.active = 'Y' AND u.login <> @login
      `),
    db.request().query(`SELECT TOP 1 idTipo FROM cat_tipoNotificacion WHERE nombre = 'sit_validacion' AND activo = 1`),
  ]);
  const idTipo = tipoNotif.recordset[0]?.idTipo;
  if (!idTipo) return; // falta correr la migración 20261016_sit_reunion_calidad.sql

  const descripcion = `Calidad validó ${tipo} de ${articulo} - ${proveedor}: ${etiqueta}`.slice(0, 300);
  const urlDestino = doc ? rutaArticuloSit(doc) : "/sit";
  await Promise.all(
    destinos.recordset.map((d) =>
      crearNotificacion({
        loginDestino: d.login,
        loginOrigen: req.user.login,
        idTipo,
        titulo: "Validación de Calidad",
        descripcion,
        urlDestino,
      })
    )
  );
}

const rutaArticuloSit = (doc) =>
  `/sit/articulos/${encodeURIComponent(doc.codigoArticulo)}${doc.empresa ? `?empresa=${doc.empresa}` : ""}`;

/**
 * GET /api/sit/documentos/:sharepointId/extraer-fecha
 * Descarga el PDF de SharePoint y le pide a Claude la fecha de vencimiento
 * (o de emisión). No guarda nada: el usuario confirma la fecha en el modal.
 * { fecha: 'YYYY-MM-DD' | null, tipo, confianza, texto_original, fuente }
 */
async function extraerFechaDocumento(req, res) {
  const id = String(req.params.sharepointId || "");
  if (!/^[A-Za-z0-9!._-]{1,200}$/.test(id)) return _err(res, 400, "Identificador de documento inválido");

  try {
    const archivo = await spDocs.descargarDocumento(id);
    if (!/pdf/i.test(archivo.tipo) && archivo.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return _err(res, 400, "El documento no es un PDF; captura la fecha manualmente");
    }
    const resultado = await fechaIA.extraerFechaDePdf(archivo.buffer);
    await _auditar(req, "EXTRACT_DATE", "sharepoint", null,
      `${archivo.nombre} → ${resultado.fecha || "sin fecha"}${resultado.fecha ? ` (${resultado.tipo}, ${resultado.confianza})` : ""}`);
    _ok(res, resultado);
  } catch (err) {
    if (err.status === 404) return _err(res, 404, "Documento no encontrado");
    if (err.configuracion) return _err(res, 503, "La extracción automática no está configurada en el servidor");
    if (err.rechazo) return _err(res, 422, "No se pudo analizar el documento; captura la fecha manualmente");
    console.error("[sit.service] extraerFechaDocumento:", err.message);
    _err(res, 502, "No se pudo extraer la fecha del documento");
  }
}

/** GET /api/sit/documentos/:id/historial — versiones reemplazadas, la más reciente primero */
async function getHistorial(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("id",           sql.Int, parseInt(req.params.id))
      .input("verInactivos", sql.Bit, req.sitPermiso.puedeVerInactivos ? 1 : 0)
      .query(`
        SELECT h.idHistorial, h.versionNumero, h.nombreOriginal AS nombreArchivo,
               NULL AS fechaEmision, h.fechaVencimientoCalc AS fechaVencimiento,
               h.semaforoEstado AS semaforo, NULL AS estadoValidacion,
               COALESCE(uc.name, h.loginCarga) AS cargadoPor, h.fechaCarga,
               COALESCE(ur.name, h.loginReemplazo) AS reemplazadoPor, h.fechaReemplazo
        FROM sit_versiones_historial h
        JOIN sit_documentos d          ON d.idDocumento = h.idDocumento
        JOIN sit_articulo_proveedor ap ON ap.idArticuloProveedor = d.idArticuloProveedor
        JOIN sit_articulos a           ON a.idArticulo = ap.idArticulo
        LEFT JOIN sec_users uc ON uc.login = h.loginCarga
        LEFT JOIN sec_users ur ON ur.login = h.loginReemplazo
        WHERE h.idDocumento = @id
          AND a.idPlanta IN (${_plantasSql(req)})
          AND (a.activo = 1 OR @verInactivos = 1)
        ORDER BY h.versionNumero DESC
      `);
    _ok(res, r.recordset);
  } catch (err) {
    console.error("[sit.service] getHistorial:", err);
    _err(res, 500, "Error interno");
  }
}

/** PUT /api/sit/documentos/:id/validar  Body: { estadoValidacion: 1|2|3, notasValidacion } */
async function validarDocumento(req, res) {
  const estado = parseInt(req.body?.estadoValidacion);
  const notas = String(req.body?.notasValidacion || "").trim();
  if (![1, 2, 3].includes(estado)) return _err(res, 400, "Selecciona el resultado de la validación");
  if (notas.length > 2000) return _err(res, 400, "Las notas admiten hasta 2,000 caracteres");
  if (estado !== 1 && !notas) return _err(res, 400, "Explica en las notas por qué el documento no está OK");

  try {
    const db = await getPool();
    const r = await db.request()
      .input("id",     sql.Int,               parseInt(req.params.id))
      .input("estado", sql.TinyInt,           estado)
      .input("notas",  sql.NVarChar(sql.MAX), notas || null)
      .input("login",  sql.VarChar(255),      req.user.login)
      .query(`
        UPDATE d SET
          estatusValidacion = @estado,
          observacionesValidacion = @notas,
          loginValidador = @login,
          fechaValidacion = GETDATE()
        OUTPUT INSERTED.idDocumento
        FROM sit_documentos d
        JOIN sit_articulo_proveedor ap ON ap.idArticuloProveedor = d.idArticuloProveedor AND ap.activo = 1
        JOIN sit_articulos a           ON a.idArticulo = ap.idArticulo AND a.activo = 1
        WHERE d.idDocumento = @id
          AND d.esVersionActiva = 1
          AND a.idPlanta IN (${_plantasSql(req)})
      `);
    if (!r.recordset.length) return _err(res, 404, "Documento no encontrado");

    const etiqueta = { 1: "OK", 2: "Parcial", 3: "No corresponde" }[estado];
    await _auditar(req, "VALIDATE", "sit_documentos", parseInt(req.params.id), `${etiqueta}${notas ? " · " + notas : ""}`);
    _ok(res, null);
  } catch (err) {
    console.error("[sit.service] validarDocumento:", err);
    _err(res, 500, "Error interno");
  }
}

// ── "También contiene" ──────────────────────────────────────

/** El archivo del índice de la biblioteca (o null): así solo se aceptan documentos reales del SIT */
async function _docDeBiblioteca(sharepointId) {
  const biblioteca = await spDocs.getDocumentosBiblioteca();
  return biblioteca.documentos.find((d) => d.sharepointId === sharepointId) || null;
}
const _ID_SP = /^[A-Za-z0-9!._-]{1,200}$/;

/**
 * GET /api/sit/documentos/sharepoint/:sharepointId/sugerir-contenido
 * Claude lee el PDF y propone qué otros tipos de documento trae dentro y en
 * qué página. No guarda nada.
 */
async function sugerirContenidoDocumento(req, res) {
  const id = String(req.params.sharepointId || "");
  if (!_ID_SP.test(id)) return _err(res, 400, "Identificador de documento inválido");
  try {
    const doc = await _docDeBiblioteca(id);
    if (!doc) return _err(res, 404, "Documento no encontrado");
    const archivo = await spDocs.descargarDocumento(id);
    if (!/pdf/i.test(archivo.tipo) && archivo.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return _err(res, 400, "El documento no es un PDF; marca su contenido manualmente");
    }
    const db = await getPool();
    const tipos = (await db.request().query(`SELECT idTipoDoc, nombre FROM sit_tipos_documento ORDER BY nombre`)).recordset;
    const sugerencias = await contenidoIA.sugerirContenidos(archivo.buffer, { tipos, idTipoPropio: doc.idTipoDoc });
    await _auditar(req, "EXTRACT_CONTENT", "sharepoint", null,
      `${archivo.nombre} → ${sugerencias.length ? sugerencias.map((s) => s.nombre + (s.pagina ? ` p.${s.pagina}` : "")).join(", ") : "sin otros contenidos"}`);
    _ok(res, sugerencias);
  } catch (err) {
    if (err.status === 404) return _err(res, 404, "Documento no encontrado");
    if (err.configuracion) return _err(res, 503, "La lectura automática no está configurada en el servidor");
    if (err.rechazo) return _err(res, 422, "No se pudo analizar el documento; marca su contenido manualmente");
    console.error("[sit.service] sugerirContenidoDocumento:", err.message);
    _err(res, 502, "No se pudo leer el contenido del documento");
  }
}

/**
 * PUT /api/sit/documentos/sharepoint/:sharepointId/contenido
 * Body: { contenidos: [{ idTipoDoc, pagina|null, origen: 'MANUAL'|'IA' }] }
 * Reemplaza lo que el archivo "también contiene". Cuenta para el cumplimiento
 * (el caché de requisitoriedad se descarta).
 */
async function guardarContenidoDocumento(req, res) {
  const id = String(req.params.sharepointId || "");
  if (!_ID_SP.test(id)) return _err(res, 400, "Identificador de documento inválido");
  const lista = Array.isArray(req.body?.contenidos) ? req.body.contenidos : null;
  if (!lista || lista.length > 30) return _err(res, 400, "Lista de contenidos inválida");
  const limpios = [];
  const vistos = new Set();
  for (const c of lista) {
    const idTipoDoc = Number(c?.idTipoDoc);
    const pagina = c?.pagina === null || c?.pagina === "" || c?.pagina === undefined ? null : Number(c.pagina);
    if (!Number.isInteger(idTipoDoc) || idTipoDoc < 1 || idTipoDoc > 255) return _err(res, 400, "Tipo de documento inválido");
    if (pagina !== null && (!Number.isInteger(pagina) || pagina < 1 || pagina > 2000)) return _err(res, 400, "La página debe ser un número entre 1 y 2000");
    if (vistos.has(idTipoDoc)) continue;
    vistos.add(idTipoDoc);
    limpios.push({ idTipoDoc, pagina, origen: c?.origen === "IA" ? "IA" : "MANUAL" });
  }
  try {
    const doc = await _docDeBiblioteca(id);
    if (!doc) return _err(res, 404, "Documento no encontrado");
    if (limpios.some((c) => c.idTipoDoc === doc.idTipoDoc)) return _err(res, 400, "El documento ya es de ese tipo; no hace falta marcarlo como contenido");
    const db = await getPool();
    const nombres = new Map((await db.request().query(`SELECT idTipoDoc, nombre FROM sit_tipos_documento`)).recordset.map((t) => [t.idTipoDoc, t.nombre]));
    if (limpios.some((c) => !nombres.has(c.idTipoDoc))) return _err(res, 400, "Tipo de documento inválido");

    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      await new sql.Request(tx).input("id", sql.NVarChar(200), id).query(`DELETE FROM sit_documento_contenido WHERE sharepointId = @id`);
      for (const c of limpios) {
        await new sql.Request(tx)
          .input("id", sql.NVarChar(200), id)
          .input("tipo", sql.TinyInt, c.idTipoDoc)
          .input("pagina", sql.Int, c.pagina)
          .input("origen", sql.VarChar(10), c.origen)
          .input("login", sql.NVarChar(50), String(req.user.login).slice(0, 50))
          .query(`INSERT INTO sit_documento_contenido (sharepointId, idTipoDoc, pagina, origen, registradoPor)
                  VALUES (@id, @tipo, @pagina, @origen, @login)`);
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    }
    _cumplimiento = null; // el cumplimiento cambia: se recalcula en la siguiente consulta
    await _auditar(req, "ADMIN_CHANGE", "sit_documento_contenido", null,
      `${doc.nombreArchivo || id} · también contiene: ${limpios.length ? limpios.map((c) => nombres.get(c.idTipoDoc) + (c.pagina ? ` p.${c.pagina}` : "")).join(", ") : "nada"}`);
    _ok(res, limpios.map((c) => ({ ...c, nombre: nombres.get(c.idTipoDoc) })));
  } catch (err) {
    console.error("[sit.service] guardarContenidoDocumento:", err.message);
    _err(res, 500, "No se pudo guardar el contenido del documento");
  }
}

module.exports = {
  sugerirContenidoDocumento,
  guardarContenidoDocumento,
  UPLOAD_MAX_BYTES,
  solicitarTicket,
  getTiposDocumento,
  getDashboard,
  getArticulos,
  getArticuloDetalle,
  crearArticulo,
  inactivarArticulo,
  getProveedores,
  crearProveedor,
  getProveedoresArticulo,
  getProveedoresArticuloErp,
  vincularProveedor,
  getRequisitos,
  setRequisitos,
  getDocumentos,
  cargarDocumento,
  verDocumento,
  streamDocumentoSharePoint,
  registrarVencimiento,
  validarDocumentoSharePoint,
  extraerFechaDocumento,
  getCumplimientoTablero,
  getDashboardAdmin,
  getHistorial,
  validarDocumento,
};

// ════════════════════════════════════════════════════════════
// Consultas de solo lectura para Fabi (fabiTools.service.js)
// Mismas fuentes que el SIT: artículos del ERP, documentos de la biblioteca
// de SharePoint (con su semáforo) y proveedores del ERP. `plantas` son las
// plantas que permite el perfil SIT del usuario (resolverPermisoSit): nunca
// se consulta una planta fuera de esa lista. No se devuelven identificadores
// internos de SharePoint (sharepointId, drive, site, item) ni rutas de archivo:
// el enlace es a la ficha del artículo en el portal, donde el visor aplica los
// permisos de consulta, descarga e impresión.
// ════════════════════════════════════════════════════════════
const _fuentesPermitidas = (plantas) => ERP_ARTICULOS.filter((f) => (plantas || []).includes(f.idPlanta));
const _rutaArticuloPortal = (codigo, empresa) => `/sit/articulos/${encodeURIComponent(codigo)}?empresa=${empresa}`;
const _textoSemaforo = { VERDE: "Vigente", AMARILLO: "Por vencer", ROJO: "Vencido", SIN_FECHA: "Sin fecha registrada" };

async function fabiBuscarArticulos(plantas, termino) {
  const texto = String(termino || "").trim().slice(0, 80);
  if (texto.length < 2) return [];
  const listas = await Promise.all(_fuentesPermitidas(plantas).map((f) => _articulosErp(f, texto)));
  const q = texto.toLowerCase();
  return listas
    .flat()
    .sort((a, b) => {
      // Primero coincidencias exactas de código y al inicio de la descripción
      const peso = (x) => (String(x.codigoArticulo).toLowerCase() === q ? 0 : String(x.descripcion || "").toLowerCase().startsWith(q) ? 1 : 2);
      return peso(a) - peso(b) || ORDEN_EMPRESA[a.empresa] - ORDEN_EMPRESA[b.empresa];
    })
    .slice(0, 5)
    .map((a) => ({
      codigoArticulo: String(a.codigoArticulo).trim(),
      empresa: a.empresa,
      descripcion: _trim(a.descripcion),
      tipoMaterial: _trim(a.tipoMaterial),
      familia: _trim(a.familia),
      enlace: _rutaArticuloPortal(String(a.codigoArticulo).trim(), a.empresa),
    }));
}

async function fabiDetalleArticulo(plantas, codigoArticulo, empresa) {
  const codigo = String(codigoArticulo || "").trim().slice(0, 50);
  if (!codigo) return null;
  const fuentes = _fuentesPermitidas(plantas).filter((f) => !empresa || f.empresa === empresa);
  let articulo = null;
  for (const f of fuentes) {
    const r = await _articulosErp(f, null, codigo);
    if (r[0]) { articulo = r[0]; break; }
  }
  if (!articulo) return null;

  const [documentos, proveedores] = await Promise.all([
    spDocs.getDocumentosArticulo(codigo).catch(() => null),
    getProveedoresArticuloErp(codigo, articulo.empresa).catch(() => []),
  ]);
  // Requisitoriedad (matriz sit_ap_requisitos) contra los documentos de SharePoint
  let requisitoriedad = null;
  try {
    const req = await _requisitoriedad({ codigoArticulo: codigo, empresa: articulo.empresa }, documentos || []);
    requisitoriedad = {
      en_matriz: req.length > 0,
      proveedores: req.slice(0, 5).map((p) => ({
        proveedor: p.nombreProveedor,
        proveedorInactivo: p.proveedorInactivo,
        cumplimiento: `${p.cumplimiento.cumplidos} de ${p.cumplimiento.total} (${p.cumplimiento.porcentaje}%)`,
        requeridos: p.requisitos.map((r) => r.nombreTipo),
        faltantes: p.requisitos.filter((r) => !r.cumple).map((r) => r.nombreTipo),
      })),
    };
  } catch (err) {
    console.error("[sit.service] fabi requisitoriedad:", err.message);
  }
  return {
    codigoArticulo: codigo,
    empresa: articulo.empresa,
    descripcion: _trim(articulo.descripcion),
    tipoMaterial: _trim(articulo.tipoMaterial),
    familia: _trim(articulo.familia),
    enlace: _rutaArticuloPortal(codigo, articulo.empresa),
    proveedores: proveedores.slice(0, 5).map((p) => ({
      razonSocial: p.razonSocial,
      fabricante: p.nombreFabricante,
      contactoTecnico: _trim(p.contactoTecnico),
      emailTecnico: _trim(p.emailTecnico),
    })),
    documentos_disponibles: documentos !== null,
    documentos: (documentos || []).slice(0, 25).map((d) => ({
      tipoDocumento: d.tipoOficial || d.tipoDocumento || "Sin tipo reconocido",
      proveedor: d.proveedor,
      nombreArchivo: d.nombreArchivo,
      vence: d.fechaVencimiento || null,
      estado: d.origenFecha === "NO_VENCE" ? "No vence" : _textoSemaforo[d.semaforo] || "Sin fecha registrada",
    })),
    total_documentos: (documentos || []).length,
    requisitoriedad, // null = no se pudo consultar; en_matriz false = el artículo no tiene requisitos cargados
  };
}

async function fabiAlertasVencimiento(plantas) {
  const fuentes = _fuentesPermitidas(plantas);
  if (!fuentes.length) return { total: 0, documentos: [] };
  const [biblioteca, codigos] = await Promise.all([spDocs.getDocumentosBiblioteca(), _codigosPorEmpresa()]);
  const alertas = biblioteca.documentos
    .filter((d) => d.semaforo === "AMARILLO" || d.semaforo === "ROJO")
    .map((d) => ({ d, empresa: fuentes.find((f) => codigos[f.empresa]?.has(d.codigoArticulo))?.empresa }))
    .filter((x) => x.empresa)
    .sort((a, b) => String(a.d.fechaVencimiento).localeCompare(String(b.d.fechaVencimiento)));
  const top = alertas.slice(0, 10);
  // Descripción del artículo desde el ERP (máx. 10 consultas puntuales)
  const descripciones = new Map();
  await Promise.all(
    [...new Set(top.map((x) => `${x.empresa}|${x.d.codigoArticulo}`))].map(async (k) => {
      const [emp, cod] = k.split("|");
      const r = await _articulosErp(ERP_ARTICULOS.find((f) => f.empresa === emp), null, cod).catch(() => []);
      descripciones.set(k, _trim(r[0]?.descripcion));
    }),
  );
  return {
    total: alertas.length,
    vencidos: alertas.filter((x) => x.d.semaforo === "ROJO").length,
    por_vencer: alertas.filter((x) => x.d.semaforo === "AMARILLO").length,
    documentos: top.map(({ d, empresa }) => ({
      codigoArticulo: d.codigoArticulo,
      empresa,
      descripcion: descripciones.get(`${empresa}|${d.codigoArticulo}`) || null,
      tipoDocumento: d.tipoOficial || d.tipoDocumento,
      proveedor: d.proveedor,
      vence: d.fechaVencimiento,
      estado: _textoSemaforo[d.semaforo],
      enlace: _rutaArticuloPortal(d.codigoArticulo, empresa),
    })),
  };
}

module.exports.fabiBuscarArticulos = fabiBuscarArticulos;
module.exports.fabiDetalleArticulo = fabiDetalleArticulo;
module.exports.fabiAlertasVencimiento = fabiAlertasVencimiento;
