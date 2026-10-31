-- ════════════════════════════════════════════════════════════
-- Convierte "Ubicación e incidencia de vehículos" de texto libre
-- (vig_ubicacion_reporte.unidades) a relación estructurada M:N,
-- con catálogo de destinos (reemplaza el arreglo hardcodeado en
-- vigilancia.service.js) y asignación por defecto con vigencia.
-- ════════════════════════════════════════════════════════════

-- Catálogo de destinos por sitio
CREATE TABLE vig_config_destinos (
  idDestino   INT IDENTITY(1,1) PRIMARY KEY,
  idSitio     INT           NOT NULL REFERENCES vig_sitios(idSitio),
  nombre      NVARCHAR(100) NOT NULL,
  orden       INT           NOT NULL DEFAULT 1,
  activo      BIT           NOT NULL DEFAULT 1
)
GO

CREATE INDEX IX_vig_cfg_dest_sitio ON vig_config_destinos(idSitio)
GO

-- Asignación "por defecto": qué unidades normalmente van a cada destino,
-- con vigencia para conservar historial de reasignaciones.
CREATE TABLE vig_config_destino_vehiculos (
  idDestinoVehiculo INT IDENTITY(1,1) PRIMARY KEY,
  idDestino         INT  NOT NULL REFERENCES vig_config_destinos(idDestino),
  idVehiculo        INT  NOT NULL REFERENCES vig_config_vehiculos(idVehiculo),
  vigenteDesde      DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
  vigenteHasta      DATE NULL,
  UNIQUE (idDestino, idVehiculo, vigenteDesde)
)
GO

CREATE INDEX IX_vig_cfg_destveh_destino ON vig_config_destino_vehiculos(idDestino)
GO
CREATE INDEX IX_vig_cfg_destveh_vehiculo ON vig_config_destino_vehiculos(idVehiculo)
GO

-- Snapshot real capturado en cada reporte (lo que efectivamente se
-- firma en el PDF) — se prellena desde la asignación vigente al crear
-- el reporte y Vigilancia solo ajusta lo que cambió ese día.
CREATE TABLE vig_ubicacion_reporte_vehiculos (
  idUbicRepVeh   INT IDENTITY(1,1) PRIMARY KEY,
  idUbicacionRep INT NOT NULL REFERENCES vig_ubicacion_reporte(idUbicacionRep),
  idVehiculo     INT NOT NULL REFERENCES vig_config_vehiculos(idVehiculo),
  UNIQUE (idUbicacionRep, idVehiculo)
)
GO

CREATE INDEX IX_vig_ubicrepveh_ubicrep ON vig_ubicacion_reporte_vehiculos(idUbicacionRep)
GO

-- ── Seed: destinos de SUR 121 (antes hardcodeados en JS) ──────
INSERT INTO vig_config_destinos (idSitio, nombre, orden)
SELECT s.idSitio, d.nombre, d.orden
FROM vig_sitios s
CROSS APPLY (VALUES
  ('Alérgenos',1),('Almacén Central',2),('Bajío',3),('CEDIS',4),
  ('IFOSA',5),('Lácteos',6),('No Alérgenos',7),('Norte',8),
  ('Oriente',9),('Pacífico',10),('Sureste',11),('Taller',12)
) AS d(nombre, orden)
WHERE s.clave = 'SUR_121'
GO

-- NOTA: vig_ubicacion_reporte.unidades (NVARCHAR) queda DEPRECADA:
-- se deja de escribir desde el backend a partir de esta migración,
-- pero no se elimina la columna para no romper reportes históricos
-- que ya la tengan poblada como texto plano.
