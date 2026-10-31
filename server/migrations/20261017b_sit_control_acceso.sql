-- ════════════════════════════════════════════════════════════
-- SIT — Centro de control documental (control de acceso)
--
-- 1) sit_permisos_puestos (la matriz de roles) gana permisos documentales
--    separados: consultar / descargar / imprimir, y marcas de rol
--    provisional y asignable desde el panel.
-- 2) Roles PROVISIONALES (pendiente la matriz definitiva de Andrea):
--    Administradora documental, Consulta documental, Acceso restringido.
-- 3) sit_usuario_permiso gana estado (ACTIVO / SUSPENDIDO / REVOCADO) y
--    quién / cuándo lo cambió.
-- 4) sit_administradores: únicas cuentas que entran al centro de control.
--    Se administra SOLO por SQL (el panel no puede agregar ni quitar
--    administradoras: así nadie se otorga privilegios a sí mismo).
--
-- Regla de "no dar más de lo que había": los perfiles por área que ya
-- existían conservan la consulta, pero quedan SIN descarga ni impresión
-- hasta que la matriz definitiva diga otra cosa.
--
-- Idempotente. Correr en DB_RHFABPSA_DEV y en DB_RHFABPSA, después de
-- 20261016b_sit_permiso_usuario.sql.
-- ════════════════════════════════════════════════════════════

-- ── 1) Permisos documentales en la matriz de roles ──────────
IF COL_LENGTH('sit_permisos_puestos', 'puedeConsultarDocs') IS NULL
  ALTER TABLE sit_permisos_puestos ADD puedeConsultarDocs BIT NOT NULL CONSTRAINT DF_sit_pp_consultar DEFAULT 0;
IF COL_LENGTH('sit_permisos_puestos', 'puedeDescargar') IS NULL
  ALTER TABLE sit_permisos_puestos ADD puedeDescargar BIT NOT NULL CONSTRAINT DF_sit_pp_descargar DEFAULT 0;
IF COL_LENGTH('sit_permisos_puestos', 'puedeImprimir') IS NULL
  ALTER TABLE sit_permisos_puestos ADD puedeImprimir BIT NOT NULL CONSTRAINT DF_sit_pp_imprimir DEFAULT 0;
IF COL_LENGTH('sit_permisos_puestos', 'esProvisional') IS NULL
  ALTER TABLE sit_permisos_puestos ADD esProvisional BIT NOT NULL CONSTRAINT DF_sit_pp_provisional DEFAULT 0;
-- asignable = se puede asignar desde el centro de control
IF COL_LENGTH('sit_permisos_puestos', 'asignable') IS NULL
  ALTER TABLE sit_permisos_puestos ADD asignable BIT NOT NULL CONSTRAINT DF_sit_pp_asignable DEFAULT 0;
IF COL_LENGTH('sit_permisos_puestos', 'descripcion') IS NULL
  ALTER TABLE sit_permisos_puestos ADD descripcion NVARCHAR(300) NULL;
GO

-- Perfiles existentes: conservan la consulta (ya la tenían de hecho);
-- descarga/impresión solo para el perfil administrador que ya existía.
UPDATE sit_permisos_puestos SET puedeConsultarDocs = 1
WHERE puesto IN (N'Administradora SIT', N'Control de Calidad', N'Fraude/Compras', N'SGIA', N'Usuario General')
  AND puedeConsultarDocs = 0 AND puedeDescargar = 0 AND puedeImprimir = 0;
UPDATE sit_permisos_puestos SET puedeDescargar = 1, puedeImprimir = 1
WHERE puesto = N'Administradora SIT';
GO

-- ── 2) Roles provisionales ──────────────────────────────────
MERGE sit_permisos_puestos AS t
USING (VALUES
  -- puesto, verActivos, verInactivos, cargar, validar, admin, IAFSA, FDNC, consultar, descargar, imprimir, asignable, descripcion
  (N'Administradora documental', 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
   N'PROVISIONAL. Responsables de la documentación: consulta, descarga e impresión. El acceso al centro de control lo da sit_administradores.'),
  (N'Consulta documental',       1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1,
   N'PROVISIONAL. Consulta en línea de documentos, sin descarga ni impresión.'),
  (N'Acceso restringido',        1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1,
   N'PROVISIONAL. Entra al módulo pero no abre documentos.')
) AS s(puesto, verAct, verInact, cargar, validar, adm, iafsa, fdnc, consultar, descargar, imprimir, asignable, descripcion)
  ON t.puesto = s.puesto
WHEN NOT MATCHED THEN
  INSERT (puesto, puedeVerActivos, puedeVerInactivos, puedeCargarDoc, puedeValidar, puedeAdmin, accesoIAFSA, accesoDFNC,
          puedeConsultarDocs, puedeDescargar, puedeImprimir, esProvisional, asignable, descripcion, activo)
  VALUES (s.puesto, s.verAct, s.verInact, s.cargar, s.validar, s.adm, s.iafsa, s.fdnc,
          s.consultar, s.descargar, s.imprimir, 1, s.asignable, s.descripcion, 1);
GO

-- ── 3) Estado y trazabilidad del acceso por usuario ─────────
IF COL_LENGTH('sit_usuario_permiso', 'estado') IS NULL
  ALTER TABLE sit_usuario_permiso ADD estado VARCHAR(12) NOT NULL CONSTRAINT DF_sit_up_estado DEFAULT 'ACTIVO';
IF COL_LENGTH('sit_usuario_permiso', 'modificadoPor') IS NULL
  ALTER TABLE sit_usuario_permiso ADD modificadoPor VARCHAR(255) NULL;
IF COL_LENGTH('sit_usuario_permiso', 'fechaModificacion') IS NULL
  ALTER TABLE sit_usuario_permiso ADD fechaModificacion DATETIME NULL;
IF COL_LENGTH('sit_usuario_permiso', 'motivo') IS NULL
  ALTER TABLE sit_usuario_permiso ADD motivo NVARCHAR(300) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_sit_usuario_permiso_estado')
  ALTER TABLE sit_usuario_permiso
    ADD CONSTRAINT CK_sit_usuario_permiso_estado CHECK (estado IN ('ACTIVO', 'SUSPENDIDO', 'REVOCADO'));
GO

-- ── 4) Administradoras del centro de control ────────────────
IF OBJECT_ID('sit_administradores', 'U') IS NULL
CREATE TABLE sit_administradores (
  login      VARCHAR(255)  NOT NULL PRIMARY KEY REFERENCES sec_users(login),
  activo     BIT           NOT NULL DEFAULT 1,
  fechaAlta  DATETIME      NOT NULL DEFAULT GETDATE(),
  nota       NVARCHAR(200) NULL
)
GO

-- Andrea Gaona Vera (AGAONA) y Monica Ramírez (MRAMIREZ): cuentas reales
-- de sec_users. Además reciben el rol "Administradora documental" y el
-- módulo 'sit' para poder entrar.
INSERT INTO sit_administradores (login, nota)
SELECT u.login, N'Responsable de la documentación técnica'
FROM sec_users u
WHERE u.login IN ('AGAONA', 'MRAMIREZ')
  AND NOT EXISTS (SELECT 1 FROM sit_administradores a WHERE a.login = u.login);
GO

MERGE sit_usuario_permiso AS t
USING (
  SELECT a.login, p.idPermiso
  FROM sit_administradores a
  JOIN sit_permisos_puestos p ON p.puesto = N'Administradora documental'
) AS s ON t.login = s.login
WHEN MATCHED THEN UPDATE SET idPermiso = s.idPermiso, estado = 'ACTIVO', modificadoPor = 'MIGRACION', fechaModificacion = GETDATE()
WHEN NOT MATCHED THEN INSERT (login, idPermiso, estado, modificadoPor, fechaModificacion) VALUES (s.login, s.idPermiso, 'ACTIVO', 'MIGRACION', GETDATE());
GO

INSERT INTO portal_usuario_modulos (login, idModulo)
SELECT a.login, m.idModulo
FROM sit_administradores a
JOIN portal_modulos m ON m.clave = 'sit'
WHERE NOT EXISTS (SELECT 1 FROM portal_usuario_modulos x WHERE x.login = a.login AND x.idModulo = m.idModulo);
GO
