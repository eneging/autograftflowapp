<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use Tests\Unit\ReembolsoTest;

/** Plantilla de reembolso por la API: Firmante 1 envía, Firmante 2 aprueba, PDF y panel /admin. Imágenes en disco (sin Cloudinary). */
class ReembolsoApiTest extends TestCase
{
    use RefreshDatabase;

    private const H = ['X-AutograFlow' => '1', 'Accept' => 'application/json'];

    public function test_solicitud_aprobacion_y_pdf(): void
    {
        Storage::fake('local');
        config(['autograflow.cloudinary.nube' => '', 'autograflow.admin_password' => 'clave-admin']);
        $firma = 'data:image/png;base64,'.base64_encode(file_get_contents(base_path('tests/fixtures/firma.png')));

        $campos = $this->postJson('/api/solicitudes', ['datos' => ['contacto' => ['nombre' => 'x']], 'firma' => 'nope'], self::H)->assertStatus(400)->json('campos');
        $this->assertSame('Escribe el nombre del beneficiario', $campos['datos.contacto.nombre']);
        $this->assertSame('Firma inválida', $campos['firma']);

        $r = $this->postJson('/api/solicitudes', ['datos' => ReembolsoTest::base(), 'firma' => $firma], self::H)->assertCreated()->json();
        $this->getJson("/api/solicitudes/{$r['tokenSolicitante']}")->assertJson(['rol' => 'solicitante', 'estado' => 'pendiente', 'tokenAprobador' => $r['tokenAprobador']]);
        $this->getJson("/api/solicitudes/{$r['tokenAprobador']}")->assertJson(['rol' => 'aprobador'])->assertJsonMissingPath('tokenAprobador');

        // El solicitante no puede aprobar; el aprobador necesita firmar; solo se decide una vez
        $this->postJson("/api/solicitudes/{$r['tokenSolicitante']}/decision", ['decision' => 'aprobada', 'nombre' => 'Yo', 'firma' => $firma], self::H)->assertStatus(403);
        $this->postJson("/api/solicitudes/{$r['tokenAprobador']}/decision", ['decision' => 'aprobada', 'nombre' => 'Carlos Ruiz'], self::H)->assertStatus(400);
        $this->postJson("/api/solicitudes/{$r['tokenAprobador']}/decision", ['decision' => 'aprobada', 'nombre' => 'Carlos Ruiz', 'firma' => $firma], self::H)->assertOk();
        $this->postJson("/api/solicitudes/{$r['tokenAprobador']}/decision", ['decision' => 'rechazada', 'nombre' => 'Carlos Ruiz', 'motivo' => 'x'], self::H)->assertStatus(409);

        $this->get("/api/solicitudes/{$r['tokenSolicitante']}/pdf")->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->get("/api/solicitudes/{$r['tokenAprobador']}/firma/aprobador")->assertOk()->assertHeader('Content-Type', 'image/png');

        $this->getJson('/api/admin/solicitudes')->assertStatus(401);
        $this->getJson('/api/admin/solicitudes', ['x-admin-password' => 'clave-admin'])->assertOk()->assertJsonPath('0.totalCentavos', 13500);
    }
}
