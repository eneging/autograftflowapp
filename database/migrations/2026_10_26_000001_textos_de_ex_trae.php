<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * EX-Trae (Flow Tools): textos leídos de una foto en un dispositivo (p. ej. el celular) que llegan a los demás
 * dispositivos con la misma cuenta (p. ej. el ordenador). Se guardan los últimos de cada usuario.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ex_trae_textos', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $t->mediumText('texto');
            $t->text('datos')->nullable(); // datos del comprobante (JSON), si la foto era una boleta o factura
            $t->string('origen', 60)->default('');
            $t->timestamp('created_at')->nullable();
            $t->index(['user_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ex_trae_textos');
    }
};
