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

  // trivia (opcional)
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

  // reacciones y guardados de artículos de la edición
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_reacciones WHERE idArticulo IN (
      SELECT idArticulo FROM blog_articulo WHERE idEdicion = @id)`);
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_guardados WHERE idArticulo IN (
      SELECT idArticulo FROM blog_articulo WHERE idEdicion = @id)`);
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_reacciones_comentario WHERE idComentario IN (
      SELECT c.idComentario FROM blog_comentario c
      JOIN blog_articulo a ON a.idArticulo = c.idArticulo WHERE a.idEdicion = @id)`);
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM blog_respuestas WHERE idComentario IN (
      SELECT c.idComentario FROM blog_comentario c
      JOIN blog_articulo a ON a.idArticulo = c.idArticulo WHERE a.idEdicion = @id)`);

  // likes y comentarios
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
  try {
    const result = await pool
      .request()
      .input("idEdicion", sql.Int, parseInt(idEdicion)).query(`
        SELECT
          a.idArticulo, a.titulo, a.extracto, a.categoria,
          a.autor, a.fotoUrl, a.destacado, a.estatus,
          a.tiempoLectura, a.fechaPublicacion, a.fechaCreacion,
          ISNULL(u.name, a.autor) AS autorNombre,
          u.picture               AS fotoAutor,
          (SELECT COUNT(*) FROM blog_comentario
           WHERE idArticulo = a.idArticulo AND activo = 1)               AS comentarios,
          (SELECT COUNT(*) FROM blog_reacciones
           WHERE idArticulo = a.idArticulo AND tipo = 'like')            AS reaccionLike,
          (SELECT COUNT(*) FROM blog_reacciones
           WHERE idArticulo = a.idArticulo AND tipo = 'love')            AS reaccionLove,
          (SELECT COUNT(*) FROM blog_reacciones
           WHERE idArticulo = a.idArticulo AND tipo = 'interest')        AS reaccionInterest
        FROM   blog_articulo a
        LEFT JOIN sec_users u ON u.login = a.autor
        WHERE  a.idEdicion = @idEdicion AND a.estatus = 2
        ORDER BY a.destacado DESC, a.fechaPublicacion DESC
      `);

    return result.recordset.map((a) => ({
      ...a,
      autor: a.autorNombre || a.autor,
      reacciones: {
        like: a.reaccionLike || 0,
        love: a.reaccionLove || 0,
        interest: a.reaccionInterest || 0,
      },
      miReaccion: null,
      guardado: false,
    }));
  } catch (e) {
    console.error("❌ getArticulosEdicion error:", e.message);
    throw e;
  }
}

async function getArticuloDetalle(idArticulo, loginUsuario) {
  const pool = await getPool();

  const artResult = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo)).query(`
      SELECT a.idArticulo, a.idEdicion, a.titulo, a.extracto, a.contenido,
             a.categoria, a.autor, a.fotoUrl, a.destacado, a.estatus,
             a.tiempoLectura, a.fechaPublicacion, a.fechaCreacion,
             ISNULL(u.name, a.autor) AS autorNombre,
             u.picture               AS fotoAutor,
             (SELECT COUNT(*) FROM blog_reacciones
              WHERE idArticulo = a.idArticulo) AS totalReacciones
      FROM   blog_articulo a
      LEFT JOIN sec_users u ON u.login = a.autor
      WHERE  a.idArticulo = @id AND a.estatus = 2
    `);

  const articulo = artResult.recordset[0];
  if (!articulo) return null;

  articulo.autor = articulo.autorNombre || articulo.autor;

  const reacciones = await getReaccionesArticulo(idArticulo, loginUsuario);
  articulo.reacciones = reacciones;
  articulo.miReaccion = reacciones.miReaccion;
  articulo.meGusta = reacciones.miReaccion !== null;

  const guardadoRes = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo))
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT 1 AS guardado FROM blog_guardados
      WHERE idArticulo = @id AND loginUsuario = @login
    `);
  articulo.guardado = guardadoRes.recordset.length > 0;

  const comResult = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo)).query(`
      SELECT c.idComentario, c.loginUsuario,
             ISNULL(u.name, c.loginUsuario) AS nombreUsuario,
             u.picture                       AS fotoUsuario,
             c.comentario, c.fecha
      FROM   blog_comentario c
      LEFT JOIN sec_users u ON u.login = c.loginUsuario
      WHERE  c.idArticulo = @id AND c.activo = 1
      ORDER BY c.fecha ASC
    `);

  const comentarios = [];
  for (const c of comResult.recordset) {
    const rcRes = await pool.request().input("idCom", sql.Int, c.idComentario)
      .query(`
        SELECT tipo, COUNT(*) AS total
        FROM   blog_reacciones_comentario
        WHERE  idComentario = @idCom
        GROUP BY tipo
      `);

    const rcMia = await pool
      .request()
      .input("idCom", sql.Int, c.idComentario)
      .input("login", sql.VarChar(255), loginUsuario).query(`
        SELECT tipo FROM blog_reacciones_comentario
        WHERE idComentario = @idCom AND loginUsuario = @login
      `);

    const rcMap = { like: 0, love: 0 };
    rcRes.recordset.forEach((r) => {
      rcMap[r.tipo] = r.total;
    });

    const rpRes = await pool.request().input("idCom", sql.Int, c.idComentario)
      .query(`
        SELECT rp.idRespuesta, rp.loginUsuario,
               ISNULL(u.name, rp.loginUsuario) AS nombreUsuario,
               u.picture                        AS fotoUsuario,
               rp.respuesta, rp.fecha
        FROM   blog_respuestas rp
        LEFT JOIN sec_users u ON u.login = rp.loginUsuario
        WHERE  rp.idComentario = @idCom
        ORDER BY rp.fecha ASC
      `);

    comentarios.push({
      ...c,
      reacciones: {
        like: rcMap.like,
        love: rcMap.love,
        miReaccion: rcMia.recordset[0]?.tipo || null,
      },
      respuestas: rpRes.recordset,
    });
  }

  articulo.comentarios = comentarios;
  return articulo;
}

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
             (SELECT COUNT(*) FROM blog_like
              WHERE idArticulo = a.idArticulo) AS likes,
             (SELECT COUNT(*) FROM blog_comentario
              WHERE idArticulo = a.idArticulo AND activo = 1) AS comentarios
      FROM   blog_articulo a
      WHERE  a.idEdicion = @idEdicion
      ORDER BY a.fechaCreacion DESC
    `);
  return result.recordset;
}

// ─────────────────────────────────────────────
//  ESTADO PERSONAL (miReaccion + guardado en bloque)
// ─────────────────────────────────────────────

async function getEstadoArticulos(idEdicion, loginUsuario) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("idEdicion", sql.Int, parseInt(idEdicion))
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT a.idArticulo,
             r.tipo AS miReaccion,
             CASE WHEN g.idGuardado IS NOT NULL THEN 1 ELSE 0 END AS guardado
      FROM   blog_articulo a
      LEFT JOIN blog_reacciones r
             ON r.idArticulo = a.idArticulo AND r.loginUsuario = @login
      LEFT JOIN blog_guardados g
             ON g.idArticulo = a.idArticulo AND g.loginUsuario = @login
      WHERE  a.idEdicion = @idEdicion AND a.estatus = 2
    `);
  return result.recordset;
}

// ─────────────────────────────────────────────
//  LIKES (compatibilidad)
// ─────────────────────────────────────────────

async function toggleLike(idArticulo, loginUsuario) {
  const pool = await getPool();
  const existe = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo))
    .input("login", sql.VarChar(255), loginUsuario)
    .query(
      `SELECT idLike FROM blog_like WHERE idArticulo = @id AND loginUsuario = @login`,
    );

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
//  REACCIONES A ARTÍCULOS
// ─────────────────────────────────────────────

async function reaccionarArticulo(idArticulo, loginUsuario, tipo) {
  const pool = await getPool();

  const existe = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo))
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT idReaccion, tipo FROM blog_reacciones
      WHERE idArticulo = @id AND loginUsuario = @login
    `);

  if (existe.recordset.length > 0) {
    const actual = existe.recordset[0].tipo;
    if (actual === tipo) {
      await pool
        .request()
        .input("id", sql.Int, parseInt(idArticulo))
        .input("login", sql.VarChar(255), loginUsuario)
        .query(
          `DELETE FROM blog_reacciones WHERE idArticulo = @id AND loginUsuario = @login`,
        );
      return { accion: "removed", tipo };
    } else {
      await pool
        .request()
        .input("id", sql.Int, parseInt(idArticulo))
        .input("login", sql.VarChar(255), loginUsuario)
        .input("tipo", sql.VarChar(10), tipo)
        .query(
          `UPDATE blog_reacciones SET tipo = @tipo WHERE idArticulo = @id AND loginUsuario = @login`,
        );
      return { accion: "changed", tipo };
    }
  } else {
    await pool
      .request()
      .input("id", sql.Int, parseInt(idArticulo))
      .input("login", sql.VarChar(255), loginUsuario)
      .input("tipo", sql.VarChar(10), tipo)
      .query(
        `INSERT INTO blog_reacciones (idArticulo, loginUsuario, tipo) VALUES (@id, @login, @tipo)`,
      );
    return { accion: "added", tipo };
  }
}

async function getReaccionesArticulo(idArticulo, loginUsuario) {
  const pool = await getPool();

  const totales = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo)).query(`
      SELECT tipo, COUNT(*) AS total
      FROM   blog_reacciones
      WHERE  idArticulo = @id
      GROUP BY tipo
    `);

  const miReaccion = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo))
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT tipo FROM blog_reacciones
      WHERE idArticulo = @id AND loginUsuario = @login
    `);

  const usuarios = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo)).query(`
      SELECT TOP 4
             r.loginUsuario,
             ISNULL(u.name, r.loginUsuario) AS nombre,
             u.picture                       AS fotoUrl
      FROM   blog_reacciones r
      LEFT JOIN sec_users u ON u.login = r.loginUsuario
      WHERE  r.idArticulo = @id
      ORDER BY r.fecha DESC
    `);

  const map = { like: 0, love: 0, interest: 0 };
  totales.recordset.forEach((row) => {
    map[row.tipo] = row.total;
  });

  return {
    like: map.like,
    love: map.love,
    interest: map.interest,
    total: map.like + map.love + map.interest,
    miReaccion: miReaccion.recordset[0]?.tipo || null,
    usuarios: usuarios.recordset,
  };
}

// ─────────────────────────────────────────────
//  REACCIONES EN COMENTARIOS
// ─────────────────────────────────────────────

async function reaccionarComentario(idComentario, loginUsuario, tipo) {
  const pool = await getPool();

  const existe = await pool
    .request()
    .input("id", sql.Int, parseInt(idComentario))
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT idReaccion, tipo FROM blog_reacciones_comentario
      WHERE idComentario = @id AND loginUsuario = @login
    `);

  if (existe.recordset.length > 0) {
    const actual = existe.recordset[0].tipo;
    if (actual === tipo) {
      await pool
        .request()
        .input("id", sql.Int, parseInt(idComentario))
        .input("login", sql.VarChar(255), loginUsuario)
        .query(
          `DELETE FROM blog_reacciones_comentario WHERE idComentario = @id AND loginUsuario = @login`,
        );
      return { accion: "removed", tipo };
    } else {
      await pool
        .request()
        .input("id", sql.Int, parseInt(idComentario))
        .input("login", sql.VarChar(255), loginUsuario)
        .input("tipo", sql.VarChar(10), tipo)
        .query(
          `UPDATE blog_reacciones_comentario SET tipo = @tipo WHERE idComentario = @id AND loginUsuario = @login`,
        );
      return { accion: "changed", tipo };
    }
  } else {
    await pool
      .request()
      .input("id", sql.Int, parseInt(idComentario))
      .input("login", sql.VarChar(255), loginUsuario)
      .input("tipo", sql.VarChar(10), tipo)
      .query(
        `INSERT INTO blog_reacciones_comentario (idComentario, loginUsuario, tipo) VALUES (@id, @login, @tipo)`,
      );
    return { accion: "added", tipo };
  }
}

// ─────────────────────────────────────────────
//  RESPUESTAS A COMENTARIOS
// ─────────────────────────────────────────────

async function responderComentario(idComentario, loginUsuario, respuesta) {
  const pool = await getPool();

  const userRes = await pool
    .request()
    .input("login", sql.VarChar(255), loginUsuario)
    .query(`SELECT name, picture FROM sec_users WHERE login = @login`);
  const u = userRes.recordset[0];

  const result = await pool
    .request()
    .input("idComentario", sql.Int, parseInt(idComentario))
    .input("login", sql.VarChar(255), loginUsuario)
    .input("nombre", sql.NVarChar(150), u?.name || loginUsuario)
    .input("fotoUrl", sql.VarChar(500), u?.picture || null)
    .input("respuesta", sql.NVarChar(1000), respuesta.trim()).query(`
      INSERT INTO blog_respuestas (idComentario, loginUsuario, nombreUsuario, fotoUrl, respuesta)
      OUTPUT INSERTED.idRespuesta, INSERTED.fecha
      VALUES (@idComentario, @login, @nombre, @fotoUrl, @respuesta)
    `);

  return result.recordset[0];
}

// ─────────────────────────────────────────────
//  ARTÍCULOS GUARDADOS
// ─────────────────────────────────────────────

async function toggleGuardado(idArticulo, loginUsuario) {
  const pool = await getPool();

  const existe = await pool
    .request()
    .input("id", sql.Int, parseInt(idArticulo))
    .input("login", sql.VarChar(255), loginUsuario)
    .query(
      `SELECT idGuardado FROM blog_guardados WHERE idArticulo = @id AND loginUsuario = @login`,
    );

  if (existe.recordset.length > 0) {
    await pool
      .request()
      .input("id", sql.Int, parseInt(idArticulo))
      .input("login", sql.VarChar(255), loginUsuario)
      .query(
        `DELETE FROM blog_guardados WHERE idArticulo = @id AND loginUsuario = @login`,
      );
    return { accion: "removed" };
  } else {
    await pool
      .request()
      .input("id", sql.Int, parseInt(idArticulo))
      .input("login", sql.VarChar(255), loginUsuario)
      .query(
        `INSERT INTO blog_guardados (idArticulo, loginUsuario) VALUES (@id, @login)`,
      );
    return { accion: "added" };
  }
}

async function getArticulosGuardados(loginUsuario) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("login", sql.VarChar(255), loginUsuario).query(`
      SELECT a.idArticulo, a.titulo, a.extracto, a.categoria,
             a.autor, a.fotoUrl, a.tiempoLectura, a.fechaPublicacion,
             g.fecha AS fechaGuardado
      FROM   blog_guardados g
      JOIN   blog_articulo a ON a.idArticulo = g.idArticulo
      WHERE  g.loginUsuario = @login AND a.estatus = 2
      ORDER BY g.fecha DESC
    `);
  return result.recordset;
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
//  PARTICIPACIÓN
// ─────────────────────────────────────────────

async function getParticipacion(idEdicion) {
  const pool = await getPool();
  try {
    const result = await pool
      .request()
      .input("idEdicion", sql.Int, parseInt(idEdicion)).query(`
        SELECT TOP 3
               actividad.login,
               ISNULL(u.name, actividad.login) AS nombre,
               u.picture                        AS fotoUrl,
               SUM(actividad.puntos)            AS total
        FROM (
          SELECT c.loginUsuario AS login, COUNT(*) AS puntos
          FROM   blog_comentario c
          JOIN   blog_articulo a ON a.idArticulo = c.idArticulo
          WHERE  a.idEdicion = @idEdicion AND c.activo = 1
          GROUP BY c.loginUsuario

          UNION ALL

          SELECT r.loginUsuario AS login, COUNT(*) AS puntos
          FROM   blog_reacciones r
          JOIN   blog_articulo a ON a.idArticulo = r.idArticulo
          WHERE  a.idEdicion = @idEdicion
          GROUP BY r.loginUsuario

          UNION ALL

          SELECT rc.loginUsuario AS login, COUNT(*) AS puntos
          FROM   blog_reacciones_comentario rc
          JOIN   blog_comentario c ON c.idComentario = rc.idComentario
          JOIN   blog_articulo a ON a.idArticulo = c.idArticulo
          WHERE  a.idEdicion = @idEdicion
          GROUP BY rc.loginUsuario

          UNION ALL

          SELECT rp.loginUsuario AS login, COUNT(*) AS puntos
          FROM   blog_respuestas rp
          JOIN   blog_comentario c ON c.idComentario = rp.idComentario
          JOIN   blog_articulo a ON a.idArticulo = c.idArticulo
          WHERE  a.idEdicion = @idEdicion
          GROUP BY rp.loginUsuario

          UNION ALL

          SELECT ev.loginUsuario AS login, COUNT(*) AS puntos
          FROM   blog_encuesta_voto ev
          JOIN   blog_encuesta e ON e.idEncuesta = ev.idEncuesta
          WHERE  e.idEdicion = @idEdicion
          GROUP BY ev.loginUsuario

        ) actividad
        LEFT JOIN sec_users u ON u.login = actividad.login
        GROUP BY actividad.login, u.name, u.picture
        ORDER BY total DESC
      `);
    return result.recordset;
  } catch (e) {
    console.error("❌ getParticipacion error:", e.message);
    throw e;
  }
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
           COUNT(a.idArticulo)            AS totalArticulos,
           SUM(CAST(a.destacado AS INT))  AS destacados
    FROM   blog_edicion e
    LEFT JOIN blog_articulo a ON a.idEdicion = e.idEdicion AND a.estatus = 2
    GROUP BY e.idEdicion, e.titulo, e.mes, e.anio, e.activa
    ORDER BY e.anio DESC, e.mes DESC
  `);
  return result.recordset;
}

// ─────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────

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
  getEstadoArticulos,
  // likes (compatibilidad)
  toggleLike,
  // reacciones
  reaccionarArticulo,
  getReaccionesArticulo,
  // comentarios
  agregarComentario,
  moderarComentario,
  // reacciones en comentarios
  reaccionarComentario,
  // respuestas
  responderComentario,
  // guardados
  toggleGuardado,
  getArticulosGuardados,
  // participación
  getParticipacion,
  // encuestas
  getEncuestaEdicion,
  crearEncuesta,
  votar,
  // archivo
  getArchivo,
};
