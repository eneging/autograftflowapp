<?php

namespace App\Http\Controllers;

use App\Servicios\Documentos;
use App\Servicios\ErrorUso;
use Illuminate\Http\Request;

/** API de quien prepara y envía documentos (requiere sesión). */
class DocumentosController extends Controlador
{
    public function index(Request $r)
    {
        return Documentos::listar($r->user()->cuenta_id);
    }

    /**
     * Subida: «original» (el PDF tal cual lo eligió la persona, para su huella SHA-256), «preparado» (el mismo PDF
     * enderezado y guardado por la página en un formato que FPDI puede leer) y «campos» (los detectados, en JSON).
     */
    public function store(Request $r)
    {
        $max = config('autograflow.limites.pdf_bytes');
        foreach (['original', 'preparado'] as $k) {
            $f = $r->file($k);
            if (! $f || ! $f->isValid()) {
                throw new ErrorUso('Sube un archivo PDF (máximo '.($max / 1024 / 1024).' MB). Si el archivo es grande, revisa upload_max_filesize del hosting.');
            }
            if ($f->getSize() > $max) {
                throw new ErrorUso('El PDF pesa más de '.($max / 1024 / 1024).' MB');
            }
        }
        $campos = json_decode((string) $r->input('campos', '[]'), true);
        $nombre = trim(preg_replace('/\.pdf$/i', '', (string) $r->input('nombre', ''))) ?: 'Documento';
        $formulario = $r->input('formulario');
        $res = Documentos::crear($r->user(), $nombre, $r->file('original')->get(), $r->file('preparado')->get(), is_array($campos) ? $campos : [], $this->origen($r),
            is_string($formulario) && $formulario !== '' ? $formulario : null);
        return response()->json($res, 201);
    }

    public function contactos(Request $r)
    {
        return Documentos::contactos($r->user()->cuenta_id);
    }

    public function show(Request $r, int $id)
    {
        return Documentos::detalle($r->user()->cuenta_id, $id);
    }

    public function update(Request $r, int $id)
    {
        $l = config('autograflow.limites');
        $d = $this->validar($r->all(), [
            'nombre' => 'required|string|min:1|max:160',
            'orden' => 'required|in:secuencial,paralelo',
            'mensaje' => 'nullable|string|max:500',
            'firmantes' => "present|array|max:{$l['firmantes']}",
            'firmantes.*.clave' => 'required|string|max:40',
            'firmantes.*.nombre' => 'required|string|min:2|max:120',
            'firmantes.*.telefono' => ['nullable', 'string', 'max:30', 'regex:/^$|^[+\d][\d\s()-]{6,}$/'],
            'firmantes.*.email' => 'nullable|email|max:160',
            'firmantes.*.pedirDni' => 'boolean',
            'campos' => "present|array|max:{$l['campos']}",
            'campos.*.firmante' => 'required|string|max:40',
            'campos.*.tipo' => 'required|in:'.implode(',', Documentos::TIPOS),
            'campos.*.pagina' => 'required|integer|min:1',
            'campos.*.x' => 'required|numeric|min:0', 'campos.*.y' => 'required|numeric|min:0',
            'campos.*.w' => 'required|numeric|min:6|max:2000', 'campos.*.h' => 'required|numeric|min:6|max:2000',
            'campos.*.etiqueta' => 'nullable|string|max:120',
            'campos.*.obligatorio' => 'boolean',
            'campos.*.valor' => 'nullable', // lo que escribió quien prepara el documento: lo revisa Documentos::guardar
            'campos.*.nombrePdf' => 'nullable|string|max:200',
            'bloquearDibujo' => 'boolean', 'bloquearSello' => 'boolean', 'flujo' => 'boolean', 'certificado' => 'boolean',
        ], ['firmantes.*.nombre.*' => 'Escribe el nombre del firmante', 'firmantes.*.telefono.*' => 'Teléfono inválido', 'firmantes.*.email.*' => 'Correo inválido']);
        Documentos::guardar($r->user()->cuenta_id, $id, [
            'nombre' => trim($d['nombre']), 'orden' => $d['orden'], 'mensaje' => trim($d['mensaje'] ?? ''),
            'bloquearDibujo' => (bool) ($d['bloquearDibujo'] ?? false), 'bloquearSello' => (bool) ($d['bloquearSello'] ?? false),
            'flujo' => (bool) ($d['flujo'] ?? false), 'certificado' => (bool) ($d['certificado'] ?? false),
            'firmantes' => array_map(fn ($f) => ['clave' => $f['clave'], 'nombre' => trim($f['nombre']), 'telefono' => trim($f['telefono'] ?? ''), 'email' => trim($f['email'] ?? ''),
                'pedirDni' => (bool) ($f['pedirDni'] ?? false)], $d['firmantes']),
            'campos' => array_map(fn ($c) => [...$c, 'etiqueta' => trim($c['etiqueta'] ?? ''), 'obligatorio' => (bool) ($c['obligatorio'] ?? true)], $d['campos']),
        ]);
        return ['ok' => true];
    }

    public function enviar(Request $r, int $id)
    {
        Documentos::enviar($r->user(), $id, $this->origen($r));
        return Documentos::detalle($r->user()->cuenta_id, $id);
    }

    public function eliminarPagina(Request $r, int $id, int $pagina)
    {
        Documentos::eliminarPagina($r->user()->cuenta_id, $id, $pagina, $this->origen($r));
        return Documentos::detalle($r->user()->cuenta_id, $id);
    }

    public function recordar(Request $r, int $id, int $firmante)
    {
        Documentos::recordar($r->user()->cuenta_id, $id, $firmante);
        return ['ok' => true];
    }

    public function plantilla(Request $r, int $id)
    {
        Documentos::marcarPlantilla($r->user()->cuenta_id, $id, (bool) $r->input('es'));
        return ['ok' => true];
    }

    public function duplicar(Request $r, int $id)
    {
        return response()->json(Documentos::duplicar($r->user(), $id, $this->origen($r)), 201);
    }

    public function destroy(Request $r, int $id)
    {
        return ['resultado' => Documentos::eliminar($r->user(), $id, $this->origen($r))];
    }

    public function archivo(Request $r, int $id)
    {
        $d = Documentos::documentoDe($r->user()->cuenta_id, $id);
        return $this->responderPdf(Documentos::archivo($d, 'original'), $d->nombre, false);
    }

    public function final(Request $r, int $id)
    {
        Documentos::detalle($r->user()->cuenta_id, $id); // completa el PDF si quedó pendiente
        $d = Documentos::documentoDe($r->user()->cuenta_id, $id);
        return $this->responderPdf(Documentos::archivo($d, 'final'), "{$d->nombre}_firmado", $r->boolean('descargar'));
    }

    public function imagenCampo(Request $r, int $id, int $campo)
    {
        Documentos::documentoDe($r->user()->cuenta_id, $id);
        return $this->responderImagen(Documentos::imagenCampo($id, $campo));
    }
}
