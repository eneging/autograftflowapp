<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PerfilTest extends TestCase
{
    use RefreshDatabase;
    private const H = ['X-AutograFlow' => '1'];
    private const FACTURA = ['tipo' => 'factura', 'documento' => '20131312955', 'nombre' => 'Empresa de Prueba S.A.C.', 'direccion' => 'Av. Siempre Viva 123, Lima', 'correo' => ''];

    private function usuario(string $email): User
    {
        $cuenta = DB::table('cuentas')->insertGetId(['nombre' => 'Cuenta de prueba', 'created_at' => now(), 'updated_at' => now()]);
        return User::create(['cuenta_id' => $cuenta, 'name' => 'Persona de prueba', 'email' => $email, 'password' => 'clave-de-prueba']);
    }

    private function pago(User $u, string $estado = 'aprobado'): int
    {
        return DB::table('pagos')->insertGetId(['cuenta_id' => $u->cuenta_id, 'user_id' => $u->id, 'producto' => 'pro-mes', 'titulo' => 'Plan Pro (1 mes)',
            'monto' => 29.9, 'moneda' => 'PEN', 'estado' => $estado, 'aplicado_en' => now(), 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_guardar_avatar_nombre_y_facturacion(): void
    {
        $u = $this->usuario('uno@example.test');
        $this->actingAs($u)->putJson('/api/perfil', ['nombre' => 'Ana Pérez', 'avatar' => 'f2-p1-h3-c0-a4-e0', 'facturacion' => self::FACTURA], self::H)
            ->assertOk()->assertJsonPath('avatar', 'f2-p1-h3-c0-a4-e0')->assertJsonPath('facturacion.documentoTipo', 'RUC');
        $this->actingAs($u->fresh())->getJson('/api/auth/yo', self::H)->assertJsonPath('nombre', 'Ana Pérez')->assertJsonPath('avatar', 'f2-p1-h3-c0-a4-e0');
    }

    public function test_valida_ruc_dni_y_avatar(): void
    {
        $u = $this->usuario('dos@example.test');
        $this->actingAs($u)->putJson('/api/perfil', ['nombre' => 'Ana', 'facturacion' => [...self::FACTURA, 'documento' => '20131312954']], self::H)
            ->assertStatus(400)->assertJsonStructure(['campos' => ['facturacion.documento']]);
        $this->putJson('/api/perfil', ['nombre' => 'Ana', 'facturacion' => ['tipo' => 'boleta', 'documentoTipo' => 'DNI', 'documento' => '123', 'nombre' => 'Ana Pérez']], self::H)
            ->assertStatus(400);
        $this->putJson('/api/perfil', ['nombre' => 'Ana', 'avatar' => '<script>'], self::H)->assertStatus(400);
    }

    public function test_comprobante_se_emite_una_vez_y_no_cambia(): void
    {
        $u = $this->usuario('tres@example.test');
        $id = $this->pago($u);
        $this->actingAs($u)->get("/api/pagos/{$id}/comprobante", self::H)->assertStatus(409); // sin datos de facturación
        $this->putJson('/api/perfil', ['nombre' => 'Ana', 'facturacion' => self::FACTURA], self::H)->assertOk();
        $r = $this->get("/api/pagos/{$id}/comprobante", self::H)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $r->getContent());
        $this->putJson('/api/perfil', ['nombre' => 'Ana', 'facturacion' => ['tipo' => 'boleta', 'documentoTipo' => 'DNI', 'documento' => '12345678', 'nombre' => 'Ana Pérez']], self::H)->assertOk();
        $this->get("/api/pagos/{$id}/comprobante", self::H)->assertOk();
        $this->assertSame('RUC', json_decode(DB::table('pagos')->where('id', $id)->value('comprobante'), true)['documentoTipo']);
        $this->getJson('/api/perfil', self::H)->assertJsonPath('pagos.0.comprobante', 'AF-'.str_pad((string) $id, 8, '0', STR_PAD_LEFT));
    }

    public function test_pagos_ajenos_o_no_aprobados(): void
    {
        $uno = $this->usuario('cuatro@example.test'); $dos = $this->usuario('cinco@example.test');
        $ajeno = $this->pago($dos); $pendiente = $this->pago($uno, 'pendiente');
        $this->actingAs($uno)->putJson('/api/perfil', ['nombre' => 'Ana', 'facturacion' => self::FACTURA], self::H)->assertOk();
        $this->get("/api/pagos/{$ajeno}/comprobante", self::H)->assertNotFound();
        $this->get("/api/pagos/{$pendiente}/comprobante", self::H)->assertStatus(409);
    }
}
