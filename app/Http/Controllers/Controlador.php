<?php

namespace App\Http\Controllers;

use App\Servicios\ErrorUso;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/** Utilidades comunes de la API. */
abstract class Controlador
{
    /** IP y navegador de quien hace la petición (para la auditoría). */
    protected function origen(Request $r): array
    {
        return ['ip' => $r->ip() ? preg_replace('/^::ffff:/', '', $r->ip()) : null, 'agente' => $r->userAgent()];
    }

    /** Valida con las reglas de Laravel y devuelve los errores con el formato de la página: {"campo.ruta": "mensaje"}. */
    protected function validar(array $datos, array $reglas, array $mensajes = []): array
    {
        $v = Validator::make($datos, $reglas, $mensajes);
        if ($v->fails()) {
            throw new ErrorUso('Revisa los datos', 400, collect($v->errors()->messages())->map(fn ($m) => $m[0])->all());
        }
        return $v->validated();
    }

    protected function responderPdf(string $bytes, string $nombre, bool $descargar)
    {
        $limpio = substr(preg_replace('/[^\w.-]+/', '_', \Illuminate\Support\Str::ascii($nombre)), 0, 100) ?: 'documento';
        return response($bytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => ($descargar ? 'attachment' : 'inline')."; filename=\"{$limpio}.pdf\"",
            'Cache-Control' => 'private, no-store',
        ]);
    }

    protected function responderImagen(string $bytes)
    {
        return response($bytes, 200, ['Content-Type' => \App\Servicios\Imagenes::tipoMime($bytes), 'Cache-Control' => 'private, max-age=600']);
    }
}
