// server/services/sgcFolio.service.js
// Folios del módulo SGC/SGI: NC-YYYY-0001, AC-YYYY-0001, AUD-YYYY-0001 y
// MSI-YYYY-0001 (Mesa de Servicio SGI).
// El consecutivo reinicia cada año (hora de México) y cada tipo lleva el
// suyo: una AC nunca hereda el folio de su NC.
//
// Llamar DENTRO de la transacción del INSERT: el SELECT toma UPDLOCK +
// HOLDLOCK sobre el rango del año, así dos altas simultáneas no obtienen el
// mismo folio (la segunda espera a que la primera confirme).
//
// Los índices UNIQUE de folioNC / folioAC / folio son globales (no por
// empresa), por eso el consecutivo se calcula sobre todo el prefijo del año;
// filtrar por idEmpresa haría chocar folios entre empresas.
const { getPool, sql } = require("../db");

// Fecha de hoy en México (Azure SQL corre en UTC)
const HOY_SQL = "CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Central Standard Time (Mexico)' AS date)";

// Nombres fijos (no vienen del usuario): tabla y columna de cada tipo
const TIPOS = {
  NC: { tabla: "sgc_no_conformidades", columna: "folioNC" },
  AC: { tabla: "sgc_acciones_correctivas", columna: "folioAC" },
  AUD: { tabla: "sgc_auditorias", columna: "folio" },
  MSI: { tabla: "sgc_msi_tickets", columna: "folio" },
};

/**
 * Siguiente folio del tipo para el año actual.
 * @param {'NC'|'AC'|'AUD'|'MSI'} tipo
 * @param {number} idEmpresa  se conserva para cuando el folio sea por empresa
 * @param {sql.Transaction} [tx]  transacción abierta del INSERT (recomendado)
 */
async function _siguienteFolio(tipo, idEmpresa, tx) {
  const { tabla, columna } = TIPOS[tipo];
  const request = tx ? new sql.Request(tx) : (await getPool()).request();
  const r = await request
    .input("tipo", sql.VarChar(5), tipo)
    .query(`
      DECLARE @prefijo VARCHAR(10) = @tipo + '-' + CAST(YEAR(${HOY_SQL}) AS VARCHAR(4)) + '-';
      DECLARE @n INT = (
        SELECT ISNULL(MAX(TRY_CAST(SUBSTRING(${columna}, LEN(@prefijo) + 1, 10) AS INT)), 0) + 1
        FROM ${tabla} WITH (UPDLOCK, HOLDLOCK)
        WHERE ${columna} LIKE @prefijo + '%'
      );
      DECLARE @num VARCHAR(10) = CAST(@n AS VARCHAR(10));
      SELECT @prefijo + RIGHT('0000' + @num, CASE WHEN LEN(@num) > 4 THEN LEN(@num) ELSE 4 END) AS folio;
    `);
  return r.recordset[0].folio;
}

/**
 * generarFolio('NC' | 'AC' | 'AUD' | 'MSI', tx) — pasar la transacción abierta del
 * INSERT para que el bloqueo evite folios duplicados.
 */
function generarFolio(tipo, tx, idEmpresa = 1) {
  if (!TIPOS[tipo]) throw new Error(`Tipo de folio inválido: ${tipo}`);
  return _siguienteFolio(tipo, idEmpresa, tx instanceof sql.Transaction ? tx : null);
}

const generarFolioNC = (idEmpresa, tx) => _siguienteFolio("NC", idEmpresa, tx);
const generarFolioAC = (idEmpresa, tx) => _siguienteFolio("AC", idEmpresa, tx);
const generarFolioAUD = (idEmpresa, tx) => _siguienteFolio("AUD", idEmpresa, tx);

module.exports = { generarFolio, generarFolioNC, generarFolioAC, generarFolioAUD, HOY_SQL };
