<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CuentaController;
use App\Http\Controllers\DocumentosController;
use App\Http\Controllers\FirmaController;
use App\Http\Controllers\ReembolsoController;
use App\Http\Middleware\CabeceraAutograFlow;
use App\Http\Middleware\ClaveAdmin;
use App\Http\Middleware\ConSesion;
use Illuminate\Support\Facades\Route;

/*
 * API de AutograFlow (JSON). Usa la sesión de Laravel (cookie HttpOnly); la protección CSRF es la cabecera
 * X-AutograFlow (ver CabeceraAutograFlow), por eso «api/*» está excluido del token CSRF en bootstrap/app.php.
 */
Route::prefix('api')->middleware(CabeceraAutograFlow::class)->group(function () {
    Route::get('salud', fn () => ['ok' => true]);

    // Cuentas
    Route::post('auth/registro', [AuthController::class, 'registro']);
    Route::post('auth/ingresar', [AuthController::class, 'ingresar']);
    Route::post('auth/salir', [AuthController::class, 'salir']);
    Route::get('auth/yo', [AuthController::class, 'yo']);
    Route::post('auth/olvide', [AuthController::class, 'olvide']);
    Route::post('auth/restablecer', [AuthController::class, 'restablecer']);

    // Documentos (dueño)
    Route::middleware(ConSesion::class)->prefix('documentos')->group(function () {
        Route::get('/', [DocumentosController::class, 'index']);
        Route::post('/', [DocumentosController::class, 'store']);
        Route::get('{id}', [DocumentosController::class, 'show'])->whereNumber('id');
        Route::put('{id}', [DocumentosController::class, 'update'])->whereNumber('id');
        Route::post('{id}/enviar', [DocumentosController::class, 'enviar'])->whereNumber('id');
        Route::post('{id}/plantilla', [DocumentosController::class, 'plantilla'])->whereNumber('id');
        Route::post('{id}/recordar/{firmante}', [DocumentosController::class, 'recordar'])->whereNumber(['id', 'firmante']);
        Route::post('{id}/duplicar', [DocumentosController::class, 'duplicar'])->whereNumber('id');
        Route::delete('{id}/paginas/{pagina}', [DocumentosController::class, 'eliminarPagina'])->whereNumber(['id', 'pagina']);
        Route::delete('{id}', [DocumentosController::class, 'destroy'])->whereNumber('id');
        Route::get('{id}/archivo', [DocumentosController::class, 'archivo'])->whereNumber('id');
        Route::get('{id}/final', [DocumentosController::class, 'final'])->whereNumber('id');
        Route::get('{id}/campos/{campo}/imagen', [DocumentosController::class, 'imagenCampo'])->whereNumber(['id', 'campo']);
    });

    // Firmantes (con su enlace)
    Route::prefix('firmar/{token}')->group(function () {
        Route::get('/', [FirmaController::class, 'vista']);
        Route::post('/', [FirmaController::class, 'firmar']);
        Route::post('rechazar', [FirmaController::class, 'rechazar']);
        Route::get('archivo', [FirmaController::class, 'archivo']);
        Route::get('final', [FirmaController::class, 'final']);
        Route::get('campos/{campo}/imagen', [FirmaController::class, 'imagenCampo'])->whereNumber('campo');
        Route::get('logo', [FirmaController::class, 'logo']);
    });

    // Planes, pagos (Mercado Pago), logo y verificación
    Route::get('planes', [CuentaController::class, 'planes']);
    Route::get('verificar/{sha}', [CuentaController::class, 'verificar']);
    Route::post('pagos/webhook', [CuentaController::class, 'webhook']);
    Route::middleware(ConSesion::class)->group(function () {
        Route::get('cuenta', [CuentaController::class, 'cuenta']);
        Route::get('cuenta/equipo', [CuentaController::class, 'equipo']);
        Route::post('cuenta/equipo/codigo', [CuentaController::class, 'nuevoCodigoEquipo']);
        Route::delete('cuenta/equipo/{usuario}', [CuentaController::class, 'quitarMiembro'])->whereNumber('usuario');
        Route::get('contactos', [DocumentosController::class, 'contactos']);
        Route::get('cuenta/logo', [CuentaController::class, 'logo']);
        Route::put('cuenta/logo', [CuentaController::class, 'subirLogo']);
        Route::delete('cuenta/logo', [CuentaController::class, 'quitarLogo']);
        Route::post('pagos', [CuentaController::class, 'comprar']);
        Route::post('pagos/{id}/verificar', [CuentaController::class, 'verificarPago'])->whereNumber('id');
    });

    // Plantilla «Solicitud de reembolso»
    Route::post('solicitudes', [ReembolsoController::class, 'crear']);
    Route::get('solicitudes/{token}', [ReembolsoController::class, 'ver']);
    Route::get('solicitudes/{token}/pdf', [ReembolsoController::class, 'pdf']);
    Route::get('solicitudes/{token}/firma/{quien}', [ReembolsoController::class, 'firma']);
    Route::post('solicitudes/{token}/decision', [ReembolsoController::class, 'decision']);

    // Administración (contraseña ADMIN_PASSWORD)
    Route::middleware(ClaveAdmin::class)->prefix('admin')->group(function () {
        Route::get('solicitudes', [ReembolsoController::class, 'admin']);
        Route::get('cuentas', [CuentaController::class, 'adminCuentas']);
        Route::post('cuentas/{id}/activar', [CuentaController::class, 'adminActivar'])->whereNumber('id');
    });

    Route::any('{resto}', fn () => response()->json(['error' => 'No encontrado'], 404))->where('resto', '.*');
});

// Todo lo demás es la página React (React Router decide qué mostrar).
Route::view('/{ruta?}', 'app')->where('ruta', '^(?!api/|build/).*$');
