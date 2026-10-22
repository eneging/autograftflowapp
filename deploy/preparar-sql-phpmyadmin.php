<?php

// php deploy/preparar-sql-phpmyadmin.php "ruta/al/volcado-del-hosting.sql" [--verificar]
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$ruta = $argv[1] ?? '';
if (! is_file($ruta)) { throw new RuntimeException('Indica el SQL de referencia del hosting.'); }
$referencia = file_get_contents($ruta);
preg_match_all('/CREATE TABLE\s+`([^`]+)`/i', $referencia, $m);
$existentes = $m[1]; sort($existentes);
if ($existentes !== ['cache', 'cache_locks'] || preg_match('/INSERT\s+INTO/i', $referencia)) {
    throw new RuntimeException('Este parche requiere el volcado de referencia con solo cache y cache_locks, sin datos.');
}
$base = file_get_contents(__DIR__.'/base-de-datos.sql');
preg_match_all('/CREATE TABLE `([^`]+)` \(\r?\n(.*?)\r?\n\) ([^;]+);/s', $base, $defs, PREG_SET_ORDER);
if (count($defs) !== 22) { throw new RuntimeException('La estructura canónica debe tener 22 tablas.'); }
$tablas = [];
foreach ($defs as $def) {
    $t = ['nombre' => $def[1], 'columnas' => [], 'indices' => [], 'auto' => [], 'restricciones' => [], 'opciones' => $def[3]];
    foreach (preg_split('/\r?\n/', $def[2]) as $linea) {
        $linea = rtrim(trim($linea), ',');
        if (str_starts_with($linea, '`')) {
            $t['columnas'][] = preg_replace('/\sAUTO_INCREMENT\b/', '', $linea);
            if (preg_match('/\sAUTO_INCREMENT\b/', $linea)) { $t['auto'][] = $linea; }
        } elseif (preg_match('/^(PRIMARY KEY|UNIQUE KEY|KEY) /', $linea)) { $t['indices'][] = $linea; }
        elseif (str_starts_with($linea, 'CONSTRAINT ')) { $t['restricciones'][] = $linea; }
        else { throw new RuntimeException('Definición de tabla no reconocida: '.$def[1]); }
    }
    $tablas[$def[1]] = $t;
}
$migraciones = array_map(fn ($f) => basename($f, '.php'), glob(dirname(__DIR__).'/database/migrations/*.php'));
sort($migraciones);
$generar = function (bool $completar) use ($tablas, $existentes, $migraciones): string {
    $elegidas = array_filter($tablas, fn ($t) => ! $completar || ! in_array($t['nombre'], $existentes, true));
    $sql = "-- AutograFlow SQL Dump\n-- Formato compatible con el archivo exportado por phpMyAdmin 5.2.3.\n";
    $sql .= "-- Base de datos: `edwarrej_autograflow`\n-- Fecha: 2026-10-22\n";
    $sql .= $completar
        ? "-- COMPLETAR la base que contiene SOLO cache y cache_locks, según el volcado recibido.\n-- No crea ni modifica esas dos tablas. No elimina registros.\n"
        : "-- INSTALACIÓN NUEVA: usar únicamente en una base VACÍA.\n";
    $sql .= "-- Sin datos de usuarios, documentos, firmas, pagos ni reclamaciones.\n\n";
    $sql .= "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\nSTART TRANSACTION;\nSET time_zone = \"+00:00\";\n\n";
    $sql .= "/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;\n/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;\n/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;\n/*!40101 SET NAMES utf8mb4 */;\n\nUSE `edwarrej_autograflow`;\n\n";
    foreach ($elegidas as $t) {
        $sql .= "-- --------------------------------------------------------\n\n-- Estructura de tabla para la tabla `{$t['nombre']}`\n\n";
        $sql .= 'CREATE TABLE `'.$t['nombre']."` (\n  ".implode(",\n  ", $t['columnas'])."\n) ".$t['opciones'].";\n\n";
    }
    $sql .= "-- Datos técnicos iniciales\n-- No se incluyen registros de desarrollo.\n\n";
    foreach ($migraciones as $i => $migracion) {
        $sql .= 'INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES ('.($i + 1).", '".$migracion."', 1);\n";
    }
    $sql .= "\nINSERT INTO `reclamacion_secuencia` (`id`, `valor`) VALUES (1, 0);\n\n-- Índices para tablas volcadas\n\n";
    foreach ($elegidas as $t) {
        if ($t['indices']) {
            $sql .= '-- Índices de la tabla `'.$t['nombre']."`\nALTER TABLE `".$t['nombre']."`\n  ADD ".implode(",\n  ADD ", $t['indices']).";\n\n";
        }
    }
    $sql .= "-- AUTO_INCREMENT de las tablas volcadas\n\n";
    foreach ($elegidas as $t) {
        if ($t['auto']) {
            $sql .= 'ALTER TABLE `'.$t['nombre']."`\n  MODIFY ".implode(",\n  MODIFY ", $t['auto']).";\n\n";
        }
    }
    $sql .= "-- Restricciones para tablas volcadas\n\n";
    foreach ($elegidas as $t) {
        if ($t['restricciones']) {
            $sql .= 'ALTER TABLE `'.$t['nombre']."`\n  ADD ".implode(",\n  ADD ", $t['restricciones']).";\n\n";
        }
    }
    $sql .= "COMMIT;\n\n/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;\n/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;\n/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;\n";
    return $sql;
};
$completa = $generar(false); $parche = $generar(true);

if (in_array('--verificar', $argv, true)) {
    $origen = DB::connection();
    if (! in_array($origen->getDriverName(), ['mysql', 'mariadb'], true)) { throw new RuntimeException('Verificar requiere MySQL/MariaDB.'); }
    foreach (['completa' => $completa, 'parche' => $parche] as $tipo => $contenido) {
        $temporal = 'autograflow_formato_'.bin2hex(random_bytes(6));
        $origen->unprepared('CREATE DATABASE `'.$temporal.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        try {
            $cfg = $origen->getConfig(); $cfg['database'] = $temporal; $cfg['url'] = null;
            config(['database.connections.prueba_formato' => $cfg]);
            $db = DB::connection('prueba_formato');
            if ($tipo === 'parche') {
                $db->unprepared($referencia);
                // Un dato temporal de caché demuestra que el parche conserva los registros existentes.
                $db->table('cache')->insert(['key' => 'comprobacion_temporal', 'value' => 'conservar', 'expiration' => 0]);
            }
            // Cambia solo el destino de prueba; el archivo entregado conserva el nombre del hosting.
            $db->unprepared(str_replace('USE `edwarrej_autograflow`;', 'USE `'.$temporal.'`;', $contenido));
            foreach ($tablas as $nombre => $t) {
                $real = (array) $db->selectOne('SHOW CREATE TABLE `'.$nombre.'`');
                $esperado = (array) $origen->selectOne('SHOW CREATE TABLE `'.$nombre.'`');
                $norm = fn ($s) => preg_replace(['/\sAUTO_INCREMENT=\d+\b/', '/ CHARACTER SET utf8mb4(?= COLLATE utf8mb4_)/'], '', $s);
                if ($norm($real['Create Table']) !== $norm($esperado['Create Table'])) { throw new RuntimeException('Estructura distinta: '.$nombre); }
                $filas = $nombre === 'migrations' ? count($migraciones) : ($nombre === 'reclamacion_secuencia' ? 1 : ($nombre === 'cache' && $tipo === 'parche' ? 1 : 0));
                if ($db->table($nombre)->count() !== $filas) { throw new RuntimeException('Datos no esperados: '.$nombre); }
            }
            if ($tipo === 'parche' && $db->table('cache')->where('key', 'comprobacion_temporal')->value('value') !== 'conservar') { throw new RuntimeException('No se conservó la caché de prueba.'); }
            echo 'Verificado '.$tipo.': 22 tablas y '.count($migraciones).' migraciones; datos existentes conservados.'.PHP_EOL;
        } finally {
            DB::purge('prueba_formato');
            if (! preg_match('/^autograflow_formato_[a-f0-9]{12}$/', $temporal)) { throw new RuntimeException('Destino temporal no válido.'); }
            $origen->unprepared('DROP DATABASE `'.$temporal.'`');
        }
    }
}
file_put_contents(__DIR__.'/edwarrej_autograflow-completa.sql', $completa);
file_put_contents(__DIR__.'/edwarrej_autograflow-completar.sql', $parche);
echo 'Generados completa.sql (base vacía) y completar.sql (base con cache y cache_locks).'.PHP_EOL;
