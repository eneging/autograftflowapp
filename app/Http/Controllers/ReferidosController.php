<?php

namespace App\Http\Controllers;

use App\Servicios\Referidos;
use Illuminate\Http\Request;

class ReferidosController extends Controlador
{
    public function estado(Request $r)
    {
        // El enlace público usa el dominio de esta visita, incluso si APP_URL conserva un túnel de desarrollo.
        return response()->json(Referidos::estado((int) $r->user()->cuenta_id, $r->getSchemeAndHttpHost()))
            ->header('Cache-Control', 'private, no-store');
    }

    public function reglas()
    {
        return Referidos::reglas();
    }
}
