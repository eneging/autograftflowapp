<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perfil: el avatar de cada usuario (un código como «f2-p1-h3-c0-a4-e0», ver Perfiles::AVATAR), los datos de facturación
 * de la cuenta (JSON: boleta o factura) y, en cada pago, la copia de esos datos con la que se emitió su comprobante
 * (para que el comprobante no cambie aunque luego se editen los datos).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->string('avatar', 40)->nullable());
        Schema::table('cuentas', fn (Blueprint $t) => $t->text('facturacion')->nullable());
        Schema::table('pagos', function (Blueprint $t) {
            $t->text('comprobante')->nullable();
            $t->dateTime('comprobante_en')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('pagos', fn (Blueprint $t) => $t->dropColumn(['comprobante', 'comprobante_en']));
        Schema::table('cuentas', fn (Blueprint $t) => $t->dropColumn('facturacion'));
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('avatar'));
    }
};
