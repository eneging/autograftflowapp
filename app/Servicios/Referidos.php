<?php

namespace App\Servicios;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Support\Carbon;

class Referidos
{
    public static function reglas(): array
    {
        return config('referidos');
    }

    public static function codigo(int $cuentaId): string
    {
        return DB::transaction(function () use ($cuentaId) {
            $c = DB::table('cuentas')->where('id', $cuentaId)->lockForUpdate()->first();
            if (! $c || $c->invitado) { throw new ErrorUso('Crea tu cuenta para invitar a otras personas.', 403); }
            if ($c->codigo_referido) { return $c->codigo_referido; }
            do { $codigo = 'AF-'.strtoupper(Str::random(12)); } while (DB::table('cuentas')->where('codigo_referido', $codigo)->exists());
            DB::table('cuentas')->where('id', $cuentaId)->update(['codigo_referido' => $codigo]);
            return $codigo;
        });
    }

    public static function normalizar(string $codigo): string
    {
        return strtoupper(trim($codigo));
    }

    /** Solo en el registro de una cuenta nueva o al convertir una cuenta de invitado. */
    public static function asociar(int $cuentaId, string $codigo, string $email): void
    {
        $codigo = self::normalizar($codigo);
        if ($codigo === '') { return; }
        if (! config('referidos.activo')) { throw new ErrorUso('El programa de referidos está pausado.', 400, ['codigoReferido' => 'Puedes continuar quitando el código.']); }
        $origen = DB::table('cuentas')->where('codigo_referido', $codigo)->where('invitado', false)->first();
        if (! $origen) { throw new ErrorUso('Revisa tu código de referido.', 400, ['codigoReferido' => 'Este código no es válido.']); }
        if ($origen->id === $cuentaId || self::mismoTitular($origen->id, $email)) {
            throw new ErrorUso('No puedes usar tu propio código de referido.', 400, ['codigoReferido' => 'El código debe ser de otra persona.']);
        }
        if (DB::table('referidos')->where('referido_id', $cuentaId)->exists()
            || DB::table('pagos')->where('cuenta_id', $cuentaId)->whereNotNull('aplicado_en')->exists()) {
            throw new ErrorUso('Esta cuenta ya tiene un referido o una compra previa.', 409);
        }
        DB::table('referidos')->insert(['referidor_id' => $origen->id, 'referido_id' => $cuentaId, 'codigo' => $codigo,
            'reglas' => json_encode(self::reglas()), 'created_at' => now(), 'updated_at' => now()]);
    }

    private static function identidad(string $email): string
    {
        [$usuario, $dominio] = array_pad(explode('@', strtolower(trim($email)), 2), 2, '');
        if (in_array($dominio, ['gmail.com', 'googlemail.com'], true)) {
            return str_replace('.', '', explode('+', $usuario)[0]).'@gmail.com';
        }
        return strtolower(trim($email));
    }

    private static function mismoTitular(int $cuentaId, string $email): bool
    {
        return DB::table('users')->where('cuenta_id', $cuentaId)->pluck('email')
            ->contains(fn ($e) => self::identidad($e) === self::identidad($email));
    }

    /** Se ejecuta en la transacción del primer pago aprobado, después de entregar el plan. */
    public static function pagoAprobado(object $pago): void
    {
        $r = DB::table('referidos')->where('referido_id', $pago->cuenta_id)->lockForUpdate()->first();
        if (! $r || $r->pago_id || $r->estado !== 'registrado') { return; }
        $reglas = json_decode($r->reglas, true);
        $bono = (int) ($reglas['bonos'][$pago->producto] ?? 0);
        if ($pago->monto <= 0 || $bono <= 0) { return; }
        DB::table('referidos')->where('id', $r->id)->update(['pago_id' => $pago->id, 'documentos' => $bono,
            'estado' => 'en_espera', 'liberar_en' => now()->addDays($reglas['espera_dias']), 'updated_at' => now()]);
    }

    public static function anularPago(int $pagoId): void
    {
        DB::transaction(function () use ($pagoId) {
            $fila = DB::table('referidos')->where('pago_id', $pagoId)->first();
            if (! $fila) { return; }
            // Orden compartido con consumo y acreditación: cuenta del referidor antes de bloquear el bono.
            DB::table('cuentas')->where('id', $fila->referidor_id)->lockForUpdate()->first();
            DB::table('referidos')->where('id', $fila->id)->update(['estado' => 'anulado', 'restantes' => 0,
                'motivo' => 'Pago reembolsado, cancelado o con contracargo.', 'updated_at' => now()]);
        });
    }

    public static function acreditar(?int $cuentaId = null): void
    {
        $q = DB::table('referidos')->where('estado', 'en_espera')->where('liberar_en', '<=', now());
        if ($cuentaId !== null) { $q->where('referidor_id', $cuentaId); }
        foreach ($q->orderBy('liberar_en')->orderBy('id')->limit(200)->get(['id', 'referidor_id']) as $fila) {
            DB::transaction(function () use ($fila) {
                DB::table('cuentas')->where('id', $fila->referidor_id)->lockForUpdate()->first();
                $r = DB::table('referidos')->where('id', $fila->id)->lockForUpdate()->first();
                if ($r->estado !== 'en_espera' || Carbon::parse($r->liberar_en)->isFuture()) { return; }
                $pago = DB::table('pagos')->find($r->pago_id);
                if (! $pago || $pago->estado !== 'aprobado') {
                    DB::table('referidos')->where('id', $r->id)->update(['estado' => 'anulado', 'restantes' => 0, 'motivo' => 'El pago no está aprobado.', 'updated_at' => now()]);
                    return;
                }
                $reglas = json_decode($r->reglas, true);
                $acreditados = DB::table('referidos')->where('referidor_id', $r->referidor_id)
                    ->where('acreditado_en', '>=', Planes::inicioMes())->sum('documentos');
                if ($acreditados + $r->documentos > $reglas['tope_mensual']) {
                    // Se difiere el bono completo; no se recorta ni se pierde al llegar al tope.
                    DB::table('referidos')->where('id', $r->id)->update(['liberar_en' => now(config('autograflow.zona'))->addMonthNoOverflow()->startOfMonth()->utc(), 'updated_at' => now()]);
                    return;
                }
                DB::table('referidos')->where('id', $r->id)->update(['estado' => 'acreditado', 'restantes' => $r->documentos,
                    'acreditado_en' => now(), 'vence_en' => now()->addDays($reglas['vigencia_dias']), 'updated_at' => now()]);
            }, 3);
        }
    }

    public static function saldo(int $cuentaId): int
    {
        return (int) DB::table('referidos')->where('referidor_id', $cuentaId)->where('estado', 'acreditado')
            ->where('vence_en', '>', now())->sum('restantes');
    }

    /** Dentro de la transacción de envío y con la cuenta bloqueada. Vence primero, se consume primero. */
    public static function consumir(int $cuentaId): ?int
    {
        $r = DB::table('referidos')->where('referidor_id', $cuentaId)->where('estado', 'acreditado')
            ->where('vence_en', '>', now())->where('restantes', '>', 0)->orderBy('vence_en')->orderBy('id')->lockForUpdate()->first();
        if (! $r) { return null; }
        DB::table('referidos')->where('id', $r->id)->decrement('restantes');
        return $r->id;
    }

    public static function estado(int $cuentaId, ?string $urlActual = null): array
    {
        $codigo = self::codigo($cuentaId);
        self::acreditar($cuentaId);
        $filas = DB::table('referidos')->where('referidor_id', $cuentaId)->orderByDesc('id')->limit(100)->get();
        return ['codigo' => $codigo, 'enlace' => rtrim($urlActual ?? config('app.url'), '/').'/registro?ref='.rawurlencode($codigo),
            'reglas' => self::reglas(), 'saldo' => self::saldo($cuentaId),
            'registrados' => DB::table('referidos')->where('referidor_id', $cuentaId)->count(),
            'conCompra' => DB::table('referidos')->where('referidor_id', $cuentaId)->whereNotNull('pago_id')->where('estado', '!=', 'anulado')->count(),
            'historial' => $filas->map(fn ($r) => ['id' => $r->id, 'alias' => 'Invitación #'.$r->id,
                'estado' => $r->estado === 'acreditado' && Carbon::parse($r->vence_en)->isPast() ? 'vencido' : $r->estado,
                'documentos' => $r->documentos, 'restantes' => $r->restantes, 'creadoEn' => Fechas::iso($r->created_at),
                'liberarEn' => Fechas::iso($r->liberar_en), 'venceEn' => Fechas::iso($r->vence_en)])->all()];
    }
}
