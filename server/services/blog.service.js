"use strict";
const { getPool, sql } = require("../db");

// ─────────────────────────────────────────────
//  EDICIONES
// ─────────────────────────────────────────────

async function getEdicionActiva() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT idEdicion, titulo, mes, anio, activa, fechaCreacion
    FROM   blog_edicion
    WHERE  activa = 1
  `);
  return result.recordset[0] || null;
}

async function getEdiciones() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT e.idEdicion, e.titulo, e.mes, e.anio, e.activa, e.fechaCreacion,
           COUNT(a.idArticulo) AS totalArticulos
    FROM   blog_edicion e
    LEFT JOIN blog_articulo a ON a.idEdicion = e.idEdicion AND a.estatus = 2
    GROUP BY e.idEdicion, e.titulo, e.mes, e.anio, e.activa, e.fechaCreacion
    ORDER BY e.anio DESC, e.mes DESC
  `);
  return result.recordset;
}

async function crearEdicion({ titulo, mes, anio }) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("titulo", sql.VarChar(100), titulo)
    .input("mes", sql.TinyInt, parseInt(mes))
    .input("anio", sql.SmallInt, parseInt(anio)).query(`
      INSERT INTO blog_edicion (titulo, mes, anio, activa)
      OUTPUT INSERTED.idEdicion
      VALUES (@titulo, @mes, @anio, 0)
    `);
  return result.recordset[0].idEdicion;
}

async function activarEdicion(idEdicion) {
  const pool = await getPool();
  const tx = pool.transaction();
  await tx.begin();
  try {
    await tx
      .request()
      .query(`UPDATE blog_edicion SET activa = 0 WHERE activa = 1`);
    await tx
      .request()
      .input("id", sql.Int, parseInt(idEdicion))
      .query(`UPDATE blog_edicion SET activa = 1 WHERE idEdicion = @id`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function eliminarEdicion(idEdicion) {
  const pool = await getPool();
  const id = parseInt(idEdicion);

  const check = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`SELECT activa FROM blog_edicion WHERE idEdicion = @id`);
  if (!check.recordset[0]) throw new Error("Edición no encontrada");
  if (check.recordset[0].activa)
    throw new Error("No puedes eliminar la edición activa");

  // trivia (opcional — puede no existir)
  try {
    await pool.request().input("id", sql.Int, id).query(`
      DELETE FROM blog_trivia_respuesta WHERE idResultado IN (
        SELECT r.idResultado FROM blog_trivia_resultado r
        JOIN blog_trivia t ON t.idTrivia = r.idTrivia WHERE t.idEdicion = @id)`);
    await pool.request().input("id", sql.Int, id).query(`
      DELETE FROM blog_trivia_resultado WHERE idTrivia IN (
        SELECT idTrivia FROM blog_trivia WHERE idEdicion = @id)`);
    await pool.request().input("id", sql.Int, id).query(`
      DELETE FROM blog_trivia_opcion WHERE idPregunta IN (
        SELECT p.idPregunta FROM blog_trivia_pregunta p
        JOIN blog_trivia t ON t.idTrivia = p.idTrivia WHERE t.idEdicion = @id)`);
    await pool.request().input("id", sql.Int, id).query(`
      DELETE FROM blog_trivia_pregunta WHERE idTrivia IN (
        SELECT idTrivia FROM blog_trivia WHERE idEdicion = @id)`);
    await pool.request().input("id", sql.Int, id).query(`
      DELETE FROM blog_trivia WHERE idEdicion = @id`);
  } catch (_) {}

  // encuestas
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_encuesta_voto WHERE idEncuesta IN (
      SELECT idEncuesta FROM blog_encuesta WHERE idEdicion = @id)`);
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_encuesta_opcion WHERE idEncuesta IN (
      SELECT idEncuesta FROM blog_encuesta WHERE idEdicion = @id)`);
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_encuesta WHERE idEdicion = @id`);

  // artículos
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_like WHERE idArticulo IN (
      SELECT idArticulo FROM blog_articulo WHERE idEdicion = @id)`);
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_comentario WHERE idArticulo IN (
      SELECT idArticulo FROM blog_articulo WHERE idEdicion = @id)`);
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_articulo WHERE idEdicion = @id`);
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_edicion WHERE idEdicion = @id`);
}

// ─────────────────────────────────────────────
//  ARTÍCULOS
// ─────────────────────────────────────────────

async function getArticulosEdicion(idEdicion) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("idEdicion", sql.Int, parseInt(idEdicion)).query(`
      SELECT a.idArticulo, a.titulo, a.extracto, a.categoria, a.autor,
             a.fotoUrl, a.destacado, a.estatus, a.tiempoLectura,
             a.fechaPublicacion, a.fechaCreacion,
             (SELECT COUNT(*) FROM blog_like WHERE idArticulo = a.idArticulo) AS likes,
             (SELECT COUNT(*) FROM blog_comentario WHERE idArticulo = a.idArticulo AND activo = 1) AS comentarios
      FROM   blog_articulo a
      WHERE  a.idEdicion = @idEdicion AND a.estatus = 2
      ORDER BY a.destacado DESC, a.fechaPublicacion DESC
    `);
  return result.recordset;
}

async function getArticuloDetalle(idArticulo, loginUsuario) {
  const pool = await getPool();

  const artResult = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo)).query(`
      SELECT a.idArticulo, a.idEdicion, a.titulo, a.extracto, a.contenido,
             a.categoria, a.autor, a.fotoUrl, a.destacado, a.estatus,
             a.tiempoLectura, a.fechaPublicacion, a.fechaCreacion,
             (SELECT COUNT(*) FROM blog_like WHERE idArticulo = a.idArticulo) AS likes
      FROM   blog_articulo a
      WHERE  a.idArticulo = @id AND a.estatus = 2
    `);

  const articulo = artResult.recordset[0];
  if (!articulo) return null;

  const likeResult = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo))
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT 1 AS liked FROM blog_like
      WHERE idArticulo = @id AND loginUsuario = @login
    `);
  articulo.meGusta = likeResult.recordset.length > 0;

  const comResult = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo)).query(`
      SELECT c.idComentario, c.loginUsuario,
             c.loginUsuario AS nombreUsuario,
             c.comentario, c.fecha
      FROM   blog_comentario c
      WHERE  c.idArticulo = @id AND c.activo = 1
      ORDER BY c.fecha ASC
    `);
  articulo.comentarios = comResult.recordset;

  return articulo;
}

// DETALLE ADMIN — sin filtro de estatus, trae contenido completo para editar
async function getArticuloDetalleAdmin(idArticulo) {
  const pool = await getPool();
  const result = await pool.request().input("id", sql.Int, parseInt(idArticulo))
    .query(`
      SELECT idArticulo, idEdicion, titulo, extracto, contenido,
             categoria, autor, fotoUrl, destacado, estatus,
             tiempoLectura, fechaPublicacion, fechaCreacion
      FROM   blog_articulo
      WHERE  idArticulo = @id
    `);
  return result.recordset[0] || null;
}

async function crearArticulo({
  idEdicion,
  titulo,
  extracto,
  contenido,
  categoria,
  autor,
  fotoUrl,
  destacado,
  tiempoLectura,
}) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("idEdicion", sql.Int, parseInt(idEdicion))
    .input("titulo", sql.VarChar(200), titulo)
    .input("extracto", sql.VarChar(500), extracto)
    .input("contenido", sql.NVarChar, contenido)
    .input("categoria", sql.VarChar(30), categoria)
    .input("autor", sql.VarChar(100), autor)
    .input("fotoUrl", sql.VarChar(500), fotoUrl || null)
    .input("destacado", sql.Bit, destacado ? 1 : 0)
    .input(
      "tiempoLectura",
      sql.TinyInt,
      tiempoLectura ? parseInt(tiempoLectura) : null,
    ).query(`
      INSERT INTO blog_articulo
        (idEdicion, titulo, extracto, contenido, categoria, autor,
         fotoUrl, destacado, estatus, tiempoLectura, fechaPublicacion)
      OUTPUT INSERTED.idArticulo
      VALUES
        (@idEdicion, @titulo, @extracto, @contenido, @categoria, @autor,
         @fotoUrl, @destacado, 1, @tiempoLectura, NULL)
    `);
  return result.recordset[0].idArticulo;
}

async function actualizarArticulo(idArticulo, campos) {
  const pool = await getPool();
  const req = pool.request().input("id", sql.Int, parseInt(idArticulo));
  const sets = [];

  if (campos.titulo !== undefined) {
    req.input("titulo", sql.VarChar(200), campos.titulo);
    sets.push("titulo = @titulo");
  }
  if (campos.extracto !== undefined) {
    req.input("extracto", sql.VarChar(500), campos.extracto);
    sets.push("extracto = @extracto");
  }
  if (campos.contenido !== undefined) {
    req.input("contenido", sql.NVarChar, campos.contenido);
    sets.push("contenido = @contenido");
  }
  if (campos.categoria !== undefined) {
    req.input("categoria", sql.VarChar(30), campos.categoria);
    sets.push("categoria = @categoria");
  }
  if (campos.autor !== undefined) {
    req.input("autor", sql.VarChar(100), campos.autor);
    sets.push("autor = @autor");
  }
  if (campos.fotoUrl !== undefined) {
    req.input("fotoUrl", sql.VarChar(500), campos.fotoUrl);
    sets.push("fotoUrl = @fotoUrl");
  }
  if (campos.destacado !== undefined) {
    req.input("destacado", sql.Bit, campos.destacado ? 1 : 0);
    sets.push("destacado = @destacado");
  }
  if (campos.tiempoLectura !== undefined) {
    req.input("tiempoLectura", sql.TinyInt, parseInt(campos.tiempoLectura));
    sets.push("tiempoLectura = @tiempoLectura");
  }
  if (campos.estatus !== undefined) {
    req.input("estatus", sql.TinyInt, parseInt(campos.estatus));
    sets.push("estatus = @estatus");
    if (parseInt(campos.estatus) === 2)
      sets.push("fechaPublicacion = GETDATE()");
  }

  if (sets.length === 0) return;
  await req.query(
    `UPDATE blog_articulo SET ${sets.join(", ")} WHERE idArticulo = @id`,
  );
}

async function getArticulosAdmin(idEdicion) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("idEdicion", sql.Int, parseInt(idEdicion)).query(`
      SELECT a.idArticulo, a.titulo, a.categoria, a.autor, a.destacado,
             a.estatus, a.tiempoLectura, a.fechaPublicacion, a.fechaCreacion,
             (SELECT COUNT(*) FROM blog_like WHERE idArticulo = a.idArticulo) AS likes,
             (SELECT COUNT(*) FROM blog_comentario WHERE idArticulo = a.idArticulo AND activo = 1) AS comentarios
      FROM   blog_articulo a
      WHERE  a.idEdicion = @idEdicion
      ORDER BY a.fechaCreacion DESC
    `);
  return result.recordset;
}

// ─────────────────────────────────────────────
//  LIKES
// ─────────────────────────────────────────────

async function toggleLike(idArticulo, loginUsuario) {
  const pool = await getPool();
  const existe = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo))
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT idLike FROM blog_like WHERE idArticulo = @id AND loginUsuario = @login
    `);
  if (existe.recordset.length > 0) {
    await pool
      .request()
      .input("id", sql.Int, parseInt(idArticulo))
      .input("login", sql.VarChar(255), loginUsuario)
      .query(
        `DELETE FROM blog_like WHERE idArticulo = @id AND loginUsuario = @login`,
      );
    return { accion: "removed" };
  } else {
    await pool
      .request()
      .input("id", sql.Int, parseInt(idArticulo))
      .input("login", sql.VarChar(255), loginUsuario)
      .query(
        `INSERT INTO blog_like (idArticulo, loginUsuario) VALUES (@id, @login)`,
      );
    return { accion: "added" };
  }
}

// ─────────────────────────────────────────────
//  COMENTARIOS
// ─────────────────────────────────────────────

async function agregarComentario(idArticulo, loginUsuario, comentario) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo))
    .input("login", sql.VarChar(255), loginUsuario)
    .input("comentario", sql.NVarChar(1000), comentario.trim()).query(`
      INSERT INTO blog_comentario (idArticulo, loginUsuario, comentario)
      OUTPUT INSERTED.idComentario, INSERTED.fecha
      VALUES (@id, @login, @comentario)
    `);
  return result.recordset[0];
}

async function moderarComentario(idComentario, activo) {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, parseInt(idComentario))
    .input("activo", sql.Bit, activo ? 1 : 0)
    .query(
      `UPDATE blog_comentario SET activo = @activo WHERE idComentario = @id`,
    );
}

// ─────────────────────────────────────────────
//  ENCUESTAS
// ─────────────────────────────────────────────

async function getEncuestaEdicion(idEdicion, loginUsuario) {
  const pool = await getPool();
  const encResult = await pool
    .request()
    .input("idEdicion", sql.Int, parseInt(idEdicion)).query(`
      SELECT TOP 1 idEncuesta, pregunta, activa
      FROM   blog_encuesta
      WHERE  idEdicion = @idEdicion AND activa = 1
    `);
  const encuesta = encResult.recordset[0];
  if (!encuesta) return null;

  const opResult = await pool
    .request()
    .input("id", sql.Int, encuesta.idEncuesta).query(`
      SELECT o.idOpcion, o.texto, o.orden, COUNT(v.idVoto) AS votos
      FROM   blog_encuesta_opcion o
      LEFT JOIN blog_encuesta_voto v ON v.idOpcion = o.idOpcion
      WHERE  o.idEncuesta = @id
      GROUP BY o.idOpcion, o.texto, o.orden
      ORDER BY o.orden ASC
    `);

  const votoResult = await pool
    .request()
    .input("id", sql.Int, encuesta.idEncuesta)
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT idOpcion FROM blog_encuesta_voto
      WHERE idEncuesta = @id AND loginUsuario = @login
    `);

  encuesta.opciones = opResult.recordset;
  encuesta.miVoto = votoResult.recordset[0]?.idOpcion || null;
  encuesta.totalVotos = opResult.recordset.reduce((s, o) => s + o.votos, 0);
  return encuesta;
}

async function crearEncuesta(idEdicion, pregunta, opciones) {
  const pool = await getPool();
  const encResult = await pool
    .request()
    .input("idEdicion", sql.Int, parseInt(idEdicion))
    .input("pregunta", sql.VarChar(300), pregunta).query(`
      INSERT INTO blog_encuesta (idEdicion, pregunta)
      OUTPUT INSERTED.idEncuesta
      VALUES (@idEdicion, @pregunta)
    `);
  const idEncuesta = encResult.recordset[0].idEncuesta;
  for (let i = 0; i < opciones.length; i++) {
    await pool
      .request()
      .input("id", sql.Int, idEncuesta)
      .input("texto", sql.VarChar(200), opciones[i])
      .input("orden", sql.TinyInt, i)
      .query(
        `INSERT INTO blog_encuesta_opcion (idEncuesta, texto, orden) VALUES (@id, @texto, @orden)`,
      );
  }
  return idEncuesta;
}

async function votar(idEncuesta, idOpcion, loginUsuario) {
  const pool = await getPool();
  try {
    await pool
      .request()
      .input("idEncuesta", sql.Int, parseInt(idEncuesta))
      .input("idOpcion", sql.Int, parseInt(idOpcion))
      .input("login", sql.VarChar(255), loginUsuario).query(`
        INSERT INTO blog_encuesta_voto (idEncuesta, idOpcion, loginUsuario)
        VALUES (@idEncuesta, @idOpcion, @login)
      `);
    return { ok: true };
  } catch (e) {
    if (e.number === 2627) return { ok: false, error: "YA_VOTASTE" };
    throw e;
  }
}

// ─────────────────────────────────────────────
//  ARCHIVO HISTÓRICO
// ─────────────────────────────────────────────

async function getArchivo() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT e.idEdicion, e.titulo, e.mes, e.anio, e.activa,
           COUNT(a.idArticulo) AS totalArticulos,
           SUM(CAST(a.destacado AS INT)) AS destacados
    FROM   blog_edicion e
    LEFT JOIN blog_articulo a ON a.idEdicion = e.idEdicion AND a.estatus = 2
    GROUP BY e.idEdicion, e.titulo, e.mes, e.anio, e.activa
    ORDER BY e.anio DESC, e.mes DESC
  `);
  return result.recordset;
}

module.exports = {
  // ediciones
  getEdicionActiva,
  getEdiciones,
  crearEdicion,
  activarEdicion,
  eliminarEdicion,
  // artículos
  getArticulosEdicion,
  getArticuloDetalle,
  getArticuloDetalleAdmin,
  crearArticulo,
  actualizarArticulo,
  getArticulosAdmin,
  // likes
  toggleLike,
  // comentarios
  agregarComentario,
  moderarComentario,
  // encuestas
  getEncuestaEdicion,
  crearEncuesta,
  votar,
  // archivo
  getArchivo,
};
