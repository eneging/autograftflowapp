<?php

namespace App\Servicios;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * «Entrar sin cuenta»: una cuenta temporal con el plan Gratis (2 documentos diarios por IP y 1 firmante por documento).
 * Hay que aceptar los Términos y Condiciones cada vez que se entra: la sesión dura hasta cerrar el navegador o
 * HORAS_SESION horas (ver el middleware SesionInvitado). Si después crea su cuenta, conserva sus documentos.
 */
class Invitados
{
    /** Dominio reservado (RFC 2606): el correo interno de los invitados nunca recibe mensajes. */
    public const DOMINIO = 'invitado.invalid';

    public const NOMBRE = 'Invitado (sin cuenta)';

    /** Nombre con el que los firmantes ven a quien envía el documento sin cuenta. */
    public const REMITENTE = 'Un usuario de AutograFlow';

    public const HORAS_SESION = 12;

    /** Clave de la sesión con el id del usuario invitado. */
    public const SESION = 'invitado';

    public static function esCorreo(?string $email): bool
    {
        return $email !== null && str_ends_with(strtolower($email), '@'.self::DOMINIO);
    }

    /** «Nombre (correo)» para el registro de auditoría y el certificado; sin el correo interno de los invitados. */
    public static function firma(string $nombre, ?string $email): string
    {
        return self::esCorreo($email) || ! $email ? $nombre : "{$nombre} ({$email})";
    }

    public static function crear(?string $ip): User
    {
        return DB::transaction(function () use ($ip) {
            $cuenta = DB::table('cuentas')->insertGetId([
                'nombre' => self::NOMBRE, 'invitado' => true, 'ip_invitado' => $ip, 'created_at' => now(), 'updated_at' => now(),
            ]);
            return User::create([
                'cuenta_id' => $cuenta, 'name' => self::NOMBRE, 'email' => 'i-'.Str::lower(Str::random(24)).'@'.self::DOMINIO,
                'password' => Str::random(40), 'terminos_aceptados_en' => now(),
            ]);
        });
    }

    /** Al crear su cuenta, el invitado pasa a ser un usuario normal con sus mismos documentos. */
    public static function convertir(User $u, string $nombre, string $empresa, string $email, string $clave): void
    {
        DB::transaction(function () use ($u, $nombre, $empresa, $email, $clave) {
            DB::table('cuentas')->where('id', $u->cuenta_id)
                ->update(['nombre' => $empresa ?: $nombre, 'invitado' => false, 'ip_invitado' => null, 'updated_at' => now()]);
            $u->forceFill(['name' => $nombre, 'email' => $email, 'password' => $clave, 'terminos_aceptados_en' => now(), 'remember_token' => Str::random(60)])->save();
        });
    }
}
