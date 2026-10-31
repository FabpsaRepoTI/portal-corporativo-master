// server/services/sgc.documentos.service.js
// Gestión Documental del SGC/SGI.
// SharePoint es el repositorio físico; este service actúa de intermediario.
// El usuario nunca ve URLs de SharePoint.
const multer = require("multer");
const { getPool, sql } = require("../db");
const SP = require("./sgc.sharepoint.service");
const { notificar } = require("./sgc.notificaciones.service");
const C = require("./sgcComun.service");

const DOC_TIPO = { 1: "Procedimiento", 2: "Instructivo", 3: "Formato", 4: "Registro", 5: "Manual" };
const DOC_ESTATUS = { 1: "Borrador", 2: "En revisión", 3: "Vigente", 4: "Obsoleto" };

const _upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 1 } });

function _fmt(d) {
  return {
    ...d,
    tipoLabel: DOC_TIPO[d.tipo] || null,
    estatusLabel: DOC_ESTATUS[d.idEstatus] || null,
    diasVencimiento: d.fechaVencimiento
      ? Math.ceil((new Date(d.fechaVencimiento) - new Date()) / 86400000)
      : null,
  };
}

// ── Verifica que las tablas del módulo existan ───────────────────────
// La tabla no desaparece una vez creada: basta confirmarlo una vez por proceso
let _tablaOk = false;
async function _tablaExiste(db) {
  if (_tablaOk) return true;
  const r = await db.request().query(`SELECT OBJECT_ID('sgc_documentos') AS id`);
  _tablaOk = r.recordset[0].id != null;
  return _tablaOk;
}

// Listado de carpetas de SharePoint en memoria 60 s (la consulta a SharePoint tarda 1–3 s).
// Cualquier cambio en documentos (subir, registrar, reemplazar) lo limpia.
const EXPLORADOR_MS = 60000;
const _cacheExplorador = new Map();
const limpiarCacheExplorador = () => _cacheExplorador.clear();
async function _listarCarpeta(carpeta) {
  const clave = carpeta || "";
  const c = _cacheExplorador.get(clave);
  if (c && Date.now() - c.t < EXPLORADOR_MS) return c.items;
  const items = await SP.listarArchivos(carpeta || null);
  _cacheExplorador.set(clave, { items, t: Date.now() });
  return items;
}

// ── GET /api/sgc/documentos ──────────────────────────────────────────
async function getDocumentos(req, res) {
  try {
    const { tipo, idEstatus, clausulaISO, proximoVencimiento } = req.query;
    const db = await getPool();
    if (!(await _tablaExiste(db))) {
      return res.json({ ok: true, data: [], aviso: "Módulo pendiente de inicializar — ejecuta el DDL sgc_documentos.sql" });
    }
    const r = db.request().input("idEmpresa", sql.Int, req.idEmpresa);

    let where = "WHERE d.idEmpresa = @idEmpresa";
    if (tipo) {
      const t = C._int(tipo);
      if (t) { r.input("tipo", sql.TinyInt, t); where += " AND d.tipo = @tipo"; }
    }
    if (idEstatus) {
      const e = C._int(idEstatus);
      if (e) { r.input("idEstatus", sql.TinyInt, e); where += " AND d.idEstatus = @idEstatus"; }
    }
    if (clausulaISO) {
      r.input("clausulaISO", sql.NVarChar(20), clausulaISO);
      where += " AND d.clausulaISO = @clausulaISO";
    }
    if (proximoVencimiento === "1") {
      where += " AND d.fechaVencimiento IS NOT NULL AND d.fechaVencimiento <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))";
    }

    const result = await r.query(`
      SELECT d.idDocumento, d.codigo, d.titulo, d.tipo, d.version, d.idEstatus,
             d.loginElabora, LTRIM(RTRIM(ue.name)) AS nombreElabora,
             d.loginRevisa,  LTRIM(RTRIM(ur.name)) AS nombreRevisa,
             d.loginAprueba, LTRIM(RTRIM(ua.name)) AS nombreAprueba,
             d.fechaVigencia, d.fechaVencimiento, d.clausulaISO,
             d.spItemId, d.spNombre, d.spCarpeta, d.spModificado,
             d.idNorma, d.fechaCreacion
      FROM sgc_documentos d
      LEFT JOIN sec_users ue ON ue.login = d.loginElabora
      LEFT JOIN sec_users ur ON ur.login = d.loginRevisa
      LEFT JOIN sec_users ua ON ua.login = d.loginAprueba
      ${where}
      ORDER BY d.fechaCreacion DESC, d.idDocumento DESC
    `);

    const docs = result.recordset.map(_fmt);

    // Marcar desactualizados en paralelo (sin bloquear si SP no responde)
    const checks = docs.map(async (doc) => {
      try {
        const meta = await SP.obtenerMetadatosItem(doc.spItemId);
        const spMod = meta.modificado ? new Date(meta.modificado) : null;
        const bdMod = doc.spModificado ? new Date(doc.spModificado) : null;
        if (spMod && bdMod && Math.abs(spMod - bdMod) > 5000) {
          doc.desactualizado = true;
          doc.spModificadoReal = meta.modificado;
        } else {
          doc.desactualizado = false;
        }
      } catch {
        doc.desactualizado = null; // SP no respondió
      }
      return doc;
    });

    const data = await Promise.all(checks);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data });
  } catch (err) {
    console.error("[sgc.documentos] getDocumentos:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── GET /api/sgc/documentos/explorador ──────────────────────────────
// Devuelve SOLO el nivel actual: subcarpetas + archivos de la carpeta solicitada.
// El árbol se navega nivel por nivel desde el frontend.
async function getExplorador(req, res) {
  try {
    const { carpeta } = req.query;
    const db = await getPool();
    const tablaOk = await _tablaExiste(db);

    const [spItems, bdResult] = await Promise.all([
      _listarCarpeta(carpeta),
      tablaOk
        ? db.request().input("idEmpresa", sql.Int, req.idEmpresa).query(`SELECT spItemId FROM sgc_documentos WHERE idEmpresa = @idEmpresa`)
        : Promise.resolve({ recordset: [] }),
    ]);

    const registrados = new Set(bdResult.recordset.map((r) => r.spItemId));

    // Subcarpetas del nivel actual (sin recursión)
    const subcarpetas = spItems
      .filter((i) => i.esCarpeta)
      .map((i) => ({
        id: i.id,
        nombre: i.nombre,
        ruta: carpeta ? `${carpeta}/${i.nombre}` : i.nombre,
      }));

    // Archivos (no carpetas) del nivel actual
    const archivos = spItems
      .filter((i) => !i.esCarpeta)
      // Sin webUrl: las URLs de SharePoint nunca llegan al navegador (todo pasa por el proxy)
      .map(({ webUrl, ...i }) => ({ ...i, registrado: registrados.has(i.id) }));

    res.set("Cache-Control", "no-store");
    res.json({ ok: true, data: { carpetaActual: carpeta || null, subcarpetas, archivos } });
  } catch (err) {
    console.error("[sgc.documentos] getExplorador:", err.response?.data || err.message);
    C._err(res, 500, "Error al conectar con SharePoint");
  }
}

// ── GET /api/sgc/documentos/vencimientos ─────────────────────────────
async function getVencimientos(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        SELECT d.idDocumento, d.codigo, d.titulo, d.tipo, d.version, d.idEstatus,
               d.fechaVencimiento,
               DATEDIFF(DAY, CAST(GETDATE() AS DATE), d.fechaVencimiento) AS diasRestantes,
               LTRIM(RTRIM(ue.name)) AS nombreElabora, d.loginElabora,
               LTRIM(RTRIM(ur.name)) AS nombreRevisa,  d.loginRevisa
        FROM sgc_documentos d
        LEFT JOIN sec_users ue ON ue.login = d.loginElabora
        LEFT JOIN sec_users ur ON ur.login = d.loginRevisa
        WHERE d.idEmpresa = @idEmpresa
          AND d.fechaVencimiento IS NOT NULL
          AND d.fechaVencimiento <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))
          AND d.idEstatus <> 4
        ORDER BY d.fechaVencimiento, d.idDocumento
      `);
    res.json({ ok: true, data: r.recordset.map(_fmt) });
  } catch (err) {
    console.error("[sgc.documentos] getVencimientos:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── GET /api/sgc/documentos/:id ──────────────────────────────────────
async function getDocumento(req, res) {
  try {
    const id = C._int(req.params.id);
    if (!id) return C._err(res, 400, "ID inválido");
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        SELECT d.idDocumento, d.codigo, d.titulo, d.tipo, d.version, d.idEstatus,
               d.loginElabora, LTRIM(RTRIM(ue.name)) AS nombreElabora,
               d.loginRevisa,  LTRIM(RTRIM(ur.name)) AS nombreRevisa,
               d.loginAprueba, LTRIM(RTRIM(ua.name)) AS nombreAprueba,
               d.fechaVigencia, d.fechaVencimiento, d.clausulaISO,
               d.spItemId, d.spNombre, d.spCarpeta, d.spModificado,
               d.idNorma, d.fechaCreacion
        FROM sgc_documentos d
        LEFT JOIN sec_users ue ON ue.login = d.loginElabora
        LEFT JOIN sec_users ur ON ur.login = d.loginRevisa
        LEFT JOIN sec_users ua ON ua.login = d.loginAprueba
        WHERE d.idDocumento = @id AND d.idEmpresa = @idEmpresa;

        SELECT v.idVersion, v.version, v.cambios, v.loginSube,
               LTRIM(RTRIM(u.name)) AS nombreSube, v.spVersionId, v.fechaRegistro
        FROM sgc_documentos_versiones v
        LEFT JOIN sec_users u ON u.login = v.loginSube
        WHERE v.idDocumento = @id
        ORDER BY v.fechaRegistro DESC;

        SELECT TOP 10 a.idAcceso, a.login, LTRIM(RTRIM(u.name)) AS nombre, a.fechaAcceso
        FROM sgc_documentos_accesos a
        LEFT JOIN sec_users u ON u.login = a.login
        WHERE a.idDocumento = @id
        ORDER BY a.fechaAcceso DESC;
      `);

    if (!r.recordsets[0].length) return C._err(res, 404, "Documento no encontrado");
    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      data: {
        ..._fmt(r.recordsets[0][0]),
        versiones: r.recordsets[1],
        accesos: r.recordsets[2],
      },
    });
  } catch (err) {
    console.error("[sgc.documentos] getDocumento:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── GET /api/sgc/documentos/:id/abrir  (inline) ──────────────────────
// ── GET /api/sgc/documentos/:id/descargar (attachment) ───────────────
async function _servirArchivo(req, res, disposicion) {
  try {
    const id = C._int(req.params.id);
    if (!id) return C._err(res, 400, "ID inválido");
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT spItemId, spNombre FROM sgc_documentos WHERE idDocumento = @id AND idEmpresa = @idEmpresa`);
    if (!r.recordset.length) return C._err(res, 404, "Documento no encontrado");

    const { spItemId, spNombre } = r.recordset[0];
    const spResp = await SP.descargarArchivo(spItemId);

    // Registrar acceso (no bloquea la descarga si falla)
    db.request()
      .input("id", sql.Int, id)
      .input("login", sql.VarChar(255), req.user.login)
      .query(`INSERT INTO sgc_documentos_accesos (idDocumento, login) VALUES (@id, @login)`)
      .catch(() => {});

    const ct = spResp.headers["content-type"] || "application/octet-stream";
    res.setHeader("Content-Type", ct);
    res.setHeader("Content-Disposition", `${disposicion}; filename="${encodeURIComponent(spNombre)}"`);
    spResp.data.pipe(res);
  } catch (err) {
    console.error("[sgc.documentos] servirArchivo:", err);
    if (!res.headersSent) C._err(res, 502, "Error al obtener el archivo desde el repositorio");
  }
}

const abrirDocumento    = (req, res) => _servirArchivo(req, res, "inline");
const descargarDocumento = (req, res) => _servirArchivo(req, res, "attachment");

// ── POST /api/sgc/documentos/registrar ───────────────────────────────
// Registra en BD un archivo que YA existe en SharePoint.
async function registrarDocumento(req, res) {
  try {
    const { spItemId, titulo, codigo, tipo, loginElabora, loginRevisa, loginAprueba,
            fechaVencimiento, clausulaISO, idNorma } = req.body;

    if (!spItemId || !titulo || !codigo || !tipo || !loginElabora)
      return C._err(res, 400, "Faltan campos obligatorios");

    const t = C._int(tipo);
    if (!t || t < 1 || t > 5) return C._err(res, 400, "Tipo inválido");

    // Obtener metadatos reales de SP
    let meta;
    try {
      meta = await SP.obtenerMetadatosItem(spItemId);
    } catch {
      return C._err(res, 502, "No se pudo obtener información del archivo en SharePoint");
    }

    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa",       sql.Int,          req.idEmpresa)
      .input("codigo",          sql.VarChar(30),   codigo.trim())
      .input("titulo",          sql.NVarChar(200), titulo.trim())
      .input("tipo",            sql.TinyInt,       t)
      .input("loginElabora",    sql.VarChar(255),  loginElabora)
      .input("loginRevisa",     sql.VarChar(255),  loginRevisa || null)
      .input("loginAprueba",    sql.VarChar(255),  loginAprueba || null)
      .input("fechaVencimiento",sql.Date,          fechaVencimiento ? new Date(fechaVencimiento) : null)
      .input("clausulaISO",     sql.NVarChar(20),  clausulaISO || null)
      .input("spItemId",        sql.VarChar(200),  meta.id)
      .input("spDriveId",       sql.VarChar(200),  meta.driveId)
      .input("spWebUrl",        sql.NVarChar(500), meta.webUrl)
      .input("spNombre",        sql.NVarChar(255), meta.nombre)
      .input("spCarpeta",       sql.NVarChar(500), meta.carpetaPath || null)
      .input("spModificado",    sql.DateTime,      meta.modificado ? new Date(meta.modificado) : null)
      .input("idNorma",         sql.TinyInt,       C._int(idNorma) || 1)
      .query(`
        INSERT INTO sgc_documentos
          (idEmpresa, codigo, titulo, tipo, loginElabora, loginRevisa, loginAprueba,
           fechaVencimiento, clausulaISO, spItemId, spDriveId, spWebUrl, spNombre,
           spCarpeta, spModificado, idNorma)
        OUTPUT INSERTED.idDocumento
        VALUES (@idEmpresa, @codigo, @titulo, @tipo, @loginElabora, @loginRevisa, @loginAprueba,
                @fechaVencimiento, @clausulaISO, @spItemId, @spDriveId, @spWebUrl, @spNombre,
                @spCarpeta, @spModificado, @idNorma)
      `);

    res.json({ ok: true, data: { idDocumento: r.recordset[0].idDocumento } });
  } catch (err) {
    if (err.number === 2627) return C._err(res, 409, "El código ya existe");
    console.error("[sgc.documentos] registrarDocumento:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── POST /api/sgc/documentos/subir-nuevo ─────────────────────────────
// multer memoryStorage — archivo viene en req.file
async function subirNuevo(req, res) {
  try {
    if (!req.file) return C._err(res, 400, "No se recibió archivo");
    const { titulo, codigo, tipo, carpeta, loginElabora, loginRevisa, loginAprueba,
            fechaVencimiento, clausulaISO, idNorma } = req.body;

    if (!titulo || !codigo || !tipo || !loginElabora)
      return C._err(res, 400, "Faltan campos obligatorios");

    const t = C._int(tipo);
    if (!t || t < 1 || t > 5) return C._err(res, 400, "Tipo inválido");

    let spItem;
    try {
      spItem = await SP.subirArchivoNuevo(
        carpeta || "SGC",
        req.file.originalname,
        req.file.buffer,
      );
    } catch (e) {
      console.error("[sgc.documentos] subirArchivoNuevo SP:", e.response?.data || e.message);
      return C._err(res, 502, "Error al subir el archivo a SharePoint");
    }

    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa",       sql.Int,          req.idEmpresa)
      .input("codigo",          sql.VarChar(30),   codigo.trim())
      .input("titulo",          sql.NVarChar(200), titulo.trim())
      .input("tipo",            sql.TinyInt,       t)
      .input("loginElabora",    sql.VarChar(255),  loginElabora)
      .input("loginRevisa",     sql.VarChar(255),  loginRevisa || null)
      .input("loginAprueba",    sql.VarChar(255),  loginAprueba || null)
      .input("fechaVencimiento",sql.Date,          fechaVencimiento ? new Date(fechaVencimiento) : null)
      .input("clausulaISO",     sql.NVarChar(20),  clausulaISO || null)
      .input("spItemId",        sql.VarChar(200),  spItem.id)
      .input("spDriveId",       sql.VarChar(200),  spItem.parentReference?.driveId || process.env.SP_DRIVE_ID)
      .input("spWebUrl",        sql.NVarChar(500), spItem.webUrl)
      .input("spNombre",        sql.NVarChar(255), spItem.name)
      .input("spCarpeta",       sql.NVarChar(500), carpeta || "SGC")
      .input("spModificado",    sql.DateTime,      spItem.lastModifiedDateTime ? new Date(spItem.lastModifiedDateTime) : null)
      .input("idNorma",         sql.TinyInt,       C._int(idNorma) || 1)
      .query(`
        INSERT INTO sgc_documentos
          (idEmpresa, codigo, titulo, tipo, loginElabora, loginRevisa, loginAprueba,
           fechaVencimiento, clausulaISO, spItemId, spDriveId, spWebUrl, spNombre,
           spCarpeta, spModificado, idNorma)
        OUTPUT INSERTED.idDocumento
        VALUES (@idEmpresa, @codigo, @titulo, @tipo, @loginElabora, @loginRevisa, @loginAprueba,
                @fechaVencimiento, @clausulaISO, @spItemId, @spDriveId, @spWebUrl, @spNombre,
                @spCarpeta, @spModificado, @idNorma)
      `);

    res.json({ ok: true, data: { idDocumento: r.recordset[0].idDocumento } });
  } catch (err) {
    if (err.number === 2627) return C._err(res, 409, "El código ya existe");
    console.error("[sgc.documentos] subirNuevo:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── POST /api/sgc/documentos/:id/nueva-version ──────────────────────
async function nuevaVersion(req, res) {
  try {
    if (!req.file) return C._err(res, 400, "No se recibió archivo");
    const id = C._int(req.params.id);
    if (!id) return C._err(res, 400, "ID inválido");
    const { version, cambios } = req.body;
    if (!version) return C._err(res, 400, "La versión es obligatoria");

    const db = await getPool();
    const existing = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT spItemId FROM sgc_documentos WHERE idDocumento = @id AND idEmpresa = @idEmpresa`);
    if (!existing.recordset.length) return C._err(res, 404, "Documento no encontrado");

    const { spItemId } = existing.recordset[0];

    let spItem;
    try {
      spItem = await SP.subirArchivo(spItemId, req.file.buffer, req.file.originalname);
    } catch (e) {
      console.error("[sgc.documentos] subirArchivo SP:", e.response?.data || e.message);
      return C._err(res, 502, "Error al subir la versión a SharePoint");
    }

    // Obtener versiones para conseguir el spVersionId más reciente
    let spVersionId = "latest";
    try {
      const vers = await SP.obtenerVersiones(spItemId);
      if (vers.length) spVersionId = vers[0].id;
    } catch { /* no crítico */ }

    await db.request()
      .input("id",          sql.Int,          id)
      .input("version",     sql.VarChar(10),  version.trim())
      .input("cambios",     sql.NVarChar(sql.MAX), cambios || null)
      .input("login",       sql.VarChar(255), req.user.login)
      .input("spVersionId", sql.VarChar(200), spVersionId)
      .input("spWebUrl",    sql.NVarChar(500),spItem.webUrl || "")
      .input("spMod",       sql.DateTime,     spItem.lastModifiedDateTime ? new Date(spItem.lastModifiedDateTime) : null)
      .query(`
        INSERT INTO sgc_documentos_versiones (idDocumento, version, cambios, loginSube, spVersionId, spWebUrl)
        VALUES (@id, @version, @cambios, @login, @spVersionId, @spWebUrl);
        UPDATE sgc_documentos SET version = @version, spModificado = @spMod WHERE idDocumento = @id;
      `);

    res.json({ ok: true });
  } catch (err) {
    console.error("[sgc.documentos] nuevaVersion:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── PUT /api/sgc/documentos/:id/estatus ──────────────────────────────
async function cambiarEstatus(req, res) {
  try {
    const id = C._int(req.params.id);
    const idEstatus = C._int(req.body.idEstatus);
    if (!id || !idEstatus || idEstatus < 1 || idEstatus > 4)
      return C._err(res, 400, "Datos inválidos");

    // Solo Coordinador (rol 1) puede aprobar (idEstatus=3)
    if (idEstatus === 3 && req.sgcRol !== 1)
      return C._err(res, 403, "Solo el Coordinador SGI puede aprobar documentos");

    const db = await getPool();
    const existe = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT idDocumento FROM sgc_documentos WHERE idDocumento = @id AND idEmpresa = @idEmpresa`);
    if (!existe.recordset.length) return C._err(res, 404, "Documento no encontrado");

    await db.request()
      .input("id",         sql.Int,     id)
      .input("idEstatus",  sql.TinyInt, idEstatus)
      .input("hoy",        sql.Date,    new Date())
      .query(`
        UPDATE sgc_documentos
        SET idEstatus = @idEstatus,
            fechaVigencia = CASE WHEN @idEstatus = 3 THEN @hoy ELSE fechaVigencia END
        WHERE idDocumento = @id
      `);

    res.json({ ok: true });
  } catch (err) {
    console.error("[sgc.documentos] cambiarEstatus:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── PUT /api/sgc/documentos/:id ───────────────────────────────────────
async function actualizarDocumento(req, res) {
  try {
    const id = C._int(req.params.id);
    if (!id) return C._err(res, 400, "ID inválido");
    const { titulo, tipo, loginRevisa, loginAprueba, fechaVencimiento, clausulaISO } = req.body;

    const db = await getPool();
    const existe = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT idDocumento FROM sgc_documentos WHERE idDocumento = @id AND idEmpresa = @idEmpresa`);
    if (!existe.recordset.length) return C._err(res, 404, "Documento no encontrado");

    await db.request()
      .input("id",              sql.Int,          id)
      .input("titulo",          sql.NVarChar(200), titulo ? titulo.trim() : null)
      .input("tipo",            sql.TinyInt,       tipo ? C._int(tipo) : null)
      .input("loginRevisa",     sql.VarChar(255),  loginRevisa || null)
      .input("loginAprueba",    sql.VarChar(255),  loginAprueba || null)
      .input("fechaVencimiento",sql.Date,          fechaVencimiento ? new Date(fechaVencimiento) : null)
      .input("clausulaISO",     sql.NVarChar(20),  clausulaISO || null)
      .query(`
        UPDATE sgc_documentos SET
          titulo          = COALESCE(@titulo, titulo),
          tipo            = COALESCE(@tipo, tipo),
          loginRevisa     = @loginRevisa,
          loginAprueba    = @loginAprueba,
          fechaVencimiento= @fechaVencimiento,
          clausulaISO     = @clausulaISO
        WHERE idDocumento = @id
      `);

    res.json({ ok: true });
  } catch (err) {
    console.error("[sgc.documentos] actualizarDocumento:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── GET /api/sgc/documentos/:id/stream  (igual que /abrir — inline) ──
const streamDocumento = (req, res) => _servirArchivo(req, res, "inline");

// ── GET /api/sgc/documentos/:id/office-url ───────────────────────────
// Devuelve { url } con la URL de Office Online Viewer para el documento.
// El SP webUrl se construye en el backend; nunca queda en el frontend.
async function getOfficeUrl(req, res) {
  const id = C._int(req.params.id);
  if (!id) return C._err(res, 400, "ID inválido");
  try {
    const db = await getPool();
    if (!(await _tablaExiste(db))) return C._err(res, 404, "Módulo no inicializado");
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT spItemId, spWebUrl, spNombre FROM sgc_documentos WHERE idDocumento = @id AND idEmpresa = @idEmpresa`);
    if (!r.recordset.length) return C._err(res, 404, "Documento no encontrado");
    const doc = r.recordset[0];
    if (!doc.spWebUrl) return C._err(res, 400, "Este documento no tiene URL de SharePoint registrada");
    const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(doc.spWebUrl)}`;
    res.json({ ok: true, data: { url: viewerUrl } });
  } catch (err) {
    console.error("[sgc.documentos] getOfficeUrl:", err);
    C._err(res, 500, "Error interno");
  }
}

// ── Archivos de la biblioteca sin registrar (por id de SharePoint) ────
const _spId = (v) => (/^[A-Za-z0-9!_-]{8,120}$/.test(String(v || "")) ? String(v) : null);

// GET /api/sgc/documentos/sp/:itemId/preview → { url } incrustable
async function previewSP(req, res) {
  const itemId = _spId(req.params.itemId);
  if (!itemId) return C._err(res, 400, "ID inválido");
  try {
    const url = await SP.vistaPrevia(itemId);
    if (!url) return C._err(res, 422, "Este tipo de archivo no tiene vista previa. Descárgalo para abrirlo.");
    res.json({ ok: true, data: { url } });
  } catch (err) {
    console.error("[sgc.documentos] previewSP:", err.response?.status, err.message);
    C._err(res, err.response?.status === 404 ? 404 : 502, err.response?.status === 404 ? "Archivo no encontrado" : "No se pudo generar la vista previa");
  }
}

const TIPOS = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  txt: "text/plain; charset=utf-8",
};

// Proxy del archivo de SharePoint: inline (ver) o attachment (descargar).
// Si el archivo está registrado en el SGI, el acceso queda en sgc_documentos_accesos.
async function _servirSP(req, res, disposicion) {
  const itemId = _spId(req.params.itemId);
  if (!itemId) return C._err(res, 400, "ID inválido");
  try {
    const nombre = await SP.nombreItem(itemId);
    if (!nombre) return C._err(res, 404, "Archivo no encontrado");
    const spResp = await SP.descargarArchivo(itemId);
    const ext = (nombre.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
    res.setHeader("Content-Type", TIPOS[ext] || spResp.headers["content-type"] || "application/octet-stream");
    res.setHeader("Content-Disposition", `${disposicion}; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    res.setHeader("Cache-Control", "private, no-store");
    spResp.data.pipe(res);

    getPool()
      .then((db) => db.request()
        .input("spItemId", sql.NVarChar(200), itemId)
        .input("idEmpresa", sql.Int, req.idEmpresa)
        .input("login", sql.VarChar(255), req.user.login)
        .query(`INSERT INTO sgc_documentos_accesos (idDocumento, login)
                SELECT idDocumento, @login FROM sgc_documentos WHERE spItemId = @spItemId AND idEmpresa = @idEmpresa`))
      .catch(() => {});
  } catch (err) {
    console.error("[sgc.documentos] servirSP:", err.response?.status, err.message);
    if (!res.headersSent) C._err(res, err.response?.status === 404 ? 404 : 502, err.response?.status === 404 ? "Archivo no encontrado" : "Error al obtener el archivo desde el repositorio");
  }
}

// GET /api/sgc/documentos/sp/:itemId/descargar  y  /download/:itemId → attachment
const descargarSP = (req, res) => _servirSP(req, res, "attachment");
// GET /api/sgc/documentos/preview/:itemId → inline (el navegador lo muestra si puede)
const verSP = (req, res) => _servirSP(req, res, "inline");

// ── POST /api/sgc/documentos/:id/reemplazar (multer) ─────────────────
// Sube una nueva versión del archivo a SP y registra en sgc_documentos_versiones.
async function reemplazarDocumento(req, res) {
  const id = C._int(req.params.id);
  if (!id) return C._err(res, 400, "ID inválido");
  if (!req.file) return C._err(res, 400, "No se recibió archivo");
  const { version, cambios } = req.body;
  if (!version || !String(version).trim()) return C._err(res, 400, "La versión es obligatoria");
  try {
    const db = await getPool();
    if (!(await _tablaExiste(db))) return C._err(res, 404, "Módulo no inicializado");
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT spItemId, spNombre FROM sgc_documentos WHERE idDocumento = @id AND idEmpresa = @idEmpresa`);
    if (!r.recordset.length) return C._err(res, 404, "Documento no encontrado");
    const doc = r.recordset[0];

    // Subir a SP (sobreescribe el ítem existente)
    await SP.subirArchivo(doc.spItemId, req.file.buffer, req.file.originalname || doc.spNombre);

    // Obtener metadatos actualizados de SP para guardar spVersionId si hay versiones
    let spVersionId = null;
    try {
      const vers = await SP.obtenerVersiones(doc.spItemId);
      if (vers && vers.length) spVersionId = String(vers[0].id);
    } catch { /* ignorar si la lista de versiones falla */ }

    // Registrar en sgc_documentos_versiones
    await db.request()
      .input("idDocumento", sql.Int, id)
      .input("version", sql.NVarChar(20), String(version).trim())
      .input("cambios", sql.NVarChar(sql.MAX), cambios ? String(cambios).trim() : null)
      .input("loginSube", sql.VarChar(255), req.user.login)
      .input("spVersionId", sql.VarChar(100), spVersionId)
      .query(`INSERT INTO sgc_documentos_versiones (idDocumento, version, cambios, loginSube, spVersionId, fechaRegistro)
              VALUES (@idDocumento, @version, @cambios, @loginSube, @spVersionId, GETDATE())`);

    // Actualizar versión actual en sgc_documentos
    await db.request()
      .input("id", sql.Int, id)
      .input("version", sql.NVarChar(20), String(version).trim())
      .query(`UPDATE sgc_documentos SET version = @version WHERE idDocumento = @id`);

    res.json({ ok: true, data: { idDocumento: id, version: String(version).trim() } });
  } catch (err) {
    console.error("[sgc.documentos] reemplazarDocumento:", err);
    C._err(res, 500, "Error interno");
  }
}

module.exports = {
  limpiarCacheExplorador,
  _upload,
  getDocumentos,
  getExplorador,
  getVencimientos,
  getDocumento,
  abrirDocumento,
  streamDocumento,
  descargarDocumento,
  getOfficeUrl,
  previewSP,
  descargarSP,
  verSP,
  reemplazarDocumento,
  registrarDocumento,
  subirNuevo,
  nuevaVersion,
  cambiarEstatus,
  actualizarDocumento,
};
