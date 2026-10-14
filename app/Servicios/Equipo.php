<?php

namespace App\Servicios;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Organización del plan Empresarial: la cuenta comparte documentos y cupo con hasta 5 usuarios.
 * Quien creó la cuenta es el titular; los demás se unen al registrarse con el código de la organización.
 */
class Equipo
{
    public static function titularId(int $cuentaId): ?int
    {
        return DB::table('users')->where('cuenta_id', $cuentaId)->min('id');
    }

    public static function estado(User $u): array
    {
        $c = DB::table('cuentas')->find($u->cuenta_id);
        $plan = Planes::plan(Planes::vigenteDe($u->cuenta_id));
        $titular = self::titularId($u->cuenta_id);
        $soyTitular = $titular === $u->id;
        if ($soyTitular && $plan['usuarios'] > 1 && ! $c->codigo_equipo) {
            $c->codigo_equipo = self::nuevoCodigo($u);
        }
        return [
            'nombre' => $c->nombre, 'plazas' => $plan['usuarios'], 'activo' => $plan['usuarios'] > 1, 'soyTitular' => $soyTitular,
            'codigo' => $soyTitular && $plan['usuarios'] > 1 ? $c->codigo_equipo : null,
            'miembros' => DB::table('users')->where('cuenta_id', $u->cuenta_id)->orderBy('id')->get()->map(fn ($m) => [
                'id' => $m->id, 'nombre' => $m->name, 'email' => $m->email, 'titular' => $m->id === $titular, 'yo' => $m->id === $u->id,
                'documentos' => DB::table('documentos')->where('cuenta_id', $u->cuenta_id)->where('user_id', $m->id)->where('estado', '<>', 'borrador')->count(),
            ])->all(),
        ];
    }

    public static function nuevoCodigo(User $u): string
    {
        if (self::titularId($u->cuenta_id) !== $u->id) {
            throw new ErrorUso('Solo el titular de la organización puede cambiar el código', 403);
        }
        do {
            $codigo = 'AF-ORG-'.strtoupper(Str::random(5));
        } while (DB::table('cuentas')->where('codigo_equipo', $codigo)->exists());
        DB::table('cuentas')->where('id', $u->cuenta_id)->update(['codigo_equipo' => $codigo, 'updated_at' => now()]);
        return $codigo;
    }

    /** Al registrarse con un código: la organización debe tener el plan Empresarial vigente y plazas libres. */
    public static function cuentaPorCodigo(string $codigo): int
    {
        $c = DB::table('cuentas')->where('codigo_equipo', strtoupper(trim($codigo)))->lockForUpdate()->first();
        if (! $c) {
            throw new ErrorUso('El código de organización no existe', 400, ['codigoEquipo' => 'Código no válido']);
        }
        $plan = Planes::plan(Planes::vigenteDe($c->id));
        if ($plan['usuarios'] <= 1) {
            throw new ErrorUso('La organización no tiene el plan Empresarial vigente', 400, ['codigoEquipo' => 'Licencia vencida']);
        }
        if (DB::table('users')->where('cuenta_id', $c->id)->count() >= $plan['usuarios']) {
            throw new ErrorUso("La organización ya tiene sus {$plan['usuarios']} usuarios. Pide al titular que libere una plaza.", 400, ['codigoEquipo' => 'Sin plazas']);
        }
        return $c->id;
    }

    /** El titular quita a un miembro: este sigue con su usuario, pero en una cuenta propia con el plan Gratis. */
    public static function quitar(User $titular, int $usuarioId): void
    {
        if (self::titularId($titular->cuenta_id) !== $titular->id) {
            throw new ErrorUso('Solo el titular de la organización puede quitar usuarios', 403);
        }
        $m = User::where('id', $usuarioId)->where('cuenta_id', $titular->cuenta_id)->first() ?? throw new ErrorUso('Usuario no encontrado', 404);
        if ($m->id === $titular->id) {
            throw new ErrorUso('No puedes quitarte a ti mismo');
        }
        DB::transaction(function () use ($m) {
            $cuenta = DB::table('cuentas')->insertGetId(['nombre' => $m->name, 'created_at' => now(), 'updated_at' => now()]);
            $m->forceFill(['cuenta_id' => $cuenta])->save();
        });
    }
}
