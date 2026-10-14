<?php

namespace App\Http\Controllers;

use App\Reembolso\Solicitudes;
use App\Reembolso\Validacion;
use App\Servicios\ErrorUso;
use App\Servicios\Imagenes;
use Illuminate\Http\Request;

/** Plantilla «Solicitud de reembolso»: Firmante 1 (solicitante) y Firmante 2 (aprobador). */
class ReembolsoController extends Controlador
{
    private const FIRMA = '#^data:image/png;base64,[A-Za-z0-9+/=]+$#';

    public function crear(Request $r)
    {
        [$datos, $errores] = Validacion::solicitud($r->input('datos'));
        $firma = (string) $r->input('firma', '');
        if (! preg_match(self::FIRMA, $firma)) {
            $errores['firma'] = 'Firma inválida';
        }
        if ($errores) {
            throw new ErrorUso('Revisa los datos del formulario', 400, collect($errores)->mapWithKeys(fn ($m, $k) => [$k === '_' || $k === 'firma' ? $k : "datos.{$k}" => $m])->all());
        }
        return response()->json(Solicitudes::crear($datos, $firma), 201);
    }

    public function ver(string $token)
    {
        [$s, $rol] = Solicitudes::porToken($token);
        return Solicitudes::publica($s, $rol);
    }

    public function pdf(Request $r, string $token)
    {
        [$s] = Solicitudes::porToken($token);
        $nombre = 'Reembolso_'.$s->numero_factura.'_'.json_decode($s->datos, true)['contacto']['nombre'];
        return $this->responderPdf(Solicitudes::pdf($s), $nombre, $r->boolean('descargar'));
    }

    public function firma(string $token, string $quien)
    {
        [$s] = Solicitudes::porToken($token);
        $ref = match ($quien) { 'solicitante' => $s->firma_solicitante, 'aprobador' => $s->firma_aprobador, default => null };
        if (! $ref) {
            throw new ErrorUso('Firma no encontrada', 404);
        }
        return $this->responderImagen(Imagenes::leer($ref));
    }

    public function decision(Request $r, string $token)
    {
        [, $rol] = Solicitudes::porToken($token);
        if ($rol !== 'aprobador') {
            throw new ErrorUso('Este enlace no permite aprobar', 403);
        }
        $d = $this->validar($r->all(), [
            'decision' => 'required|in:aprobada,rechazada',
            'nombre' => 'required|string|min:3|max:120',
            'firma' => ['required_if:decision,aprobada', 'nullable', 'string', 'regex:'.self::FIRMA],
            'motivo' => 'required_if:decision,rechazada|nullable|string|max:500',
        ], ['nombre.*' => 'Escribe tu nombre', 'firma.*' => 'Firma para aprobar', 'motivo.*' => 'Indica el motivo del rechazo']);
        if (! Solicitudes::decidir($token, [...$d, 'nombre' => trim($d['nombre']), 'motivo' => trim($d['motivo'] ?? '')])) {
            throw new ErrorUso('Esta solicitud ya fue aprobada o rechazada', 409);
        }
        return ['ok' => true];
    }

    public function admin(Request $r)
    {
        $estado = in_array($r->query('estado'), ['pendiente', 'aprobada', 'rechazada'], true) ? $r->query('estado') : null;
        return Solicitudes::listar($estado, mb_substr((string) $r->query('buscar', ''), 0, 100) ?: null);
    }
}
