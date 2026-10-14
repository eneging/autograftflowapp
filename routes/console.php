<?php

use App\Models\User;
use App\Servicios\Imagenes;
use App\Servicios\MercadoPago;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/*
 * php artisan autograflow:probar
 * Comprueba las credenciales del .env contra los servicios reales, sin cobrar ni dejar datos:
 *  - Cloudinary: sube una imagen privada, la descarga, comprueba que no sea pública y la borra.
 *  - Mercado Pago: crea un enlace de pago (no se paga) y consulta su estado; la base vuelve a como estaba.
 */
Artisan::command('autograflow:probar', function () {
    $ok = true;

    $this->info('Cloudinary');
    if (! Imagenes::cloudinaryActivo()) {
        $this->warn('  CLOUDINARY_URL vacío: las imágenes se guardan en el disco del hosting.');
    } else {
        try {
            $png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
            $ref = Imagenes::guardar($png, 'prueba');
            $this->line("  ✓ imagen privada subida ({$ref})");
            $this->line('  '.(Imagenes::leer($ref) === $png ? '✓' : '✗').' descargada con URL firmada');
            $c = config('autograflow.cloudinary');
            $publicId = substr($ref, 4, strrpos($ref, '.') - 4);
            $estado = Http::get("https://res.cloudinary.com/{$c['nube']}/image/upload/{$publicId}.png")->status();
            $this->line('  '.($estado >= 400 ? '✓' : '✗')." sin firma no se puede ver (HTTP {$estado})");
            Imagenes::borrar($ref);
            $this->line('  ✓ imagen de prueba borrada');
        } catch (Throwable $e) {
            $ok = false;
            $this->error('  ✗ '.$e->getMessage());
        }
    }

    $this->info('Mercado Pago');
    if (! MercadoPago::activo()) {
        $this->warn('  MP_ACCESS_TOKEN vacío: los pagos en línea están desactivados (se pueden activar planes a mano en /admin).');
    } else {
        $c = config('autograflow.mercadopago');
        try {
            $yo = Http::withToken($c['token'])->get("{$c['api']}/users/me")->throw()->json();
            $prueba = str_starts_with((string) ($yo['nickname'] ?? ''), 'TESTUSER');
            $this->line("  ✓ cuenta vendedora: {$yo['nickname']} ({$yo['site_id']})".($prueba ? ' — usuario DE PRUEBA: no cobra dinero real' : ' — PRODUCCIÓN: los pagos son reales'));
            DB::beginTransaction();
            try {
                $cuenta = DB::table('cuentas')->insertGetId(['nombre' => 'Prueba', 'created_at' => now(), 'updated_at' => now()]);
                $u = User::create(['cuenta_id' => $cuenta, 'name' => 'Prueba', 'email' => 'prueba-'.uniqid().'@ejemplo.com', 'password' => uniqid()]);
                $r = MercadoPago::crearPago($u, 'profesional');
                $pref = Http::withToken($c['token'])->get("{$c['api']}/checkout/preferences/".DB::table('pagos')->where('id', $r['pagoId'])->value('mp_preferencia'))->json();
                $this->line("  ✓ enlace de pago creado: {$pref['items'][0]['unit_price']} {$pref['items'][0]['currency_id']} · {$r['url']}");
                $this->line('  '.($pref['notification_url'] ?? null ? '✓ avisos (webhook) a '.$pref['notification_url'] : '⚠ sin webhook: APP_URL debe empezar con https:// (en tu PC es normal)'));
                $this->line('  ✓ estado al consultar: '.MercadoPago::verificar($u, $r['pagoId'])['estado'].' (nadie pagó)');
            } finally {
                DB::rollBack();
            }
            if (config('autograflow.mercadopago.secreto_webhook') === '') {
                $this->warn('  ⚠ MP_WEBHOOK_SECRET vacío: los avisos se aceptan sin comprobar su firma (igual se consulta cada pago a Mercado Pago).');
            }
        } catch (Throwable $e) {
            $ok = false;
            $this->error('  ✗ '.$e->getMessage());
        }
    }

    $ok ? $this->info('Todo en orden.') : $this->error('Hay problemas: revisa las credenciales del .env.');
    return $ok ? 0 : 1;
})->purpose('Comprueba las credenciales de Cloudinary y Mercado Pago sin cobrar ni dejar datos');
