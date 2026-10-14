<?php

namespace App\Reembolso;

use App\Servicios\PdfFinal;
use setasign\Fpdi\Tcpdf\Fpdi;

/**
 * PDF de la «Solicitud de reembolso para no empleados»: cada dato en su campo exacto del formulario original
 * (resources/pdf/plantilla-reembolso.pdf) y, si hay más viajes o gastos de los que caben, una hoja anexa.
 * Las coordenadas de los campos están en resources/shared/campos.json (puntos PDF, origen abajo a la izquierda).
 */
class PdfReembolso
{
    private const ALTO = 792;

    private Fpdi $pdf;

    private array $rects;

    /** @param array $s numeroFactura, estado, datos, firmaSolicitante (bytes), firmadoEn, aprobadorNombre, firmaAprobador, decididoEn, motivoRechazo */
    public static function generar(array $s): string
    {
        return (new self)->construir($s);
    }

    private function construir(array $s): string
    {
        $this->rects = json_decode(file_get_contents(resource_path('shared/campos.json')), true);
        $this->pdf = PdfFinal::nuevo();
        $this->pdf->setSourceFile(resource_path('pdf/plantilla-reembolso.pdf'));
        $tpl = $this->pdf->importPage(1);
        $this->pdf->AddPage('P', [612, 792]);
        $this->pdf->useTemplate($tpl, 0, 0, 612, 792);
        $this->pdf->SetTitle("Solicitud de reembolso {$s['numeroFactura']}");

        $d = $s['datos'];
        $t = Calculos::calcular($d);
        $c = $d['contacto'];
        $this->campo('Payee name', $c['nombre']);
        $this->campo('Stake', $c['estaca']);
        $this->campo('Ward', $c['barrio']);
        $this->campo('Invoice number', $s['numeroFactura']);
        $this->campo('Telephone with area code', $c['telefono']);
        $this->campo('Email address', $c['email']);
        $this->campo('Invoice date', Calculos::fecha($c['fechaFactura']));
        if ($c['tasa'] > 0) {
            $decimales = strlen(explode('.', (string) $c['tasa'])[1] ?? '');
            $this->campo('Reimbursement rate', number_format($c['tasa'], min(max(2, $decimales), 4), '.', ''));
        }
        $this->campo('Payee address', $c['direccion']);

        $r = $d['reiterativo'];
        $this->campo('Starting point address if available', $r['origen']);
        $this->campo('Destination address if available', $r['destino']);
        $this->campo('RecurringPurpose', $r['proposito']);
        if ($r['distancia'] > 0) {
            $this->campo('Roundtrip mi or km', Calculos::numero($r['distancia']));
        }
        if ($r['peajes'] > 0) {
            $this->campo('AMNT_Roundtrip fares or tolls', Calculos::monto(Calculos::centavos($r['peajes'])), 'R');
        }
        foreach ($r['meses'] as $i => $m) {
            $this->campo('MonthRow'.($i + 1), Calculos::mes($m['mes']));
            foreach (array_unique($m['dias']) as $dia) {
                $this->marca('M'.($i + 1)."D{$dia}");
            }
        }
        if ($t['dias'] > 0) {
            $this->campo('RecurringDist', Calculos::numero($t['reiterativoDistancia']), 'R');
            $this->campo('AMNT_RecurringTolls', Calculos::monto($t['reiterativoPeajes']), 'R');
            $this->campo('AMNT_RecurringReimbursement', Calculos::monto($t['reiterativoReembolso']), 'R');
        }

        foreach (array_slice($d['viajes'], 0, Validacion::LIMITES['viajesEnFormulario']) as $i => $v) {
            $this->campo('Starting point address if available_'.($i + 2), $v['origen']);
            $this->campo('Destination address if available_'.($i + 2), $v['destino']);
            $this->campo($i === 0 ? 'Purpose' : 'Purpose_'.($i + 1), $v['proposito']);
            $this->campo($i === 0 ? 'Date' : 'Date_'.($i + 1), Calculos::fecha($v['fecha']));
            $this->campo('VariedDist.'.($i + 1), Calculos::numero($v['distancia']), 'R');
            $this->campo('AMNT_VariedTolls.'.($i + 1), Calculos::monto(Calculos::centavos($v['peajes'])), 'R');
            $this->campo('AMNT_VariedReimbursement.'.($i + 1), Calculos::monto($t['viajes'][$i]), 'R');
        }
        foreach (array_slice($d['gastos'], 0, Validacion::LIMITES['gastosEnFormulario']) as $i => $g) {
            $sufijo = $i === 0 ? '' : '_'.($i + 1);
            $this->campo("Program name{$sufijo}", $g['vendedor']);
            $this->campo("Additional explanation and account coding{$sufijo}", $g['descripcion']);
            $this->campo("Account code{$sufijo}", $g['cuenta']);
            $this->campo('AMNT_OtherAmount.'.($i + 1), Calculos::monto($t['gastos'][$i]), 'R');
        }

        // Totales (incluyen lo que va en el anexo)
        $this->campo('AMNT_RecurringExpenses', Calculos::monto($t['totalReiterativos']), 'R');
        $this->campo('AMNT_VariedExpenses', Calculos::monto($t['totalViajes']), 'R');
        $this->campo('AMNT_OtherExpenses', Calculos::monto($t['totalOtros']), 'R');
        $this->campo('AMNT_TotalExpenses', Calculos::monto($t['total']), 'R');

        $this->firma('Requesters signature', $s['firmaSolicitante']);
        $this->campo('Date_5', $s['firmadoEn']->format('d/m/Y'));
        if ($s['estado'] === 'aprobada' && $s['firmaAprobador']) {
            $this->firma('Approvers signature if applicable', $s['firmaAprobador']);
            if ($s['decididoEn']) {
                $this->campo('Date_6', $s['decididoEn']->format('d/m/Y'));
            }
        }

        // Estado de la solicitud, en el margen superior para no tapar el formulario.
        [$aviso, $color] = match ($s['estado']) {
            'pendiente' => ['PENDIENTE DE APROBACIÓN', [115, 115, 128]],
            'aprobada' => [trim('APROBADA POR '.($s['aprobadorNombre'] ?? '')), [13, 115, 77]],
            default => ['RECHAZADA: '.($s['motivoRechazo'] ?? ''), [191, 26, 26]],
        };
        $this->pdf->SetFont('helvetica', 'B', 8);
        $this->pdf->SetTextColor(...$color);
        $this->pdf->setCellPaddings(0, 0, 0, 0);
        $this->pdf->SetXY(36, 4);
        $this->pdf->Cell(400, 10, $aviso, 0, 0, 'L', false, '', 1);
        if ($s['estado'] === 'rechazada') {
            $this->pdf->SetAlpha(0.18);
            $this->pdf->SetFont('helvetica', 'B', 72);
            $this->pdf->StartTransform();
            $this->pdf->Rotate(30, 306, 430);
            $this->pdf->Text(150, 400, 'RECHAZADA');
            $this->pdf->StopTransform();
            $this->pdf->SetAlpha(1);
        }
        $this->pdf->setCellPaddings(2, 0, 2, 0);

        $viajesExtra = array_slice($d['viajes'], Validacion::LIMITES['viajesEnFormulario']);
        $gastosExtra = array_slice($d['gastos'], Validacion::LIMITES['gastosEnFormulario']);
        if ($viajesExtra || $gastosExtra) {
            $this->anexo($s, $viajesExtra, array_slice($t['viajes'], Validacion::LIMITES['viajesEnFormulario']), $gastosExtra, array_slice($t['gastos'], Validacion::LIMITES['gastosEnFormulario']));
        }
        return $this->pdf->Output('', 'S');
    }

    /** Rectángulo del campo en coordenadas de TCPDF (desde arriba a la izquierda). */
    private function rect(string $nombre): array
    {
        $r = $this->rects[$nombre] ?? throw new \RuntimeException("El PDF no tiene el campo {$nombre}");
        return [$r[0], self::ALTO - $r[3], $r[2] - $r[0], $r[3] - $r[1]];
    }

    private function campo(string $nombre, ?string $valor, string $alinear = 'L'): void
    {
        $valor = trim((string) $valor);
        if ($valor === '') {
            return;
        }
        [$x, $y, $w, $h] = $this->rect($nombre);
        PdfFinal::texto($this->pdf, $valor, $x, $y, $w, $h, $alinear, 9);
    }

    private function marca(string $nombre): void
    {
        [$x, $y, $w, $h] = $this->rect($nombre);
        PdfFinal::palomita($this->pdf, $x, $y, $w, $h);
    }

    /** Firma proporcional dentro del campo, sin invadir la etiqueta. */
    private function firma(string $nombre, string $png): void
    {
        [$x, $y, $w, $h] = $this->rect($nombre);
        PdfFinal::imagen($this->pdf, $png, $x + 2, $y + 0.5, $w - 4, $h - 1);
    }

    /** Página adicional con los viajes y gastos que no caben en el formulario (el original pide «adjunte más páginas»). */
    private function anexo(array $s, array $viajes, array $reembolsos, array $gastos, array $montos): void
    {
        $p = $this->pdf;
        $M = 36;
        $A = 612 - 2 * $M;
        $FILA = 16;
        $y = 0;
        $encabezado = function () use ($p, $s, $M, $A, &$y) {
            $p->AddPage('P', [612, 792]);
            $y = $M;
            $p->SetFillColor(0, 51, 84);
            $p->Rect($M, $y, $A, 22, 'F');
            $p->SetFont('helvetica', 'B', 11);
            $p->SetTextColor(255, 255, 255);
            $p->Text($M + 8, $y + 5, 'Anexo — Solicitud de reembolso para no empleados');
            $y += 32;
            $p->SetFont('helvetica', '', 9);
            $p->SetTextColor(18, 23, 38);
            $p->Text($M, $y, "Número de factura: {$s['numeroFactura']}    Beneficiario: {$s['datos']['contacto']['nombre']}");
            $y += 22;
        };
        $tabla = function (string $titulo, array $cols, array $filas, string $pie) use ($p, $M, $A, $FILA, &$y, $encabezado) {
            if ($y + $FILA * 3 > 792 - $M) {
                $encabezado();
            }
            $p->SetFont('helvetica', 'B', 10);
            $p->SetTextColor(0, 51, 84);
            $p->Text($M, $y, $titulo);
            $y += 16;
            $fila = function (array $celdas, string $estilo, bool $fondo = false) use ($p, $cols, $M, $A, $FILA, &$y, $encabezado) {
                if ($y + $FILA > 792 - $M) {
                    $encabezado();
                }
                if ($fondo) {
                    $p->SetFillColor(230, 237, 242);
                    $p->Rect($M, $y, $A, $FILA, 'F');
                }
                $p->SetFont('helvetica', $estilo, 8);
                $p->SetTextColor(18, 23, 38);
                $x = $M;
                foreach ($cols as $i => [$texto, $ancho, $derecha]) {
                    $w = $ancho / 100 * $A;
                    $p->SetXY($x, $y);
                    // Último parámetro 1 = el texto se comprime si no cabe en la celda.
                    $p->Cell($w, $FILA, $celdas[$i] ?? '', 0, 0, $derecha ? 'R' : 'L', false, '', 1);
                    $x += $w;
                }
                $y += $FILA;
                $p->SetLineStyle(['width' => 0.4, 'color' => [191, 191, 199]]);
                $p->Line($M, $y, $M + $A, $y);
            };
            $fila(array_map(fn ($c) => $c[0], $cols), 'B', true);
            foreach ($filas as $f) {
                $fila($f, '');
            }
            $ultima = array_fill(0, count($cols), '');
            $ultima[count($cols) - 1] = $pie;
            $fila($ultima, 'B');
            // La etiqueta ocupa varias columnas, así que se escribe aparte para que no se comprima.
            $p->SetXY($M, $y - $FILA);
            $p->Cell($A / 2, $FILA, 'Subtotal del anexo', 0, 0, 'L');
            $y += 18;
        };

        $encabezado();
        if ($viajes) {
            $tabla('Viajes con diversas paradas (continuación)',
                [['Fecha', 11, false], ['Punto de partida', 20, false], ['Destino', 20, false], ['Propósito', 19, false], ['mi o km', 9, true], ['Peajes', 9, true], ['Reembolso', 12, true]],
                array_map(fn ($v, $r) => [Calculos::fecha($v['fecha']), $v['origen'], $v['destino'], $v['proposito'], Calculos::numero($v['distancia']), Calculos::monto(Calculos::centavos($v['peajes'])), Calculos::monto($r)], $viajes, $reembolsos),
                Calculos::monto(array_sum($reembolsos)));
        }
        if ($gastos) {
            $tabla('Otros gastos (continuación)',
                [['Nombre del vendedor', 26, false], ['Finalidad y descripción de la compra', 44, false], ['Código de cuenta', 15, false], ['Cantidad', 15, true]],
                array_map(fn ($g, $m) => [$g['vendedor'], $g['descripcion'], $g['cuenta'], Calculos::monto($m)], $gastos, $montos),
                Calculos::monto(array_sum($montos)));
        }
        $p->SetFont('helvetica', '', 8);
        $p->SetTextColor(115, 115, 128);
        $p->Text($M, $y, 'Estos importes ya están incluidos en los totales de la página 1.');
    }
}
