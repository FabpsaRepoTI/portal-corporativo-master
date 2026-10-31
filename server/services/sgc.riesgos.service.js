// server/services/sgc.riesgos.service.js
// Riesgos y oportunidades del SGC/SGI (ISO 9001 cl. 6.1).
//
// Tipo: 1 Riesgo, 2 Oportunidad. Estatus: 1 Activo, 2 Mitigado, 3 Aceptado.
// Nivel = probabilidad × impacto (1–5 c/u): <5 bajo, 5–12 medio, >12 alto.
// No se guarda en sgc_riesgos: se calcula. Cada alta, actualización y cambio
// de estatus deja una fila en sgc_historial_riesgos con la evaluación vigente
// (probabilidad e impacto en ese momento; nivelRiesgo es columna calculada)
// para ver su evolución.
// Registran riesgos el Coordinador (1), el Auditor (2) y el Responsable de
// área (3); los actualizan el Coordinador o el responsable. Dirección (4) lee.
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { notificarCoordinadores } = require("./sgc.notificaciones.service");
const { _err, _int, _fecha, _texto, _mismo, _rollback, _abortar, RIESGO_TIPO, RIESGO_ESTATUS, RIESGO_CATEGORIA, nivelRiesgo } = C;

const _escala = (v) => {
  const n = _int(v);
  return n >= 1 && n <= 5 ? n : null;
};

/** Monto en MXN ≥ 0 con 2 decimales, null si viene vacío, NaN si es inválido. */
function _monto(v) {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? Math.round(n * 100) / 100 : NaN;
}

const _puedeEditar = (req, r) => req.sgcRol === 1 || _mismo(r.loginResponsable, req.login);

function _formatear(r) {
  const nivel = r.probabilidad * r.impacto;
  const n = nivelRiesgo(nivel);
  return {
    ...r,
    impactoEconomico: r.impactoEconomico == null ? null : Number(r.impactoEconomico),
    tipoLabel: RIESGO_TIPO[r.tipo],
    estatusLabel: RIESGO_ESTATUS[r.idEstatus],
    categoriaLabel: RIESGO_CATEGORIA[r.categoria] || null,
    nivel,
    nivelClave: n.clave,
    nivelLabel: n.label,
  };
}

const RIESGO_SELECT = `
  SELECT r.idRiesgo, r.tipo, r.nombre, r.descripcion, r.probabilidad, r.impacto, r.categoria,
         r.impactoEconomico, r.controlExistente, r.planTratamiento, r.clausulaISO, r.idEstatus,
         r.fechaRevision, r.fechaCreacion, r.loginResponsable, LTRIM(RTRIM(ur.name)) AS responsable
  FROM sgc_riesgos r
  LEFT JOIN sec_users ur ON ur.login = r.loginResponsable
`;

/** Inserta la evaluación vigente en el historial (dentro de la transacción). */
function _historial(tx, { idRiesgo, probabilidad, impacto, login, notas }) {
  return new sql.Request(tx)
    .input("id", sql.Int, idRiesgo)
    .input("p", sql.TinyInt, probabilidad)
    .input("i", sql.TinyInt, impacto)
    .input("login", sql.VarChar(255), login)
    .input("notas", sql.NVarChar(sql.MAX), notas)
    .query(`INSERT INTO sgc_historial_riesgos (idRiesgo, probabilidad, impacto, login, notas)
            VALUES (@id, @p, @i, @login, @notas)`);
}

/**
 * GET /api/sgc/riesgos?tipo=1|2&categoria=1..5&idEstatus=1,2&nivelMin=1&nivelMax=25
 * Solo registros vigentes (activo = 1).
 */
async function getRiesgos(req, res) {
  try {
    const q = req.query;
    const db = await getPool();
    const request = db.request().input("idEmpresa", sql.Int, req.idEmpresa);
    const where = ["r.idEmpresa = @idEmpresa", "r.activo = 1"];
    const tipo = _int(q.tipo);
    if (RIESGO_TIPO[tipo]) {
      request.input("tipo", sql.TinyInt, tipo);
      where.push("r.tipo = @tipo");
    }
    const categoria = _int(q.categoria);
    if (RIESGO_CATEGORIA[categoria]) {
      request.input("categoria", sql.TinyInt, categoria);
      where.push("r.categoria = @categoria");
    }
    const estatus = C._ints(q.idEstatus, [1, 2, 3]);
    if (estatus.length) where.push(C._in(request, "r.idEstatus", "est", estatus, sql.TinyInt));
    const nMin = _int(q.nivelMin);
    const nMax = _int(q.nivelMax);
    if (nMin >= 1 && nMin <= 25) {
      request.input("nMin", sql.Int, nMin);
      where.push("r.probabilidad * r.impacto >= @nMin");
    }
    if (nMax >= 1 && nMax <= 25) {
      request.input("nMax", sql.Int, nMax);
      where.push("r.probabilidad * r.impacto <= @nMax");
    }
    const r = await request.query(`${RIESGO_SELECT} WHERE ${where.join(" AND ")}
                                   ORDER BY r.probabilidad * r.impacto DESC, r.impactoEconomico DESC, r.nombre`);
    res.json({ ok: true, data: r.recordset.map(_formatear) });
  } catch (err) {
    console.error("[sgc.riesgos.service] getRiesgos:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/riesgos/:id — riesgo + historial de evaluaciones (más reciente primero). */
async function getRiesgo(req, res) {
  try {
    const id = _int(req.params.id);
    if (!id) return _err(res, 400, "Riesgo inválido");
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        ${RIESGO_SELECT} WHERE r.idRiesgo = @id AND r.idEmpresa = @idEmpresa AND r.activo = 1;

        SELECT h.idHistorial, h.probabilidad, h.impacto, h.nivelRiesgo, h.login,
               LTRIM(RTRIM(u.name)) AS nombre, h.notas, h.fechaRegistro
        FROM sgc_historial_riesgos h
        LEFT JOIN sec_users u ON u.login = h.login
        WHERE h.idRiesgo = @id
        ORDER BY h.fechaRegistro DESC, h.idHistorial DESC;
      `);
    const riesgo = r.recordsets[0][0];
    if (!riesgo) return _err(res, 404, "Riesgo no encontrado");
    res.json({
      ok: true,
      data: {
        ..._formatear(riesgo),
        historial: r.recordsets[1].map((h) => {
          const nivel = h.nivelRiesgo ?? h.probabilidad * h.impacto;
          return { ...h, nivel, nivelClave: nivelRiesgo(nivel).clave, nivelLabel: nivelRiesgo(nivel).label };
        }),
        puedeEditar: req.sgcRol !== 4 && _puedeEditar(req, riesgo),
      },
    });
  } catch (err) {
    console.error("[sgc.riesgos.service] getRiesgo:", err);
    _err(res, 500, "Error interno");
  }
}

/** Lee y valida los campos editables. `parcial` = solo los que vienen en el body. */
function _campos(b, parcial) {
  const c = {};
  const viene = (k) => !parcial || b[k] !== undefined;
  if (viene("nombre")) c.nombre = _texto(b.nombre, 200);
  if (viene("descripcion")) c.descripcion = _texto(b.descripcion);
  if (viene("tipo")) c.tipo = _int(b.tipo) || (parcial ? null : 1);
  if (viene("probabilidad")) c.probabilidad = _escala(b.probabilidad);
  if (viene("impacto")) c.impacto = _escala(b.impacto);
  if (viene("categoria")) c.categoria = b.categoria === null || b.categoria === "" ? null : _int(b.categoria);
  if (viene("impactoEconomico")) c.impactoEconomico = _monto(b.impactoEconomico);
  if (viene("controlExistente")) c.controlExistente = _texto(b.controlExistente);
  if (viene("planTratamiento")) c.planTratamiento = _texto(b.planTratamiento);
  if (viene("clausulaISO")) c.clausulaISO = _texto(b.clausulaISO, 20);
  if (viene("loginResponsable")) c.loginResponsable = _texto(b.loginResponsable, 255);
  if (viene("fechaRevision")) c.fechaRevision = _fecha(b.fechaRevision);

  if ("nombre" in c && !c.nombre) return { error: "Escribe el nombre del riesgo u oportunidad." };
  if ("tipo" in c && !RIESGO_TIPO[c.tipo]) return { error: "Tipo inválido" };
  if (("probabilidad" in c && !c.probabilidad) || ("impacto" in c && !c.impacto)) return { error: "Probabilidad e impacto deben estar entre 1 y 5." };
  if ("categoria" in c && c.categoria !== null && !RIESGO_CATEGORIA[c.categoria]) return { error: "Categoría inválida" };
  if (Number.isNaN(c.impactoEconomico)) return { error: "El impacto económico debe ser un monto en pesos (0 o mayor)." };
  if ("loginResponsable" in c && !c.loginResponsable) return { error: "Asigna un responsable." };
  if (b.fechaRevision && !c.fechaRevision) return { error: "Fecha de revisión inválida" };
  return { c };
}

const COLUMNAS = {
  nombre: sql.NVarChar(200),
  descripcion: sql.NVarChar(sql.MAX),
  tipo: sql.TinyInt,
  probabilidad: sql.TinyInt,
  impacto: sql.TinyInt,
  categoria: sql.TinyInt,
  impactoEconomico: sql.Decimal(14, 2),
  controlExistente: sql.NVarChar(sql.MAX),
  planTratamiento: sql.NVarChar(sql.MAX),
  clausulaISO: sql.NVarChar(20),
  loginResponsable: sql.VarChar(255),
  fechaRevision: sql.Date,
};
const ETIQUETAS = {
  nombre: "nombre",
  descripcion: "descripción",
  tipo: "tipo",
  probabilidad: "probabilidad",
  impacto: "impacto",
  categoria: "categoría",
  impactoEconomico: "impacto económico",
  controlExistente: "controles",
  planTratamiento: "plan de tratamiento",
  clausulaISO: "cláusula ISO",
  loginResponsable: "responsable",
  fechaRevision: "próxima revisión",
};

/**
 * POST /api/sgc/riesgos (Coordinador, Auditor y Responsable de área)
 * body: { tipo, nombre, descripcion?, probabilidad, impacto, categoria?, impactoEconomico?,
 *         planTratamiento?, controlExistente?, clausulaISO?, loginResponsable, fechaRevision? }
 */
async function crearRiesgo(req, res) {
  const b = req.body || {};
  if (![1, 2, 3].includes(req.sgcRol)) return _err(res, 403, "Sin permisos para registrar riesgos.");
  const { c, error } = _campos(b, false);
  if (error) return _err(res, 400, error);

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const request = new sql.Request(tx).input("idEmpresa", sql.Int, req.idEmpresa);
    for (const [k, tipo] of Object.entries(COLUMNAS)) request.input(k, tipo, c[k] ?? null);
    const ins = await request.query(`
      INSERT INTO sgc_riesgos (idEmpresa, ${Object.keys(COLUMNAS).join(", ")}, idEstatus, activo)
      OUTPUT INSERTED.idRiesgo
      VALUES (@idEmpresa, ${Object.keys(COLUMNAS).map((k) => "@" + k).join(", ")}, 1, 1)
    `);
    const idRiesgo = ins.recordset[0].idRiesgo;
    await _historial(tx, { idRiesgo, probabilidad: c.probabilidad, impacto: c.impacto, login: req.login, notas: "Evaluación inicial" });
    const nivel = c.probabilidad * c.impacto;
    if (c.tipo === 1 && nivel >= C.NIVEL_ALTO_MIN) {
      await notificarCoordinadores(
        tx,
        { actor: req.login, tipo: "RIESGO_ALTO", titulo: `Riesgo de nivel ${nivel} registrado`, mensaje: c.nombre, entidad: "RIESGO", idEntidad: idRiesgo },
        [c.loginResponsable],
      );
    }
    await tx.commit();
    res.status(201).json({ ok: true, data: { idRiesgo, nivel: c.probabilidad * c.impacto } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "El responsable no es un usuario válido.");
    console.error("[sgc.riesgos.service] crearRiesgo:", err);
    _err(res, 500, "Error interno");
  }
}

/** Valor comparable para detectar cambios reales. */
const _cmp = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v));

/**
 * PUT /api/sgc/riesgos/:id — actualiza los campos que vengan en el body.
 * Siempre deja una fila en sgc_historial_riesgos con la evaluación vigente;
 * `notas` (opcional) explica el cambio, si no se describen los campos tocados.
 */
async function actualizarRiesgo(req, res) {
  const id = _int(req.params.id);
  const b = req.body || {};
  if (!id) return _err(res, 400, "Riesgo inválido");
  if (req.sgcRol === 4) return _err(res, 403, "Dirección tiene acceso de solo lectura.");
  const { c, error } = _campos(b, true);
  if (error) return _err(res, 400, error);

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const r = (await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT * FROM sgc_riesgos WITH (UPDLOCK) WHERE idRiesgo = @id AND idEmpresa = @idEmpresa AND activo = 1`)).recordset[0];
    if (!r) return _abortar(tx, res, 404, "Riesgo no encontrado");
    if (!_puedeEditar(req, r)) return _abortar(tx, res, 403, "Solo el Coordinador o el responsable pueden actualizar este riesgo.");

    const cambios = Object.keys(c).filter((k) => _cmp(c[k]) !== _cmp(k === "impactoEconomico" && r[k] != null ? Number(r[k]) : r[k]));
    if (!cambios.length) return _abortar(tx, res, 400, "No hay cambios que guardar.");

    const request = new sql.Request(tx).input("id", sql.Int, id);
    for (const k of cambios) request.input(k, COLUMNAS[k], c[k]);
    await request.query(`UPDATE sgc_riesgos SET ${cambios.map((k) => `${k} = @${k}`).join(", ")} WHERE idRiesgo = @id`);

    const p = c.probabilidad ?? r.probabilidad;
    const i = c.impacto ?? r.impacto;
    let notas = _texto(b.notas, 2000);
    if (!notas) {
      const antes = r.probabilidad * r.impacto;
      notas = cambios.includes("probabilidad") || cambios.includes("impacto")
        ? `Reevaluación: nivel ${antes} → ${p * i}`
        : `Actualización de ${cambios.map((k) => ETIQUETAS[k]).join(", ")}`;
    }
    await _historial(tx, { idRiesgo: id, probabilidad: p, impacto: i, login: req.login, notas });
    await tx.commit();
    const n = nivelRiesgo(p * i);
    res.json({ ok: true, data: { idRiesgo: id, nivel: p * i, nivelLabel: n.label, nivelClave: n.clave, cambios } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "El responsable no es un usuario válido.");
    console.error("[sgc.riesgos.service] actualizarRiesgo:", err);
    _err(res, 500, "Error interno");
  }
}

/** PUT /api/sgc/riesgos/:id/estatus  body: { idEstatus: 1|2|3, notas? } */
async function cambiarEstatusRiesgo(req, res) {
  const id = _int(req.params.id);
  const b = req.body || {};
  const nuevo = _int(b.idEstatus);
  if (!id) return _err(res, 400, "Riesgo inválido");
  if (req.sgcRol === 4) return _err(res, 403, "Dirección tiene acceso de solo lectura.");
  if (!RIESGO_ESTATUS[nuevo]) return _err(res, 400, "Estatus inválido");
  const notas = _texto(b.notas, 2000);
  // Aceptar un riesgo sin tratarlo es una decisión que debe quedar justificada
  if (nuevo === 3 && !notas) return _err(res, 400, "Justifica por qué se acepta el riesgo.");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const r = (await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`SELECT idRiesgo, idEstatus, probabilidad, impacto, loginResponsable
              FROM sgc_riesgos WITH (UPDLOCK) WHERE idRiesgo = @id AND idEmpresa = @idEmpresa AND activo = 1`)).recordset[0];
    if (!r) return _abortar(tx, res, 404, "Riesgo no encontrado");
    if (!_puedeEditar(req, r)) return _abortar(tx, res, 403, "Solo el Coordinador o el responsable pueden cambiar el estatus.");
    if (r.idEstatus === nuevo) return _abortar(tx, res, 400, `El registro ya está «${RIESGO_ESTATUS[nuevo]}».`);

    await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("nuevo", sql.TinyInt, nuevo)
      .query(`UPDATE sgc_riesgos SET idEstatus = @nuevo WHERE idRiesgo = @id`);
    await _historial(tx, {
      idRiesgo: id,
      probabilidad: r.probabilidad,
      impacto: r.impacto,
      login: req.login,
      notas: `Estatus: ${RIESGO_ESTATUS[r.idEstatus]} → ${RIESGO_ESTATUS[nuevo]}${notas ? ". " + notas : ""}`,
    });
    await tx.commit();
    res.json({ ok: true, data: { idRiesgo: id, idEstatus: nuevo, estatusLabel: RIESGO_ESTATUS[nuevo] } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgc.riesgos.service] cambiarEstatusRiesgo:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { getRiesgos, getRiesgo, crearRiesgo, actualizarRiesgo, cambiarEstatusRiesgo };
