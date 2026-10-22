<?php

namespace App\Servicios;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Cobros con Mercado Pago (Checkout Pro). El cliente paga en la página segura de Mercado Pago;
 * el plan se entrega solo cuando el propio Mercado Pago confirma que el pago fue aprobado
 * por el monto y la moneda correctos.
 */
class MercadoPago
{
    public static function activo(): bool
    {
        return config('autograflow.mercadopago.token') !== '';
    }

    private static function api(string $metodo, string $ruta, array $cuerpo = [], ?string $idempotencia = null): array
    {
        $c = config('autograflow.mercadopago');
        $peticion = Http::timeout(30)->withToken($c['token'])->acceptJson();
        if ($idempotencia) {
            $peticion = $peticion->withHeaders(['X-Idempotency-Key' => $idempotencia]);
        }
        $r = $metodo === 'POST' ? $peticion->post($c['api'].$ruta, $cuerpo) : $peticion->get($c['api'].$ruta, $cuerpo);
        if (! $r->successful()) {
            throw new RuntimeException("Mercado Pago respondió {$r->status()}: ".Str::limit($r->body(), 300));
        }
        return $r->json() ?? [];
    }

    private static function referencia(int $pagoId): string
    {
        return "af-{$pagoId}";
    }

    private static function pagoDeReferencia(?string $ref): ?int
    {
        return $ref && preg_match('/^af-(\d+)$/', $ref, $m) ? (int) $m[1] : null;
    }

    /** Crea el pago pendiente y la preferencia de Checkout Pro; devuelve la URL donde el cliente paga. */
    public static function crearPago(User $u, string $idProducto): array
    {
        $p = Planes::producto($idProducto) ?? throw new ErrorUso('Ese plan no existe');
        if (! self::activo()) {
            throw new ErrorUso('Los pagos en línea todavía no están activados. Escríbenos y activamos tu plan manualmente.', 503);
        }
        $moneda = config('autograflow.moneda');
        $pagoId = DB::table('pagos')->insertGetId([
            'cuenta_id' => $u->cuenta_id, 'user_id' => $u->id, 'producto' => $idProducto, 'titulo' => $p['titulo'],
            'monto' => $p['precio'], 'moneda' => $moneda, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $base = rtrim(config('app.url'), '/');
        $vuelta = "{$base}/app/pago?pago={$pagoId}";
        $segura = str_starts_with($base, 'https://');
        $pref = self::api('POST', '/checkout/preferences', [
            'items' => [['id' => $idProducto, 'title' => $p['titulo'], 'quantity' => 1, 'unit_price' => $p['precio'], 'currency_id' => $moneda]],
            'payer' => ['email' => $u->email, 'name' => $u->name],
            'external_reference' => self::referencia($pagoId),
            'back_urls' => ['success' => $vuelta, 'failure' => $vuelta, 'pending' => $vuelta],
            // Mercado Pago solo vuelve solo al sitio y envía avisos a direcciones públicas con https.
            ...($segura ? ['auto_return' => 'approved', 'notification_url' => "{$base}/api/pagos/webhook"] : []),
            'statement_descriptor' => 'AUTOGRAFLOW',
        ], "af-pref-{$pagoId}");
        DB::table('pagos')->where('id', $pagoId)->update(['mp_preferencia' => $pref['id'] ?? null]);
        return ['pagoId' => $pagoId, 'url' => $pref['init_point']];
    }

    /** Aviso del webhook: se consulta el pago a Mercado Pago (la única fuente confiable). */
    public static function procesarPago(string $mpPagoId): ?int
    {
        return self::actualizar(self::api('GET', '/v1/payments/'.rawurlencode($mpPagoId)));
    }

    private static function actualizar(array $pmp): ?int
    {
        $pagoId = self::pagoDeReferencia($pmp['external_reference'] ?? null);
        $pago = $pagoId ? DB::table('pagos')->find($pagoId) : null;
        if (! $pago) {
            return null;
        }
        $estado = $pmp['status'] ?? '';
        if ($estado === 'approved') {
            // Se comprueba que se pagó el monto y la moneda del pedido antes de entregar nada.
            if (abs((float) ($pmp['transaction_amount'] ?? 0) - (float) $pago->monto) > 0.009 || ($pmp['currency_id'] ?? '') !== $pago->moneda) {
                Log::warning("Pago {$pagoId}: monto o moneda no coinciden", $pmp);
                return $pagoId;
            }
            self::aplicar($pagoId, (string) $pmp['id']);
        } elseif (in_array($estado, ['rejected', 'cancelled', 'refunded', 'charged_back'], true)) {
            if (in_array($estado, ['cancelled', 'refunded', 'charged_back'], true)
                && $pago->aplicado_en && (string) $pago->mp_pago_id === (string) ($pmp['id'] ?? '')) {
                DB::transaction(function () use ($pago) {
                    DB::table('pagos')->where('id', $pago->id)->update(['estado' => 'cancelado', 'updated_at' => now()]);
                    Referidos::anularPago($pago->id);
                }, 3);
            }
            DB::table('pagos')->where('id', $pagoId)->whereNull('aplicado_en')
                ->update(['estado' => $estado === 'rejected' ? 'rechazado' : 'cancelado', 'mp_pago_id' => (string) $pmp['id'], 'updated_at' => now()]);
        }
        return $pagoId;
    }

    /** Marca el pago como aprobado y entrega lo comprado. Idempotente: si el aviso llega dos veces, se aplica una sola. */
    public static function aplicar(int $pagoId, ?string $mpPagoId): bool
    {
        return DB::transaction(function () use ($pagoId, $mpPagoId) {
            $cambiados = DB::table('pagos')->where('id', $pagoId)->whereNull('aplicado_en')->update([
                'estado' => 'aprobado', 'mp_pago_id' => $mpPagoId ?? DB::raw('mp_pago_id'), 'aplicado_en' => now(), 'updated_at' => now(),
            ]);
            if ($cambiados !== 1) {
                return false;
            }
            $pago = DB::table('pagos')->find($pagoId);
            Planes::entregar((int) $pago->cuenta_id, $pago->producto);
            Referidos::pagoAprobado($pago);
            return true;
        }, 3);
    }

    /** Al volver de Mercado Pago: busca el pago por su referencia (sirve aunque el aviso no haya llegado todavía). */
    public static function verificar(User $u, int $pagoId): array
    {
        $pago = DB::table('pagos')->where('id', $pagoId)->where('cuenta_id', $u->cuenta_id)->first() ?? throw new ErrorUso('Pago no encontrado', 404);
        if ($pago->estado === 'pendiente' && self::activo()) {
            $r = self::api('GET', '/v1/payments/search', ['external_reference' => self::referencia($pagoId), 'sort' => 'date_created', 'criteria' => 'desc']);
            $resultados = $r['results'] ?? [];
            $aprobado = collect($resultados)->firstWhere('status', 'approved');
            foreach ($aprobado ? [$aprobado] : array_slice($resultados, 0, 1) as $x) {
                self::actualizar($x);
            }
        }
        return self::fila(DB::table('pagos')->find($pagoId));
    }

    /**
     * Firma de los avisos (cabecera x-signature: «ts=…,v1=…»): HMAC-SHA256 de
     * «id:<data.id>;request-id:<x-request-id>;ts:<ts>;» con la clave secreta del webhook.
     */
    public static function firmaValida(string $secreto, ?string $firma, ?string $requestId, string $dataId): bool
    {
        if (! $firma) {
            return false;
        }
        $partes = [];
        foreach (explode(',', $firma) as $p) {
            [$k, $v] = array_pad(explode('=', trim($p), 2), 2, '');
            $partes[$k] = $v;
        }
        if (empty($partes['ts']) || empty($partes['v1'])) {
            return false;
        }
        $id = preg_match('/^[a-z0-9]+$/i', $dataId) ? strtolower($dataId) : $dataId;
        $manifiesto = "id:{$id};".($requestId ? "request-id:{$requestId};" : '')."ts:{$partes['ts']};";
        return hash_equals(hash_hmac('sha256', $manifiesto, $secreto), $partes['v1']);
    }

    public static function fila(object $p): array
    {
        return [
            'id' => $p->id, 'producto' => $p->producto, 'titulo' => $p->titulo, 'monto' => (float) $p->monto, 'moneda' => $p->moneda,
            'estado' => $p->estado, 'creadoEn' => Fechas::iso($p->created_at), 'aplicadoEn' => Fechas::iso($p->aplicado_en),
        ];
    }

    /** Activación manual (transferencia, Yape, Plin…): se registra como pago «manual» y se aplica. */
    public static function activarManual(int $cuentaId, string $idProducto): void
    {
        $p = Planes::producto($idProducto) ?? throw new ErrorUso('Ese plan no existe');
        $u = DB::table('users')->where('cuenta_id', $cuentaId)->orderBy('id')->first() ?? throw new ErrorUso('Cuenta no encontrada', 404);
        $id = DB::table('pagos')->insertGetId([
            'cuenta_id' => $cuentaId, 'user_id' => $u->id, 'producto' => $idProducto, 'titulo' => $p['titulo'], 'monto' => $p['precio'],
            'moneda' => config('autograflow.moneda'), 'medio' => 'manual', 'created_at' => now(), 'updated_at' => now(),
        ]);
        self::aplicar($id, null);
    }
}
