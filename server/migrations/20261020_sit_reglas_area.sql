-- 20261020_sit_reglas_area.sql
-- Centro de control del SIT: las administradoras asignan el acceso persona
-- por persona, con el rol que decidan (sin importar el área de la persona).
-- Para eso, los roles de trabajo (Control de Calidad, Fraude/Compras =
-- Food Fraud, SGIA, Usuario General) se pueden asignar desde el panel.
-- Los de administración (puedeAdmin = 1) nunca: además, el servidor lo
-- vuelve a validar en cada asignación.
-- Idempotente: se puede correr más de una vez.

UPDATE sit_permisos_puestos
SET asignable = 1
WHERE activo = 1 AND puedeAdmin = 0 AND asignable = 0
  AND puesto IN (N'Control de Calidad', N'Fraude/Compras', N'SGIA', N'Usuario General');
