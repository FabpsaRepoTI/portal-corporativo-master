-- ════════════════════════════════════════════════════════════
-- SIT — Acuerdos de la reunión con Calidad (2026-10-16)
--
-- 1) Análisis de Migración de Empaque (tipo 35) pasa a ser requisito
--    obligatorio para todos los pares artículo+proveedor de la matriz.
-- 2) Documentos sin vencimiento (GRAS, declaraciones FDA): nuevo tipo
--    "Documento de Referencia" con reglasVigencia = 4 (no vence). El
--    servicio lo marca VERDE sin fecha. "Registro FDA" (con número de
--    registro) NO se toca: sí tiene vigencia.
-- 3) Tipo de notificación para las validaciones de Calidad (DESACTIVADO
--    por ahora, ver sección 3).
--
-- Idempotente. Correr en DB_RHFABPSA_DEV y en DB_RHFABPSA.
-- ════════════════════════════════════════════════════════════

-- ── 0) Tipo 35 y sus alias ──────────────────────────────────
-- En DEV se dieron de alta a mano; ninguna migración anterior los crea.
-- Se conserva el id 35 porque la matriz y el código lo usan.
IF NOT EXISTS (SELECT 1 FROM sit_tipos_documento WHERE idTipoDoc = 35)
BEGIN
  SET IDENTITY_INSERT sit_tipos_documento ON;
  INSERT INTO sit_tipos_documento (idTipoDoc, nombre, clave, reglasVigencia, diasVigencia, requiereValidacion, validadorPuesto, activo)
  VALUES (35, N'Análisis de Migración de Empaque', N'ANAL_MIGRACION', 3, 730, 1, N'Control de Calidad', 1);
  SET IDENTITY_INSERT sit_tipos_documento OFF;
END
GO

MERGE sit_tipo_documento_alias AS t
USING (VALUES (N'Análisis de Migración'), (N'Análisis de Migración de Empaque'),
              (N'Análisis de Migración de Empaque Primario'), (N'Declaración de Migración de Empaque')) AS s(alias)
  ON t.alias = s.alias
WHEN NOT MATCHED THEN INSERT (alias, idTipoDoc) VALUES (s.alias, 35);
GO

-- Alias que en DEV se agregaron a mano y no estaban en 20261014b
MERGE sit_tipo_documento_alias AS t
USING (VALUES
  (N'Declaración de País de Origen', 10), (N'Declaración País de Origen', 10),
  (N'Declaración de Pais de Origen', 10), (N'Declaracion de Pais de Origen', 10),
  (N'Dec País de Origen', 10),            (N'Dec Pais de Origen', 10),
  (N'CG Empaque', 8),
  (N'FSCC 22000', 17), (N'BCR', 17), (N'HACCP', 17),
  (N'Declaración de Aflatoxinas', 11), (N'Declaración de Metales Pesados', 11), (N'Uso de metales Pesados', 11),
  (N'Control de Fraude Alimentario', 12)
) AS s(alias, idTipoDoc)
  ON t.alias = s.alias
WHEN NOT MATCHED THEN INSERT (alias, idTipoDoc) VALUES (s.alias, s.idTipoDoc);
GO

-- ── 1) Migración de Empaque obligatoria ─────────────────────
IF EXISTS (SELECT 1 FROM sit_tipos_documento WHERE idTipoDoc = 35)
INSERT INTO sit_ap_requisitos (codigoArticulo, empresa, codigoProveedor, idTipoDoc, esObligatorio, origen)
SELECT DISTINCT r.codigoArticulo, r.empresa, r.codigoProveedor, 35, 1, N'CALIDAD'
FROM sit_ap_requisitos r
WHERE NOT EXISTS (
  SELECT 1 FROM sit_ap_requisitos r2
  WHERE r2.codigoArticulo  = r.codigoArticulo
    AND r2.empresa         = r.empresa
    AND r2.codigoProveedor = r.codigoProveedor
    AND r2.idTipoDoc       = 35
);
GO

-- ── 2) Documento de Referencia (no vence) ───────────────────
-- reglasVigencia: 1 = fecha explícita, 2 = modificación + 365,
-- 3 = modificación + 730, 4 = no vence (nuevo).
DECLARE @ck SYSNAME = (
  SELECT TOP 1 cc.name
  FROM sys.check_constraints cc
  JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
  WHERE cc.parent_object_id = OBJECT_ID('sit_tipos_documento') AND c.name = 'reglasVigencia'
);
IF @ck IS NOT NULL AND @ck <> 'CK_sit_tipos_documento_reglasVigencia'
  EXEC('ALTER TABLE sit_tipos_documento DROP CONSTRAINT ' + @ck);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_sit_tipos_documento_reglasVigencia')
  ALTER TABLE sit_tipos_documento
    ADD CONSTRAINT CK_sit_tipos_documento_reglasVigencia CHECK (reglasVigencia IN (1, 2, 3, 4));
GO

IF NOT EXISTS (SELECT 1 FROM sit_tipos_documento WHERE nombre = N'Documento de Referencia')
  INSERT INTO sit_tipos_documento (nombre, clave, reglasVigencia, diasVigencia, requiereValidacion, validadorPuesto, activo)
  VALUES (N'Documento de Referencia', N'DOC_REF', 4, NULL, 0, NULL, 1);
GO

-- Alias que apuntan al tipo de referencia. Gana el alias más largo y casa
-- por prefijo a límite de palabra, así que "Registro FDA" no cae aquí.
DECLARE @ref TINYINT = (SELECT idTipoDoc FROM sit_tipos_documento WHERE nombre = N'Documento de Referencia');
MERGE sit_tipo_documento_alias AS t
USING (VALUES (N'GRAS'), (N'FDA'), (N'FDA (Proveedor)'), (N'FDA (Fabricante)'), (N'Declaración FDA')) AS s(alias)
  ON t.alias = s.alias
WHEN MATCHED AND t.idTipoDoc <> @ref THEN UPDATE SET idTipoDoc = @ref
WHEN NOT MATCHED THEN INSERT (alias, idTipoDoc) VALUES (s.alias, @ref);
GO

-- ── 3) Tipo de notificación — DESACTIVADO ───────────────────
-- Se activa cuando estén configurados los permisos de los usuarios reales
-- (perfil "Administradora SIT"). Para activarlo: descomentar este bloque y
-- la llamada a _notificarValidacion en validarDocumentoSharePoint.
-- IF NOT EXISTS (SELECT 1 FROM cat_tipoNotificacion WHERE nombre = 'sit_validacion')
--   INSERT INTO cat_tipoNotificacion (nombre, icono, colorHex, activo)
--   VALUES ('sit_validacion', 'file-check', '#4cc9a6', 1);
-- GO
