-- Gestión Documental SGC/SGI
-- Ejecutar en DB_RHFABPSA_DEV

CREATE TABLE sgc_documentos (
  idDocumento       INT IDENTITY(1,1) PRIMARY KEY,
  idEmpresa         INT NOT NULL DEFAULT 1,
  codigo            VARCHAR(30) NOT NULL UNIQUE,
  titulo            NVARCHAR(200) NOT NULL,
  tipo              TINYINT NOT NULL CHECK (tipo IN (1,2,3,4,5)),
                    -- 1=Procedimiento 2=Instructivo 3=Formato 4=Registro 5=Manual
  version           VARCHAR(10) NOT NULL DEFAULT '1.0',
  idEstatus         TINYINT NOT NULL DEFAULT 1 CHECK (idEstatus IN (1,2,3,4)),
                    -- 1=Borrador 2=En revisión 3=Vigente 4=Obsoleto
  loginElabora      VARCHAR(255) NOT NULL REFERENCES sec_users(login),
  loginRevisa       VARCHAR(255) NULL     REFERENCES sec_users(login),
  loginAprueba      VARCHAR(255) NULL     REFERENCES sec_users(login),
  fechaVigencia     DATE NULL,
  fechaVencimiento  DATE NULL,
  clausulaISO       NVARCHAR(20) NULL,
  spItemId          VARCHAR(200) NOT NULL,
  spDriveId         VARCHAR(200) NOT NULL,
  spWebUrl          NVARCHAR(500) NOT NULL,
  spNombre          NVARCHAR(255) NOT NULL,
  spCarpeta         NVARCHAR(500) NULL,
  spModificado      DATETIME NULL,
  idNorma           TINYINT NULL DEFAULT 1,
  fechaCreacion     DATETIME NOT NULL DEFAULT GETDATE()
)
GO
CREATE INDEX IX_sgc_docs_empresa_estatus ON sgc_documentos(idEmpresa, idEstatus)
GO
CREATE INDEX IX_sgc_docs_tipo ON sgc_documentos(tipo)
GO

CREATE TABLE sgc_documentos_versiones (
  idVersion     INT IDENTITY(1,1) PRIMARY KEY,
  idDocumento   INT NOT NULL REFERENCES sgc_documentos(idDocumento),
  version       VARCHAR(10) NOT NULL,
  cambios       NVARCHAR(MAX) NULL,
  loginSube     VARCHAR(255) NOT NULL REFERENCES sec_users(login),
  spVersionId   VARCHAR(200) NOT NULL,
  spWebUrl      NVARCHAR(500) NOT NULL,
  fechaRegistro DATETIME NOT NULL DEFAULT GETDATE()
)
GO

CREATE TABLE sgc_documentos_accesos (
  idAcceso    INT IDENTITY(1,1) PRIMARY KEY,
  idDocumento INT NOT NULL REFERENCES sgc_documentos(idDocumento),
  login       VARCHAR(255) NOT NULL REFERENCES sec_users(login),
  fechaAcceso DATETIME NOT NULL DEFAULT GETDATE()
)
GO
CREATE INDEX IX_sgc_docs_accesos ON sgc_documentos_accesos(idDocumento)
GO
