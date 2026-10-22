<?php

namespace App\Servicios;

use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class Reclamaciones
{
    public static function proveedor(): array
    {
        $p = config('reclamaciones.proveedor');
        return [...$p, 'configurado' => trim($p['razonSocial']) !== '' && preg_match('/^\d{11}$/', $p['ruc'])
            && trim($p['domicilio']) !== '' && filter_var($p['correo'], FILTER_VALIDATE_EMAIL) !== false];
    }

    public static function token(string $solicitud): string
    {
        return hash_hmac('sha256', $solicitud, config('app.key'));
    }

    public static function registrar(array $datos, string $solicitud): object
    {
        $proveedor = self::proveedor();
        if (! $proveedor['configurado']) {
            throw new ErrorUso('El proveedor aún debe completar su identificación legal para habilitar el registro.', 503);
        }
        unset($proveedor['configurado']);
        $hash = hash('sha256', json_encode($datos, JSON_UNESCAPED_UNICODE));
        $crear = function () use ($datos, $solicitud, $proveedor, $hash) {
            $existe = DB::table('reclamaciones')->where('solicitud_id', $solicitud)->first();
            if ($existe) {
                if (! hash_equals($existe->entrada_hash, $hash)) {
                    throw new ErrorUso('Esta solicitud ya fue registrada con otros datos. Conserva tu constancia.', 409);
                }
                return $existe;
            }
            // Contador transaccional: los envíos simultáneos no repiten ni consumen números al fallar.
            DB::table('reclamacion_secuencia')->where('id', 1)->increment('valor');
            $numero = DB::table('reclamacion_secuencia')->where('id', 1)->value('valor');
            $ahora = CarbonImmutable::now('UTC');
            $id = DB::table('reclamaciones')->insertGetId([
                'numero' => $numero, 'solicitud_id' => $solicitud, 'token_hash' => hash('sha256', self::token($solicitud)),
                'entrada_hash' => $hash, 'datos' => json_encode($datos), 'proveedor' => json_encode($proveedor),
                'registrado_en' => $ahora, 'vence_el' => PlazoReclamacion::vence($ahora),
            ]);
            foreach (['copia' => $datos['email'] ?? '', 'aviso' => $proveedor['correo']] as $tipo => $destino) {
                if ($destino !== '') {
                    DB::table('reclamacion_correos')->insert(['reclamacion_id' => $id, 'tipo' => $tipo,
                        'destinatario' => $destino, 'created_at' => now(), 'updated_at' => now()]);
                }
            }
            return DB::table('reclamaciones')->find($id);
        };
        try {
            return DB::transaction($crear, 3);
        } catch (UniqueConstraintViolationException $e) {
            // Reintento de la misma petición que alcanzó el servidor al mismo tiempo.
            $existente = DB::table('reclamaciones')->where('solicitud_id', $solicitud)->first();
            if (! $existente) { throw $e; }
            if (! hash_equals($existente->entrada_hash, $hash)) { throw new ErrorUso('La solicitud ya existe con otros datos.', 409); }
            return $existente;
        }
    }

    public static function porToken(string $token): object
    {
        $r = preg_match('/^[a-f0-9]{64}$/', $token) ? DB::table('reclamaciones')->where('token_hash', hash('sha256', $token))->first() : null;
        if (! $r) { throw new ErrorUso('Constancia no encontrada.', 404); }
        return $r;
    }

    public static function publica(object $r): array
    {
        return ['id' => $r->id, 'numero' => 'LR-'.str_pad((string) $r->numero, 8, '0', STR_PAD_LEFT),
            'registradoEn' => CarbonImmutable::parse($r->registrado_en, 'UTC')->setTimezone('America/Lima')->toIso8601String(),
            'venceEl' => $r->vence_el, 'datos' => json_decode($r->datos, true), 'proveedor' => json_decode($r->proveedor, true),
            'respuesta' => $r->respuesta, 'responsable' => $r->responsable, 'respondidoEn' => $r->respondido_en,
            'constanciaPostal' => $r->constancia_postal,
            'estado' => $r->respondido_en ? 'respondido' : ($r->respuesta ? 'pendiente_envio' : 'pendiente'),
            'correos' => DB::table('reclamacion_correos')->where('reclamacion_id', $r->id)->get(['id', 'tipo', 'estado', 'intentos', 'enviado_en'])->toArray()];
    }

    public static function pdf(object $r, bool $respuesta = false): string
    {
        $pdf = new \TCPDF();
        $pdf->setPrintHeader(false); $pdf->setPrintFooter(false);
        $pdf->SetTitle('Hoja de Reclamación '.self::publica($r)['numero']);
        $pdf->SetMargins(14, 12, 14); $pdf->SetAutoPageBreak(true, 14);
        $pdf->AddPage(); $pdf->SetFont('dejavusans', '', 10);
        $pdf->writeHTML(view('reclamacion', ['hoja' => self::publica($r), 'incluirRespuesta' => $respuesta])->render());
        return $pdf->Output('', 'S');
    }

    public static function responder(int $id, array $d): void
    {
        DB::transaction(function () use ($id, $d) {
            $r = DB::table('reclamaciones')->where('id', $id)->lockForUpdate()->first();
            if (! $r) { throw new ErrorUso('Hoja no encontrada.', 404); }
            if ($r->respuesta) { throw new ErrorUso('La respuesta ya fue registrada. Puedes reintentar su envío.', 409); }
            $datos = json_decode($r->datos, true);
            if ($datos['canal'] === 'domicilio' && empty($d['constanciaPostal'])) {
                throw new ErrorUso('Indica el número de guía o constancia de envío postal.', 400);
            }
            DB::table('reclamaciones')->where('id', $id)->update(['respuesta' => $d['respuesta'], 'responsable' => $d['responsable'],
                'respuesta_redactada_en' => now(), 'constancia_postal' => $datos['canal'] === 'domicilio' ? $d['constanciaPostal'] : null,
                'respondido_en' => $datos['canal'] === 'domicilio' ? now() : null]);
            if ($datos['canal'] === 'email') {
                DB::table('reclamacion_correos')->insert(['reclamacion_id' => $id, 'tipo' => 'respuesta', 'destinatario' => $datos['email'],
                    'created_at' => now(), 'updated_at' => now()]);
            }
        });
    }

    public static function enviarPendientes(?int $reclamacionId = null): void
    {
        // Los transportes de desarrollo no equivalen a haber notificado al consumidor.
        $mailer = config('mail.default');
        if (in_array($mailer, ['log', 'array', 'failover'], true) && ! app()->runningUnitTests()) { return; }
        $query = DB::table('reclamacion_correos')->whereIn('estado', ['pendiente', 'error']);
        if ($reclamacionId !== null) { $query->where('reclamacion_id', $reclamacionId); }
        foreach ($query->orderBy('updated_at')->orderBy('id')->limit(50)->get() as $correo) {
            if (! DB::table('reclamacion_correos')->where('id', $correo->id)->whereIn('estado', ['pendiente', 'error'])
                ->update(['estado' => 'enviando', 'intentos' => DB::raw('intentos + 1'), 'updated_at' => now()])) { continue; }
            try {
                $r = DB::table('reclamaciones')->find($correo->reclamacion_id);
                $hoja = self::publica($r);
                $respuesta = $correo->tipo === 'respuesta';
                $texto = $respuesta ? $r->respuesta : "Se registró tu {$hoja['datos']['tipo']}. Fecha límite de respuesta: {$r->vence_el}.";
                if ($correo->tipo === 'aviso') { $texto = "Nueva hoja {$hoja['numero']}. Atiéndela desde /admin/reclamaciones antes del {$r->vence_el}."; }
                Mail::raw($texto, function ($m) use ($correo, $hoja, $r, $respuesta) {
                    $m->to($correo->destinatario)->subject(($respuesta ? 'Respuesta a ' : 'Libro de Reclamaciones: ').$hoja['numero'])
                        ->attachData(self::pdf($r, $respuesta), $hoja['numero'].'.pdf', ['mime' => 'application/pdf']);
                });
                DB::transaction(function () use ($correo, $respuesta) {
                    DB::table('reclamacion_correos')->where('id', $correo->id)->update(['estado' => 'enviado', 'enviado_en' => now(), 'updated_at' => now()]);
                    if ($respuesta) { DB::table('reclamaciones')->where('id', $correo->reclamacion_id)->update(['respondido_en' => now()]); }
                });
            } catch (\Throwable $e) {
                report($e);
                DB::table('reclamacion_correos')->where('id', $correo->id)->update(['estado' => 'error', 'updated_at' => now()]);
            }
        }
    }
}
