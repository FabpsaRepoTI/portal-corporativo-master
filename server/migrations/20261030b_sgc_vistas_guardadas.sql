/* ============================================================================
   Vistas guardadas de la paleta de comandos (Ctrl+K) del SGC
   Portal Corporativo v4 · FABPSA · módulo SGC/SGI
   - filtros: JSON { ruta: "/sgc/no-conformidades?estatus=1&vencidas=1" }
   - login: dueño (los usuarios del portal se identifican por login, sec_users.login)
   - es_global: visible para todo el equipo SGC (solo la marca el Coordinador)
   Idempotente: se puede ejecutar más de una vez.
   ========================================================================== */

IF OBJECT_ID('dbo.sgc_vistas_guardadas') IS NULL
BEGIN
  CREATE TABLE dbo.sgc_vistas_guardadas (
    id         INT IDENTITY(1,1) CONSTRAINT PK_sgc_vistas_guardadas PRIMARY KEY,
    nombre     NVARCHAR(100) NOT NULL,
    modulo     NVARCHAR(50)  NOT NULL,
    filtros    NVARCHAR(MAX) NOT NULL,
    login      VARCHAR(255)  NOT NULL,
    es_global  BIT NOT NULL CONSTRAINT DF_sgc_vistas_guardadas_global DEFAULT 0,
    idEmpresa  INT NOT NULL CONSTRAINT DF_sgc_vistas_guardadas_empresa DEFAULT 1,
    fechaCreacion DATETIME NOT NULL CONSTRAINT DF_sgc_vistas_guardadas_fecha DEFAULT GETDATE()
  );
  CREATE INDEX IX_sgc_vistas_guardadas_login ON dbo.sgc_vistas_guardadas (idEmpresa, login);
END
GO
