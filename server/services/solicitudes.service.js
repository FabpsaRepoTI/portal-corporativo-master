const { getPool } = require("../db");

{
  /*async function crearSolicitud({
  idServicio,
  idPrioridad,
  titulo,
  descripcion,
  idUsuario,
  nombreUsuario,
  areaUsuario,
  sitioUsuario,
}) {
  const pool = await getPool();

  // 1. Obtener SLA de la prioridad
  const prioRes = await pool.request().input("idPrioridad", idPrioridad).query(`
      SELECT slaRespuestaHrs, slaResolucionHrs, prioridad, colorHex
      FROM cat_prioridad
      WHERE idPrioridad = @idPrioridad
    `);

  if (!prioRes.recordset.length) throw new Error("Prioridad no encontrada");

  const { slaRespuestaHrs, slaResolucionHrs, prioridad, colorHex } =
    prioRes.recordset[0];

  // 2. Calcular fechas límite
  const ahora = new Date();
  const fechaLimiteResp = new Date(ahora.getTime() + slaRespuestaHrs * 3600000);
  const fechaLimiteResol = new Date(
    ahora.getTime() + slaResolucionHrs * 3600000,
  );

  // 3. INSERT y obtener folio
  const insertRes = await pool
    .request()
    .input("idServicio", idServicio)
    .input("idPrioridad", idPrioridad)
    .input("titulo", titulo)
    .input("descripcion", descripcion || "")
    .input("idUsuario", idUsuario)
    .input("nombreUsuario", nombreUsuario)
    .input("areaUsuario", areaUsuario || "")
    .input("sitioUsuario", sitioUsuario || "")
    .input("idEstatus", 1)
    .input("slaRespuestaHrs", slaRespuestaHrs)
    .input("slaResolucionHrs", slaResolucionHrs)
    .input("fechaLimiteResp", fechaLimiteResp)
    .input("fechaLimiteResol", fechaLimiteResol).query(`
      INSERT INTO solicitudTI
        (idServicio, idPrioridad, titulo, descripcion,
         idUsuario, nombreUsuario, areaUsuario, sitioUsuario,
         idEstatus, slaRespuestaHrs, slaResolucionHrs,
         fechaLimiteResp, fechaLimiteResol)
      OUTPUT INSERTED.idSolicitud, INSERTED.folio, INSERTED.fechaCreacion
      VALUES
        (@idServicio, @idPrioridad, @titulo, @descripcion,
         @idUsuario, @nombreUsuario, @areaUsuario, @sitioUsuario,
         @idEstatus, @slaRespuestaHrs, @slaResolucionHrs,
         @fechaLimiteResp, @fechaLimiteResol)
    `);

  const row = insertRes.recordset[0];

  return {
    idSolicitud: row.idSolicitud,
    folio: row.folio,
    fechaCreacion: row.fechaCreacion,
    slaRespuestaHrs,
    slaResolucionHrs,
    fechaLimiteResp,
    fechaLimiteResol,
    prioridad,
    colorHex,
  };
}*/
}

async function crearSolicitud({
  idServicio,
  idPrioridad,
  titulo,
  descripcion,
  idUsuario,
  nombreUsuario,
  areaUsuario,
  sitioUsuario,
}) {
  const pool = await getPool();

  // 1. Obtener SLA de cat_servicioTI (en minutos)
  const svcRes = await pool.request().input("idServicio", idServicio).query(`
    SELECT slaRespuestaMin, slaResolucionMin
    FROM cat_servicioTI
    WHERE idServicio = @idServicio
  `);

  if (!svcRes.recordset.length) throw new Error("Servicio no encontrado");

  const { slaRespuestaMin, slaResolucionMin } = svcRes.recordset[0];

  // 2. Obtener datos de prioridad (solo para metadata de retorno)
  const prioRes = await pool.request().input("idPrioridad", idPrioridad).query(`
    SELECT prioridad, colorHex
    FROM cat_prioridad
    WHERE idPrioridad = @idPrioridad
  `);

  if (!prioRes.recordset.length) throw new Error("Prioridad no encontrada");
  const { prioridad, colorHex } = prioRes.recordset[0];

  // 3. Calcular fechas límite en minutos
  const ahora = new Date();
  const fechaLimiteResp = slaRespuestaMin
    ? new Date(ahora.getTime() + slaRespuestaMin * 60000)
    : null;
  const fechaLimiteResol = slaResolucionMin
    ? new Date(ahora.getTime() + slaResolucionMin * 60000)
    : null;

  // 4. INSERT
  const insertRes = await pool
    .request()
    .input("idServicio", idServicio)
    .input("idPrioridad", idPrioridad)
    .input("titulo", titulo)
    .input("descripcion", descripcion || "")
    .input("idUsuario", idUsuario)
    .input("nombreUsuario", nombreUsuario)
    .input("areaUsuario", areaUsuario || "")
    .input("sitioUsuario", sitioUsuario || "")
    .input("idEstatus", 1)
    .input("slaRespuestaHrs", slaRespuestaMin) // guardamos minutos en la columna existente
    .input("slaResolucionHrs", slaResolucionMin) // ídem
    .input("fechaLimiteResp", fechaLimiteResp)
    .input("fechaLimiteResol", fechaLimiteResol).query(`
      INSERT INTO solicitudTI
        (idServicio, idPrioridad, titulo, descripcion,
         idUsuario, nombreUsuario, areaUsuario, sitioUsuario,
         idEstatus, slaRespuestaHrs, slaResolucionHrs,
         fechaLimiteResp, fechaLimiteResol)
      OUTPUT INSERTED.idSolicitud, INSERTED.folio, INSERTED.fechaCreacion
      VALUES
        (@idServicio, @idPrioridad, @titulo, @descripcion,
         @idUsuario, @nombreUsuario, @areaUsuario, @sitioUsuario,
         @idEstatus, @slaRespuestaHrs, @slaResolucionHrs,
         @fechaLimiteResp, @fechaLimiteResol)
    `);

  const row = insertRes.recordset[0];

  return {
    idSolicitud: row.idSolicitud,
    folio: row.folio,
    fechaCreacion: row.fechaCreacion,
    slaRespuestaHrs: slaRespuestaMin,
    slaResolucionHrs: slaResolucionMin,
    fechaLimiteResp,
    fechaLimiteResol,
    prioridad,
    colorHex,
  };
}

async function obtenerSolicitudesUsuario(idUsuario) {
  const pool = await getPool();
  const res = await pool.request().input("idUsuario", idUsuario).query(`
      SELECT
        s.idSolicitud, s.folio, s.titulo, s.fechaCreacion,
        s.idEstatus, e.estatus, e.colorHex AS estatusColor,
        sv.nombre AS servicio, sv.icono, sv.colorPrimario,
        p.prioridad, p.colorHex AS prioColor
      FROM solicitudTI s
      JOIN cat_estatusTI   e  ON e.idEstatus  = s.idEstatus
      JOIN cat_servicioTI  sv ON sv.idServicio = s.idServicio
      JOIN cat_prioridad   p  ON p.idPrioridad = s.idPrioridad
      WHERE s.idUsuario = @idUsuario
      ORDER BY s.fechaCreacion DESC
    `);
  return res.recordset;
}

const path = require("path");

async function guardarArchivos(idSolicitud, archivos) {
  const pool = await getPool();
  const rutas = [];

  for (const file of archivos) {
    const rutaRelativa = `uploads/solicitudes/${file.filename}`;

    await pool
      .request()
      .input("idSolicitud", idSolicitud)
      .input("nombreArchivo", file.originalname)
      .input("rutaServidor", rutaRelativa)
      .input("mimeType", file.mimetype)
      .input("tamanoBytes", file.size).query(`
        INSERT INTO solicitudTI_archivos
          (idSolicitud, nombreArchivo, rutaServidor, mimeType, tamanoBytes)
        VALUES
          (@idSolicitud, @nombreArchivo, @rutaServidor, @mimeType, @tamanoBytes)
      `);

    rutas.push(rutaRelativa);
  }

  return rutas;
}
module.exports = { crearSolicitud, obtenerSolicitudesUsuario, guardarArchivos };
