<?php

namespace App\Reembolso;

use App\Servicios\ErrorUso;
use App\Servicios\Fechas;
use App\Servicios\Imagenes;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Plantilla «Solicitud de reembolso»: guardar, consultar por enlace, aprobar o rechazar y generar el PDF. */
class Solicitudes
{
    /** Número de factura como lo genera el PDF original (aammddHHMM); si ya existe se le añade un sufijo. */
    private static function numeroFactura(Carbon $fecha, int $intento): string
    {
        $base = $fecha->format('ymdHi');
        return $intento === 0 ? $base : "{$base}-".($intento + 1);
    }

    public static function crear(array $datos, string $firmaDataUrl): array
    {
        $firma = Imagenes::guardar(Imagenes::desdeDataUrl($firmaDataUrl, Validacion::LIMITES['firmaBytes']), 'reembolsos');
        $ahora = now();
        $tokens = ['solicitante' => Str::random(32), 'aprobador' => Str::random(32)];
        $total = Calculos::calcular($datos)['total'];
        for ($intento = 0; $intento < 50; $intento++) {
            $numero = self::numeroFactura($ahora->copy()->setTimezone(config('autograflow.zona')), $intento);
            try {
                DB::table('solicitudes')->insert([
                    'numero_factura' => $numero, 'token_solicitante' => $tokens['solicitante'], 'token_aprobador' => $tokens['aprobador'],
                    'nombre' => $datos['contacto']['nombre'], 'estaca' => $datos['contacto']['estaca'], 'barrio' => $datos['contacto']['barrio'],
                    'telefono' => $datos['contacto']['telefono'], 'total_centavos' => $total, 'datos' => json_encode($datos, JSON_UNESCAPED_UNICODE),
                    'firma_solicitante' => $firma, 'firmado_en' => $ahora, 'created_at' => $ahora, 'updated_at' => $ahora,
                ]);
                return ['numeroFactura' => $numero, 'tokenSolicitante' => $tokens['solicitante'], 'tokenAprobador' => $tokens['aprobador']];
            } catch (QueryException $e) {
                if (! str_contains($e->getMessage(), 'numero_factura')) {
                    Imagenes::borrar($firma);
                    throw $e;
                }
            }
        }
        Imagenes::borrar($firma);
        throw new ErrorUso('No se pudo asignar un número de factura', 500);
    }

    /** Busca por cualquiera de los dos enlaces y dice a quién pertenece. */
    public static function porToken(string $t): array
    {
        if (! preg_match('/^[A-Za-z0-9_-]{32}$/', $t)) {
            throw new ErrorUso('Enlace no válido', 404);
        }
        $s = DB::table('solicitudes')->where('token_solicitante', $t)->orWhere('token_aprobador', $t)->first() ?? throw new ErrorUso('Enlace no válido', 404);
        return [$s, $s->token_solicitante === $t ? 'solicitante' : 'aprobador'];
    }

    public static function publica(object $s, string $rol): array
    {
        return [
            'rol' => $rol, 'numeroFactura' => $s->numero_factura, 'estado' => $s->estado, 'datos' => json_decode($s->datos, true),
            'firmadoEn' => Fechas::iso($s->firmado_en), 'aprobadorNombre' => $s->aprobador_nombre, 'decididoEn' => Fechas::iso($s->decidido_en),
            'motivoRechazo' => $s->motivo_rechazo,
            // Solo el solicitante recibe el enlace para enviárselo a quien aprueba.
            ...($rol === 'solicitante' ? ['tokenAprobador' => $s->token_aprobador] : []),
        ];
    }

    /** Aprueba o rechaza solo si sigue pendiente; devuelve false si alguien ya decidió. */
    public static function decidir(string $tokenAprobador, array $d): bool
    {
        $firma = $d['decision'] === 'aprobada' ? Imagenes::guardar(Imagenes::desdeDataUrl($d['firma'], Validacion::LIMITES['firmaBytes']), 'reembolsos') : null;
        $cambiados = DB::table('solicitudes')->where('token_aprobador', $tokenAprobador)->where('estado', 'pendiente')->update([
            'estado' => $d['decision'], 'aprobador_nombre' => $d['nombre'], 'firma_aprobador' => $firma,
            'motivo_rechazo' => $d['decision'] === 'rechazada' ? $d['motivo'] : null, 'decidido_en' => now(), 'updated_at' => now(),
        ]);
        if ($cambiados !== 1 && $firma) {
            Imagenes::borrar($firma);
        }
        return $cambiados === 1;
    }

    public static function pdf(object $s): string
    {
        $local = fn ($v) => $v ? Carbon::parse($v, 'UTC')->setTimezone(config('autograflow.zona')) : null;
        return PdfReembolso::generar([
            'numeroFactura' => $s->numero_factura, 'estado' => $s->estado, 'datos' => json_decode($s->datos, true),
            'firmaSolicitante' => Imagenes::leer($s->firma_solicitante), 'firmadoEn' => $local($s->firmado_en),
            'aprobadorNombre' => $s->aprobador_nombre, 'firmaAprobador' => $s->firma_aprobador ? Imagenes::leer($s->firma_aprobador) : null,
            'decididoEn' => $local($s->decidido_en), 'motivoRechazo' => $s->motivo_rechazo,
        ]);
    }

    public static function listar(?string $estado, ?string $buscar): array
    {
        $q = DB::table('solicitudes');
        if ($estado) {
            $q->where('estado', $estado);
        }
        if ($buscar) {
            $like = '%'.addcslashes($buscar, '%_\\').'%';
            $q->where(fn ($w) => $w->where('nombre', 'like', $like)->orWhere('estaca', 'like', $like)->orWhere('barrio', 'like', $like)->orWhere('numero_factura', 'like', $like));
        }
        return $q->orderByDesc('created_at')->orderByDesc('id')->limit(500)->get()->map(fn ($f) => [
            'numeroFactura' => $f->numero_factura, 'token' => $f->token_solicitante, 'estado' => $f->estado, 'nombre' => $f->nombre,
            'estaca' => $f->estaca, 'barrio' => $f->barrio, 'totalCentavos' => (int) $f->total_centavos,
            'firmadoEn' => Fechas::iso($f->firmado_en), 'decididoEn' => Fechas::iso($f->decidido_en), 'aprobadorNombre' => $f->aprobador_nombre,
        ])->all();
    }
}
