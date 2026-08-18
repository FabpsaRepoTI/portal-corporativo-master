'use strict';
const { getPool, sql } = require('../db');

// ═══════════════════════════════════════════════════════════
//  TIPS
// ═══════════════════════════════════════════════════════════

async function getTipActivo() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TOP 1 idTip, texto, categoria, icono, fechaInicio
    FROM   blog_tip
    WHERE  activo = 1
      AND  fechaInicio <= CAST(GETDATE() AS DATE)
    ORDER BY fechaInicio DESC
  `);
  return result.recordset[0] || null;
}

async function getTips() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT idTip, texto, categoria, icono, activo, fechaInicio, fechaCreacion
    FROM   blog_tip
    ORDER BY fechaInicio DESC
  `);
  return result.recordset;
}

async function crearTip({ texto, categoria, icono, fechaInicio }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('texto',      sql.NVarChar(200), texto.trim())
    .input('categoria',  sql.VarChar(30),   categoria)
    .input('icono',      sql.VarChar(10),   icono || '💡')
    .input('fechaInicio',sql.Date,          new Date(fechaInicio))
    .query(`
      INSERT INTO blog_tip (texto, categoria, icono, fechaInicio)
      OUTPUT INSERTED.idTip
      VALUES (@texto, @categoria, @icono, @fechaInicio)
    `);
  return result.recordset[0].idTip;
}

async function toggleTip(idTip, activo) {
  const pool = await getPool();
  await pool.request()
    .input('id',     sql.Int, parseInt(idTip))
    .input('activo', sql.Bit, activo ? 1 : 0)
    .query(`UPDATE blog_tip SET activo = @activo WHERE idTip = @id`);
}

async function eliminarTip(idTip) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, parseInt(idTip))
    .query(`DELETE FROM blog_tip WHERE idTip = @id`);
}

// ═══════════════════════════════════════════════════════════
//  TRIVIA — lectura pública
// ═══════════════════════════════════════════════════════════

async function getTriviaEdicion(idEdicion, loginUsuario) {
  const pool = await getPool();

  // trivia de la edición
  const trivRes = await pool.request()
    .input('idEdicion', sql.Int, parseInt(idEdicion))
    .query(`
      SELECT idTrivia, titulo, activa, fechaCreacion
      FROM   blog_trivia
      WHERE  idEdicion = @idEdicion AND activa = 1
    `);

  const trivia = trivRes.recordset[0];
  if (!trivia) return null;

  // ¿ya respondió el usuario?
  const resRes = await pool.request()
    .input('idTrivia', sql.Int, trivia.idTrivia)
    .input('login',    sql.VarChar(255), loginUsuario)
    .query(`
      SELECT idResultado, aciertos, totalPreguntas, fechaRegistro
      FROM   blog_trivia_resultado
      WHERE  idTrivia = @idTrivia AND loginUsuario = @login
    `);

  const yaRespondio = resRes.recordset[0] || null;

  // preguntas
  const pregRes = await pool.request()
    .input('idTrivia', sql.Int, trivia.idTrivia)
    .query(`
      SELECT idPregunta, texto, orden, explicacion
      FROM   blog_trivia_pregunta
      WHERE  idTrivia = @idTrivia
      ORDER BY orden ASC
    `);

  const preguntas = pregRes.recordset;

  // opciones — si ya respondió mostramos cuál es correcta, si no la ocultamos
  for (const p of preguntas) {
    const opRes = await pool.request()
      .input('idPregunta', sql.Int, p.idPregunta)
      .query(`
        SELECT idOpcion, texto, orden
               ${yaRespondio ? ', correcta' : ', 0 AS correcta'}
        FROM   blog_trivia_opcion
        WHERE  idPregunta = @idPregunta
        ORDER BY orden ASC
      `);
    p.opciones = opRes.recordset;

    // si ya respondió, marcamos qué eligió el usuario
    if (yaRespondio) {
      const elegidaRes = await pool.request()
        .input('idResultado', sql.Int, yaRespondio.idResultado)
        .input('idPregunta',  sql.Int, p.idPregunta)
        .query(`
          SELECT idOpcion FROM blog_trivia_respuesta
          WHERE  idResultado = @idResultado AND idPregunta = @idPregunta
        `);
      p.opcionElegida = elegidaRes.recordset[0]?.idOpcion || null;
    }
  }

  return {
    ...trivia,
    preguntas,
    resultado: yaRespondio,
  };
}

// ═══════════════════════════════════════════════════════════
//  TRIVIA — responder
// ═══════════════════════════════════════════════════════════

async function responderTrivia(idTrivia, loginUsuario, respuestas) {
  // respuestas: [{ idPregunta, idOpcion }]
  const pool = await getPool();

  // verificar que no haya respondido antes
  const check = await pool.request()
    .input('idTrivia', sql.Int, parseInt(idTrivia))
    .input('login',    sql.VarChar(255), loginUsuario)
    .query(`
      SELECT idResultado FROM blog_trivia_resultado
      WHERE idTrivia = @idTrivia AND loginUsuario = @login
    `);
  if (check.recordset.length > 0) throw new Error('YA_RESPONDISTE');

  // calcular aciertos verificando opciones correctas
  let aciertos = 0;
  const detalle = [];

  for (const r of respuestas) {
    const opRes = await pool.request()
      .input('idOpcion',   sql.Int, parseInt(r.idOpcion))
      .input('idPregunta', sql.Int, parseInt(r.idPregunta))
      .query(`
        SELECT correcta FROM blog_trivia_opcion
        WHERE idOpcion = @idOpcion AND idPregunta = @idPregunta
      `);
    const correcta = opRes.recordset[0]?.correcta ? 1 : 0;
    if (correcta) aciertos++;
    detalle.push({ ...r, correcta });
  }

  const totalPreguntas = respuestas.length;

  // insertar resultado
  const resRes = await pool.request()
    .input('idTrivia',       sql.Int,         parseInt(idTrivia))
    .input('login',          sql.VarChar(255), loginUsuario)
    .input('aciertos',       sql.TinyInt,      aciertos)
    .input('totalPreguntas', sql.TinyInt,      totalPreguntas)
    .query(`
      INSERT INTO blog_trivia_resultado (idTrivia, loginUsuario, aciertos, totalPreguntas)
      OUTPUT INSERTED.idResultado
      VALUES (@idTrivia, @login, @aciertos, @totalPreguntas)
    `);

  const idResultado = resRes.recordset[0].idResultado;

  // insertar respuestas individuales
  for (const d of detalle) {
    await pool.request()
      .input('idResultado', sql.Int, idResultado)
      .input('idPregunta',  sql.Int, parseInt(d.idPregunta))
      .input('idOpcion',    sql.Int, parseInt(d.idOpcion))
      .input('correcta',    sql.Bit, d.correcta)
      .query(`
        INSERT INTO blog_trivia_respuesta (idResultado, idPregunta, idOpcion, correcta)
        VALUES (@idResultado, @idPregunta, @idOpcion, @correcta)
      `);
  }

  return { aciertos, totalPreguntas, idResultado };
}

// ═══════════════════════════════════════════════════════════
//  TRIVIA — ranking público
// ═══════════════════════════════════════════════════════════

async function getRankingTrivia(idTrivia) {
  const pool = await getPool();
  const result = await pool.request()
    .input('idTrivia', sql.Int, parseInt(idTrivia))
    .query(`
      SELECT TOP 10
             r.loginUsuario,
             ISNULL(u.nombre, r.loginUsuario) AS nombre,
             r.aciertos,
             r.totalPreguntas,
             r.fechaRegistro
      FROM   blog_trivia_resultado r
      LEFT JOIN sec_users u ON u.login = r.loginUsuario
      WHERE  r.idTrivia = @idTrivia
        AND  r.aciertos = r.totalPreguntas   -- solo los que acertaron todo
      ORDER BY r.fechaRegistro ASC           -- primero quien lo acertó antes
    `);
  return result.recordset;
}

// ═══════════════════════════════════════════════════════════
//  TRIVIA — administración
// ═══════════════════════════════════════════════════════════

async function crearTrivia(idEdicion, titulo, preguntas) {
  // preguntas: [{ texto, explicacion, opciones: [{ texto, correcta }] }]
  const pool = await getPool();

  const trivRes = await pool.request()
    .input('idEdicion', sql.Int,         parseInt(idEdicion))
    .input('titulo',    sql.VarChar(200), titulo)
    .query(`
      INSERT INTO blog_trivia (idEdicion, titulo)
      OUTPUT INSERTED.idTrivia
      VALUES (@idEdicion, @titulo)
    `);

  const idTrivia = trivRes.recordset[0].idTrivia;

  for (let i = 0; i < preguntas.length; i++) {
    const p = preguntas[i];

    const pregRes = await pool.request()
      .input('idTrivia',    sql.Int,          idTrivia)
      .input('texto',       sql.NVarChar(400), p.texto)
      .input('orden',       sql.TinyInt,       i)
      .input('explicacion', sql.NVarChar(500), p.explicacion || null)
      .query(`
        INSERT INTO blog_trivia_pregunta (idTrivia, texto, orden, explicacion)
        OUTPUT INSERTED.idPregunta
        VALUES (@idTrivia, @texto, @orden, @explicacion)
      `);

    const idPregunta = pregRes.recordset[0].idPregunta;

    for (let j = 0; j < p.opciones.length; j++) {
      const o = p.opciones[j];
      await pool.request()
        .input('idPregunta', sql.Int,          idPregunta)
        .input('texto',      sql.NVarChar(300), o.texto)
        .input('correcta',   sql.Bit,           o.correcta ? 1 : 0)
        .input('orden',      sql.TinyInt,       j)
        .query(`
          INSERT INTO blog_trivia_opcion (idPregunta, texto, correcta, orden)
          VALUES (@idPregunta, @texto, @correcta, @orden)
        `);
    }
  }

  return idTrivia;
}

async function getEstadisticasTrivia(idTrivia) {
  const pool = await getPool();

  // totales generales
  const totRes = await pool.request()
    .input('idTrivia', sql.Int, parseInt(idTrivia))
    .query(`
      SELECT COUNT(*)                                    AS totalParticipantes,
             SUM(CASE WHEN aciertos = totalPreguntas
                      THEN 1 ELSE 0 END)                AS perfectos,
             AVG(CAST(aciertos AS FLOAT))                AS promedioAciertos
      FROM   blog_trivia_resultado
      WHERE  idTrivia = @idTrivia
    `);

  // estadísticas por pregunta
  const pregRes = await pool.request()
    .input('idTrivia', sql.Int, parseInt(idTrivia))
    .query(`
      SELECT p.idPregunta, p.texto, p.orden,
             COUNT(r.idRespuesta)                          AS totalRespuestas,
             SUM(CAST(r.correcta AS INT))                  AS aciertos
      FROM   blog_trivia_pregunta p
      LEFT JOIN blog_trivia_respuesta r ON r.idPregunta = p.idPregunta
      WHERE  p.idTrivia = @idTrivia
      GROUP BY p.idPregunta, p.texto, p.orden
      ORDER BY p.orden ASC
    `);

  // por opción
  const opRes = await pool.request()
    .input('idTrivia', sql.Int, parseInt(idTrivia))
    .query(`
      SELECT o.idOpcion, o.idPregunta, o.texto, o.correcta,
             COUNT(r.idRespuesta) AS veces
      FROM   blog_trivia_opcion o
      JOIN   blog_trivia_pregunta p ON p.idPregunta = o.idPregunta
      LEFT JOIN blog_trivia_respuesta r ON r.idOpcion = o.idOpcion
      WHERE  p.idTrivia = @idTrivia
      GROUP BY o.idOpcion, o.idPregunta, o.texto, o.correcta
      ORDER BY o.idPregunta, o.orden ASC
    `);

  // agrupar opciones en preguntas
  const preguntas = pregRes.recordset.map(p => ({
    ...p,
    opciones: opRes.recordset.filter(o => o.idPregunta === p.idPregunta),
  }));

  return {
    ...totRes.recordset[0],
    preguntas,
  };
}

async function getTriviasAdmin(idEdicion) {
  const pool = await getPool();
  const result = await pool.request()
    .input('idEdicion', sql.Int, parseInt(idEdicion))
    .query(`
      SELECT t.idTrivia, t.titulo, t.activa, t.fechaCreacion,
             COUNT(DISTINCT p.idPregunta)  AS totalPreguntas,
             COUNT(DISTINCT r.idResultado) AS totalParticipantes,
             SUM(CASE WHEN r.aciertos = r.totalPreguntas THEN 1 ELSE 0 END) AS perfectos
      FROM   blog_trivia t
      LEFT JOIN blog_trivia_pregunta p  ON p.idTrivia  = t.idTrivia
      LEFT JOIN blog_trivia_resultado r ON r.idTrivia  = t.idTrivia
      WHERE  t.idEdicion = @idEdicion
      GROUP BY t.idTrivia, t.titulo, t.activa, t.fechaCreacion
    `);
  return result.recordset;
}

module.exports = {
  // tips
  getTipActivo, getTips, crearTip, toggleTip, eliminarTip,
  // trivia pública
  getTriviaEdicion, responderTrivia, getRankingTrivia,
  // trivia admin
  crearTrivia, getEstadisticasTrivia, getTriviasAdmin,
};