<?php

namespace App\Http\Controllers;

use App\Servicios\Reclamaciones;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReclamacionesController extends Controlador
{
    public function configuracion()
    {
        return response()->json(Reclamaciones::proveedor())->header('Cache-Control', 'no-store');
    }

    public function crear(Request $r)
    {
        $d = $this->validar($r->all(), [
            'solicitudId' => 'required|uuid',
            'nombre' => 'required|string|min:2|max:150',
            'documentoTipo' => 'required|in:DNI,CE,Pasaporte,Otro',
            'documento' => ['required', 'string', 'max:30', $r->input('documentoTipo') === 'DNI' ? 'regex:/^\d{8}$/' : 'min:3'],
            'domicilio' => 'required|string|min:5|max:500',
            'telefono' => 'nullable|string|max:30',
            'email' => 'required_if:canal,email|nullable|email|max:254',
            'menor' => 'required|boolean',
            'representante' => 'required_if:menor,true|nullable|string|min:2|max:150',
            'representanteDocumento' => 'required_if:menor,true|nullable|string|max:30',
            'bien' => 'required|in:servicio,producto',
            'descripcion' => 'required|string|min:3|max:2000',
            'monto' => 'nullable|numeric|min:0|max:99999999.99|decimal:0,2',
            'moneda' => 'required|in:PEN,USD',
            'tipo' => 'required|in:reclamo,queja',
            'detalle' => 'required|string|min:5|max:10000',
            'pedido' => 'required|string|min:3|max:5000',
            'canal' => 'required|in:email,domicilio',
        ], ['required' => 'Completa este campo.', 'required_if' => 'Completa este campo.',
            'email.email' => 'Escribe un correo válido.', 'documento.regex' => 'El DNI debe tener 8 dígitos.']);
        $solicitud = $d['solicitudId']; unset($d['solicitudId']);
        foreach ($d as $k => $v) { if (is_string($v)) { $d[$k] = trim($v); } }
        $d['email'] = $d['email'] ?? '';
        $d['monto'] = isset($d['monto']) ? number_format((float) $d['monto'], 2, '.', '') : null;
        if (! $d['menor']) { $d['representante'] = null; $d['representanteDocumento'] = null; }
        $hoja = Reclamaciones::registrar($d, $solicitud);
        Reclamaciones::enviarPendientes($hoja->id);
        $hoja = DB::table('reclamaciones')->find($hoja->id);
        return response()->json([...Reclamaciones::publica($hoja), 'token' => Reclamaciones::token($solicitud)], 201)
            ->header('Cache-Control', 'private, no-store');
    }

    public function constancia(string $token)
    {
        $hoja = Reclamaciones::porToken($token);
        return $this->responderPdf(Reclamaciones::pdf($hoja, true), Reclamaciones::publica($hoja)['numero'], true)
            ->header('Referrer-Policy', 'no-referrer')->header('X-Robots-Tag', 'noindex, nofollow');
    }

    public function listar(Request $r)
    {
        $q = DB::table('reclamaciones')->orderByDesc('numero');
        if ($r->query('estado') === 'pendiente') { $q->whereNull('respondido_en'); }
        if ($r->query('estado') === 'respondido') { $q->whereNotNull('respondido_en'); }
        return response()->json($q->paginate(25)->through(fn ($h) => Reclamaciones::publica($h)))
            ->header('Cache-Control', 'private, no-store');
    }

    public function responder(Request $r, int $id)
    {
        $d = $this->validar($r->all(), ['respuesta' => 'required|string|min:10|max:10000',
            'responsable' => 'required|string|min:2|max:150', 'constanciaPostal' => 'nullable|string|max:500']);
        Reclamaciones::responder($id, $d);
        Reclamaciones::enviarPendientes($id);
        return response()->json(Reclamaciones::publica(DB::table('reclamaciones')->find($id)))->header('Cache-Control', 'no-store');
    }

    public function reintentar(int $id)
    {
        abort_unless(DB::table('reclamaciones')->where('id', $id)->exists(), 404);
        Reclamaciones::enviarPendientes($id);
        return response()->json(Reclamaciones::publica(DB::table('reclamaciones')->find($id)))->header('Cache-Control', 'no-store');
    }

    public function pdfAdmin(int $id)
    {
        $r = DB::table('reclamaciones')->find($id);
        abort_unless($r, 404);
        return $this->responderPdf(Reclamaciones::pdf($r, true), Reclamaciones::publica($r)['numero'], true);
    }
}
