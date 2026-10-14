<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - cuentas.codigo_equipo: código para unirse a la organización (plan Empresarial, hasta 5 usuarios).
 * - documentos.bloquear_dibujo / bloquear_sello: el firmante debe fotografiar o subir su firma o su sello real.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cuentas', function (Blueprint $t) {
            $t->string('codigo_equipo', 20)->nullable()->unique()->after('logo');
        });
        Schema::table('documentos', function (Blueprint $t) {
            $t->boolean('bloquear_dibujo')->default(false)->after('es_plantilla');
            $t->boolean('bloquear_sello')->default(false)->after('bloquear_dibujo');
        });
        // Los planes «basico» y «pro» ya no existen: pasan al Profesional con la misma fecha de vencimiento.
        DB::table('cuentas')->whereIn('plan', ['basico', 'pro'])->update(['plan' => 'profesional']);
    }

    public function down(): void
    {
        Schema::table('cuentas', fn (Blueprint $t) => $t->dropColumn('codigo_equipo'));
        Schema::table('documentos', fn (Blueprint $t) => $t->dropColumn(['bloquear_dibujo', 'bloquear_sello']));
    }
};
