-- AutograFlow: estructura de la base de datos (para importar en phpMyAdmin si el hosting no tiene terminal).
-- Importa este archivo en una base vacía. Equivale a «php artisan migrate».
SET NAMES utf8mb4;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `cache` (
  `key` varchar(255) NOT NULL,
  `value` mediumtext NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `cache_locks` (
  `key` varchar(255) NOT NULL,
  `owner` varchar(255) NOT NULL,
  `expiration` int(11) NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `campos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `documento_id` bigint(20) unsigned NOT NULL,
  `firmante_id` bigint(20) unsigned DEFAULT NULL,
  `tipo` varchar(20) NOT NULL,
  `pagina` smallint(6) NOT NULL,
  `x` double NOT NULL,
  `y` double NOT NULL,
  `w` double NOT NULL,
  `h` double NOT NULL,
  `etiqueta` varchar(120) NOT NULL DEFAULT '',
  `nombre_pdf` varchar(200) DEFAULT NULL,
  `obligatorio` tinyint(1) NOT NULL DEFAULT 1,
  `valor` text DEFAULT NULL,
  `imagen` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `campos_documento_id_foreign` (`documento_id`),
  KEY `campos_firmante_id_foreign` (`firmante_id`),
  CONSTRAINT `campos_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `campos_firmante_id_foreign` FOREIGN KEY (`firmante_id`) REFERENCES `firmantes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `consumos` (
  `documento_id` bigint(20) unsigned NOT NULL,
  `cuenta_id` bigint(20) unsigned NOT NULL,
  `origen` enum('plan','credito') NOT NULL,
  `creado_en` datetime NOT NULL,
  PRIMARY KEY (`documento_id`),
  KEY `consumos_cuenta_id_creado_en_index` (`cuenta_id`,`creado_en`),
  CONSTRAINT `consumos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `cuentas` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(120) NOT NULL,
  `invitado` tinyint(1) NOT NULL DEFAULT 0,
  `ip_invitado` varchar(64) DEFAULT NULL,
  `plan` varchar(30) NOT NULL DEFAULT 'gratis',
  `plan_vence` datetime DEFAULT NULL,
  `creditos` int(11) NOT NULL DEFAULT 0,
  `logo` varchar(255) DEFAULT NULL,
  `codigo_equipo` varchar(20) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cuentas_codigo_equipo_unique` (`codigo_equipo`),
  KEY `cuentas_invitado_ip_invitado_index` (`invitado`,`ip_invitado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `documentos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `cuenta_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `nombre` varchar(160) NOT NULL,
  `estado` enum('borrador','en_firma','completado','rechazado','anulado') NOT NULL DEFAULT 'borrador',
  `es_plantilla` tinyint(1) NOT NULL DEFAULT 0,
  `bloquear_dibujo` tinyint(1) NOT NULL DEFAULT 0,
  `bloquear_sello` tinyint(1) NOT NULL DEFAULT 0,
  `flujo` tinyint(1) NOT NULL DEFAULT 0,
  `certificado_evidencias` tinyint(1) NOT NULL DEFAULT 0,
  `orden` enum('secuencial','paralelo') NOT NULL DEFAULT 'secuencial',
  `mensaje` varchar(500) NOT NULL DEFAULT '',
  `archivo` varchar(255) NOT NULL,
  `sha256_original` char(64) NOT NULL,
  `paginas` text NOT NULL,
  `formulario` longtext DEFAULT NULL,
  `archivo_final` varchar(255) DEFAULT NULL,
  `sha256_final` char(64) DEFAULT NULL,
  `enviado_en` datetime DEFAULT NULL,
  `completado_en` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `documentos_user_id_foreign` (`user_id`),
  KEY `documentos_cuenta_id_created_at_index` (`cuenta_id`,`created_at`),
  KEY `documentos_sha256_original_index` (`sha256_original`),
  KEY `documentos_sha256_final_index` (`sha256_final`),
  CONSTRAINT `documentos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `documentos_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `eventos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `documento_id` bigint(20) unsigned NOT NULL,
  `firmante_id` bigint(20) unsigned DEFAULT NULL,
  `tipo` varchar(40) NOT NULL,
  `detalle` varchar(500) NOT NULL DEFAULT '',
  `ip` varchar(64) DEFAULT NULL,
  `agente` varchar(300) DEFAULT NULL,
  `creado_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `eventos_documento_id_foreign` (`documento_id`),
  KEY `eventos_firmante_id_foreign` (`firmante_id`),
  CONSTRAINT `eventos_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `eventos_firmante_id_foreign` FOREIGN KEY (`firmante_id`) REFERENCES `firmantes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `failed_jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) NOT NULL,
  `connection` text NOT NULL,
  `queue` text NOT NULL,
  `payload` longtext NOT NULL,
  `exception` longtext NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `firmantes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `documento_id` bigint(20) unsigned NOT NULL,
  `orden` smallint(6) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `telefono` varchar(30) NOT NULL DEFAULT '',
  `email` varchar(160) NOT NULL DEFAULT '',
  `color` char(7) NOT NULL,
  `pedir_dni` tinyint(1) NOT NULL DEFAULT 0,
  `token` char(32) DEFAULT NULL,
  `estado` enum('pendiente','firmado','rechazado') NOT NULL DEFAULT 'pendiente',
  `abierto_en` datetime DEFAULT NULL,
  `firmado_en` datetime DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `agente` varchar(300) DEFAULT NULL,
  `motivo_rechazo` varchar(500) DEFAULT NULL,
  `dni_frente` varchar(255) DEFAULT NULL,
  `dni_reverso` varchar(255) DEFAULT NULL,
  `evidencias` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `firmantes_token_unique` (`token`),
  KEY `firmantes_documento_id_orden_index` (`documento_id`,`orden`),
  CONSTRAINT `firmantes_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `job_batches` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_jobs` int(11) NOT NULL,
  `pending_jobs` int(11) NOT NULL,
  `failed_jobs` int(11) NOT NULL,
  `failed_job_ids` longtext NOT NULL,
  `options` mediumtext DEFAULT NULL,
  `cancelled_at` int(11) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  `finished_at` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) NOT NULL,
  `payload` longtext NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL,
  `reserved_at` int(10) unsigned DEFAULT NULL,
  `available_at` int(10) unsigned NOT NULL,
  `created_at` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `pagos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `cuenta_id` bigint(20) unsigned NOT NULL,
  `user_id` bigint(20) unsigned NOT NULL,
  `producto` varchar(40) NOT NULL,
  `titulo` varchar(160) NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `moneda` char(3) NOT NULL,
  `estado` enum('pendiente','aprobado','rechazado','cancelado') NOT NULL DEFAULT 'pendiente',
  `medio` varchar(20) NOT NULL DEFAULT 'mercadopago',
  `mp_preferencia` varchar(80) DEFAULT NULL,
  `mp_pago_id` varchar(40) DEFAULT NULL,
  `aplicado_en` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pagos_cuenta_id_foreign` (`cuenta_id`),
  KEY `pagos_user_id_foreign` (`user_id`),
  CONSTRAINT `pagos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pagos_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` varchar(255) NOT NULL,
  `user_id` bigint(20) unsigned DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` longtext NOT NULL,
  `last_activity` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `solicitudes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `numero_factura` varchar(20) NOT NULL,
  `token_solicitante` char(32) NOT NULL,
  `token_aprobador` char(32) NOT NULL,
  `estado` enum('pendiente','aprobada','rechazada') NOT NULL DEFAULT 'pendiente',
  `nombre` varchar(120) NOT NULL,
  `estaca` varchar(120) NOT NULL,
  `barrio` varchar(120) NOT NULL,
  `telefono` varchar(30) NOT NULL,
  `total_centavos` bigint(20) NOT NULL,
  `datos` longtext NOT NULL,
  `firma_solicitante` varchar(255) NOT NULL,
  `firmado_en` datetime NOT NULL,
  `aprobador_nombre` varchar(120) DEFAULT NULL,
  `firma_aprobador` varchar(255) DEFAULT NULL,
  `decidido_en` datetime DEFAULT NULL,
  `motivo_rechazo` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `solicitudes_numero_factura_unique` (`numero_factura`),
  UNIQUE KEY `solicitudes_token_solicitante_unique` (`token_solicitante`),
  UNIQUE KEY `solicitudes_token_aprobador_unique` (`token_aprobador`),
  KEY `solicitudes_estado_created_at_index` (`estado`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `cuenta_id` bigint(20) unsigned DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `terminos_aceptados_en` datetime DEFAULT NULL,
  `remember_token` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `users_cuenta_id_foreign` (`cuenta_id`),
  CONSTRAINT `users_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000001_create_cache_table',1),(3,'0001_01_01_000002_create_jobs_table',1),(4,'2026_10_07_000001_crear_tablas_autograflow',1),(5,'2026_10_09_000001_equipo_y_bloqueos',2),(6,'2026_10_20_000001_evidencias_y_flujo',3),(7,'2026_10_20_000002_campos_del_preparador_y_calculos',3),(8,'2026_10_21_000001_entrar_sin_cuenta',4);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

