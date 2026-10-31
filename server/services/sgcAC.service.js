// server/services/sgcAC.service.js
// Acciones Correctivas del SGC/SGI (ligadas a una NC o independientes).
//
// Ciclo de vida: 1 Abierta → 2 En ejecución → 3 Pendiente verificación
//                → 4 Verificada eficaz → 5 Cerrada
// Sin saltos (±1). Pasar a Pendiente verificación exige el plan completo;
// Verificada eficaz: Coordinador o Auditor; Cerrada: solo Coordinador.
// Cada movimiento queda en sgc_historial_ac (inmutable).
//
// Avance = líneas del plan completadas / total × 100. Se calcula siempre de
// las líneas y se guarda en pctAvance al cambiar una línea.
const { getPool, sql } = require("../db");
const { generarFolio } = require("./sgcFolio.service");
const { listarArchivos } = require("./sgcArchivos.service");
const C = require("./sgcComun.service");
const { _err, _int, _ints, _fecha, _texto, _mismo, _paginacion, _in, _like, _rollback, _abortar, HOY_SQL, AC_ESTATUS, PLAN_ESTATUS, NC_ESTATUS } = C;

const AVANCE_SQL = `
  OUTER APPLY (
    SELECT COUNT(*) AS totalLineas,
           ISNULL(SUM(CASE WHEN p.idEstatus = 3 THEN 1 ELSE 0 END), 0) AS lineasCompletadas
    FROM sgc_acciones_plan p WHERE p.idAC = ac.idAC
  ) pl
`;
const AC_VENCIDA = `CASE WHEN ac.idEstatus IN (1, 2, 3) AND ac.fechaCompromiso < ${HOY_SQL} THEN 1 ELSE 0 END`;

const AC_FROM = `
  FROM sgc_acciones_correctivas ac
  LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
  LEFT JOIN sgc_cat_herramientas h  ON h.idHerramienta = ac.idHerramienta
  LEFT JOIN sec_users ur            ON ur.login = ac.loginResponsable
  ${AVANCE_SQL}
`;

const _avance = (a) => (a.totalLineas ? Math.round((100 * a.lineasCompletadas) / a.totalLineas) : 0);
const _esDeResponsable = (req, ac) => _mismo(ac.loginResponsable, req.login) || _mismo(ac.loginResponsableNC, req.login);
const _puedeVer = (req, ac) => req.sgcRol !== 3 || _esDeResponsable(req, ac);
const _puedeEditar = (req, ac) => [1, 2].includes(req.sgcRol) || (req.sgcRol === 3 && _esDeResponsable(req, ac));

function _formatear(a) {
  const vencida = !!a.esVencida;
  return {
    ...a,
    esVencida: vencida,
    estatusLabel: AC_ESTATUS[a.idEstatus],
    avance: _avance(a),
    diasVencido: vencida ? Math.abs(a.diasRestantes) : null,
  };
}

/** Estatus válidos desde `actual` para el rol (sin saltos). */
function transicionesAC(rol, actual, puedeEditar, planCompleto) {
  if (!puedeEditar || actual === 5) return [];
  const destinos = [];
  if (actual > 1) destinos.push(actual - 1);
  const siguiente = actual + 1;
  if (siguiente === 3 && !planCompleto) return destinos;
  if (siguiente === 4 && ![1, 2].includes(rol)) return destinos;
  if (siguiente === 5 && rol !== 1) return destinos;
  if (siguiente <= 5) destinos.push(siguiente);
  return destinos;
}

async function _recalcularAvance(executor, idAC) {
  await executor.input("idACAvance", sql.Int, idAC).query(`
    UPDATE ac SET pctAvance = CASE WHEN x.total = 0 THEN 0 ELSE ROUND(100.0 * x.completadas / x.total, 0) END
    FROM sgc_acciones_correctivas ac
    CROSS APPLY (SELECT COUNT(*) AS total, ISNULL(SUM(CASE WHEN idEstatus = 3 THEN 1 ELSE 0 END), 0) AS completadas
                 FROM sgc_acciones_plan WHERE idAC = @idACAvance) x
    WHERE ac.idAC = @idACAvance
  `);
}

async function _acBasica(executor, idAC, idEmpresa, bloquear) {
  const r = await executor
    .input("idAC", sql.Int, idAC)
    .input("idEmpresa", sql.Int, idEmpresa)
    .query(`
      SELECT ac.idAC, ac.folioAC, ac.idEstatus, ac.idNC, ac.loginResponsable, nc.loginResponsable AS loginResponsableNC,
             pl.totalLineas, pl.lineasCompletadas
      FROM sgc_acciones_correctivas ac ${bloquear ? "WITH (UPDLOCK, ROWLOCK)" : ""}
      LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      ${AVANCE_SQL}
      WHERE ac.idAC = @idAC AND ac.idEmpresa = @idEmpresa
    `);
  return r.recordset[0] || null;
}

/** GET /api/sgc/ac?estatus=1,2&responsable=&ncOrigen=NC-2026&vencidas=1&q=&page=1&limit=20 */
async function getACs(req, res) {
  try {
    const q = req.query;
    const { page, limit, offset } = _paginacion(q);
    const db = await getPool();
    const request = db.request().input("idEmpresa", sql.Int, req.idEmpresa);
    const where = ["ac.idEmpresa = @idEmpresa"];

    // El estatus se aplica al final: porEstatus cuenta con los demás filtros
    const estatus = q.estatus === "abiertas" ? [1, 2, 3] : _ints(q.estatus, [1, 2, 3, 4, 5]);
    if (req.sgcRol === 3) {
      request.input("login", sql.VarChar(255), req.login);
      where.push("(ac.loginResponsable = @login OR nc.loginResponsable = @login)");
    }
    const responsable = _texto(q.responsable, 255);
    if (responsable) {
      request.input("responsable", sql.VarChar(255), responsable);
      where.push("ac.loginResponsable = @responsable");
    }
    const ncOrigen = _texto(q.ncOrigen, 30);
    if (ncOrigen === "ninguna") where.push("ac.idNC IS NULL");
    else if (ncOrigen) {
      request.input("ncOrigen", sql.VarChar(40), _like(ncOrigen));
      where.push("nc.folioNC LIKE @ncOrigen");
    }
    const idNC = _int(q.idNC);
    if (idNC) {
      request.input("idNC", sql.Int, idNC);
      where.push("ac.idNC = @idNC");
    }
    if (q.vencidas === "1") where.push(`${AC_VENCIDA} = 1`);
    const texto = _texto(q.q, 100);
    if (texto) {
      request.input("q", sql.NVarChar(110), _like(texto));
      where.push("(ac.folioAC LIKE @q OR ac.titulo LIKE @q OR ac.d2_descripcion LIKE @q)");
    }

    request.input("offset", sql.Int, offset).input("limit", sql.Int, limit);
    const filtroBase = where.join(" AND ");
    if (estatus.length) where.push(_in(request, "ac.idEstatus", "est", estatus, sql.TinyInt));
    const filtro = where.join(" AND ");
    const r = await request.query(`
      SELECT COUNT(*) AS total ${AC_FROM} WHERE ${filtro};

      SELECT ac.idAC, ac.folioAC AS folio, ac.idNC, nc.folioNC,
             COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 120)) AS titulo,
             ac.loginResponsable, LTRIM(RTRIM(ur.name)) AS responsable,
             ac.fechaCompromiso, ac.fechaCierre, ac.fechaCreacion, ac.idEstatus,
             ${AC_VENCIDA} AS esVencida,
             DATEDIFF(DAY, ${HOY_SQL}, ac.fechaCompromiso) AS diasRestantes,
             pl.totalLineas, pl.lineasCompletadas
      ${AC_FROM}
      WHERE ${filtro}
      ORDER BY CASE WHEN ac.idEstatus IN (4, 5) THEN 1 ELSE 0 END, ac.fechaCompromiso, ac.idAC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;

      SELECT ac.idEstatus, COUNT(*) AS total, SUM(${AC_VENCIDA}) AS vencidas
      FROM sgc_acciones_correctivas ac
      LEFT JOIN sgc_no_conformidades nc ON nc.idNC = ac.idNC
      WHERE ${filtroBase}
      GROUP BY ac.idEstatus;
    `);
    const conteos = r.recordsets[2];
    res.json({
      ok: true,
      data: {
        items: r.recordsets[1].map(_formatear),
        total: r.recordsets[0][0].total,
        page,
        limit,
        porEstatus: Object.keys(AC_ESTATUS).map((id) => {
          const c = conteos.find((x) => x.idEstatus === Number(id));
          return { idEstatus: Number(id), label: AC_ESTATUS[id], total: c?.total || 0, vencidas: c?.vencidas || 0 };
        }),
      },
    });
  } catch (err) {
    console.error("[sgcAC.service] getACs:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/ac/:id — AC + NC origen + plan + historial + archivos. */
async function getAC(req, res) {
  try {
    const idAC = _int(req.params.id);
    if (!idAC) return _err(res, 400, "AC inválida");
    const db = await getPool();
    const r = await db.request()
      .input("idAC", sql.Int, idAC)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        SELECT ac.idAC, ac.folioAC AS folio, ac.idNC, nc.folioNC, nc.idEstatus AS estatusNC,
               LEFT(nc.descripcion, 300) AS descripcionNC, nc.loginResponsable AS loginResponsableNC,
               COALESCE(ac.titulo, LEFT(ac.d2_descripcion, 120)) AS titulo,
               COALESCE(ac.descripcion, ac.d2_descripcion) AS descripcion,
               COALESCE(ac.causaRaiz, ac.d4_causaRaiz) AS causaRaiz,
               ac.d1_equipo, ac.d3_contencion, ac.d5_acciones,
               ac.idHerramienta, h.nombre AS herramienta, ac.idEstatus,
               ac.loginResponsable, LTRIM(RTRIM(ur.name)) AS responsable,
               ac.eficaciaVerificada, ac.loginVerifica, LTRIM(RTRIM(uv.name)) AS verifica, ac.fechaVerificacion,
               ac.fechaCompromiso, ac.fechaCierre, ac.fechaCreacion,
               ${AC_VENCIDA} AS esVencida,
               DATEDIFF(DAY, ${HOY_SQL}, ac.fechaCompromiso) AS diasRestantes,
               pl.totalLineas, pl.lineasCompletadas
        ${AC_FROM}
        LEFT JOIN sec_users uv ON uv.login = ac.loginVerifica
        WHERE ac.idAC = @idAC AND ac.idEmpresa = @idEmpresa;

        SELECT p.idAccion AS idLinea, p.descripcion AS actividad, p.loginResponsable,
               LTRIM(RTRIM(u.name)) AS responsable, p.fechaCompromiso, p.recursos, p.idEstatus,
               p.evidencia, p.fechaCreacion,
               CASE WHEN p.idEstatus <> 3 AND p.fechaCompromiso < ${HOY_SQL} THEN 1 ELSE 0 END AS esVencida,
               DATEDIFF(DAY, ${HOY_SQL}, p.fechaCompromiso) AS diasRestantes
        FROM sgc_acciones_plan p
        LEFT JOIN sec_users u ON u.login = p.loginResponsable
        WHERE p.idAC = @idAC
        ORDER BY p.fechaCompromiso, p.idAccion;

        SELECT h.idHistorial, h.estatusAnterior, h.estatusNuevo, h.login, LTRIM(RTRIM(u.name)) AS nombre,
               h.motivo, h.fechaRegistro
        FROM sgc_historial_ac h
        LEFT JOIN sec_users u ON u.login = h.login
        WHERE h.idAC = @idAC
        ORDER BY h.fechaRegistro ASC, h.idHistorial ASC;
      `);

    const ac = r.recordsets[0][0];
    if (!ac) return _err(res, 404, "Acción correctiva no encontrada");
    if (!_puedeVer(req, ac)) return _err(res, 403, "Solo puedes consultar las acciones correctivas a tu cargo.");

    const editar = _puedeEditar(req, ac);
    const planCompleto = ac.totalLineas > 0 && ac.totalLineas === ac.lineasCompletadas;
    res.json({
      ok: true,
      data: {
        ..._formatear(ac),
        eficaciaVerificada: !!ac.eficaciaVerificada,
        estatusNCLabel: ac.estatusNC ? NC_ESTATUS[ac.estatusNC] : null,
        plan: r.recordsets[1].map((p) => ({
          ...p,
          esVencida: !!p.esVencida,
          estatusLabel: PLAN_ESTATUS[p.idEstatus],
          puedeEditar: ac.idEstatus < 4 && (editar || _mismo(p.loginResponsable, req.login)),
        })),
        historial: r.recordsets[2].map((h) => ({
          ...h,
          estatusAnteriorLabel: h.estatusAnterior ? AC_ESTATUS[h.estatusAnterior] : null,
          estatusNuevoLabel: AC_ESTATUS[h.estatusNuevo],
        })),
        archivos: await listarArchivos("AC", idAC),
        transiciones: transicionesAC(req.sgcRol, ac.idEstatus, editar, planCompleto),
        planCompleto,
        puedeEditarPlan: editar && ac.idEstatus < 4,
        puedeAdjuntar: req.sgcRol !== 4,
      },
    });
  } catch (err) {
    console.error("[sgcAC.service] getAC:", err);
    _err(res, 500, "Error interno");
  }
}

function _lineaValida(l) {
  return {
    actividad: _texto(l?.actividad, 500),
    loginResponsable: _texto(l?.loginResponsable, 255),
    fechaCompromiso: _fecha(l?.fechaCompromiso),
    recursos: _texto(l?.recursos, 500),
  };
}

async function _insertarLinea(tx, idAC, l) {
  await new sql.Request(tx)
    .input("idAC", sql.Int, idAC)
    .input("actividad", sql.NVarChar(500), l.actividad)
    .input("resp", sql.VarChar(255), l.loginResponsable)
    .input("fecha", sql.Date, l.fechaCompromiso)
    .input("recursos", sql.NVarChar(500), l.recursos)
    .query(`INSERT INTO sgc_acciones_plan (idAC, descripcion, loginResponsable, fechaCompromiso, recursos, idEstatus, pctAvance)
            VALUES (@idAC, @actividad, @resp, @fecha, @recursos, 1, 0)`);
}

/**
 * POST /api/sgc/ac
 * body: { idNC?, titulo, descripcion, causaRaiz?, idHerramienta?, loginResponsable, fechaCompromiso,
 *         plan: [{ actividad, loginResponsable, fechaCompromiso, recursos? }] }
 * Coordinador y Auditor; el Responsable de área para sus NCs o para una AC a su nombre.
 */
async function crearAC(req, res) {
  const b = req.body || {};
  const idNC = _int(b.idNC);
  const titulo = _texto(b.titulo, 200);
  const loginResponsable = _texto(b.loginResponsable, 255);
  const fechaCompromiso = _fecha(b.fechaCompromiso);
  const plan = (Array.isArray(b.plan) ? b.plan : []).slice(0, 50).map(_lineaValida);

  if (req.sgcRol === 4) return _err(res, 403, "Dirección tiene acceso de solo lectura.");
  if (!titulo) return _err(res, 400, "Escribe el título de la acción.");
  if (!loginResponsable) return _err(res, 400, "Asigna un responsable.");
  if (!fechaCompromiso) return _err(res, 400, "Captura la fecha compromiso.");
  const lineaMala = plan.findIndex((l) => !l.actividad || !l.loginResponsable || !l.fechaCompromiso);
  if (lineaMala >= 0) return _err(res, 400, `La actividad ${lineaMala + 1} del plan necesita descripción, responsable y fecha.`);
  if (req.sgcRol === 3 && !idNC && !_mismo(loginResponsable, req.login)) {
    return _err(res, 403, "Como responsable de área, una acción sin NC debe quedar a tu nombre.");
  }

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();

    if (idNC) {
      const nc = (await new sql.Request(tx)
        .input("idNC", sql.Int, idNC)
        .input("idEmpresa", sql.Int, req.idEmpresa)
        .query("SELECT folioNC, idEstatus, loginResponsable FROM sgc_no_conformidades WITH (UPDLOCK) WHERE idNC = @idNC AND idEmpresa = @idEmpresa")).recordset[0];
      if (!nc) return _abortar(tx, res, 404, "No conformidad no encontrada");
      if ([5, 6].includes(nc.idEstatus)) return _abortar(tx, res, 400, `La NC ${nc.folioNC} está ${NC_ESTATUS[nc.idEstatus].toLowerCase()}; no admite nuevas acciones.`);
      if (req.sgcRol === 3 && !_mismo(nc.loginResponsable, req.login)) return _abortar(tx, res, 403, "Solo puedes crear acciones para las NCs a tu cargo.");
    }

    const folio = await generarFolio("AC", tx, req.idEmpresa);
    const ins = await new sql.Request(tx)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .input("folio", sql.VarChar(20), folio)
      .input("idNC", sql.Int, idNC)
      .input("idHerramienta", sql.TinyInt, _int(b.idHerramienta))
      .input("resp", sql.VarChar(255), loginResponsable)
      .input("titulo", sql.NVarChar(200), titulo)
      .input("descripcion", sql.NVarChar(sql.MAX), _texto(b.descripcion))
      .input("causaRaiz", sql.NVarChar(sql.MAX), _texto(b.causaRaiz))
      .input("fecha", sql.Date, fechaCompromiso)
      .query(`
        INSERT INTO sgc_acciones_correctivas
          (idEmpresa, folioAC, idNC, idEstatus, idHerramienta, loginResponsable, titulo, descripcion, causaRaiz, fechaCompromiso)
        OUTPUT INSERTED.idAC
        VALUES (@idEmpresa, @folio, @idNC, 1, @idHerramienta, @resp, @titulo, @descripcion, @causaRaiz, @fecha)
      `);
    const idAC = ins.recordset[0].idAC;
    for (const l of plan) await _insertarLinea(tx, idAC, l);
    await new sql.Request(tx)
      .input("idAC", sql.Int, idAC)
      .input("login", sql.VarChar(255), req.login)
      .query(`INSERT INTO sgc_historial_ac (idAC, estatusAnterior, estatusNuevo, login, motivo)
              VALUES (@idAC, NULL, 1, @login, N'Alta de la acción correctiva')`);
    await tx.commit();
    res.status(201).json({ ok: true, data: { idAC, folio } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "Algún dato no es válido (herramienta o usuario).");
    console.error("[sgcAC.service] crearAC:", err);
    _err(res, 500, "Error interno");
  }
}

/** PATCH /api/sgc/ac/:id/estatus  body: { nuevoEstatus, motivo } */
async function cambiarEstatusAC(req, res) {
  const idAC = _int(req.params.id);
  const nuevo = _int(req.body?.nuevoEstatus ?? req.body?.idEstatus);
  let motivo = _texto(req.body?.motivo, 2000);
  if (!idAC) return _err(res, 400, "AC inválida");
  if (!AC_ESTATUS[nuevo]) return _err(res, 400, "Estatus inválido");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const ac = await _acBasica(new sql.Request(tx), idAC, req.idEmpresa, true);
    if (!ac) return _abortar(tx, res, 404, "Acción correctiva no encontrada");
    const actual = ac.idEstatus;
    if (actual === nuevo) return _abortar(tx, res, 400, `La acción ya está en «${AC_ESTATUS[nuevo]}».`);

    const editar = _puedeEditar(req, ac);
    const planCompleto = ac.totalLineas > 0 && ac.totalLineas === ac.lineasCompletadas;
    if (!transicionesAC(req.sgcRol, actual, editar, planCompleto).includes(nuevo)) {
      const msg = req.sgcRol === 4
        ? "Dirección tiene acceso de solo lectura."
        : !editar
          ? "Solo puedes actualizar las acciones a tu cargo."
          : actual === 5
            ? "La acción está cerrada; ya no admite cambios."
            : Math.abs(nuevo - actual) > 1
              ? "Los estados avanzan de uno en uno."
              : nuevo === 3
                ? "Completa todas las actividades del plan antes de pasar a verificación."
                : nuevo === 4
                  ? "Solo el Coordinador o el Auditor SGI pueden verificar la eficacia."
                  : "Solo el Coordinador SGI puede cerrar una acción correctiva.";
      return _abortar(tx, res, 403, msg);
    }
    if ((nuevo < actual || nuevo === 5) && !motivo) return _abortar(tx, res, 400, "Indica el motivo de este cambio.");
    if (!motivo) motivo = `Avanza a «${AC_ESTATUS[nuevo]}»`;

    await new sql.Request(tx)
      .input("idAC", sql.Int, idAC)
      .input("actual", sql.TinyInt, actual)
      .input("nuevo", sql.TinyInt, nuevo)
      .input("login", sql.VarChar(255), req.login)
      .input("motivo", sql.NVarChar(sql.MAX), motivo)
      .query(`
        UPDATE sgc_acciones_correctivas
        SET idEstatus = @nuevo,
            eficaciaVerificada = CASE WHEN @nuevo >= 4 THEN 1 ELSE 0 END,
            loginVerifica      = CASE WHEN @nuevo = 4 THEN @login WHEN @nuevo < 4 THEN NULL ELSE loginVerifica END,
            fechaVerificacion  = CASE WHEN @nuevo = 4 THEN ${HOY_SQL} WHEN @nuevo < 4 THEN NULL ELSE fechaVerificacion END,
            fechaCierre        = CASE WHEN @nuevo = 5 THEN ${HOY_SQL} ELSE NULL END
        WHERE idAC = @idAC;

        INSERT INTO sgc_historial_ac (idAC, estatusAnterior, estatusNuevo, login, motivo)
        VALUES (@idAC, @actual, @nuevo, @login, @motivo);
      `);
    await tx.commit();
    res.json({ ok: true, data: { idAC, estatusAnterior: actual, idEstatus: nuevo, estatusLabel: AC_ESTATUS[nuevo] } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgcAC.service] cambiarEstatusAC:", err);
    _err(res, 500, "Error interno");
  }
}

/** POST /api/sgc/ac/:id/plan  body: { actividad, loginResponsable, fechaCompromiso, recursos? } */
async function agregarLinea(req, res) {
  const idAC = _int(req.params.id);
  const l = _lineaValida(req.body);
  if (!idAC) return _err(res, 400, "AC inválida");
  if (!l.actividad || !l.loginResponsable || !l.fechaCompromiso) return _err(res, 400, "La actividad necesita descripción, responsable y fecha.");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const ac = await _acBasica(new sql.Request(tx), idAC, req.idEmpresa, true);
    if (!ac) return _abortar(tx, res, 404, "Acción correctiva no encontrada");
    if (!_puedeEditar(req, ac)) return _abortar(tx, res, 403, "Sin permisos para modificar el plan de esta acción.");
    if (ac.idEstatus >= 4) return _abortar(tx, res, 400, "La acción ya fue verificada; el plan no admite cambios.");
    await _insertarLinea(tx, idAC, l);
    await _recalcularAvance(new sql.Request(tx), idAC);
    await tx.commit();
    res.status(201).json({ ok: true, data: { idAC } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "El responsable no es un usuario válido.");
    console.error("[sgcAC.service] agregarLinea:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * PATCH /api/sgc/ac/plan/:idLinea/estatus  body: { nuevoEstatus, evidencia? }
 * 1 Pendiente, 2 En proceso, 3 Completada. Recalcula el avance de la AC.
 */
async function cambiarEstatusLinea(req, res) {
  const idLinea = _int(req.params.idLinea);
  const nuevo = _int(req.body?.nuevoEstatus);
  if (!idLinea) return _err(res, 400, "Actividad inválida");
  if (!PLAN_ESTATUS[nuevo]) return _err(res, 400, "Estatus inválido");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const linea = (await new sql.Request(tx)
      .input("idLinea", sql.Int, idLinea)
      .query("SELECT idAccion, idAC, loginResponsable, idEstatus FROM sgc_acciones_plan WITH (UPDLOCK) WHERE idAccion = @idLinea")).recordset[0];
    if (!linea) return _abortar(tx, res, 404, "Actividad no encontrada");
    const ac = await _acBasica(new sql.Request(tx), linea.idAC, req.idEmpresa, true);
    if (!ac) return _abortar(tx, res, 404, "Acción correctiva no encontrada");
    if (req.sgcRol === 4 || !(_puedeEditar(req, ac) || _mismo(linea.loginResponsable, req.login))) {
      return _abortar(tx, res, 403, "Sin permisos para actualizar esta actividad.");
    }
    if (ac.idEstatus >= 4) return _abortar(tx, res, 400, "La acción ya fue verificada; el plan no admite cambios.");

    const evidencia = req.body?.evidencia === undefined ? undefined : _texto(req.body.evidencia);
    await new sql.Request(tx)
      .input("idLinea", sql.Int, idLinea)
      .input("nuevo", sql.TinyInt, nuevo)
      .input("pct", sql.TinyInt, nuevo === 3 ? 100 : nuevo === 2 ? 50 : 0)
      .input("cambiaEvidencia", sql.Bit, evidencia === undefined ? 0 : 1)
      .input("evidencia", sql.NVarChar(sql.MAX), evidencia ?? null)
      .query(`UPDATE sgc_acciones_plan
              SET idEstatus = @nuevo, pctAvance = @pct,
                  evidencia = CASE WHEN @cambiaEvidencia = 1 THEN @evidencia ELSE evidencia END
              WHERE idAccion = @idLinea`);
    await _recalcularAvance(new sql.Request(tx), linea.idAC);
    const despues = await _acBasica(new sql.Request(tx), linea.idAC, req.idEmpresa);
    await tx.commit();
    res.json({ ok: true, data: { idLinea, idEstatus: nuevo, estatusLabel: PLAN_ESTATUS[nuevo], avance: _avance(despues) } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgcAC.service] cambiarEstatusLinea:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { getACs, getAC, crearAC, cambiarEstatusAC, agregarLinea, cambiarEstatusLinea, transicionesAC };
