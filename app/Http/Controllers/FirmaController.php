<?php

namespace App\Http\Controllers;

use App\Servicios\Documentos;
use App\Servicios\ErrorUso;
use App\Servicios\Imagenes;
use App\Servicios\Planes;
use Illuminate\Http\Request;

/** API de los firmantes: se entra solo con el enlace personal, sin cuenta. */
class FirmaController extends Controlador
{
    public function vista(Request $r, string $token)
    {
        return Documentos::vista($token, $this->origen($r));
    }

    public function firmar(Request $r, string $token)
    {
        $valores = $r->input('valores');
        if (! is_array($valores)) {
            throw new ErrorUso('Revisa los datos');
        }
        foreach ($valores as $v) {
            if (! is_string($v) && ! is_bool($v)) {
                throw new ErrorUso('Revisa los datos');
            }
        }
        // Opcional: fotos del DNI, momentos de cada captura y ubicación (Documentos::firmar las revisa una por una).
        $evidencias = $r->input('evidencias', []);
        $calculos = $r->input('calculos', []);
        // Texto libre que agregó el firmante (solo si el documento se lo permite): [{pagina, x, y, w, h, texto}].
        $libres = $r->input('libres', []);
        if (! is_array($evidencias) || ! is_array($calculos) || ! is_array($libres)) {
            throw new ErrorUso('Revisa los datos');
        }
        // Consentimiento del firmante (Términos para firmantes y Política de Privacidad, que incluyen los datos sensibles).
        if (! $r->boolean('acepto')) {
            throw new ErrorUso('Para firmar debes aceptar los Términos para firmantes y la Política de Privacidad.', 400, ['acepto' => 'Debes aceptar los términos']);
        }
        $version = mb_substr(preg_replace('/[^0-9A-Za-z.\-]/', '', (string) $r->input('versionLegal', '')), 0, 20) ?: 'sin versión';
        return Documentos::firmar($token, $valores, $this->origen($r), $evidencias, $calculos, $libres, $version);
    }

    public function rechazar(Request $r, string $token)
    {
        $d = $this->validar($r->all(), ['motivo' => 'required|string|min:3|max:500'], ['motivo.*' => 'Indica el motivo']);
        Documentos::rechazar($token, trim($d['motivo']), $this->origen($r));
        return ['ok' => true];
    }

    private function documento(string $token): object
    {
        $f = Documentos::firmantePorToken($token);
        if ($f->doc_estado === 'anulado') {
            throw new ErrorUso('Este documento fue anulado', 410);
        }
        return (object) ['nombre' => $f->doc_nombre, 'archivo' => $f->archivo, 'archivo_final' => $f->archivo_final, 'firmante' => $f];
    }

    public function archivo(string $token)
    {
        $d = $this->documento($token);
        return $this->responderPdf(Documentos::archivo($d, 'original'), $d->nombre, false);
    }

    /** PDF firmado para el firmante: con el mismo plazo que «Descargar una copia». */
    public function final(Request $r, string $token)
    {
        [$pdf, $nombre] = Documentos::copiaFirmante($token);
        return $this->responderPdf($pdf, $nombre, $r->boolean('descargar'));
    }

    /** «Descargar una copia»: el PDF con lo firmado (final si ya firmaron todos). */
    public function copia(Request $r, string $token)
    {
        [$pdf, $nombre] = Documentos::copiaFirmante($token);
        return $this->responderPdf($pdf, $nombre, $r->boolean('descargar'));
    }

    public function imagenCampo(string $token, int $campo)
    {
        return $this->responderImagen(Documentos::imagenCampo($this->documento($token)->firmante->documento_id, $campo));
    }

    public function logo(string $token)
    {
        $f = Documentos::firmantePorToken($token);
        if (! $f->cuenta_logo || Planes::esGratis($f->cuenta_id)) {
            throw new ErrorUso('Sin logo', 404);
        }
        return $this->responderImagen(Imagenes::leer($f->cuenta_logo));
    }
}
