-- ════════════════════════════════════════════════════════════
-- Kilometraje centralizado por unidad (catálogo vig_vehiculos).
--
-- Antes: el km "heredado" se calculaba por vig_config_vehiculos.idVehiculo
-- (un id distinto por sitio para el mismo camión) y solo con reportes
-- CERRADOS de días ANTERIORES (vig_km_auditoria se llena al cerrar).
-- Resultado: otro sitio, u otro turno del mismo día, veía un km viejo.
--
-- Ahora: cada captura de km (salida/entrada) se guarda al momento en
-- vig_km_lecturas, ligada a la unidad del catálogo. El último km válido
-- de una unidad = MAX(km) de sus lecturas no anuladas (el odómetro solo
-- avanza). Las correcciones anulan la lectura previa, no la borran.
-- Requiere: 20261013_vig_catalogo_vehiculos.sql
-- ════════════════════════════════════════════════════════════

IF OBJECT_ID('vig_km_lecturas', 'U') IS NULL
CREATE TABLE vig_km_lecturas (
  idLectura          INT IDENTITY(1,1) PRIMARY KEY,
  idVehiculoCatalogo INT           NOT NULL REFERENCES vig_vehiculos(idVehiculoCatalogo),
  idVehiculoRep      INT           NULL REFERENCES vig_vehiculos_reporte(idVehiculoRep),
  idReporte          INT           NULL REFERENCES vig_reportes(idReporte),
  idSitio            INT           NULL REFERENCES vig_sitios(idSitio),
  tipo               TINYINT       NOT NULL,   -- 1=SALIDA, 2=ENTRADA, 3=INICIAL, 4=AJUSTE
  km                 INT           NOT NULL,
  loginUsuario       VARCHAR(255)  NOT NULL,
  fechaRegistro      DATETIME      NOT NULL DEFAULT GETDATE(),
  anulada            BIT           NOT NULL DEFAULT 0,
  motivoAnulacion    NVARCHAR(200) NULL,
  loginAnulacion     VARCHAR(255)  NULL,
  fechaAnulacion     DATETIME      NULL,
  CONSTRAINT CK_vig_km_lecturas_tipo CHECK (tipo IN (1, 2, 3, 4)),
  CONSTRAINT CK_vig_km_lecturas_km   CHECK (km >= 0)
)
GO

-- Último km por unidad
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_vig_km_lect_unidad')
CREATE INDEX IX_vig_km_lect_unidad
  ON vig_km_lecturas(idVehiculoCatalogo, anulada, km DESC)
  INCLUDE (idVehiculoRep, idSitio, fechaRegistro)
GO

-- Una sola lectura vigente por renglón de reporte y tipo (evita que dos
-- guardados simultáneos dejen dos salidas/entradas activas)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_vig_km_lect_renglon')
CREATE UNIQUE INDEX UX_vig_km_lect_renglon
  ON vig_km_lecturas(idVehiculoRep, tipo)
  WHERE anulada = 0 AND idVehiculoRep IS NOT NULL
GO

-- ── Seed: km inicial por unidad ───────────────────────────────
-- Una lectura INICIAL por unidad con el km más alto capturado hasta hoy
-- en cualquier reporte (borrador o cerrado) de cualquier sitio.
INSERT INTO vig_km_lecturas (idVehiculoCatalogo, idReporte, idSitio, tipo, km, loginUsuario)
SELECT x.idVehiculoCatalogo, x.idReporte, x.idSitio, 3, x.km, 'MIGRACION'
FROM (
  SELECT
    cv.idVehiculoCatalogo, r.idReporte, r.idSitio, k.km,
    ROW_NUMBER() OVER (PARTITION BY cv.idVehiculoCatalogo ORDER BY k.km DESC, r.idReporte DESC) AS rn
  FROM vig_vehiculos_reporte vr
  JOIN vig_reportes r          ON r.idReporte  = vr.idReporte
  JOIN vig_config_vehiculos cv ON cv.idVehiculo = vr.idVehiculo
  CROSS APPLY (VALUES (vr.kmSalida), (vr.kmEntrada)) AS k(km)
  WHERE cv.idVehiculoCatalogo IS NOT NULL
    AND k.km IS NOT NULL
) x
WHERE x.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM vig_km_lecturas l WHERE l.idVehiculoCatalogo = x.idVehiculoCatalogo
  )
GO

-- Verificación: último km válido por unidad
-- SELECT v.numero, MAX(l.km) AS kmActual
-- FROM vig_vehiculos v
-- LEFT JOIN vig_km_lecturas l ON l.idVehiculoCatalogo = v.idVehiculoCatalogo AND l.anulada = 0
-- GROUP BY v.numero
-- ORDER BY TRY_CAST(v.numero AS INT)
