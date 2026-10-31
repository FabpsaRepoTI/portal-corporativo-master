-- ════════════════════════════════════════════════════════════
-- PRODUCCIÓN (DB_RHFABPSA): deja los sitios de Vigilancia igual que DEV.
--
-- En producción se dieron de alta dos sitios que duplican a otros:
--   6 LACTEOS          = 4 NO_CARNICOS  (en DEV el 4 se llama "Lácteos")
--   7 ALMACEN_CENTRAL  = 5 BODEGA_FV
-- Los duplicados se DESACTIVAN (no se borran: el sitio 6 tiene reportes
-- y rondines ligados). getSitios solo lista sitios activos.
-- Además se activa "Ubicación e incidencia de vehículos" en los sitios
-- que en DEV la tienen y se les cargan los destinos.
-- Todo en una transacción: si algo falla, no se aplica nada.
-- ════════════════════════════════════════════════════════════

SET XACT_ABORT ON
BEGIN TRANSACTION

-- 1. Desactivar duplicados
UPDATE vig_sitios SET activo = 0 WHERE idSitio IN (6, 7)

-- 2. El sitio 4 se muestra como "Lácteos" (igual que DEV; la clave
--    NO_CARNICOS se conserva porque el código la usa para el acceso por área)
UPDATE vig_sitios SET nombre = N'Lácteos' WHERE idSitio = 4

-- 3. Activar Ubicación en No Alérgenos, Lácteos y Bodega FV
UPDATE vig_sitios SET tieneUbicacionIncidencia = 1 WHERE idSitio IN (2, 4, 5)

-- 4. Destinos: copiar el catálogo de Planta Alérgenos a los sitios que no tienen
INSERT INTO vig_config_destinos (idSitio, nombre, orden, activo)
SELECT s.idSitio, d.nombre, d.orden, 1
FROM vig_config_destinos d
CROSS JOIN (VALUES (2), (4), (5)) AS s(idSitio)
WHERE d.idSitio = 1
  AND d.activo = 1
  AND NOT EXISTS (
    SELECT 1 FROM vig_config_destinos x
    WHERE x.idSitio = s.idSitio AND x.nombre = d.nombre
  )

-- Revisión antes de confirmar
SELECT idSitio, clave, nombre, activo, tieneUbicacionIncidencia,
       (SELECT COUNT(*) FROM vig_config_destinos d WHERE d.idSitio = s.idSitio AND d.activo = 1) AS destinos
FROM vig_sitios s
ORDER BY idSitio

COMMIT TRANSACTION
-- Si el resultado no es el esperado, cambia el COMMIT por ROLLBACK y vuelve a correr.
