<?php

namespace App\Servicios;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Plan Básico como suscripción mensual de Mercado Pago (API de preapproval, sin plan asociado).
 *
 *  1. El cliente elige Básico: se crea la suscripción «pending» y se le lleva a init_point, donde ingresa su tarjeta.
 *  2. La primera vez (por cuenta, correo normalizado y pagador de Mercado Pago) el primer cobro se agenda a 7 días
 *     (start_date): durante la prueba ya tiene el plan Básico.
 *  3. Cada cobro mensual aprobado (subscription_authorized_payment) queda en «pagos» y extiende el plan un mes.
 *     Si un cobro falla, Mercado Pago lo reintenta; mientras tanto el plan vence solo al pasar su fecha.
 *  4. Cancelar (desde Mi Plan o desde Mercado Pago) corta el plan al instante y no se vuelve a cobrar.
 *
 * Los avisos de suscripciones se activan en el panel de Mercado Pago (Webhooks → «Planes y suscripciones»),
 * con la misma URL /api/pagos/webhook que los pagos.
 */
class Suscripciones
{
    /** Margen después de la fecha de cobro, para que un cobro que tarda unas horas no corte el plan. */
    private const GRACIA_DIAS = 2;

    private static function api(string $metodo, string $ruta, array $cuerpo = [], ?string $idempotencia = null): array
    {
        $c = config('autograflow.mercadopago');
        $peticion = Http::timeout(30)->withToken($c['token'])->acceptJson();
        if ($idempotencia) {
            $peticion = $peticion->withHeaders(['X-Idempotency-Key' => $idempotencia]);
        }
        $r = match ($metodo) {
            'POST' => $peticion->post($c['api'].$ruta, $cuerpo),
            'PUT' => $peticion->put($c['api'].$ruta, $cuerpo),
            default => $peticion->get($c['api'].$ruta, $cuerpo),
        };
        if (! $r->successful()) {
            throw new RuntimeException("Mercado Pago respondió {$r->status()}: ".Str::limit($r->body(), 300));
        }
        return $r->json() ?? [];
    }

    public static function esSuscripcion(string $idPlan): bool
    {
        return ! empty(Planes::catalogo()['planes'][$idPlan]['suscripcion']);
    }

    private static function referencia(int $id): string
    {
        return "afs-{$id}";
    }

    private static function deReferencia(?string $ref): ?int
    {
        return $ref && preg_match('/^afs-(\d+)$/', $ref, $m) ? (int) $m[1] : null;
    }

    private static function identidadCuenta(int $cuentaId): string
    {
        return Referidos::identidad((string) DB::table('users')->where('cuenta_id', $cuentaId)->orderBy('id')->value('email'));
    }

    /** La prueba gratuita es solo la primera vez: ni esta cuenta ni su correo (normalizado) la usaron antes. */
    public static function pruebaDisponible(int $cuentaId): bool
    {
        $identidad = self::identidadCuenta($cuentaId);
        return ! DB::table('suscripciones')->whereNotNull('prueba_hasta')
            ->where(fn ($q) => $q->where('cuenta_id', $cuentaId)->orWhere('identidad', $identidad))->exists();
    }

    /** Suscripción activa de la cuenta (la que ve el cliente en Mi Plan), o null. */
    public static function vigenteDe(int $cuentaId): ?array
    {
        $s = DB::table('suscripciones')->where('cuenta_id', $cuentaId)->where('estado', 'activa')->orderByDesc('id')->first();
        return $s ? self::fila($s) : null;
    }

    public static function fila(object $s): array
    {
        $enPrueba = $s->prueba_hasta && Carbon::parse($s->prueba_hasta)->isFuture();
        return [
            'id' => $s->id, 'producto' => $s->producto, 'estado' => $s->estado, 'motivo' => $s->motivo,
            'monto' => (float) $s->monto, 'moneda' => $s->moneda, 'conPrueba' => (bool) $s->con_prueba, 'enPrueba' => $enPrueba,
            'pruebaHasta' => Fechas::iso($s->prueba_hasta), 'proximoCobro' => Fechas::iso($s->proximo_cobro),
            'canceladaEn' => Fechas::iso($s->cancelada_en), 'creadoEn' => Fechas::iso($s->created_at),
        ];
    }

    /** Crea la suscripción pendiente en Mercado Pago y devuelve la URL donde el cliente ingresa su tarjeta. */
    public static function crear(User $u, string $idPlan): array
    {
        $p = Planes::catalogo()['planes'][$idPlan] ?? null;
        if (! $p || empty($p['suscripcion'])) {
            throw new ErrorUso('Ese plan no es una suscripción');
        }
        if (! MercadoPago::activo()) {
            throw new ErrorUso('Los pagos en línea todavía no están activados. Escríbenos y activamos tu plan manualmente.', 503);
        }
        $cuentaId = $u->cuenta_id;
        if (DB::table('suscripciones')->where('cuenta_id', $cuentaId)->where('estado', 'activa')->exists()) {
            throw new ErrorUso("Ya tienes la suscripción {$p['nombre']} activa. Puedes verla o cancelarla en Mi Plan.", 409);
        }
        $actual = Planes::vigenteDe($cuentaId);
        if (in_array($actual, ['profesional', 'empresarial'], true)) {
            throw new ErrorUso('Tu plan actual ya incluye todo lo del Básico. Podrás suscribirte cuando venza.', 409);
        }
        $prueba = self::pruebaDisponible($cuentaId) ? (int) ($p['pruebaDias'] ?? 0) : 0;
        $moneda = config('autograflow.moneda');
        $id = DB::table('suscripciones')->insertGetId([
            'cuenta_id' => $cuentaId, 'user_id' => $u->id, 'producto' => $idPlan, 'monto' => $p['precio'], 'moneda' => $moneda,
            'con_prueba' => $prueba > 0, 'identidad' => self::identidadCuenta($cuentaId), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $base = rtrim(config('app.url'), '/');
        $recurrencia = ['frequency' => 1, 'frequency_type' => 'months', 'transaction_amount' => (float) $p['precio'], 'currency_id' => $moneda];
        if ($prueba > 0) {
            // El primer cobro se agenda al terminar la prueba; Mercado Pago no cobra antes.
            $recurrencia['start_date'] = now()->addDays($prueba)->utc()->format('Y-m-d\TH:i:s.v\Z');
        }
        $mp = self::api('POST', '/preapproval', [
            'reason' => "AutograFlow {$p['nombre']} — mensual",
            'external_reference' => self::referencia($id),
            'payer_email' => $u->email,
            'auto_recurring' => $recurrencia,
            'back_url' => "{$base}/app/suscripcion?s={$id}",
            'status' => 'pending',
        ], "afs-crear-{$id}");
        DB::table('suscripciones')->where('id', $id)->update(['mp_preapproval_id' => $mp['id'] ?? null, 'updated_at' => now()]);
        return ['suscripcionId' => $id, 'url' => $mp['init_point'], 'conPrueba' => $prueba > 0];
    }

    /** Al volver de Mercado Pago: consulta la suscripción y sus cobros (sirve aunque los avisos no hayan llegado). */
    public static function verificar(User $u, int $id): array
    {
        $s = DB::table('suscripciones')->where('id', $id)->where('cuenta_id', $u->cuenta_id)->first() ?? throw new ErrorUso('Suscripción no encontrada', 404);
        if ($s->mp_preapproval_id && MercadoPago::activo() && in_array($s->estado, ['pendiente', 'activa'], true)) {
            self::sincronizar(self::api('GET', '/preapproval/'.rawurlencode($s->mp_preapproval_id)));
            $cobros = self::api('GET', '/authorized_payments/search', ['preapproval_id' => $s->mp_preapproval_id])['results'] ?? [];
            foreach ($cobros as $cobro) {
                self::cobro($cobro);
            }
        }
        return self::fila(DB::table('suscripciones')->find($id));
    }

    /** Aviso «subscription_preapproval»: cambió el estado de la suscripción. */
    public static function procesarSuscripcion(string $mpId): void
    {
        self::sincronizar(self::api('GET', '/preapproval/'.rawurlencode($mpId)));
    }

    /** Aviso «subscription_authorized_payment»: un cobro mensual. */
    public static function procesarCobro(string $mpId): void
    {
        self::cobro(self::api('GET', '/authorized_payments/'.rawurlencode($mpId)));
    }

    private static function buscar(array $mp): ?object
    {
        $id = self::deReferencia($mp['external_reference'] ?? null);
        return ($id ? DB::table('suscripciones')->find($id) : null)
            ?? (isset($mp['id']) ? DB::table('suscripciones')->where('mp_preapproval_id', (string) $mp['id'])->first() : null);
    }

    private static function sincronizar(array $mp): void
    {
        $s = self::buscar($mp);
        if (! $s) {
            return;
        }
        $estado = $mp['status'] ?? '';
        $proximo = ! empty($mp['next_payment_date']) ? Carbon::parse($mp['next_payment_date'])->utc() : null;
        if ($estado === 'authorized' && $s->estado === 'pendiente') {
            self::autorizada($s, $mp, $proximo);
        } elseif ($estado === 'authorized' && $s->estado === 'activa') {
            DB::table('suscripciones')->where('id', $s->id)->update(['proximo_cobro' => $proximo, 'updated_at' => now()]);
        } elseif (in_array($estado, ['cancelled', 'paused'], true) && in_array($s->estado, ['pendiente', 'activa'], true)) {
            self::cortar($s, $estado === 'paused' ? 'pausada_en_mp' : 'cancelada_en_mp');
        }
    }

    /** El cliente ingresó su tarjeta. Con prueba, el plan empieza ya; sin prueba, empieza con el primer cobro aprobado. */
    private static function autorizada(object $s, array $mp, ?Carbon $proximo): void
    {
        $pagador = isset($mp['payer_id']) ? (string) $mp['payer_id'] : null;
        $repetida = $s->con_prueba && $pagador && DB::table('suscripciones')->where('mp_payer_id', $pagador)
            ->whereNotNull('prueba_hasta')->where('id', '!=', $s->id)->exists();
        if ($repetida) {
            // La misma cuenta de Mercado Pago ya tuvo la prueba con otra cuenta de AutograFlow: no se regala otra.
            rescue(fn () => self::api('PUT', '/preapproval/'.rawurlencode($s->mp_preapproval_id), ['status' => 'cancelled']), report: true);
            DB::table('suscripciones')->where('id', $s->id)->update(['estado' => 'rechazada', 'motivo' => 'prueba_usada',
                'mp_payer_id' => $pagador, 'cancelada_en' => now(), 'updated_at' => now()]);
            return;
        }
        DB::transaction(function () use ($s, $mp, $proximo, $pagador) {
            $cambiados = DB::table('suscripciones')->where('id', $s->id)->where('estado', 'pendiente')->update([
                'estado' => 'activa', 'mp_payer_id' => $pagador, 'proximo_cobro' => $proximo, 'updated_at' => now(),
                ...($s->con_prueba ? ['prueba_hasta' => self::finPrueba($mp, $s)] : []),
            ]);
            if ($cambiados !== 1) {
                return;
            }
            if ($s->con_prueba) {
                self::extender($s->cuenta_id, $s->producto, self::finPrueba($mp, $s)->copy()->addDays(self::GRACIA_DIAS));
            }
        }, 3);
    }

    private static function finPrueba(array $mp, object $s): Carbon
    {
        $inicio = $mp['auto_recurring']['start_date'] ?? null;
        return $inicio ? Carbon::parse($inicio)->utc() : Carbon::parse($s->created_at)->addDays(7);
    }

    /** Un cobro mensual: si se aprobó por el monto y la moneda de la suscripción, queda en «pagos» y extiende el plan. */
    private static function cobro(array $mp): void
    {
        $s = isset($mp['preapproval_id']) ? DB::table('suscripciones')->where('mp_preapproval_id', (string) $mp['preapproval_id'])->first() : null;
        $pago = $mp['payment'] ?? [];
        if (! $s || ($pago['status'] ?? '') !== 'approved' || empty($pago['id'])) {
            return;
        }
        if (abs((float) ($mp['transaction_amount'] ?? 0) - (float) $s->monto) > 0.009 || ($mp['currency_id'] ?? '') !== $s->moneda) {
            Log::warning("Suscripción {$s->id}: el cobro no coincide en monto o moneda", $mp);
            return;
        }
        $mpPagoId = (string) $pago['id'];
        $fecha = Carbon::parse($mp['debit_date'] ?? $mp['date_created'] ?? now())->utc();
        DB::transaction(function () use ($s, $mpPagoId, $fecha) {
            DB::table('suscripciones')->where('id', $s->id)->lockForUpdate()->first();
            if (DB::table('pagos')->where('mp_pago_id', $mpPagoId)->where('suscripcion_id', $s->id)->exists()) {
                return; // el aviso llegó dos veces
            }
            $plan = Planes::plan($s->producto);
            $pagoId = DB::table('pagos')->insertGetId([
                'cuenta_id' => $s->cuenta_id, 'user_id' => $s->user_id, 'producto' => $s->producto, 'titulo' => "AutograFlow {$plan['nombre']} — mensual",
                'monto' => $s->monto, 'moneda' => $s->moneda, 'estado' => 'aprobado', 'medio' => 'suscripcion', 'mp_pago_id' => $mpPagoId,
                'suscripcion_id' => $s->id, 'aplicado_en' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
            // Si el cliente ya canceló, el cobro queda registrado pero no reactiva el plan.
            if ($s->estado === 'activa') {
                self::extender($s->cuenta_id, $s->producto, $fecha->copy()->addMonthNoOverflow()->addDays(self::GRACIA_DIAS));
            }
            Referidos::pagoAprobado(DB::table('pagos')->find($pagoId));
        }, 3);
    }

    /** Deja la cuenta en el plan de la suscripción hasta la fecha dada (nunca la acorta). */
    private static function extender(int $cuentaId, string $idPlan, Carbon $hasta): void
    {
        $c = DB::table('cuentas')->where('id', $cuentaId)->lockForUpdate()->first();
        $vence = $c->plan_vence ? Carbon::parse($c->plan_vence) : null;
        if ($c->plan === $idPlan && $vence && $vence->greaterThan($hasta)) {
            return;
        }
        if (in_array(Planes::vigente($c->plan, $vence, (int) $c->creditos), ['profesional', 'empresarial'], true)) {
            return; // no rebaja un plan mayor que esté vigente
        }
        DB::table('cuentas')->where('id', $cuentaId)->update(['plan' => $idPlan, 'plan_vence' => $hasta, 'updated_at' => now()]);
    }

    /** El cliente cancela desde Mi Plan: se cancela en Mercado Pago y el plan se corta al instante. */
    public static function cancelar(User $u): array
    {
        $s = DB::table('suscripciones')->where('cuenta_id', $u->cuenta_id)->where('estado', 'activa')->orderByDesc('id')->first()
            ?? throw new ErrorUso('No tienes una suscripción activa.', 404);
        self::api('PUT', '/preapproval/'.rawurlencode($s->mp_preapproval_id), ['status' => 'cancelled']);
        self::cortar($s, 'cancelada_por_cliente');
        return self::fila(DB::table('suscripciones')->find($s->id));
    }

    /** Al comprar Profesional o Empresarial se cancela el Básico para no seguir cobrándolo (el plan nuevo ya está aplicado). */
    public static function reemplazarPorPlan(int $cuentaId): void
    {
        $s = DB::table('suscripciones')->where('cuenta_id', $cuentaId)->where('estado', 'activa')->first();
        if (! $s) {
            return;
        }
        rescue(fn () => self::api('PUT', '/preapproval/'.rawurlencode($s->mp_preapproval_id), ['status' => 'cancelled']), report: true);
        self::cortar($s, 'cambio_de_plan');
    }

    private static function cortar(object $s, string $motivo): void
    {
        DB::transaction(function () use ($s, $motivo) {
            DB::table('suscripciones')->where('id', $s->id)->update(['estado' => 'cancelada', 'motivo' => $motivo, 'proximo_cobro' => null,
                'cancelada_en' => now(), 'updated_at' => now()]);
            // Solo se quita el plan si sigue siendo el de la suscripción (un Profesional comprado después se respeta).
            DB::table('cuentas')->where('id', $s->cuenta_id)->where('plan', $s->producto)
                ->update(['plan' => 'gratis', 'plan_vence' => null, 'updated_at' => now()]);
        }, 3);
    }
}
