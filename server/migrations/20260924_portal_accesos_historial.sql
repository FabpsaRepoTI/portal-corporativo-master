SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.portal_accesos_historial', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.portal_accesos_historial (
    id bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
    login nvarchar(128) NOT NULL,
    responsable nvarchar(128) NOT NULL,
    nombreResponsable nvarchar(200) NULL,
    fecha datetime2(3) NOT NULL CONSTRAINT DF_portal_accesos_fecha DEFAULT SYSUTCDATETIME(),
    antes nvarchar(max) NOT NULL,
    despues nvarchar(max) NOT NULL,
    CONSTRAINT CK_portal_accesos_antes CHECK (ISJSON(antes)=1),
    CONSTRAINT CK_portal_accesos_despues CHECK (ISJSON(despues)=1)
  );
  CREATE INDEX IX_portal_accesos_usuario_fecha ON dbo.portal_accesos_historial(login,id DESC);
END;
COMMIT TRANSACTION;
