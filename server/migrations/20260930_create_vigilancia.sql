-- ============================================================
-- Módulo  : SIT — Sistema de Información Técnica
-- Script  : sit_tablas_v1.sql
-- Base    : DB_RHFABPSA (Azure SQL)
-- Prefijo : sit_
-- Versión : 1.0  |  Autor: JMRAMIREZ  |  2026-10-01
-- Descripción:
--   Crea todas las tablas del módulo SIT para gestión de
--   documentación técnica de ingredientes y materias primas
--   (plantas IAFSA y FDNC). Los archivos PDF se almacenan en
--   SharePoint; el backend los sirve vía Microsoft Graph API.
-- Ejecutar en orden. Requiere que sec_users y dbo.SITIOS
-- existan en la base.
-- ============================================================


-- ============================================================
-- PARTE 1: CATÁLOGOS (sin dependencias externas)
-- ============================================================

-- 1.1  Tipos de documento (17 tipos pre-cargados)
--      reglasVigencia: 1=Fecha explícita  2=Emisión+N días  3=Recepción+N días
-- ------------------------------------------------------------
CREATE TABLE sit_tipos_documento (
    idTipoDoc           TINYINT IDENTITY(1,1)   PRIMARY KEY,
    nombre              NVARCHAR(100)            NOT NULL,
    clave               NVARCHAR(30)             NOT NULL,
    reglasVigencia      TINYINT                  NOT NULL
        CHECK (reglasVigencia IN (1, 2, 3)),
    diasVigencia        INT                      NULL,   -- NULL solo para tipo 1 (fecha explícita)
    requiereValidacion  BIT                      NOT NULL DEFAULT 1,
    validadorPuesto     NVARCHAR(100)            NULL,   -- puesto responsable de validar
    activo              BIT                      NOT NULL DEFAULT 1
)
GO

-- 1.2  Permisos por puesto
--      Lista definitiva a confirmar con Andrea Gaona.
--      puedeVerInactivos = solo admins
-- ------------------------------------------------------------
CREATE TABLE sit_permisos_puestos (
    idPermiso           INT IDENTITY(1,1)        PRIMARY KEY,
    puesto              NVARCHAR(100)            NOT NULL UNIQUE,
    puedeVerActivos     BIT                      NOT NULL DEFAULT 1,
    puedeVerInactivos   BIT                      NOT NULL DEFAULT 0,
    puedeCargarDoc      BIT                      NOT NULL DEFAULT 0,
    puedeValidar        BIT                      NOT NULL DEFAULT 0,
    puedeAdmin          BIT                      NOT NULL DEFAULT 0,
    accesoIAFSA         BIT                      NOT NULL DEFAULT 1,
    accesoDFNC          BIT                      NOT NULL DEFAULT 1,
    activo              BIT                      NOT NULL DEFAULT 1
)
GO


-- ============================================================
-- PARTE 2: ENTIDADES CORE
-- ============================================================

-- 2.1  Artículos
--      Códigos independientes por planta (UNIQUE por par código+planta).
--      Inactivados nunca se eliminan; solo visibles para admins.
-- ------------------------------------------------------------
CREATE TABLE sit_articulos (
    idArticulo          INT IDENTITY(1,1)        PRIMARY KEY,
    codigoArticulo      NVARCHAR(50)             NOT NULL,
    idPlanta            TINYINT                  NOT NULL
        CHECK (idPlanta IN (1, 2)),              -- 1=IAFSA  2=FDNC
    descripcion         NVARCHAR(300)            NOT NULL,
    nombreComercial     NVARCHAR(200)            NULL,
    activo              BIT                      NOT NULL DEFAULT 1,
    fechaAlta           DATETIME                 NOT NULL DEFAULT GETDATE(),
    loginAlta           VARCHAR(255)             NOT NULL
        REFERENCES sec_users(login),
    fechaInactivacion   DATETIME                 NULL,
    loginInactivacion   VARCHAR(255)             NULL
        REFERENCES sec_users(login),

    CONSTRAINT UQ_sit_articulos_codigo_planta
        UNIQUE (codigoArticulo, idPlanta)
)
GO

-- 2.2  Proveedores / Fabricantes
--      tipo: 1=Principal (A)  2=Alterno (B)
--      esFabricante: el mismo proveedor manufactura el artículo
-- ------------------------------------------------------------
CREATE TABLE sit_proveedores (
    idProveedor         INT IDENTITY(1,1)        PRIMARY KEY,
    razonSocial         NVARCHAR(300)            NOT NULL,
    rfc                 NVARCHAR(20)             NULL UNIQUE,
    tipo                TINYINT                  NOT NULL DEFAULT 1
        CHECK (tipo IN (1, 2)),
    esFabricante        BIT                      NOT NULL DEFAULT 0,
    contactoNombre      NVARCHAR(200)            NULL,
    contactoEmail       NVARCHAR(254)            NULL,
    activo              BIT                      NOT NULL DEFAULT 1,
    fechaAlta           DATETIME                 NOT NULL DEFAULT GETDATE(),
    loginAlta           VARCHAR(255)             NOT NULL
        REFERENCES sec_users(login)
)
GO

-- 2.3  Par Artículo–Proveedor  ← ENTIDAD CENTRAL
--      Los documentos cuelgan de aquí, no del artículo solo.
--      Un artículo puede tener múltiples proveedores.
-- ------------------------------------------------------------
CREATE TABLE sit_articulo_proveedor (
    idArticuloProveedor INT IDENTITY(1,1)        PRIMARY KEY,
    idArticulo          INT                      NOT NULL
        REFERENCES sit_articulos(idArticulo),
    idProveedor         INT                      NOT NULL
        REFERENCES sit_proveedores(idProveedor),
    activo              BIT                      NOT NULL DEFAULT 1,
    fechaVinculacion    DATETIME                 NOT NULL DEFAULT GETDATE(),
    loginAlta           VARCHAR(255)             NOT NULL
        REFERENCES sec_users(login),

    CONSTRAINT UQ_sit_ap_articulo_proveedor
        UNIQUE (idArticulo, idProveedor)
)
GO

-- 2.4  Requisitos por par  (qué tipos de doc aplican a cada par)
--      La admin define si cada tipo es obligatorio para el par.
-- ------------------------------------------------------------
CREATE TABLE sit_requisitos_par (
    idRequisito         INT IDENTITY(1,1)        PRIMARY KEY,
    idArticuloProveedor INT                      NOT NULL
        REFERENCES sit_articulo_proveedor(idArticuloProveedor),
    idTipoDoc           TINYINT                  NOT NULL
        REFERENCES sit_tipos_documento(idTipoDoc),
    esObligatorio       BIT                      NOT NULL DEFAULT 1,
    activo              BIT                      NOT NULL DEFAULT 1,
    fechaAlta           DATETIME                 NOT NULL DEFAULT GETDATE(),
    loginAlta           VARCHAR(255)             NOT NULL
        REFERENCES sec_users(login),

    CONSTRAINT UQ_sit_requisitos_par_tipo
        UNIQUE (idArticuloProveedor, idTipoDoc)
)
GO

-- 2.5  Documentos
--      Almacenamiento en SharePoint; el backend sirve el PDF
--      vía Microsoft Graph API (nunca expone la URL de SP).
--
--      semaforoEstado  : 1=Verde (>30d)  2=Amarillo (≤30d)  3=Rojo (vencido)
--      estatusValidacion: 1=OK  2=Parcial  3=No corresponde
--      reglasVigencia  : heredada del tipo doc (se recalcula en backend)
-- ------------------------------------------------------------
CREATE TABLE sit_documentos (
    idDocumento             INT IDENTITY(1,1)    PRIMARY KEY,
    idArticuloProveedor     INT                  NOT NULL
        REFERENCES sit_articulo_proveedor(idArticuloProveedor),
    idTipoDoc               TINYINT              NOT NULL
        REFERENCES sit_tipos_documento(idTipoDoc),

    -- Control de versión
    version                 SMALLINT             NOT NULL DEFAULT 1,
    esVersionActiva         BIT                  NOT NULL DEFAULT 1,

    -- Referencia SharePoint (no exponer al frontend)
    spSiteId                NVARCHAR(200)        NOT NULL,
    spDriveId               NVARCHAR(200)        NOT NULL,
    spItemId                NVARCHAR(200)        NOT NULL,   -- ID estable para Graph API
    spWebUrl                NVARCHAR(500)        NULL,       -- referencia interna, nunca al usuario
    nombreOriginal          NVARCHAR(255)        NOT NULL,
    tamanoBytes             INT                  NULL,
    hashSHA256              NVARCHAR(64)         NULL,       -- integridad del archivo

    -- Vigencia
    fechaEmision            DATE                 NULL,
    fechaRecepcion          DATE                 NULL,
    fechaVigenciaExplicita  DATE                 NULL,       -- solo para tipo 1
    fechaVencimientoCalc    DATE                 NULL,       -- calculada por backend al cargar

    -- Semáforo (recalculado periódicamente por job o al leer)
    semaforoEstado          TINYINT              NOT NULL DEFAULT 1
        CHECK (semaforoEstado IN (1, 2, 3)),

    -- Validación de Calidad (Irene)
    estatusValidacion       TINYINT              NULL
        CHECK (estatusValidacion IN (1, 2, 3)),
    loginValidador          VARCHAR(255)         NULL
        REFERENCES sec_users(login),
    fechaValidacion         DATETIME             NULL,
    observacionesValidacion NVARCHAR(MAX)        NULL,

    -- Auditoría de carga
    fechaCarga              DATETIME             NOT NULL DEFAULT GETDATE(),
    loginCarga              VARCHAR(255)         NOT NULL
        REFERENCES sec_users(login)
)
GO

-- 2.6  Historial de versiones (registro inmutable)
--      Cuando se reemplaza un documento, la versión anterior
--      pasa aquí. Nunca se eliminan registros.
-- ------------------------------------------------------------
CREATE TABLE sit_versiones_historial (
    idHistorial             INT IDENTITY(1,1)    PRIMARY KEY,
    idDocumento             INT                  NOT NULL
        REFERENCES sit_documentos(idDocumento),
    versionNumero           SMALLINT             NOT NULL,

    -- Referencia SharePoint de la versión archivada
    spSiteId                NVARCHAR(200)        NOT NULL,
    spDriveId               NVARCHAR(200)        NOT NULL,
    spItemId                NVARCHAR(200)        NOT NULL,
    nombreOriginal          NVARCHAR(255)        NOT NULL,
    tamanoBytes             INT                  NULL,
    hashSHA256              NVARCHAR(64)         NULL,

    -- Vigencia que tenía al momento de ser reemplazada
    fechaVencimientoCalc    DATE                 NULL,
    semaforoEstado          TINYINT              NULL
        CHECK (semaforoEstado IN (1, 2, 3)),

    -- Carga original
    fechaCarga              DATETIME             NOT NULL,
    loginCarga              VARCHAR(255)         NOT NULL
        REFERENCES sec_users(login),

    -- Reemplazo
    motivoReemplazo         NVARCHAR(500)        NULL,
    fechaReemplazo          DATETIME             NOT NULL DEFAULT GETDATE(),
    loginReemplazo          VARCHAR(255)         NOT NULL
        REFERENCES sec_users(login)
)
GO

-- 2.7  Auditoría general (tabla de solo INSERT)
--      Registra accesos, cargas, cambios con IP y timestamp.
--      BIGINT para alto volumen.
--      Acciones: VIEW_DOC, UPLOAD, REPLACE_DOC, VALIDATE,
--                INACTIVATE_ART, INACTIVATE_PROV, ADMIN_CHANGE, LOGIN_FAIL
-- ------------------------------------------------------------
CREATE TABLE sit_auditoria (
    idAuditoria     BIGINT IDENTITY(1,1)         PRIMARY KEY,
    loginUsuario    VARCHAR(255)                 NOT NULL,   -- sin FK: puede ser login inválido
    accion          NVARCHAR(50)                 NOT NULL,
    entidad         NVARCHAR(50)                 NULL,       -- 'sit_documentos', 'sit_articulos'…
    idEntidad       INT                          NULL,
    descripcion     NVARCHAR(MAX)               NULL,
    ipOrigen        NVARCHAR(45)                 NOT NULL,   -- soporta IPv6
    userAgent       NVARCHAR(300)               NULL,
    fecha           DATETIME                     NOT NULL DEFAULT GETDATE()
)
GO


-- ============================================================
-- PARTE 3: ÍNDICES
-- ============================================================

-- sit_articulos
CREATE INDEX IX_sit_articulos_planta
    ON sit_articulos(idPlanta)
GO
CREATE INDEX IX_sit_articulos_activo
    ON sit_articulos(activo)
GO

-- sit_articulo_proveedor
CREATE INDEX IX_sit_ap_idArticulo
    ON sit_articulo_proveedor(idArticulo)
GO
CREATE INDEX IX_sit_ap_idProveedor
    ON sit_articulo_proveedor(idProveedor)
GO

-- sit_requisitos_par
CREATE INDEX IX_sit_rq_idArticuloProveedor
    ON sit_requisitos_par(idArticuloProveedor)
GO

-- sit_documentos
CREATE INDEX IX_sit_doc_idArticuloProveedor
    ON sit_documentos(idArticuloProveedor)
GO
CREATE INDEX IX_sit_doc_idTipoDoc
    ON sit_documentos(idTipoDoc)
GO
CREATE INDEX IX_sit_doc_semaforoEstado
    ON sit_documentos(semaforoEstado)
GO
CREATE INDEX IX_sit_doc_fechaVencimiento
    ON sit_documentos(fechaVencimientoCalc)
GO
CREATE INDEX IX_sit_doc_esVersionActiva
    ON sit_documentos(esVersionActiva)
GO
CREATE INDEX IX_sit_doc_spItemId
    ON sit_documentos(spItemId)    -- búsqueda rápida por ID de SharePoint
GO

-- sit_versiones_historial
CREATE INDEX IX_sit_vh_idDocumento
    ON sit_versiones_historial(idDocumento)
GO

-- sit_auditoria
CREATE INDEX IX_sit_aud_loginUsuario
    ON sit_auditoria(loginUsuario)
GO
CREATE INDEX IX_sit_aud_fecha
    ON sit_auditoria(fecha)
GO
CREATE INDEX IX_sit_aud_accion
    ON sit_auditoria(accion)
GO


-- ============================================================
-- PARTE 4: DATOS INICIALES — 17 tipos de documento
-- ============================================================
--  reglasVigencia: 1=Fecha explícita  2=Emisión+365d  3=Recepción+730d
--  diasVigencia  : NULL para tipo 1; 365 para tipo 2; 730 para tipo 3
-- ------------------------------------------------------------
INSERT INTO sit_tipos_documento
    (nombre, clave, reglasVigencia, diasVigencia, requiereValidacion, validadorPuesto)
VALUES
    -- Tipo 3: Recepción + 730 días
    ('Ficha Técnica',               'FT',               3, 730, 1, 'Control de Calidad'),
    ('Hoja de Datos de Seguridad',  'HDS',              3, 730, 1, 'Control de Calidad'),
    ('Certificado de Análisis',     'COA',              3, 730, 1, 'Control de Calidad'),
    ('Especificaciones',            'ESPECIF',          3, 730, 1, 'Control de Calidad'),
    ('Tabla Nutrimental',           'TBL_NUT',          3, 730, 1, 'Control de Calidad'),
    ('Imagen del Producto',         'IMG_PROD',         3, 730, 1, 'Control de Calidad'),
    ('Declaración de Alérgenos',    'DECL_ALERG',       3, 730, 1, 'Control de Calidad'),

    -- Tipo 2: Emisión + 365 días
    ('Carta de Garantía',           'CARTA_GRTIA',      2, 365, 1, 'Control de Calidad'),
    ('Carta de No Fraude',          'CARTA_NOFRAUDE',   2, 365, 1, 'Fraude/Compras'),
    ('Declaraciones',               'DECL',             2, 365, 1, 'Control de Calidad'),
    ('Análisis de Tercería',        'ANAL_TERC',        2, 365, 1, 'Control de Calidad'),
    ('Cuestionario de Fraude',      'CUEST_FRAUDE',     2, 365, 1, 'Fraude/Compras'),
    ('Cuestionario SGIA',           'CUEST_SGIA',       2, 365, 1, 'SGIA'),
    ('Declaración Balance de Masas','DECL_BAL_MASAS',   2, 365, 1, 'Fraude/Compras'),
    ('Análisis de Peligros MP',     'ANAL_PELIGROS',    2, 365, 1, 'Control de Calidad'),

    -- Tipo 1: Fecha explícita
    ('Certificación de Producto',   'CERT_PROD',        1, NULL, 1, 'Control de Calidad'),
    ('Certificación Proveedor/Fabricante', 'CERT_PROV', 1, NULL, 1, 'Control de Calidad')
GO

-- Puestos iniciales (actualizar con lista definitiva de Andrea Gaona)
INSERT INTO sit_permisos_puestos
    (puesto, puedeVerActivos, puedeVerInactivos, puedeCargarDoc, puedeValidar, puedeAdmin, accesoIAFSA, accesoDFNC)
VALUES
    ('Administradora SIT',  1, 1, 1, 1, 1, 1, 1),
    ('Control de Calidad',  1, 0, 0, 1, 0, 1, 1),
    ('Fraude/Compras',      1, 0, 0, 1, 0, 1, 1),
    ('SGIA',                1, 0, 0, 1, 0, 1, 1),
    ('Usuario General',     1, 0, 0, 0, 0, 1, 1)
GO


-- ============================================================
-- FIN DEL SCRIPT
-- Siguiente paso: sit_backend_v1 (routes + services Node.js)
-- ============================================================


SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE 'sit[_]%'
  AND LEFT(TABLE_NAME, 3) = 'sit'
ORDER BY TABLE_NAME


SELECT * FROM USUARIOSRH WHERE NOMBRE LIKE '%sAUL%'
select * from sec_users where name like '%SAUL%' where area like '%vigilancia%'


SELECT COLUMN_NAME, DATA_TYPE
FROM   INFORMATION_SCHEMA.COLUMNS
WHERE  TABLE_NAME = 'sec_users'
ORDER  BY ORDINAL_POSITION;

SELECT DISTINCT area
FROM   sec_users
WHERE  area IS NOT NULL
ORDER  BY area;

SELECT *
FROM   sit_permisos_puestos
ORDER  BY puesto;



select * from sec_users where name like '%Miriam%'

MISALAZAR