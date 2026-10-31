-- ════════════════════════════════════════════════════════════
-- Vigilancia — Evidencias del reporte (fotos y documentos).
-- Los archivos viven en disco, en una carpeta privada del servidor
-- (VIG_EVIDENCIAS_DIR o <repo>/uploads_privados/vigilancia/evidencias),
-- nunca bajo /uploads (que es público). Se sirven por el API con sesión.
-- Quitar una evidencia la marca inactiva (no se borra el registro).
-- Correr en DB_RHFABPSA_DEV y en DB_RHFABPSA. Idempotente.
-- ════════════════════════════════════════════════════════════

IF OBJECT_ID('vig_evidencias', 'U') IS NULL
CREATE TABLE vig_evidencias (
  idEvidencia     INT IDENTITY(1,1) PRIMARY KEY,
  idReporte       INT           NOT NULL REFERENCES vig_reportes(idReporte),
  nombreOriginal  NVARCHAR(255) NOT NULL,
  nombreArchivo   NVARCHAR(255) NOT NULL,   -- nombre en disco (único)
  tipoMime        VARCHAR(100)  NOT NULL,
  tamanoBytes     INT           NOT NULL,
  descripcion     NVARCHAR(300) NULL,
  loginCarga      VARCHAR(255)  NOT NULL,
  fechaCarga      DATETIME      NOT NULL DEFAULT GETDATE(),
  activo          BIT           NOT NULL DEFAULT 1,
  loginBaja       VARCHAR(255)  NULL,
  fechaBaja       DATETIME      NULL
)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_vig_evidencias_reporte')
  CREATE INDEX IX_vig_evidencias_reporte ON vig_evidencias(idReporte, activo)
GO
