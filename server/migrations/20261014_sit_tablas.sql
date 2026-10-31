-- ════════════════════════════════════════════════════════════
-- Módulo SIT — Sistema de Información Técnica
-- Crea (si no existen) las tablas sit_ del módulo, la tabla de permisos
-- por área (sit_area_permiso), el catálogo de tipos de documento, los
-- perfiles por puesto y el módulo 'sit' en portal_modulos.
--
-- Es idempotente: en DEV (donde las tablas ya existen) solo agrega lo
-- que falte (columna observaciones, módulo 'sit'). En producción crea todo.
-- Basado en el DDL original guardado en 20260930_create_vigilancia.sql.
-- ════════════════════════════════════════════════════════════

-- ── Catálogos ──────────────────────────────────────────────
IF OBJECT_ID('sit_tipos_documento', 'U') IS NULL
CREATE TABLE sit_tipos_documento (
  idTipoDoc           TINYINT IDENTITY(1,1) PRIMARY KEY,
  nombre              NVARCHAR(100) NOT NULL,
  clave               NVARCHAR(30)  NOT NULL,
  reglasVigencia      TINYINT       NOT NULL CHECK (reglasVigencia IN (1, 2, 3)), -- 1=Fecha explícita 2=Emisión+N 3=Recepción+N
  diasVigencia        INT           NULL,
  requiereValidacion  BIT           NOT NULL DEFAULT 1,
  validadorPuesto     NVARCHAR(100) NULL,
  activo              BIT           NOT NULL DEFAULT 1
)
GO

IF OBJECT_ID('sit_permisos_puestos', 'U') IS NULL
CREATE TABLE sit_permisos_puestos (
  idPermiso           INT IDENTITY(1,1) PRIMARY KEY,
  puesto              NVARCHAR(100) NOT NULL UNIQUE,
  puedeVerActivos     BIT NOT NULL DEFAULT 1,
  puedeVerInactivos   BIT NOT NULL DEFAULT 0,
  puedeCargarDoc      BIT NOT NULL DEFAULT 0,
  puedeValidar        BIT NOT NULL DEFAULT 0,
  puedeAdmin          BIT NOT NULL DEFAULT 0,
  accesoIAFSA         BIT NOT NULL DEFAULT 1,
  accesoDFNC          BIT NOT NULL DEFAULT 1,
  activo              BIT NOT NULL DEFAULT 1
)
GO

-- Área de sec_users → perfil SIT. Un área sin fila aquí entra como
-- 'Usuario General' (solo consulta) si tiene el módulo 'sit'.
IF OBJECT_ID('sit_area_permiso', 'U') IS NULL
CREATE TABLE sit_area_permiso (
  area       VARCHAR(100) NOT NULL PRIMARY KEY,
  idPermiso  INT          NOT NULL REFERENCES sit_permisos_puestos(idPermiso)
)
GO

-- ── Entidades ──────────────────────────────────────────────
IF OBJECT_ID('sit_articulos', 'U') IS NULL
CREATE TABLE sit_articulos (
  idArticulo         INT IDENTITY(1,1) PRIMARY KEY,
  codigoArticulo     NVARCHAR(50)  NOT NULL,
  idPlanta           TINYINT       NOT NULL CHECK (idPlanta IN (1, 2)), -- 1=IAFSA 2=FDNC
  descripcion        NVARCHAR(300) NOT NULL,
  nombreComercial    NVARCHAR(200) NULL,
  activo             BIT           NOT NULL DEFAULT 1,
  fechaAlta          DATETIME      NOT NULL DEFAULT GETDATE(),
  loginAlta          VARCHAR(255)  NOT NULL REFERENCES sec_users(login),
  fechaInactivacion  DATETIME      NULL,
  loginInactivacion  VARCHAR(255)  NULL REFERENCES sec_users(login),
  CONSTRAINT UQ_sit_articulos_codigo_planta UNIQUE (codigoArticulo, idPlanta)
)
GO

IF OBJECT_ID('sit_proveedores', 'U') IS NULL
CREATE TABLE sit_proveedores (
  idProveedor     INT IDENTITY(1,1) PRIMARY KEY,
  razonSocial     NVARCHAR(300) NOT NULL,
  rfc             NVARCHAR(20)  NULL UNIQUE,
  tipo            TINYINT       NOT NULL DEFAULT 1 CHECK (tipo IN (1, 2)), -- 1=Principal 2=Alterno
  esFabricante    BIT           NOT NULL DEFAULT 0,
  contactoNombre  NVARCHAR(200) NULL,
  contactoEmail   NVARCHAR(254) NULL,
  activo          BIT           NOT NULL DEFAULT 1,
  fechaAlta       DATETIME      NOT NULL DEFAULT GETDATE(),
  loginAlta       VARCHAR(255)  NOT NULL REFERENCES sec_users(login)
)
GO

IF OBJECT_ID('sit_articulo_proveedor', 'U') IS NULL
CREATE TABLE sit_articulo_proveedor (
  idArticuloProveedor INT IDENTITY(1,1) PRIMARY KEY,
  idArticulo          INT          NOT NULL REFERENCES sit_articulos(idArticulo),
  idProveedor         INT          NOT NULL REFERENCES sit_proveedores(idProveedor),
  activo              BIT          NOT NULL DEFAULT 1,
  fechaVinculacion    DATETIME     NOT NULL DEFAULT GETDATE(),
  loginAlta           VARCHAR(255) NOT NULL REFERENCES sec_users(login),
  CONSTRAINT UQ_sit_ap_articulo_proveedor UNIQUE (idArticulo, idProveedor)
)
GO

IF OBJECT_ID('sit_requisitos_par', 'U') IS NULL
CREATE TABLE sit_requisitos_par (
  idRequisito         INT IDENTITY(1,1) PRIMARY KEY,
  idArticuloProveedor INT          NOT NULL REFERENCES sit_articulo_proveedor(idArticuloProveedor),
  idTipoDoc           TINYINT      NOT NULL REFERENCES sit_tipos_documento(idTipoDoc),
  esObligatorio       BIT          NOT NULL DEFAULT 1,
  activo              BIT          NOT NULL DEFAULT 1,
  fechaAlta           DATETIME     NOT NULL DEFAULT GETDATE(),
  loginAlta           VARCHAR(255) NOT NULL REFERENCES sec_users(login),
  CONSTRAINT UQ_sit_requisitos_par_tipo UNIQUE (idArticuloProveedor, idTipoDoc)
)
GO

IF OBJECT_ID('sit_documentos', 'U') IS NULL
CREATE TABLE sit_documentos (
  idDocumento             INT IDENTITY(1,1) PRIMARY KEY,
  idArticuloProveedor     INT           NOT NULL REFERENCES sit_articulo_proveedor(idArticuloProveedor),
  idTipoDoc               TINYINT       NOT NULL REFERENCES sit_tipos_documento(idTipoDoc),
  version                 SMALLINT      NOT NULL DEFAULT 1,
  esVersionActiva         BIT           NOT NULL DEFAULT 1,
  spSiteId                NVARCHAR(200) NOT NULL,
  spDriveId               NVARCHAR(200) NOT NULL,
  spItemId                NVARCHAR(200) NOT NULL,
  spWebUrl                NVARCHAR(500) NULL,
  nombreOriginal          NVARCHAR(255) NOT NULL,
  tamanoBytes             INT           NULL,
  hashSHA256              NVARCHAR(64)  NULL,
  fechaEmision            DATE          NULL,
  fechaRecepcion          DATE          NULL,
  fechaVigenciaExplicita  DATE          NULL,
  fechaVencimientoCalc    DATE          NULL,
  semaforoEstado          TINYINT       NOT NULL DEFAULT 1 CHECK (semaforoEstado IN (1, 2, 3)),
  estatusValidacion       TINYINT       NULL CHECK (estatusValidacion IN (1, 2, 3)),
  loginValidador          VARCHAR(255)  NULL REFERENCES sec_users(login),
  fechaValidacion         DATETIME      NULL,
  observacionesValidacion NVARCHAR(MAX) NULL,
  fechaCarga              DATETIME      NOT NULL DEFAULT GETDATE(),
  loginCarga              VARCHAR(255)  NOT NULL REFERENCES sec_users(login)
)
GO

-- Observaciones que captura quien sube el documento
IF COL_LENGTH('sit_documentos', 'observaciones') IS NULL
ALTER TABLE sit_documentos ADD observaciones NVARCHAR(500) NULL
GO

IF OBJECT_ID('sit_versiones_historial', 'U') IS NULL
CREATE TABLE sit_versiones_historial (
  idHistorial           INT IDENTITY(1,1) PRIMARY KEY,
  idDocumento           INT           NOT NULL REFERENCES sit_documentos(idDocumento),
  versionNumero         SMALLINT      NOT NULL,
  spSiteId              NVARCHAR(200) NOT NULL,
  spDriveId             NVARCHAR(200) NOT NULL,
  spItemId              NVARCHAR(200) NOT NULL,
  nombreOriginal        NVARCHAR(255) NOT NULL,
  tamanoBytes           INT           NULL,
  hashSHA256            NVARCHAR(64)  NULL,
  fechaVencimientoCalc  DATE          NULL,
  semaforoEstado        TINYINT       NULL CHECK (semaforoEstado IN (1, 2, 3)),
  fechaCarga            DATETIME      NOT NULL,
  loginCarga            VARCHAR(255)  NOT NULL REFERENCES sec_users(login),
  motivoReemplazo       NVARCHAR(500) NULL,
  fechaReemplazo        DATETIME      NOT NULL DEFAULT GETDATE(),
  loginReemplazo        VARCHAR(255)  NOT NULL REFERENCES sec_users(login)
)
GO

IF OBJECT_ID('sit_auditoria', 'U') IS NULL
CREATE TABLE sit_auditoria (
  idAuditoria   BIGINT IDENTITY(1,1) PRIMARY KEY,
  loginUsuario  VARCHAR(255)  NOT NULL,
  accion        NVARCHAR(50)  NOT NULL,  -- VIEW_DOC, UPLOAD, REPLACE_DOC, VALIDATE, INACTIVATE_ART, ADMIN_CHANGE…
  entidad       NVARCHAR(50)  NULL,
  idEntidad     INT           NULL,
  descripcion   NVARCHAR(MAX) NULL,
  ipOrigen      NVARCHAR(45)  NOT NULL,
  userAgent     NVARCHAR(300) NULL,
  fecha         DATETIME      NOT NULL DEFAULT GETDATE()
)
GO

-- ── Índices ────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sit_articulos_planta')
  CREATE INDEX IX_sit_articulos_planta ON sit_articulos(idPlanta)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sit_ap_idArticulo')
  CREATE INDEX IX_sit_ap_idArticulo ON sit_articulo_proveedor(idArticulo)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sit_ap_idProveedor')
  CREATE INDEX IX_sit_ap_idProveedor ON sit_articulo_proveedor(idProveedor)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sit_rq_idArticuloProveedor')
  CREATE INDEX IX_sit_rq_idArticuloProveedor ON sit_requisitos_par(idArticuloProveedor)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sit_doc_idArticuloProveedor')
  CREATE INDEX IX_sit_doc_idArticuloProveedor ON sit_documentos(idArticuloProveedor)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sit_doc_fechaVencimiento')
  CREATE INDEX IX_sit_doc_fechaVencimiento ON sit_documentos(fechaVencimientoCalc)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sit_vh_idDocumento')
  CREATE INDEX IX_sit_vh_idDocumento ON sit_versiones_historial(idDocumento)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sit_aud_fecha')
  CREATE INDEX IX_sit_aud_fecha ON sit_auditoria(fecha)
GO

-- Un solo documento vigente por par y tipo (los reemplazos actualizan la
-- fila y mandan la versión anterior a sit_versiones_historial)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_sit_doc_par_tipo_activo')
  CREATE UNIQUE INDEX UX_sit_doc_par_tipo_activo
    ON sit_documentos(idArticuloProveedor, idTipoDoc) WHERE esVersionActiva = 1
GO

-- ── Datos iniciales ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sit_tipos_documento)
INSERT INTO sit_tipos_documento (nombre, clave, reglasVigencia, diasVigencia, requiereValidacion, validadorPuesto) VALUES
  (N'Ficha Técnica',                       'FT',             3, 730,  1, N'Control de Calidad'),
  (N'Hoja de Datos de Seguridad',          'HDS',            3, 730,  1, N'Control de Calidad'),
  (N'Certificado de Análisis',             'COA',            3, 730,  1, N'Control de Calidad'),
  (N'Especificaciones',                    'ESPECIF',        3, 730,  1, N'Control de Calidad'),
  (N'Tabla Nutrimental',                   'TBL_NUT',        3, 730,  1, N'Control de Calidad'),
  (N'Imagen del Producto',                 'IMG_PROD',       3, 730,  1, N'Control de Calidad'),
  (N'Declaración de Alérgenos',            'DECL_ALERG',     3, 730,  1, N'Control de Calidad'),
  (N'Carta de Garantía',                   'CARTA_GRTIA',    2, 365,  1, N'Control de Calidad'),
  (N'Carta de No Fraude',                  'CARTA_NOFRAUDE', 2, 365,  1, N'Fraude/Compras'),
  (N'Declaraciones',                       'DECL',           2, 365,  1, N'Control de Calidad'),
  (N'Análisis de Tercería',                'ANAL_TERC',      2, 365,  1, N'Control de Calidad'),
  (N'Cuestionario de Fraude',              'CUEST_FRAUDE',   2, 365,  1, N'Fraude/Compras'),
  (N'Cuestionario SGIA',                   'CUEST_SGIA',     2, 365,  1, N'SGIA'),
  (N'Declaración Balance de Masas',        'DECL_BAL_MASAS', 2, 365,  1, N'Fraude/Compras'),
  (N'Análisis de Peligros MP',             'ANAL_PELIGROS',  2, 365,  1, N'Control de Calidad'),
  (N'Certificación de Producto',           'CERT_PROD',      1, NULL, 1, N'Control de Calidad'),
  (N'Certificación Proveedor/Fabricante',  'CERT_PROV',      1, NULL, 1, N'Control de Calidad')
GO

IF NOT EXISTS (SELECT 1 FROM sit_permisos_puestos)
INSERT INTO sit_permisos_puestos
  (puesto, puedeVerActivos, puedeVerInactivos, puedeCargarDoc, puedeValidar, puedeAdmin, accesoIAFSA, accesoDFNC)
VALUES
  (N'Administradora SIT', 1, 1, 1, 1, 1, 1, 1),
  (N'Control de Calidad', 1, 0, 0, 1, 0, 1, 1),
  (N'Fraude/Compras',     1, 0, 0, 1, 0, 1, 1),
  (N'SGIA',               1, 0, 0, 1, 0, 1, 1),
  (N'Usuario General',    1, 0, 0, 0, 0, 1, 1)
GO

-- Mismo mapeo área → perfil que existe hoy en DEV
INSERT INTO sit_area_permiso (area, idPermiso)
SELECT a.area, p.idPermiso
FROM (VALUES
  ('CALIDAD',      N'Control de Calidad'), ('CALIDAD FDNC', N'Control de Calidad'),
  ('SENSORIAL',    N'Control de Calidad'), ('COMPRAS',      N'Fraude/Compras'),
  ('COMPRAS INT',  N'Fraude/Compras'),     ('SGC',          N'SGIA'),
  ('SGI',          N'SGIA'),               ('SISTEMAS',     N'Administradora SIT')
) a(area, puesto)
JOIN sit_permisos_puestos p ON p.puesto = a.puesto
WHERE NOT EXISTS (SELECT 1 FROM sit_area_permiso x WHERE x.area = a.area)
GO

-- Módulo del portal (se asigna por usuario en Administración de accesos)
IF NOT EXISTS (SELECT 1 FROM portal_modulos WHERE clave = 'sit')
INSERT INTO portal_modulos (clave, nombre, icono, activo, orden)
SELECT 'sit', N'Información Técnica (SIT)', 'ti-flask', 1, COALESCE(MAX(orden), 0) + 1
FROM portal_modulos
GO
