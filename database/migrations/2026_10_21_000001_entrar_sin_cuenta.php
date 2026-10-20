<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * «Entrar sin cuenta» (prototipo v43):
 * - cuentas.invitado: cuenta temporal de quien entra sin registrarse (plan Gratis, 1 firmante por documento).
 * - cuentas.ip_invitado: IP desde la que entró; el cupo diario de 2 documentos se cuenta por IP entre todas las
 *   entradas sin cuenta, para que no se renueve borrando las cookies.
 * - users.terminos_aceptados_en: cuándo aceptó los Términos y Condiciones y la Política de Privacidad (al crear la
 *   cuenta, o cada vez que entra sin cuenta).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cuentas', function (Blueprint $t) {
            $t->boolean('invitado')->default(false)->after('nombre');
            $t->string('ip_invitado', 64)->nullable()->after('invitado');
            $t->index(['invitado', 'ip_invitado']);
        });
        Schema::table('users', function (Blueprint $t) {
            $t->dateTime('terminos_aceptados_en')->nullable()->after('password');
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('terminos_aceptados_en'));
        Schema::table('cuentas', function (Blueprint $t) {
            $t->dropIndex(['invitado', 'ip_invitado']);
            $t->dropColumn(['invitado', 'ip_invitado']);
        });
    }
};
