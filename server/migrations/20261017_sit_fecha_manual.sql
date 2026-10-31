-- ════════════════════════════════════════════════════════════
-- SIT — Edición del vencimiento de documentos de SharePoint
--
-- sit_documento_fecha guarda el vencimiento capturado para un archivo.
--   esManual = 1 → la fecha la tecleó el usuario
--   esManual = 0 → se tomó tal cual de la lectura automática del PDF (IA)
--   noVence  = 1 → el documento no vence (semáforo VERDE, sin fecha);
--                  equivale a reglasVigencia = 4 pero para un solo archivo
-- fechaVencimiento pasa a aceptar NULL (caso noVence).
-- Las filas existentes quedan con esManual = 0 / noVence = 0.
--
-- Idempotente. Correr en DB_RHFABPSA_DEV y en DB_RHFABPSA.
-- ════════════════════════════════════════════════════════════

IF COL_LENGTH('sit_documento_fecha', 'esManual') IS NULL
  ALTER TABLE sit_documento_fecha ADD esManual BIT NOT NULL CONSTRAINT DF_sit_documento_fecha_esManual DEFAULT 0;
GO

IF COL_LENGTH('sit_documento_fecha', 'noVence') IS NULL
  ALTER TABLE sit_documento_fecha ADD noVence BIT NOT NULL CONSTRAINT DF_sit_documento_fecha_noVence DEFAULT 0;
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('sit_documento_fecha') AND name = 'fechaVencimiento' AND is_nullable = 0
)
  ALTER TABLE sit_documento_fecha ALTER COLUMN fechaVencimiento DATE NULL;
GO

-- Debe haber fecha, salvo que el documento no venza
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_sit_documento_fecha_fecha_o_noVence')
  ALTER TABLE sit_documento_fecha
    ADD CONSTRAINT CK_sit_documento_fecha_fecha_o_noVence CHECK (fechaVencimiento IS NOT NULL OR noVence = 1);
GO
