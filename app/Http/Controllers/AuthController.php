<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Servicios\ErrorUso;
use App\Servicios\Equipo;
use App\Servicios\Planes;
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
        return ['id' => $u->id, 'cuentaId' => $u->cuenta_id, 'nombre' => $u->name, 'email' => $u->email, 'cuenta' => $c->nombre,
            'plan' => Planes::vigenteDe($c->id), 'titular' => Equipo::titularId($c->id) === $u->id];
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
            'acepto' => 'accepted', 'codigoEquipo' => 'nullable|string|max:20',
        ], ['acepto.*' => 'Debes aceptar los Términos y Condiciones y la Política de Privacidad', 'nombre.*' => 'Escribe tu nombre', 'email.*' => 'Correo inválido', 'clave.min' => 'La contraseña debe tener al menos 8 caracteres']);
        $this->limitar('registro:'.$r->ip());
        if (User::where('email', $d['email'])->exists()) {
            throw new ErrorUso('Ya existe una cuenta con ese correo', 409, ['email' => 'Ya registrado']);
        }
        $u = DB::transaction(function () use ($d) {
            // Con código de organización (plan Empresarial) se une a esa cuenta; si no, crea la suya.
            $cuenta = trim($d['codigoEquipo'] ?? '') !== '' ? Equipo::cuentaPorCodigo($d['codigoEquipo'])
                : DB::table('cuentas')->insertGetId(['nombre' => trim($d['empresa'] ?? '') ?: $d['nombre'], 'created_at' => now(), 'updated_at' => now()]);
            return User::create(['cuenta_id' => $cuenta, 'name' => trim($d['nombre']), 'email' => $d['email'], 'password' => $d['clave']]);
        });
        Auth::login($u, true);
        $r->session()->regenerate();
        return response()->json(['ok' => true], 201);
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
