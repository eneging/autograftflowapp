<?php

// Uso local: php deploy/exportar-estructura.php [--verificar]
// Solo exporta estructura y datos técnicos iniciales; nunca usuarios ni registros del negocio.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$conexion = DB::connection();
if ($conexion->getDriverName() !== 'mysql' && $conexion->getDriverName() !== 'mariadb') {
    throw new RuntimeException('La exportación requiere MySQL o MariaDB.');
}
$archivos = array_map(fn ($f) => basename($f, '.php'), glob(dirname(__DIR__).'/database/migrations/*.php'));
$aplicadas = $conexion->table('migrations')->orderBy('migration')->pluck('migration')->all();
sort($archivos);
if ($archivos !== $aplicadas) { throw new RuntimeException('Las migraciones locales no coinciden con las aplicadas. Ejecuta migrate antes de exportar.'); }
$tablas = array_map(fn ($t) => array_values((array) $t)[0], $conexion->select('SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE']));
sort($tablas);
$sql = "-- AutograFlow - instalación nueva de producción, 22 de octubre de 2026.\n";
$sql .= "-- Importar SOLO en una base VACÍA de MySQL/MariaDB seleccionada en phpMyAdmin.\n";
$sql .= "-- Incluye referidos, Libro de Reclamaciones y guía de introducción.\n";
$sql .= "-- Sin usuarios, contraseñas, documentos, reclamos, pagos ni sesiones locales.\n";
$sql .= "-- No usar para actualizar una base con datos: ejecutar php artisan migrate --force.\n\n";
$sql .= "SET NAMES utf8mb4;\nSET @AF_OLD_FK_CHECKS = @@FOREIGN_KEY_CHECKS;\nSET FOREIGN_KEY_CHECKS = 0;\n\n";
foreach ($tablas as $tabla) {
    if (! preg_match('/^[a-zA-Z0-9_]+$/', $tabla)) { throw new RuntimeException('Nombre de tabla no admitido.'); }
    $resultado = (array) $conexion->selectOne('SHOW CREATE TABLE `'.$tabla.'`');
    $create = $resultado['Create Table'];
    // El contador de IDs de desarrollo no forma parte de una instalación nueva.
    $create = preg_replace('/\sAUTO_INCREMENT=\d+\b/', '', $create);
    $sql .= $create.";\n\n";
}
$sql .= "-- Registro técnico de migraciones: evita volver a ejecutar cambios ya incluidos.\n";
foreach ($aplicadas as $migracion) {
    $sql .= 'INSERT INTO `migrations` (`migration`, `batch`) VALUES ('.$conexion->getPdo()->quote($migracion).", 1);\n";
}
$sql .= "\n-- Contador inicial obligatorio para la numeración del Libro de Reclamaciones.\n";
$sql .= "INSERT INTO `reclamacion_secuencia` (`id`, `valor`) VALUES (1, 0);\n\n";
$sql .= "SET FOREIGN_KEY_CHECKS = @AF_OLD_FK_CHECKS;\n";

if (in_array('--verificar', $argv, true)) {
    // Base temporal aislada: no modifica ni elimina ninguna tabla de la aplicación.
    $temporal = 'autograflow_validacion_'.bin2hex(random_bytes(6));
    $conexion->unprepared('CREATE DATABASE `'.$temporal.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    try {
        $config = $conexion->getConfig(); $config['database'] = $temporal; $config['url'] = null;
        config(['database.connections.verificacion_sql' => $config]);
        $prueba = DB::connection('verificacion_sql');
        $prueba->unprepared($sql);
        $importadas = array_map(fn ($t) => array_values((array) $t)[0], $prueba->select('SHOW FULL TABLES WHERE Table_type = ?', ['BASE TABLE']));
        sort($importadas);
        if ($importadas !== $tablas) { throw new RuntimeException('No se importaron todas las tablas.'); }
        foreach ($tablas as $tabla) {
            $esperadas = $tabla === 'migrations' ? count($aplicadas) : ($tabla === 'reclamacion_secuencia' ? 1 : 0);
            if ($prueba->table($tabla)->count() !== $esperadas) { throw new RuntimeException('Datos inesperados en '.$tabla); }
            $origen = (array) $conexion->selectOne('SHOW CREATE TABLE `'.$tabla.'`');
            $destino = (array) $prueba->selectOne('SHOW CREATE TABLE `'.$tabla.'`');
            $normalizar = fn ($s) => preg_replace(['/\sAUTO_INCREMENT=\d+\b/', '/ CHARACTER SET utf8mb4(?= COLLATE utf8mb4_)/'], '', $s);
            if ($normalizar($origen['Create Table']) !== $normalizar($destino['Create Table'])) {
                throw new RuntimeException('La estructura importada no coincide: '.$tabla);
            }
        }
        echo 'Importación comprobada: '.count($tablas).' tablas, '.count($aplicadas).' migraciones y datos de negocio vacíos.'.PHP_EOL;
    } finally {
        DB::purge('verificacion_sql');
        // Nombre creado arriba, prefijo fijo y únicamente caracteres hexadecimales generados aquí.
        if (! preg_match('/^autograflow_validacion_[a-f0-9]{12}$/', $temporal)) { throw new RuntimeException('Nombre temporal no válido.'); }
        $conexion->unprepared('DROP DATABASE `'.$temporal.'`');
    }
}

foreach (['base-de-datos.sql', 'autograflow-produccion-2026-10-22.sql'] as $archivo) {
    if (file_put_contents(__DIR__.'/'.$archivo, $sql) === false) { throw new RuntimeException('No se pudo guardar '.$archivo); }
}
echo 'SQL generado: '.count($tablas).' tablas. Solo estructura y semillas técnicas.'.PHP_EOL;
