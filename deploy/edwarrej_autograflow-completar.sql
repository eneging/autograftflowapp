-- AutograFlow SQL Dump
-- Formato compatible con el archivo exportado por phpMyAdmin 5.2.3.
-- Base de datos: `edwarrej_autograflow`
-- Fecha: 2026-10-22
-- COMPLETAR la base que contiene SOLO cache y cache_locks, según el volcado recibido.
-- No crea ni modifica esas dos tablas. No elimina registros.
-- Sin datos de usuarios, documentos, firmas, pagos ni reclamaciones.

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

USE `edwarrej_autograflow`;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `campos`

CREATE TABLE `campos` (
  `id` bigint unsigned NOT NULL,
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
  `imagen` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `consumos`

CREATE TABLE `consumos` (
  `documento_id` bigint unsigned NOT NULL,
  `cuenta_id` bigint unsigned NOT NULL,
  `origen` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `creado_en` datetime NOT NULL,
  `referido_bono_id` bigint unsigned DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `contactos`

CREATE TABLE `contactos` (
  `id` bigint unsigned NOT NULL,
  `cuenta_id` bigint unsigned NOT NULL,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `telefono` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `email` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `categoria` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `cuentas`

CREATE TABLE `cuentas` (
  `id` bigint unsigned NOT NULL,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invitado` tinyint(1) NOT NULL DEFAULT '0',
  `plan` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gratis',
  `plan_vence` datetime DEFAULT NULL,
  `creditos` int NOT NULL DEFAULT '0',
  `logo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `codigo_equipo` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `codigo_referido` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `documentos`

CREATE TABLE `documentos` (
  `id` bigint unsigned NOT NULL,
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
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `eventos`

CREATE TABLE `eventos` (
  `id` bigint unsigned NOT NULL,
  `documento_id` bigint unsigned NOT NULL,
  `firmante_id` bigint unsigned DEFAULT NULL,
  `tipo` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `detalle` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ip` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `agente` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `creado_en` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `failed_jobs`

CREATE TABLE `failed_jobs` (
  `id` bigint unsigned NOT NULL,
  `uuid` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connection` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `queue` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `exception` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `firmantes`

CREATE TABLE `firmantes` (
  `id` bigint unsigned NOT NULL,
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
  `evidencias` text COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `job_batches`

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
  `finished_at` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `jobs`

CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL,
  `queue` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempts` tinyint unsigned NOT NULL,
  `reserved_at` int unsigned DEFAULT NULL,
  `available_at` int unsigned NOT NULL,
  `created_at` int unsigned NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `migrations`

CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL,
  `migration` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `pagos`

CREATE TABLE `pagos` (
  `id` bigint unsigned NOT NULL,
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
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `password_reset_tokens`

CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `reclamacion_correos`

CREATE TABLE `reclamacion_correos` (
  `id` bigint unsigned NOT NULL,
  `reclamacion_id` bigint unsigned NOT NULL,
  `tipo` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `destinatario` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `estado` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pendiente',
  `intentos` int unsigned NOT NULL DEFAULT '0',
  `enviado_en` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `reclamacion_secuencia`

CREATE TABLE `reclamacion_secuencia` (
  `id` int unsigned NOT NULL,
  `valor` bigint unsigned NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `reclamaciones`

CREATE TABLE `reclamaciones` (
  `id` bigint unsigned NOT NULL,
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
  `constancia_postal` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `referidos`

CREATE TABLE `referidos` (
  `id` bigint unsigned NOT NULL,
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
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `sessions`

CREATE TABLE `sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_activity` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `solicitudes`

CREATE TABLE `solicitudes` (
  `id` bigint unsigned NOT NULL,
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
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Estructura de tabla para la tabla `users`

CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL,
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
  `guia_documento_id` bigint unsigned DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos técnicos iniciales
-- No se incluyen registros de desarrollo.

INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (1, '0001_01_01_000000_create_users_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (2, '0001_01_01_000001_create_cache_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (3, '0001_01_01_000002_create_jobs_table', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (4, '2026_10_07_000001_crear_tablas_autograflow', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (5, '2026_10_09_000001_equipo_y_bloqueos', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (6, '2026_10_20_000001_evidencias_y_flujo', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (7, '2026_10_20_000002_campos_del_preparador_y_calculos', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (8, '2026_10_20_000003_acceso_sin_cuenta', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (9, '2026_10_20_000004_texto_del_firmante_y_campos_bloqueados', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (10, '2026_10_21_000001_campos_de_datos_opcionales', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (11, '2026_10_21_000002_contactos_del_directorio', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (12, '2026_10_21_000003_idioma_del_firmante', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (13, '2026_10_22_000001_envios_de_plantilla_y_categorias', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (14, '2026_10_22_000002_libro_de_reclamaciones', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (15, '2026_10_22_000003_programa_de_referidos', 1);
INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES (16, '2026_10_22_000004_guia_de_introduccion', 1);

INSERT INTO `reclamacion_secuencia` (`id`, `valor`) VALUES (1, 0);

-- Índices para tablas volcadas

-- Índices de la tabla `campos`
ALTER TABLE `campos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `campos_documento_id_foreign` (`documento_id`),
  ADD KEY `campos_firmante_id_foreign` (`firmante_id`);

-- Índices de la tabla `consumos`
ALTER TABLE `consumos`
  ADD PRIMARY KEY (`documento_id`),
  ADD KEY `consumos_cuenta_id_creado_en_index` (`cuenta_id`,`creado_en`),
  ADD KEY `consumos_referido_bono_id_foreign` (`referido_bono_id`);

-- Índices de la tabla `contactos`
ALTER TABLE `contactos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `contactos_cuenta_id_nombre_index` (`cuenta_id`,`nombre`);

-- Índices de la tabla `cuentas`
ALTER TABLE `cuentas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `cuentas_codigo_equipo_unique` (`codigo_equipo`),
  ADD UNIQUE KEY `cuentas_codigo_referido_unique` (`codigo_referido`);

-- Índices de la tabla `documentos`
ALTER TABLE `documentos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `documentos_user_id_foreign` (`user_id`),
  ADD KEY `documentos_cuenta_id_created_at_index` (`cuenta_id`,`created_at`),
  ADD KEY `documentos_sha256_original_index` (`sha256_original`),
  ADD KEY `documentos_sha256_final_index` (`sha256_final`),
  ADD KEY `documentos_plantilla_id_foreign` (`plantilla_id`);

-- Índices de la tabla `eventos`
ALTER TABLE `eventos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `eventos_documento_id_foreign` (`documento_id`),
  ADD KEY `eventos_firmante_id_foreign` (`firmante_id`);

-- Índices de la tabla `failed_jobs`
ALTER TABLE `failed_jobs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`);

-- Índices de la tabla `firmantes`
ALTER TABLE `firmantes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `firmantes_token_unique` (`token`),
  ADD KEY `firmantes_documento_id_orden_index` (`documento_id`,`orden`);

-- Índices de la tabla `job_batches`
ALTER TABLE `job_batches`
  ADD PRIMARY KEY (`id`);

-- Índices de la tabla `jobs`
ALTER TABLE `jobs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `jobs_queue_index` (`queue`);

-- Índices de la tabla `migrations`
ALTER TABLE `migrations`
  ADD PRIMARY KEY (`id`);

-- Índices de la tabla `pagos`
ALTER TABLE `pagos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `pagos_cuenta_id_foreign` (`cuenta_id`),
  ADD KEY `pagos_user_id_foreign` (`user_id`);

-- Índices de la tabla `password_reset_tokens`
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`email`);

-- Índices de la tabla `reclamacion_correos`
ALTER TABLE `reclamacion_correos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `reclamacion_correos_reclamacion_id_tipo_unique` (`reclamacion_id`,`tipo`),
  ADD KEY `reclamacion_correos_estado_index` (`estado`);

-- Índices de la tabla `reclamacion_secuencia`
ALTER TABLE `reclamacion_secuencia`
  ADD PRIMARY KEY (`id`);

-- Índices de la tabla `reclamaciones`
ALTER TABLE `reclamaciones`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `reclamaciones_numero_unique` (`numero`),
  ADD UNIQUE KEY `reclamaciones_solicitud_id_unique` (`solicitud_id`),
  ADD UNIQUE KEY `reclamaciones_token_hash_unique` (`token_hash`),
  ADD KEY `reclamaciones_vence_el_index` (`vence_el`);

-- Índices de la tabla `referidos`
ALTER TABLE `referidos`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `referidos_referido_id_unique` (`referido_id`),
  ADD UNIQUE KEY `referidos_pago_id_unique` (`pago_id`),
  ADD KEY `referidos_referidor_id_estado_vence_en_index` (`referidor_id`,`estado`,`vence_en`),
  ADD KEY `referidos_liberar_en_index` (`liberar_en`);

-- Índices de la tabla `sessions`
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sessions_user_id_index` (`user_id`),
  ADD KEY `sessions_last_activity_index` (`last_activity`);

-- Índices de la tabla `solicitudes`
ALTER TABLE `solicitudes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `solicitudes_numero_factura_unique` (`numero_factura`),
  ADD UNIQUE KEY `solicitudes_token_solicitante_unique` (`token_solicitante`),
  ADD UNIQUE KEY `solicitudes_token_aprobador_unique` (`token_aprobador`),
  ADD KEY `solicitudes_estado_created_at_index` (`estado`,`created_at`);

-- Índices de la tabla `users`
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `users_email_unique` (`email`),
  ADD KEY `users_cuenta_id_foreign` (`cuenta_id`);

-- AUTO_INCREMENT de las tablas volcadas

ALTER TABLE `campos`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `contactos`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `cuentas`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `documentos`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `eventos`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `failed_jobs`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `firmantes`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `jobs`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `migrations`
  MODIFY `id` int unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `pagos`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `reclamacion_correos`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `reclamaciones`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `referidos`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `solicitudes`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

ALTER TABLE `users`
  MODIFY `id` bigint unsigned NOT NULL AUTO_INCREMENT;

-- Restricciones para tablas volcadas

ALTER TABLE `campos`
  ADD CONSTRAINT `campos_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `campos_firmante_id_foreign` FOREIGN KEY (`firmante_id`) REFERENCES `firmantes` (`id`) ON DELETE CASCADE;

ALTER TABLE `consumos`
  ADD CONSTRAINT `consumos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `consumos_referido_bono_id_foreign` FOREIGN KEY (`referido_bono_id`) REFERENCES `referidos` (`id`);

ALTER TABLE `contactos`
  ADD CONSTRAINT `contactos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE;

ALTER TABLE `documentos`
  ADD CONSTRAINT `documentos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `documentos_plantilla_id_foreign` FOREIGN KEY (`plantilla_id`) REFERENCES `documentos` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `documentos_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `eventos`
  ADD CONSTRAINT `eventos_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `eventos_firmante_id_foreign` FOREIGN KEY (`firmante_id`) REFERENCES `firmantes` (`id`) ON DELETE SET NULL;

ALTER TABLE `firmantes`
  ADD CONSTRAINT `firmantes_documento_id_foreign` FOREIGN KEY (`documento_id`) REFERENCES `documentos` (`id`) ON DELETE CASCADE;

ALTER TABLE `pagos`
  ADD CONSTRAINT `pagos_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `pagos_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `reclamacion_correos`
  ADD CONSTRAINT `reclamacion_correos_reclamacion_id_foreign` FOREIGN KEY (`reclamacion_id`) REFERENCES `reclamaciones` (`id`);

ALTER TABLE `referidos`
  ADD CONSTRAINT `referidos_pago_id_foreign` FOREIGN KEY (`pago_id`) REFERENCES `pagos` (`id`),
  ADD CONSTRAINT `referidos_referido_id_foreign` FOREIGN KEY (`referido_id`) REFERENCES `cuentas` (`id`),
  ADD CONSTRAINT `referidos_referidor_id_foreign` FOREIGN KEY (`referidor_id`) REFERENCES `cuentas` (`id`);

ALTER TABLE `users`
  ADD CONSTRAINT `users_cuenta_id_foreign` FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas` (`id`) ON DELETE CASCADE;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
