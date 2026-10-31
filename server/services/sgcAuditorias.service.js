// server/services/sgcAuditorias.service.js
// Auditorías del SGC/SGI con auditores, áreas auditadas y hallazgos.
//
// Estatus: 1 Planeada → 2 En curso → 3 Completada; 4 Cancelada desde 1 o 2.
// Tipo: 1 Interna, 2 Externa, 3 Certificación.
// Hallazgos: 1 No conformidad (puede generar una NC vinculada), 2 Observación,
// 3 Oportunidad de mejora.
// Crean y gestionan auditorías el Coordinador (1) y el Auditor (2).
const { getPool, sql } = require("../db");
const { generarFolio } = require("./sgcFolio.service");
const { listarArchivos } = require("./sgcArchivos.service");
const { insertarNC } = require("./sgcNC.service");
const C = require("./sgcComun.service");
const { _err, _int, _ints, _fecha, _texto, _rollback, _abortar, HOY_SQL, AUD_ESTATUS, AUD_TIPO, HALLAZGO_TIPO, NC_ESTATUS } = C;

const TIPO_POR_NOMBRE = { interna: 1, externa: 2, certificacion: 3, "certificación": 3 };
const TRANSICIONES = { 1: [2, 4], 2: [3, 4], 3: [], 4: [] };
// Origen de la NC que nace de un hallazgo: auditoría interna o externa
const ORIGEN_NC = { 1: 1, 2: 2, 3: 2 };
const CLASIFICACION_DEFAULT = 2; // Menor

const _puedeGestionar = (req) => [1, 2].includes(req.sgcRol);

/** GET /api/sgc/auditorias?estatus=1&anio=2026&tipo=interna|1 */
async function getAuditorias(req, res) {
  try {
    const q = req.query;
    const db = await getPool();
    const request = db.request().input("idEmpresa", sql.Int, req.idEmpresa);
    const where = ["a.idEmpresa = @idEmpresa"];
    const estatus = _ints(q.estatus, [1, 2, 3, 4]);
    if (estatus.length) where.push(C._in(request, "a.idEstatus", "est", estatus, sql.TinyInt));
    const anio = _int(q.anio);
    if (anio) {
      request.input("anio", sql.Int, anio);
      where.push("YEAR(a.fechaPlan) = @anio");
    }
    const tipo = TIPO_POR_NOMBRE[String(q.tipo || "").toLowerCase()] || _int(q.tipo);
    if (AUD_TIPO[tipo]) {
      request.input("tipo", sql.TinyInt, tipo);
      where.push("a.tipo = @tipo");
    }

    const r = await request.query(`
      SELECT a.idAuditoria, a.folio, COALESCE(a.titulo, LEFT(a.alcance, 120)) AS titulo, a.tipo,
             a.fechaPlan AS fechaInicio, COALESCE(a.fechaFin, a.fechaPlan) AS fechaFin, a.fechaEjecucion,
             a.idEstatus, a.normaAplicable,
             COALESCE(aud.nombres, LTRIM(RTRIM(ul.name))) AS auditores,
             ISNULL(hz.ncs, 0) AS ncs, ISNULL(hz.observaciones, 0) AS observaciones, ISNULL(hz.oportunidades, 0) AS oportunidades
      FROM sgc_auditorias a
      LEFT JOIN sec_users ul ON ul.login = a.loginAuditor
      OUTER APPLY (SELECT STRING_AGG(LTRIM(RTRIM(u.name)), ', ') AS nombres
                   FROM sgc_auditoria_auditores x JOIN sec_users u ON u.login = x.login
                   WHERE x.idAuditoria = a.idAuditoria) aud
      OUTER APPLY (SELECT SUM(CASE WHEN h.tipo = 1 THEN 1 ELSE 0 END) AS ncs,
                          SUM(CASE WHEN h.tipo = 2 THEN 1 ELSE 0 END) AS observaciones,
                          SUM(CASE WHEN h.tipo = 3 THEN 1 ELSE 0 END) AS oportunidades
                   FROM sgc_hallazgos h WHERE h.idAuditoria = a.idAuditoria) hz
      WHERE ${where.join(" AND ")}
      ORDER BY a.fechaPlan DESC, a.idAuditoria DESC
    `);
    res.json({
      ok: true,
      data: r.recordset.map((a) => ({ ...a, tipoLabel: AUD_TIPO[a.tipo], estatusLabel: AUD_ESTATUS[a.idEstatus] })),
    });
  } catch (err) {
    console.error("[sgcAuditorias.service] getAuditorias:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/auditorias/:id — auditoría + auditores + áreas + hallazgos + archivos. */
async function getAuditoria(req, res) {
  try {
    const id = _int(req.params.id);
    if (!id) return _err(res, 400, "Auditoría inválida");
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        SELECT a.idAuditoria, a.folio, COALESCE(a.titulo, LEFT(a.alcance, 120)) AS titulo, a.tipo, a.alcance,
               a.criterios, a.normaAplicable, a.conclusiones, a.observaciones,
               a.fechaPlan AS fechaInicio, COALESCE(a.fechaFin, a.fechaPlan) AS fechaFin, a.fechaEjecucion,
               a.idEstatus, a.loginAuditor, LTRIM(RTRIM(ul.name)) AS auditorLider, a.fechaCreacion
        FROM sgc_auditorias a
        LEFT JOIN sec_users ul ON ul.login = a.loginAuditor
        WHERE a.idAuditoria = @id AND a.idEmpresa = @idEmpresa;

        SELECT x.login, LTRIM(RTRIM(u.name)) AS nombre, u.area
        FROM sgc_auditoria_auditores x JOIN sec_users u ON u.login = x.login
        WHERE x.idAuditoria = @id ORDER BY u.name;

        SELECT ar.idDepartamento, LTRIM(RTRIM(d.departamento)) AS departamento, LTRIM(RTRIM(s.nombreCorto)) AS sitio
        FROM sgc_auditoria_areas ar
        JOIN dbo.DEPARTAMENTOS d ON d.idDepartamento = ar.idDepartamento
        LEFT JOIN dbo.SITIOS s ON s.codigoSitio = d.codigoSitio
        WHERE ar.idAuditoria = @id ORDER BY d.departamento;

        SELECT h.idHallazgo, h.tipo, h.descripcion, h.clausulaISO, h.idNC, nc.folioNC, nc.idEstatus AS estatusNC,
               h.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable, h.fechaCompromiso, h.fechaCreacion
        FROM sgc_hallazgos h
        LEFT JOIN sgc_no_conformidades nc ON nc.idNC = h.idNC
        LEFT JOIN sec_users u ON u.login = h.loginResponsable
        WHERE h.idAuditoria = @id
        ORDER BY h.tipo, h.fechaCreacion;
      `);
    const a = r.recordsets[0][0];
    if (!a) return _err(res, 404, "Auditoría no encontrada");

    // Auditorías anteriores a los auditores múltiples: el auditor líder hace de lista
    const auditores = r.recordsets[1].length ? r.recordsets[1] : a.loginAuditor ? [{ login: a.loginAuditor, nombre: a.auditorLider }] : [];
    const gestionar = _puedeGestionar(req);
    res.json({
      ok: true,
      data: {
        ...a,
        conclusiones: a.conclusiones ?? a.observaciones,
        tipoLabel: AUD_TIPO[a.tipo],
        estatusLabel: AUD_ESTATUS[a.idEstatus],
        auditores,
        areas: r.recordsets[2],
        hallazgos: r.recordsets[3].map((h) => ({
          ...h,
          tipoLabel: HALLAZGO_TIPO[h.tipo],
          estatusNCLabel: h.estatusNC ? NC_ESTATUS[h.estatusNC] : null,
        })),
        archivos: await listarArchivos("AUD", id),
        transiciones: gestionar ? TRANSICIONES[a.idEstatus] : [],
        puedeRegistrarHallazgos: gestionar && [1, 2].includes(a.idEstatus),
        puedeAdjuntar: gestionar,
      },
    });
  } catch (err) {
    console.error("[sgcAuditorias.service] getAuditoria:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * POST /api/sgc/auditorias (Coordinador y Auditor)
 * body: { titulo, tipo, fechaInicio, fechaFin, alcance, normaAplicable, auditores: [login], areasAuditadas: [idDepartamento] }
 */
async function crearAuditoria(req, res) {
  const b = req.body || {};
  const titulo = _texto(b.titulo, 200);
  const tipo = _int(b.tipo);
  const fechaInicio = _fecha(b.fechaInicio);
  const fechaFin = _fecha(b.fechaFin) || fechaInicio;
  const alcance = _texto(b.alcance, 500);
  const auditores = [...new Set((Array.isArray(b.auditores) ? b.auditores : []).map((l) => _texto(l, 255)).filter(Boolean))].slice(0, 20);
  const areas = _ints(b.areasAuditadas).slice(0, 50);

  if (!titulo) return _err(res, 400, "Escribe el título de la auditoría.");
  if (!AUD_TIPO[tipo]) return _err(res, 400, "Selecciona el tipo de auditoría.");
  if (!fechaInicio) return _err(res, 400, "Captura la fecha de inicio.");
  if (fechaFin < fechaInicio) return _err(res, 400, "La fecha de fin no puede ser anterior al inicio.");
  if (!alcance) return _err(res, 400, "Describe el alcance de la auditoría.");
  if (!auditores.length) return _err(res, 400, "Asigna al menos un auditor.");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const folio = await generarFolio("AUD", tx, req.idEmpresa);
    const ins = await new sql.Request(tx)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .input("folio", sql.VarChar(20), folio)
      .input("titulo", sql.NVarChar(200), titulo)
      .input("tipo", sql.TinyInt, tipo)
      .input("alcance", sql.NVarChar(500), alcance)
      .input("norma", sql.NVarChar(200), _texto(b.normaAplicable, 200))
      .input("lider", sql.VarChar(255), auditores[0])
      .input("inicio", sql.Date, fechaInicio)
      .input("fin", sql.Date, fechaFin)
      .query(`
        INSERT INTO sgc_auditorias (idEmpresa, folio, titulo, tipo, alcance, normaAplicable, criterios, loginAuditor, fechaPlan, fechaFin, idEstatus)
        OUTPUT INSERTED.idAuditoria
        VALUES (@idEmpresa, @folio, @titulo, @tipo, @alcance, @norma, @norma, @lider, @inicio, @fin, 1)
      `);
    const idAuditoria = ins.recordset[0].idAuditoria;
    for (const login of auditores) {
      await new sql.Request(tx)
        .input("id", sql.Int, idAuditoria)
        .input("login", sql.VarChar(255), login)
        .query("INSERT INTO sgc_auditoria_auditores (idAuditoria, login) VALUES (@id, @login)");
    }
    for (const idDepartamento of areas) {
      await new sql.Request(tx)
        .input("id", sql.Int, idAuditoria)
        .input("dep", sql.Int, idDepartamento)
        .query(`INSERT INTO sgc_auditoria_areas (idAuditoria, idDepartamento)
                SELECT @id, idDepartamento FROM dbo.DEPARTAMENTOS WHERE idDepartamento = @dep`);
    }
    await tx.commit();
    res.status(201).json({ ok: true, data: { idAuditoria, folio } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "Algún auditor no es un usuario válido.");
    console.error("[sgcAuditorias.service] crearAuditoria:", err);
    _err(res, 500, "Error interno");
  }
}

async function _auditoriaAbierta(tx, req, id) {
  const a = (await new sql.Request(tx)
    .input("id", sql.Int, id)
    .input("idEmpresa", sql.Int, req.idEmpresa)
    .query("SELECT idAuditoria, folio, tipo, idEstatus FROM sgc_auditorias WITH (UPDLOCK) WHERE idAuditoria = @id AND idEmpresa = @idEmpresa")).recordset[0];
  if (!a) return { error: [404, "Auditoría no encontrada"] };
  if (![1, 2].includes(a.idEstatus)) return { error: [400, `La auditoría está ${AUD_ESTATUS[a.idEstatus].toLowerCase()}; no admite hallazgos nuevos.`] };
  return { a };
}

function _datosNCDesdeHallazgo(a, h, b) {
  return {
    idOrigen: ORIGEN_NC[a.tipo],
    idClasificacion: _int(b.idClasificacion) || CLASIFICACION_DEFAULT,
    idAfectacion: _int(b.idAfectacion),
    descripcion: h.descripcion.slice(0, 4000),
    descripcionDetallada: `Hallazgo de la auditoría ${a.folio}${h.clausulaISO ? ` · Cláusula ${h.clausulaISO}` : ""}`,
    loginResponsable: h.loginResponsable,
    fechaDeteccion: null,
    fechaCompromiso: h.fechaCompromiso,
  };
}

/**
 * POST /api/sgc/auditorias/:id/hallazgos (Coordinador y Auditor)
 * body: { tipo, descripcion, clausulaISO?, loginResponsable?, fechaCompromiso?, idNC?, crearNC?, idClasificacion? }
 * Un hallazgo tipo 1 sin idNC crea su NC vinculada (salvo crearNC: false);
 * para eso exige responsable y fecha compromiso.
 */
async function crearHallazgo(req, res) {
  const id = _int(req.params.id);
  const b = req.body || {};
  const h = {
    tipo: _int(b.tipo),
    descripcion: _texto(b.descripcion),
    clausulaISO: _texto(b.clausulaISO, 20),
    loginResponsable: _texto(b.loginResponsable, 255),
    fechaCompromiso: _fecha(b.fechaCompromiso),
    idNC: _int(b.idNC),
  };
  if (!id) return _err(res, 400, "Auditoría inválida");
  if (!HALLAZGO_TIPO[h.tipo]) return _err(res, 400, "Selecciona el tipo de hallazgo.");
  if (!h.descripcion) return _err(res, 400, "Describe el hallazgo.");
  const crearNC = h.tipo === 1 && !h.idNC && b.crearNC !== false;
  if (crearNC && (!h.loginResponsable || !h.fechaCompromiso)) {
    return _err(res, 400, "Para generar la NC del hallazgo indica responsable y fecha compromiso.");
  }

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const { a, error } = await _auditoriaAbierta(tx, req, id);
    if (error) return _abortar(tx, res, error[0], error[1]);

    let nc = null;
    if (crearNC) {
      nc = await insertarNC(tx, req.idEmpresa, req.login, _datosNCDesdeHallazgo(a, h, b), `Alta desde hallazgo de la auditoría ${a.folio}`);
      h.idNC = nc.idNC;
    }
    const ins = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("tipo", sql.TinyInt, h.tipo)
      .input("desc", sql.NVarChar(sql.MAX), h.descripcion)
      .input("cl", sql.NVarChar(20), h.clausulaISO)
      .input("idNC", sql.Int, h.idNC)
      .input("resp", sql.VarChar(255), h.loginResponsable)
      .input("fecha", sql.Date, h.fechaCompromiso)
      .query(`
        INSERT INTO sgc_hallazgos (idAuditoria, tipo, descripcion, clausulaISO, idNC, loginResponsable, fechaCompromiso)
        OUTPUT INSERTED.idHallazgo
        VALUES (@id, @tipo, @desc, @cl, @idNC, @resp, @fecha)
      `);
    await tx.commit();
    res.status(201).json({ ok: true, data: { idHallazgo: ins.recordset[0].idHallazgo, idNC: h.idNC, folioNC: nc?.folio ?? null } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "Algún dato no es válido (responsable o NC).");
    console.error("[sgcAuditorias.service] crearHallazgo:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * POST /api/sgc/auditorias/:id/hallazgos/:idHallazgo/nc — genera la NC de un
 * hallazgo tipo 1 que aún no la tiene. body: { loginResponsable?, fechaCompromiso?, idClasificacion? }
 */
async function crearNCDeHallazgo(req, res) {
  const id = _int(req.params.id);
  const idHallazgo = _int(req.params.idHallazgo);
  const b = req.body || {};
  if (!id || !idHallazgo) return _err(res, 400, "Hallazgo inválido");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const a = (await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query("SELECT idAuditoria, folio, tipo, idEstatus FROM sgc_auditorias WHERE idAuditoria = @id AND idEmpresa = @idEmpresa")).recordset[0];
    if (!a) return _abortar(tx, res, 404, "Auditoría no encontrada");
    const h = (await new sql.Request(tx)
      .input("idH", sql.Int, idHallazgo)
      .input("id", sql.Int, id)
      .query(`SELECT idHallazgo, tipo, descripcion, clausulaISO, idNC, loginResponsable, fechaCompromiso
              FROM sgc_hallazgos WITH (UPDLOCK) WHERE idHallazgo = @idH AND idAuditoria = @id`)).recordset[0];
    if (!h) return _abortar(tx, res, 404, "Hallazgo no encontrado");
    if (h.tipo !== 1) return _abortar(tx, res, 400, "Solo los hallazgos de tipo No conformidad generan NC.");
    if (h.idNC) return _abortar(tx, res, 409, "Este hallazgo ya tiene una NC vinculada.");

    h.loginResponsable = _texto(b.loginResponsable, 255) || h.loginResponsable;
    h.fechaCompromiso = _fecha(b.fechaCompromiso) || (h.fechaCompromiso ? h.fechaCompromiso.toISOString().slice(0, 10) : null);
    if (!h.loginResponsable || !h.fechaCompromiso) return _abortar(tx, res, 400, "Indica responsable y fecha compromiso para la NC.");

    const nc = await insertarNC(tx, req.idEmpresa, req.login, _datosNCDesdeHallazgo(a, h, b), `Alta desde hallazgo de la auditoría ${a.folio}`);
    await new sql.Request(tx)
      .input("idH", sql.Int, idHallazgo)
      .input("idNC", sql.Int, nc.idNC)
      .input("resp", sql.VarChar(255), h.loginResponsable)
      .input("fecha", sql.Date, h.fechaCompromiso)
      .query("UPDATE sgc_hallazgos SET idNC = @idNC, loginResponsable = @resp, fechaCompromiso = @fecha WHERE idHallazgo = @idH");
    await tx.commit();
    res.status(201).json({ ok: true, data: { idHallazgo, idNC: nc.idNC, folioNC: nc.folio } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "El responsable no es un usuario válido.");
    console.error("[sgcAuditorias.service] crearNCDeHallazgo:", err);
    _err(res, 500, "Error interno");
  }
}

/** PATCH /api/sgc/auditorias/:id/estatus  body: { nuevoEstatus, conclusiones? } */
async function cambiarEstatusAuditoria(req, res) {
  const id = _int(req.params.id);
  const nuevo = _int(req.body?.nuevoEstatus);
  const conclusiones = _texto(req.body?.conclusiones, 8000);
  if (!id) return _err(res, 400, "Auditoría inválida");
  if (!AUD_ESTATUS[nuevo]) return _err(res, 400, "Estatus inválido");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const a = (await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query("SELECT idEstatus FROM sgc_auditorias WITH (UPDLOCK) WHERE idAuditoria = @id AND idEmpresa = @idEmpresa")).recordset[0];
    if (!a) return _abortar(tx, res, 404, "Auditoría no encontrada");
    if (!TRANSICIONES[a.idEstatus].includes(nuevo)) {
      return _abortar(tx, res, 400, `No se puede pasar de «${AUD_ESTATUS[a.idEstatus]}» a «${AUD_ESTATUS[nuevo]}».`);
    }
    if (nuevo === 3 && !conclusiones) return _abortar(tx, res, 400, "Registra las conclusiones para completar la auditoría.");
    if (nuevo === 4 && !conclusiones) return _abortar(tx, res, 400, "Indica el motivo de la cancelación.");

    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("nuevo", sql.TinyInt, nuevo)
      .input("conclusiones", sql.NVarChar(sql.MAX), conclusiones)
      .query(`
        UPDATE sgc_auditorias
        SET idEstatus = @nuevo,
            fechaEjecucion = CASE WHEN @nuevo = 2 AND fechaEjecucion IS NULL THEN ${HOY_SQL} ELSE fechaEjecucion END,
            conclusiones = COALESCE(@conclusiones, conclusiones)
        WHERE idAuditoria = @id
      `);
    await tx.commit();
    res.json({ ok: true, data: { idAuditoria: id, idEstatus: nuevo, estatusLabel: AUD_ESTATUS[nuevo] } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgcAuditorias.service] cambiarEstatusAuditoria:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { getAuditorias, getAuditoria, crearAuditoria, crearHallazgo, crearNCDeHallazgo, cambiarEstatusAuditoria };
