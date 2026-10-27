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
        $campos = [['firmante' => 'f0', 'tipo' => 'texto', 'pagina' => 1, 'x' => 190, 'y' => 349, 'w' => 250, 'h' => 18, 'etiqueta' => 'Nombre', 'obligatorio' => true, 'nombrePdf' => 'Nombre']];
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
        return $this->postJson("/api/firmar/{$token}", ['acepto' => true, 'valores' => $valores], self::H);
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
        $this->postJson("/api/firmar/{$t1}", ['acepto' => true, 'valores' => []], self::H)->assertStatus(400)->assertJsonStructure(['campos']);
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

    public function test_entrar_sin_cuenta(): void
    {
        // Hay que aceptar los Términos en cada entrada
        $this->postJson('/api/auth/invitado', [], self::H)->assertStatus(400);
        $this->postJson('/api/auth/invitado', ['acepto' => true], self::H)->assertOk()->assertCookie('af_invitado');
        $yo = $this->getJson('/api/auth/yo')->assertJson(['invitado' => true, 'email' => '', 'plan' => 'gratis'])->json();
        $this->assertNotNull(DB::table('users')->where('id', $yo['id'])->value('terminos_aceptados_en'));
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['plan' => 'gratis', 'invitado' => true, 'firmantesPorDocumento' => 1, 'limite' => 2]]);

        // Sin cuenta: 1 firmante por documento y no se pueden comprar planes
        $id = $this->subir();
        $this->preparar($id, 2);
        $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertStatus(402)->assertJsonPath('error', fn ($e) => str_contains($e, 'Sin cuenta'));
        $this->preparar($id, 1);
        $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk();
        $this->postJson('/api/pagos', ['producto' => 'profesional'], self::H)->assertStatus(403);

        // Volver a entrar desde el mismo navegador reutiliza al invitado (su cupo del día no se reinicia)
        $this->postJson('/api/auth/salir', [], self::H);
        Auth::forgetGuards();
        $this->withCredentials()->withCookie('af_invitado', (string) $yo['id'])->postJson('/api/auth/invitado', ['acepto' => true], self::H)->assertOk();
        $this->getJson('/api/auth/yo')->assertJson(['id' => $yo['id'], 'invitado' => true]);

        // Al crear la cuenta conserva sus documentos y deja de ser invitado
        $this->postJson('/api/auth/registro', ['nombre' => 'Ana Torres', 'email' => 'ana@ejemplo.com', 'clave' => 'clave-segura-1', 'acepto' => true], self::H)->assertCreated();
        $this->getJson('/api/auth/yo')->assertJson(['id' => $yo['id'], 'invitado' => false, 'email' => 'ana@ejemplo.com', 'nombre' => 'Ana Torres']);
        $this->getJson('/api/documentos')->assertJsonPath('0.id', $id);
        $this->getJson('/api/cuenta')->assertJson(['estado' => ['invitado' => false, 'firmantesPorDocumento' => 2]]);
        // Con cuenta ya no se puede entrar como invitado sin salir antes
        $this->postJson('/api/auth/invitado', ['acepto' => true], self::H)->assertStatus(409);
    }

    public function test_copia_del_firmante_con_plazo(): void
    {
        $this->registrar()->assertCreated();
        $id = $this->subir();
        $this->preparar($id, 2);
        $det = $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk()->json();
        [$t1, $t2] = array_column($det['firmantes'], 'token');
        // Antes de firmar no hay copia
        $this->get("/api/firmar/{$t1}/copia")->assertStatus(409);
        $this->getJson("/api/firmar/{$t1}")->assertJsonPath('yo.copiaHasta', null);
        // Sin aceptar los Términos para firmantes y la Política de Privacidad no se puede firmar
        $this->postJson("/api/firmar/{$t1}", ['valores' => []], self::H)->assertStatus(400)->assertJsonStructure(['campos' => ['acepto']]);
        $this->firmarComo($t1)->assertOk();
        // La aceptación queda en el historial del documento (y en el certificado), con la versión aceptada
        $this->assertTrue(collect($this->getJson("/api/documentos/{$id}")->json('eventos'))->contains(fn ($e) => str_contains($e['detalle'], 'Aceptó los Términos para firmantes')));
        // Firmó el primero (falta el segundo): copia parcial en PDF, con fecha límite
        $this->assertNotNull($this->getJson("/api/firmar/{$t1}")->json('yo.copiaHasta'));
        $copia = $this->get("/api/firmar/{$t1}/copia?descargar=1")->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $copia->getContent());
        $this->assertStringContainsString('attachment', (string) $copia->headers->get('Content-Disposition'));
        // El documento sigue en firma: la copia no lo completa
        $this->getJson("/api/documentos/{$id}")->assertJsonPath('estado', 'en_firma');
        // Pasado el plazo ya no se puede descargar: hay que pedirla a quien la envió
        $this->travel(config('autograflow.copia_dias') + 1)->days();
        $this->getJson("/api/firmar/{$t1}/copia")->assertStatus(410)->assertJsonPath('error', fn ($e) => str_contains($e, 'Pídele una copia'));
        $this->getJson("/api/firmar/{$t2}/copia")->assertStatus(409);
    }

    public function test_contactos_del_directorio(): void
    {
        $this->registrar()->assertCreated();
        // Validaciones: nombre y, al menos, WhatsApp o correo válidos
        $this->postJson('/api/contactos', ['nombre' => 'Luis Rojas'], self::H)->assertStatus(400)->assertJsonStructure(['campos' => ['telefono']]);
        $this->postJson('/api/contactos', ['nombre' => 'Luis Rojas', 'email' => 'no-es-correo'], self::H)->assertStatus(400)->assertJsonStructure(['campos' => ['email']]);
        $id = $this->postJson('/api/contactos', ['nombre' => 'Luis Rojas', 'telefono' => '+51 987 654 321'], self::H)->assertCreated()->json('id');
        // El mismo nombre no se repite: se actualizan sus datos
        $this->postJson('/api/contactos', ['nombre' => 'luis rojas', 'email' => 'luis@ejemplo.com'], self::H)->assertCreated()->assertJsonPath('id', $id);
        $this->putJson("/api/contactos/{$id}", ['nombre' => 'Luis Rojas', 'telefono' => '+51 987 654 321', 'email' => 'luis@ejemplo.com'], self::H)->assertOk();
        // Los datos guardados mandan sobre los de los documentos enviados
        $this->postJson('/api/contactos', ['nombre' => 'Persona 1', 'telefono' => '+51 911 111 111'], self::H)->assertCreated();
        $this->preparar($this->subir());
        $lista = collect($this->getJson('/api/contactos', self::H)->assertOk()->json())->keyBy('nombre');
        $this->assertSame('+51 987 654 321', $lista['Luis Rojas']['telefono']);
        $this->assertSame('luis@ejemplo.com', $lista['Luis Rojas']['email']);
        $this->assertSame('+51 911 111 111', $lista['Persona 1']['telefono']);
        $this->assertNull($lista['Persona 2']['id']);
        // Otra cuenta no puede tocarlos
        $this->registrar('otra@ejemplo.com')->assertCreated();
        $this->deleteJson("/api/contactos/{$id}", [], self::H)->assertNotFound();
        $this->assertSame([], $this->getJson('/api/contactos', self::H)->json());
    }

    public function test_idioma_de_la_pagina_del_firmante(): void
    {
        $this->registrar()->assertCreated();
        $pdf = file_get_contents(base_path('tests/fixtures/contrato.pdf'));
        $id = $this->post('/api/documentos', [
            'original' => UploadedFile::fake()->createWithContent('contract.pdf', $pdf),
            'preparado' => UploadedFile::fake()->createWithContent('preparado.pdf', $pdf),
            'campos' => '[]', 'nombre' => 'Contract.pdf', 'idioma' => 'en',
        ], self::H)->assertCreated()->json('id');
        $this->getJson("/api/documentos/{$id}", self::H)->assertJsonPath('idioma', 'en');
        // Un valor no permitido al subir queda en español
        $otro = $this->post('/api/documentos', [
            'original' => UploadedFile::fake()->createWithContent('c.pdf', $pdf), 'preparado' => UploadedFile::fake()->createWithContent('p.pdf', $pdf),
            'campos' => '[]', 'nombre' => 'C.pdf', 'idioma' => 'xx',
        ], self::H)->assertCreated()->json('id');
        $this->getJson("/api/documentos/{$otro}", self::H)->assertJsonPath('idioma', 'es');
        // Quien prepara lo puede cambiar; el firmante lo recibe en su vista
        $this->preparar($id, 1);
        $det = $this->getJson("/api/documentos/{$id}", self::H)->json();
        $this->putJson("/api/documentos/{$id}", [...array_intersect_key($det, array_flip(['nombre', 'orden', 'mensaje'])), 'idioma' => 'xx', 'firmantes' => [], 'campos' => []], self::H)->assertStatus(400);
        $this->assertSame('en', $this->getJson("/api/documentos/{$id}", self::H)->json('idioma'));
        $token = $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk()->json('firmantes.0.token');
        $this->getJson("/api/firmar/{$token}", self::H)->assertOk()->assertJsonPath('documento.idioma', 'en');
    }

    public function test_plantilla_enviar_a_varios_historial_y_zip(): void
    {
        $this->registrar()->assertCreated();
        $id = $this->subir();
        $this->preparar($id, 2, 'paralelo');
        // Solo desde una plantilla
        $this->postJson("/api/documentos/{$id}/enviar-a-varios", ['firmante' => 1, 'destinatarios' => [['nombre' => 'Eva', 'email' => 'eva@ejemplo.com']]], self::H)->assertStatus(409);
        $this->postJson("/api/documentos/{$id}/plantilla", ['es' => true], self::H)->assertOk();
        // Validación de los destinatarios
        $this->postJson("/api/documentos/{$id}/enviar-a-varios", ['firmante' => 1, 'destinatarios' => [['nombre' => 'Eva']]], self::H)
            ->assertStatus(400)->assertJsonStructure(['campos' => ['destinatarios.0.telefono']]);

        // Plan Gratis: 2 documentos al día → el tercero no se envía y se avisa
        $r = $this->postJson("/api/documentos/{$id}/enviar-a-varios", ['firmante' => 1, 'destinatarios' => [
            ['nombre' => 'Eva Díaz', 'telefono' => '', 'email' => 'eva@ejemplo.com'],
            ['nombre' => 'Raúl Soto', 'telefono' => '+51 911 222 333', 'email' => ''],
            ['nombre' => 'Lía Paz', 'telefono' => '+51 911 222 444', 'email' => ''],
        ]], self::H)->assertOk()->json();
        $this->assertNotNull($r[0]['token']);
        $this->assertNotNull($r[1]['token']);
        $this->assertNull($r[2]['token']);
        $this->assertNotNull($r[2]['error']);
        $this->assertSame(2, DB::table('documentos')->where('plantilla_id', $id)->count()); // el que falló no deja borrador

        // Cada documento lleva al destinatario en el lugar del Firmante 1; el Firmante 2 conserva los datos de la plantilla
        $doc = $this->getJson("/api/documentos/{$r[0]['documentoId']}", self::H)->assertOk()->json();
        $this->assertSame('en_firma', $doc['estado']);
        $this->assertSame('Eva Díaz', $doc['firmantes'][0]['nombre']);
        $this->assertSame('eva@ejemplo.com', $doc['firmantes'][0]['email']);
        $this->assertSame('p1@ejemplo.com', $doc['firmantes'][1]['email']);
        $this->assertStringContainsString('Eva Díaz', $doc['nombre']);

        // Historial y ZIP
        $this->getJson("/api/documentos/{$id}/envios", self::H)->assertOk()->assertJsonCount(2);
        $this->get("/api/documentos/{$id}/firmados.zip", self::H)->assertNotFound();
        $this->firmarComo($r[0]['token'])->assertOk();
        $this->firmarComo($doc['firmantes'][1]['token'])->assertOk();
        $envios = collect($this->getJson("/api/documentos/{$id}/envios", self::H)->json())->keyBy('id');
        $this->assertSame('completado', $envios[$r[0]['documentoId']]['estado']);
        $this->assertSame('firmado', $envios[$r[0]['documentoId']]['firmantes'][0]['estado']);
        $zip = $this->get("/api/documentos/{$id}/firmados.zip", self::H)->assertOk()->assertHeader('Content-Type', 'application/zip')->getContent();
        $tmp = tempnam(sys_get_temp_dir(), 'zt');
        file_put_contents($tmp, $zip);
        $z = new \ZipArchive;
        $this->assertTrue($z->open($tmp) === true);
        $this->assertSame(1, $z->numFiles);
        $this->assertStringStartsWith('%PDF', $z->getFromIndex(0));
        $z->close();
        unlink($tmp);

        // Contactos con categoría
        $this->postJson('/api/contactos', ['nombre' => 'Ana Ríos', 'email' => 'ana.r@ejemplo.com', 'categoria' => '  Docentes '], self::H)->assertCreated()->assertJsonPath('categoria', 'Docentes');
        $this->assertSame('Docentes', collect($this->getJson('/api/contactos', self::H)->json())->firstWhere('nombre', 'Ana Ríos')['categoria']);
    }

    public function test_eliminar_documento_terminado(): void
    {
        $this->registrar()->assertCreated();
        $id = $this->subir();
        $this->preparar($id, 1);
        $t = $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk()->json('firmantes.0.token');
        // En firma: el primer «eliminar» lo anula; el segundo lo borra del todo
        $this->deleteJson("/api/documentos/{$id}", [], self::H)->assertJson(['resultado' => 'anulado']);
        $this->deleteJson("/api/documentos/{$id}", [], self::H)->assertJson(['resultado' => 'eliminado']);
        $this->getJson("/api/documentos/{$id}")->assertNotFound();
        $this->getJson("/api/firmar/{$t}")->assertNotFound();
        $this->assertFalse(Storage::disk('local')->exists("documentos/{$id}/original.pdf"));
        // El documento enviado sigue contando en el cupo del plan
        $this->assertSame(1, DB::table('consumos')->where('documento_id', $id)->count());
    }

    public function test_texto_del_firmante_y_campos_bloqueados(): void
    {
        $this->registrar()->assertCreated();
        $id = $this->subir();
        $f = [['clave' => 'f0', 'nombre' => 'Ana', 'modoTexto' => 'libre'], ['clave' => 'f1', 'nombre' => 'Luis', 'modoTexto' => 'solo']];
        $firmas = array_map(fn ($i) => ['firmante' => "f{$i}", 'tipo' => 'firma', 'pagina' => 2, 'x' => 60 + 280 * $i, 'y' => 540, 'w' => 180, 'h' => 50, 'etiqueta' => '', 'obligatorio' => true], [0, 1]);
        $pdf = ['tipo' => 'texto', 'pagina' => 1, 'x' => 190, 'y' => 349, 'w' => 250, 'h' => 18, 'etiqueta' => 'Nombre', 'obligatorio' => true, 'nombrePdf' => 'Nombre'];
        $guardar = fn (array $campos) => $this->putJson("/api/documentos/{$id}", ['nombre' => 'Contrato', 'orden' => 'secuencial', 'mensaje' => '', 'firmantes' => $f, 'campos' => $campos], self::H);

        // Quien «solo firma» no puede tener campos de texto
        $guardar([...$firmas, [...$pdf, 'firmante' => 'f1']])->assertStatus(400);
        // Un campo bloqueado queda vacío y sin firmante, aunque se mande con valor o asignado
        $guardar([...$firmas, [...$pdf, 'firmante' => 'f0', 'bloqueado' => true, 'valor' => 'X']])->assertOk();
        $det = $this->getJson("/api/documentos/{$id}")->assertJsonPath('firmantes.0.modoTexto', 'libre')->assertJsonPath('firmantes.1.modoTexto', 'solo')->json();
        $bloqueado = collect($det['campos'])->firstWhere('nombrePdf', 'Nombre');
        $this->assertEquals(['bloqueado' => true, 'firmante' => 'preparador', 'valor' => null], array_intersect_key($bloqueado, array_flip(['bloqueado', 'firmante', 'valor'])));

        // Gratis: texto libre (o cuadros nuevos) requiere un plan de pago
        $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertStatus(402)->assertJsonPath('error', fn ($e) => str_contains($e, 'texto libre'));
        MercadoPago::activarManual(DB::table('users')->where('email', 'ana@ejemplo.com')->value('cuenta_id'), 'profesional');
        $t0 = collect($this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk()->json('firmantes'))->firstWhere('orden', 1)['token'];

        // El firmante con texto libre agrega su texto al firmar; queda como campo suyo, ya lleno
        $v = $this->getJson("/api/firmar/{$t0}")->assertJsonPath('yo.modoTexto', 'libre')->json();
        $valores = collect($v['campos'])->where('mio', true)->mapWithKeys(fn ($c) => [(string) $c['id'] => $this->firmaDataUrl()])->all();
        $this->postJson("/api/firmar/{$t0}", ['acepto' => true, 'valores' => $valores, 'libres' => [['pagina' => 1, 'x' => 50, 'y' => 60, 'w' => 120, 'h' => 16, 'texto' => 'Recibí conforme']]], self::H)->assertOk();
        $libre = collect($this->getJson("/api/documentos/{$id}")->json('campos'))->firstWhere('libre', true);
        $this->assertSame('Recibí conforme', $libre['valor']);
        $this->assertSame('texto', $libre['tipo']);
    }

    public function test_el_enlace_permite_completar_campos_asignados_en_ambos_modos_de_texto(): void
    {
        $this->registrar();
        foreach (['asignados', 'libre'] as $modo) {
            if ($modo === 'libre') {
                MercadoPago::activarManual(DB::table('users')->where('email', 'ana@ejemplo.com')->value('cuenta_id'), 'profesional');
            }
            $id = $this->subir();
            $base = ['pagina' => 1, 'x' => 50, 'y' => 60, 'w' => 120, 'h' => 18, 'obligatorio' => true];
            $campos = [];
            foreach (['texto', 'fecha', 'casilla'] as $i => $tipo) {
                $campos[] = ['firmante' => 'f0', 'tipo' => $tipo, 'nombrePdf' => $tipo, 'etiqueta' => $tipo, 'y' => 60 + 30 * $i] + $base;
            }
            $campos[] = ['firmante' => 'f0', 'tipo' => 'firma', 'etiqueta' => 'Firma'] + $base;
            $campos[] = ['firmante' => 'preparador', 'tipo' => 'texto', 'nombrePdf' => 'Preparado', 'valor' => 'Dato del remitente'] + $base;
            $campos[] = ['firmante' => 'f0', 'tipo' => 'texto', 'nombrePdf' => 'Bloqueado', 'bloqueado' => true] + $base;
            $this->putJson("/api/documentos/{$id}", [
                'nombre' => 'Formulario', 'orden' => 'secuencial', 'mensaje' => '',
                'firmantes' => [['clave' => 'f0', 'nombre' => 'Luis', 'modoTexto' => $modo]], 'campos' => $campos,
            ], self::H)->assertOk();
            $token = $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk()->json('firmantes.0.token');
            $vista = $this->getJson("/api/firmar/{$token}")->assertOk()->assertJsonPath('yo.modoTexto', $modo)->json();
            $mios = collect($vista['campos'])->where('mio', true);
            $this->assertCount(4, $mios);
            $this->assertNotContains('Bloqueado', array_column($vista['campos'], 'nombrePdf'));
            $this->assertFalse(collect($vista['campos'])->firstWhere('nombrePdf', 'Preparado')['mio']);
            $valores = ['texto' => 'Luis Gómez', 'fecha' => '2026-10-23', 'casilla' => true, 'firma' => $this->firmaDataUrl()];
            $this->postJson("/api/firmar/{$token}", [
                'acepto' => true, 'valores' => $mios->mapWithKeys(fn ($c) => [(string) $c['id'] => $valores[$c['tipo']]])->all(),
            ], self::H)->assertOk()->assertJsonPath('completo', true);
            $guardados = collect($this->getJson("/api/documentos/{$id}")->json('campos'))->keyBy('nombrePdf');
            $this->assertSame('Luis Gómez', $guardados['texto']['valor']);
            $this->assertSame('2026-10-23', $guardados['fecha']['valor']);
            $this->assertTrue($guardados['casilla']['valor']);
            $this->assertSame('Dato del remitente', $guardados['Preparado']['valor']);
            $this->assertNull($guardados['Bloqueado']['valor']);
        }
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

    public function test_quitar_pagina_firma_con_dni_y_certificado_de_evidencias(): void
    {
        $this->registrar();
        MercadoPago::activarManual(DB::table('users')->where('email', 'ana@ejemplo.com')->value('cuenta_id'), 'profesional');

        // Quitar una página del borrador: se borran sus campos y los de la página siguiente suben una
        $id = $this->subir();
        $this->preparar($id, 1); // texto en la página 1, firma en la 2
        $det = $this->deleteJson("/api/documentos/{$id}/paginas/1", [], self::H)->assertOk()->json();
        $this->assertCount(1, $det['paginas']);
        $this->assertSame([['firma', 1]], array_map(fn ($c) => [$c['tipo'], $c['pagina']], $det['campos']));
        $this->assertSame(1, (new Fpdi)->setSourceFile(StreamReader::createByString($this->get("/api/documentos/{$id}/archivo")->getContent())));
        $this->deleteJson("/api/documentos/{$id}/paginas/1", [], self::H)->assertStatus(400); // debe quedar al menos una

        // Firmante con DNI: necesita un espacio para la firma y otro para la huella
        $guardar = fn (array $campos) => $this->putJson("/api/documentos/{$id}", ['nombre' => 'Contrato', 'orden' => 'secuencial', 'mensaje' => '', 'flujo' => true, 'certificado' => true,
            'firmantes' => [['clave' => 'f0', 'nombre' => 'Luis Gómez', 'telefono' => '', 'email' => '', 'pedirDni' => true]], 'campos' => $campos], self::H)->assertOk();
        $firma = ['firmante' => 'f0', 'tipo' => 'firma', 'pagina' => 1, 'x' => 60, 'y' => 540, 'w' => 180, 'h' => 50, 'etiqueta' => '', 'obligatorio' => true];
        $guardar([$firma]);
        $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertStatus(400)->assertJsonPath('error', fn ($e) => str_contains($e, 'huella'));
        $guardar([$firma, ['tipo' => 'huella', 'x' => 300, 'w' => 60, 'h' => 80, 'etiqueta' => 'Índice derecho'] + $firma]);
        $this->getJson("/api/documentos/{$id}")->assertJson(['flujo' => true, 'certificado' => true, 'firmantes' => [['pedirDni' => true]]]);
        $t = $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk()->json('firmantes.0.token');
        $vista = $this->getJson("/api/firmar/{$t}")->assertJson(['documento' => ['flujo' => true, 'certificado' => true, 'bloquearDibujo' => true], 'yo' => ['pedirDni' => true]])->json();

        // Sin las fotos del DNI no se puede firmar
        $valores = collect($vista['campos'])->where('mio', true)->mapWithKeys(fn ($c) => [(string) $c['id'] => $this->firmaDataUrl()])->all();
        $this->postJson("/api/firmar/{$t}", ['acepto' => true, 'valores' => $valores], self::H)->assertStatus(400)->assertJsonStructure(['campos' => ['dni_frente', 'dni_reverso']]);
        $foto = $this->firmaDataUrl();
        $this->postJson("/api/firmar/{$t}", ['acepto' => true, 'valores' => $valores, 'evidencias' => [
            'dni' => ['frente' => $foto, 'reverso' => $foto],
            'momentos' => ['dniFrente' => '2026-10-20T15:00:00Z', 'firma' => '2026-10-20T15:01:00Z', 'huella' => 'no es una fecha'],
            'ubicacion' => ['lat' => -12.04637, 'lng' => -77.04279, 'precision' => 35],
        ]], self::H)->assertOk()->assertJson(['completo' => true]);
        $f = DB::table('firmantes')->where('token', $t)->first();
        $this->assertNotNull($f->dni_frente);
        $this->assertNotNull($f->dni_reverso);
        $this->assertSame(['dniFrente' => '2026-10-20T15:00:00Z', 'firma' => '2026-10-20T15:01:00Z'], json_decode($f->evidencias, true)['momentos']);

        // PDF final: la página + el certificado + la hoja de evidencias con la ubicación
        $final = $this->get("/api/documentos/{$id}/final")->getContent();
        $this->assertSame(3, (new Fpdi)->setSourceFile(StreamReader::createByString($final)));
        $texto = $this->texto($final);
        $this->assertStringContainsString('Evidencias', $texto);
        $this->assertStringContainsString('-12.04637', $texto);
    }

    public function test_campos_que_llena_el_preparador_y_campos_calculados(): void
    {
        $this->registrar();
        $pdf = file_get_contents(base_path('tests/fixtures/contrato.pdf'));
        $formulario = ['objects' => ['Total' => [['id' => '9R', 'type' => 'text', 'value' => '']]], 'calculationOrder' => ['9R'], 'actions' => [], 'numPages' => 2];
        $id = $this->post('/api/documentos', [
            'original' => UploadedFile::fake()->createWithContent('reembolso.pdf', $pdf),
            'preparado' => UploadedFile::fake()->createWithContent('preparado.pdf', $pdf),
            'campos' => json_encode([
                ['tipo' => 'texto', 'pagina' => 1, 'x' => 190, 'y' => 349, 'w' => 250, 'h' => 18, 'etiqueta' => 'Nombre', 'nombrePdf' => 'Nombre'],
                ['tipo' => 'calculo', 'pagina' => 1, 'x' => 190, 'y' => 380, 'w' => 120, 'h' => 18, 'etiqueta' => 'Total', 'nombrePdf' => 'Total'],
                ['tipo' => 'firma', 'pagina' => 2, 'x' => 60, 'y' => 540, 'w' => 180, 'h' => 50, 'etiqueta' => 'Firma'],
            ]),
            'formulario' => json_encode($formulario),
            'nombre' => 'Reembolso.pdf',
        ], self::H)->assertCreated()->json('id');
        // Los datos y el cálculo detectados quedan para quien prepara (y el PDF); la firma, para el Firmante 1
        $det = $this->getJson("/api/documentos/{$id}")->assertJsonPath('formulario.calculationOrder', ['9R'])->json();
        $this->assertSame(['preparador', 'preparador', $det['firmantes'][0]['clave']], array_column($det['campos'], 'firmante'));
        $this->assertSame(['Nombre', 'Total', ''], array_column($det['campos'], 'nombrePdf'));

        $f = [['clave' => 'f0', 'nombre' => 'Luis Gómez', 'telefono' => '', 'email' => '']];
        $base = ['pagina' => 1, 'x' => 190, 'w' => 120, 'h' => 18, 'etiqueta' => '', 'obligatorio' => true];
        $campos = [
            ['firmante' => 'preparador', 'tipo' => 'texto', 'y' => 349, 'valor' => 'Ana Torres', 'nombrePdf' => 'Nombre'] + $base,
            // Casilla del propio PDF (en Gratis solo se llenan los campos que ya trae el PDF)
            ['firmante' => 'preparador', 'tipo' => 'casilla', 'y' => 420, 'w' => 14, 'h' => 14, 'valor' => true, 'nombrePdf' => 'Acepto'] + $base,
            ['firmante' => 'preparador', 'tipo' => 'calculo', 'y' => 380, 'nombrePdf' => 'Total'] + $base,
            ['firmante' => 'f0', 'tipo' => 'firma', 'pagina' => 2, 'y' => 540, 'w' => 180, 'h' => 50] + $base,
        ];
        $guardar = fn (array $c) => $this->putJson("/api/documentos/{$id}", ['nombre' => 'Reembolso', 'orden' => 'secuencial', 'mensaje' => '', 'firmantes' => $f, 'campos' => $c], self::H);
        // La firma no la puede «llenar» quien prepara
        $guardar([['firmante' => 'preparador', 'tipo' => 'firma', 'y' => 500] + $base])->assertStatus(400);
        $guardar($campos)->assertOk();
        $this->assertSame(['Ana Torres', true, null, null], array_column($this->getJson("/api/documentos/{$id}")->json('campos'), 'valor'));

        // El firmante ve lo que escribió quien preparó, el campo calculado y los scripts del PDF
        $t = $this->postJson("/api/documentos/{$id}/enviar", [], self::H)->assertOk()->json('firmantes.0.token');
        $v = $this->getJson("/api/firmar/{$t}")->assertJsonPath('formulario.calculationOrder', ['9R'])->json();
        $porTipo = collect($v['campos'])->keyBy('tipo');
        $this->assertSame(['Ana Torres', false], [$porTipo['texto']['valor'], $porTipo['texto']['mio']]);
        $calculo = $porTipo['calculo']['id'];

        // Al firmar envía el resultado del cálculo; queda impreso en el PDF final junto con lo del preparador
        $this->postJson("/api/firmar/{$t}", ['acepto' => true, 'valores' => [(string) $porTipo['firma']['id'] => $this->firmaDataUrl()], 'calculos' => [(string) $calculo => '25.50']], self::H)
            ->assertOk()->assertJson(['completo' => true]);
        $texto = $this->texto($this->get("/api/documentos/{$id}/final")->getContent());
        $this->assertStringContainsString('Ana Torres', $texto);
        $this->assertStringContainsString('25.50', $texto);
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
