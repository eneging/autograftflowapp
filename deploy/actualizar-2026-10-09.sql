-- AutograFlow: actualización del 9 de octubre de 2026 (planes v43, equipo Empresarial y bloqueos de firma y sello).
-- Solo si instalaste con phpMyAdmin una versión anterior. Con Terminal basta «php artisan migrate --force».
ALTER TABLE `cuentas` ADD `codigo_equipo` varchar(20) DEFAULT NULL AFTER `logo`, ADD UNIQUE KEY `cuentas_codigo_equipo_unique` (`codigo_equipo`);
ALTER TABLE `documentos` ADD `bloquear_dibujo` tinyint(1) NOT NULL DEFAULT 0 AFTER `es_plantilla`, ADD `bloquear_sello` tinyint(1) NOT NULL DEFAULT 0 AFTER `bloquear_dibujo`;
-- Los planes «basico» y «pro» ya no existen: si alguna cuenta los tenía, pasa al Profesional con la misma fecha de vencimiento.
UPDATE `cuentas` SET `plan` = 'profesional' WHERE `plan` IN ('basico', 'pro');
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_09_000001_equipo_y_bloqueos', 2);
