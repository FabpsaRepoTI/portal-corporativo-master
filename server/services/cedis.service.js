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

async function scanFactura(numeroFactura,usuarioLogin){
 const connection=await getCedisPool(),tx=new sql.Transaction(connection);await tx.begin();
 try{const result=await scanInTransaction({request:()=>new sql.Request(tx)},numeroFactura,usuarioLogin);await tx.commit();return result;}catch(e){await tx.rollback();throw e;}
}
async function scanInTransaction(pool,numeroFactura,usuarioLogin) {
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
          AND origen = 2
          AND ISNULL(facturaSurtida, 0) <> 1
          AND fechaFacturaSurtida IS NULL
          AND NULLIF(LTRIM(RTRIM(usuarioFacturaSurtida)),'') IS NULL
          AND statusFactura              = ${STATUS_FACTURA.ACTIVA};
        SELECT @@ROWCOUNT AS filasAfectadas;
      `);

    const filasAfectadas = updateResult.recordset[0]?.filasAfectadas ?? 0;

    if(filasAfectadas>1)throw new Error("Número de factura duplicado en la empresa; no se registró el surtido.");
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
        SELECT f.numeroFactura, f.statusFactura, f.facturaSustituida, f.facturaSurtida,
               f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
               f.fechaFactura, f.totalFactura, f.codigoCliente, f.numeroPedido,
               c.nombre1 AS nombreCliente, f.codigoMoneda, f.codigoVendedor,
               f.subTotalFactura, f.impuestoFactura, m.AbreviacionPAC AS moneda, m.descripcion AS monedaDescripcion
        FROM FACTURAG f
        LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
        LEFT JOIN MONEXT m ON m.codigoMoneda=f.codigoMoneda AND m.EmpresaID=f.empresaID
        WHERE f.numeroFactura = @numeroFactura AND f.empresaID = @empresaID AND f.origen = 2
      `);

    if (diag.recordset.length === 0)
      return {
        status: SCAN_RESULT.NOT_FOUND,
        message: "No se encontró ninguna factura con ese número.",
        factura: null,
      };

    const row = diag.recordset[0];

    // Cubre int (1), bit (true), y campos de auditoría poblados
    const yaSurtida =
      row.facturaSurtida == 1 ||
      row.facturaSurtida === true ||
      row.fechaFacturaSurtida != null ||
      Boolean(String(row.usuarioFacturaSurtida||'').trim());

    if (row.statusFactura === STATUS_FACTURA.CANCELADA)
      return {
        status: SCAN_RESULT.CANCELLED,
        message: "Esta factura está cancelada y no puede ser procesada.",
        factura: _formatFactura(row),
      };

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
      SELECT f.numeroFactura, f.fechaFactura, f.totalFactura, f.statusFactura, f.facturaSustituida,
             f.facturaSurtida, f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
             f.codigoCliente, f.numeroPedido, c.nombre1 AS nombreCliente, f.codigoMoneda, f.codigoVendedor,
               f.subTotalFactura, f.impuestoFactura, m.AbreviacionPAC AS moneda, m.descripcion AS monedaDescripcion
      FROM FACTURAG f
      LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
        LEFT JOIN MONEXT m ON m.codigoMoneda=f.codigoMoneda AND m.EmpresaID=f.empresaID
      WHERE f.empresaID = @empresaID AND f.origen = 2
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

async function getHistorico({mes,anio,status,q}={}){
 const now=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const year=Number(now.find(p=>p.type==='year').value),month=Number(now.find(p=>p.type==='month').value);
 const mesNum=Number(mes),anioNum=Number(anio);
 if(!Number.isInteger(mesNum)||!Number.isInteger(anioNum)||mesNum<1||mesNum>12||anioNum<2026||anioNum>year||(anioNum===year&&mesNum>month))throw Object.assign(new Error('Selecciona un mes disponible desde enero de 2026 hasta el mes actual.'),{status:400});
 if(status&&!['surtidas','pendientes','canceladas'].includes(status))throw Object.assign(new Error('Filtro de surtido inválido.'),{status:400});
 const pool=await getCedisPool(),request=pool.request().input('empresaID',sql.Int,EMPRESA_ID).input('mes',sql.Int,mesNum).input('anio',sql.Int,anioNum);
 const result=await request.query(`SELECT f.numeroFactura,f.fechaFactura,f.totalFactura,f.subTotalFactura,f.impuestoFactura,f.codigoVendedor,f.codigoMoneda,
 f.statusFactura, f.facturaSustituida,f.facturaSurtida,f.fechaFacturaSurtida,f.usuarioFacturaSurtida,f.codigoCliente,f.numeroPedido,c.nombre1 AS nombreCliente,
 m.AbreviacionPAC AS moneda,m.descripcion AS monedaDescripcion
 FROM FACTURAG f LEFT JOIN cliente c ON c.codigoCliente=f.codigoCliente AND c.EmpresaID=f.empresaID
 LEFT JOIN MONEXT m ON m.codigoMoneda=f.codigoMoneda AND m.EmpresaID=f.empresaID
 WHERE f.empresaID=@empresaID AND f.origen = 2 AND f.fechaFactura>=DATEFROMPARTS(@anio,@mes,1) AND f.fechaFactura<DATEADD(MONTH,1,DATEFROMPARTS(@anio,@mes,1))
 ORDER BY f.fechaFactura DESC,f.numeroFactura DESC`);
 const all=result.recordset.map(_formatFactura);
 const resumen={total:all.length,surtidas:all.filter(f=>f.estado==='surtida').length,pendientes:all.filter(f=>f.estado==='pendiente').length,canceladas:all.filter(f=>f.estado==='cancelada').length};
 const state={surtidas:'surtida',pendientes:'pendiente',canceladas:'cancelada'};
 const query=String(q||'').trim().toLocaleLowerCase('es-MX');
 return {resumen,facturas:all.filter(f=>(!status||f.estado===state[status])&&(!query||[f.numeroFactura,f.codigoCliente,f.nombreCliente,f.codigoVendedor,f.numeroPedido].some(v=>String(v||'').toLocaleLowerCase('es-MX').includes(query)))),periodo:{mes:mesNum,anio:anioNum}};
}

async function getDetalleFactura(numeroFactura) {
  const pool = await getCedisPool();
  try {
    const cabResult = await pool
      .request()
      .input("numeroFactura", sql.VarChar(50), numeroFactura)
      .input("empresaID", sql.Int, EMPRESA_ID).query(`
        SELECT f.numeroFactura, f.fechaFactura, f.totalFactura, f.statusFactura, f.facturaSustituida, f.facturaSurtida,
               f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
               f.codigoCliente, f.numeroPedido, f.ordenCompra, f.codigoAlmacen,
               c.nombre1 AS nombreCliente, f.codigoMoneda, f.codigoVendedor,
               f.subTotalFactura, f.impuestoFactura, m.AbreviacionPAC AS moneda, m.descripcion AS monedaDescripcion
        FROM FACTURAG f
        LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
        LEFT JOIN MONEXT m ON m.codigoMoneda=f.codigoMoneda AND m.EmpresaID=f.empresaID
        WHERE f.numeroFactura = @numeroFactura AND f.empresaID = @empresaID AND f.origen = 2
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
      SELECT f.numeroFactura, f.fechaFactura, f.totalFactura, f.statusFactura, f.facturaSustituida,
             f.facturaSurtida, f.fechaFacturaSurtida, f.usuarioFacturaSurtida,
             f.codigoCliente, f.numeroPedido, c.nombre1 AS nombreCliente, f.codigoMoneda, f.codigoVendedor,
               f.subTotalFactura, f.impuestoFactura, m.AbreviacionPAC AS moneda, m.descripcion AS monedaDescripcion
      FROM FACTURAG f
      LEFT JOIN cliente c ON c.codigoCliente = f.codigoCliente AND c.EmpresaID = f.empresaID
        LEFT JOIN MONEXT m ON m.codigoMoneda=f.codigoMoneda AND m.EmpresaID=f.empresaID
      WHERE f.numeroFactura = @numeroFactura AND f.empresaID = @empresaID AND f.origen = 2
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
    Boolean(String(row.usuarioFacturaSurtida||'').trim());

  let estado;
  if (row.statusFactura === STATUS_FACTURA.CANCELADA) estado = "cancelada";
  else if (surtida) estado = "surtida";
  else if (row.statusFactura === STATUS_FACTURA.ACTIVA) estado = "pendiente";
  else estado = "desconocido";

  return {
    numeroFactura: row.numeroFactura,
    codigoMoneda: row.codigoMoneda ?? null,
    moneda: row.moneda?.trim() || null,
    monedaDescripcion: row.monedaDescripcion ?? null,
    codigoVendedor: row.codigoVendedor ?? null,
    leida: surtida,
    fechaFactura: row.fechaFactura,
    totalFactura: row.totalFactura ?? null,
    subTotalFactura: row.subTotalFactura ?? null,
    impuestoFactura: row.impuestoFactura ?? null,
    statusFactura: row.statusFactura,
    facturaSustituida: row.facturaSustituida ?? null,
    facturaSurtida: surtida ? 1 : 0,
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
