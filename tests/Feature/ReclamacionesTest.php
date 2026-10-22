<?php

namespace Tests\Feature;

use App\Servicios\PlazoReclamacion;
use App\Servicios\Reclamaciones;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReclamacionesTest extends TestCase
{
    use RefreshDatabase;

    private const H = ['X-AutograFlow' => '1'];

    protected function setUp(): void
    {
        parent::setUp();
        config(['reclamaciones.proveedor' => ['marca' => 'AutograFlow', 'razonSocial' => 'Proveedor de prueba',
            'ruc' => '20123456789', 'domicilio' => 'Dirección de prueba, Lima', 'correo' => 'reclamos@example.test'],
            'autograflow.admin_password' => 'clave-admin-prueba', 'cache.default' => 'array']);
        Mail::fake();
    }

    private function datos(array $cambios = []): array
    {
        return [...['solicitudId' => (string) Str::uuid(), 'nombre' => 'Ana Pérez', 'documentoTipo' => 'DNI',
            'documento' => '12345678', 'domicilio' => 'Av. Prueba 123, Lima, Lima, Lima', 'telefono' => '',
            'email' => 'ana@example.test', 'menor' => false, 'representante' => '', 'representanteDocumento' => '',
            'bien' => 'servicio', 'descripcion' => 'Plan profesional', 'monto' => '19.90', 'moneda' => 'PEN',
            'tipo' => 'reclamo', 'detalle' => 'El documento no se pudo enviar.', 'pedido' => 'Solicito la devolución.', 'canal' => 'email'], ...$cambios];
    }

    public function test_registro_publico_constancia_pdf_y_reintento_sin_duplicar(): void
    {
        $datos = $this->datos();
        $r = $this->postJson('/api/reclamaciones', $datos, self::H)->assertCreated()->assertJsonPath('numero', 'LR-00000001');
        $token = $r->json('token');
        $this->postJson('/api/reclamaciones', $datos, self::H)->assertCreated()->assertJsonPath('numero', 'LR-00000001');
        $this->assertDatabaseCount('reclamaciones', 1);
        $this->assertDatabaseCount('reclamacion_correos', 2);
        $pdf = $this->get('/api/reclamaciones/'.$token.'/constancia')->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $pdf->getContent());
        $this->get('/api/reclamaciones/'.str_repeat('a', 64).'/constancia')->assertNotFound();
        $this->postJson('/api/reclamaciones', [...$datos, 'pedido' => 'Otro pedido distinto'], self::H)->assertStatus(409);
        $this->postJson('/api/reclamaciones', $this->datos(), self::H)->assertCreated()->assertJsonPath('numero', 'LR-00000002');
    }

    public function test_validacion_de_menor_documento_canal_y_monto(): void
    {
        foreach ([['menor' => true], ['documento' => '12'], ['email' => ''], ['monto' => '-1']] as $cambio) {
            $this->postJson('/api/reclamaciones', $this->datos($cambio), self::H)->assertStatus(400);
        }
        $this->assertDatabaseCount('reclamaciones', 0);
        $this->postJson('/api/reclamaciones', $this->datos(['menor' => true, 'representante' => 'Padre de prueba',
            'representanteDocumento' => '87654321', 'canal' => 'domicilio', 'email' => '', 'monto' => null, 'tipo' => 'queja']), self::H)->assertCreated();
    }

    public function test_administracion_protegida_y_respuesta_inmutable(): void
    {
        $id = $this->postJson('/api/reclamaciones', $this->datos(), self::H)->json('id');
        $this->getJson('/api/admin/reclamaciones', self::H)->assertUnauthorized();
        $h = [...self::H, 'x-admin-password' => 'clave-admin-prueba'];
        $this->getJson('/api/admin/reclamaciones', $h)->assertOk()->assertJsonPath('total', 1);
        $respuesta = ['responsable' => 'Operador de prueba', 'respuesta' => 'Se repondrá el documento afectado.'];
        $this->postJson("/api/admin/reclamaciones/{$id}/respuesta", $respuesta, $h)->assertOk()->assertJsonPath('estado', 'respondido');
        $this->postJson("/api/admin/reclamaciones/{$id}/respuesta", $respuesta, $h)->assertStatus(409);
        $this->assertDatabaseHas('reclamacion_correos', ['reclamacion_id' => $id, 'tipo' => 'respuesta', 'estado' => 'enviado']);
    }

    public function test_error_smtp_no_pierde_registro_ni_marca_respuesta_enviada(): void
    {
        $id = $this->postJson('/api/reclamaciones', $this->datos(), self::H)->json('id');
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('Fallo SMTP de prueba'));
        $h = [...self::H, 'x-admin-password' => 'clave-admin-prueba'];
        $this->postJson("/api/admin/reclamaciones/{$id}/respuesta", ['responsable' => 'Atención', 'respuesta' => 'Se repondrá el documento afectado.'], $h)
            ->assertOk()->assertJsonPath('estado', 'pendiente_envio');
        $this->assertDatabaseHas('reclamacion_correos', ['reclamacion_id' => $id, 'tipo' => 'respuesta', 'estado' => 'error']);
        Mail::swap(new \Illuminate\Support\Testing\Fakes\MailFake(new \Illuminate\Mail\MailManager(app())));
        $this->postJson("/api/admin/reclamaciones/{$id}/reintentar", [], $h)->assertOk()->assertJsonPath('estado', 'respondido');
    }

    public function test_respuesta_postal_exige_constancia_y_no_envia_email_de_respuesta(): void
    {
        $id = $this->postJson('/api/reclamaciones', $this->datos(['canal' => 'domicilio', 'email' => '']), self::H)->json('id');
        $h = [...self::H, 'x-admin-password' => 'clave-admin-prueba'];
        $datos = ['responsable' => 'Atención', 'respuesta' => 'Se repondrá el documento afectado.'];
        $this->postJson("/api/admin/reclamaciones/{$id}/respuesta", $datos, $h)->assertStatus(400);
        $this->postJson("/api/admin/reclamaciones/{$id}/respuesta", [...$datos, 'constanciaPostal' => 'Guía 123, enviada por operador postal'], $h)->assertOk()->assertJsonPath('estado', 'respondido');
        $this->assertDatabaseMissing('reclamacion_correos', ['reclamacion_id' => $id, 'tipo' => 'respuesta']);
    }

    public function test_proveedor_incompleto_no_se_presenta_como_habilitado(): void
    {
        config(['reclamaciones.proveedor.ruc' => '']);
        $this->getJson('/api/reclamaciones/configuracion', self::H)->assertOk()->assertJsonPath('configurado', false);
        $this->postJson('/api/reclamaciones', $this->datos(), self::H)->assertStatus(503);
        $this->assertDatabaseCount('reclamaciones', 0);
    }

    public function test_plazo_respeta_feriados_semana_santa_y_zona_peruana(): void
    {
        $this->assertSame('2026-12-30', PlazoReclamacion::vence(CarbonImmutable::parse('2026-12-04 12:00:00', 'America/Lima')));
        $this->assertSame('2026-04-20', PlazoReclamacion::vence(CarbonImmutable::parse('2026-03-26 12:00:00', 'America/Lima')));
        // En Perú todavía es jueves 22: el cómputo comienza el viernes 23.
        $this->assertSame('2026-11-12', PlazoReclamacion::vence(CarbonImmutable::parse('2026-10-23 02:00:00', 'UTC')));
    }
}
