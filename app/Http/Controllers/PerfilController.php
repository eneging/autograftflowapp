<?php

namespace App\Http\Controllers;

use App\Servicios\ErrorUso;
use App\Servicios\Perfiles;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** «Mi perfil»: avatar, nombre, datos de facturación y comprobantes de pago (solo para cuentas, no invitados). */
class PerfilController extends Controlador
{
    private function conCuenta(Request $r)
    {
        if (AuthController::esInvitado($r->user())) {
            throw new ErrorUso('Crea tu cuenta para tener un perfil.', 403);
        }
        return $r->user();
    }

    public function ver(Request $r)
    {
        return response()->json(Perfiles::perfil($this->conCuenta($r)))->header('Cache-Control', 'private, no-store');
    }

    public function guardar(Request $r)
    {
        $u = $this->conCuenta($r);
        $d = $this->validar($r->all(), [
            'nombre' => 'required|string|min:2|max:120',
            'avatar' => ['nullable', 'string', 'regex:'.Perfiles::AVATAR],
            'facturacion' => 'nullable|array',
        ], ['nombre.*' => 'Escribe tu nombre (2 a 120 letras).', 'avatar.*' => 'Avatar no válido.']);
        $facturacion = empty($d['facturacion']) ? null : Perfiles::facturacion($d['facturacion']);
        DB::transaction(function () use ($u, $d, $facturacion) {
            DB::table('users')->where('id', $u->id)->update(['name' => trim($d['nombre']), 'avatar' => $d['avatar'] ?? null, 'updated_at' => now()]);
            DB::table('cuentas')->where('id', $u->cuenta_id)->update(['facturacion' => $facturacion ? json_encode($facturacion, JSON_UNESCAPED_UNICODE) : null]);
        });
        return Perfiles::perfil($u->fresh());
    }

    public function comprobante(Request $r, int $id)
    {
        $c = Perfiles::comprobante($this->conCuenta($r), $id);
        return $this->responderPdf($c['pdf'], $c['nombre'], true);
    }
}
