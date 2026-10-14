<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** Panel /admin: contraseña ADMIN_PASSWORD en la cabecera «x-admin-password», comparada en tiempo constante. */
class ClaveAdmin
{
    public function handle(Request $request, Closure $next)
    {
        $clave = (string) config('autograflow.admin_password');
        if ($clave === '' || ! hash_equals($clave, (string) $request->header('x-admin-password'))) {
            return response()->json(['error' => 'Contraseña incorrecta'], 401);
        }
        return $next($request);
    }
}
