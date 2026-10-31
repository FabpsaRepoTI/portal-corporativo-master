-- ════════════════════════════════════════════════════════════
-- Fabi (asistente de Mesa de Servicio) — auditoría de herramientas
-- Cada vez que Fabi consulta datos del portal (mis solicitudes, estatus de
-- una solicitud, estado de servicios TI, guías de Cultura Digital) queda un
-- registro: quién preguntó, qué herramienta usó, con qué parámetros y
-- cuántas filas devolvió. Solo lectura: Fabi no escribe en ninguna tabla.
-- Idempotente. Correr en DB_RHFABPSA_DEV y en DB_RHFABPSA.
-- ════════════════════════════════════════════════════════════
IF OBJECT_ID('fabi_tool_log', 'U') IS NULL
CREATE TABLE fabi_tool_log (
  id              BIGINT IDENTITY(1,1) PRIMARY KEY,
  login           VARCHAR(255)   NOT NULL,
  tool_name       VARCHAR(60)    NOT NULL,
  params_json     NVARCHAR(1000) NULL,
  resultado_rows  INT            NULL,
  error           NVARCHAR(300)  NULL,
  fecha           DATETIME       NOT NULL DEFAULT GETDATE()
)
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fabi_tool_log_fecha')
  CREATE INDEX IX_fabi_tool_log_fecha ON fabi_tool_log(fecha DESC)
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_fabi_tool_log_login')
  CREATE INDEX IX_fabi_tool_log_login ON fabi_tool_log(login, fecha DESC)
GO
