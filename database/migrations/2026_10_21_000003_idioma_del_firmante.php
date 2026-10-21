<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Idioma en el que se abre la página del firmante (es/en). Se detecta del texto del PDF al subirlo y quien prepara el
 * documento lo puede cambiar; el firmante también puede cambiarlo en su página.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documentos', function (Blueprint $t) {
            $t->string('idioma', 2)->default('es')->after('certificado_evidencias');
        });
    }

    public function down(): void
    {
        Schema::table('documentos', fn (Blueprint $t) => $t->dropColumn('idioma'));
    }
};
