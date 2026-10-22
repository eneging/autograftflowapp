<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('cuentas', function (Blueprint $t) {
            $t->string('codigo_referido', 20)->nullable()->unique();
        });
        Schema::create('referidos', function (Blueprint $t) {
            $t->id();
            $t->foreignId('referidor_id')->constrained('cuentas');
            $t->foreignId('referido_id')->unique()->constrained('cuentas');
            $t->json('reglas');
            $t->string('codigo', 20);
            $t->foreignId('pago_id')->nullable()->unique()->constrained('pagos');
            $t->string('estado', 20)->default('registrado');
            $t->unsignedInteger('documentos')->default(0);
            $t->unsignedInteger('restantes')->default(0);
            $t->dateTime('liberar_en')->nullable()->index();
            $t->dateTime('acreditado_en')->nullable();
            $t->dateTime('vence_en')->nullable();
            $t->string('motivo', 200)->nullable();
            $t->timestamps();
            $t->index(['referidor_id', 'estado', 'vence_en']);
        });
        Schema::table('consumos', function (Blueprint $t) {
            // Se conserva el origen de los consumos históricos; los bonos quedan separados de créditos comprados.
            $t->string('origen', 20)->change();
            $t->foreignId('referido_bono_id')->nullable()->constrained('referidos');
        });
    }

    public function down(): void
    {
        Schema::table('consumos', function (Blueprint $t) { $t->dropConstrainedForeignId('referido_bono_id'); });
        Schema::dropIfExists('referidos');
        Schema::table('cuentas', function (Blueprint $t) { $t->dropUnique(['codigo_referido']); $t->dropColumn('codigo_referido'); });
        // No se vuelve a enum: pueden existir consumos de tipo referido.
    }
};
