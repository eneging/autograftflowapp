<?php

namespace Tests\Feature;

use App\Models\User;
use App\Servicios\MercadoPago;
use App\Servicios\Planes;
use App\Servicios\Referidos;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ReferidosTest extends TestCase
{
    use RefreshDatabase;
    private const H = ['X-AutograFlow' => '1'];

    private function cuenta(string $email = 'origen@example.test'): User
    {
        $id = DB::table('cuentas')->insertGetId(['nombre' => 'Cuenta de prueba', 'created_at' => now(), 'updated_at' => now()]);
        return User::create(['cuenta_id' => $id, 'name' => 'Usuario de prueba', 'email' => $email, 'password' => 'clave-de-prueba']);
    }

    private function pago(User $u, string $producto = 'profesional'): int
    {
        return DB::table('pagos')->insertGetId(['cuenta_id' => $u->cuenta_id, 'user_id' => $u->id, 'producto' => $producto,
            'titulo' => 'Compra de prueba', 'monto' => Planes::plan($producto)['precio'], 'moneda' => 'PEN', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function referido(User $origen, string $email = 'nuevo@example.test'): User
    {
        $u = $this->cuenta($email);
        Referidos::asociar($u->cuenta_id, Referidos::codigo($origen->cuenta_id), $email);
        return $u;
    }

    public function test_codigo_unico_link_y_registro_con_atribucion_sin_premio_por_registrarse(): void
    {
        $origen = $this->cuenta();
        $codigo = Referidos::codigo($origen->cuenta_id);
        $this->assertSame($codigo, Referidos::codigo($origen->cuenta_id));
        $this->assertNotSame($codigo, Referidos::codigo($this->cuenta('otro@example.test')->cuenta_id));
        $this->postJson('/api/auth/registro', ['nombre' => 'Nueva persona', 'empresa' => '', 'email' => 'nueva@example.test',
            'clave' => 'clave-nueva-prueba', 'acepto' => true, 'codigoReferido' => strtolower($codigo)], self::H)->assertCreated();
        $this->assertDatabaseHas('referidos', ['referidor_id' => $origen->cuenta_id, 'estado' => 'registrado', 'documentos' => 0]);
        $this->assertSame(0, Referidos::saldo($origen->cuenta_id));
        $this->actingAs($origen)->getJson('/api/cuenta/referidos', self::H)->assertOk()->assertJsonPath('codigo', $codigo)
            ->assertJsonPath('registrados', 1)->assertJsonPath('historial.0.alias', 'Invitación #1')->assertJsonMissing(['email' => 'nueva@example.test']);
    }

    public function test_enlace_usa_el_dominio_visitado_aunque_app_url_tenga_ngrok(): void
    {
        config(['app.url' => 'https://antiguo-tunel.ngrok-free.app']);
        $u = $this->cuenta();
        $codigo = Referidos::codigo($u->cuenta_id);
        $this->actingAs($u)->getJson('https://autograflow.example/api/cuenta/referidos', self::H)
            ->assertOk()->assertJsonPath('enlace', 'https://autograflow.example/registro?ref='.$codigo);
        $this->getJson('https://www.autograflow.example/api/cuenta/referidos', self::H)
            ->assertOk()->assertJsonPath('enlace', 'https://www.autograflow.example/registro?ref='.$codigo);
    }

    public function test_codigo_invalido_no_deja_cuenta_huerfana_y_no_admite_autorreferido_gmail(): void
    {
        $origen = $this->cuenta('ed.war@gmail.com');
        $codigo = Referidos::codigo($origen->cuenta_id);
        foreach (['AF-INEXISTENTE', $codigo] as $valor) {
            $this->postJson('/api/auth/registro', ['nombre' => 'Otra cuenta', 'email' => 'edwar+extra@gmail.com',
                'clave' => 'clave-prueba-extra', 'acepto' => true, 'codigoReferido' => $valor], self::H)->assertStatus(400);
        }
        $this->assertDatabaseCount('cuentas', 1);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_espera_14_dias_y_solo_primer_pago_aunque_webhook_se_repita(): void
    {
        $origen = $this->cuenta(); $nuevo = $this->referido($origen); $pago = $this->pago($nuevo);
        $this->assertTrue(MercadoPago::aplicar($pago, '123'));
        $this->assertFalse(MercadoPago::aplicar($pago, '123'));
        Referidos::acreditar($origen->cuenta_id);
        $this->assertSame(0, Referidos::saldo($origen->cuenta_id));
        $this->travel(13)->days(); Referidos::acreditar(); $this->assertSame(0, Referidos::saldo($origen->cuenta_id));
        $this->travel(1)->days(); Referidos::acreditar(); $this->assertSame(3, Referidos::saldo($origen->cuenta_id));
        MercadoPago::aplicar($this->pago($nuevo, 'empresarial'), '124'); Referidos::acreditar();
        $this->assertSame(3, Referidos::saldo($origen->cuenta_id));
        $this->assertDatabaseCount('referidos', 1);
    }

    public function test_bonos_vencen_y_no_desbloquean_funciones_de_pago(): void
    {
        $origen = $this->cuenta(); $nuevo = $this->referido($origen);
        MercadoPago::aplicar($this->pago($nuevo, 'ocasional'), '200');
        $this->travel(14)->days();
        $estado = Planes::estado($origen->cuenta_id);
        $this->assertSame('gratis', $estado['plan']);
        $this->assertSame(1, $estado['creditosReferidos']);
        $this->assertSame(0, $estado['creditos']);
        $this->assertFalse($estado['selloHuella']);
        $this->assertSame(2, $estado['firmantesPorDocumento']);
        $this->travel(90)->days();
        $this->assertSame(0, Referidos::saldo($origen->cuenta_id));
    }

    public function test_consumo_usa_cupo_luego_bono_y_conserva_creditos_comprados(): void
    {
        $origen = $this->cuenta(); $nuevo = $this->referido($origen);
        MercadoPago::aplicar($this->pago($nuevo, 'ocasional'), '300'); $this->travel(14)->days();
        DB::table('cuentas')->where('id', $origen->cuenta_id)->update(['creditos' => 4]);
        $ids = [];
        for ($i = 0; $i < 4; $i++) {
            $ids[] = $id = DB::table('documentos')->insertGetId(['cuenta_id' => $origen->cuenta_id, 'user_id' => $origen->id,
                'nombre' => 'PDF de prueba', 'archivo' => 'prueba.pdf', 'sha256_original' => str_repeat('a', 64), 'paginas' => '[]', 'created_at' => now(), 'updated_at' => now()]);
            DB::transaction(fn () => Planes::consumirEnvio($origen->cuenta_id, $id, 1));
        }
        $this->assertSame(['plan', 'plan', 'referido', 'credito'], DB::table('consumos')->whereIn('documento_id', $ids)->orderBy('documento_id')->pluck('origen')->all());
        $this->assertSame(3, (int) DB::table('cuentas')->where('id', $origen->cuenta_id)->value('creditos'));
        $this->assertSame(0, Referidos::saldo($origen->cuenta_id));
    }

    public function test_limite_mensual_difiere_bono_completo_y_preserva_reglas(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 5)->startOfDay());
        config(['referidos.tope_mensual' => 3]);
        $origen = $this->cuenta(); $uno = $this->referido($origen, 'uno@example.test'); $dos = $this->referido($origen, 'dos@example.test');
        config(['referidos.bonos.profesional' => 99]);
        MercadoPago::aplicar($this->pago($uno), '401'); MercadoPago::aplicar($this->pago($dos), '402');
        $this->travel(14)->days(); Referidos::acreditar();
        $this->assertSame(3, Referidos::saldo($origen->cuenta_id));
        $this->assertSame(1, DB::table('referidos')->where('estado', 'en_espera')->count());
        $this->travelTo(now()->setDate(2026, 11, 2)); Referidos::acreditar();
        $this->assertSame(6, Referidos::saldo($origen->cuenta_id));
    }

    public function test_reembolso_verificado_anula_saldo_y_no_reactiva_bono(): void
    {
        config(['autograflow.mercadopago.token' => 'test', 'autograflow.mercadopago.api' => 'https://mp.test']);
        $origen = $this->cuenta(); $nuevo = $this->referido($origen); $pago = $this->pago($nuevo);
        MercadoPago::aplicar($pago, '500'); $this->travel(14)->days(); Referidos::acreditar();
        $this->assertSame(3, Referidos::saldo($origen->cuenta_id));
        Http::fake(['*' => Http::response(['id' => 500, 'external_reference' => "af-{$pago}", 'status' => 'refunded'])]);
        MercadoPago::procesarPago('500');
        $this->assertSame(0, Referidos::saldo($origen->cuenta_id));
        $this->assertDatabaseHas('referidos', ['pago_id' => $pago, 'estado' => 'anulado']);
        MercadoPago::aplicar($pago, '500'); Referidos::acreditar();
        $this->assertSame(0, Referidos::saldo($origen->cuenta_id));
    }

    public function test_acceso_invitado_protegido_y_registro_no_mezcla_equipo_y_referido(): void
    {
        $this->getJson('/api/cuenta/referidos', self::H)->assertUnauthorized();
        $origen = $this->cuenta(); $codigo = Referidos::codigo($origen->cuenta_id);
        $this->postJson('/api/auth/registro', ['nombre' => 'Otra persona', 'email' => 'otra@example.test', 'clave' => 'clave-prueba',
            'acepto' => true, 'codigoEquipo' => 'AF-EQUIPO', 'codigoReferido' => $codigo], self::H)->assertStatus(400);
        $this->postJson('/api/auth/invitado', ['acepto' => true], self::H)->assertOk();
        $this->getJson('/api/cuenta/referidos', self::H)->assertForbidden();
        $this->postJson('/api/auth/registro', ['nombre' => 'Persona registrada', 'email' => 'registrada@example.test', 'clave' => 'clave-prueba',
            'acepto' => true, 'codigoReferido' => $codigo], self::H)->assertCreated();
        $this->assertDatabaseCount('referidos', 1);
        $this->assertDatabaseCount('cuentas', 2);
    }
}
