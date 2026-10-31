/* ============================================================================
   Bandeja "Mis pendientes" y notificaciones accionables
   Portal Corporativo v4 · FABPSA · módulo SGC/SGI
   - sgc_notificaciones.pospuestaHasta: la notificación se oculta hasta esa fecha
   - sgc_pendientes_pospuestos: pendientes que el usuario pospuso (solo afecta
     su bandeja; NO cambia la fecha compromiso del registro)
   Idempotente: se puede ejecutar más de una vez.
   ========================================================================== */

IF COL_LENGTH('dbo.sgc_notificaciones', 'pospuestaHasta') IS NULL
  ALTER TABLE dbo.sgc_notificaciones ADD pospuestaHasta DATETIME NULL;
GO

IF OBJECT_ID('dbo.sgc_pendientes_pospuestos') IS NULL
BEGIN
  CREATE TABLE dbo.sgc_pendientes_pospuestos (
    idPospuesto INT IDENTITY(1,1) CONSTRAINT PK_sgc_pendientes_pospuestos PRIMARY KEY,
    login       VARCHAR(255) NOT NULL,
    entidad     VARCHAR(10)  NOT NULL,   -- 'NC' | 'PLAN' | 'HALLAZGO'
    idEntidad   INT          NOT NULL,
    hasta       DATE         NOT NULL,
    fechaRegistro DATETIME   NOT NULL CONSTRAINT DF_sgc_pendientes_pospuestos_fecha DEFAULT GETDATE(),
    CONSTRAINT UQ_sgc_pendientes_pospuestos UNIQUE (login, entidad, idEntidad)
  );
END
GO
