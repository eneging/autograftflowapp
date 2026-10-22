<?php

namespace App\Http\Controllers;

use App\Servicios\Documentos;
use App\Servicios\Equipo;
use App\Servicios\ErrorUso;
use App\Servicios\Imagenes;
use App\Servicios\MercadoPago;
use App\Servicios\Planes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Planes, pagos con Mercado Pago, logo propio, verificación pública y administración de cuentas. */
class CuentaController extends Controlador
{
    public function guia(Request $r)
    {
        $d = $this->validar($r->all(), ['estado' => 'required|in:pendiente,activa,omitida,completa',
            'paso' => 'required|integer|min:1|max:6', 'documentoId' => 'nullable|integer|min:1']);
        if (! empty($d['documentoId']) && ! DB::table('documentos')->where('id', $d['documentoId'])
            ->where('cuenta_id', $r->user()->cuenta_id)->exists()) {
            throw new ErrorUso('Este documento no está disponible en tu cuenta.', 404);
        }
        DB::table('users')->where('id', $r->user()->id)->update(['guia_estado' => $d['estado'], 'guia_paso' => $d['paso'],
            'guia_documento_id' => $d['documentoId'] ?? null]);
        return response()->json($d)->header('Cache-Control', 'private, no-store');
    }

    public function planes()
    {
        $c = Planes::catalogo();
        return ['planes' => array_values($c['planes']), 'notaIlimitado' => $c['notaIlimitado'], 'moneda' => config('autograflow.moneda'), 'pagosActivos' => MercadoPago::activo()];
    }

    public function cuenta(Request $r)
    {
        $id = $r->user()->cuenta_id;
        return [
            'estado' => Planes::estado($id),
            'pagos' => DB::table('pagos')->where('cuenta_id', $id)->orderByDesc('id')->limit(100)->get()->map(fn ($p) => MercadoPago::fila($p))->all(),
        ];
    }

    public function equipo(Request $r)
    {
        return Equipo::estado($r->user());
    }

    public function nuevoCodigoEquipo(Request $r)
    {
        return ['codigo' => Equipo::nuevoCodigo($r->user())];
    }

    public function quitarMiembro(Request $r, int $usuario)
    {
        Equipo::quitar($r->user(), $usuario);
        return ['ok' => true];
    }

    public function comprar(Request $r)
    {
        $d = $this->validar($r->all(), ['producto' => 'required|string|max:40'], ['producto.*' => 'Elige un plan']);
        if (AuthController::esInvitado($r->user())) {
            throw new \App\Servicios\ErrorUso('Crea tu cuenta para comprar un plan: así tus pagos y documentos quedan a tu nombre.', 403);
        }
        return response()->json(MercadoPago::crearPago($r->user(), $d['producto']), 201);
    }

    public function verificarPago(Request $r, int $id)
    {
        return MercadoPago::verificar($r->user(), $id);
    }

    /** Aviso de Mercado Pago: no lleva sesión. Se comprueba su firma y luego se consulta el pago a Mercado Pago. */
    public function webhook(Request $r)
    {
        $tipo = (string) ($r->input('type') ?? $r->query('type') ?? $r->query('topic') ?? '');
        $dataId = (string) ($r->input('data.id') ?? $r->query('data_id') ?? $r->query('data.id') ?? $r->query('id') ?? '');
        $secreto = config('autograflow.mercadopago.secreto_webhook');
        // PHP convierte «data.id» de la URL en «data_id»; Mercado Pago firma con el id que va en la URL.
        $idFirmado = (string) ($r->query('data_id') ?? $dataId);
        if ($secreto !== '' && ! MercadoPago::firmaValida($secreto, $r->header('x-signature'), $r->header('x-request-id'), $idFirmado)) {
            return response()->json(['error' => 'Firma inválida'], 401);
        }
        if ($tipo === 'payment' && $dataId !== '') {
            try {
                MercadoPago::procesarPago($dataId);
            } catch (\Throwable $e) {
                report($e);
                // Con error, Mercado Pago reintenta el aviso más tarde.
                return response()->json(['error' => 'Reintentar'], 500);
            }
        }
        return ['ok' => true];
    }

    // ---------------- logo propio (planes de pago)

    public function logo(Request $r)
    {
        $ref = DB::table('cuentas')->where('id', $r->user()->cuenta_id)->value('logo') ?? throw new ErrorUso('Sin logo', 404);
        return $this->responderImagen(Imagenes::leer($ref));
    }

    public function subirLogo(Request $r)
    {
        $bytes = $r->getContent();
        if ($bytes === '' || strlen($bytes) > 600 * 1024) {
            throw new ErrorUso('Sube una imagen PNG o JPG de hasta 600 KB');
        }
        Imagenes::formato($bytes);
        $id = $r->user()->cuenta_id;
        if (Planes::esGratis($id)) {
            throw new ErrorUso('El logo propio está disponible en los planes de pago', 402);
        }
        $anterior = DB::table('cuentas')->where('id', $id)->value('logo');
        DB::table('cuentas')->where('id', $id)->update(['logo' => Imagenes::guardar($bytes, "cuentas/{$id}"), 'updated_at' => now()]);
        rescue(fn () => Imagenes::borrar($anterior), report: false);
        return ['ok' => true];
    }

    public function quitarLogo(Request $r)
    {
        $id = $r->user()->cuenta_id;
        $anterior = DB::table('cuentas')->where('id', $id)->value('logo');
        DB::table('cuentas')->where('id', $id)->update(['logo' => null]);
        rescue(fn () => Imagenes::borrar($anterior), report: false);
        return ['ok' => true];
    }

    public function verificar(string $sha)
    {
        return Documentos::verificar(strtolower($sha));
    }

    // ---------------- administración (contraseña ADMIN_PASSWORD)

    public function adminCuentas()
    {
        return DB::table('cuentas as c')->orderByDesc('c.id')->limit(500)->get()->map(fn ($c) => [
            'id' => $c->id, 'nombre' => $c->nombre,
            'email' => DB::table('users')->where('cuenta_id', $c->id)->orderBy('id')->value('email'),
            'plan' => $c->plan, 'nombrePlan' => Planes::plan($c->plan)['nombre'], 'vence' => \App\Servicios\Fechas::iso($c->plan_vence),
            'creditos' => (int) $c->creditos, 'documentos' => DB::table('documentos')->where('cuenta_id', $c->id)->count(),
            'usuarios' => DB::table('users')->where('cuenta_id', $c->id)->count(),
            'usadosMes' => DB::table('consumos')->where('cuenta_id', $c->id)->where('creado_en', '>=', Planes::inicioMes())->count(),
            'pagado' => (float) DB::table('pagos')->where('cuenta_id', $c->id)->where('estado', 'aprobado')->sum('monto'),
            'creadoEn' => \App\Servicios\Fechas::iso($c->created_at),
        ])->all();
    }

    public function adminActivar(Request $r, int $id)
    {
        $d = $this->validar($r->all(), ['producto' => 'required|string|max:40'], ['producto.*' => 'Elige un plan']);
        MercadoPago::activarManual($id, $d['producto']);
        return ['ok' => true];
    }
}
