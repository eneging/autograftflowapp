<?php

namespace App\Servicios;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Planes y cupo de documentos. El catálogo está en resources/shared/planes.json (lo usa también la página).
 *  - Gratis y Ocasional: 2 documentos por día (en la zona horaria de ZONA_HORARIA). Ocasional suma 10 créditos y no vence.
 *  - Profesional: 180 documentos por mes durante 30 días. Empresarial: ilimitado durante 365 días, hasta 5 usuarios.
 *  - Los créditos (documentos comprados) no vencen y se usan cuando se acaba el cupo del periodo.
 */
class Planes
{
    private static ?array $catalogo = null;

    public static function catalogo(): array
    {
        return self::$catalogo ??= json_decode(file_get_contents(resource_path('shared/planes.json')), true, flags: JSON_THROW_ON_ERROR);
    }

    public static function plan(string $id): array
    {
        return self::catalogo()['planes'][$id] ?? self::catalogo()['planes']['gratis'];
    }

    /** Lo que se puede comprar: cualquier plan de pago. */
    public static function producto(string $id): ?array
    {
        $p = self::catalogo()['planes'][$id] ?? null;
        if (! $p || $p['precio'] <= 0) {
            return null;
        }
        $titulo = $p['dias'] ? "AutograFlow {$p['nombre']} — {$p['dias']} días" : "AutograFlow {$p['nombre']} — {$p['creditos']} documentos";
        return ['tipo' => 'plan', 'id' => $id, 'plan' => $p, 'precio' => (float) $p['precio'], 'titulo' => $titulo];
    }

    /**
     * Plan vigente: los planes con vencimiento valen hasta su fecha; Ocasional no vence.
     * Si un plan con vencimiento ya venció pero quedan créditos comprados, se sigue con las reglas de Ocasional.
     */
    public static function vigente(string $plan, ?CarbonInterface $vence, int $creditos = 0, ?CarbonInterface $ahora = null): string
    {
        $p = self::catalogo()['planes'][$plan] ?? null;
        if (! $p || $plan === 'gratis') {
            return 'gratis';
        }
        if ($p['dias'] === null || ($vence && $vence->greaterThan($ahora ?? now()))) {
            return $plan;
        }
        return $creditos > 0 ? 'ocasional' : 'gratis';
    }

    /** De dónde sale el próximo documento: del cupo del periodo, de los créditos o de ninguno (límite alcanzado). */
    public static function origen(int $usados, ?int $limite, int $creditos): ?string
    {
        if ($limite === null || $usados < $limite) {
            return 'plan';
        }
        return $creditos > 0 ? 'credito' : null;
    }

    /** Inicio del periodo del cupo (hoy o este mes) según la zona horaria del negocio, en UTC como la base. */
    public static function inicioPeriodo(string $periodo): Carbon
    {
        $local = now(config('autograflow.zona'));
        return ($periodo === 'dia' ? $local->startOfDay() : $local->startOfMonth())->utc();
    }

    public static function inicioMes(): Carbon
    {
        return self::inicioPeriodo('mes');
    }

    private static function datos(int $cuentaId, bool $bloquear = false): array
    {
        $q = DB::table('cuentas')->where('id', $cuentaId);
        $c = ($bloquear ? $q->lockForUpdate() : $q)->first();
        $vence = $c->plan_vence ? Carbon::parse($c->plan_vence) : null;
        $plan = self::vigente($c->plan, $vence, (int) $c->creditos);
        $usados = DB::table('consumos')->where('cuenta_id', $cuentaId)->where('origen', 'plan')
            ->where('creado_en', '>=', self::inicioPeriodo(self::plan($plan)['periodo']))->count();
        return [
            'plan' => $plan, 'contratado' => isset(self::catalogo()['planes'][$c->plan]) ? $c->plan : 'gratis',
            'vence' => $vence, 'creditos' => (int) $c->creditos, 'usados' => $usados, 'invitado' => (bool) ($c->invitado ?? false),
        ];
    }

    /** Firmantes por documento: sin cuenta, el plan Gratis admite menos (firmantesSinCuenta). */
    private static function maxFirmantes(array $p, bool $invitado): int
    {
        return $invitado && isset($p['firmantesSinCuenta']) ? (int) $p['firmantesSinCuenta'] : (int) $p['firmantesPorDocumento'];
    }

    /** Estado que ve el cliente en «Mi plan». */
    public static function estado(int $cuentaId): array
    {
        $d = self::datos($cuentaId);
        $p = self::plan($d['plan']);
        $limite = $p['documentos'];
        return [
            'plan' => $d['plan'], 'planContratado' => $d['contratado'],
            'vence' => self::plan($d['plan'])['dias'] ? $d['vence']?->toIso8601ZuluString() : null,
            'usados' => $d['usados'], 'limite' => $limite, 'periodo' => $p['periodo'], 'creditos' => $d['creditos'],
            'firmantesPorDocumento' => self::maxFirmantes($p, $d['invitado']), 'invitado' => $d['invitado'], 'selloHuella' => $p['selloHuella'],
            'disponibles' => $limite === null ? null : max(0, $limite - $d['usados']) + $d['creditos'],
            'usuarios' => $p['usuarios'], 'moneda' => config('autograflow.moneda'), 'pagosActivos' => MercadoPago::activo(),
        ];
    }

    /**
     * Al enviar un documento (dentro de la transacción): comprueba los límites del plan (firmantes, sello y huella)
     * y descuenta un documento, primero del cupo del periodo y después de los créditos.
     */
    public static function consumirEnvio(int $cuentaId, int $documentoId, int $firmantes, array $tipos = []): void
    {
        $d = self::datos($cuentaId, true);
        $p = self::plan($d['plan']);
        $max = self::maxFirmantes($p, $d['invitado']);
        if ($firmantes > $max) {
            throw new ErrorUso($d['invitado']
                ? "Sin cuenta puedes usar {$max} solo firmante por documento. Crea tu cuenta gratis para usar hasta {$p['firmantesPorDocumento']}, o elige un plan para más."
                : "Tu plan {$p['nombre']} permite hasta {$max} firmantes por documento. Elige un plan para agregar más.", 402);
        }
        if (! $p['selloHuella'] && array_intersect(['sello', 'huella'], $tipos)) {
            throw new ErrorUso("El sello y la huella están disponibles en los planes de pago. El plan {$p['nombre']} permite solo firmas.", 402);
        }
        $origen = self::origen($d['usados'], $p['documentos'], $d['creditos']);
        if (! $origen) {
            $cuando = $p['periodo'] === 'dia' ? 'hoy' : 'este mes';
            throw new ErrorUso("Ya usaste los {$p['documentos']} documentos de {$cuando} de tu plan {$p['nombre']}. ".
                ($p['periodo'] === 'dia' ? 'Mañana recibirás más, o compra el plan Ocasional (10 documentos) o un plan mensual.' : 'Recarga 10 documentos o cambia de plan para seguir enviando.'), 402);
        }
        if ($origen === 'credito') {
            DB::table('cuentas')->where('id', $cuentaId)->where('creditos', '>', 0)->decrement('creditos');
        }
        DB::table('consumos')->insert(['documento_id' => $documentoId, 'cuenta_id' => $cuentaId, 'origen' => $origen, 'creado_en' => now()]);
    }

    /** Entrega lo comprado (dentro de la transacción del pago). */
    public static function entregar(int $cuentaId, string $idPlan): void
    {
        $p = self::plan($idPlan);
        $c = DB::table('cuentas')->where('id', $cuentaId)->lockForUpdate()->first();
        $vence = $c->plan_vence ? Carbon::parse($c->plan_vence) : null;
        $actual = self::vigente($c->plan, $vence, (int) $c->creditos);
        $cambios = ['updated_at' => now()];
        if ($p['creditos'] > 0) {
            $cambios['creditos'] = DB::raw('creditos + '.(int) $p['creditos']);
        }
        if ($p['dias']) {
            // Renovar el mismo plan suma los días a lo que queda; cambiar de plan empieza desde hoy.
            $desde = $actual === $idPlan && $vence && $vence->isFuture() ? $vence : now();
            $cambios['plan'] = $idPlan;
            $cambios['plan_vence'] = $desde->copy()->addDays($p['dias']);
        } elseif (in_array($actual, ['gratis', 'ocasional'], true)) {
            // Ocasional no rebaja un plan mensual o anual vigente: en ese caso solo suma los documentos.
            $cambios['plan'] = $idPlan;
            $cambios['plan_vence'] = null;
        }
        DB::table('cuentas')->where('id', $cuentaId)->update($cambios);
    }

    /** Sin plan de pago: marca «Firmado con AutograFlow» y sin logo propio. */
    public static function esGratis(int $cuentaId): bool
    {
        return self::plan(self::datos($cuentaId)['plan'])['marcaAgua'];
    }

    public static function vigenteDe(int $cuentaId): string
    {
        return self::datos($cuentaId)['plan'];
    }
}
