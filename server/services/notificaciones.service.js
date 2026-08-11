const { getPool, sql } = require("../db");
const { emitir } = require("../sse.manager");

const TIPOS = {
  TICKET_CREADO: 1,
  TICKET_ASIGNADO: 2,
  ESTATUS_CAMBIO: 3,
  COMENTARIO_NUEVO: 4,
  SLA_VENCIMIENTO: 5,
  TICKET_CERRADO: 6,
  TICKET_REABIERTO: 7,
  ESCALADO: 8,
  APROBADO: 9,
  RECHAZADO: 10,
  PRIORIDAD_CAMBIO: 11,
  INFO_SOLICITADA: 12,
  FECHA_COMPROMISO: 13,
  EVALUACION_RECIBIDA: 14,
};

async function crearNotificacion({
  loginDestino,
  loginOrigen,
  idTipo,
  idSolicitud,
  titulo,
  descripcion,
  urlDestino,
}) {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .input("loginDestino", sql.VarChar(255), loginDestino)
      .input("loginOrigen", sql.VarChar(255), loginOrigen ?? null)
      .input("idTipo", sql.Int, idTipo)
      .input("idSolicitud", sql.Int, idSolicitud ?? null)
      .input("titulo", sql.NVarChar(120), titulo)
      .input("descripcion", sql.NVarChar(300), descripcion)
      .input("urlDestino", sql.VarChar(200), urlDestino).query(`
        INSERT INTO notificacionTI
          (loginDestino, loginOrigen, idTipo, idSolicitud, titulo, descripcion, urlDestino)
        OUTPUT INSERTED.*
        VALUES
          (@loginDestino, @loginOrigen, @idTipo, @idSolicitud, @titulo, @descripcion, @urlDestino)
      `);

    const notif = result.recordset[0];
    emitir(loginDestino, { tipo: "nueva_notificacion", notificacion: notif });
    return notif;
  } catch (err) {
    console.error("Error crearNotificacion:", err.message);
  }
}

async function getNotificaciones(login, { pagina = 1, limite = 30 } = {}) {
  const pool = await getPool();
  const offset = (pagina - 1) * limite;
  const result = await pool
    .request()
    .input("login", sql.VarChar(255), login)
    .input("limite", sql.Int, limite)
    .input("offset", sql.Int, offset).query(`
      SELECT
        n.idNotificacion, n.idTipo, n.idSolicitud,
        n.titulo, n.descripcion, n.urlDestino,
        n.leida, n.fechaCreacion, n.fechaLeida,
        n.loginOrigen,
        t.icono, t.colorHex, t.nombre AS tipoNombre
      FROM notificacionTI n
      JOIN cat_tipoNotificacion t ON n.idTipo = t.idTipo
      WHERE n.loginDestino = @login
      ORDER BY n.fechaCreacion DESC
      OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
    `);
  return result.recordset;
}

async function getCount(login) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("login", sql.VarChar(255), login)
    .query(
      `SELECT COUNT(*) AS total FROM notificacionTI WHERE loginDestino = @login AND leida = 0`,
    );
  return result.recordset[0].total;
}

async function marcarLeida(idNotificacion, login) {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, idNotificacion)
    .input("login", sql.VarChar(255), login).query(`
      UPDATE notificacionTI
      SET leida = 1, fechaLeida = GETDATE()
      WHERE idNotificacion = @id AND loginDestino = @login
    `);
}

async function marcarTodasLeidas(login) {
  const pool = await getPool();
  await pool.request().input("login", sql.VarChar(255), login).query(`
      UPDATE notificacionTI
      SET leida = 1, fechaLeida = GETDATE()
      WHERE loginDestino = @login AND leida = 0
    `);
}

async function eliminar(idNotificacion, login) {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, idNotificacion)
    .input("login", sql.VarChar(255), login)
    .query(
      `DELETE FROM notificacionTI WHERE idNotificacion = @id AND loginDestino = @login`,
    );
}

module.exports = {
  TIPOS,
  crearNotificacion,
  getNotificaciones,
  getCount,
  marcarLeida,
  marcarTodasLeidas,
  eliminar,
};
