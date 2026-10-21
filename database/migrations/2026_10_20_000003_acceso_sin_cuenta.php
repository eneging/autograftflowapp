<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Acceso «sin cuenta» (prototipo v43): una cuenta de invitado por navegador, con las reglas de Gratis y 1 firmante.
 * - cuentas.invitado: la cuenta no tiene correo ni contraseña reales; al crear la cuenta se convierte en una normal.
 * - users.terminos_aceptados_en: última vez que aceptó Términos y Privacidad (el invitado, en cada entrada).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cuentas', function (Blueprint $t) {
            $t->boolean('invitado')->default(false)->after('nombre');
        });
        Schema::table('users', function (Blueprint $t) {
            $t->dateTime('terminos_aceptados_en')->nullable()->after('password');
        });
    }

    public function down(): void
    {
        Schema::table('cuentas', fn (Blueprint $t) => $t->dropColumn('invitado'));
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('terminos_aceptados_en'));
    }
};
