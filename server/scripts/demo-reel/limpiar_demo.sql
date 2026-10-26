-- limpiar_demo.sql — borra los datos ficticios del reel (solo DEV).
IF DB_NAME() <> 'DB_RHFABPSA_DEV' THROW 50000, 'Solo en DB_RHFABPSA_DEV', 1;
DELETE FROM solicitudTI WHERE idUsuario LIKE 'DEMO%';
DELETE FROM portal_usuario_modulos WHERE login LIKE 'DEMO%';
DELETE FROM sec_users WHERE login IN ('DEMOANA','DEMOCARLOS','DEMOLUCIA','DEMOTEC');
