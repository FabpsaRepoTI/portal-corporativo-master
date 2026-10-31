-- ════════════════════════════════════════════════════════════
-- Agrega al Ing. Luis Miguel (Mtto) al catálogo de ejecutivos
-- del sitio SUR_121, faltante en el seed inicial.
-- ════════════════════════════════════════════════════════════

INSERT INTO vig_config_ejecutivos (idSitio, nombre, puesto, orden)
SELECT idSitio, 'Ing. Luis Miguel', 'Mtto',
       (SELECT COALESCE(MAX(orden), 0) + 1 FROM vig_config_ejecutivos WHERE idSitio = s.idSitio)
FROM vig_sitios s
WHERE clave = 'SUR_121'
  AND NOT EXISTS (
    SELECT 1 FROM vig_config_ejecutivos ce
    WHERE ce.idSitio = s.idSitio AND ce.nombre = 'Ing. Luis Miguel'
  )
GO
