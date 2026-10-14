<?php

use App\Servicios\ErrorUso;
use App\Servicios\ImagenInvalida;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // La API se protege con la cabecera X-AutograFlow (y el webhook con la firma de Mercado Pago).
        $middleware->validateCsrfTokens(except: ['api/*']);
        // Detrás del proxy del hosting (o de Cloudflare), la IP real del firmante llega en X-Forwarded-For.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Los errores de uso (enlace vencido, límite del plan…) son respuestas normales: no van al registro de errores.
        $exceptions->dontReport([ErrorUso::class, ImagenInvalida::class]);
        // La API siempre responde JSON con el formato que espera la página: {"error": "...", "campos": {...}}.
        $exceptions->render(function (ErrorUso $e) {
            return response()->json(['error' => $e->getMessage(), 'campos' => $e->campos ?: null], $e->estado);
        });
        $exceptions->render(function (ImagenInvalida $e) {
            return response()->json(['error' => $e->getMessage()], 400);
        });
        $exceptions->render(function (PostTooLargeException $e) {
            return response()->json(['error' => 'El archivo es demasiado grande para el servidor (revisa post_max_size y upload_max_filesize del hosting).'], 413);
        });
        $exceptions->render(function (Throwable $e, Request $r) {
            if (! $r->is('api/*')) {
                return null;
            }
            $codigo = $e instanceof HttpExceptionInterface ? $e->getStatusCode() : 500;
            if ($codigo >= 500) {
                report($e);
            }
            return response()->json(['error' => $codigo >= 500 ? 'Error interno del servidor' : ($e->getMessage() ?: 'Error')], $codigo);
        });
    })->create();
