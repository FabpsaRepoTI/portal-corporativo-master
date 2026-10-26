-- cargar_demo.sql — Datos FICTICIOS para grabar el reel de la Mesa de Ayuda.
-- SOLO EN DEV. Usuarios con login DEMO* (sin contraseña utilizable) y
-- solicitudes de esos usuarios (el folio lo asigna la base). Se borra todo con limpiar_demo.sql.
IF DB_NAME() <> 'DB_RHFABPSA_DEV' THROW 50000, 'Solo se carga en DB_RHFABPSA_DEV', 1;

-- Usuarios ficticios (contraseña imposible: nadie entra con ellos)
MERGE sec_users AS t
USING (VALUES
  ('DEMOANA',   'Ana Torres Demo',     'ana.demo@ejemplo.com',    'COMPRAS',      'CORPORATIVO'),
  ('DEMOCARLOS','Carlos Méndez Demo',  'carlos.demo@ejemplo.com', 'PRODUCCION',   'PLANTA'),
  ('DEMOLUCIA', 'Lucía Herrera Demo',  'lucia.demo@ejemplo.com',  'CALIDAD',      'PLANTA'),
  ('DEMOTEC',   'Técnico de Soporte',  'soporte.demo@ejemplo.com','SISTEMAS',     'CORPORATIVO')
) AS s (login, name, email, area, sitio)
ON t.login = s.login
WHEN NOT MATCHED THEN
  INSERT (login, pswd, name, email, active, priv_admin, role, sitio, area)
  VALUES (s.login, CONVERT(varchar(64), NEWID()) + '!demo-sin-acceso', s.name, s.email, 'Y', 'N', 'user', s.sitio, s.area);

-- Solicitudes ficticias en varios estados (idServicio del catálogo real)
DELETE FROM solicitudTI WHERE idUsuario LIKE 'DEMO%';
INSERT INTO solicitudTI (idServicio, idPrioridad, titulo, descripcion, idUsuario, nombreUsuario, areaUsuario, sitioUsuario,
                         idEstatus, fechaCreacion, fechaActualizacion, fechaResolucion, tecnicoAsignado, nombreTecnico)
VALUES
 (11, 3, N'La impresora del área no imprime',          N'Sale error de atasco aunque no hay papel atorado.', 'DEMOANA',    N'Ana Torres Demo',    N'COMPRAS',    N'CORPORATIVO', 2, DATEADD(HOUR,-3,GETDATE()),  DATEADD(HOUR,-1,GETDATE()), NULL, 'DEMOTEC', N'Técnico de Soporte'),
 ( 8, 2, N'No llegan correos externos',                N'Desde ayer no recibo correos de proveedores.',     'DEMOCARLOS', N'Carlos Méndez Demo', N'PRODUCCION', N'PLANTA',      1, DATEADD(MINUTE,-40,GETDATE()),NULL,                        NULL, NULL, NULL),
 (17, 4, N'ERP no deja cerrar pedidos',                N'Mensaje de error al timbrar la factura.',          'DEMOLUCIA',  N'Lucía Herrera Demo', N'CALIDAD',    N'PLANTA',      7, DATEADD(HOUR,-5,GETDATE()),  DATEADD(HOUR,-2,GETDATE()), NULL, 'DEMOTEC', N'Técnico de Soporte'),
 (10, 2, N'Internet lento en almacén',                 N'Las terminales tardan en cargar.',                 'DEMOCARLOS', N'Carlos Méndez Demo', N'PRODUCCION', N'PLANTA',      3, DATEADD(DAY,-1,GETDATE()),   DATEADD(HOUR,-20,GETDATE()),DATEADD(HOUR,-20,GETDATE()), 'DEMOTEC', N'Técnico de Soporte'),
 ( 4, 1, N'Alta de usuario para nuevo ingreso',        N'Ingresa el lunes al área de Compras.',             'DEMOANA',    N'Ana Torres Demo',    N'COMPRAS',    N'CORPORATIVO', 4, DATEADD(DAY,-3,GETDATE()),   DATEADD(DAY,-2,GETDATE()),  DATEADD(DAY,-2,GETDATE()),   'DEMOTEC', N'Técnico de Soporte'),
 ( 7, 2, N'Laptop no enciende',                        N'Se apagó y ya no prende.',                         'DEMOLUCIA',  N'Lucía Herrera Demo', N'CALIDAD',    N'PLANTA',      6, DATEADD(DAY,-1,GETDATE()),   DATEADD(HOUR,-6,GETDATE()), NULL, 'DEMOTEC', N'Técnico de Soporte'),
 (15, 1, N'Configurar Teams en celular',               N'Necesito Teams en mi teléfono de la empresa.',     'DEMOANA',    N'Ana Torres Demo',    N'COMPRAS',    N'CORPORATIVO', 3, DATEADD(DAY,-2,GETDATE()),   DATEADD(DAY,-2,GETDATE()),  DATEADD(DAY,-2,GETDATE()),   'DEMOTEC', N'Técnico de Soporte'),
 (16, 3, N'Cámara de acceso principal sin señal',      N'El monitor de caseta muestra "sin video".',        'DEMOCARLOS', N'Carlos Méndez Demo', N'PRODUCCION', N'PLANTA',      8, DATEADD(HOUR,-8,GETDATE()),  DATEADD(HOUR,-4,GETDATE()), NULL, 'DEMOTEC', N'Técnico de Soporte');
