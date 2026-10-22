<?php

namespace App\Servicios;

use Carbon\CarbonImmutable;

class PlazoReclamacion
{
    public static function vence(CarbonImmutable $registro): string
    {
        $dia = $registro->setTimezone('America/Lima')->startOfDay();
        $pendientes = 15;
        while ($pendientes > 0) {
            $dia = $dia->addDay();
            if (! $dia->isWeekend() && ! self::feriado($dia)) {
                $pendientes--;
            }
        }
        return $dia->toDateString();
    }

    private static function feriado(CarbonImmutable $dia): bool
    {
        $fijos = ['01-01', '05-01', '06-07', '06-29', '07-23', '07-28', '07-29', '08-06', '08-30', '10-08', '11-01', '12-08', '12-09', '12-25'];
        // Algoritmo gregoriano de Pascua; independiente de la zona horaria del servidor.
        $y = $dia->year; $a = $y % 19; $b = intdiv($y, 100); $c = $y % 100;
        $d = intdiv($b, 4); $e = $b % 4; $f = intdiv($b + 8, 25); $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30; $i = intdiv($c, 4); $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7; $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $p = $h + $l - 7 * $m + 114;
        $pascua = CarbonImmutable::create($y, intdiv($p, 31), $p % 31 + 1, 0, 0, 0, 'America/Lima');
        return in_array($dia->format('m-d'), $fijos, true)
            || $dia->isSameDay($pascua->subDays(3)) || $dia->isSameDay($pascua->subDays(2))
            || in_array($dia->toDateString(), config('reclamaciones.feriados_adicionales', []), true);
    }
}
