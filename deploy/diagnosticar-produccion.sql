-- AutograFlow: diagnóstico de solo lectura para phpMyAdmin.
-- Selecciona edwarrej_autograflow y ejecuta todo este archivo en la pestaña SQL.
-- No crea, modifica ni elimina tablas o registros.

SELECT DATABASE() AS base_seleccionada, VERSION() AS version_servidor;

SELECT TABLE_NAME AS tabla
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- Lee las migraciones únicamente si la tabla existe, para admitir importaciones incompletas.
SET @af_diagnostico = IF(
    EXISTS(SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'migrations'),
    'SELECT migration, batch FROM migrations ORDER BY migration',
    'SELECT ''No existe la tabla migrations: la instalación puede estar incompleta.'' AS diagnostico'
);
PREPARE af_consulta FROM @af_diagnostico;
EXECUTE af_consulta;
DEALLOCATE PREPARE af_consulta;
