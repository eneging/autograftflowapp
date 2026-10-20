<?php

namespace App\Http\Middleware;

use App\Servicios\Invitados;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Sin cuenta hay que aceptar los Términos y Condiciones cada vez que se entra: la cookie de sesión del invitado
 * se borra al cerrar el navegador y, además, la sesión vence a las Invitados::HORAS_SESION horas.
 */
class SesionInvitado
{
    public function handle(Request $request, Closure $next)
    {
        $sesion = $request->session();
        $invitado = $sesion->get(Invitados::SESION);
        if ($invitado) {
            if ($invitado['id'] !== Auth::id()) {
                // Inició sesión con su cuenta o la cerró: ya no es invitado.
                $sesion->forget(Invitados::SESION);
            } elseif (now()->timestamp - $invitado['desde'] > Invitados::HORAS_SESION * 3600) {
                Auth::guard('web')->logout();
                $sesion->invalidate();
                $sesion->regenerateToken();
            } else {
                config(['session.expire_on_close' => true]);
            }
        }
        return $next($request);
    }
}
