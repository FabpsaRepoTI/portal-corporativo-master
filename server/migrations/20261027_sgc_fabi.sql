/* ============================================================================
   Fab-i · Asistente SGC — conversaciones y mensajes
   Portal Corporativo v4 · FABPSA · módulo SGC/SGI
   Idempotente: se puede ejecutar más de una vez.
   ----------------------------------------------------------------------------
   sgc_fabi_conversaciones  una por hilo; pertenece a un usuario (login)
   sgc_fabi_mensajes        turnos del hilo: rol 'user' | 'assistant'
   Borrar una conversación borra sus mensajes (ON DELETE CASCADE).
   ========================================================================== */

IF OBJECT_ID('dbo.sgc_fabi_conversaciones') IS NULL
BEGIN
  CREATE TABLE dbo.sgc_fabi_conversaciones (
    idConversacion INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_sgc_fabi_conversaciones PRIMARY KEY,
    login          VARCHAR(255)      NOT NULL
      CONSTRAINT FK_sgc_fabi_conversaciones_login REFERENCES dbo.sec_users(login),
    titulo         NVARCHAR(200)     NOT NULL,
    fechaCreacion  DATETIME          NOT NULL CONSTRAINT DF_sgc_fabi_conversaciones_fecha DEFAULT GETDATE()
  );
  CREATE INDEX IX_sgc_fabi_conversaciones_login ON dbo.sgc_fabi_conversaciones (login, fechaCreacion DESC);
END
GO

IF OBJECT_ID('dbo.sgc_fabi_mensajes') IS NULL
BEGIN
  CREATE TABLE dbo.sgc_fabi_mensajes (
    idMensaje      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_sgc_fabi_mensajes PRIMARY KEY,
    idConversacion INT               NOT NULL
      CONSTRAINT FK_sgc_fabi_mensajes_conversacion REFERENCES dbo.sgc_fabi_conversaciones(idConversacion) ON DELETE CASCADE,
    rol            VARCHAR(10)       NOT NULL
      CONSTRAINT CK_sgc_fabi_mensajes_rol CHECK (rol IN ('user', 'assistant')),
    contenido      NVARCHAR(MAX)     NOT NULL,
    fechaRegistro  DATETIME          NOT NULL CONSTRAINT DF_sgc_fabi_mensajes_fecha DEFAULT GETDATE()
  );
  CREATE INDEX IX_sgc_fabi_mensajes_conversacion ON dbo.sgc_fabi_mensajes (idConversacion, idMensaje);
END
GO
