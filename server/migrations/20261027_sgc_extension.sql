-- 20261027_sgc_extension.sql
-- Módulo SGC/SGI: columnas y tablas que pide la especificación v2 y que no
-- existían en el esquema inicial. Solo agrega (columnas NULL o con DEFAULT,
-- tablas nuevas) y amplía dos CHECK; no modifica ni borra datos.
-- Idempotente: se puede correr más de una vez.
SET XACT_ABORT ON;
BEGIN TRAN;

-- ── No conformidades ──────────────────────────────────────────
IF COL_LENGTH('sgc_no_conformidades', 'idSitio') IS NULL
  ALTER TABLE sgc_no_conformidades ADD idSitio INT NULL;
IF COL_LENGTH('sgc_no_conformidades', 'descripcionDetallada') IS NULL
  ALTER TABLE sgc_no_conformidades ADD descripcionDetallada NVARCHAR(MAX) NULL;
-- ids de sgc_cat_herramientas separados por coma: "1,2,6"
IF COL_LENGTH('sgc_no_conformidades', 'herramientasAnalisis') IS NULL
  ALTER TABLE sgc_no_conformidades ADD herramientasAnalisis VARCHAR(100) NULL;

-- ── Acciones correctivas ─────────────────────────────────────
-- Estatus: 1 Abierta, 2 En ejecución, 3 Pendiente verificación, 4 Verificada eficaz, 5 Cerrada
IF COL_LENGTH('sgc_acciones_correctivas', 'titulo') IS NULL
  ALTER TABLE sgc_acciones_correctivas ADD titulo NVARCHAR(200) NULL;
IF COL_LENGTH('sgc_acciones_correctivas', 'descripcion') IS NULL
  ALTER TABLE sgc_acciones_correctivas ADD descripcion NVARCHAR(MAX) NULL;
IF COL_LENGTH('sgc_acciones_correctivas', 'causaRaiz') IS NULL
  ALTER TABLE sgc_acciones_correctivas ADD causaRaiz NVARCHAR(MAX) NULL;
-- Avance = líneas completadas / total; se recalcula al cambiar una línea
IF COL_LENGTH('sgc_acciones_correctivas', 'pctAvance') IS NULL
  ALTER TABLE sgc_acciones_correctivas ADD pctAvance TINYINT NOT NULL
    CONSTRAINT DF_sgc_ac_pctAvance DEFAULT (0);

IF COL_LENGTH('sgc_acciones_plan', 'recursos') IS NULL
  ALTER TABLE sgc_acciones_plan ADD recursos NVARCHAR(500) NULL;

IF OBJECT_ID('sgc_historial_ac') IS NULL
BEGIN
  CREATE TABLE sgc_historial_ac (
    idHistorial     INT IDENTITY PRIMARY KEY,
    idAC            INT NOT NULL REFERENCES sgc_acciones_correctivas(idAC),
    estatusAnterior TINYINT NULL,
    estatusNuevo    TINYINT NOT NULL,
    login           VARCHAR(255) NOT NULL REFERENCES sec_users(login),
    motivo          NVARCHAR(MAX) NULL,
    fechaRegistro   DATETIME NOT NULL DEFAULT (GETDATE())
  );
  CREATE INDEX IX_sgc_historial_ac ON sgc_historial_ac(idAC);
END

-- ── Auditorías ───────────────────────────────────────────────
-- Estatus: 1 Planeada, 2 En curso, 3 Completada, 4 Cancelada
-- Tipo: 1 Interna, 2 Externa, 3 Certificación
IF COL_LENGTH('sgc_auditorias', 'titulo') IS NULL
  ALTER TABLE sgc_auditorias ADD titulo NVARCHAR(200) NULL;
IF COL_LENGTH('sgc_auditorias', 'fechaFin') IS NULL
  ALTER TABLE sgc_auditorias ADD fechaFin DATE NULL;
IF COL_LENGTH('sgc_auditorias', 'normaAplicable') IS NULL
  ALTER TABLE sgc_auditorias ADD normaAplicable NVARCHAR(200) NULL;
IF COL_LENGTH('sgc_auditorias', 'conclusiones') IS NULL
  ALTER TABLE sgc_auditorias ADD conclusiones NVARCHAR(MAX) NULL;

DECLARE @ck SYSNAME, @sql NVARCHAR(400);
SELECT @ck = name FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('sgc_auditorias') AND definition LIKE '%tipo%' AND name <> 'CK_sgc_auditorias_tipo';
IF @ck IS NOT NULL
BEGIN
  SET @sql = N'ALTER TABLE sgc_auditorias DROP CONSTRAINT ' + QUOTENAME(@ck);
  EXEC sp_executesql @sql;
END
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_sgc_auditorias_tipo')
  ALTER TABLE sgc_auditorias ADD CONSTRAINT CK_sgc_auditorias_tipo CHECK (tipo IN (1, 2, 3));

IF OBJECT_ID('sgc_auditoria_auditores') IS NULL
  CREATE TABLE sgc_auditoria_auditores (
    idAuditoria INT NOT NULL REFERENCES sgc_auditorias(idAuditoria),
    login       VARCHAR(255) NOT NULL REFERENCES sec_users(login),
    CONSTRAINT PK_sgc_auditoria_auditores PRIMARY KEY (idAuditoria, login)
  );

-- idDepartamento = dbo.DEPARTAMENTOS.idDepartamento
IF OBJECT_ID('sgc_auditoria_areas') IS NULL
  CREATE TABLE sgc_auditoria_areas (
    idAuditoria    INT NOT NULL REFERENCES sgc_auditorias(idAuditoria),
    idDepartamento INT NOT NULL,
    CONSTRAINT PK_sgc_auditoria_areas PRIMARY KEY (idAuditoria, idDepartamento)
  );

-- Hallazgos — Tipo: 1 No conformidad, 2 Observación, 3 Oportunidad de mejora
IF COL_LENGTH('sgc_hallazgos', 'loginResponsable') IS NULL
  ALTER TABLE sgc_hallazgos ADD loginResponsable VARCHAR(255) NULL;
IF COL_LENGTH('sgc_hallazgos', 'fechaCompromiso') IS NULL
  ALTER TABLE sgc_hallazgos ADD fechaCompromiso DATE NULL;

-- ── Indicadores ──────────────────────────────────────────────
-- Frecuencia: 1 Mensual, 2 Trimestral, 3 Semestral, 4 Anual
IF COL_LENGTH('sgc_indicadores', 'descripcion') IS NULL
  ALTER TABLE sgc_indicadores ADD descripcion NVARCHAR(500) NULL;
IF COL_LENGTH('sgc_indicadores', 'loginResponsable') IS NULL
  ALTER TABLE sgc_indicadores ADD loginResponsable VARCHAR(255) NULL;
IF COL_LENGTH('sgc_indicadores', 'clausulaISO') IS NULL
  ALTER TABLE sgc_indicadores ADD clausulaISO NVARCHAR(20) NULL;
IF COL_LENGTH('sgc_indicadores', 'formulaCalculo') IS NULL
  ALTER TABLE sgc_indicadores ADD formulaCalculo NVARCHAR(500) NULL;

SET @ck = NULL;
SELECT @ck = name FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID('sgc_indicadores') AND definition LIKE '%frecuencia%' AND name <> 'CK_sgc_indicadores_frecuencia';
IF @ck IS NOT NULL
BEGIN
  SET @sql = N'ALTER TABLE sgc_indicadores DROP CONSTRAINT ' + QUOTENAME(@ck);
  EXEC sp_executesql @sql;
END
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_sgc_indicadores_frecuencia')
  ALTER TABLE sgc_indicadores ADD CONSTRAINT CK_sgc_indicadores_frecuencia CHECK (frecuencia IN (1, 2, 3, 4));

-- Sentido de la meta: 1 = mayor es mejor, 2 = menor es mejor (p. ej. tasas de reincidencia)
IF COL_LENGTH('sgc_indicadores', 'sentido') IS NULL
  ALTER TABLE sgc_indicadores ADD sentido TINYINT NOT NULL
    CONSTRAINT DF_sgc_indicadores_sentido DEFAULT (1)
    CONSTRAINT CK_sgc_indicadores_sentido CHECK (sentido IN (1, 2));

-- Un valor por indicador y periodo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_sgc_indicadores_valores_periodo')
  CREATE UNIQUE INDEX UQ_sgc_indicadores_valores_periodo ON sgc_indicadores_valores(idIndicador, periodo);

-- ── Riesgos ──────────────────────────────────────────────────
-- Tipo: 1 Riesgo, 2 Oportunidad. Nivel = probabilidad × impacto (se calcula)
IF COL_LENGTH('sgc_riesgos', 'tipo') IS NULL
  ALTER TABLE sgc_riesgos ADD tipo TINYINT NOT NULL
    CONSTRAINT DF_sgc_riesgos_tipo DEFAULT (1)
    CONSTRAINT CK_sgc_riesgos_tipo CHECK (tipo IN (1, 2));
IF COL_LENGTH('sgc_riesgos', 'clausulaISO') IS NULL
  ALTER TABLE sgc_riesgos ADD clausulaISO NVARCHAR(20) NULL;
IF COL_LENGTH('sgc_riesgos', 'tratamiento') IS NULL
  ALTER TABLE sgc_riesgos ADD tratamiento NVARCHAR(MAX) NULL;
IF COL_LENGTH('sgc_riesgos', 'loginDueno') IS NULL
  ALTER TABLE sgc_riesgos ADD loginDueno VARCHAR(255) NULL;
IF COL_LENGTH('sgc_riesgos', 'activo') IS NULL
  ALTER TABLE sgc_riesgos ADD activo BIT NOT NULL CONSTRAINT DF_sgc_riesgos_activo DEFAULT (1);

-- El historial de riesgos vive en sgc_historial_riesgos (creada aparte; no se crea aquí).

COMMIT;
