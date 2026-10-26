-- ════════════════════════════════════════════════════════════
-- SIT — Perfil por usuario (excepción sobre el perfil por área)
--
-- El perfil "Administradora SIT" (ver inactivos, cargar, validar,
-- administrar) ya no se da por área: solo JMRAMIREZ lo tiene.
-- sit_usuario_permiso manda sobre sit_area_permiso
-- (ver middleware/sit.middleware.js).
-- El resto de SISTEMAS queda como "Usuario General" (solo consulta) y,
-- además, solo entra al SIT quien tenga asignado el módulo 'sit'.
--
-- Idempotente. Correr en DB_RHFABPSA_DEV y en DB_RHFABPSA, después de
-- 20261014_sit_tablas.sql.
-- ════════════════════════════════════════════════════════════

IF OBJECT_ID('sit_usuario_permiso', 'U') IS NULL
CREATE TABLE sit_usuario_permiso (
  login      VARCHAR(255) NOT NULL PRIMARY KEY REFERENCES sec_users(login),
  idPermiso  INT          NOT NULL REFERENCES sit_permisos_puestos(idPermiso),
  fechaAlta  DATETIME     NOT NULL DEFAULT GETDATE()
)
GO

-- SISTEMAS deja de ser Administradora SIT por área
DELETE ap
FROM sit_area_permiso ap
JOIN sit_permisos_puestos p ON p.idPermiso = ap.idPermiso
WHERE ap.area = 'SISTEMAS' AND p.puesto = N'Administradora SIT';
GO

-- Única Administradora SIT
INSERT INTO sit_usuario_permiso (login, idPermiso)
SELECT u.login, p.idPermiso
FROM sec_users u
JOIN sit_permisos_puestos p ON p.puesto = N'Administradora SIT'
WHERE u.login = 'JMRAMIREZ'
  AND NOT EXISTS (SELECT 1 FROM sit_usuario_permiso x WHERE x.login = u.login);
GO
