<?php

namespace App\Servicios;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Perfil del usuario: avatar, nombre y datos de facturación de la cuenta (boleta o factura), y el comprobante de pago
 * de cada pago aprobado. El comprobante guarda una copia de los datos con los que se emitió y no cambia después.
 */
class Perfiles
{
    /** Avatar armado con piezas: fondo, piel, peinado, color de pelo, accesorio y expresión (lo dibuja la web, Avatar.tsx). */
    public const AVATAR = '/^f[0-7]-p[0-5]-h[0-7]-c[0-5]-a[0-7]-e[0-3]$/';

    public static function perfil(User $u): array
    {
        $c = DB::table('cuentas')->find($u->cuenta_id);
        return ['nombre' => $u->name, 'email' => $u->email, 'avatar' => $u->avatar, 'cuenta' => $c->nombre,
            'facturacion' => $c->facturacion ? json_decode($c->facturacion, true) : null,
            'pagos' => DB::table('pagos')->where('cuenta_id', $u->cuenta_id)->where('estado', 'aprobado')->orderByDesc('id')->limit(100)->get()
                ->map(fn ($p) => [...MercadoPago::fila($p), 'comprobante' => $p->comprobante_en ? self::numero($p->id) : null])->all()];
    }

    /** Dígito verificador del RUC (módulo 11 de SUNAT). */
    public static function rucValido(string $ruc): bool
    {
        if (! preg_match('/^(10|15|16|17|20)\d{9}$/', $ruc)) {
            return false;
        }
        $suma = 0;
        foreach ([5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as $i => $peso) {
            $suma += (int) $ruc[$i] * $peso;
        }
        $digito = (11 - $suma % 11) % 10;
        return $digito === (int) $ruc[10];
    }

    /** Valida y normaliza los datos de facturación: {tipo, documentoTipo, documento, nombre, direccion, correo}. */
    public static function facturacion(array $d): array
    {
        $tipo = $d['tipo'] ?? '';
        $doc = strtoupper(preg_replace('/\s+/', '', (string) ($d['documento'] ?? '')));
        $nombre = trim((string) ($d['nombre'] ?? ''));
        $direccion = trim((string) ($d['direccion'] ?? ''));
        $correo = trim((string) ($d['correo'] ?? ''));
        $errores = [];
        if ($tipo === 'factura') {
            $docTipo = 'RUC';
            if (! self::rucValido($doc)) { $errores['documento'] = 'El RUC no es válido: son 11 dígitos y empieza con 10, 15, 16, 17 o 20.'; }
            if (mb_strlen($nombre) < 3) { $errores['nombre'] = 'Escribe la razón social tal como figura en SUNAT.'; }
            if (mb_strlen($direccion) < 5) { $errores['direccion'] = 'La factura necesita la dirección fiscal.'; }
        } elseif ($tipo === 'boleta') {
            $docTipo = in_array($d['documentoTipo'] ?? '', ['DNI', 'CE', 'PASAPORTE'], true) ? $d['documentoTipo'] : 'DNI';
            $ok = match ($docTipo) {
                'DNI' => preg_match('/^\d{8}$/', $doc),
                'CE' => preg_match('/^[A-Z0-9]{9,12}$/', $doc),
                default => preg_match('/^[A-Z0-9]{6,12}$/', $doc),
            };
            if (! $ok) { $errores['documento'] = $docTipo === 'DNI' ? 'El DNI tiene 8 dígitos.' : 'Revisa el número de documento.'; }
            if (mb_strlen($nombre) < 3) { $errores['nombre'] = 'Escribe tus nombres y apellidos.'; }
        } else {
            throw new ErrorUso('Elige boleta o factura', 400, ['tipo' => 'Elige boleta o factura.']);
        }
        if ($correo !== '' && ! filter_var($correo, FILTER_VALIDATE_EMAIL)) { $errores['correo'] = 'Revisa el correo.'; }
        if (mb_strlen($nombre) > 200 || mb_strlen($direccion) > 250) { $errores['nombre'] ??= 'Es demasiado largo.'; }
        if ($errores) {
            throw new ErrorUso('Revisa los datos de facturación', 400, collect($errores)->mapWithKeys(fn ($m, $k) => ["facturacion.{$k}" => $m])->all());
        }
        return ['tipo' => $tipo, 'documentoTipo' => $docTipo, 'documento' => $doc, 'nombre' => $nombre, 'direccion' => $direccion, 'correo' => $correo];
    }

    public static function numero(int $pagoId): string
    {
        return 'AF-'.str_pad((string) $pagoId, 8, '0', STR_PAD_LEFT);
    }

    /** PDF del comprobante de un pago aprobado. La primera vez se emite con los datos de facturación actuales. */
    public static function comprobante(User $u, int $pagoId): array
    {
        $pago = DB::table('pagos')->where('id', $pagoId)->where('cuenta_id', $u->cuenta_id)->first() ?? throw new ErrorUso('Pago no encontrado', 404);
        if ($pago->estado !== 'aprobado') {
            throw new ErrorUso('Solo los pagos aprobados tienen comprobante.', 409);
        }
        if (! $pago->comprobante) {
            $datos = DB::table('cuentas')->where('id', $u->cuenta_id)->value('facturacion')
                ?? throw new ErrorUso('Completa tus datos de facturación en «Mi perfil» para generar el comprobante.', 409);
            DB::table('pagos')->where('id', $pagoId)->whereNull('comprobante')->update(['comprobante' => $datos, 'comprobante_en' => now()]);
            $pago = DB::table('pagos')->find($pagoId);
        }
        $zona = config('autograflow.zona');
        $fecha = Carbon::parse($pago->aplicado_en ?? $pago->created_at, 'UTC')->setTimezone($zona);
        $c = [
            'numero' => self::numero($pago->id),
            'cliente' => json_decode($pago->comprobante, true),
            'proveedor' => config('reclamaciones.proveedor'),
            'concepto' => $pago->titulo,
            'monto' => number_format((float) $pago->monto, 2, '.', ','),
            'moneda' => $pago->moneda === 'PEN' ? 'S/' : $pago->moneda,
            'fechaPago' => $fecha->format('d/m/Y H:i'),
            'emitido' => Carbon::parse($pago->comprobante_en, 'UTC')->setTimezone($zona)->format('d/m/Y H:i'),
            'medio' => $pago->medio === 'manual' ? 'Pago registrado manualmente' : 'Mercado Pago',
            'operacion' => $pago->mp_pago_id,
        ];
        $pdf = new \TCPDF();
        $pdf->setPrintHeader(false); $pdf->setPrintFooter(false);
        $pdf->SetTitle("Comprobante de pago {$c['numero']}");
        $pdf->SetMargins(16, 14, 16); $pdf->SetAutoPageBreak(true, 14);
        $pdf->AddPage(); $pdf->SetFont('dejavusans', '', 10);
        $pdf->writeHTML(view('comprobante', ['c' => $c])->render());
        return ['pdf' => $pdf->Output('', 'S'), 'nombre' => "comprobante-{$c['numero']}"];
    }
}
