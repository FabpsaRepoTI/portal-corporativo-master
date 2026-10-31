-- ════════════════════════════════════════════════════════════
-- PRODUCCIÓN (DB_RHFABPSA): km inicial de las 26 unidades.
-- Fuente: último registro del sistema anterior (kilometrajeE / kilometrajeS).
-- Se toma el mayor de los dos (en 93, 101, 108, 121 y 133 la entrada venía en 0).
-- Se guarda como lectura INICIAL (tipo 3): a partir de aquí cada sitio
-- ve este km como sugerencia y no permite capturar uno menor.
-- No duplica: una unidad que ya tenga lecturas no se toca.
-- ════════════════════════════════════════════════════════════

SET XACT_ABORT ON
BEGIN TRANSACTION

DECLARE @km TABLE (numero VARCHAR(20), km INT)
INSERT INTO @km (numero, km) VALUES
  ('68',   663756), ('79',  1195310), ('81',   477607), ('88',   229340),
  ('89',   183753), ('93',  1294680), ('94',   303531), ('97',    84911),
  ('98',   160562), ('99',   351669), ('101', 1138918), ('102',  976677),
  ('108',  207013), ('110',  207642), ('111',  130375), ('112',  174807),
  ('113',  155163), ('115',  155900), ('117',  473292), ('118',  417188),
  ('121',   94357), ('122',   90280), ('125',   57046), ('131',   22885),
  ('132',   20914), ('133',    2974)

-- Unidades de la lista que no existen en el catálogo (debe salir vacío)
SELECT k.numero AS sinCatalogo
FROM @km k
LEFT JOIN vig_vehiculos v ON v.numero = k.numero
WHERE v.idVehiculoCatalogo IS NULL

INSERT INTO vig_km_lecturas (idVehiculoCatalogo, tipo, km, loginUsuario)
SELECT v.idVehiculoCatalogo, 3, k.km, 'CARGA_INICIAL'
FROM @km k
JOIN vig_vehiculos v ON v.numero = k.numero
WHERE NOT EXISTS (
  SELECT 1 FROM vig_km_lecturas l
  WHERE l.idVehiculoCatalogo = v.idVehiculoCatalogo AND l.anulada = 0
)

-- Revisión antes de confirmar
SELECT v.numero, MAX(l.km) AS kmActual
FROM vig_vehiculos v
LEFT JOIN vig_km_lecturas l ON l.idVehiculoCatalogo = v.idVehiculoCatalogo AND l.anulada = 0
GROUP BY v.numero
ORDER BY TRY_CAST(v.numero AS INT)

COMMIT TRANSACTION
-- Si el resultado no es el esperado, cambia el COMMIT por ROLLBACK y vuelve a correr.
