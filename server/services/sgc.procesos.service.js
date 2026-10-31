// server/services/sgc.procesos.service.js
// Mapa de procesos del SGC/SGI (ISO 9001 cl. 4.4): procesos estratégicos,
// operativos y de apoyo, y cómo se relacionan (1 Alimenta, 2 Controla,
// 3 Apoya). El visor guarda la posición de cada nodo (posX, posY).
//
// Todos los roles SGC consultan el mapa; solo el Coordinador (1) lo edita.
// Eliminar un proceso es baja lógica (activo = 0) y quita sus relaciones.
//
// "NCs abiertas asociadas": las NCs vinculadas al proceso
// (sgc_no_conformidades.idProceso) que siguen abiertas.
const { getPool, sql } = require("../db");
const C = require("./sgcComun.service");
const { _err, _int, _texto, _rollback, _abortar, PROCESO_TIPO, RELACION_TIPO } = C;

const _color = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? String(v) : null);
const _coord = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) < 1e6 ? Math.round(n * 10) / 10 : null;
};

const PROCESO_SELECT = `
  SELECT p.idProceso, p.nombre, p.descripcion, p.tipo, p.loginResponsable, LTRIM(RTRIM(u.name)) AS responsable,
         p.clausulaISO, p.color, p.posX, p.posY, p.fechaCreacion,
         (SELECT COUNT(*) FROM sgc_no_conformidades nc
           WHERE nc.idProceso = p.idProceso AND nc.idEstatus IN (1, 2, 3, 4)) AS ncAbiertas
  FROM sgc_procesos p
  LEFT JOIN sec_users u ON u.login = p.loginResponsable
`;

const _formatear = (p) => ({ ...p, tipoLabel: PROCESO_TIPO[p.tipo] });

/** Posición guardada o una por tipo (fila por tipo) si el proceso aún no tiene. */
function _posicion(p, indicePorTipo) {
  if (p.posX != null && p.posY != null) return { x: p.posX, y: p.posY };
  const n = (indicePorTipo[p.tipo] ?? -1) + 1;
  indicePorTipo[p.tipo] = n;
  return { x: 40 + n * 280, y: (p.tipo - 1) * 220 + 40 };
}

/**
 * GET /api/sgc/procesos/mapa — { nodos, aristas, puedeEditar } con la forma
 * que espera React Flow: nodo { id, type, position, data } y arista
 * { id, source, target, label, data }. data lleva el registro completo.
 */
async function getMapa(req, res) {
  try {
    const db = await getPool();
    const r = await db.request()
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        ${PROCESO_SELECT}
        WHERE p.idEmpresa = @idEmpresa AND p.activo = 1
        ORDER BY p.tipo, p.nombre;

        SELECT rel.idRelacion, rel.idProcesoOrigen, rel.idProcesoDestino, rel.tipo, rel.descripcion
        FROM sgc_procesos_relaciones rel
        JOIN sgc_procesos o ON o.idProceso = rel.idProcesoOrigen AND o.activo = 1 AND o.idEmpresa = @idEmpresa
        JOIN sgc_procesos d ON d.idProceso = rel.idProcesoDestino AND d.activo = 1 AND d.idEmpresa = @idEmpresa
        ORDER BY rel.idRelacion;
      `);
    const indice = {};
    res.json({
      ok: true,
      data: {
        nodos: r.recordsets[0].map((p) => ({
          id: String(p.idProceso),
          type: "proceso",
          position: _posicion(p, indice),
          data: _formatear(p),
        })),
        aristas: r.recordsets[1].map((x) => ({
          id: `r${x.idRelacion}`,
          source: String(x.idProcesoOrigen),
          target: String(x.idProcesoDestino),
          label: RELACION_TIPO[x.tipo],
          data: { ...x, tipoLabel: RELACION_TIPO[x.tipo] },
        })),
        puedeEditar: req.sgcRol === 1,
      },
    });
  } catch (err) {
    console.error("[sgc.procesos.service] getMapa:", err);
    _err(res, 500, "Error interno");
  }
}

/** GET /api/sgc/procesos/:id — ficha del proceso y sus NCs abiertas vinculadas. */
async function getProceso(req, res) {
  try {
    const id = _int(req.params.id);
    if (!id) return _err(res, 400, "Proceso inválido");
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        ${PROCESO_SELECT} WHERE p.idProceso = @id AND p.idEmpresa = @idEmpresa AND p.activo = 1;

        SELECT TOP 10 nc.idNC, nc.folioNC AS folio, LEFT(nc.descripcion, 140) AS descripcion, nc.idEstatus,
               nc.fechaCompromiso, DATEDIFF(DAY, ${C.HOY_SQL}, nc.fechaCompromiso) AS diasRestantes
        FROM sgc_no_conformidades nc
        WHERE nc.idProceso = @id AND nc.idEmpresa = @idEmpresa AND nc.idEstatus IN (1, 2, 3, 4)
        ORDER BY nc.fechaCompromiso, nc.idNC;
      `);
    const p = r.recordsets[0][0];
    if (!p) return _err(res, 404, "Proceso no encontrado");
    res.json({ ok: true, data: { ..._formatear(p), ncs: r.recordsets[1].map((n) => ({ ...n, estatusLabel: C.NC_ESTATUS[n.idEstatus] })) } });
  } catch (err) {
    console.error("[sgc.procesos.service] getProceso:", err);
    _err(res, 500, "Error interno");
  }
}

const COLUMNAS = {
  nombre: sql.NVarChar(120),
  descripcion: sql.NVarChar(sql.MAX),
  tipo: sql.TinyInt,
  loginResponsable: sql.VarChar(255),
  clausulaISO: sql.NVarChar(20),
  color: sql.NVarChar(7),
  posX: sql.Float,
  posY: sql.Float,
};

function _campos(b, parcial) {
  const c = {};
  const viene = (k) => !parcial || b[k] !== undefined;
  if (viene("nombre")) c.nombre = _texto(b.nombre, 120);
  if (viene("descripcion")) c.descripcion = _texto(b.descripcion);
  if (viene("tipo")) c.tipo = _int(b.tipo);
  if (viene("loginResponsable")) c.loginResponsable = _texto(b.loginResponsable, 255);
  if (viene("clausulaISO")) c.clausulaISO = _texto(b.clausulaISO, 20);
  if (b.color !== undefined) c.color = _color(b.color);
  if (b.posX !== undefined) c.posX = _coord(b.posX);
  if (b.posY !== undefined) c.posY = _coord(b.posY);
  if ("nombre" in c && !c.nombre) return { error: "Escribe el nombre del proceso." };
  if ("tipo" in c && !PROCESO_TIPO[c.tipo]) return { error: "Elige el tipo de proceso." };
  if (b.color !== undefined && b.color !== null && !c.color) return { error: "Color inválido (usa #RRGGBB)." };
  if ((b.posX !== undefined && c.posX === null) || (b.posY !== undefined && c.posY === null)) return { error: "Posición inválida" };
  return { c };
}

/** POST /api/sgc/procesos (Coordinador) body: { nombre, tipo, descripcion?, loginResponsable?, clausulaISO?, color?, posX?, posY? } */
async function crearProceso(req, res) {
  const { c, error } = _campos(req.body || {}, false);
  if (error) return _err(res, 400, error);
  try {
    const db = await getPool();
    const request = db.request().input("idEmpresa", sql.Int, req.idEmpresa);
    const cols = Object.keys(COLUMNAS).filter((k) => c[k] !== undefined && c[k] !== null);
    for (const k of cols) request.input(k, COLUMNAS[k], c[k]);
    const r = await request.query(`
      INSERT INTO sgc_procesos (idEmpresa, ${cols.join(", ")}, activo)
      OUTPUT INSERTED.idProceso
      VALUES (@idEmpresa, ${cols.map((k) => "@" + k).join(", ")}, 1)
    `);
    res.status(201).json({ ok: true, data: { idProceso: r.recordset[0].idProceso } });
  } catch (err) {
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "El responsable no es un usuario válido.");
    console.error("[sgc.procesos.service] crearProceso:", err);
    _err(res, 500, "Error interno");
  }
}

/** PUT /api/sgc/procesos/:id (Coordinador) — campos parciales, incluida la posición. */
async function actualizarProceso(req, res) {
  const id = _int(req.params.id);
  if (!id) return _err(res, 400, "Proceso inválido");
  const { c, error } = _campos(req.body || {}, true);
  if (error) return _err(res, 400, error);
  const cols = Object.keys(c);
  if (!cols.length) return _err(res, 400, "No hay cambios que guardar.");
  try {
    const db = await getPool();
    const request = db.request().input("id", sql.Int, id).input("idEmpresa", sql.Int, req.idEmpresa);
    for (const k of cols) request.input(k, COLUMNAS[k], c[k]);
    const r = await request.query(`
      UPDATE sgc_procesos SET ${cols.map((k) => `${k} = @${k}`).join(", ")}
      WHERE idProceso = @id AND idEmpresa = @idEmpresa AND activo = 1
    `);
    if (!r.rowsAffected[0]) return _err(res, 404, "Proceso no encontrado");
    res.json({ ok: true, data: { idProceso: id } });
  } catch (err) {
    if (C._esReferenciaInvalida(err)) return _err(res, 400, "El responsable no es un usuario válido.");
    console.error("[sgc.procesos.service] actualizarProceso:", err);
    _err(res, 500, "Error interno");
  }
}

/**
 * DELETE /api/sgc/procesos/:id (Coordinador) — baja lógica y quita sus
 * relaciones. Las NCs conservan el vínculo (el proceso sigue existiendo como
 * histórico, solo deja de mostrarse en el mapa).
 */
async function eliminarProceso(req, res) {
  const id = _int(req.params.id);
  if (!id) return _err(res, 400, "Proceso inválido");
  let tx;
  try {
    const db = await getPool();
    tx = new sql.Transaction(db);
    await tx.begin();
    const r = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`UPDATE sgc_procesos SET activo = 0 WHERE idProceso = @id AND idEmpresa = @idEmpresa AND activo = 1`);
    if (!r.rowsAffected[0]) return _abortar(tx, res, 404, "Proceso no encontrado");
    const rel = await new sql.Request(tx)
      .input("id", sql.Int, id)
      .query(`DELETE FROM sgc_procesos_relaciones WHERE idProcesoOrigen = @id OR idProcesoDestino = @id`);
    await tx.commit();
    res.json({ ok: true, data: { idProceso: id, relacionesEliminadas: rel.rowsAffected[0] } });
  } catch (err) {
    if (tx) await _rollback(tx);
    console.error("[sgc.procesos.service] eliminarProceso:", err);
    _err(res, 500, "Error interno");
  }
}

/** POST /api/sgc/procesos/relacion (Coordinador) body: { idProcesoOrigen, idProcesoDestino, tipo, descripcion? } */
async function crearRelacion(req, res) {
  const b = req.body || {};
  const origen = _int(b.idProcesoOrigen);
  const destino = _int(b.idProcesoDestino);
  const tipo = _int(b.tipo) || 1;
  if (!origen || !destino) return _err(res, 400, "Elige los dos procesos de la conexión.");
  if (origen === destino) return _err(res, 400, "Un proceso no puede conectarse consigo mismo.");
  if (!RELACION_TIPO[tipo]) return _err(res, 400, "Tipo de relación inválido");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("o", sql.Int, origen)
      .input("d", sql.Int, destino)
      .input("tipo", sql.TinyInt, tipo)
      .input("descripcion", sql.NVarChar(200), _texto(b.descripcion, 200))
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        IF (SELECT COUNT(*) FROM sgc_procesos WHERE idProceso IN (@o, @d) AND idEmpresa = @idEmpresa AND activo = 1) < 2
          SELECT 'faltan' AS error;
        ELSE IF EXISTS (SELECT 1 FROM sgc_procesos_relaciones WHERE idProcesoOrigen = @o AND idProcesoDestino = @d AND tipo = @tipo)
          SELECT 'duplicada' AS error;
        ELSE
          INSERT INTO sgc_procesos_relaciones (idProcesoOrigen, idProcesoDestino, tipo, descripcion)
          OUTPUT INSERTED.idRelacion
          VALUES (@o, @d, @tipo, @descripcion);
      `);
    const fila = r.recordset[0];
    if (fila?.error === "faltan") return _err(res, 400, "Alguno de los procesos no existe.");
    if (fila?.error === "duplicada") return _err(res, 400, "Esa conexión ya existe.");
    res.status(201).json({ ok: true, data: { idRelacion: fila.idRelacion } });
  } catch (err) {
    console.error("[sgc.procesos.service] crearRelacion:", err);
    _err(res, 500, "Error interno");
  }
}

/** DELETE /api/sgc/procesos/relacion/:id (Coordinador) */
async function eliminarRelacion(req, res) {
  const id = _int(req.params.id);
  if (!id) return _err(res, 400, "Relación inválida");
  try {
    const db = await getPool();
    const r = await db.request()
      .input("id", sql.Int, id)
      .input("idEmpresa", sql.Int, req.idEmpresa)
      .query(`
        DELETE rel FROM sgc_procesos_relaciones rel
        JOIN sgc_procesos o ON o.idProceso = rel.idProcesoOrigen AND o.idEmpresa = @idEmpresa
        WHERE rel.idRelacion = @id
      `);
    if (!r.rowsAffected[0]) return _err(res, 404, "Relación no encontrada");
    res.json({ ok: true, data: { idRelacion: id } });
  } catch (err) {
    console.error("[sgc.procesos.service] eliminarRelacion:", err);
    _err(res, 500, "Error interno");
  }
}

module.exports = { getMapa, getProceso, crearProceso, actualizarProceso, eliminarProceso, crearRelacion, eliminarRelacion };
