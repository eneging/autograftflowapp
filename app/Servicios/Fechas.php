<?php

namespace App\Servicios;

use Illuminate\Support\Carbon;

class Fechas
{
    /** Fecha de la base (UTC) → «2026-10-07T05:12:17Z» para la página, o null. */
    public static function iso(mixed $valor): ?string
    {
        return $valor ? Carbon::parse($valor, 'UTC')->toIso8601ZuluString() : null;
    }

    /** «2026-10-07 05:12:17 UTC» para el certificado de firmas. */
    public static function utc(mixed $valor): string
    {
        return $valor ? Carbon::parse($valor, 'UTC')->format('Y-m-d H:i:s').' UTC' : '—';
    }
}
