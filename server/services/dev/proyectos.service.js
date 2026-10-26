"use strict";
// ─────────────────────────────────────────────────────────────
// services/dev/proyectos.service.js
// Lógica central del módulo de Gestión de Desarrollo
// ─────────────────────────────────────────────────────────────
const sql = require("mssql");
const { getPool } = require("../../db");

// ── Catálogos (enum en código, sin tablas extra) ──────────────
const ESTATUS = {
  1: "En análisis",
  2: "En desarrollo",
  3: "En pruebas",
  4: "En revisión",
  5: "Liberado",
  6: "Cancelado",
  7: "En pausa",
};
const ETAPAS = {
  1: "Análisis",
  2: "Desarrollo",
  3: "Revisión",
  4: "Pruebas",
  5: "Liberación",
};
// Categorías de documento obligatorias para solicitar cierre
const DOCS_OBLIGATORIOS = [4, 5, 6]; // Manual usuario, Evidencia pruebas, Notas liberación

// ── Generar folio DEV-0001 ────────────────────────────────────
async function generarFolio(pool) {
  const r = await pool.request().query(`
    SELECT ISNULL(MAX(TRY_CAST(RIGHT(folio, 4) AS INT)), 0) + 1 AS siguiente
    FROM dev_proyectos
    WHERE folio LIKE 'DEV-%'
  `);
  const n = r.recordset[0].siguiente;
  return `DEV-${String(n).padStart(4, "0")}`;
}

// ── Bitácora interna del proyecto ────────────────────────────
async function bitacora(pool, { idProyecto, login, nombre, nota }) {
  // Reutilizamos solicitudTI_bitacora solo si el proyecto tiene
  // idSolicitudOrigen; si no, guardamos en dev_avances con idEstado=2
  // como nota interna. Para simplificar usamos un INSERT directo
  // en una nota de avance tipo "sistema".
  // Esto mantiene la trazabilidad sin crear otra tabla.
  await pool
    .request()
    .input("idProyecto", sql.Int, idProyecto)
    .input("login", sql.VarChar(255), login)
    .input("nombre", sql.NVarChar(200), nombre)
    .input("nota", sql.NVarChar(500), nota).query(`
      INSERT INTO dev_avances
        (idProyecto, loginDesarrollador, nombreDesarrollador,
         queTermine, enQueEstoy, queSigue,
         avancePctAnterior, avancePctNuevo, horasInvertidas, idEstado, fechaRegistro)
      SELECT
        @idProyecto, @login, @nombre,
        @nota, '', '',
        avancePct, avancePct, 0, 2, GETDATE()
      FROM dev_proyectos WHERE idProyecto = @idProyecto
    `);
}

// ════════════════════════════════════════════════════════════
// getCatalogos
// ════════════════════════════════════════════════════════════
async function getCatalogos() {
  const pool = await getPool();
  const tecnicos = await pool.request().query(`
    SELECT login, name AS nombre, email
    FROM sec_users
    WHERE area = 'SISTEMAS' AND active = 'Y'
    ORDER BY name
  `);
  return {
    estatus: Object.entries(ESTATUS).map(([id, nombre]) => ({
      id: +id,
      nombre,
    })),
    etapas: Object.entries(ETAPAS).map(([id, nombre]) => ({ id: +id, nombre })),
    prioridades: [
      { id: 1, nombre: "Alta" },
      { id: 2, nombre: "Media" },
      { id: 3, nombre: "Baja" },
    ],
    tecnicos: tecnicos.recordset,
    tiposDocumento: [
      { id: 1, nombre: "Análisis funcional" },
      { id: 2, nombre: "Documentación técnica" },
      { id: 3, nombre: "Diagrama" },
      { id: 4, nombre: "Manual de usuario" },
      { id: 5, nombre: "Evidencia de pruebas" },
      { id: 6, nombre: "Notas de liberación" },
      { id: 7, nombre: "API" },
      { id: 8, nombre: "Decisión técnica" },
      { id: 9, nombre: "Otro" },
    ],
  };
}

// ════════════════════════════════════════════════════════════
// getPortafolio — vista operativa del gerente
// ════════════════════════════════════════════════════════════
async function getPortafolio(query = {}) {
  const pool = await getPool();
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 50);
  const offset = (page - 1) * limit;

  const req = pool
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit);

  const conds = ["p.idEstatus NOT IN (6)"]; // Excluye cancelados por default

  if (query.estatus) {
    conds.push("p.idEstatus = @estatus");
    req.input("estatus", sql.TinyInt, parseInt(query.estatus));
  }
  if (query.responsable) {
    conds.push("p.loginResponsable = @responsable");
    req.input("responsable", sql.VarChar(255), query.responsable);
  }
  if (query.prioridad) {
    conds.push("p.prioridad = @prioridad");
    req.input("prioridad", sql.TinyInt, parseInt(query.prioridad));
  }
  if (query.buscar?.trim()) {
    conds.push(
      "(p.nombre LIKE @buscar OR p.folio LIKE @buscar OR p.areaSolicitante LIKE @buscar)",
    );
    req.input("buscar", sql.NVarChar(300), `%${query.buscar.trim()}%`);
  }
  if (query.riesgo === "true") conds.push("p.enRiesgo = 1");

  const r = await req.query(`
    SELECT
      p.idProyecto, p.folio, p.nombre, p.objetivo, p.areaSolicitante,
      p.loginResponsable, u.name AS nombreResponsable, u.picture AS fotoResponsable,
      p.prioridad, p.idEstatus, p.etapaActual,
      p.avancePct, p.avanceEsManual,
      p.fechaInicio, p.fechaCompromiso, p.fechaEstimadaLib,
      p.enRiesgo, p.motivoRiesgo,
      p.cierresolicitado,
      p.fechaCreacion,

      -- Tareas
      (SELECT COUNT(*) FROM dev_tareas t WHERE t.idProyecto = p.idProyecto) AS totalTareas,
      (SELECT COUNT(*) FROM dev_tareas t WHERE t.idProyecto = p.idProyecto AND t.idEstatus = 3) AS tareasCompletadas,

      -- Horas reales acumuladas
      (SELECT ISNULL(SUM(h.minutosTrabajos), 0) / 60.0
       FROM solicitudTI_desarrollo_horas h WHERE h.idProyecto = p.idProyecto) AS horasReales,

      -- Bloqueos activos
      (SELECT COUNT(*) FROM solicitudTI_desarrollo_bloqueos b
       WHERE b.idProyecto = p.idProyecto AND b.fechaResolucion IS NULL) AS bloqueosActivos,

      -- Días sin actualización publicada
      DATEDIFF(DAY,
        (SELECT MAX(a.fechaRegistro) FROM dev_avances a
         WHERE a.idProyecto = p.idProyecto AND a.idEstado = 1),
        GETDATE()) AS diasSinActualizar,

      -- Próximo hito
      (SELECT TOP 1 h.nombre FROM dev_hitos h
       WHERE h.idProyecto = p.idProyecto AND h.idEstatus IN (1,2)
       ORDER BY h.fechaCompromiso ASC) AS proximoHito,
      (SELECT TOP 1 h.fechaCompromiso FROM dev_hitos h
       WHERE h.idProyecto = p.idProyecto AND h.idEstatus IN (1,2)
       ORDER BY h.fechaCompromiso ASC) AS fechaProximoHito,

      COUNT(*) OVER() AS totalRegistros

    FROM dev_proyectos p
    LEFT JOIN sec_users u ON u.login = p.loginResponsable
    WHERE ${conds.join(" AND ")}
    ORDER BY p.enRiesgo DESC, p.prioridad ASC, p.fechaCompromiso ASC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `);

  return {
    data: r.recordset,
    total: r.recordset[0]?.totalRegistros ?? 0,
    page,
    limit,
  };
}

// ════════════════════════════════════════════════════════════
// getDetalle — expediente completo de un proyecto
// ════════════════════════════════════════════════════════════
async function getDetalle(idProyecto) {
  const pool = await getPool();

  const [principal, tareas, hitos, avances, bloqueos, archivos, etapas] =
    await Promise.all([
      pool.request().input("id", sql.Int, idProyecto).query(`
        SELECT p.*,
          u.name AS nombreResponsable, u.picture AS fotoResponsable,
          s.titulo AS solicitudTitulo,
          ISNULL(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'), s.folio) AS solicitudFolio
        FROM dev_proyectos p
        LEFT JOIN sec_users u ON u.login = p.loginResponsable
        LEFT JOIN solicitudTI s ON s.idSolicitud = p.idSolicitudOrigen
        WHERE p.idProyecto = @id
      `),
      pool.request().input("id", sql.Int, idProyecto).query(`
        SELECT t.*, u.name AS nombreAsignado
        FROM dev_tareas t
        LEFT JOIN sec_users u ON u.login = t.loginAsignado
        WHERE t.idProyecto = @id
        ORDER BY t.ordenVisualizacion, t.fechaCreacion
      `),
      pool.request().input("id", sql.Int, idProyecto).query(`
        SELECT h.*, u.name AS nombreValidador
        FROM dev_hitos h
        LEFT JOIN sec_users u ON u.login = h.validadoPor
        WHERE h.idProyecto = @id
        ORDER BY h.etapa, h.fechaCompromiso
      `),
      pool.request().input("id", sql.Int, idProyecto).query(`
        SELECT a.*, u.picture AS fotoDesarrollador
        FROM dev_avances a
        LEFT JOIN sec_users u ON u.login = a.loginDesarrollador
        WHERE a.idProyecto = @id AND a.idEstado = 1
        ORDER BY a.fechaRegistro DESC
      `),
      pool.request().input("id", sql.Int, idProyecto).query(`
        SELECT * FROM solicitudTI_desarrollo_bloqueos
        WHERE idProyecto = @id
        ORDER BY fechaBloqueo DESC
      `),
      pool.request().input("id", sql.Int, idProyecto).query(`
        SELECT idArchivo, nombreArchivo, rutaServidor, mimeType,
               tamanoBytes, fechaSubida, categoriaDoc, versionDoc,
               descripcionDoc, visibilidad, subidoPor
        FROM solicitudTI_archivos
        WHERE idProyecto = @id
        ORDER BY fechaSubida DESC
      `),
      pool.request().input("id", sql.Int, idProyecto).query(`
        SELECT * FROM dev_etapas_proyecto
        WHERE idProyecto = @id ORDER BY numeroEtapa
      `),
    ]);

  if (!principal.recordset.length) return null;

  return {
    ...principal.recordset[0],
    tareas: tareas.recordset,
    hitos: hitos.recordset,
    avances: avances.recordset,
    bloqueos: bloqueos.recordset,
    archivos: archivos.recordset,
    etapas: etapas.recordset,
  };
}

// ════════════════════════════════════════════════════════════
// crearProyecto
// ════════════════════════════════════════════════════════════
async function crearProyecto(body, user) {
  const pool = await getPool();
  const folio = await generarFolio(pool);

  if (!body.nombre?.trim())
    throw new Error("El nombre del proyecto es obligatorio.");
  if (!body.objetivo?.trim())
    throw new Error("El objetivo del proyecto es obligatorio.");

  const r = await pool
    .request()
    .input("folio", sql.VarChar(20), folio)
    .input("nombre", sql.NVarChar(200), body.nombre.trim())
    .input("objetivo", sql.NVarChar(500), body.objetivo.trim())
    .input(
      "descripcion",
      sql.NVarChar(sql.MAX),
      body.descripcion?.trim() || null,
    )
    .input(
      "areaSolicitante",
      sql.NVarChar(100),
      body.areaSolicitante?.trim() || null,
    )
    .input(
      "loginResponsable",
      sql.VarChar(255),
      body.loginResponsable || user.login,
    )
    .input("prioridad", sql.TinyInt, parseInt(body.prioridad) || 2)
    .input(
      "fechaInicio",
      sql.Date,
      body.fechaInicio ? new Date(body.fechaInicio) : null,
    )
    .input(
      "fechaCompromiso",
      sql.Date,
      body.fechaCompromiso ? new Date(body.fechaCompromiso) : null,
    )
    .input(
      "fechaEstimadaLib",
      sql.Date,
      body.fechaEstimadaLib ? new Date(body.fechaEstimadaLib) : null,
    )
    .input("creadoPor", sql.VarChar(255), user.login).query(`
      INSERT INTO dev_proyectos
        (folio, nombre, objetivo, descripcion, areaSolicitante,
         loginResponsable, prioridad, idEstatus, etapaActual,
         avancePct, fechaInicio, fechaCompromiso, fechaEstimadaLib,
         creadoPor, fechaCreacion)
      OUTPUT INSERTED.idProyecto
      VALUES
        (@folio, @nombre, @objetivo, @descripcion, @areaSolicitante,
         @loginResponsable, @prioridad, 1, 1,
         0, @fechaInicio, @fechaCompromiso, @fechaEstimadaLib,
         @creadoPor, GETDATE())
    `);

  const idProyecto = r.recordset[0].idProyecto;

  // Crear registro de etapa inicial (Análisis)
  await pool
    .request()
    .input("idProyecto", sql.Int, idProyecto)
    .input("login", sql.VarChar(255), user.login).query(`
      INSERT INTO dev_etapas_proyecto (idProyecto, numeroEtapa, fechaInicio, registradoPor)
      VALUES (@idProyecto, 1, GETDATE(), @login)
    `);

  return { idProyecto, folio };
}

// ════════════════════════════════════════════════════════════
// promoverSolicitud — convierte una solicitudTI en proyecto
// Solo lee de solicitudTI, no la modifica.
// ════════════════════════════════════════════════════════════
async function promoverSolicitud(body, user) {
  const pool = await getPool();
  const idSolicitud = parseInt(body.idSolicitud);
  if (!idSolicitud) throw new Error("idSolicitud es obligatorio.");

  // Verificar que no esté ya promovida
  const ya = await pool
    .request()
    .input("id", sql.Int, idSolicitud)
    .query(
      "SELECT idProyecto FROM dev_proyectos WHERE idSolicitudOrigen = @id",
    );
  if (ya.recordset.length)
    throw new Error(
      `Esta solicitud ya fue promovida al proyecto ${ya.recordset[0].idProyecto}.`,
    );

  // Leer datos de la solicitud (solo lectura)
  const sol = await pool.request().input("id", sql.Int, idSolicitud).query(`
      SELECT s.titulo,
             ISNULL(JSON_VALUE(s.camposExtra,'$.folioDesarrollo'), s.folio) AS folio,
             s.areaUsuario, s.tecnicoAsignado,
             dd.objetivo, dd.beneficioEsperado, dd.fechaCompromiso
      FROM solicitudTI s
      LEFT JOIN solicitudTI_desarrollo_detalle dd ON dd.idSolicitud = s.idSolicitud
      WHERE s.idSolicitud = @id AND s.idServicio = 2
    `);
  if (!sol.recordset.length)
    throw new Error("Solicitud de desarrollo no encontrada.");

  const s = sol.recordset[0];
  const folio = await generarFolio(pool);

  const r = await pool
    .request()
    .input("idSolicitudOrigen", sql.Int, idSolicitud)
    .input("folio", sql.VarChar(20), folio)
    .input("nombre", sql.NVarChar(200), s.titulo)
    .input("objetivo", sql.NVarChar(500), s.objetivo || s.titulo)
    .input("areaSolicitante", sql.NVarChar(100), s.areaUsuario || null)
    .input(
      "loginResponsable",
      sql.VarChar(255),
      s.tecnicoAsignado || user.login,
    )
    .input("prioridad", sql.TinyInt, parseInt(body.prioridad) || 2)
    .input("fechaCompromiso", sql.Date, s.fechaCompromiso || null)
    .input("creadoPor", sql.VarChar(255), user.login).query(`
      INSERT INTO dev_proyectos
        (idSolicitudOrigen, folio, nombre, objetivo, areaSolicitante,
         loginResponsable, prioridad, idEstatus, etapaActual,
         avancePct, fechaCompromiso, creadoPor, fechaCreacion)
      OUTPUT INSERTED.idProyecto
      VALUES
        (@idSolicitudOrigen, @folio, @nombre, @objetivo, @areaSolicitante,
         @loginResponsable, @prioridad, 1, 1,
         0, @fechaCompromiso, @creadoPor, GETDATE())
    `);

  const idProyecto = r.recordset[0].idProyecto;

  await pool
    .request()
    .input("idProyecto", sql.Int, idProyecto)
    .input("login", sql.VarChar(255), user.login).query(`
      INSERT INTO dev_etapas_proyecto (idProyecto, numeroEtapa, fechaInicio, registradoPor)
      VALUES (@idProyecto, 1, GETDATE(), @login)
    `);

  return { idProyecto, folio, solicitudFolio: s.folio };
}

// ════════════════════════════════════════════════════════════
// actualizarProyecto
// ════════════════════════════════════════════════════════════
async function actualizarProyecto(idProyecto, body, user) {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .input("nombre", sql.NVarChar(200), body.nombre?.trim() || null)
    .input("objetivo", sql.NVarChar(500), body.objetivo?.trim() || null)
    .input(
      "descripcion",
      sql.NVarChar(sql.MAX),
      body.descripcion?.trim() || null,
    )
    .input(
      "areaSolicitante",
      sql.NVarChar(100),
      body.areaSolicitante?.trim() || null,
    )
    .input("loginResponsable", sql.VarChar(255), body.loginResponsable || null)
    .input(
      "prioridad",
      sql.TinyInt,
      body.prioridad ? parseInt(body.prioridad) : null,
    )
    .input(
      "fechaCompromiso",
      sql.Date,
      body.fechaCompromiso ? new Date(body.fechaCompromiso) : null,
    )
    .input(
      "fechaEstimadaLib",
      sql.Date,
      body.fechaEstimadaLib ? new Date(body.fechaEstimadaLib) : null,
    )
    .input("modificadoPor", sql.VarChar(255), user.login).query(`
      UPDATE dev_proyectos SET
        nombre           = ISNULL(@nombre,           nombre),
        objetivo         = ISNULL(@objetivo,         objetivo),
        descripcion      = ISNULL(@descripcion,      descripcion),
        areaSolicitante  = ISNULL(@areaSolicitante,  areaSolicitante),
        loginResponsable = ISNULL(@loginResponsable, loginResponsable),
        prioridad        = ISNULL(@prioridad,        prioridad),
        fechaCompromiso  = ISNULL(@fechaCompromiso,  fechaCompromiso),
        fechaEstimadaLib = ISNULL(@fechaEstimadaLib, fechaEstimadaLib),
        modificadoPor    = @modificadoPor,
        fechaModificacion= GETDATE()
      WHERE idProyecto = @id
    `);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// cambiarEstatus
// ════════════════════════════════════════════════════════════
async function cambiarEstatus(idProyecto, body, user) {
  const pool = await getPool();
  const idEstatus = parseInt(body.idEstatus);
  if (!ESTATUS[idEstatus]) throw new Error("Estatus inválido.");

  // Si avanza de etapa, cerrar la anterior y abrir la nueva
  const actual = await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .query(
      "SELECT idEstatus, etapaActual FROM dev_proyectos WHERE idProyecto = @id",
    );
  const row = actual.recordset[0];
  if (!row) throw new Error("Proyecto no encontrado.");

  const etapaNueva = parseInt(body.etapaActual) || row.etapaActual;

  if (etapaNueva !== row.etapaActual) {
    // Cerrar etapa actual
    await pool
      .request()
      .input("id", sql.Int, idProyecto)
      .input("etapa", sql.TinyInt, row.etapaActual).query(`
        UPDATE dev_etapas_proyecto SET fechaCierre = CAST(GETDATE() AS DATE)
        WHERE idProyecto = @id AND numeroEtapa = @etapa AND fechaCierre IS NULL
      `);
    // Abrir nueva etapa si no existe
    await pool
      .request()
      .input("id", sql.Int, idProyecto)
      .input("etapa", sql.TinyInt, etapaNueva)
      .input("login", sql.VarChar(255), user.login).query(`
        IF NOT EXISTS (SELECT 1 FROM dev_etapas_proyecto WHERE idProyecto=@id AND numeroEtapa=@etapa)
          INSERT INTO dev_etapas_proyecto (idProyecto, numeroEtapa, fechaInicio, registradoPor)
          VALUES (@id, @etapa, GETDATE(), @login)
      `);
  }

  await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .input("idEstatus", sql.TinyInt, idEstatus)
    .input("etapaActual", sql.TinyInt, etapaNueva)
    .input("login", sql.VarChar(255), user.login).query(`
      UPDATE dev_proyectos SET
        idEstatus       = @idEstatus,
        etapaActual     = @etapaActual,
        modificadoPor   = @login,
        fechaModificacion = GETDATE()
      WHERE idProyecto = @id
    `);

  await bitacora(pool, {
    idProyecto,
    login: user.login,
    nombre: user.name,
    nota: `Estatus cambiado a "${ESTATUS[idEstatus]}"${etapaNueva !== row.etapaActual ? ` — Etapa: ${ETAPAS[etapaNueva]}` : ""}${body.observaciones ? ` — ${body.observaciones}` : ""}`,
  });

  // Recalcular riesgo
  await _evaluarRiesgo(pool, idProyecto);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// actualizarAvanceManual
// Solo permitido cuando no hay tareas definidas.
// Si hay tareas, el avance se calcula automáticamente.
// ════════════════════════════════════════════════════════════
async function actualizarAvanceManual(idProyecto, body, user) {
  const pool = await getPool();
  const avanceNuevo = parseInt(body.avancePct);
  if (isNaN(avanceNuevo) || avanceNuevo < 0 || avanceNuevo > 100)
    throw new Error("El porcentaje debe estar entre 0 y 100.");

  // Verificar si hay tareas — si las hay, rechazar avance manual
  const tareas = await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .query(
      "SELECT COUNT(*) AS total FROM dev_tareas WHERE idProyecto = @id AND idEstatus != 4",
    );
  if (tareas.recordset[0].total > 0)
    throw new Error(
      "Este proyecto tiene tareas definidas. El avance se calcula automáticamente.",
    );

  const actual = await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .query("SELECT avancePct FROM dev_proyectos WHERE idProyecto = @id");
  const avanceAnterior = actual.recordset[0]?.avancePct ?? 0;

  // Si sube más de 20 puntos, exigir justificación
  if (avanceNuevo - avanceAnterior > 20 && !body.justificacion?.trim())
    throw new Error(
      "El avance subió más de 20 puntos. Es obligatorio indicar la justificación.",
    );

  await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .input("avance", sql.TinyInt, avanceNuevo)
    .input("anterior", sql.TinyInt, avanceAnterior)
    .input("justif", sql.NVarChar(500), body.justificacion?.trim() || null)
    .input("login", sql.VarChar(255), user.login).query(`
      UPDATE dev_proyectos SET
        avancePct          = @avance,
        avanceEsManual     = 1,
        avanceAnteriorPct  = @anterior,
        avanceJustificacion= @justif,
        modificadoPor      = @login,
        fechaModificacion  = GETDATE()
      WHERE idProyecto = @id
    `);

  await _evaluarRiesgo(pool, idProyecto);
  return { ok: true, avanceAnterior, avanceNuevo };
}

// ════════════════════════════════════════════════════════════
// recalcularAvance — llamado cuando se completa/cambia una tarea
// Avance = Σ(peso × completada) / Σ(peso) × 100
// ════════════════════════════════════════════════════════════
async function recalcularAvance(idProyecto) {
  const pool = await getPool();
  const r = await pool.request().input("id", sql.Int, idProyecto).query(`
      SELECT
        ISNULL(SUM(peso), 0) AS pesoTotal,
        ISNULL(SUM(CASE WHEN idEstatus = 3 THEN peso ELSE 0 END), 0) AS pesoCompletado
      FROM dev_tareas
      WHERE idProyecto = @id AND idEstatus != 4  -- Excluye canceladas
    `);

  const { pesoTotal, pesoCompletado } = r.recordset[0];
  if (pesoTotal === 0) return { ok: true, avancePct: null }; // Sin tareas, no se toca

  const avancePct = Math.round((pesoCompletado / pesoTotal) * 100);

  await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .input("avance", sql.TinyInt, avancePct).query(`
      UPDATE dev_proyectos SET
        avancePct       = @avance,
        avanceEsManual  = 0,
        fechaModificacion = GETDATE()
      WHERE idProyecto = @id
    `);

  await _evaluarRiesgo(pool, idProyecto);
  return { ok: true, avancePct };
}

// ════════════════════════════════════════════════════════════
// solicitarCierre — el desarrollador lo pide
// Valida que existan los 3 documentos obligatorios
// ════════════════════════════════════════════════════════════
async function solicitarCierre(idProyecto, user) {
  const pool = await getPool();

  // Verificar documentos obligatorios
  const docs = await pool.request().input("id", sql.Int, idProyecto).query(`
      SELECT categoriaDoc FROM solicitudTI_archivos
      WHERE idProyecto = @id AND categoriaDoc IN (4, 5, 6)
    `);
  const categoriasCargadas = docs.recordset.map((d) => d.categoriaDoc);
  const faltantes = DOCS_OBLIGATORIOS.filter(
    (c) => !categoriasCargadas.includes(c),
  );

  if (faltantes.length) {
    const nombres = {
      4: "Manual de usuario",
      5: "Evidencia de pruebas",
      6: "Notas de liberación",
    };
    throw new Error(
      `Faltan documentos obligatorios: ${faltantes.map((f) => nombres[f]).join(", ")}`,
    );
  }

  await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .input("login", sql.VarChar(255), user.login).query(`
      UPDATE dev_proyectos SET
        cierresolicitado    = 1,
        idEstatus           = 4,
        fechaSolicitudCierre= GETDATE(),
        loginSolicitoCierre = @login,
        modificadoPor       = @login,
        fechaModificacion   = GETDATE()
      WHERE idProyecto = @id
    `);

  await bitacora(pool, {
    idProyecto,
    login: user.login,
    nombre: user.name,
    nota: "Solicitud de cierre enviada al Gerente de TI para aprobación",
  });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// aprobarCierre — solo el gerente
// ════════════════════════════════════════════════════════════
async function aprobarCierre(idProyecto, user) {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .input("login", sql.VarChar(255), user.login).query(`
      UPDATE dev_proyectos SET
        idEstatus        = 5,
        etapaActual      = 5,
        avancePct        = 100,
        fechaLiberacion  = GETDATE(),
        aprobadoPor      = @login,
        fechaAprobacion  = GETDATE(),
        modificadoPor    = @login,
        fechaModificacion= GETDATE()
      WHERE idProyecto = @id AND cierresolicitado = 1
    `);
  await bitacora(pool, {
    idProyecto,
    login: user.login,
    nombre: user.name,
    nota: `Proyecto aprobado y liberado por ${user.name}`,
  });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// rechazarCierre — el gerente devuelve al desarrollador
// ════════════════════════════════════════════════════════════
async function rechazarCierre(idProyecto, body, user) {
  if (!body.motivo?.trim())
    throw new Error("El motivo del rechazo es obligatorio.");
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .input("login", sql.VarChar(255), user.login).query(`
      UPDATE dev_proyectos SET
        cierresolicitado = 0,
        idEstatus        = 2,
        modificadoPor    = @login,
        fechaModificacion= GETDATE()
      WHERE idProyecto = @id
    `);
  await bitacora(pool, {
    idProyecto,
    login: user.login,
    nombre: user.name,
    nota: `Cierre rechazado por ${user.name}: ${body.motivo.trim()}`,
  });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════
// evaluarRiesgo — público para el endpoint y privado interno
// Reglas acordadas con FABPSA:
//   1. Bloqueo activo > 3 días sin resolver
//   2. fechaCompromiso en < 7 días Y avancePct < 70
//   3. Sin actualización publicada en > 7 días (proyecto activo)
// ════════════════════════════════════════════════════════════
async function _evaluarRiesgo(pool, idProyecto) {
  const r = await pool.request().input("id", sql.Int, idProyecto).query(`
      SELECT
        p.idEstatus, p.avancePct, p.fechaCompromiso,
        -- Regla 1: bloqueo sin resolver > 3 días
        (SELECT COUNT(*) FROM solicitudTI_desarrollo_bloqueos b
         WHERE b.idProyecto = @id
           AND b.fechaResolucion IS NULL
           AND DATEDIFF(DAY, b.fechaBloqueo, GETDATE()) > 3) AS bloqueosCriticos,
        -- Regla 2: fecha próxima con avance bajo
        CASE WHEN p.fechaCompromiso IS NOT NULL
                  AND DATEDIFF(DAY, GETDATE(), p.fechaCompromiso) < 7
                  AND p.avancePct < 70 THEN 1 ELSE 0 END AS fechaRiesgo,
        -- Regla 3: días sin actualización
        DATEDIFF(DAY,
          (SELECT MAX(a.fechaRegistro) FROM dev_avances a
           WHERE a.idProyecto = @id AND a.idEstado = 1),
          GETDATE()) AS diasSinActualizar
      FROM dev_proyectos p WHERE p.idProyecto = @id
    `);

  const row = r.recordset[0];
  if (!row || [5, 6, 7].includes(row.idEstatus)) return;

  const motivos = [];
  if (row.bloqueosCriticos > 0)
    motivos.push("Bloqueo activo sin resolver por más de 3 días");
  if (row.fechaRiesgo)
    motivos.push("Fecha compromiso próxima con avance menor al 70%");
  if ((row.diasSinActualizar ?? 0) > 7)
    motivos.push("Sin actualización de avance por más de 7 días");

  const enRiesgo = motivos.length > 0 ? 1 : 0;
  const motivoRiesgo = motivos.join("; ") || null;

  await pool
    .request()
    .input("id", sql.Int, idProyecto)
    .input("riesgo", sql.Bit, enRiesgo)
    .input("motivo", sql.NVarChar(300), motivoRiesgo).query(`
      UPDATE dev_proyectos SET enRiesgo = @riesgo, motivoRiesgo = @motivo
      WHERE idProyecto = @id
    `);
}

async function evaluarRiesgo(idProyecto) {
  const pool = await getPool();
  await _evaluarRiesgo(pool, idProyecto);
  return { ok: true };
}

module.exports = {
  getCatalogos,
  getPortafolio,
  getDetalle,
  crearProyecto,
  promoverSolicitud,
  actualizarProyecto,
  cambiarEstatus,
  actualizarAvanceManual,
  recalcularAvance,
  solicitarCierre,
  aprobarCierre,
  rechazarCierre,
  evaluarRiesgo,
  _evaluarRiesgo, // exportado para uso interno de otros services
};
