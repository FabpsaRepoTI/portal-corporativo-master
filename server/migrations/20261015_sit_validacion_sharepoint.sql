-- ════════════════════════════════════════════════════════════
-- SIT — Validación de Calidad de documentos de SharePoint.
-- Un registro por archivo (sharepointId). No se usa sit_documento_fecha
-- porque ahí la fecha de vencimiento es obligatoria y un documento se
-- puede validar sin tener fecha. Idempotente.
-- ════════════════════════════════════════════════════════════

IF OBJECT_ID('sit_documento_validacion', 'U') IS NULL
CREATE TABLE sit_documento_validacion (
  sharepointId      NVARCHAR(200) PRIMARY KEY,
  estadoValidacion  TINYINT       NOT NULL CHECK (estadoValidacion IN (1, 2, 3)), -- 1=OK 2=Parcial 3=No corresponde
  notasValidacion   NVARCHAR(2000) NULL,
  validadoPor       VARCHAR(255)  NOT NULL,
  fechaValidacion   DATETIME      NOT NULL DEFAULT GETDATE()
)
GO
