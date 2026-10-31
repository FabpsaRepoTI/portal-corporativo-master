-- ════════════════════════════════════════════════════════════
-- Catálogo maestro de vehículos (una fila por unidad).
-- NO modifica el comportamiento actual: vig_config_vehiculos sigue
-- siendo la configuración por sitio (renglones del formato) y solo
-- se le agrega una referencia opcional al catálogo.
-- Los renglones libres (esFijo = 0) quedan con idVehiculoCatalogo NULL.
-- ════════════════════════════════════════════════════════════

-- Catálogo
IF OBJECT_ID('vig_vehiculos', 'U') IS NULL
CREATE TABLE vig_vehiculos (
  idVehiculoCatalogo INT IDENTITY(1,1) PRIMARY KEY,
  numero             VARCHAR(20)   NOT NULL,
  descripcion        NVARCHAR(100) NULL,
  activo             BIT           NOT NULL DEFAULT 1,
  fechaCreacion      DATETIME      NOT NULL DEFAULT GETDATE(),
  CONSTRAINT UQ_vig_vehiculos_numero UNIQUE (numero)
)
GO

-- Seed desde la configuración existente (números únicos)
INSERT INTO vig_vehiculos (numero, descripcion)
SELECT LTRIM(RTRIM(c.numero)), MIN(c.descripcion)
FROM vig_config_vehiculos c
WHERE c.esFijo = 1
  AND c.activo = 1
  AND LTRIM(RTRIM(ISNULL(c.numero, ''))) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM vig_vehiculos v WHERE v.numero = LTRIM(RTRIM(c.numero))
  )
GROUP BY LTRIM(RTRIM(c.numero))
GO

-- Referencia opcional desde la configuración por sitio
IF COL_LENGTH('vig_config_vehiculos', 'idVehiculoCatalogo') IS NULL
ALTER TABLE vig_config_vehiculos
  ADD idVehiculoCatalogo INT NULL
    CONSTRAINT FK_vig_cfgveh_catalogo REFERENCES vig_vehiculos(idVehiculoCatalogo)
GO

UPDATE c
SET c.idVehiculoCatalogo = v.idVehiculoCatalogo
FROM vig_config_vehiculos c
JOIN vig_vehiculos v ON v.numero = LTRIM(RTRIM(c.numero))
WHERE c.idVehiculoCatalogo IS NULL
  AND c.esFijo = 1
  AND c.activo = 1
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_vig_cfgveh_catalogo')
CREATE INDEX IX_vig_cfgveh_catalogo ON vig_config_vehiculos(idVehiculoCatalogo)
GO

-- Verificación: unidades del catálogo y en cuántos sitios aparecen
-- SELECT v.numero, v.descripcion, COUNT(c.idVehiculo) AS sitios
-- FROM vig_vehiculos v
-- LEFT JOIN vig_config_vehiculos c ON c.idVehiculoCatalogo = v.idVehiculoCatalogo
-- GROUP BY v.numero, v.descripcion
-- ORDER BY TRY_CAST(v.numero AS INT)  -- numero es varchar: ordenar como número
