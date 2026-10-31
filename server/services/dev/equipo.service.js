"use strict";
// ─────────────────────────────────────────────────────────────
// services/dev/equipo.service.js
// Carga de trabajo por desarrollador
// Carga% = horasComprometidas / horasDisponibles * 100
// ─────────────────────────────────────────────────────────────
const sql = require("mssql");
const { getPool } = require("../../db");

// Periodo actual si no se especifica: YYYY-MM
function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Personas de Sistemas que NO son desarrolladores (soporte, coordinación,
// etc.) pero quedaron con el área "SISTEMAS" en sec_users. Se excluyen sólo
// de esta vista — siguen activos en el sistema, sólo no cuentan como carga
// de equipo de desarrollo.
const {esDesarrolladorPermitido} = require("./desarrolladores.policy");

function clasificarCarga(pct) {
  if (pct === null || pct === undefined) return "sin_datos";
  if (pct < 50)  return "disponible";
  if (pct < 80)  return "adecuada";
  if (pct <= 95) return "alta";
  return "sobrecarga";
}

// ════════════════════════════════════════════════════════════
// getEquipo — resumen de todo el equipo para la vista "Mi equipo"
// ════════════════════════════════════════════════════════════
async function getEquipo(periodo) {
  const pool   = await getPool();
  const p      = periodo || periodoActual();

  // Todos los desarrolladores activos de Sistemas — excluye a quienes son
  // del área pero no son desarrolladores (ver desarrolladores.policy).
  const devsRaw = await pool.request().query(`
    SELECT login, name AS nombre, email, picture
    FROM sec_users
    WHERE area = 'SISTEMAS' AND active = 'Y'
    ORDER BY name
  `);
  const devs = { recordset: devsRaw.recordset.filter(d => esDesarrolladorPermitido(d.nombre)) };

  const logins  = devs.recordset.map(d => d.login);
  if (!logins.length) return { data: [], periodo: p, bloqueos: [], resumen: { totalDesarrolladores: 0, capacidadTotal: 0, integrantesSinCapacidad: 0, horasRegistradas: 0, horasDisponibles: 0, horasComprometidas: 0, cargaEquipoPct: null, bloqueosActivos: 0 } };

  const loginList = logins.map(l => `'${l.replaceAll("'","''")}'`).join(",");

  // Proyectos activos por desarrollador
  const proyectos = await pool.request().query(`
    SELECT p.loginResponsable, COUNT(*) AS totalProyectos,
      SUM(CASE WHEN p.idEstatus IN (1,2,3,4,7) THEN 1 ELSE 0 END) AS proyectosActivos
    FROM dev_proyectos p
    WHERE p.loginResponsable IN (${loginList})
    GROUP BY p.loginResponsable
  `);

  // Tareas activas por desarrollador
  const tareas = await pool.request().query(`
    SELECT t.loginAsignado,
      COUNT(*) AS tareasActivas,
      SUM(ISNULL(t.horasEstimadas, 0)) AS horasEstimadasTotales,
      SUM(ISNULL(t.horasReales,    0)) AS horasRealesCargadas
    FROM dev_tareas t
    WHERE t.loginAsignado IN (${loginList}) AND t.idEstatus IN (1, 2)
    GROUP BY t.loginAsignado
  `);

  // Bloqueos activos — detalle completo (para el panel "Bloqueos que
  // requieren apoyo") y también se agrupan por desarrollador más abajo.
  const bloqueosDetalle = await pool.request().query(`
    SELECT b.idBloqueo, p.loginResponsable, p.nombre AS proyectoNombre,
      b.motivo, b.tipo, b.impacto, b.fechaBloqueo, b.dependeDe, b.accionRequerida
    FROM solicitudTI_desarrollo_bloqueos b
    JOIN dev_proyectos p ON p.idProyecto = b.idProyecto
      OR (b.idProyecto IS NULL AND p.idSolicitudOrigen = b.idSolicitud)
    WHERE p.loginResponsable IN (${loginList}) AND b.fechaResolucion IS NULL
    ORDER BY b.fechaBloqueo DESC
  `);
  const bloqueosPorDev = {};
  for (const b of bloqueosDetalle.recordset) {
    (bloqueosPorDev[b.loginResponsable] ??= []).push(b);
  }

  // Última actualización de avance por desarrollador
  const ultimaAct = await pool.request().query(`
    SELECT a.loginDesarrollador,
      MAX(a.fechaRegistro) AS ultimaActualizacion
    FROM dev_avances a
    WHERE a.loginDesarrollador IN (${loginList}) AND a.idEstado = 1
    GROUP BY a.loginDesarrollador
  `);

  // Próximo compromiso por desarrollador
  const proximoComp = await pool.request().query(`
    SELECT p.loginResponsable,
      MIN(p.fechaCompromiso) AS proximoCompromiso,
      (SELECT TOP 1 p2.nombre FROM dev_proyectos p2
       WHERE p2.loginResponsable = p.loginResponsable
         AND p2.fechaCompromiso = MIN(p.fechaCompromiso)) AS proyectoProximo
    FROM dev_proyectos p
    WHERE p.loginResponsable IN (${loginList})
      AND p.idEstatus IN (1,2,3,4)
      AND p.fechaCompromiso IS NOT NULL
    GROUP BY p.loginResponsable
  `);

  // Capacidad definida por el gerente para el periodo
  const capacidad = await pool.request()
    .input("periodo", sql.Char(7), p)
    .query(`
      SELECT loginUsuario, horasDisponibles
      FROM dev_capacidad
      WHERE periodo = @periodo AND loginUsuario IN (${loginList})
    `);

  // Proyecto actual (el de mayor avance activo)
  const proyActual = await pool.request().query(`
    SELECT p.loginResponsable, p.nombre AS proyectoActual, p.avancePct,
      (SELECT TOP 1 a.enQueEstoy FROM dev_avances a
       WHERE a.idProyecto = p.idProyecto AND a.idEstado = 1
       ORDER BY a.fechaRegistro DESC) AS actividadActual
    FROM dev_proyectos p
    WHERE p.loginResponsable IN (${loginList})
      AND p.idEstatus IN (2, 3)
      AND p.avancePct = (
        SELECT MAX(p2.avancePct) FROM dev_proyectos p2
        WHERE p2.loginResponsable = p.loginResponsable AND p2.idEstatus IN (2,3)
      )
  `);

  // Published advances already write this ledger; do not sum advances again.
  const registradas = await pool.request().input('periodo',sql.Char(7),p).query(`SELECT loginUsuario, SUM(minutosTrabajos)/60.0 AS horasRegistradas FROM solicitudTI_desarrollo_horas WHERE fechaTrabajo>=CAST(@periodo+'-01' AS DATE) AND fechaTrabajo<DATEADD(month,1,CAST(@periodo+'-01' AS DATE)) AND loginUsuario IN (${loginList}) GROUP BY loginUsuario`);
  const horasPorLogin = new Map(registradas.recordset.map(r=>[r.loginUsuario.trim().toLowerCase(),Number(r.horasRegistradas)]));
  // Construir mapa por login
  const maps = {
    proyectos:    Object.fromEntries(proyectos.recordset.map(r => [r.loginResponsable, r])),
    tareas:       Object.fromEntries(tareas.recordset.map(r => [r.loginAsignado, r])),
    ultimaAct:    Object.fromEntries(ultimaAct.recordset.map(r => [r.loginDesarrollador, r])),
    proximoComp:  Object.fromEntries(proximoComp.recordset.map(r => [r.loginResponsable, r])),
    capacidad:    Object.fromEntries(capacidad.recordset.map(r => [r.loginUsuario, r])),
    proyActual:   Object.fromEntries(proyActual.recordset.map(r => [r.loginResponsable, r])),
  };

  // Horas comprometidas = horas estimadas de tareas activas
  const data = devs.recordset.map(dev => {
    const t          = maps.tareas[dev.login];
    const cap        = maps.capacidad[dev.login];
    const horasComp  = t?.horasEstimadasTotales ?? 0;
    const horasDisp  = cap?.horasDisponibles ?? null;
    const cargaPct   = horasDisp ? Math.round((horasComp / horasDisp) * 100) : null;

    return {
      login:             dev.login,
      nombre:            dev.nombre,
      picture:           dev.picture,
      proyectosActivos:  maps.proyectos[dev.login]?.proyectosActivos ?? 0,
      tareasActivas:     t?.tareasActivas ?? 0,
      bloqueosActivos:   bloqueosPorDev[dev.login]?.length ?? 0,
      ultimaActualizacion: maps.ultimaAct[dev.login]?.ultimaActualizacion ?? null,
      proximoCompromiso: maps.proximoComp[dev.login]?.proximoCompromiso ?? null,
      proyectoProximo:   maps.proximoComp[dev.login]?.proyectoProximo ?? null,
      proyectoActual:    maps.proyActual[dev.login]?.proyectoActual ?? null,
      actividadActual:   maps.proyActual[dev.login]?.actividadActual ?? null,
      horasDisponibles:  horasDisp,
      horasRegistradas: horasPorLogin.get(dev.login.trim().toLowerCase()) ?? 0,
      horasComprometidas:horasComp,
      cargaPct,
      clasificacionCarga: clasificarCarga(cargaPct),
    };
  });

  // Totales del equipo para el panel "Balance del equipo"
  const totalHorasDisp  = data.reduce((s, d) => s + (d.horasDisponibles  ?? 0), 0);
  const totalHorasComp  = data.reduce((s, d) => s + (d.horasComprometidas ?? 0), 0);
  const totalBloqueos   = data.reduce((s, d) => s + d.bloqueosActivos, 0);

  // Lista real (no inventada) para el panel "Bloqueos que requieren apoyo".
  const nombrePorLogin = Object.fromEntries(devs.recordset.map(d => [d.login, d.nombre]));
  const bloqueos = bloqueosDetalle.recordset.map(b => ({
    idBloqueo:       b.idBloqueo,
    dev:             nombrePorLogin[b.loginResponsable] || b.loginResponsable,
    proyecto:        b.proyectoNombre,
    motivo:          b.motivo,
    accionRequerida: b.accionRequerida,
    fecha:           b.fechaBloqueo,
  }));

  return {
    data, periodo: p, bloqueos,
    resumen: {
      totalDesarrolladores: data.length,
      capacidadTotal: data.every(d=>d.horasDisponibles!=null) ? totalHorasDisp : null,
      integrantesSinCapacidad: data.filter(d=>d.horasDisponibles==null).length,
      horasRegistradas: data.reduce((sum,d)=>sum+d.horasRegistradas,0),
      horasDisponibles: data.every(d=>d.horasDisponibles!=null) ? Math.max(0,totalHorasDisp-totalHorasComp) : null,
      horasComprometidas:totalHorasComp,
      cargaEquipoPct:    data.every(d=>d.horasDisponibles!=null) && totalHorasDisp ? Math.round((totalHorasComp / totalHorasDisp) * 100) : null,
      bloqueosActivos:   totalBloqueos,
    },
  };
}

// ════════════════════════════════════════════════════════════
// getDesarrollador — ficha detallada de un desarrollador
// ════════════════════════════════════════════════════════════
async function getDesarrollador(login, periodo) {
  const pool = await getPool();
  const p    = periodo || periodoActual();

  const [dev, proyectos, tareas, avances, bloqueos, horas, capacidad] =
    await Promise.all([
      pool.request().input("login", sql.VarChar(255), login)
        .query("SELECT login, name AS nombre, email, picture FROM sec_users WHERE login = @login"),

      pool.request().input("login", sql.VarChar(255), login).query(`
        SELECT p.idProyecto, p.folio, p.nombre, p.idEstatus, p.etapaActual,
          p.avancePct, p.fechaCompromiso, p.enRiesgo, p.prioridad
        FROM dev_proyectos p
        WHERE p.loginResponsable = @login AND p.idEstatus NOT IN (6)
        ORDER BY p.idEstatus ASC, p.fechaCompromiso ASC
      `),

      pool.request().input("login", sql.VarChar(255), login).query(`
        SELECT t.idTarea, t.idProyecto, t.titulo, t.idEstatus,
          t.fechaCompromiso, t.horasEstimadas, t.esEntregable, t.peso,
          p.nombre AS proyectoNombre
        FROM dev_tareas t
        JOIN dev_proyectos p ON p.idProyecto = t.idProyecto
        WHERE t.loginAsignado = @login AND t.idEstatus IN (1, 2)
        ORDER BY t.fechaCompromiso ASC
      `),

      pool.request().input("login", sql.VarChar(255), login).query(`
        SELECT TOP 5 a.idAvance, a.idProyecto, a.queTermine, a.enQueEstoy, a.queSigue,
          a.avancePctAnterior, a.avancePctNuevo, a.horasInvertidas,
          a.tieneBloqueo, a.apoyoRequerido, a.fechaRegistro,
          p.nombre AS proyectoNombre
        FROM dev_avances a
        JOIN dev_proyectos p ON p.idProyecto = a.idProyecto
        WHERE a.loginDesarrollador = @login AND a.idEstado = 1
        ORDER BY a.fechaRegistro DESC
      `),

      pool.request().input("login", sql.VarChar(255), login).query(`
        SELECT b.idBloqueo, b.motivo, b.tipo, b.impacto,
          b.fechaBloqueo, b.dependeDe, b.accionRequerida,
          p.nombre AS proyectoNombre
        FROM solicitudTI_desarrollo_bloqueos b
        JOIN dev_proyectos p ON p.idProyecto = b.idProyecto
      OR (b.idProyecto IS NULL AND p.idSolicitudOrigen = b.idSolicitud)
        WHERE p.loginResponsable = @login AND b.fechaResolucion IS NULL
      `),

      pool.request()
        .input("login", sql.VarChar(255), login)
        .input("periodo", sql.Char(7), p)
        .query(`
          SELECT SUM(minutosTrabajos) AS minutosTotales
          FROM solicitudTI_desarrollo_horas
          WHERE loginUsuario = @login
            AND FORMAT(fechaTrabajo, 'yyyy-MM') = @periodo
        `),

      pool.request()
        .input("login",   sql.VarChar(255), login)
        .input("periodo", sql.Char(7),      p)
        .query("SELECT horasDisponibles FROM dev_capacidad WHERE loginUsuario = @login AND periodo = @periodo"),
    ]);

  if (!dev.recordset.length) throw new Error("Desarrollador no encontrado.");

  const minutosTotales  = horas.recordset[0]?.minutosTotales ?? 0;
  const horasRegistradas = minutosTotales / 60;
  const horasDisponibles = capacidad.recordset[0]?.horasDisponibles ?? null;
  const horasComp        = tareas.recordset.reduce((s, t) => s + (t.horasEstimadas ?? 0), 0);
  const cargaPct         = horasDisponibles ? Math.round((horasComp / horasDisponibles) * 100) : null;

  return {
    ...dev.recordset[0],
    periodo: p,
    proyectos:    proyectos.recordset,
    tareasActivas:tareas.recordset,
    ultimosAvances:avances.recordset,
    bloqueosActivos:bloqueos.recordset,
    horasRegistradas,
    horasDisponibles,
    horasComprometidas: horasComp,
    cargaPct,
    clasificacionCarga: clasificarCarga(cargaPct),
  };
}

// ════════════════════════════════════════════════════════════
// setCapacidad — el gerente define horas disponibles del mes
// ════════════════════════════════════════════════════════════
async function setCapacidad(body, user) {
  const pool = await getPool();
  if (!body.loginUsuario)     throw new Error("loginUsuario es obligatorio.");
  if (!body.periodo)          throw new Error("periodo es obligatorio (formato YYYY-MM).");
  if (!body.horasDisponibles) throw new Error("horasDisponibles es obligatorio.");

  await pool.request()
    .input("login",  sql.VarChar(255), body.loginUsuario)
    .input("periodo",sql.Char(7),      body.periodo)
    .input("horas",  sql.Decimal(5,1), parseFloat(body.horasDisponibles))
    .input("obs",    sql.NVarChar(300),body.observaciones?.trim() || null)
    .input("regPor", sql.VarChar(255), user.login)
    .query(`
      MERGE dev_capacidad AS t
      USING (SELECT @login AS l, @periodo AS p) AS s ON t.loginUsuario = s.l AND t.periodo = s.p
      WHEN MATCHED THEN
        UPDATE SET horasDisponibles = @horas, observaciones = @obs, registradoPor = @regPor, fechaRegistro = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (loginUsuario, periodo, horasDisponibles, observaciones, registradoPor, fechaRegistro)
        VALUES (@login, @periodo, @horas, @obs, @regPor, GETDATE());
    `);
  return { ok: true };
}

module.exports = { getEquipo, getDesarrollador, setCapacidad };
