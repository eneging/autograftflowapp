<?php

namespace App\Reembolso;

/**
 * Validación de la solicitud de reembolso en el servidor (la misma que resources/shared/esquema.ts en la página).
 * Devuelve los datos normalizados y los errores por ruta: ["contacto.nombre" => "…", "viajes.0.fecha" => "…", "_" => "…"].
 */
class Validacion
{
    public const LIMITES = ['meses' => 3, 'viajesEnFormulario' => 4, 'gastosEnFormulario' => 2, 'viajes' => 16, 'gastos' => 20, 'texto' => 120, 'firmaBytes' => 400_000];

    private array $errores = [];

    public static function solicitud(mixed $entrada): array
    {
        $v = new self;
        $datos = $v->datos(is_array($entrada) ? $entrada : []);
        return [$datos, $v->errores];
    }

    private function error(string $ruta, string $mensaje): void
    {
        $this->errores[$ruta] ??= $mensaje;
    }

    private function texto(array $o, string $k, string $ruta, int $max = 120, int $min = 0, string $msjMin = 'Campo obligatorio'): string
    {
        $v = $o[$k] ?? '';
        if (! is_string($v)) {
            $this->error($ruta, 'Valor inválido');
            return '';
        }
        $v = trim($v);
        if (mb_strlen($v) > $max) {
            $this->error($ruta, "Máximo {$max} caracteres");
        } elseif (mb_strlen($v) < $min) {
            $this->error($ruta, $msjMin);
        }
        return $v;
    }

    private function numero(array $o, string $k, string $ruta, float $max, bool $obligatorio = false): float
    {
        $v = $o[$k] ?? null;
        if ($v === null && ! $obligatorio) {
            return 0;
        }
        if (! is_int($v) && ! is_float($v) || ! is_finite((float) $v)) {
            $this->error($ruta, $v === null ? 'Campo obligatorio' : 'Debe ser un número');
            return 0;
        }
        if ($v < 0) {
            $this->error($ruta, 'No puede ser negativo');
        } elseif ($v > $max) {
            $this->error($ruta, 'Valor demasiado grande');
        }
        return (float) $v;
    }

    private function fecha(array $o, string $k, string $ruta, bool $obligatoria): string
    {
        $v = $o[$k] ?? '';
        if ($v === '' && ! $obligatoria) {
            return '';
        }
        if (! is_string($v) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
            $this->error($ruta, $v === '' ? 'Campo obligatorio' : 'Fecha inválida');
            return '';
        }
        return $v;
    }

    private function datos(array $e): array
    {
        $c = is_array($e['contacto'] ?? null) ? $e['contacto'] : [];
        $r = is_array($e['reiterativo'] ?? null) ? $e['reiterativo'] : [];
        $contacto = [
            'nombre' => $this->texto($c, 'nombre', 'contacto.nombre', 120, 3, 'Escribe el nombre del beneficiario'),
            'estaca' => $this->texto($c, 'estaca', 'contacto.estaca', 120, 2, 'Escribe la estaca'),
            'barrio' => $this->texto($c, 'barrio', 'contacto.barrio', 120, 2, 'Escribe el barrio'),
            'telefono' => $this->texto($c, 'telefono', 'contacto.telefono', 30),
            'email' => $this->texto($c, 'email', 'contacto.email', 160),
            'fechaFactura' => $this->fecha($c, 'fechaFactura', 'contacto.fechaFactura', true),
            'tasa' => $this->numero($c, 'tasa', 'contacto.tasa', 1000),
            'direccion' => $this->texto($c, 'direccion', 'contacto.direccion', 200),
        ];
        if (! preg_match('/^[+\d][\d\s()-]{6,}$/', $contacto['telefono'])) {
            $this->error('contacto.telefono', 'Teléfono inválido');
        }
        if ($contacto['email'] !== '' && ! filter_var($contacto['email'], FILTER_VALIDATE_EMAIL)) {
            $this->error('contacto.email', 'Correo inválido');
        }

        $meses = [];
        foreach (array_slice(is_array($r['meses'] ?? null) ? $r['meses'] : [], 0, self::LIMITES['meses']) as $i => $m) {
            $mes = is_string($m['mes'] ?? null) ? $m['mes'] : '';
            $dias = array_values(array_filter(is_array($m['dias'] ?? null) ? $m['dias'] : [], fn ($d) => is_int($d) && $d >= 1 && $d <= 31));
            if ($mes !== '' && ! preg_match('/^\d{4}-\d{2}$/', $mes)) {
                $this->error("reiterativo.meses.{$i}.mes", 'Mes inválido');
            }
            if ($dias && $mes === '') {
                $this->error("reiterativo.meses.{$i}.mes", 'Indica el mes de los días marcados');
            }
            if ($mes !== '' && preg_match('/^(\d{4})-(\d{2})$/', $mes, $p)) {
                $ultimo = (int) date('t', mktime(0, 0, 0, (int) $p[2], 1, (int) $p[1]));
                foreach ($dias as $d) {
                    if ($d > $ultimo) {
                        $this->error("reiterativo.meses.{$i}.dias", "El mes elegido no tiene día {$d}");
                        break;
                    }
                }
            }
            $meses[] = ['mes' => $mes, 'dias' => $dias];
        }
        $reiterativo = [
            'origen' => $this->texto($r, 'origen', 'reiterativo.origen'),
            'destino' => $this->texto($r, 'destino', 'reiterativo.destino'),
            'proposito' => $this->texto($r, 'proposito', 'reiterativo.proposito'),
            'distancia' => $this->numero($r, 'distancia', 'reiterativo.distancia', 100_000),
            'peajes' => $this->numero($r, 'peajes', 'reiterativo.peajes', 1_000_000),
            'meses' => $meses,
        ];

        $viajes = [];
        $listaViajes = is_array($e['viajes'] ?? null) ? $e['viajes'] : [];
        if (count($listaViajes) > self::LIMITES['viajes']) {
            $this->error('viajes', 'Máximo '.self::LIMITES['viajes'].' viajes');
        }
        foreach (array_slice($listaViajes, 0, self::LIMITES['viajes']) as $i => $v) {
            $v = is_array($v) ? $v : [];
            $viajes[] = $fila = [
                'origen' => $this->texto($v, 'origen', "viajes.{$i}.origen"),
                'destino' => $this->texto($v, 'destino', "viajes.{$i}.destino"),
                'proposito' => $this->texto($v, 'proposito', "viajes.{$i}.proposito"),
                'fecha' => $this->fecha($v, 'fecha', "viajes.{$i}.fecha", false),
                'distancia' => $this->numero($v, 'distancia', "viajes.{$i}.distancia", 100_000, true),
                'peajes' => $this->numero($v, 'peajes', "viajes.{$i}.peajes", 1_000_000, true),
            ];
            if (! ($fila['distancia'] > 0 || $fila['peajes'] > 0)) {
                $this->error("viajes.{$i}.distancia", 'Indica la distancia o los peajes');
            }
            if ($fila['fecha'] === '') {
                $this->error("viajes.{$i}.fecha", 'Indica la fecha del viaje');
            }
        }

        $gastos = [];
        $listaGastos = is_array($e['gastos'] ?? null) ? $e['gastos'] : [];
        if (count($listaGastos) > self::LIMITES['gastos']) {
            $this->error('gastos', 'Máximo '.self::LIMITES['gastos'].' gastos');
        }
        foreach (array_slice($listaGastos, 0, self::LIMITES['gastos']) as $i => $g) {
            $g = is_array($g) ? $g : [];
            $gastos[] = $fila = [
                'vendedor' => $this->texto($g, 'vendedor', "gastos.{$i}.vendedor"),
                'descripcion' => $this->texto($g, 'descripcion', "gastos.{$i}.descripcion", 200),
                'cuenta' => $this->texto($g, 'cuenta', "gastos.{$i}.cuenta", 40),
                'monto' => $this->numero($g, 'monto', "gastos.{$i}.monto", 10_000_000, true),
            ];
            if (! ($fila['monto'] > 0)) {
                $this->error("gastos.{$i}.monto", 'Indica la cantidad');
            }
            if ($fila['vendedor'] === '') {
                $this->error("gastos.{$i}.vendedor", 'Indica el vendedor');
            }
        }

        $dias = array_sum(array_map(fn ($m) => count($m['dias']), $meses));
        $hayViajes = $dias > 0 || array_filter($viajes, fn ($v) => $v['distancia'] > 0);
        if ($hayViajes && ! ($contacto['tasa'] > 0)) {
            $this->error('contacto.tasa', 'Indica el monto por milla/km para calcular los viajes');
        }
        if ($dias > 0 && ! ($reiterativo['distancia'] > 0)) {
            $this->error('reiterativo.distancia', 'Indica las millas/km del viaje de ida y vuelta');
        }
        if ($dias === 0 && ! $viajes && ! $gastos) {
            $this->error('_', 'Agrega al menos un viaje o un gasto');
        }
        return compact('contacto', 'reiterativo', 'viajes', 'gastos');
    }
}
