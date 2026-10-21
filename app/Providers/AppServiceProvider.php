<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // TCPDF, ante un error (p. ej. un PNG con transparencia sin la extensión GD o Imagick), por defecto corta todo el
        // proceso con die(): la respuesta llega rota y la página queda en blanco. Así lanza una excepción que se puede atrapar.
        // Con K_TCPDF_EXTERNAL_CONFIG, TCPDF no carga su archivo de configuración y usa sus valores por defecto.
        if (! defined('K_TCPDF_EXTERNAL_CONFIG')) {
            define('K_TCPDF_EXTERNAL_CONFIG', true);
        }
        if (! defined('K_TCPDF_THROW_EXCEPTION_ERROR')) {
            define('K_TCPDF_THROW_EXCEPTION_ERROR', true);
        }
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
