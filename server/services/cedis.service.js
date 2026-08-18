// server/services/cedis.service.js
const { getCedisPool, sql } = require("../db.cedis");

const EMPRESA_ID = 1;

const STATUS_FACTURA = {
  CANCELADA: 1,
  ACTIVA: 2,
};

const SCAN_RESULT = {
  SCANNED: "SCANNED",
  ALREADY_SCANNED: "ALREADY_SCANNED",
  CANCELLED: "CANCELLED",
  NOT_FOUND: "NOT_FOUND",
  UNKNOWN_STATUS: "UNKNOWN_STATUS",
  ERROR: "ERROR",
};

async function scanFactura(numeroFactura, usuarioLogin) {
  const pool = await getCedisPool();
  try {
    const updateResult = await pool
      .request()
      .input("numeroFactura", sql.VarChar(50), numeroFactura)
      .input("empresaID", sql.Int, EMPRESA_ID)
      .input("usuarioFacturaSurtida", sql.NVarChar(100), usuarioLogin).query(`
        UPDATE FACTURAG
        SET
          facturaSurtida        = 1,
          fechaFacturaSurtida   = GETDATE(),
          usuarioFacturaSurtida = @usuarioFacturaSurtida
        WHERE numeroFactura              = @numeroFactura
          AND empresaID                  = @empresaID
          AND ISNULL(facturaSurtida, 0) <> 1
          AND statusFactura              = ${STATUS_FACTURA.ACTIVA};
        SELECT @@ROWCOUNT AS filasAfectadas;
      `);

    const filasAfectadas = updateResult.recordset[0]?.filasAfectadas ?? 0;

    if (filasAfectadas === 1) {
      const factura = await _getFacturaConCliente(pool, numeroFactura);
      return {
        status: SCAN_RESULT.SCANNED,
        message: "Factura surtida correctamente.",
        factura,
      };
    }

    const diag = await pool
      .request()
      .input("numeroFactura", sql.VarChar(50), numeroFactura)
      .input("empresaID", sql.Int, EMPRESA_ID).query(`
        SELECT f.numeroFactura, f.statusFactura, f.facturaSurtida,
               f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
               f.fechaFactura, f.totalFactura, f.codigoCliente, f.numeroPedido,
               c.nombre1 AS nombreCliente
        FROM FACTURAG f
        LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
        WHERE f.numeroFactura = @numeroFactura AND f.empresaID = @empresaID
      `);

    if (diag.recordset.length === 0)
      return {
        status: SCAN_RESULT.NOT_FOUND,
        message: "No se encontró ninguna factura con ese número.",
        factura: null,
      };

    const row = diag.recordset[0];

    // Debug temporal — quitar una vez confirmado el tipo de dato
    console.log(
      "[cedis] diag row facturaSurtida:",
      row.facturaSurtida,
      typeof row.facturaSurtida,
    );
    console.log(
      "[cedis] diag row fechaFacturaSurtida:",
      row.fechaFacturaSurtida,
    );
    console.log(
      "[cedis] diag row usuarioFacturaSurtida:",
      row.usuarioFacturaSurtida,
    );

    // Cubre int (1), bit (true), y campos de auditoría poblados
    const yaSurtida =
      row.facturaSurtida == 1 ||
      row.facturaSurtida === true ||
      row.fechaFacturaSurtida != null ||
      row.usuarioFacturaSurtida != null;

    if (yaSurtida) {
      const quien = row.usuarioFacturaSurtida
        ? ` por ${row.usuarioFacturaSurtida}`
        : "";
      const cuando = row.fechaFacturaSurtida
        ? ` el ${new Date(row.fechaFacturaSurtida).toLocaleString("es-MX")}`
        : "";
      return {
        status: SCAN_RESULT.ALREADY_SCANNED,
        message: `Esta factura ya fue surtida${quien}${cuando}.`,
        factura: _formatFactura(row),
      };
    }

    if (row.statusFactura === STATUS_FACTURA.CANCELADA)
      return {
        status: SCAN_RESULT.CANCELLED,
        message: "Esta factura está cancelada y no puede ser procesada.",
        factura: _formatFactura(row),
      };

    return {
      status: SCAN_RESULT.UNKNOWN_STATUS,
      message: `Estado no reconocido (statusFactura=${row.statusFactura}).`,
      factura: _formatFactura(row),
    };
  } catch (err) {
    console.error("[cedis.service] scanFactura error:", err);
    throw err;
  }
}

async function getFacturasHoy({ status, q } = {}) {
  const pool = await getCedisPool();
  try {
    const request = pool.request().input("empresaID", sql.Int, EMPRESA_ID);
    let statusFilter = "";
    if (status === "surtidas") statusFilter = "AND f.facturaSurtida = 1";
    if (status === "pendientes")
      statusFilter =
        "AND (f.facturaSurtida IS NULL OR f.facturaSurtida <> 1) AND f.statusFactura = 2";
    if (status === "canceladas") statusFilter = "AND f.statusFactura = 1";
    let searchFilter = "";
    if (q?.trim()) {
      request.input("q", sql.NVarChar(100), `%${q.trim()}%`);
      searchFilter =
        "AND (f.numeroFactura LIKE @q OR c.nombre1 LIKE @q OR f.numeroPedido LIKE @q)";
    }
    const result = await request.query(`
      SELECT f.numeroFactura, f.fechaFactura, f.totalFactura, f.statusFactura,
             f.facturaSurtida, f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
             f.codigoCliente, f.numeroPedido, c.nombre1 AS nombreCliente
      FROM FACTURAG f
      LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
      WHERE f.empresaID = @empresaID
        AND CAST(f.fechaFactura AS DATE) = CAST(GETDATE() AS DATE)
        ${statusFilter} ${searchFilter}
      ORDER BY f.fechaFactura DESC
    `);
    const facturas = result.recordset.map(_formatFactura);
    return {
      resumen: {
        total: facturas.length,
        surtidas: facturas.filter((f) => f.facturaSurtida === 1).length,
        pendientes: facturas.filter(
          (f) =>
            f.facturaSurtida !== 1 && f.statusFactura === STATUS_FACTURA.ACTIVA,
        ).length,
        canceladas: facturas.filter(
          (f) => f.statusFactura === STATUS_FACTURA.CANCELADA,
        ).length,
      },
      facturas,
    };
  } catch (err) {
    console.error("[cedis.service] getFacturasHoy error:", err);
    throw err;
  }
}

async function getHistorico({ mes, anio, status, q } = {}) {
  const pool = await getCedisPool();
  const mesNum = parseInt(mes, 10);
  const anioNum = parseInt(anio, 10);
  if (!mesNum || !anioNum || mesNum < 1 || mesNum > 12 || anioNum < 2000)
    throw new Error("Mes o año inválido.");
  try {
    const request = pool
      .request()
      .input("empresaID", sql.Int, EMPRESA_ID)
      .input("mes", sql.Int, mesNum)
      .input("anio", sql.Int, anioNum);
    let statusFilter = "";
    if (status === "surtidas") statusFilter = "AND f.facturaSurtida = 1";
    if (status === "pendientes")
      statusFilter =
        "AND (f.facturaSurtida IS NULL OR f.facturaSurtida <> 1) AND f.statusFactura = 2";
    if (status === "canceladas") statusFilter = "AND f.statusFactura = 1";
    let searchFilter = "";
    if (q?.trim()) {
      request.input("q", sql.NVarChar(100), `%${q.trim()}%`);
      searchFilter = "AND (f.numeroFactura LIKE @q OR c.nombre1 LIKE @q)";
    }
    const result = await request.query(`
      SELECT f.numeroFactura, f.fechaFactura, f.totalFactura, f.statusFactura,
             f.facturaSurtida, f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
             f.codigoCliente, f.numeroPedido, c.nombre1 AS nombreCliente
      FROM FACTURAG f
      LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
      WHERE f.empresaID = @empresaID
        AND MONTH(f.fechaFactura) = @mes
        AND YEAR(f.fechaFactura)  = @anio
        ${statusFilter} ${searchFilter}
      ORDER BY f.fechaFactura DESC
    `);
    const facturas = result.recordset.map(_formatFactura);
    return {
      resumen: {
        total: facturas.length,
        surtidas: facturas.filter((f) => f.facturaSurtida === 1).length,
        pendientes: facturas.filter(
          (f) =>
            f.facturaSurtida !== 1 && f.statusFactura === STATUS_FACTURA.ACTIVA,
        ).length,
        canceladas: facturas.filter(
          (f) => f.statusFactura === STATUS_FACTURA.CANCELADA,
        ).length,
      },
      facturas,
    };
  } catch (err) {
    console.error("[cedis.service] getHistorico error:", err);
    throw err;
  }
}

async function getDetalleFactura(numeroFactura) {
  const pool = await getCedisPool();
  try {
    const cabResult = await pool
      .request()
      .input("numeroFactura", sql.VarChar(50), numeroFactura)
      .input("empresaID", sql.Int, EMPRESA_ID).query(`
        SELECT f.numeroFactura, f.fechaFactura, f.totalFactura, f.subTotalFactura,
               f.impuestoFactura, f.statusFactura, f.facturaSurtida,
               f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
               f.codigoCliente, f.numeroPedido, f.ordenCompra, f.codigoAlmacen,
               c.nombre1 AS nombreCliente
        FROM FACTURAG f
        LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
        WHERE f.numeroFactura = @numeroFactura AND f.empresaID = @empresaID
      `);
    if (cabResult.recordset.length === 0) return null;
    const partResult = await pool
      .request()
      .input("numeroFactura", sql.VarChar(50), numeroFactura)
      .input("empresaID", sql.Int, EMPRESA_ID).query(`
        SELECT d.numeroPartida, d.codigoArticulo, d.unidades, d.valores,
               d.udmCapturada, d.numeroLote, d.codigoAlmacen
        FROM facturaD d
        WHERE d.numeroFactura = @numeroFactura AND d.empresaID = @empresaID
        ORDER BY d.numeroPartida ASC
      `);
    return {
      cabecera: _formatFactura(cabResult.recordset[0]),
      partidas: partResult.recordset,
    };
  } catch (err) {
    console.error("[cedis.service] getDetalleFactura error:", err);
    throw err;
  }
}

// ── helpers privados ──
async function _getFacturaConCliente(pool, numeroFactura) {
  const result = await pool
    .request()
    .input("numeroFactura", sql.VarChar(50), numeroFactura)
    .input("empresaID", sql.Int, EMPRESA_ID).query(`
      SELECT f.numeroFactura, f.fechaFactura, f.totalFactura, f.statusFactura,
             f.facturaSurtida, f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
             f.codigoCliente, f.numeroPedido, c.nombre1 AS nombreCliente
      FROM FACTURAG f
      LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
      WHERE f.numeroFactura = @numeroFactura AND f.empresaID = @empresaID
    `);
  return result.recordset.length > 0
    ? _formatFactura(result.recordset[0])
    : null;
}

function _formatFactura(row) {
  if (!row) return null;

  // Cubre int (1), bit (true), y campos de auditoría poblados
  const surtida =
    row.facturaSurtida == 1 ||
    row.facturaSurtida === true ||
    row.fechaFacturaSurtida != null ||
    row.usuarioFacturaSurtida != null;

  let estado;
  if (row.statusFactura === STATUS_FACTURA.CANCELADA) estado = "cancelada";
  else if (surtida) estado = "surtida";
  else if (row.statusFactura === STATUS_FACTURA.ACTIVA) estado = "pendiente";
  else estado = "desconocido";

  return {
    numeroFactura: row.numeroFactura,
    fechaFactura: row.fechaFactura,
    totalFactura: row.totalFactura ?? null,
    subTotalFactura: row.subTotalFactura ?? null,
    impuestoFactura: row.impuestoFactura ?? null,
    statusFactura: row.statusFactura,
    facturaSurtida: row.facturaSurtida ?? null,
    fechaFacturaSurtida: row.fechaFacturaSurtida ?? null,
    usuarioFacturaSurtida: row.usuarioFacturaSurtida ?? null,
    codigoCliente: row.codigoCliente,
    nombreCliente: row.nombreCliente ?? null,
    numeroPedido: row.numeroPedido ?? null,
    ordenCompra: row.ordenCompra ?? null,
    codigoAlmacen: row.codigoAlmacen ?? null,
    estado,
  };
}

module.exports = {
  scanFactura,
  getFacturasHoy,
  getHistorico,
  getDetalleFactura,
  SCAN_RESULT,
};
