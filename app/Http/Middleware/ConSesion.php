<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** Rutas de la API que requieren haber iniciado sesión. */
class ConSesion
{
    public function handle(Request $request, Closure $next)
    {
        if (! $request->user()) {
            return response()->json(['error' => 'Inicia sesión para continuar'], 401);
        }
        return $next($request);
    }
}
