-- AutograFlow: actualización del 26 de octubre de 2026 (Flow Tools · EX-Trae: «Enviar texto al ordenador»).
-- Solo si instalaste con phpMyAdmin. Con Terminal basta «php artisan migrate --force».
-- Importa este archivo en phpMyAdmin (pestaña «Importar») sobre la base de datos de AutograFlow.
CREATE TABLE IF NOT EXISTS `ex_trae_textos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `texto` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `datos` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `origen` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ex_trae_textos_user_id_id_index` (`user_id`, `id`),
  CONSTRAINT `ex_trae_textos_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Registra la migración una sola vez (se puede importar de nuevo sin duplicarla).
INSERT INTO `migrations` (`migration`, `batch`)
  SELECT '2026_10_26_000001_textos_de_ex_trae', x.b FROM (SELECT COALESCE(MAX(`batch`), 0) + 1 AS b FROM `migrations`) AS x
  WHERE NOT EXISTS (SELECT 1 FROM `migrations` WHERE `migration` = '2026_10_26_000001_textos_de_ex_trae');
