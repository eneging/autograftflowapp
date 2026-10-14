<?php

namespace App\Reembolso;

/**
 * Cálculos del formulario «Solicitud de reembolso para no empleados» (iguales a resources/shared/calculos.ts):
 *   reiterativo = días × (mi o km × tarifa + peajes)
 *   viaje con paradas = mi o km × tarifa + peajes
 *   total = reiterativos + viajes con paradas + otros gastos
 * Todo en centavos enteros para que las sumas no arrastren errores de redondeo.
 */
class Calculos
{
    public static function centavos(float $n): int
    {
        return (int) round(($n + PHP_FLOAT_EPSILON) * 100);
    }

    private static function redondear(float $n): float
    {
        return round($n + PHP_FLOAT_EPSILON, 2);
    }

    public static function calcular(array $d): array
    {
        $tasa = (float) ($d['contacto']['tasa'] ?? 0);
        $dias = 0;
        foreach ($d['reiterativo']['meses'] as $m) {
            $dias += count(array_unique($m['dias']));
        }
        $distancia = self::redondear($dias * (float) $d['reiterativo']['distancia']);
        $peajes = self::centavos($dias * (float) $d['reiterativo']['peajes']);
        $reiterativo = self::centavos($distancia * $tasa) + $peajes;
        $viajes = array_map(fn ($v) => self::centavos((float) $v['distancia'] * $tasa) + self::centavos((float) $v['peajes']), $d['viajes']);
        $gastos = array_map(fn ($g) => self::centavos((float) $g['monto']), $d['gastos']);
        return [
            'dias' => $dias, 'reiterativoDistancia' => $distancia, 'reiterativoPeajes' => $peajes, 'reiterativoReembolso' => $reiterativo,
            'viajes' => $viajes, 'gastos' => $gastos,
            'totalReiterativos' => $reiterativo, 'totalViajes' => array_sum($viajes), 'totalOtros' => array_sum($gastos),
            'total' => $reiterativo + array_sum($viajes) + array_sum($gastos),
        ];
    }

    /** 123456 centavos → «1,234.56». */
    public static function monto(int $centavos): string
    {
        return ($centavos < 0 ? '-' : '').number_format(intdiv(abs($centavos), 100), 0, '.', ',').'.'.str_pad((string) (abs($centavos) % 100), 2, '0', STR_PAD_LEFT);
    }

    /** Distancias sin ceros de más: «30», «12.5». */
    public static function numero(float $n): string
    {
        $r = self::redondear($n);
        return rtrim(rtrim(number_format($r, 2, '.', ''), '0'), '.');
    }

    public static function fecha(?string $iso): string
    {
        return $iso && preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $iso, $m) ? "{$m[3]}/{$m[2]}/{$m[1]}" : '';
    }

    public static function mes(?string $mes): string
    {
        $nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return $mes && preg_match('/^(\d{4})-(\d{2})$/', $mes, $m) ? $nombres[(int) $m[2] - 1].' '.$m[1] : '';
    }
}
