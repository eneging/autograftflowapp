-- AutograFlow - instalación nueva de producción, 22 de octubre de 2026.
-- Importar SOLO en una base VACÍA de MySQL/MariaDB seleccionada en phpMyAdmin.
-- Incluye referidos, Libro de Reclamaciones y guía de introducción.
-- Sin usuarios, contraseñas, documentos, reclamos, pagos ni sesiones locales.
-- No usar para actualizar una base con datos: ejecutar php artisan migrate --force.

SET NAMES utf8mb4;
SET @AF_OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `cache` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cache_locks` (
  `key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiration` int NOT NULL,
  PRIMARY KEY (`key`),
  KEY `cache_locks_expiration_index` (`expiration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `campos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `documento_id` bigint unsigned NOT NULL,
  `firmante_id` bigint unsigned DEFAULT NULL,
  `tipo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pagina` smallint NOT NULL,
  `x` double NOT NULL,
  `y` double NOT NULL,
  `w` double NOT NULL,
  `h` double NOT NULL,
  `etiqueta` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `nombre_pdf` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `obligatorio` tinyint(1) NOT NULL DEFAULT '1',
  `bloqueado` tinyint(1) NOT NULL DEFAULT '0',
  `libre` tinyint(1) NOT NULL DEFAULT '0',
  `valor` text COLLATE utf8mb4_unicode_ci,
  `imagen` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `campos_documento_id_foreign` (`documento_id`),
  KEY `campos_firmante_id_foreign` (`firmante_id`),
  CONSTRAINT `campos_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `campos_firmante_id_foreign` FOREIGN KEY (`firmante_id`) REFERENCES `firmantes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `consumos` (
  `documento_id` bigint unsigned NOT NULL,
  `cuenta_id` bigint unsigned NOT NULL,
  `origen` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `creado_en` datetime NOT NULL,
  `referido_bono_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`documento_id`),
  KEY `consumos_cuenta_id_creado_en_index` (`cuenta_id`,`creado_en`),
  KEY `consumos_referido_bono_id_foreign` (`referido_bono_id`),
  CONSTRAINT `consumos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `consumos_referido_bono_id_foreign` FOREIGN KEY (`referido_bono_id`) REFERENCES `referidos` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `contactos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cuenta_id` bigint unsigned NOT NULL,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefono` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `categoria` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `contactos_cuenta_id_nombre_index` (`cuenta_id`,`nombre`),
  CONSTRAINT `contactos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `cuentas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invitado` tinyint(1) NOT NULL DEFAULT '0',
  `plan` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gratis',
  `plan_vence` datetime DEFAULT NULL,
  `creditos` int NOT NULL DEFAULT '0',
  `logo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `codigo_equipo` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `codigo_referido` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cuentas_codigo_equipo_unique` (`codigo_equipo`),
  UNIQUE KEY `cuentas_codigo_referido_unique` (`codigo_referido`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `documentos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cuenta_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `nombre` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` enum('borrador','en_firma','completado','rechazado','anulado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'borrador',
  `es_plantilla` tinyint(1) NOT NULL DEFAULT '0',
  `plantilla_id` bigint unsigned DEFAULT NULL,
  `bloquear_dibujo` tinyint(1) NOT NULL DEFAULT '0',
  `bloquear_sello` tinyint(1) NOT NULL DEFAULT '0',
  `flujo` tinyint(1) NOT NULL DEFAULT '0',
  `certificado_evidencias` tinyint(1) NOT NULL DEFAULT '0',
  `idioma` varchar(2) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'es',
  `orden` enum('secuencial','paralelo') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'secuencial',
  `mensaje` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `archivo` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sha256_original` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `paginas` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `formulario` longtext COLLATE utf8mb4_unicode_ci,
  `archivo_final` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha256_final` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `enviado_en` datetime DEFAULT NULL,
  `completado_en` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `documentos_user_id_foreign` (`user_id`),
  KEY `documentos_cuenta_id_created_at_index` (`cuenta_id`,`created_at`),
  KEY `documentos_sha256_original_index` (`sha256_original`),
  KEY `documentos_sha256_final_index` (`sha256_final`),
  KEY `documentos_plantilla_id_foreign` (`plantilla_id`),
  CONSTRAINT `documentos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `documentos_plantilla_id_foreign` FOREIGN KEY (`plantilla_id`) REFERENCES `documentos` (`id`) ON DELETE SET NULL,
  CONSTRAINT `documentos_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `eventos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `documento_id` bigint unsigned NOT NULL,
  `firmante_id` bigint unsigned DEFAULT NULL,
  `tipo` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalle` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ip` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `agente` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `eventos_documento_id_foreign` (`documento_id`),
  KEY `eventos_firmante_id_foreign` (`firmante_id`),
  CONSTRAINT `eventos_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `eventos_firmante_id_foreign` FOREIGN KEY (`firmante_id`) REFERENCES `firmantes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `failed_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `firmantes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `documento_id` bigint unsigned NOT NULL,
  `orden` smallint NOT NULL,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefono` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pedir_dni` tinyint(1) NOT NULL DEFAULT '0',
  `modo_texto` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'asignados',
  `token` char(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estado` enum('pendiente','firmado','rechazado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `abierto_en` datetime DEFAULT NULL,
  `firmado_en` datetime DEFAULT NULL,
  `ip` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `agente` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `motivo_rechazo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dni_frente` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dni_reverso` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidencias` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `firmantes_token_unique` (`token`),
  KEY `firmantes_documento_id_orden_index` (`documento_id`,`orden`),
  CONSTRAINT `firmantes_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `job_batches` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_jobs` int NOT NULL,
  `pending_jobs` int NOT NULL,
  `failed_jobs` int NOT NULL,
  `failed_job_ids` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `options` mediumtext COLLATE utf8mb4_unicode_ci,
  `cancelled_at` int DEFAULT NULL,
  `created_at` int NOT NULL,
  `finished_at` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` tinyint unsigned NOT NULL,
  `reserved_at` int unsigned DEFAULT NULL,
  `available_at` int unsigned NOT NULL,
  `created_at` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `jobs_queue_index` (`queue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `pagos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cuenta_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `producto` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `titulo` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `moneda` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` enum('pendiente','aprobado','rechazado','cancelado') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `medio` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mercadopago',
  `mp_preferencia` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mp_pago_id` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aplicado_en` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `pagos_cuenta_id_foreign` (`cuenta_id`),
  KEY `pagos_user_id_foreign` (`user_id`),
  CONSTRAINT `pagos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pagos_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reclamacion_correos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `reclamacion_id` bigint unsigned NOT NULL,
  `tipo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `destinatario` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `intentos` int unsigned NOT NULL DEFAULT '0',
  `enviado_en` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reclamacion_correos_reclamacion_id_tipo_unique` (`reclamacion_id`,`tipo`),
  KEY `reclamacion_correos_estado_index` (`estado`),
  CONSTRAINT `reclamacion_correos_reclamacion_id_foreign` FOREIGN KEY (`reclamacion_id`) REFERENCES `reclamaciones` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reclamacion_secuencia` (
  `id` int unsigned NOT NULL,
  `valor` bigint unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reclamaciones` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `numero` bigint unsigned NOT NULL,
  `solicitud_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entrada_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `datos` json NOT NULL,
  `proveedor` json NOT NULL,
  `registrado_en` datetime NOT NULL,
  `vence_el` date NOT NULL,
  `respuesta` text COLLATE utf8mb4_unicode_ci,
  `respuesta_redactada_en` datetime DEFAULT NULL,
  `respondido_en` datetime DEFAULT NULL,
  `responsable` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `constancia_postal` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reclamaciones_numero_unique` (`numero`),
  UNIQUE KEY `reclamaciones_solicitud_id_unique` (`solicitud_id`),
  UNIQUE KEY `reclamaciones_token_hash_unique` (`token_hash`),
  KEY `reclamaciones_vence_el_index` (`vence_el`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `referidos` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `referidor_id` bigint unsigned NOT NULL,
  `referido_id` bigint unsigned NOT NULL,
  `reglas` json NOT NULL,
  `codigo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pago_id` bigint unsigned DEFAULT NULL,
  `estado` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'registrado',
  `documentos` int unsigned NOT NULL DEFAULT '0',
  `restantes` int unsigned NOT NULL DEFAULT '0',
  `liberar_en` datetime DEFAULT NULL,
  `acreditado_en` datetime DEFAULT NULL,
  `vence_en` datetime DEFAULT NULL,
  `motivo` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `referidos_referido_id_unique` (`referido_id`),
  UNIQUE KEY `referidos_pago_id_unique` (`pago_id`),
  KEY `referidos_referidor_id_estado_vence_en_index` (`referidor_id`,`estado`,`vence_en`),
  KEY `referidos_liberar_en_index` (`liberar_en`),
  CONSTRAINT `referidos_pago_id_foreign` FOREIGN KEY (`pago_id`) REFERENCES `pagos` (`id`),
  CONSTRAINT `referidos_referido_id_foreign` FOREIGN KEY (`referido_id`) REFERENCES `cuentas` (`id`),
  CONSTRAINT `referidos_referidor_id_foreign` FOREIGN KEY (`referidor_id`) REFERENCES `cuentas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `sessions_user_id_index` (`user_id`),
  KEY `sessions_last_activity_index` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `solicitudes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `numero_factura` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_solicitante` char(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token_aprobador` char(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` enum('pendiente','aprobada','rechazada') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estaca` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `barrio` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefono` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_centavos` bigint NOT NULL,
  `datos` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `firma_solicitante` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `firmado_en` datetime NOT NULL,
  `aprobador_nombre` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firma_aprobador` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decidido_en` datetime DEFAULT NULL,
  `motivo_rechazo` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `solicitudes_numero_factura_unique` (`numero_factura`),
  UNIQUE KEY `solicitudes_token_solicitante_unique` (`token_solicitante`),
  UNIQUE KEY `solicitudes_token_aprobador_unique` (`token_aprobador`),
  KEY `solicitudes_estado_created_at_index` (`estado`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cuenta_id` bigint unsigned DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `terminos_aceptados_en` datetime DEFAULT NULL,
  `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `guia_estado` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `guia_paso` tinyint unsigned NOT NULL DEFAULT '1',
  `guia_documento_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  KEY `users_cuenta_id_foreign` (`cuenta_id`),
  CONSTRAINT `users_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro técnico de migraciones: evita volver a ejecutar cambios ya incluidos.
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_000000_create_users_table', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_000001_create_cache_table', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_000002_create_jobs_table', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_07_000001_crear_tablas_autograflow', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_09_000001_equipo_y_bloqueos', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_20_000001_evidencias_y_flujo', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_20_000002_campos_del_preparador_y_calculos', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_20_000003_acceso_sin_cuenta', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_20_000004_texto_del_firmante_y_campos_bloqueados', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_21_000001_campos_de_datos_opcionales', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_21_000002_contactos_del_directorio', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_21_000003_idioma_del_firmante', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_22_000001_envios_de_plantilla_y_categorias', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_22_000002_libro_de_reclamaciones', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_22_000003_programa_de_referidos', 1);
INSERT INTO `migrations` (`migration`, `batch`) VALUES ('2026_10_22_000004_guia_de_introduccion', 1);

-- Contador inicial obligatorio para la numeración del Libro de Reclamaciones.
INSERT INTO `reclamacion_secuencia` (`id`, `valor`) VALUES (1, 0);

SET FOREIGN_KEY_CHECKS = @AF_OLD_FK_CHECKS;
