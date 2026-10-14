<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as PeticionHttp;
use Illuminate\Http\UploadedFile;
use App\Servicios\MercadoPago;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use setasign\Fpdi\PdfParser\StreamReader;
use setasign\Fpdi\Tcpdf\Fpdi;
use Tests\TestCase;

/** Flujo completo de la plataforma: cuentas, documento, firma en orden, PDF final, verificación, planes y Mercado Pago. */
class PlataformaTest extends TestCase
{
    use RefreshDatabase;

    private const H = ['X-AutograFlow' => '1', 'Accept' => 'application/json'];

    private array $pagosMp = [];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config([
            'autograflow.cloudinary' => ['nube' => 'demo', 'clave' => 'clave123', 'secreto' => 'secreto456', 'carpeta' => 'autograflow', 'api' => 'https://api.cloudinary.com'],
            'autograflow.mercadopago' => ['token' => 'TEST-token', 'secreto_webhook' => 'secreto-webhook', 'api' => 'https://api.mercadopago.com'],
            'app.url' => 'https://autograflow.test',
        ]);
        $firma = file_get_contents(base_path('tests/fixtures/firma.png'));
        $subidas = 0;
        Http::fake(function (PeticionHttp $r) use ($firma, &$subidas) {
            $u = $r->url();
            if (str_contains($u, 'cloudinary.com') && str_contains($u, '/image/upload')) {
                return Http::response(['public_id' => 'autograflow/prueba/img'.(++$subidas), 'format' => 'png', 'version' => 1]);
            }
            if (str_contains($u, 'cloudinary.com') && str_contains($u, '/image/download')) {
                return Http::response($firma, 200, ['Content-Type' => 'image/png']);
            }
            if (str_contains($u, '/checkout/preferences')) {
                $ref = $r->data()['external_reference'];
                $item = $r->data()['items'][0];
                $id = count($this->pagosMp) + 9000;
                $this->pagosMp[$id] = ['id' => $id, 'status' => 'approved', 'external_reference' => $ref, 'transaction_amount' => $item['unit_price'], 'currency_id' => $item['currency_id']];
                return Http::response(['id' => "pref-{$id}", 'init_point' => "https://mp.test/pagar/{$id}"], 201);
            }
            if (preg_match('#/v1/payments/search#', $u)) {
                parse_str(parse_url($u, PHP_URL_QUERY), $q);
                return Http::response(['results' => array_values(array_filter($this->pagosMp, fn ($p) => $p['external_reference'] === $q['external_reference']))]);
            }
            if (preg_match('#/v1/payments/(\d+)#', $u, $m)) {
                return Http::response($this->pagosMp[$m[1]] ?? [], isset($this->pagosMp[$m[1]]) ? 200 : 404);
            }
            return Http::response([], 404);
        });
    }

    private function registrar(string $email = 'ana@ejemplo.com', string $codigoEquipo = ''): \Illuminate\Testing\TestResponse
    {
        $this->postJson('/api/auth/salir', [], self::H);
        Auth::forgetGuards();
        return $this->postJson('/api/auth/registro', ['nombre' => 'Ana Torres', 'empresa' => 'Notaría Lima', 'email' => $email, 'clave' => 'clave-segura-1',
            'acepto' => true, 'codigoEquipo' => $codigoEquipo], self::H);
    }

    private function subir(): int
    {
        $pdf = file_get_contents(base_path('tests/fixtures/contrato.pdf'));
        $r = $this->post('/api/documentos', [
            'original' => UploadedFile::fake()->createWithContent('contrato.pdf', $pdf),
            'preparado' => UploadedFile::fake()->createWithContent('preparado.pdf', $pdf),
            'campos' => json_encode([['tipo' => 'texto', 'pagina' => 1, 'x' => 190, 'y' => 349, 'w' => 250, 'h' => 18, 'etiqueta' => 'Nombre arrendatario']]),
            'nombre' => 'Contrato.pdf',
        ], self::H)->assertCreated()->assertJson(['camposDetectados' => 1]);
        return $r->json('id');
    }

    private function preparar(int $id, int $firmantes = 2, string $orden = 'secuencial', string $tipoExtra = ''): void
    {
        $f = array_map(fn ($i) => ['clave' => "f{$i}", 'nombre' => 'Persona '.($i + 1), 'telefono' => '+51 900 000 00'.$i, 'email' => "p{$i}@ejemplo.com"], range(0, $firmantes - 1));
        $campos = [['firmante' => 'f0', 'tipo' => 'texto', 'pagina' => 1, 'x' => 190, 'y' => 349, 'w' => 250, 'h' => 18, 'etiqueta' => 'Nombre', 'obligatorio' => true]];
        foreach ($f as $i => $x) {
            $campos[] = ['firmante' => $x['clave'], 'tipo' => 'firma', 'pagina' => 2, 'x' => 60 + 280 * $i, 'y' => 540, 'w' => 180, 'h' => 50, 'etiqueta' => '', 'obligatorio' => true];
        }
        if ($tipoExtra) {
            $campos[] = ['firmante' => 'f0', 'tipo' => $tipoExtra, 'pagina' => 2, 'x' => 300, 'y' => 600, 'w' => 120, 'h' => 60, 'etiqueta' => '', 'obligatorio' => true];
        }
        $this->putJson("/api/documentos/{$id}", ['nombre' => 'Contrato', 'orden' => $orden, 'mensaje' => '', 'firmantes' => $f, 'campos' => $campos], self::H)->assertOk();
    }

    private function firmaDataUrl(): string
    {
        return 'data:image/png;base64,'.base64_encode(file_get_contents(base_path('tests/fixtures/firma.png')));
    }

    private function firmarComo(string $token): \Illuminate\Testing\TestResponse
    {
        $v = $this->getJson("/api/firmar/{$token}")->json();
        $valores = [];
        foreach ($v['campos'] as $c) {
            if ($c['mio']) {
                $valores[(string) $c['id']] = $c['tipo'] === 'firma' ? $this->firmaDataUrl() : 'Luis Gómez';
            }
        }
        return $this->postJson("/api/firmar/{$token}", ['valores' => $valores], self::H);
    }

    public function test_flujo_completo_de_firma_en_orden(): void
    {
        $this->registrar();
        $this->getJson('/api/auth/yo')->assertOk()->assertJson(['nombre' => 'Ana Torres', 'cuenta' => 'Notaría Lima', 'plan' => 'gratis']);
        $id = $this->subir();
        // Medidas en puntos PDF (carta = 612 × 792) y el campo detectado sin recortar.
        $this->getJson("/api/documentos/{$id}")->assertJson(['paginas' => [['ancho' => 612, 'alto' => 792], ['ancho' => 612, 'alto' => 792]], 'campos' => [['x' => 190, 'y' => 349, 'w' => 250]]]);
        $this->preparar($id);
        $det = $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk()->assertJson(['estado' => 'en_firma'])->json();
        [$t1, $t2] = array_column($det['firmantes'], 'token');

        // Firmante 2 no puede firmar antes que el 1
        $this->getJson("/api/firmar/{$t2}")->assertJson(['turno' => false, 'esperando' => 'Persona 1']);
        $this->firmarComo($t2)->assertStatus(409);

        // Firmante 1: falta un obligatorio → 400 con el campo marcado
        $this->postJson("/api/firmar/{$t1}", ['valores' => []], self::H)->assertStatus(400)->assertJsonStructure(['campos']);
        $this->firmarComo($t1)->assertOk()->assertJson(['completo' => false]);
        $this->getJson("/api/firmar/{$t1}")->assertJson(['yo' => ['estado' => 'firmado'], 'siguiente' => ['nombre' => 'Persona 2']]);

        // La firma se subió a Cloudinary como imagen privada, con la firma correcta de la API
        Http::assertSent(function (PeticionHttp $r) {
            if (! str_contains($r->url(), '/image/upload')) {
                return false;
            }
            $p = collect($r->data())->mapWithKeys(fn ($x) => [$x['name'] => $x['contents']]);
            $esperada = sha1("folder={$p['folder']}&timestamp={$p['timestamp']}&type=private".'secreto456');
            return $p['type'] === 'private' && str_starts_with($p['folder'], 'autograflow/documentos/') && $p['signature'] === $esperada;
        });

        // Firmante 2 completa el documento → PDF final con certificado
        $this->firmarComo($t2)->assertOk()->assertJson(['completo' => true]);
        $final = $this->get("/api/documentos/{$id}/final")->assertOk()->assertHeader('Content-Type', 'application/pdf')->getContent();
        $this->assertSame(3, (new Fpdi)->setSourceFile(StreamReader::createByString($final)), 'contrato de 2 páginas + certificado');
        $this->getJson("/api/documentos/{$id}")->assertJson(['estado' => 'completado', 'sha256Final' => hash('sha256', $final)]);

        // Verificación pública
        $this->getJson('/api/verificar/'.hash('sha256', $final))->assertJson(['encontrado' => true, 'tipo' => 'firmado']);
        $this->getJson('/api/verificar/'.hash('sha256', $final.'x'))->assertJson(['encontrado' => false]);

        // El firmante también descarga el PDF final y ve la imagen de su firma (servida por la app, no por Cloudinary)
        $this->get("/api/firmar/{$t1}/final")->assertOk();
        $campoFirma = collect($this->getJson("/api/firmar/{$t1}")->json('campos'))->firstWhere('tipo', 'firma');
        $this->get("/api/firmar/{$t1}/campos/{$campoFirma['id']}/imagen")->assertOk()->assertHeader('Content-Type', 'image/png');
    }

    public function test_seguridad(): void
    {
        $this->registrar();
        $id = $this->subir();
        // Sin la cabecera X-AutograFlow no se puede cambiar nada (protección CSRF)
        $this->postJson("/api/documentos/{$id}/enviar", [], ['Accept' => 'application/json'])->assertStatus(403);
        // Otra cuenta no ve el documento
        $this->registrar('otro@ejemplo.com');
        $this->getJson("/api/documentos/{$id}")->assertStatus(404);
        // Sin sesión
        $this->postJson('/api/auth/salir', [], self::H);
        Auth::forgetGuards();
        $this->getJson('/api/documentos')->assertStatus(401);
        $this->getJson('/api/firmar/'.str_repeat('a', 32))->assertStatus(404);
    }

    public function test_cupo_del_plan_gratis_y_compra_con_mercado_pago(): void
    {
        $this->registrar()->assertCreated();
        // Gratis: máximo 2 firmantes y sin sello ni huella
        $id = $this->subir();
        $this->preparar($id, 3);
        $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertStatus(402);
        $this->preparar($id, 1, 'secuencial', 'sello');
        $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertStatus(402)->assertJsonPath('error', fn ($e) => str_contains($e, 'sello'));
        // Gratis: 2 documentos por día
        foreach (range(1, 2) as $_) {
            $d = $this->subir();
            $this->preparar($d, 1);
            $this->postJson("/api/documentos/{$d}/enviar", [], self::H)->assertOk();
        }
        $bloqueado = $this->subir();
        $this->preparar($bloqueado, 1);
        $this->postJson("/api/documentos/{$bloqueado}/enviar", [], self::H)->assertStatus(402)->assertJsonPath('error', fn ($e) => str_contains($e, '2 documentos de hoy'));
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['plan' => 'gratis', 'usados' => 2, 'limite' => 2, 'periodo' => 'dia', 'disponibles' => 0]]);
        // Al día siguiente vuelve a tener cupo
        $this->travel(1)->days();
        $this->postJson("/api/documentos/{$bloqueado}/enviar", [], self::H)->assertOk();

        // Compra del plan Profesional: Mercado Pago aprueba y al volver se verifica el pago
        $compra = $this->postJson('/api/pagos', ['producto' => 'profesional'], self::H)->assertCreated()->json();
        $this->assertStringStartsWith('https://mp.test/pagar/', $compra['url']);
        $this->postJson("/api/pagos/{$compra['pagoId']}/verificar", [], self::H)->assertJson(['estado' => 'aprobado']);
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['plan' => 'profesional', 'limite' => 180, 'periodo' => 'mes', 'selloHuella' => true]]);
        $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk(); // el del sello

        // Ocasional por webhook firmado: suma 10 documentos sin rebajar el plan; repetir el aviso no suma dos veces; firma falsa → 401
        $ocasional = $this->postJson('/api/pagos', ['producto' => 'ocasional'], self::H)->json();
        $mpId = (string) collect($this->pagosMp)->firstWhere('external_reference', "af-{$ocasional['pagoId']}")['id'];
        $aviso = function (string $secreto) use ($mpId) {
            $ts = (string) time();
            $v1 = hash_hmac('sha256', "id:{$mpId};request-id:req-1;ts:{$ts};", $secreto);
            return $this->postJson("/api/pagos/webhook?data.id={$mpId}&type=payment", ['type' => 'payment', 'data' => ['id' => $mpId]], ['x-signature' => "ts={$ts},v1={$v1}", 'x-request-id' => 'req-1']);
        };
        $aviso('falso')->assertStatus(401);
        $aviso('secreto-webhook')->assertOk();
        $aviso('secreto-webhook')->assertOk();
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['plan' => 'profesional', 'creditos' => 10]]);

        // Pago por un monto menor al precio: no se activa
        $trampa = $this->postJson('/api/pagos', ['producto' => 'empresarial'], self::H)->json();
        $clave = collect($this->pagosMp)->search(fn ($p) => $p['external_reference'] === "af-{$trampa['pagoId']}");
        $this->pagosMp[$clave]['transaction_amount'] = 1;
        $this->postJson("/api/pagos/{$trampa['pagoId']}/verificar", [], self::H)->assertJson(['estado' => 'pendiente']);
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['plan' => 'profesional']]);

        // Al vencer el Profesional, con créditos comprados sigue con las reglas de Ocasional
        $this->travel(31)->days();
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['plan' => 'ocasional', 'creditos' => 10, 'firmantesPorDocumento' => 20]]);
    }

    public function test_ocasional_desde_gratis_y_equipo_empresarial(): void
    {
        $this->registrar()->assertCreated();
        $cuenta = DB::table('users')->where('email', 'ana@ejemplo.com')->value('cuenta_id');
        MercadoPago::activarManual($cuenta, 'ocasional');
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['plan' => 'ocasional', 'vence' => null, 'creditos' => 10, 'limite' => 2, 'disponibles' => 12]]);
        $this->getJson('/api/cuenta/equipo')->assertJson(['activo' => false, 'codigo' => null]);

        // Empresarial: código de organización y hasta 5 usuarios
        MercadoPago::activarManual($cuenta, 'empresarial');
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['plan' => 'empresarial', 'limite' => null, 'disponibles' => null, 'usuarios' => 5]]);
        $codigo = $this->getJson('/api/cuenta/equipo')->assertJson(['activo' => true, 'soyTitular' => true])->json('codigo');
        $this->assertMatchesRegularExpression('/^AF-ORG-[A-Z0-9]{5}$/', $codigo);
        $doc = $this->subir();

        $this->registrar('falso@ejemplo.com', 'AF-ORG-NOEXI')->assertStatus(400)->assertJsonPath('campos.codigoEquipo', 'Código no válido');
        foreach (range(2, 5) as $i) {
            $this->registrar("miembro{$i}@ejemplo.com", strtolower($codigo))->assertCreated();
        }
        // El miembro ve los documentos de la organización y no puede cambiar el código
        $this->getJson('/api/documentos')->assertJsonPath('0.id', $doc);
        $this->postJson('/api/cuenta/equipo/codigo', [], self::H)->assertStatus(403);
        $this->getJson('/api/auth/yo')->assertJson(['plan' => 'empresarial', 'titular' => false]);
        $this->registrar('sexto@ejemplo.com', $codigo)->assertStatus(400)->assertJsonPath('campos.codigoEquipo', 'Sin plazas');

        // El titular quita a un miembro: queda con su propia cuenta Gratis
        $this->postJson('/api/auth/ingresar', ['email' => 'ana@ejemplo.com', 'clave' => 'clave-segura-1'], self::H)->assertOk();
        $miembro = DB::table('users')->where('email', 'miembro2@ejemplo.com')->value('id');
        $this->deleteJson("/api/cuenta/equipo/{$miembro}", [], self::H)->assertOk();
        $this->assertNotSame($cuenta, DB::table('users')->where('id', $miembro)->value('cuenta_id'));
        $this->assertCount(4, $this->getJson('/api/cuenta/equipo')->json('miembros'));
        // Registrarse sin aceptar los términos no se permite
        $this->postJson('/api/auth/registro', ['nombre' => 'Sin Términos', 'email' => 'sin@ejemplo.com', 'clave' => 'clave-segura-1'], self::H)->assertStatus(400);
    }

    public function test_logo_plantillas_y_marca_del_plan_gratis(): void
    {
        $this->registrar();
        $logo = file_get_contents(base_path('tests/fixtures/logo.png'));
        $this->call('PUT', '/api/cuenta/logo', [], [], [], ['HTTP_X_AUTOGRAFLOW' => '1', 'CONTENT_TYPE' => 'image/png', 'HTTP_ACCEPT' => 'application/json'], $logo)->assertStatus(402);

        // Plantilla: no se envía; «usar» crea una copia sin contactos
        $id = $this->subir();
        $this->preparar($id, 2);
        $this->postJson("/api/documentos/{$id}/plantilla", ['es' => true], self::H)->assertOk();
        $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertStatus(409);
        $copia = $this->postJson("/api/documentos/{$id}/duplicar", [], self::H)->assertCreated()->json('id');
        $c = $this->getJson("/api/documentos/{$copia}")->json();
        $this->assertFalse($c['esPlantilla']);
        $this->assertCount(3, $c['campos']);
        $this->assertSame(['', ''], array_column($c['firmantes'], 'email'));

        // Plan gratis: marca «Firmado con AutograFlow» en el PDF final
        $d = $this->subir();
        $this->preparar($d, 1);
        $t = $this->postJson("/api/documentos/{$d}/enviar", [], self::H)->json('firmantes.0.token');
        $this->firmarComo($t)->assertJson(['completo' => true]);
        $final = $this->get("/api/documentos/{$d}/final")->getContent();
        $this->assertStringContainsString('plan gratuito', $this->texto($final));
    }

    /** Correos enviados en la prueba (MAIL_MAILER=array): [para, asunto, html]. */
    private function correos(): array
    {
        return app('mail.manager')->mailer()->getSymfonyTransport()->messages()
            ->map(fn ($m) => [$m->getOriginalMessage()->getTo()[0]->getAddress(), $m->getOriginalMessage()->getSubject(), $m->getOriginalMessage()->getHtmlBody()])->all();
    }

    public function test_recuperar_contrasena(): void
    {
        $this->registrar();
        $this->postJson('/api/auth/salir', [], self::H);
        Auth::forgetGuards();
        // Correo inexistente: misma respuesta y sin correo (no revela quién tiene cuenta)
        $this->postJson('/api/auth/olvide', ['email' => 'nadie@ejemplo.com'], self::H)->assertOk();
        $this->assertCount(0, $this->correos());
        $this->postJson('/api/auth/olvide', ['email' => 'ANA@ejemplo.com'], self::H)->assertOk();
        [[$para, $asunto, $html]] = $this->correos();
        $this->assertSame('ana@ejemplo.com', $para);
        preg_match('#/restablecer\?token=([^&"]+)&amp;email=#', $html, $m);
        $token = urldecode($m[1]);

        $this->postJson('/api/auth/restablecer', ['email' => 'ana@ejemplo.com', 'token' => 'falso', 'clave' => 'nueva-clave-1'], self::H)->assertStatus(400);
        $this->postJson('/api/auth/restablecer', ['email' => 'ana@ejemplo.com', 'token' => $token, 'clave' => 'nueva-clave-1'], self::H)->assertOk();
        $this->getJson('/api/auth/yo')->assertOk()->assertJson(['email' => 'ana@ejemplo.com']);
        // El enlace sirve una sola vez; la contraseña vieja ya no funciona y la nueva sí
        $this->postJson('/api/auth/restablecer', ['email' => 'ana@ejemplo.com', 'token' => $token, 'clave' => 'otra-clave-2'], self::H)->assertStatus(400);
        $this->postJson('/api/auth/salir', [], self::H);
        Auth::forgetGuards();
        $this->postJson('/api/auth/ingresar', ['email' => 'ana@ejemplo.com', 'clave' => 'clave-segura-1'], self::H)->assertStatus(401);
        $this->postJson('/api/auth/ingresar', ['email' => 'ana@ejemplo.com', 'clave' => 'nueva-clave-1'], self::H)->assertOk();
    }

    public function test_correos_y_recordatorio(): void
    {
        $this->registrar();
        $id = $this->subir();
        $this->preparar($id, 2);
        $det = $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->json();
        $this->assertSame([['p0@ejemplo.com', 'Ana Torres te envió «Contrato» para firmar']], array_map(fn ($c) => [$c[0], $c[1]], $this->correos()));
        [$f1, $f2] = $det['firmantes'];
        // En orden: al segundo todavía no le toca
        $this->postJson("/api/documentos/{$id}/recordar/{$f2['id']}", [], self::H)->assertStatus(409);
        $this->postJson("/api/documentos/{$id}/recordar/{$f1['id']}", [], self::H)->assertOk();
        $this->postJson("/api/documentos/{$id}/recordar/{$f1['id']}", [], self::H)->assertStatus(429);
        $this->assertSame('Recordatorio: «Contrato» espera tu firma', last($this->correos())[1]);
    }

    /** Texto que escribió TCPDF en el PDF (operadores «[(texto)] TJ» dentro de los flujos comprimidos). */
    private function texto(string $pdf): string
    {
        preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $pdf, $m);
        $todo = '';
        foreach ($m[1] as $s) {
            $plano = @gzuncompress($s) ?: $s;
            preg_match_all('/\[\(((?:\\\\.|[^\\\\)])*)\)\]\s*TJ/', $plano, $t);
            $todo .= implode(' ', $t[1]).' ';
        }
        return $todo;
    }
}
