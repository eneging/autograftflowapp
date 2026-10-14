<?php

namespace App\Servicios;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Imágenes de firmas, sellos, huellas y logos.
 *
 * Con CLOUDINARY_URL se suben a Cloudinary como imágenes **privadas**: no tienen una URL pública y solo se
 * descargan con una petición firmada desde el servidor, que las entrega al navegador después de comprobar
 * el enlace del firmante o la sesión del dueño. Sin Cloudinary se guardan en el disco del hosting.
 *
 * Cada imagen se guarda como una referencia: «cld:<public_id>.<formato>» o «local:<ruta>».
 */
class Imagenes
{
    public static function cloudinaryActivo(): bool
    {
        $c = config('autograflow.cloudinary');
        return $c['nube'] !== '' && $c['clave'] !== '' && $c['secreto'] !== '';
    }

    /** Guarda una imagen (bytes PNG o JPG) y devuelve su referencia. */
    public static function guardar(string $bytes, string $carpeta): string
    {
        $formato = self::formato($bytes);
        if (! self::cloudinaryActivo()) {
            $ruta = "imagenes/{$carpeta}/".Str::random(24).".{$formato}";
            Storage::disk('local')->put($ruta, $bytes);
            return "local:{$ruta}";
        }

        $c = config('autograflow.cloudinary');
        $parametros = [
            'folder' => trim("{$c['carpeta']}/{$carpeta}", '/'),
            'timestamp' => time(),
            'type' => 'private',
        ];
        $r = Http::timeout(30)->asMultipart()
            ->attach('file', $bytes, "imagen.{$formato}")
            ->post(self::urlApi('image/upload'), $parametros + ['api_key' => $c['clave'], 'signature' => self::firmar($parametros)]);
        if (! $r->successful() || ! $r->json('public_id')) {
            throw new RuntimeException('Cloudinary no aceptó la imagen: '.Str::limit($r->body(), 200));
        }
        return 'cld:'.$r->json('public_id').'.'.($r->json('format') ?: $formato);
    }

    /** Bytes de una imagen guardada (para el navegador o para dibujarla en el PDF). */
    public static function leer(string $ref): string
    {
        if (str_starts_with($ref, 'local:')) {
            return Storage::disk('local')->get(substr($ref, 6)) ?? throw new RuntimeException('Imagen no encontrada');
        }
        if (! str_starts_with($ref, 'cld:')) {
            throw new RuntimeException('Referencia de imagen inválida');
        }
        [$publicId, $formato] = self::partes($ref);
        $c = config('autograflow.cloudinary');
        // Descarga privada: la URL vence en 5 minutos y está firmada con la clave secreta.
        $parametros = ['format' => $formato, 'public_id' => $publicId, 'timestamp' => time(), 'type' => 'private', 'expires_at' => time() + 300];
        $r = Http::timeout(30)->get(self::urlApi('image/download'), $parametros + ['api_key' => $c['clave'], 'signature' => self::firmar($parametros)]);
        if (! $r->successful()) {
            throw new RuntimeException("Cloudinary respondió {$r->status()} al descargar la imagen");
        }
        return $r->body();
    }

    public static function borrar(?string $ref): void
    {
        if (! $ref) {
            return;
        }
        if (str_starts_with($ref, 'local:')) {
            Storage::disk('local')->delete(substr($ref, 6));
            return;
        }
        if (str_starts_with($ref, 'cld:') && self::cloudinaryActivo()) {
            [$publicId] = self::partes($ref);
            $c = config('autograflow.cloudinary');
            $parametros = ['public_id' => $publicId, 'timestamp' => time(), 'type' => 'private', 'invalidate' => 'true'];
            Http::timeout(30)->asForm()->post(self::urlApi('image/destroy'), $parametros + ['api_key' => $c['clave'], 'signature' => self::firmar($parametros)]);
        }
    }

    public static function tipoMime(string $bytes): string
    {
        return self::formato($bytes) === 'png' ? 'image/png' : 'image/jpeg';
    }

    /** Solo PNG o JPG, comprobado por su contenido (no por el nombre). */
    public static function formato(string $bytes): string
    {
        if (str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            return 'png';
        }
        if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
            return 'jpg';
        }
        throw new ImagenInvalida('La imagen debe ser PNG o JPG');
    }

    /** Imagen «data:image/png;base64,…» enviada por la página → bytes. */
    public static function desdeDataUrl(string $dataUrl, int $maxBytes): string
    {
        if (! preg_match('#^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $m)) {
            throw new ImagenInvalida('Imagen inválida');
        }
        $bytes = base64_decode($m[2], true);
        if ($bytes === false || strlen($bytes) > $maxBytes) {
            throw new ImagenInvalida('La imagen es demasiado grande');
        }
        self::formato($bytes);
        return $bytes;
    }

    /** Firma de Cloudinary: SHA-1 de los parámetros ordenados «a=1&b=2» seguidos de la clave secreta. */
    public static function firmar(array $parametros): string
    {
        ksort($parametros);
        $cadena = implode('&', array_map(fn ($k, $v) => "{$k}={$v}", array_keys($parametros), $parametros));
        return sha1($cadena.config('autograflow.cloudinary.secreto'));
    }

    private static function urlApi(string $accion): string
    {
        $c = config('autograflow.cloudinary');
        return "{$c['api']}/v1_1/{$c['nube']}/{$accion}";
    }

    private static function partes(string $ref): array
    {
        $id = substr($ref, 4);
        $punto = strrpos($id, '.');
        return $punto === false ? [$id, 'png'] : [substr($id, 0, $punto), substr($id, $punto + 1)];
    }
}
