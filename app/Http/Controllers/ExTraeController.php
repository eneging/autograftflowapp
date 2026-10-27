<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * EX-Trae: «Enviar texto al ordenador». El celular guarda el texto leído y los demás dispositivos con la misma cuenta
 * lo reciben al consultar (cada pocos segundos; el hosting compartido no admite conexiones en tiempo real).
 */
class ExTraeController extends Controlador
{
    /** Cuántos textos se guardan por usuario: al enviar uno nuevo se borran los más antiguos. */
    private const MAXIMO = 50;

    public function enviar(Request $r)
    {
        $d = $this->validar($r->all(), [
            'texto' => 'required|string|min:1|max:20000',
            'datos' => 'nullable|array',
            'datos.*' => 'nullable|string|max:300',
            'origen' => 'nullable|string|max:60',
        ], ['texto.required' => 'No hay texto para enviar.', 'texto.max' => 'El texto es demasiado largo (máximo 20 000 caracteres).']);
        $uid = $r->user()->id;
        $id = DB::table('ex_trae_textos')->insertGetId([
            'user_id' => $uid, 'texto' => $d['texto'], 'datos' => isset($d['datos']) ? json_encode($d['datos'], JSON_UNESCAPED_UNICODE) : null,
            'origen' => $d['origen'] ?? '', 'created_at' => now(),
        ]);
        $limite = DB::table('ex_trae_textos')->where('user_id', $uid)->orderByDesc('id')->skip(self::MAXIMO)->value('id');
        if ($limite) {
            DB::table('ex_trae_textos')->where('user_id', $uid)->where('id', '<=', $limite)->delete();
        }
        return response()->json(['id' => $id], 201);
    }

    /** Los textos más nuevos que «despues» (el último que ya tiene el dispositivo), o los últimos 20. */
    public function recibir(Request $r)
    {
        $despues = max(0, (int) $r->query('despues', 0));
        $filas = DB::table('ex_trae_textos')->where('user_id', $r->user()->id)->where('id', '>', $despues)
            ->orderByDesc('id')->limit(20)->get();
        return response()->json($filas->map(fn ($f) => [
            'id' => $f->id, 'texto' => $f->texto, 'datos' => $f->datos ? json_decode($f->datos, true) : null,
            'origen' => $f->origen, 'creadoEn' => $f->created_at ? Carbon::parse($f->created_at)->toIso8601String() : null,
        ]))->header('Cache-Control', 'private, no-store');
    }

    public function borrar(Request $r, int $id)
    {
        DB::table('ex_trae_textos')->where('user_id', $r->user()->id)->where('id', $id)->delete();
        return ['ok' => true];
    }

    public function limpiar(Request $r)
    {
        DB::table('ex_trae_textos')->where('user_id', $r->user()->id)->delete();
        return ['ok' => true];
    }
}
