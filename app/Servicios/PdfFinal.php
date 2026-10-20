<?php

namespace App\Servicios;

use setasign\Fpdi\Tcpdf\Fpdi;

/**
 * PDF firmado: las páginas del documento con lo que llenó cada firmante (aplanado, ya no se puede editar)
 * y al final el certificado de firmas. Usa FPDI + TCPDF, que son PHP puro y funcionan en hosting compartido.
 */
class PdfFinal
{
    private const TINTA = [18, 23, 38];
    private const MORADO = [77, 20, 140];
    private const GRIS = [107, 114, 128];
    private const LINEA = [220, 214, 235];

    /**
     * @param  string  $original  PDF preparado (sin «object streams», ver la subida en la página)
     * @param  array  $d  id, nombre, remitente, sha256Original, enviadoEn, completadoEn, marcaAgua, logo (bytes|null),
     *                    urlVerificacion, evidencias (cronología por firmante), campos[], firmantes[], eventos[]
     */
    public static function generar(string $original, array $d): string
    {
        $pdf = self::nuevo();
        $paginas = $pdf->setSourceFile(\setasign\Fpdi\PdfParser\StreamReader::createByString($original));
        for ($i = 1; $i <= $paginas; $i++) {
            $tpl = $pdf->importPage($i);
            $t = $pdf->getTemplateSize($tpl);
            $pdf->AddPage($t['orientation'], [$t['width'], $t['height']]);
            $pdf->useTemplate($tpl, 0, 0, $t['width'], $t['height']);
            foreach ($d['campos'] as $c) {
                if ((int) $c['pagina'] === $i) {
                    self::campo($pdf, $c);
                }
            }
        }
        self::certificado($pdf, $d);
        if (! empty($d['marcaAgua'])) {
            for ($i = 1; $i <= $pdf->getNumPages(); $i++) {
                $pdf->setPage($i);
                $pdf->SetFont('helvetica', '', 7);
                $pdf->SetTextColor(...self::GRIS);
                $pdf->SetXY(0, $pdf->getPageHeight() - 16);
                $pdf->Cell($pdf->getPageWidth(), 10, 'Firmado con AutograFlow · plan gratuito', 0, 0, 'C');
            }
        }
        $pdf->SetTitle($d['nombre']);
        $pdf->SetCreator('AutograFlow');
        return $pdf->Output('', 'S');
    }

    public static function nuevo(): Fpdi
    {
        $pdf = new Fpdi('P', 'pt', 'LETTER', true, 'UTF-8');
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);
        $pdf->SetMargins(0, 0, 0);
        $pdf->SetAutoPageBreak(false);
        $pdf->setCellPaddings(2, 0, 2, 0);
        return $pdf;
    }

    /** Un campo llenado: imagen (firma, sello, huella), palomita o texto ajustado a su recuadro. */
    private static function campo(Fpdi $pdf, array $c): void
    {
        [$x, $y, $w, $h] = [(float) $c['x'], (float) $c['y'], (float) $c['w'], (float) $c['h']];
        if (! empty($c['imagen'])) {
            self::imagen($pdf, $c['imagen'], $x, $y, $w, $h);
        } elseif ($c['tipo'] === 'casilla') {
            if ($c['valor'] === '1') {
                self::palomita($pdf, $x, $y, $w, $h);
            }
        } elseif (($c['valor'] ?? '') !== '') {
            $texto = $c['tipo'] === 'fecha' && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $c['valor'], $m) ? "{$m[3]}/{$m[2]}/{$m[1]}" : $c['valor'];
            self::texto($pdf, $texto, $x, $y, $w, $h);
        }
    }

    /** Imagen centrada y proporcional dentro del recuadro. */
    public static function imagen(Fpdi $pdf, string $bytes, float $x, float $y, float $w, float $h): void
    {
        $pdf->Image('@'.$bytes, $x, $y, $w, $h, '', '', '', false, 300, '', false, false, 0, 'CM');
    }

    public static function palomita(Fpdi $pdf, float $x, float $y, float $w, float $h): void
    {
        $m = min($w, $h);
        $cx = $x + $w / 2;
        $cy = $y + $h / 2;
        $pdf->SetDrawColor(...self::TINTA);
        $pdf->SetLineStyle(['width' => max(0.9, $m * 0.13), 'cap' => 'round', 'join' => 'round', 'color' => self::TINTA]);
        $pdf->Line($cx - $m * 0.32, $cy - $m * 0.02, $cx - $m * 0.08, $cy + $m * 0.26);
        $pdf->Line($cx - $m * 0.08, $cy + $m * 0.26, $cx + $m * 0.36, $cy - $m * 0.34);
    }

    /** Texto dentro del recuadro: varias líneas si caben y letra más chica si hace falta (como máximo 11 pt). */
    public static function texto(Fpdi $pdf, string $texto, float $x, float $y, float $w, float $h, string $alinear = 'L', float $maximo = 11): void
    {
        $pdf->SetFont('helvetica', '', min($maximo, $h * 0.72));
        $pdf->SetTextColor(...self::TINTA);
        // fitcell = true: TCPDF achica la letra hasta que el texto entra en la caja.
        $pdf->MultiCell($w, $h, $texto, 0, $alinear, false, 1, $x, $y, true, 0, false, true, $h, 'M', true);
    }

    /** Hoja(s) de auditoría al final del documento. */
    private static function certificado(Fpdi $pdf, array $d): void
    {
        $M = 48;
        $A = 612 - 2 * $M;
        $pdf->AddPage('P', [612, 792]);
        $pdf->setCellPaddings(0, 0, 0, 0);
        $y = $M;
        $linea = function (string $texto, float $size = 9, string $estilo = '', array $color = self::TINTA, float $sangria = 0) use ($pdf, &$y, $M, $A) {
            $pdf->SetFont('helvetica', $estilo, $size);
            $pdf->SetTextColor(...$color);
            $alto = $pdf->getStringHeight($A - $sangria, $texto);
            if ($y + $alto > 792 - $M) {
                $pdf->AddPage('P', [612, 792]);
                $y = $M;
            }
            $pdf->MultiCell($A - $sangria, 0, $texto, 0, 'L', false, 1, $M + $sangria, $y);
            $y = $pdf->GetY() + 2;
        };
        $separador = function () use ($pdf, &$y, $M, $A) {
            $y += 4;
            $pdf->SetLineStyle(['width' => 0.6, 'color' => self::LINEA]);
            $pdf->Line($M, $y, $M + $A, $y);
            $y += 12;
        };

        $pdf->SetFillColor(...self::MORADO);
        $pdf->Rect($M, $y, $A, 30, 'F');
        $pdf->SetFont('helvetica', 'B', 14);
        $pdf->SetTextColor(255, 255, 255);
        $pdf->Text($M + 12, $y + 7, 'AutograFlow');
        $pdf->SetFont('helvetica', 'B', 11);
        $pdf->SetTextColor(255, 217, 191);
        $pdf->SetXY($M, $y + 9);
        $pdf->Cell($A - 12, 12, 'Certificado de firmas', 0, 0, 'R');
        $y += 46;
        if (! empty($d['logo'])) {
            try {
                self::imagen($pdf, $d['logo'], $M + $A - 140, $y - 4, 140, 44);
            } catch (\Throwable) {
                // Logo dañado: el certificado sale sin él.
            }
        }
        $ancho = $A;
        $A = $A - (empty($d['logo']) ? 0 : 150);
        $linea($d['nombre'], 13, 'B');
        $linea("Documento N.º {$d['id']} · enviado por {$d['remitente']}", 9, '', self::GRIS);
        $linea('Enviado: '.Fechas::utc($d['enviadoEn']).'    Completado: '.Fechas::utc($d['completadoEn']), 9, '', self::GRIS);
        $A = $ancho;
        $y += 2;
        $linea('Huella digital (SHA-256) del documento original:', 8.5, 'B');
        $linea($d['sha256Original'], 8.5, '', self::GRIS);
        $separador();

        $linea('Firmantes', 11, 'B', self::MORADO);
        foreach ($d['firmantes'] as $f) {
            if ($y + 92 > 792 - $M) {
                $pdf->AddPage('P', [612, 792]);
                $y = $M;
            }
            $tope = $y;
            if (! empty($f['firma'])) {
                $pdf->SetLineStyle(['width' => 0.8, 'color' => self::LINEA]);
                $pdf->Rect($M + $A - 162, $tope, 162, 56, 'D');
                try {
                    self::imagen($pdf, $f['firma'], $M + $A - 156, $tope + 4, 150, 48);
                } catch (\Throwable) {
                }
            }
            $A2 = $A - 175;
            $fila = function (string $t, float $size = 8.5, string $estilo = '', array $color = self::TINTA) use ($pdf, &$y, $M, $A2) {
                $pdf->SetFont('helvetica', $estilo, $size);
                $pdf->SetTextColor(...$color);
                $pdf->MultiCell($A2, 0, $t, 0, 'L', false, 1, $M, $y);
                $y = $pdf->GetY() + 1;
            };
            $estado = ['firmado' => 'Firmado', 'rechazado' => 'Rechazado'][$f['estado']] ?? 'Pendiente';
            $fila("{$f['orden']}. {$f['nombre']}", 10.5, 'B');
            $fila(implode(' · ', array_filter([$f['telefono'] ? "Tel. {$f['telefono']}" : '', $f['email']])) ?: 'Sin contacto registrado', 8.5, '', self::GRIS);
            $fila("Estado: {$estado}");
            $fila('Abrió el documento: '.Fechas::utc($f['abiertoEn']));
            $fila('Firmó: '.Fechas::utc($f['firmadoEn']));
            $fila('IP: '.($f['ip'] ?: '—'));
            if (! empty($f['agente'])) {
                $fila('Dispositivo: '.mb_substr($f['agente'], 0, 160), 7.5, '', self::GRIS);
            }
            $y = max($y, $tope + 62) + 8;
        }
        $separador();

        $linea('Historial', 11, 'B', self::MORADO);
        foreach ($d['eventos'] as $e) {
            $linea(Fechas::utc($e['creadoEn']).'  ·  '.$e['detalle'].($e['firmante'] ? " ({$e['firmante']})" : '').($e['ip'] ? "  ·  IP {$e['ip']}" : ''), 8);
        }
        $y += 6;
        $linea('Este certificado forma parte del documento. Cada firmante accedió mediante un enlace personal y su firma electrónica se registró con la fecha, la hora, la IP y el dispositivo indicados. La huella SHA-256 permite comprobar que el documento original no fue alterado.'
            .(! empty($d['urlVerificacion']) ? " Verifica la autenticidad de este PDF en {$d['urlVerificacion']}" : ''), 7.5, '', self::GRIS);
        foreach ($d['firmantes'] as $f) {
            self::evidencias($pdf, $f, ! empty($d['evidencias']));
        }
    }

    /**
     * Hoja de evidencias de un firmante: con el certificado de evidencias, la cronología de sus capturas, su ubicación
     * (si la autorizó) y las imágenes que aportó; y, si el documento pidió el DNI, las fotos del frente y del reverso.
     */
    private static function evidencias(Fpdi $pdf, array $f, bool $cronologia): void
    {
        $conDni = ! empty($f['dniFrente']) || ! empty($f['dniReverso']);
        if (($f['estado'] ?? '') !== 'firmado' || (! $cronologia && ! $conDni)) {
            return;
        }
        $M = 48;
        $A = 612 - 2 * $M;
        $pdf->AddPage('P', [612, 792]);
        $pdf->setCellPaddings(0, 0, 0, 0);
        $y = $M;
        $linea = function (string $texto, float $size = 9, string $estilo = '', array $color = self::TINTA) use ($pdf, &$y, $M, $A) {
            $pdf->SetFont('helvetica', $estilo, $size);
            $pdf->SetTextColor(...$color);
            $pdf->MultiCell($A, 0, $texto, 0, 'L', false, 1, $M, $y);
            $y = $pdf->GetY() + 3;
        };
        $caja = function (?string $bytes, string $titulo, float $x, float $yCaja, float $w, float $h) use ($pdf) {
            $pdf->SetLineStyle(['width' => 0.8, 'color' => self::LINEA]);
            $pdf->Rect($x, $yCaja, $w, $h, 'D');
            $pdf->SetFont('helvetica', 'B', 8);
            $pdf->SetTextColor(...self::TINTA);
            $pdf->Text($x + 6, $yCaja + 5, $titulo);
            if ($bytes) {
                try {
                    self::imagen($pdf, $bytes, $x + 6, $yCaja + 18, $w - 12, $h - 24);
                } catch (\Throwable) {
                    // Imagen dañada: queda el recuadro vacío.
                }
            }
        };

        $linea("Evidencias — Firmante {$f['orden']} · {$f['nombre']}", 13, 'B', self::MORADO);
        if ($cronologia) {
            $linea('Cronología', 11, 'B');
            $momentos = $f['momentos'] ?? [];
            asort($momentos);
            foreach ($momentos as $clave => $momento) {
                $linea(Fechas::utc($momento).'  ·  '.(Documentos::MOMENTOS[$clave] ?? $clave).' (hora del dispositivo)', 9);
            }
            $linea(Fechas::utc($f['firmadoEn']).'  ·  Envió su firma (hora del servidor)'.($f['ip'] ? " desde la IP {$f['ip']}" : ''), 9);
            $u = $f['ubicacion'] ?? null;
            $linea(isset($u['lat'])
                ? "Ubicación al firmar: {$u['lat']}, {$u['lng']}".(isset($u['precision']) ? " (± {$u['precision']} m)" : '').', autorizada por el firmante.'
                : 'Ubicación: '.(($u['estado'] ?? '') === 'denegada' ? 'el firmante no la autorizó.' : 'no disponible.'), 8.5, '', self::GRIS);
            $y += 6;
            $imagenes = array_filter(['Firma' => $f['firma'] ?? null, 'Sello' => $f['sello'] ?? null, 'Huella' => $f['huella'] ?? null]);
            $x = $M;
            foreach ($imagenes as $titulo => $bytes) {
                $caja($bytes, $titulo, $x, $y, 160, 120);
                $x += 172;
            }
            if ($imagenes) {
                $y += 134;
            }
        }
        if ($conDni) {
            $linea('Fotos del DNI aportadas por el firmante', 11, 'B');
            $caja($f['dniFrente'] ?? null, 'Frente del DNI', $M, $y, ($A - 12) / 2, 190);
            $caja($f['dniReverso'] ?? null, 'Reverso del DNI', $M + ($A + 12) / 2, $y, ($A - 12) / 2, 190);
            $y += 204;
        }
        $linea('Las imágenes y fotos de esta hoja son evidencia aportada por el firmante desde su dispositivo. No validan su identidad ante RENIEC ni constituyen una firma digital certificada. AutograFlow no guarda la ubicación si el firmante no la autoriza.', 7.5, '', self::GRIS);
    }
}
