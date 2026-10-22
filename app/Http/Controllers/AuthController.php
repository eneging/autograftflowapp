<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Servicios\ErrorUso;
use App\Servicios\Equipo;
use App\Servicios\Planes;
use App\Servicios\Referidos;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use App\Servicios\Avisos;

/** Cuentas: registro, ingreso y salida (sesión de Laravel en cookie HttpOnly). */
class AuthController extends Controlador
{
    public static function usuario(User $u): array
    {
        $c = DB::table('cuentas')->find($u->cuenta_id);
        $invitado = (bool) ($c->invitado ?? false);
        return ['id' => $u->id, 'cuentaId' => $u->cuenta_id, 'nombre' => $u->name, 'email' => $invitado ? '' : $u->email, 'cuenta' => $c->nombre,
            'plan' => Planes::vigenteDe($c->id), 'titular' => Equipo::titularId($c->id) === $u->id, 'invitado' => $invitado,
            'guia' => ['estado' => $u->guia_estado ?? 'pendiente', 'paso' => (int) ($u->guia_paso ?? 1),
                'documentoId' => $u->guia_documento_id ? (int) $u->guia_documento_id : null]];
    }

    /** Cookie (cifrada por Laravel) con el usuario invitado de este navegador: así su cupo diario no se reinicia al volver a entrar. */
    private const COOKIE_INVITADO = 'af_invitado';

    public static function esInvitado(?User $u): bool
    {
        return $u !== null && (bool) DB::table('cuentas')->where('id', $u->cuenta_id)->value('invitado');
    }

    private function limitar(string $clave): void
    {
        if (RateLimiter::tooManyAttempts($clave, 10)) {
            throw new ErrorUso('Demasiados intentos. Espera unos minutos.', 429);
        }
        RateLimiter::hit($clave, 600);
    }

    public function registro(Request $r)
    {
        $d = $this->validar([...$r->all(), 'email' => strtolower(trim((string) $r->input('email')))], [
            'nombre' => 'required|string|min:2|max:120', 'empresa' => 'nullable|string|max:120',
            'email' => 'required|email|max:160', 'clave' => 'required|string|min:8|max:200',
            'acepto' => 'accepted', 'codigoEquipo' => 'nullable|string|max:20', 'codigoReferido' => 'nullable|string|max:20',
        ], ['acepto.*' => 'Debes aceptar los Términos y Condiciones y la Política de Privacidad', 'nombre.*' => 'Escribe tu nombre', 'email.*' => 'Correo inválido', 'clave.min' => 'La contraseña debe tener al menos 8 caracteres']);
        $this->limitar('registro:'.$r->ip());
        if (! empty($d['codigoEquipo']) && ! empty($d['codigoReferido'])) {
            throw new ErrorUso('El referido es para una cuenta nueva, no para unirse a una organización existente.', 400,
                ['codigoReferido' => 'Quita este código para unirte a tu organización.']);
        }
        if (User::where('email', $d['email'])->exists()) {
            throw new ErrorUso('Ya existe una cuenta con ese correo', 409, ['email' => 'Ya registrado']);
        }
        // Quien entró sin cuenta y ahora la crea conserva sus documentos: su cuenta de invitado pasa a ser la suya.
        $actual = $r->user();
        if (self::esInvitado($actual) && trim($d['codigoEquipo'] ?? '') === '') {
            DB::transaction(function () use ($actual, $d) {
                DB::table('cuentas')->where('id', $actual->cuenta_id)->update(['nombre' => trim($d['empresa'] ?? '') ?: trim($d['nombre']), 'invitado' => false, 'updated_at' => now()]);
                $actual->forceFill(['name' => trim($d['nombre']), 'email' => $d['email'], 'password' => $d['clave'], 'terminos_aceptados_en' => now(), 'remember_token' => Str::random(60)])->save();
                Referidos::asociar((int) $actual->cuenta_id, $d['codigoReferido'] ?? '', $d['email']);
            });
            Auth::login($actual, true);
            $r->session()->regenerate();
            return response()->json(['ok' => true], 201)->withoutCookie(self::COOKIE_INVITADO);
        }
        $u = DB::transaction(function () use ($d) {
            // Con código de organización (plan Empresarial) se une a esa cuenta; si no, crea la suya.
            $cuenta = trim($d['codigoEquipo'] ?? '') !== '' ? Equipo::cuentaPorCodigo($d['codigoEquipo'])
                : DB::table('cuentas')->insertGetId(['nombre' => trim($d['empresa'] ?? '') ?: $d['nombre'], 'created_at' => now(), 'updated_at' => now()]);
            $u = User::create(['cuenta_id' => $cuenta, 'name' => trim($d['nombre']), 'email' => $d['email'], 'password' => $d['clave']]);
            $u->forceFill(['terminos_aceptados_en' => now()])->save();
            Referidos::asociar((int) $cuenta, $d['codigoReferido'] ?? '', $d['email']);
            return $u;
        });
        Auth::login($u, true);
        $r->session()->regenerate();
        return response()->json(['ok' => true], 201);
    }

    /**
     * «Entrar sin cuenta»: reglas de Gratis (2 documentos diarios) con 1 firmante por documento.
     * Hay que aceptar Términos y Privacidad en cada entrada. Se reutiliza el invitado de este navegador (cookie cifrada)
     * para que salir y volver a entrar no regale documentos. La sesión no se recuerda al cerrar el navegador.
     */
    public function invitado(Request $r)
    {
        $this->validar($r->all(), ['acepto' => 'accepted'],
            ['acepto.*' => 'Debes confirmar que has leído y aceptas los Términos y Condiciones y la Política de Privacidad para continuar.']);
        $this->limitar('invitado:'.$r->ip());
        $u = $r->user();
        if ($u && ! self::esInvitado($u)) {
            throw new ErrorUso('Ya iniciaste sesión con tu cuenta.', 409);
        }
        if (! $u) {
            $id = (int) $r->cookie(self::COOKIE_INVITADO);
            $u = $id ? User::find($id) : null;
            if (! self::esInvitado($u)) {
                $u = DB::transaction(function () {
                    $cuenta = DB::table('cuentas')->insertGetId(['nombre' => 'Invitado', 'invitado' => true, 'created_at' => now(), 'updated_at' => now()]);
                    return User::create(['cuenta_id' => $cuenta, 'name' => 'Invitado (sin cuenta)',
                        'email' => 'invitado-'.Str::uuid().'@sin-cuenta.autograflow', 'password' => Str::random(40)]);
                });
            }
        }
        $u->forceFill(['terminos_aceptados_en' => now()])->save();
        Auth::login($u);
        $r->session()->regenerate();
        return response()->json(['ok' => true])->cookie(self::COOKIE_INVITADO, (string) $u->id, 60 * 24 * 365);
    }

    public function ingresar(Request $r)
    {
        $email = strtolower(trim((string) $r->input('email')));
        $this->validar(['email' => $email, 'clave' => $r->input('clave')], ['email' => 'required|email', 'clave' => 'required|string'],
            ['email.*' => 'Correo inválido', 'clave.*' => 'Escribe tu contraseña']);
        $this->limitar("ingreso:{$r->ip()}:{$email}");
        if (! Auth::attempt(['email' => $email, 'password' => (string) $r->input('clave')], true)) {
            throw new ErrorUso('Correo o contraseña incorrectos', 401);
        }
        $r->session()->regenerate();
        return ['ok' => true];
    }

    /**
     * «¿Olvidaste tu contraseña?»: envía un enlace para crear una nueva (vence en 60 minutos).
     * Responde lo mismo exista o no el correo, para no revelar quién tiene cuenta.
     */
    public function olvide(Request $r)
    {
        $email = strtolower(trim((string) $r->input('email')));
        $this->validar(['email' => $email], ['email' => 'required|email'], ['email.*' => 'Correo inválido']);
        $this->limitar('olvide:'.$r->ip());
        $u = User::where('email', $email)->first();
        if ($u) {
            $token = Password::broker()->createToken($u);
            $url = rtrim(config('app.url'), '/').'/restablecer?'.http_build_query(['token' => $token, 'email' => $email]);
            Avisos::enviar($email, 'Crea una nueva contraseña de AutograFlow', "Hola {$u->name}", [
                'Recibimos un pedido para cambiar la contraseña de tu cuenta de AutograFlow.',
                'El enlace vence en 60 minutos. Si no lo pediste, ignora este correo: tu contraseña no cambia.',
            ], ['texto' => 'Crear nueva contraseña', 'url' => $url]);
        }
        return ['ok' => true];
    }

    public function restablecer(Request $r)
    {
        $d = $this->validar([...$r->all(), 'email' => strtolower(trim((string) $r->input('email')))], [
            'email' => 'required|email', 'token' => 'required|string', 'clave' => 'required|string|min:8|max:200',
        ], ['email.*' => 'Correo inválido', 'token.*' => 'Enlace inválido', 'clave.min' => 'La contraseña debe tener al menos 8 caracteres']);
        $this->limitar('restablecer:'.$r->ip());
        $estado = Password::broker()->reset(['email' => $d['email'], 'token' => $d['token'], 'password' => $d['clave']], function (User $u, string $clave) {
            $u->forceFill(['password' => $clave, 'remember_token' => Str::random(60)])->save();
            Auth::login($u, true);
        });
        if ($estado !== Password::PASSWORD_RESET) {
            throw new ErrorUso('El enlace venció o ya se usó. Pide uno nuevo.', 400);
        }
        $r->session()->regenerate();
        return ['ok' => true];
    }

    public function salir(Request $r)
    {
        Auth::guard('web')->logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();
        return ['ok' => true];
    }

    public function yo(Request $r)
    {
        return $r->user() ? self::usuario($r->user()) : response()->json(['error' => 'Sin sesión'], 401);
    }
}
