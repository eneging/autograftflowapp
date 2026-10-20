<?php

namespace App\Servicios;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Avisos por correo (configura MAIL_* en el .env; el hosting compartido suele dar un SMTP propio).
 * Si el correo no está configurado o falla, no pasa nada: el documento sigue su curso.
 */
class Avisos
{
    public static function enviar(string $para, string $asunto, string $titulo, array $parrafos, ?array $boton = null): bool
    {
        if ($para === '' || ! filter_var($para, FILTER_VALIDATE_EMAIL) || Invitados::esCorreo($para)) {
            return false;
        }
        try {
            $html = view('correo', compact('titulo', 'parrafos', 'boton'))->render();
            Mail::html($html, fn ($m) => $m->to($para)->subject($asunto));
            return true;
        } catch (\Throwable $e) {
            report($e);
            return false;
        }
    }

    private static function datos(int $documentoId): array
    {
        $d = DB::table('documentos as d')->join('users as u', 'u.id', '=', 'd.user_id')->where('d.id', $documentoId)
            ->first(['d.id', 'd.nombre', 'd.orden', 'd.mensaje', 'd.estado', 'u.name as remitente', 'u.email as remitente_email']);
        if ($d && Invitados::esCorreo($d->remitente_email)) {
            $d->remitente = Invitados::REMITENTE;
        }
        return [$d, DB::table('firmantes')->where('documento_id', $documentoId)->orderBy('orden')->get()];
    }

    private static function url(string $ruta): string
    {
        return rtrim(config('app.url'), '/').$ruta;
    }

    /** Invita a quien le toca firmar: al siguiente en orden o a todos los pendientes. */
    public static function turno(int $documentoId, string $a): void
    {
        [$d, $firmantes] = self::datos($documentoId);
        if (! $d || $d->estado !== 'en_firma') {
            return;
        }
        $pendientes = $firmantes->where('estado', 'pendiente')->values();
        foreach ($a === 'todos' ? $pendientes : $pendientes->take(1) as $f) {
            self::invitar($d, $f);
        }
    }

    /** Invitación (o recordatorio) a un firmante con su enlace personal. */
    public static function invitar(object $d, object $f, bool $recordatorio = false): bool
    {
        if (! $f->email || ! $f->token) {
            return false;
        }
        $asunto = $recordatorio ? "Recordatorio: «{$d->nombre}» espera tu firma" : "{$d->remitente} te envió «{$d->nombre}» para firmar";
        $ok = self::enviar($f->email, $asunto, "Hola {$f->nombre}, tienes un documento para firmar", array_filter([
            $recordatorio ? "{$d->remitente} te recuerda que «{$d->nombre}» todavía espera tu firma." : "{$d->remitente} te envió «{$d->nombre}» por AutograFlow.",
            $d->mensaje ? "Mensaje: «{$d->mensaje}»" : null,
            'Ábrelo desde tu celular o computadora, revisa el documento y completa los campos marcados. No necesitas crear una cuenta.',
        ]), ['texto' => 'Revisar y firmar', 'url' => self::url("/f/{$f->token}")]);
        if ($ok) {
            Documentos::evento($d->id, 'correo', ($recordatorio ? 'Recordatorio' : 'Invitación')." enviada por correo a {$f->email}", null, $f->id);
        }
        return $ok;
    }

    /** Recordatorio pedido por el dueño desde el seguimiento del documento. */
    public static function recordar(int $documentoId, int $firmanteId): bool
    {
        [$d, $firmantes] = self::datos($documentoId);
        $f = $firmantes->firstWhere('id', $firmanteId);
        return $d && $f ? self::invitar($d, $f, true) : false;
    }

    public static function dueno(int $documentoId, string $asunto, array $parrafos): void
    {
        [$d] = self::datos($documentoId);
        if ($d) {
            self::enviar($d->remitente_email, $asunto, $asunto, $parrafos, ['texto' => 'Ver el documento', 'url' => self::url("/app/d/{$documentoId}")]);
        }
    }

    /** Documento completo: aviso al dueño y a cada firmante con correo, con su enlace para descargarlo. */
    public static function completado(int $documentoId): void
    {
        [$d, $firmantes] = self::datos($documentoId);
        if (! $d || $d->estado !== 'completado') {
            return;
        }
        self::dueno($documentoId, "«{$d->nombre}» ya está firmado por todos", [
            'Firmaron: '.$firmantes->pluck('nombre')->implode(', ').'.', 'Ya puedes descargar el PDF firmado con su certificado de firmas.',
        ]);
        foreach ($firmantes as $f) {
            if ($f->email && $f->token) {
                self::enviar($f->email, "«{$d->nombre}» ya está firmado por todos", 'Documento firmado',
                    ["Todos los firmantes completaron «{$d->nombre}».", 'Puedes descargar tu copia firmada con su certificado.'],
                    ['texto' => 'Descargar documento firmado', 'url' => self::url("/f/{$f->token}")]);
            }
        }
    }
}
