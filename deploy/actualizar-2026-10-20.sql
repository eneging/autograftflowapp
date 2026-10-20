-- AutograFlow: actualización del 20 de octubre de 2026 (firma y huella con DNI, certificado de evidencias y «Convertir en Flujo»).
-- Solo si instalaste con phpMyAdmin una versión anterior. Con Terminal basta «php artisan migrate --force».
ALTER TABLE `documentos` ADD `flujo` tinyint(1) NOT NULL DEFAULT 0 AFTER `bloquear_sello`, ADD `certificado_evidencias` tinyint(1) NOT NULL DEFAULT 0 AFTER `flujo`;
ALTER TABLE `firmantes` ADD `pedir_dni` tinyint(1) NOT NULL DEFAULT 0 AFTER `color`, ADD `dni_frente` varchar(255) DEFAULT NULL AFTER `motivo_rechazo`, ADD `dni_reverso` varchar(255) DEFAULT NULL AFTER `dni_frente`, ADD `evidencias` text DEFAULT NULL AFTER `dni_reverso`;
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_20_000001_evidencias_y_flujo', 3);
-- Campos que llena quien prepara el documento y campos calculados por el PDF.
ALTER TABLE `campos` MODIFY `firmante_id` bigint(20) unsigned DEFAULT NULL, MODIFY `tipo` varchar(20) NOT NULL, ADD `nombre_pdf` varchar(200) DEFAULT NULL AFTER `etiqueta`;
ALTER TABLE `documentos` ADD `formulario` longtext DEFAULT NULL AFTER `paginas`;
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_20_000002_campos_del_preparador_y_calculos', 3);
