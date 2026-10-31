-- ════════════════════════════════════════════════════════════
-- PRODUCCIÓN (DB_RHFABPSA): limpiar los reportes de prueba de Vigilancia.
--
-- BORRA (datos capturados en reportes):
--   vig_reportes y todo lo que cuelga de ellos (personal, ejecutivos y
--   sus movimientos, vehículos y sus movimientos, rondines, siniestros,
--   ubicación), vig_km_auditoria y las lecturas de km de prueba.
--
-- CONSERVA (configuración):
--   vig_sitios, vig_vehiculos, vig_config_* (vehículos, ejecutivos,
--   rondines, destinos), vig_firmas (firma de cada usuario) y el km
--   ACTUAL de cada unidad (incluye lo capturado en los reportes que se
--   borran: se conserva como lectura inicial 'KM_AL_LIMPIAR').
--
-- El folio vuelve a empezar en IAF-000001 (se calcula del último reporte).
-- ════════════════════════════════════════════════════════════

SET XACT_ABORT ON
BEGIN TRANSACTION

-- El km actual de cada unidad se conserva tal cual. Foto antes de limpiar:
DECLARE @kmAntes TABLE (idVehiculoCatalogo INT PRIMARY KEY, km INT)
INSERT INTO @kmAntes
SELECT idVehiculoCatalogo, MAX(km) FROM vig_km_lecturas WHERE anulada = 0 GROUP BY idVehiculoCatalogo

-- Si el km actual viene de una captura en un reporte (y no de la carga
-- inicial), se guarda como lectura inicial sin reporte antes de borrarla
INSERT INTO vig_km_lecturas (idVehiculoCatalogo, idSitio, tipo, km, loginUsuario)
SELECT a.idVehiculoCatalogo, ult.idSitio, 3, a.km, 'KM_AL_LIMPIAR'
FROM @kmAntes a
CROSS APPLY (
  SELECT TOP 1 l.idSitio FROM vig_km_lecturas l
  WHERE l.idVehiculoCatalogo = a.idVehiculoCatalogo AND l.anulada = 0 AND l.km = a.km
  ORDER BY l.idLectura DESC
) ult
WHERE NOT EXISTS (
  SELECT 1 FROM vig_km_lecturas l
  WHERE l.idVehiculoCatalogo = a.idVehiculoCatalogo AND l.anulada = 0
    AND l.km = a.km AND l.idReporte IS NULL AND l.idVehiculoRep IS NULL
)

-- Lecturas ligadas a reportes de prueba
DELETE FROM vig_km_lecturas WHERE idReporte IS NOT NULL OR idVehiculoRep IS NOT NULL
DELETE FROM vig_km_auditoria

DELETE FROM vig_vehiculos_movimientos
DELETE FROM vig_vehiculos_reporte
DELETE FROM vig_ubicacion_reporte_vehiculos
DELETE FROM vig_ubicacion_reporte
DELETE FROM vig_ejecutivos_movimientos
DELETE FROM vig_ejecutivos_reporte
DELETE FROM vig_rondines_reporte
DELETE FROM vig_siniestros_reporte
DELETE FROM vig_personal_reporte
DELETE FROM vig_reportes

-- Seguridad: si el km de alguna unidad cambió, no se aplica nada
IF EXISTS (
  SELECT 1 FROM @kmAntes a
  OUTER APPLY (SELECT MAX(km) AS km FROM vig_km_lecturas l
               WHERE l.idVehiculoCatalogo = a.idVehiculoCatalogo AND l.anulada = 0) d
  WHERE ISNULL(d.km, -1) <> a.km
)
BEGIN
  ROLLBACK TRANSACTION
  RAISERROR('El km de alguna unidad cambió con la limpieza. No se aplicó nada.', 16, 1)
  RETURN
END

-- Revisión: lo borrado en 0; kmAntes y kmDespues deben ser iguales
SELECT
  (SELECT COUNT(*) FROM vig_reportes)            AS reportes,
  (SELECT COUNT(*) FROM vig_vehiculos_reporte)   AS vehiculosReporte,
  (SELECT COUNT(*) FROM vig_config_vehiculos)    AS configVehiculos, -- sin cambio
  (SELECT COUNT(*) FROM vig_firmas)              AS firmas           -- sin cambio

SELECT v.numero, a.km AS kmAntes, MAX(l.km) AS kmDespues
FROM vig_vehiculos v
LEFT JOIN @kmAntes a ON a.idVehiculoCatalogo = v.idVehiculoCatalogo
LEFT JOIN vig_km_lecturas l ON l.idVehiculoCatalogo = v.idVehiculoCatalogo AND l.anulada = 0
GROUP BY v.numero, a.km
ORDER BY TRY_CAST(v.numero AS INT)

COMMIT TRANSACTION
-- Si el resultado no es el esperado, cambia el COMMIT por ROLLBACK y vuelve a correr.
