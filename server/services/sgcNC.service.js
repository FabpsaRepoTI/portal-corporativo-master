// server/services/sgcNC.service.js
// No Conformidades del SGC/SGI.
//
// Ciclo de vida: 1 Abierta → 2 En análisis → 3 En ejecución → 4 Verificación → 5 Cerrada
//                (6 Cancelada desde cualquier estado abierto)
// No se saltan estados: se avanza o retrocede de uno en uno. Cerrar (solo
// desde Verificación) y cancelar: solo el Coordinador. Cerrada y Cancelada
// son finales. Cada movimiento se inserta en sgc_historial_nc (inmutable).
//
// Permisos: crean NCs el Coordinador (1) y el Responsable de área (3);
// el Responsable solo ve y mueve las suyas; Dirección (4) solo lee.
const { getPool, sql } = require("../db");
const { generarFolio } = require("./sgcFolio.service");
const { listarArchivos } = require("./sgcArchivos.service");
const { notificar } = require("./sgc.notificaciones.service");
const C = require("./sgcComun.service");
const { _err, _int, _ints, _fecha, _texto, _mismo, _paginacion, _in, _like, _rollback, _abortar, HOY_SQL, NC_ESTATUS, AC_ESTATUS } = C;

const FINALES = [5, 6];

const NC_VENCIDA = `CASE WHEN nc.idEstatus NOT IN (5, 6) AND nc.fechaCompromiso < ${HOY_SQL} THEN 1 ELSE 0 END`;

const NC_FROM = `
  FROM sgc_no_conformidades nc
  JOIN sgc_cat_origenes o         ON o.idOrigen = nc.idOrigen
  JOIN sgc_cat_clasificaciones c  ON c.idClasificacion = nc.idClasificacion
  LEFT JOIN sec_users ur          ON ur.login = nc.loginResponsable
  LEFT JOIN sec_users uc          ON uc.login = nc.loginDetecta
`;

const _puedeVer = (req, nc) => req.sgcRol !== 3 || _mismo(nc.loginResponsable, req.login);

function _formatear(n) {
  const vencida = !!n.esVencida;
  return {
    ...n,
    esVencida: vencida,
    estatusLabel: NC_ESTATUS[n.idEstatus],
    diasVencido: vencida ? Math.abs(n.diasRestantes) : null,
  };
}

/**
 * Estatus válidos desde `actual` para el rol (sin saltos).
 * Devuelve [] si no puede mover la NC.
 */
function transicionesNC(rol, actual, esResponsable) {
  if (rol === 4 || FINALES.includes(actual)) return [];
  if (rol === 3 && !esResponsable) return [];
  const destinos = [];
  if (actual > 1) destinos.push(actual - 1);
  if (actual < 4) destinos.push(actual + 1);
  if (rol === 1) {
    if (actual === 4) destinos.push(5);
    destinos.push(6);
  }
  return destinos;
}

/**
 * Inserta una NC + su alta en el historial dentro de `tx`.
 * d: { idOrigen, idClasificacion, idAfectacion, codigoDpto, idSitio, idProceso, descripcion,
 *      descripcionDetallada, herramientas[], loginResponsable, fechaDeteccion, fechaCompromiso }
 */
async function insertarNC(tx, idEmpresa, login, d, motivoAlta = "Alta de la no conformidad") {
  const folio = await generarFolio("NC", tx, idEmpresa);
  const ins = await new sql.Request(tx)
    .input("idEmpresa", sql.Int, idEmpresa)
    .input("folio", sql.VarChar(20), folio)
    .input("idOrigen", sql.TinyInt, d.idOrigen)
    .input("idClasificacion", sql.TinyInt, d.idClasificacion)
    .input("idAfectacion", sql.TinyInt, d.idAfectacion || null)
    .input("codigoDpto", sql.VarChar(20), d.codigoDpto || null)
    .input("idSitio", sql.Int, d.idSitio || null)
    .input("idProceso", sql.Int, d.idProceso || null)
    .input("descripcion", sql.NVarChar(sql.MAX), d.descripcion)
    .input("detallada", sql.NVarChar(sql.MAX), d.descripcionDetallada || null)
    .input("herramientas", sql.VarChar(100), d.herramientas?.length ? d.herramientas.join(",") : null)
    .input("login", sql.VarChar(255), login)
    .input("loginResponsable", sql.VarChar(255), d.loginResponsable)
    .input("fechaDeteccion", sql.Date, d.fechaDeteccion)
    .input("fechaCompromiso", sql.Date, d.fechaCompromiso)
    .query(`
      INSERT INTO sgc_no_conformidades
        (idEmpresa, folioNC, idEstatus, idOrigen, idClasificacion, idAfectacion, codigoDpto, idSitio, idProceso,
         descripcion, descripcionDetallada, herramientasAnalisis, loginDetecta, loginResponsable, loginAsigna,
         fechaDeteccion, fechaCompromiso)
      OUTPUT INSERTED.idNC
      VALUES
        (@idEmpresa, @folio, 1, @idOrigen, @idClasificacion, @idAfectacion, @codigoDpto, @idSitio, @idProceso,
         @descripcion, @detallada, @herramientas, @login, @loginResponsable, @login,
         COALESCE(@fechaDeteccion, ${HOY_SQL}), @fechaCompromiso)
    `);
  const idNC = ins.recordset[0].idNC;
  await notificar(tx, {
    login: d.loginResponsable,
    actor: login,
    tipo: "NC_ASIGNADA",
    titulo: `${folio} quedó a tu cargo`,
    mensaje: d.descripcion,
    entidad: "NC",
    idEntidad: idNC,
  });
  await new sql.Request(tx)
    .input("idNC", sql.Int, idNC)
    .input("login", sql.VarChar(255), login)
    .input("motivo", sql.NVarChar(sql.MAX), motivoAlta)
    .query(`INSERT INTO sgc_historial_nc (idNC, estatusAnterior, estatusNuevo, login, motivo)
            VALUES (@idNC, NULL, 1, @login, @motivo)`);
  return { idNC, folio };
}

/**
 * GET /api/sgc/nc?estatus=1,2&origen=&clasificacion=&responsable=&fechaDesde=&fechaHasta=
 *   &vencidas=1&proceso=&q=&page=1&limit=20
 */
async function getNCs(req, res) {
  try {
    const q = req.query;
    const { page, limit, offset } = _paginacion(q);
    const db = await getPool();
    const request = db.request().input("idEmpresa", sql.Int, req.idEmpresa);
    const where = ["nc.idEmpresa = @idEmpresa"];

    // El estatus se aplica al final: porEstatus cuenta con los demás filtros
    const estatus = q.estatus === "abiertas" ? [1, 2, 3, 4] : _ints(q.estatus, [1, 2, 3, 4, 5, 6]);

    const origen = _int(q.origen);
    if (origen) {
      request.input("origen", sql.TinyInt, origen);
      where.push("nc.idOrigen = @origen");
    }
    const clasificacion = _int(q.clasificacion);
    if (clasificacion) {
      request.input("clasificacion", sql.TinyInt, clasificacion);
      where.push("nc.idClasificacion = @clasificacion");
    }
    const responsable = req.sgcRol === 3 ? req.login : _texto(q.responsable, 255);
    if (responsable) {
      request.input("responsable", sql.VarChar(255), responsable);
      where.push("nc.loginResponsable = @responsable");
    }
    const desde = _fecha(q.fechaDesde);
    if (desde) {
      request.input("desde", sql.Date, desde);
      where.push("nc.fechaDeteccion >= @desde");
    }
    const hasta = _fecha(q.fechaHasta);
    if (hasta) {
      request.input("hasta", sql.Date, hasta);
      where.push("nc.fechaDeteccion <= @hasta");
    }
    if (q.vencidas === "1") where.push(`${NC_VENCIDA} = 1`);
    const proceso = _int(q.proceso);
    if (proceso) {
      request.input("proceso", sql.Int, proceso);
      where.push("nc.idProceso = @proceso");
    }
    const texto = _texto(q.q, 100);
    if (texto) {
      request.input("q", sql.NVarChar(110), _like(texto));
      where.push("(nc.folioNC LIKE @q OR nc.descripcion LIKE @q)");
    }

    request.input("offset", sql.Int, offset).input("limit", sql.Int, limit);
    const filtroBase = where.join(" AND ");
    if (estatus.length) where.push(_in(request, "nc.idEstatus", "est", estatus, sql.TinyInt));
    const filtro = where.join(" AND ");
    const r = await request.query(`
      SELECT COUNT(*) AS total ${NC_FROM} WHERE ${filtro};

      SELECT nc.idNC, nc.folioNC AS folio, LEFT(nc.descripcion, 300) AS descripcion,
             nc.idOrigen, o.nombre AS origen, nc.idClasificacion, c.nombre AS clasificacion,
             nc.loginResponsable, LTRIM(RTRIM(ur.name)) AS responsable,
             nc.loginDetecta, LTRIM(RTRIM(uc.name)) AS creador,
             nc.fechaCreacion, nc.fechaDeteccion, nc.fechaCompromiso, nc.fechaCierre, nc.idEstatus,
             ${NC_VENCIDA} AS esVencida,
             DATEDIFF(DAY, ${HOY_SQL}, nc.fechaCompromiso) AS diasRestantes,
             (SELECT COUNT(*) FROM sgc_acciones_correctivas ac WHERE ac.idNC = nc.idNC) AS numAC
      ${NC_FROM}
      WHERE ${filtro}
      ORDER BY nc.fechaCreacion DESC, nc.idNC DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT nc.idEstatus, COUNT(*) AS total,
             SUM(${NC_VENCIDA}) AS vencidas
      ${NC_FROM} WHERE ${filtroBase}
      GROUP BY nc.idEstatus;
    `);
    const conteos = r.recordsets[2];
    res.json({
      ok: true,
      data: {
        items: r.recordsets[1].map(_formatear),
        total: r.recordsets[0][0].total,
        page,
        limit,
        porEstatus: Object.keys(NC_ESTATUS).map((id) => {
          const c = conteos.find((x) => x.idEstatus === Number(id));
          return { idEstatus: Number(id), label: NC_ESTATUS[id], total: c?.total || 0, vencidas: c?.vencidas || 0 };
        }),
      },
    });
  } catch (err) {
    console.error("[sgcNC.service] getNCs:", err);
    _err(res, 500, "Error interno");
  }
}

async function _historial(db, idNC) {
  const r = await db.request().input("idNC", sql.Int, idNC).query(`
    SELECT h.idHistorial, h.estatusAnterior, h.estatusNuevo, h.login, LTRIM(RTRIM(u.name)) AS nombre,
           h.motivo, h.fechaRegistro
    FROM sgc_historial_nc h
    LEFT JOIN sec_users u ON u.login = h.login
    WHERE h.idNC = @idNC
    ORDER BY h.fechaRegistro ASC, h.idHistorial ASC
  `);
  return r.recordset.map((h) => ({
    ...h,
    estatusAnteriorLabel: h.estatusAnterior ? NC_ESTATUS[h.estatusAnterior] : null,
    estatusNuevoLabel: NC_ESTATUS[h.estatusNuevo],
  }));
}

/** GET /api/sgc/nc/:id — NC completa + historial + ACs + archivos. */
async function getNC(req, res) {
  try {
    const idNC = _int(req.params.id);
    if (!idNC) return _err(res, 400, "NC inválida");
    const db = await getPool();
    const r = await db.request()
      .input("idNC", sql.Int, idNC)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        SELECT nc.idNC, nc.folioNC AS folio, nc.idEstatus, nc.idOrigen, o.nombre AS origen,
               nc.idClasificacion, c.nombre AS clasificacion, nc.idAfectacion, af.nombre AS afectacion,
               nc.codigoDpto, dp.idDepartamento, dp.departamento, nc.idSitio, LTRIM(RTRIM(s.nombreCorto)) AS sitio,
               nc.idProceso, pr.nombre AS proceso, pr.tipo AS procesoTipo,
               nc.descripcion, nc.descripcionDetallada, nc.correccionInmediata, nc.herramientasAnalisis,
               nc.loginDetecta, LTRIM(RTRIM(uc.name)) AS creador,
               nc.loginResponsable, LTRIM(RTRIM(ur.name)) AS responsable,
               nc.loginAsigna, LTRIM(RTRIM(ua.name)) AS asigna,
               nc.fechaDeteccion, nc.fechaCompromiso, nc.fechaCierre, nc.fechaCreacion,
               nc.loginCierra, LTRIM(RTRIM(uz.name)) AS cierra, nc.observacionCierre,
               nc.esReincidencia, nc.idNCPadre, padre.folioNC AS folioPadre,
               ${NC_VENCIDA} AS esVencida,
               DATEDIFF(DAY, ${HOY_SQL}, nc.fechaCompromiso) AS diasRestantes,
               hz.idAuditoria, au.folio AS folioAuditoria
        ${NC_FROM}
        LEFT JOIN sgc_cat_afectaciones af ON af.idAfectacion = nc.idAfectacion
        LEFT JOIN sec_users ua ON ua.login = nc.loginAsigna
        LEFT JOIN sec_users uz ON uz.login = nc.loginCierra
        LEFT JOIN dbo.SITIOS s ON s.idSitio = nc.idSitio
        LEFT JOIN sgc_procesos pr ON pr.idProceso = nc.idProceso
        LEFT JOIN sgc_no_conformidades padre ON padre.idNC = nc.idNCPadre
        OUTER APPLY (SELECT TOP 1 d.idDepartamento, LTRIM(RTRIM(d.departamento)) AS departamento
                     FROM dbo.DEPARTAMENTOS d WHERE d.codigoDepartamento = nc.codigoDpto) dp
        OUTER APPLY (SELECT TOP 1 h.idAuditoria FROM sgc_hallazgos h WHERE h.idNC = nc.idNC) hz
        LEFT JOIN sgc_auditorias au ON au.idAuditoria = hz.idAuditoria
        WHERE nc.idNC = @idNC AND nc.idEmpresa = @idEmpresa;

        SELECT ac.idAC, ac.folioAC AS folio, COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 120)) AS titulo,
               ac.idEstatus, ac.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable,
               ac.fechaCompromiso, ac.fechaCierre,
               DATEDIFF(DAY, ${HOY_SQL}, ac.fechaCompromiso) AS diasRestantes,
               pl.total AS totalLineas, pl.completadas AS lineasCompletadas
        FROM sgc_acciones_correctivas ac
        LEFT JOIN sec_users u ON u.login = ac.loginResponsable
        OUTER APPLY (SELECT COUNT(*) AS total, SUM(CASE WHEN p.idEstatus = 3 THEN 1 ELSE 0 END) AS completadas
                     FROM sgc_acciones_plan p WHERE p.idAC = ac.idAC) pl
        WHERE ac.idNC = @idNC
        ORDER BY ac.fechaCreacion;

        SELECT h.idHerramienta, h.nombre FROM sgc_cat_herramientas h;
      `);

    const nc = r.recordsets[0][0];
    if (!nc) return _err(res, 404, "No conformidad no encontrada");
    if (!_puedeVer(req, nc)) return _err(res, 403, "Solo puedes consultar las no conformidades a tu cargo.");

    const herramientasCat = Object.fromEntries(r.recordsets[2].map((h) => [h.idHerramienta, h.nombre]));
    const herramientas = _ints(nc.herramientasAnalisis).map((id) => ({ idHerramienta: id, nombre: herramientasCat[id] })).filter((h) => h.nombre);
    const esResponsable = _mismo(nc.loginResponsable, req.login);

    res.json({
      ok: true,
      data: {
        ..._formatear(nc),
        esReincidencia: !!nc.esReincidencia,
        herramientas,
        acciones: r.recordsets[1].map((a) => ({
          ...a,
          estatusLabel: AC_ESTATUS[a.idEstatus],
          avance: a.totalLineas ? Math.round((100 * a.lineasCompletadas) / a.totalLineas) : 0,
        })),
        historial: await _historial(db, idNC),
        archivos: await listarArchivos("NC", idNC),
        transiciones: transicionesNC(req.sgcRol, nc.idEstatus, esResponsable),
        puedeReasignar: [1, 2].includes(req.sgcRol) && !FINALES.includes(nc.idEstatus),
        puedeAdjuntar: req.sgcRol !== 4,
        puedeVincularProceso: req.sgcRol === 1 || (req.sgcRol !== 4 && esResponsable),
      },
    });
  } catch (err) {
    console.error("[sgcNC.service] getNC:", err);
    _err(res, 500, "Error interno");
  }
}

/** ¿El proceso existe y sigue en el mapa? */
async function _procesoActivo(db, idEmpresa, idProceso) {
  const r = await (db instanceof sql.Transaction ? new sql.Request(db) : db.request())
    .input("id", sql.Int, idProceso)
    .input("idEmpresa", sql.Int, idEmpresa)
    .query("SELECT nombre FROM sgc_procesos WHERE idProceso = @id AND idEmpresa = @idEmpresa AND activo = 1");
  return r.recordset[0] || null;
}

/** Resuelve idDepartamento → codigoDepartamento (sgc_no_conformidades guarda el código). */
async function _codigoDepartamento(db, idDepartamento) {
  if (!idDepartamento) return null;
  const r = await db.request()
    .input("id", sql.Int, idDepartamento)
    .query("SELECT codigoDepartamento FROM dbo.DEPARTAMENTOS WHERE idDepartamento = @id");
  return r.recordset[0]?.codigoDepartamento?.slice(0, 20) || undefined;
}

/**
 * POST /api/sgc/nc (Coordinador y Responsable de área)
 * body: { descripcion, descripcionDetallada?, idOrigen, idClasificacion, idAfectacion?,
 *         loginResponsable, fechaCompromiso, fechaDeteccion?, idDepartamento?, idSitio?, idProceso?,
 *         herramientasAnalisis?: [idHerramienta] }
 */
async function crearNC(req, res) {
  const b = req.body || {};
  const d = {
    idOrigen: _int(b.idOrigen),
    idClasificacion: _int(b.idClasificacion),
    idAfectacion: _int(b.idAfectacion),
    idSitio: _int(b.idSitio),
    idProceso: _int(b.idProceso),
    descripcion: _texto(b.descripcion, 4000),
    descripcionDetallada: _texto(b.descripcionDetallada),
    herramientas: _ints(b.herramientasAnalisis).slice(0, 20),
    loginResponsable: _texto(b.loginResponsable, 255),
    fechaDeteccion: _fecha(b.fechaDeteccion) || null,
    fechaCompromiso: _fecha(b.fechaCompromiso),
  };
  if (!d.idOrigen || !d.idClasificacion) return _err(res, 400, "Selecciona el origen y la clasificación.");
  if (!d.descripcion) return _err(res, 400, "Escribe la descripción de la no conformidad.");
  if (!d.loginResponsable) return _err(res, 400, "Asigna un responsable.");
  if (!d.fechaCompromiso) return _err(res, 400, "Captura la fecha compromiso.");

  let tx;
  try {
    const db = await getPool();
    d.codigoDpto = await _codigoDepartamento(db, _int(b.idDepartamento));
    if (d.codigoDpto === undefined) return _err(res, 400, "El departamento no existe.");
    if (!d.fechaDeteccion) {
      d.fechaDeteccion = (await db.request().query(`SELECT CONVERT(VARCHAR(10), ${HOY_SQL}, 23) AS hoy`)).recordset[0].hoy;
    }
    if (d.fechaCompromiso < d.fechaDeteccion) return _err(res, 400, "La fecha compromiso no puede ser anterior a la detección.");
    if (d.idProceso && !(await _procesoActivo(db, req.idEmpresa, d.idProceso))) return _err(res, 400, "El proceso no existe o fue dado de baja.");

    tx = new sql.Transaction(db);
    await tx.begin();
    const r = await insertarNC(tx, req.idEmpresa, req.login, d);
    await tx.commit();
    res.status(201).json({ ok: true, data: r });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "Algún dato no es válido (catálogo, sitio o usuario).");
    console.error("[sgcNC.service] crearNC:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * PATCH /api/sgc/nc/:id/proceso  body: { idProceso | null }
 * Vincula (o desvincula) la NC a un proceso del mapa. Coordinador o el
 * responsable de la NC. Queda en el historial sin cambiar el estatus.
 */
async function vincularProcesoNC(req, res) {
  const idNC = _int(req.params.id);
  const idProceso = req.body?.idProceso == null || req.body.idProceso === "" ? null : _int(req.body.idProceso);
  if (!idNC) return _err(res, 400, "NC inválida");
  if (req.body?.idProceso != null && req.body.idProceso !== "" && !idProceso) return _err(res, 400, "Proceso inválido");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const nc = (await new sql.Request(tx)
      .input("idNC", sql.Int, idNC)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT nc.idNC, nc.idEstatus, nc.idProceso, nc.loginResponsable, p.nombre AS proceso
              FROM sgc_no_conformidades nc WITH (UPDLOCK)
              LEFT JOIN sgc_procesos p ON p.idProceso = nc.idProceso
              WHERE nc.idNC = @idNC AND nc.idEmpresa = @idEmpresa`)).recordset[0];
    if (!nc) return _abortar(tx, res, 404, "No conformidad no encontrada");
    if (!(req.sgcRol === 1 || (req.sgcRol !== 4 && _mismo(nc.loginResponsable, req.login)))) {
      return _abortar(tx, res, 403, "Solo el Coordinador o el responsable de la NC pueden vincularla a un proceso.");
    }
    if ((nc.idProceso || null) === idProceso) return _abortar(tx, res, 400, "La NC ya está vinculada a ese proceso.");
    const nuevo = idProceso ? await _procesoActivo(tx, req.idEmpresa, idProceso) : null;
    if (idProceso && !nuevo) return _abortar(tx, res, 400, "El proceso no existe o fue dado de baja.");

    await new sql.Request(tx)
      .input("idNC", sql.Int, idNC)
      .input("idProceso", sql.Int, idProceso)
      .query("UPDATE sgc_no_conformidades SET idProceso = @idProceso WHERE idNC = @idNC");
    await new sql.Request(tx)
      .input("idNC", sql.Int, idNC)
      .input("est", sql.TinyInt, nc.idEstatus)
      .input("login", sql.VarChar(255), req.login)
      .input("motivo", sql.NVarChar(sql.MAX), nuevo ? `Proceso: ${nc.proceso ? `${nc.proceso} → ` : ""}${nuevo.nombre}` : `Se desvinculó del proceso ${nc.proceso}`)
      .query(`INSERT INTO sgc_historial_nc (idNC, estatusAnterior, estatusNuevo, login, motivo) VALUES (@idNC, @est, @est, @login, @motivo)`);
    await tx.commit();
    res.json({ ok: true, data: { idNC, idProceso, proceso: nuevo?.nombre || null } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgcNC.service] vincularProcesoNC:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * PATCH /api/sgc/nc/:id/estatus  body: { nuevoEstatus, motivo, loginNuevoResponsable? }
 * Sin saltos de estado. Motivo obligatorio al retroceder, cerrar, cancelar o reasignar.
 * Con nuevoEstatus = estatus actual + loginNuevoResponsable solo reasigna.
 */
async function cambiarEstatusNC(req, res) {
  const idNC = _int(req.params.id);
  const nuevo = _int(req.body?.nuevoEstatus ?? req.body?.idEstatus);
  const nuevoResp = _texto(req.body?.loginNuevoResponsable, 255);
  let motivo = _texto(req.body?.motivo, 2000);
  if (!idNC) return _err(res, 400, "NC inválida");
  if (!NC_ESTATUS[nuevo]) return _err(res, 400, "Estatus inválido");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const nc = (await new sql.Request(tx)
      .input("idNC", sql.Int, idNC)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT idNC, folioNC, idEstatus, loginResponsable FROM sgc_no_conformidades WITH (UPDLOCK, ROWLOCK)
              WHERE idNC = @idNC AND idEmpresa = @idEmpresa`)).recordset[0];
    if (!nc) return _abortar(tx, res, 404, "No conformidad no encontrada");

    const actual = nc.idEstatus;
    const reasigna = nuevoResp && !_mismo(nuevoResp, nc.loginResponsable);
    if (reasigna && !([1, 2].includes(req.sgcRol) && !FINALES.includes(actual))) {
      return _abortar(tx, res, 403, "Solo el Coordinador o el Auditor SGI pueden reasignar una NC abierta.");
    }
    if (nuevo === actual && !reasigna) return _abortar(tx, res, 400, `La no conformidad ya está en «${NC_ESTATUS[nuevo]}».`);
    if (nuevo !== actual) {
      const validos = transicionesNC(req.sgcRol, actual, _mismo(nc.loginResponsable, req.login));
      if (!validos.includes(nuevo)) {
        const msg = req.sgcRol === 4
          ? "Dirección tiene acceso de solo lectura."
          : FINALES.includes(actual)
            ? `La NC está ${NC_ESTATUS[actual].toLowerCase()}; ya no admite cambios.`
            : [5, 6].includes(nuevo) && req.sgcRol !== 1
              ? "Solo el Coordinador SGI puede cerrar o cancelar una no conformidad."
              : req.sgcRol === 3 && !_mismo(nc.loginResponsable, req.login)
                ? "Solo puedes actualizar las no conformidades a tu cargo."
                : `No se puede pasar de «${NC_ESTATUS[actual]}» a «${NC_ESTATUS[nuevo]}»: los estados avanzan de uno en uno.`;
        return _abortar(tx, res, 403, msg);
      }
    }
    const requiereMotivo = nuevo < actual || [5, 6].includes(nuevo) || reasigna;
    if (requiereMotivo && !motivo) return _abortar(tx, res, 400, "Indica el motivo de este cambio.");
    if (!motivo) motivo = `Avanza a «${NC_ESTATUS[nuevo]}»`;
    if (reasigna) motivo = `${motivo} · Reasignada a ${nuevoResp}`;

    await new sql.Request(tx)
      .input("idNC", sql.Int, idNC)
      .input("actual", sql.TinyInt, actual)
      .input("nuevo", sql.TinyInt, nuevo)
      .input("login", sql.VarChar(255), req.login)
      .input("motivo", sql.NVarChar(sql.MAX), motivo)
      .input("nuevoResp", sql.VarChar(255), reasigna ? nuevoResp : null)
      .query(`
        UPDATE sgc_no_conformidades
        SET idEstatus = @nuevo,
            loginResponsable  = COALESCE(@nuevoResp, loginResponsable),
            fechaCierre       = CASE WHEN @nuevo = 5 THEN ${HOY_SQL} ELSE fechaCierre END,
            loginCierra       = CASE WHEN @nuevo = 5 THEN @login ELSE loginCierra END,
            observacionCierre = CASE WHEN @nuevo = 5 THEN @motivo ELSE observacionCierre END
        WHERE idNC = @idNC;

        INSERT INTO sgc_historial_nc (idNC, estatusAnterior, estatusNuevo, login, motivo)
        VALUES (@idNC, @actual, @nuevo, @login, @motivo);
      `);
    if (reasigna) {
      await notificar(tx, {
        login: nuevoResp,
        actor: req.login,
        tipo: "NC_ASIGNADA",
        titulo: `${nc.folioNC} se te reasignó`,
        mensaje: motivo,
        entidad: "NC",
        idEntidad: idNC,
      });
    }
    await tx.commit();
    res.json({ ok: true, data: { idNC, estatusAnterior: actual, idEstatus: nuevo, estatusLabel: NC_ESTATUS[nuevo] } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "El nuevo responsable no es un usuario válido.");
    console.error("[sgcNC.service] cambiarEstatusNC:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/nc/:id/historial — orden cronológico (ASC). */
async function getHistorialNC(req, res) {
  try {
    const idNC = _int(req.params.id);
    if (!idNC) return _err(res, 400, "NC inválida");
    const db = await getPool();
    const nc = (await db.request()
      .input("idNC", sql.Int, idNC)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query("SELECT loginResponsable FROM sgc_no_conformidades WHERE idNC = @idNC AND idEmpresa = @idEmpresa")).recordset[0];
    if (!nc) return _err(res, 404, "No conformidad no encontrada");
    if (!_puedeVer(req, nc)) return _err(res, 403, "Solo puedes consultar las no conformidades a tu cargo.");
    res.json({ ok: true, data: await _historial(db, idNC) });
  } catch (err) {
    console.error("[sgcNC.service] getHistorialNC:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { getNCs, getNC, crearNC, cambiarEstatusNC, vincularProcesoNC, getHistorialNC, insertarNC, transicionesNC };
