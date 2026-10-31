// server/services/sgcArchivos.service.js
// Evidencias del SGC/SGI (sgc_archivos: entidad 'NC' | 'AC' | 'AUD' + idEntidad).
// Los archivos se guardan en server/uploads/sgc/<ENTIDAD>/ con nombre
// aleatorio y NO se sirven como estáticos (index.js bloquea /uploads/sgc):
// se descargan por GET /api/sgc/archivos/:idArchivo, que valida el acceso.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { getPool, sql } = require("../db");
const { _err, _int, _mismo } = require("./sgcComun.service");

const BASE = path.join(__dirname, "..", "uploads", "sgc");
const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".pdf": ["application/pdf"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", "application/zip"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream", "application/zip"],
};
const ENTIDADES = ["NC", "AC", "AUD"];

// multer entrega el nombre original en latin1
const _nombreOriginal = (f) => Buffer.from(f.originalname, "latin1").toString("utf8").slice(0, 255);

const _storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(BASE, req.sgcArchivoEntidad);
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename(req, file, cb) {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const _upload = multer({
  storage: _storage,
  limits: { fileSize: MAX_BYTES, files: 1, fields: 5 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, !!TIPOS[ext] && TIPOS[ext].includes(file.mimetype));
  },
}).single("archivo");

// ── Permisos por entidad ────────────────────────────────────
/** { existe, ver, editar } del usuario sobre la entidad. */
async function permisoEntidad(req, entidad, idEntidad) {
  const db = await getPool();
  const request = db.request().input("id", sql.Int, idEntidad).input("idEmpresa", sql.Int, req.idEmpresa);
  let fila;
  if (entidad === "NC") {
    fila = (await request.query(
      "SELECT loginResponsable AS l1, NULL AS l2 FROM sgc_no_conformidades WHERE idNC = @id AND idEmpresa = @idEmpresa",
    )).recordset[0];
  } else if (entidad === "AC") {
    fila = (await request.query(`
      SELECT ac.loginResponsable AS l1, nc.loginResponsable AS l2
      FROM sgc_acciones_correctivas ac LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      WHERE ac.idAC = @id AND ac.idEmpresa = @idEmpresa
    `)).recordset[0];
  } else {
    fila = (await request.query("SELECT NULL AS l1, NULL AS l2 FROM sgc_auditorias WHERE idAuditoria = @id AND idEmpresa = @idEmpresa")).recordset[0];
  }
  if (!fila) return { existe: false, ver: false, editar: false };

  const rol = req.sgcRol;
  const esSuyo = _mismo(fila.l1, req.login) || _mismo(fila.l2, req.login);
  const ver = entidad === "AUD" || rol !== 3 || esSuyo;
  const editar = entidad === "AUD" ? [1, 2].includes(rol) : rol !== 4 && ver;
  return { existe: true, ver, editar };
}

/** Archivos de una entidad (para los detalles). */
async function listarArchivos(entidad, idEntidad, executor) {
  const request = executor || (await getPool()).request();
  const r = await request
    .input("entidadArch", sql.VarChar(10), entidad)
    .input("idEntidadArch", sql.Int, idEntidad)
    .query(`
      SELECT a.idArchivo, a.nombreOriginal, a.mimeType, a.login, LTRIM(RTRIM(u.name)) AS nombre, a.fechaSubida
      FROM sgc_archivos a
      LEFT JOIN sec_users u ON u.login = a.login
      WHERE a.entidad = @entidadArch AND a.idEntidad = @idEntidadArch
      ORDER BY a.fechaSubida DESC
    `);
  return r.recordset;
}

/**
 * Middleware de subida para POST /…/:id/archivo. Valida el acceso ANTES
 * de escribir a disco y luego deja el archivo en req.file.
 */
const subirArchivo = (entidad) => async (req, res, next) => {
  const id = _int(req.params.id);
  if (!id) return _err(res, 400, "Registro inválido");
  try {
    const p = await permisoEntidad(req, entidad, id);
    if (!p.existe) return _err(res, 404, "Registro no encontrado");
    if (!p.editar) return _err(res, 403, "Sin permisos para adjuntar evidencia en este registro.");
  } catch (err) {
    console.error("[sgcArchivos.service] permiso:", err);
    return _err(res, 500, "Error interno");
  }
  req.sgcArchivoEntidad = entidad;
  _upload(req, res, (error) => {
    if (error) {
      const tamano = error.code === "LIMIT_FILE_SIZE";
      return _err(res, tamano ? 413 : 400, tamano ? "El archivo supera el límite de 10 MB." : "No se pudo recibir el archivo.");
    }
    if (!req.file) return _err(res, 400, "Selecciona un archivo JPG, PNG, PDF, XLSX o DOCX de hasta 10 MB.");
    next();
  });
};

/** Registra en BD el archivo ya escrito por subirArchivo. */
const registrarArchivo = (entidad) => async (req, res) => {
  const id = _int(req.params.id);
  const rel = path.posix.join(entidad, req.file.filename);
  try {
    const db = await getPool();
    const r = await db.request()
      .input("entidad", sql.VarChar(10), entidad)
      .input("idEntidad", sql.Int, id)
      .input("nombre", sql.NVarChar(255), _nombreOriginal(req.file))
      .input("ruta", sql.NVarChar(500), rel)
      .input("mime", sql.NVarChar(100), req.file.mimetype)
      .input("login", sql.VarChar(255), req.login)
      .query(`
        INSERT INTO sgc_archivos (entidad, idEntidad, nombreOriginal, rutaServidor, mimeType, login)
        OUTPUT INSERTED.idArchivo, INSERTED.nombreOriginal, INSERTED.mimeType, INSERTED.login, INSERTED.fechaSubida
        VALUES (@entidad, @idEntidad, @nombre, @ruta, @mime, @login)
      `);
    res.status(201).json({ ok: true, data: { ...r.recordset[0], nombre: req.sgcUser?.nombre } });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error("[sgcArchivos.service] registrar:", err);
    _err(res, 500, "Error interno");
  }
};

/** DELETE /…/:id/archivo/:idArchivo — quien lo subió o el Coordinador. */
const eliminarArchivo = (entidad) => async (req, res) => {
  const id = _int(req.params.id);
  const idArchivo = _int(req.params.idArchivo);
  if (!id || !idArchivo) return _err(res, 400, "Archivo inválido");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idArchivo", sql.Int, idArchivo)
      .input("entidad", sql.VarChar(10), entidad)
      .input("idEntidad", sql.Int, id)
      .query("SELECT idArchivo, rutaServidor, login FROM sgc_archivos WHERE idArchivo = @idArchivo AND entidad = @entidad AND idEntidad = @idEntidad");
    const a = r.recordset[0];
    if (!a) return _err(res, 404, "Archivo no encontrado");
    if (req.sgcRol !== 1 && !_mismo(a.login, req.login)) {
      return _err(res, 403, "Solo quien subió el archivo o el Coordinador SGI pueden eliminarlo.");
    }
    await db.request().input("idArchivo", sql.Int, idArchivo).query("DELETE FROM sgc_archivos WHERE idArchivo = @idArchivo");
    const fisico = path.resolve(BASE, a.rutaServidor);
    if (fisico.startsWith(BASE + path.sep)) fs.unlink(fisico, () => {});
    res.json({ ok: true, data: { idArchivo } });
  } catch (err) {
    console.error("[sgcArchivos.service] eliminar:", err);
    _err(res, 500, "Error interno");
  }
};

/** GET /api/sgc/archivos/:idArchivo[?descargar=1] — sirve el archivo si el usuario ve la entidad. */
async function descargarArchivo(req, res) {
  const idArchivo = _int(req.params.idArchivo);
  if (!idArchivo) return _err(res, 400, "Archivo inválido");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idArchivo", sql.Int, idArchivo)
      .query("SELECT entidad, idEntidad, nombreOriginal, rutaServidor, mimeType FROM sgc_archivos WHERE idArchivo = @idArchivo");
    const a = r.recordset[0];
    if (!a || !ENTIDADES.includes(a.entidad)) return _err(res, 404, "Archivo no encontrado");
    const p = await permisoEntidad(req, a.entidad, a.idEntidad);
    if (!p.ver) return _err(res, p.existe ? 403 : 404, p.existe ? "Sin acceso a este archivo." : "Archivo no encontrado");

    const fisico = path.resolve(BASE, a.rutaServidor);
    if (!fisico.startsWith(BASE + path.sep) || !fs.existsSync(fisico)) return _err(res, 404, "El archivo ya no está en el servidor.");
    const modo = req.query.descargar === "1" ? "attachment" : "inline";
    res.setHeader("Content-Type", a.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `${modo}; filename*=UTF-8''${encodeURIComponent(a.nombreOriginal)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(fisico);
  } catch (err) {
    console.error("[sgcArchivos.service] descargar:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { listarArchivos, subirArchivo, registrarArchivo, eliminarArchivo, descargarArchivo, permisoEntidad, MAX_BYTES };
