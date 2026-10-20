-- AutograFlow: actualización del 21 de octubre de 2026 («Entrar sin cuenta» con aceptación de Términos y Condiciones).
-- Solo si instalaste con phpMyAdmin una versión anterior. Con Terminal basta «php artisan migrate --force».
ALTER TABLE `cuentas` ADD `invitado` tinyint(1) NOT NULL DEFAULT 0 AFTER `nombre`, ADD `ip_invitado` varchar(64) DEFAULT NULL AFTER `invitado`, ADD INDEX `cuentas_invitado_ip_invitado_index` (`invitado`, `ip_invitado`);
ALTER TABLE `users` ADD `terminos_aceptados_en` datetime DEFAULT NULL AFTER `password`;
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_21_000001_entrar_sin_cuenta', 4);
