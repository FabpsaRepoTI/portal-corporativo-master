-- ════════════════════════════════════════════════════════════
-- SIT — Equivalencias de tipos de documento con los nombres de archivo
-- de SharePoint, y fechas de vencimiento capturadas a mano.
--
-- sit_tipo_documento_alias: varios nombres por tipo. El backend compara
--   sin mayúsculas, sin acentos y por prefijo ("Carta Garantía, Referencia
--   Normativa" → alias "Carta Garantía"); gana el alias más largo.
-- sit_documento_fecha: vencimiento capturado para un archivo de SharePoint.
--   Tiene prioridad sobre la fecha calculada por la regla del tipo.
-- Requiere: 20261014_sit_tablas.sql. Idempotente.
-- ════════════════════════════════════════════════════════════

IF OBJECT_ID('sit_tipo_documento_alias', 'U') IS NULL
CREATE TABLE sit_tipo_documento_alias (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  alias      NVARCHAR(200) NOT NULL,
  idTipoDoc  TINYINT       NOT NULL REFERENCES sit_tipos_documento(idTipoDoc), -- mismo tipo que la PK
  CONSTRAINT UQ_sit_tipo_documento_alias UNIQUE (alias)
)
GO

IF OBJECT_ID('sit_documento_fecha', 'U') IS NULL
CREATE TABLE sit_documento_fecha (
  sharepointId      NVARCHAR(200) PRIMARY KEY,
  fechaVencimiento  DATE          NOT NULL,
  registradoPor     NVARCHAR(50)  NULL,
  fechaRegistro     DATETIME      NOT NULL DEFAULT GETDATE()
)
GO

-- Carga de alias (solo los que falten)
INSERT INTO sit_tipo_documento_alias (alias, idTipoDoc)
SELECT v.alias, v.idTipoDoc
FROM (VALUES
  -- 1 Ficha Técnica
  (N'Ficha Técnica', 1), (N'FT', 1),
  -- 2 Hoja de Datos de Seguridad
  (N'Hoja de Datos de Seguridad', 2), (N'HS', 2), (N'HDS', 2),
  -- 3 Certificado de Análisis
  (N'Certificado de Análisis', 3), (N'Ejemplo CoA', 3), (N'CoA', 3), (N'Certificado de Analisis', 3),
  -- 4 Especificaciones
  (N'Especificaciones', 4),
  -- 5 Tabla Nutrimental
  (N'Tabla Nutrimental', 5), (N'Información Nutrimental', 5),
  -- 6 Imagen del Producto
  (N'Imagen del Producto', 6), (N'Imagen', 6), (N'Foto', 6),
  -- 7 Declaración de Alérgenos
  (N'Declaración de Alérgenos', 7), (N'Declaración de AyS', 7), (N'Declaración de Alergenos', 7), (N'AyS', 7),
  -- 8 Carta de Garantía
  (N'Carta Garantía', 8), (N'Carta de Garantía', 8), (N'CG Empaque Primario', 8), (N'Carta Garantia', 8),
  -- 9 Carta de No Fraude
  (N'Carta de No Fraude', 9), (N'Carta de Fraude Alimentario', 9), (N'Carta Fraude', 9),
  -- 10 Declaraciones ('Declaración Balance de Masas' va solo en el tipo 14)
  (N'Declaraciones', 10), (N'Declaración del País de Origen', 10), (N'Declaración de Origen', 10),
  -- 11 Análisis de Tercería
  (N'Análisis de Tercería', 11), (N'Tercería Metales Pesados', 11), (N'Analisis de Terceria', 11), (N'Terceria', 11),
  -- 12 Cuestionario de Fraude
  (N'Cuestionario de Fraude', 12), (N'Cuestionario de Fraude Alimentario', 12), (N'Cuestionario fraude alimentario', 12),
  -- 13 Cuestionario SGIA
  (N'Cuestionario SGIA', 13),
  -- 14 Declaración Balance de Masas
  (N'Balance de Masas', 14), (N'Declaración Balance de Masas', 14),
  -- 15 Análisis de Peligros MP
  (N'Análisis de Peligros', 15), (N'Análisis de Peligros MP', 15), (N'APPCC', 15),
  -- 16 Certificación de Producto (fecha explícita)
  (N'Kosher', 16), (N'Halal', 16), (N'Certificación de Producto', 16), (N'Certificacion de Producto', 16), (N'GMO', 16), (N'Orgánico', 16),
  -- 17 Certificación Proveedor/Fabricante (fecha explícita)
  (N'FSSC 22000', 17), (N'Certificación Proveedor', 17), (N'Certificacion Proveedor', 17),
  (N'FSSC 22000 (Fabricante)', 17), (N'FSSC 22000 N1', 17), (N'ISO', 17), (N'BRC', 17), (N'SQF', 17)
) v(alias, idTipoDoc)
WHERE NOT EXISTS (SELECT 1 FROM sit_tipo_documento_alias a WHERE a.alias = v.alias)
GO

SELECT t.idTipoDoc, t.nombre, COUNT(a.id) AS alias
FROM sit_tipos_documento t
LEFT JOIN sit_tipo_documento_alias a ON a.idTipoDoc = t.idTipoDoc
GROUP BY t.idTipoDoc, t.nombre
ORDER BY t.idTipoDoc
