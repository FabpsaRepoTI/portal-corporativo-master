-- ════════════════════════════════════════════════════════════
-- PRODUCCIÓN (DB_RHFABPSA): unidades por sitio en la pestaña Vehículos.
--   1 Planta Alérgenos        : quitar 121, 133 · agregar 122, 131
--   4 Lácteos                 : agregar 122, 132 (conserva sus 4 renglones libres)
--   5 Bodega Francisco Villa  : quitar 121, 125, 132, 133 · agregar 131
-- Las unidades que salen se DESACTIVAN (no se borran: los reportes ya
-- creados las referencian). Solo afecta a reportes NUEVOS.
-- Al final se reordena cada sitio: unidades por número, renglones libres al final.
-- ════════════════════════════════════════════════════════════

SET XACT_ABORT ON
BEGIN TRANSACTION

-- 1. Quitar
UPDATE vig_config_vehiculos SET activo = 0
WHERE (idSitio = 1 AND numero IN ('121', '133'))
   OR (idSitio = 5 AND numero IN ('121', '125', '132', '133'))

-- 2. Agregar (reactiva si ya existía el renglón; si no, lo crea)
DECLARE @alta TABLE (idSitio INT, numero VARCHAR(20))
INSERT INTO @alta VALUES (1, '122'), (1, '131'), (4, '122'), (4, '132'), (5, '131')

UPDATE c SET activo = 1
FROM vig_config_vehiculos c
JOIN @alta a ON a.idSitio = c.idSitio AND a.numero = c.numero

INSERT INTO vig_config_vehiculos (idSitio, numero, descripcion, esFijo, orden, activo, idVehiculoCatalogo)
SELECT a.idSitio, v.numero, v.descripcion, 1, 999, 1, v.idVehiculoCatalogo
FROM @alta a
JOIN vig_vehiculos v ON v.numero = a.numero
WHERE NOT EXISTS (
  SELECT 1 FROM vig_config_vehiculos c WHERE c.idSitio = a.idSitio AND c.numero = a.numero
)

-- 3. Reordenar los sitios tocados
UPDATE c SET orden = x.nuevoOrden
FROM vig_config_vehiculos c
JOIN (
  SELECT idVehiculo,
         ROW_NUMBER() OVER (
           PARTITION BY idSitio
           ORDER BY esFijo DESC, TRY_CAST(numero AS INT), orden, idVehiculo
         ) AS nuevoOrden
  FROM vig_config_vehiculos
  WHERE idSitio IN (1, 4, 5) AND activo = 1
) x ON x.idVehiculo = c.idVehiculo

-- Revisión antes de confirmar
SELECT s.idSitio, s.nombre,
       STRING_AGG(ISNULL(NULLIF(c.numero, ''), '(libre)'), ', ') WITHIN GROUP (ORDER BY c.orden) AS unidades
FROM vig_sitios s
JOIN vig_config_vehiculos c ON c.idSitio = s.idSitio AND c.activo = 1
WHERE s.activo = 1
GROUP BY s.idSitio, s.nombre
ORDER BY s.idSitio

COMMIT TRANSACTION
-- Si el resultado no es el esperado, cambia el COMMIT por ROLLBACK y vuelve a correr.
