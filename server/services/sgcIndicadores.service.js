// server/services/sgcIndicadores.service.js
// Indicadores del SGC/SGI y sus valores por periodo.
//
// Frecuencia: 1 Mensual, 2 Trimestral, 3 Semestral, 4 Anual.
// Semáforo del último valor según el sentido de la meta:
//   sentido 1 (mayor es mejor): verde ≥ meta, amarillo ≥ 80 % de la meta, rojo abajo.
//   sentido 2 (menor es mejor): verde ≤ meta, amarillo ≤ 120 % de la meta, rojo arriba.
// Sin meta o sin valores: sin semáforo.
// Crean y editan indicadores el Coordinador (1) y Dirección (4); registran
// valores el responsable del indicador o el Coordinador.
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { _err, _int, _texto, _mismo, _rollback, _abortar, FRECUENCIA } = C;

function semaforo(valor, meta, sentido = 1) {
  if (valor == null || meta == null) return null;
  const v = Number(valor);
  const m = Number(meta);
  if (sentido === 2) {
    if (v <= m) return "verde";
    if (v <= m * 1.2) return "amarillo";
    return "rojo";
  }
  if (m === 0) return v >= 0 ? "verde" : "rojo";
  if (v >= m) return "verde";
  if (v >= m * 0.8) return "amarillo";
  return "rojo";
}

const _puedeAdministrar = (req) => [1, 4].includes(req.sgcRol);
const _puedeRegistrar = (req, ind) => req.sgcRol === 1 || _mismo(ind.loginResponsable, req.login);

function _formatear(i) {
  return {
    ...i,
    meta: i.meta == null ? null : Number(i.meta),
    ultimoValor: i.ultimoValor == null ? null : Number(i.ultimoValor),
    activo: !!i.activo,
    frecuenciaLabel: FRECUENCIA[i.frecuencia],
    semaforo: semaforo(i.ultimoValor, i.meta, i.sentido),
  };
}

const IND_SELECT = `
  SELECT i.idIndicador, i.clave, i.nombre, i.descripcion, i.unidad, i.meta, i.frecuencia, i.activo, i.sentido,
         i.clausulaISO, i.formulaCalculo, i.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable,
         uv.valor AS ultimoValor, uv.periodo AS ultimoPeriodo
  FROM sgc_indicadores i
  LEFT JOIN sec_users u ON u.login = i.loginResponsable
  OUTER APPLY (SELECT TOP 1 v.valor, v.periodo FROM sgc_indicadores_valores v
               WHERE v.idIndicador = i.idIndicador ORDER BY v.periodo DESC) uv
`;

/** GET /api/sgc/indicadores?frecuencia=1&activo=1&semaforo=verde|amarillo|rojo|sin */
async function getIndicadores(req, res) {
  try {
    const q = req.query;
    const db = await getPool();
    const request = db.request().input("idEmpresa", sql.Int, req.idEmpresa);
    const where = ["i.idEmpresa = @idEmpresa"];
    const frecuencia = _int(q.frecuencia);
    if (FRECUENCIA[frecuencia]) {
      request.input("frecuencia", sql.TinyInt, frecuencia);
      where.push("i.frecuencia = @frecuencia");
    }
    if (q.activo !== "todos") {
      request.input("activo", sql.Bit, q.activo === "0" ? 0 : 1);
      where.push("ISNULL(i.activo, 1) = @activo");
    }
    const r = await request.query(`
      ${IND_SELECT} WHERE ${where.join(" AND ")} ORDER BY i.nombre;

      -- Últimos 12 valores por indicador (sparkline y variación)
      SELECT x.idIndicador, x.periodo, x.valor
      FROM (
        SELECT v.idIndicador, v.periodo, v.valor,
               ROW_NUMBER() OVER (PARTITION BY v.idIndicador ORDER BY v.periodo DESC) AS n
        FROM sgc_indicadores_valores v
        JOIN sgc_indicadores i ON i.idIndicador = v.idIndicador
        WHERE ${where.join(" AND ")}
      ) x
      WHERE x.n <= 12
      ORDER BY x.idIndicador, x.periodo;
    `);
    const series = {};
    for (const v of r.recordsets[1]) (series[v.idIndicador] ||= []).push({ periodo: v.periodo, valor: Number(v.valor) });
    let items = r.recordsets[0].map((i) => {
      const serie = series[i.idIndicador] || [];
      return { ..._formatear(i), serie, valorAnterior: serie.length > 1 ? serie[serie.length - 2].valor : null };
    });
    if (["verde", "amarillo", "rojo"].includes(q.semaforo)) items = items.filter((i) => i.semaforo === q.semaforo);
    else if (q.semaforo === "sin") items = items.filter((i) => !i.semaforo);
    res.json({ ok: true, data: items });
  } catch (err) {
    console.error("[sgcIndicadores.service] getIndicadores:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/indicadores/:id — indicador + histórico de valores (ASC) para la gráfica. */
async function getIndicador(req, res) {
  try {
    const id = _int(req.params.id);
    if (!id) return _err(res, 400, "Indicador inválido");
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        ${IND_SELECT} WHERE i.idIndicador = @id AND i.idEmpresa = @idEmpresa;

        SELECT v.idValor, v.periodo, v.valor, v.notas AS observaciones, v.login, LTRIM(RTRIM(u.name)) AS nombre, v.fechaRegistro
        FROM sgc_indicadores_valores v
        LEFT JOIN sec_users u ON u.login = v.login
        WHERE v.idIndicador = @id
        ORDER BY v.periodo ASC;
      `);
    const ind = r.recordsets[0][0];
    if (!ind) return _err(res, 404, "Indicador no encontrado");
    const meta = ind.meta == null ? null : Number(ind.meta);
    res.json({
      ok: true,
      data: {
        ..._formatear(ind),
        valores: r.recordsets[1].map((v) => ({ ...v, valor: Number(v.valor), semaforo: semaforo(v.valor, meta, ind.sentido) })),
        puedeRegistrar: _puedeRegistrar(req, ind),
        puedeEditar: _puedeAdministrar(req),
      },
    });
  } catch (err) {
    console.error("[sgcIndicadores.service] getIndicador:", err);
    _err(res, 500, "Error interno");
  }
}

function _decimal(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e8 ? Math.round(n * 100) / 100 : NaN;
}

/**
 * POST /api/sgc/indicadores (Coordinador y Dirección)
 * body: { nombre, descripcion?, unidad?, meta, frecuencia, sentido? (1 mayor / 2 menor es mejor), loginResponsable, clausulaISO?, formulaCalculo? }
 * La clave (IND-001…) se genera sola.
 */
async function crearIndicador(req, res) {
  const b = req.body || {};
  const nombre = _texto(b.nombre, 120);
  const meta = _decimal(b.meta);
  const frecuencia = _int(b.frecuencia);
  const loginResponsable = _texto(b.loginResponsable, 255);
  if (!nombre) return _err(res, 400, "Escribe el nombre del indicador.");
  if (meta === null || Number.isNaN(meta)) return _err(res, 400, "Captura una meta numérica.");
  if (!FRECUENCIA[frecuencia]) return _err(res, 400, "Selecciona la frecuencia.");
  if (!loginResponsable) return _err(res, 400, "Asigna un responsable.");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const ins = await new sql.Request(tx)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .input("nombre", sql.NVarChar(120), nombre)
      .input("descripcion", sql.NVarChar(500), _texto(b.descripcion, 500))
      .input("unidad", sql.NVarChar(20), _texto(b.unidad, 20))
      .input("meta", sql.Decimal(10, 2), meta)
      .input("frecuencia", sql.TinyInt, frecuencia)
      .input("sentido", sql.TinyInt, _int(b.sentido) === 2 ? 2 : 1)
      .input("resp", sql.VarChar(255), loginResponsable)
      .input("cl", sql.NVarChar(20), _texto(b.clausulaISO, 20))
      .input("formula", sql.NVarChar(500), _texto(b.formulaCalculo, 500))
      .query(`
        DECLARE @n INT = (SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(clave, 5, 10) AS INT)), 0) + 1
                          FROM sgc_indicadores WITH (UPDLOCK, HOLDLOCK) WHERE clave LIKE 'IND-%');
        DECLARE @clave VARCHAR(30) = 'IND-' + RIGHT('000' + CAST(@n AS VARCHAR(10)), CASE WHEN @n > 999 THEN LEN(@n) ELSE 3 END);
        INSERT INTO sgc_indicadores (idEmpresa, clave, nombre, descripcion, unidad, meta, frecuencia, sentido, loginResponsable, clausulaISO, formulaCalculo, activo)
        OUTPUT INSERTED.idIndicador, INSERTED.clave
        VALUES (@idEmpresa, @clave, @nombre, @descripcion, @unidad, @meta, @frecuencia, @sentido, @resp, @cl, @formula, 1);
      `);
    await tx.commit();
    res.status(201).json({ ok: true, data: ins.recordset[0] });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgcIndicadores.service] crearIndicador:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * POST /api/sgc/indicadores/:id/valores  body: { valor, periodo: 'YYYY-MM', observaciones? }
 * Un valor por periodo; el periodo no puede ser futuro.
 */
async function registrarValor(req, res) {
  const id = _int(req.params.id);
  const valor = _decimal(req.body?.valor);
  const periodo = String(req.body?.periodo || "");
  if (!id) return _err(res, 400, "Indicador inválido");
  if (valor === null || Number.isNaN(valor)) return _err(res, 400, "Captura un valor numérico.");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return _err(res, 400, "El periodo debe tener el formato AAAA-MM.");
  const hoy = new Date();
  const periodoActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  if (periodo > periodoActual) return _err(res, 400, "No se pueden registrar valores de periodos futuros.");

  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const ind = (await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query("SELECT idIndicador, loginResponsable, activo FROM sgc_indicadores WHERE idIndicador = @id AND idEmpresa = @idEmpresa")).recordset[0];
    if (!ind) return _abortar(tx, res, 404, "Indicador no encontrado");
    if (!_puedeRegistrar(req, ind)) return _abortar(tx, res, 403, "Solo el responsable del indicador o el Coordinador SGI pueden registrar valores.");
    if (ind.activo === false) return _abortar(tx, res, 400, "El indicador está inactivo.");

    const dup = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("periodo", sql.Date, `${periodo}-01`)
      .query("SELECT 1 AS x FROM sgc_indicadores_valores WITH (UPDLOCK, HOLDLOCK) WHERE idIndicador = @id AND periodo = @periodo");
    if (dup.recordset.length) return _abortar(tx, res, 409, `Ya existe un valor registrado para ${periodo}.`);

    const ins = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("periodo", sql.Date, `${periodo}-01`)
      .input("valor", sql.Decimal(10, 2), valor)
      .input("login", sql.VarChar(255), req.login)
      .input("notas", sql.NVarChar(500), _texto(req.body?.observaciones, 500))
      .query(`INSERT INTO sgc_indicadores_valores (idIndicador, periodo, valor, login, notas)
              OUTPUT INSERTED.idValor VALUES (@id, @periodo, @valor, @login, @notas)`);
    await tx.commit();
    res.status(201).json({ ok: true, data: { idValor: ins.recordset[0].idValor } });
  } catch (err) {
    if (tx) await _rollback(tx);
    if (err?.number === 2601 || err?.number === 2627) return _err(res, 409, `Ya existe un valor registrado para ${periodo}.`);
    console.error("[sgcIndicadores.service] registrarValor:", err);
    _err(res, 500, "Error interno");
  }
}

/** PATCH /api/sgc/indicadores/:id  body: { meta?, activo?, loginResponsable?, sentido? } (Coordinador y Dirección) */
async function actualizarIndicador(req, res) {
  const id = _int(req.params.id);
  const b = req.body || {};
  if (!id) return _err(res, 400, "Indicador inválido");
  const meta = b.meta === undefined ? undefined : _decimal(b.meta);
  if (meta !== undefined && (meta === null || Number.isNaN(meta))) return _err(res, 400, "La meta debe ser numérica.");
  const activo = b.activo === undefined ? undefined : !!b.activo;
  const resp = b.loginResponsable === undefined ? undefined : _texto(b.loginResponsable, 255);
  if (resp === null) return _err(res, 400, "El responsable no puede quedar vacío.");
  const sentido = b.sentido === undefined ? undefined : _int(b.sentido) === 2 ? 2 : 1;
  if (meta === undefined && activo === undefined && resp === undefined && sentido === undefined) return _err(res, 400, "No hay cambios que guardar.");

  try {
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .input("meta", sql.Decimal(10, 2), meta ?? null)
      .input("cambiaMeta", sql.Bit, meta === undefined ? 0 : 1)
      .input("activo", sql.Bit, activo === undefined ? null : activo ? 1 : 0)
      .input("resp", sql.VarChar(255), resp ?? null)
      .input("sentido", sql.TinyInt, sentido ?? null)
      .query(`
        UPDATE sgc_indicadores
        SET meta = CASE WHEN @cambiaMeta = 1 THEN @meta ELSE meta END,
            activo = COALESCE(@activo, activo),
            loginResponsable = COALESCE(@resp, loginResponsable),
            sentido = COALESCE(@sentido, sentido)
        WHERE idIndicador = @id AND idEmpresa = @idEmpresa
      `);
    if (!r.rowsAffected[0]) return _err(res, 404, "Indicador no encontrado");
    res.json({ ok: true, data: { idIndicador: id } });
  } catch (err) {
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "El responsable no es un usuario válido.");
    console.error("[sgcIndicadores.service] actualizarIndicador:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { getIndicadores, getIndicador, crearIndicador, registrarValor, actualizarIndicador, semaforo };
