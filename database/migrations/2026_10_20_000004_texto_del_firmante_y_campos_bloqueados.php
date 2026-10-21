<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Texto del firmante y campos bloqueados (prototipo v43):
 * - firmantes.modo_texto: «solo» (solo firma, sella o pone huella), «asignados» (llena los campos de texto que se le asignan)
 *   o «libre» (además puede agregar texto libre sobre el documento).
 * - campos.bloqueado: campo del PDF que queda vacío y nadie puede llenar.
 * - campos.libre: texto que agregó el propio firmante al firmar.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('firmantes', function (Blueprint $t) {
            $t->string('modo_texto', 12)->default('asignados')->after('pedir_dni');
        });
        Schema::table('campos', function (Blueprint $t) {
            $t->boolean('bloqueado')->default(false)->after('obligatorio');
            $t->boolean('libre')->default(false)->after('bloqueado');
        });
    }

    public function down(): void
    {
        Schema::table('firmantes', fn (Blueprint $t) => $t->dropColumn('modo_texto'));
        Schema::table('campos', fn (Blueprint $t) => $t->dropColumn(['bloqueado', 'libre']));
    }
};
