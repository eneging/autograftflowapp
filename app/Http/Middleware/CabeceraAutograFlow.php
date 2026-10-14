<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Protección CSRF de la API: las peticiones que cambian algo deben traer la cabecera «X-AutograFlow: 1»,
 * que solo la propia página puede poner (otro sitio no puede añadirla sin permiso CORS).
 * El aviso de Mercado Pago queda fuera: llega desde sus servidores y se verifica con su firma.
 */
class CabeceraAutograFlow
{
    public function handle(Request $request, Closure $next)
    {
        if (in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true) || $request->header('X-AutograFlow') === '1' || $request->is('api/pagos/webhook')) {
            return $next($request);
        }
        return response()->json(['error' => 'Petición no permitida'], 403);
    }
}
