<?php

namespace Tests\Unit;

use App\Reembolso\Calculos;
use App\Reembolso\PdfReembolso;
use App\Reembolso\Validacion;
use setasign\Fpdi\Tcpdf\Fpdi;
use Tests\TestCase;

class ReembolsoTest extends TestCase
{
    /** El mismo caso de resources/shared/calculos.test.ts, comprobado contra los scripts del PDF original. */
    public static function base(int $viajes = 1, int $gastos = 1): array
    {
        return [
            'contacto' => ['nombre' => 'María José Ñúñez', 'estaca' => 'Lima Norte', 'barrio' => 'Los Olivos', 'telefono' => '+51 999 888 777', 'email' => 'maria@ejemplo.com', 'fechaFactura' => '2026-10-06', 'tasa' => 0.3, 'direccion' => 'Av. Siempre Viva 742'],
            'reiterativo' => ['origen' => 'Casa', 'destino' => 'Capilla', 'proposito' => 'Seminario', 'distancia' => 10, 'peajes' => 2, 'meses' => [['mes' => '2026-10', 'dias' => [1, 2]], ['mes' => '2026-11', 'dias' => [5]]]],
            'viajes' => array_map(fn ($i) => ['origen' => "Origen {$i}", 'destino' => "Destino {$i}", 'proposito' => 'Visita', 'fecha' => '2026-10-03', 'distancia' => 50 + $i, 'peajes' => 5], range(0, $viajes - 1)),
            'gastos' => array_map(fn ($i) => ['vendedor' => 'Librería '.($i + 1), 'descripcion' => 'Materiales', 'cuenta' => '4510', 'monto' => 100 + $i], range(0, $gastos - 1)),
        ];
    }

    public function test_calcula_igual_que_la_pagina_y_el_pdf_original(): void
    {
        [$datos, $errores] = Validacion::solicitud(self::base());
        $this->assertSame([], $errores);
        $t = Calculos::calcular($datos);
        $this->assertSame(3, $t['dias']);
        $this->assertSame('15.00', Calculos::monto($t['reiterativoReembolso']));
        $this->assertSame('20.00', Calculos::monto($t['viajes'][0]));
        $this->assertSame('135.00', Calculos::monto($t['total']));
    }

    public function test_sin_errores_de_coma_flotante(): void
    {
        $d = self::base();
        $d['reiterativo']['meses'] = [];
        $d['viajes'] = [];
        $d['gastos'] = [['vendedor' => 'A', 'monto' => 0.1], ['vendedor' => 'B', 'monto' => 0.2]];
        [$datos] = Validacion::solicitud($d);
        $this->assertSame('0.30', Calculos::monto(Calculos::calcular($datos)['total']));
    }

    public function test_validacion(): void
    {
        $d = self::base();
        $d['contacto']['tasa'] = 0;
        $this->assertArrayHasKey('contacto.tasa', Validacion::solicitud($d)[1]);

        $d = self::base();
        $d['reiterativo']['meses'] = [['mes' => '2026-02', 'dias' => [30]]];
        $this->assertSame('El mes elegido no tiene día 30', Validacion::solicitud($d)[1]['reiterativo.meses.0.dias']);

        $d = self::base();
        $d['reiterativo']['meses'] = $d['viajes'] = $d['gastos'] = [];
        $this->assertArrayHasKey('_', Validacion::solicitud($d)[1]);

        $this->assertSame('Escribe el nombre del beneficiario', Validacion::solicitud(['contacto' => ['nombre' => 'x']])[1]['contacto.nombre']);
    }

    public function test_formatos(): void
    {
        $this->assertSame('1,234,567.89', Calculos::monto(123456789));
        $this->assertSame('0.05', Calculos::monto(5));
        $this->assertSame('30', Calculos::numero(30));
        $this->assertSame('12.5', Calculos::numero(12.5));
        $this->assertSame('Febrero 2026', Calculos::mes('2026-02'));
        $this->assertSame('06/10/2026', Calculos::fecha('2026-10-06'));
    }

    public function test_pdf_de_una_pagina_y_con_anexo(): void
    {
        $firma = file_get_contents(base_path('tests/fixtures/firma.png'));
        $s = fn (array $d) => [
            'numeroFactura' => '2610062130', 'estado' => 'aprobada', 'datos' => Validacion::solicitud($d)[0],
            'firmaSolicitante' => $firma, 'firmadoEn' => now(), 'aprobadorNombre' => 'Carlos Ruiz', 'firmaAprobador' => $firma,
            'decididoEn' => now(), 'motivoRechazo' => null,
        ];
        $contar = function (string $pdf) {
            return (new Fpdi)->setSourceFile(\setasign\Fpdi\PdfParser\StreamReader::createByString($pdf));
        };
        $uno = PdfReembolso::generar($s(self::base(4, 2)));
        $this->assertSame(1, $contar($uno));
        $conAnexo = PdfReembolso::generar($s(self::base(16, 20)));
        $this->assertSame(2, $contar($conAnexo));
        file_put_contents(storage_path('app/prueba-reembolso.pdf'), PdfReembolso::generar($s(self::base(6, 3))));
    }
}
