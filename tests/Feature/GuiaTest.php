<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GuiaTest extends TestCase
{
    use RefreshDatabase;
    private const H = ['X-AutograFlow' => '1'];

    private function usuario(string $email): User
    {
        $cuenta = DB::table('cuentas')->insertGetId(['nombre' => 'Cuenta de prueba', 'created_at' => now(), 'updated_at' => now()]);
        return User::create(['cuenta_id' => $cuenta, 'name' => 'Persona de prueba', 'email' => $email, 'password' => 'clave-de-prueba']);
    }

    private function documento(User $u): int
    {
        return DB::table('documentos')->insertGetId(['cuenta_id' => $u->cuenta_id, 'user_id' => $u->id, 'nombre' => 'PDF de prueba',
            'archivo' => 'prueba.pdf', 'sha256_original' => str_repeat('a', 64), 'paginas' => '[]', 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_primera_entrada_y_omision_persistida_por_usuario(): void
    {
        $u = $this->usuario('uno@example.test');
        $this->actingAs($u)->getJson('/api/auth/yo', self::H)->assertOk()->assertJsonPath('guia.estado', 'pendiente')->assertJsonPath('guia.paso', 1);
        $this->putJson('/api/cuenta/guia', ['estado' => 'omitida', 'paso' => 1, 'documentoId' => null], self::H)->assertOk();
        $this->actingAs($u->fresh())->getJson('/api/auth/yo', self::H)->assertOk()->assertJsonPath('guia.estado', 'omitida');
        $this->assertDatabaseHas('users', ['id' => $u->id, 'guia_estado' => 'omitida']);
    }

    public function test_reactivar_guardar_documento_y_terminar_sin_cambiarlo(): void
    {
        $u = $this->usuario('dos@example.test'); $id = $this->documento($u);
        $this->actingAs($u)->putJson('/api/cuenta/guia', ['estado' => 'activa', 'paso' => 3, 'documentoId' => $id], self::H)->assertOk();
        $this->actingAs($u->fresh())->getJson('/api/auth/yo', self::H)->assertJsonPath('guia.paso', 3)->assertJsonPath('guia.documentoId', $id);
        $this->putJson('/api/cuenta/guia', ['estado' => 'completa', 'paso' => 6, 'documentoId' => $id], self::H)->assertOk();
        $this->assertDatabaseHas('documentos', ['id' => $id, 'estado' => 'borrador']);
        $this->assertDatabaseCount('consumos', 0);
        $this->putJson('/api/cuenta/guia', ['estado' => 'activa', 'paso' => 1, 'documentoId' => null], self::H)->assertOk();
    }

    public function test_separacion_entre_usuarios_y_documentos_ajenos(): void
    {
        $uno = $this->usuario('tres@example.test'); $dos = $this->usuario('cuatro@example.test'); $id = $this->documento($dos);
        $this->actingAs($uno)->putJson('/api/cuenta/guia', ['estado' => 'activa', 'paso' => 2, 'documentoId' => $id], self::H)->assertNotFound();
        $this->putJson('/api/cuenta/guia', ['estado' => 'omitida', 'paso' => 1, 'documentoId' => null], self::H)->assertOk();
        $this->assertDatabaseHas('users', ['id' => $dos->id, 'guia_estado' => 'pendiente']);
    }

    public function test_validacion_y_acceso_protegido(): void
    {
        $this->putJson('/api/cuenta/guia', ['estado' => 'activa', 'paso' => 1], self::H)->assertUnauthorized();
        $u = $this->usuario('cinco@example.test');
        $this->actingAs($u)->putJson('/api/cuenta/guia', ['estado' => 'inventado', 'paso' => 100], self::H)->assertStatus(400);
        $this->putJson('/api/cuenta/guia', ['estado' => 'activa', 'paso' => 1])->assertForbidden();
    }
}
