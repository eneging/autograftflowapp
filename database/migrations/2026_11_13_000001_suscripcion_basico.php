<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Plan Básico como suscripción mensual de Mercado Pago (preapproval), con 7 días de prueba la primera vez.
 *  - estado: pendiente (aún no ingresó la tarjeta), activa, cancelada o rechazada (por ejemplo, la prueba ya se usó).
 *  - prueba_hasta: fin de la prueba gratuita; si tiene valor, esa prueba cuenta como usada (por cuenta, correo y pagador de MP).
 *  - identidad: correo normalizado del titular (variantes de Gmail incluidas), para no repetir la prueba con otra cuenta.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('suscripciones', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cuenta_id')->constrained('cuentas')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained('users');
            $t->string('producto', 40);
            $t->decimal('monto', 10, 2);
            $t->char('moneda', 3);
            $t->string('estado', 20)->default('pendiente');
            $t->string('motivo', 40)->nullable();
            $t->boolean('con_prueba')->default(false);
            $t->dateTime('prueba_hasta')->nullable();
            $t->string('identidad', 190);
            $t->string('mp_preapproval_id', 80)->nullable()->unique();
            $t->string('mp_payer_id', 40)->nullable()->index();
            $t->dateTime('proximo_cobro')->nullable();
            $t->dateTime('cancelada_en')->nullable();
            $t->timestamps();
            $t->index(['cuenta_id', 'estado']);
            $t->index('identidad');
        });
        // Cada cobro mensual aprobado queda en «pagos» (medio «suscripcion») con su comprobante, como los demás.
        Schema::table('pagos', fn (Blueprint $t) => $t->foreignId('suscripcion_id')->nullable()->constrained('suscripciones')->nullOnDelete());
    }

    public function down(): void
    {
        Schema::table('pagos', function (Blueprint $t) {
            $t->dropConstrainedForeignId('suscripcion_id');
        });
        Schema::dropIfExists('suscripciones');
    }
};
