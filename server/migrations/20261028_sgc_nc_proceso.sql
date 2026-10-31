/* ============================================================================
   Vínculo NC → proceso (mapa de procesos, ISO 9001 cl. 4.4)
   Portal Corporativo v4 · FABPSA · módulo SGC/SGI
   Idempotente: se puede ejecutar más de una vez.
   ========================================================================== */

IF COL_LENGTH('dbo.sgc_no_conformidades', 'idProceso') IS NULL
  ALTER TABLE dbo.sgc_no_conformidades ADD idProceso INT NULL
    CONSTRAINT FK_sgc_no_conformidades_proceso REFERENCES dbo.sgc_procesos(idProceso);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sgc_no_conformidades_proceso' AND object_id = OBJECT_ID('dbo.sgc_no_conformidades'))
  CREATE INDEX IX_sgc_no_conformidades_proceso ON dbo.sgc_no_conformidades (idProceso) WHERE idProceso IS NOT NULL;
GO
