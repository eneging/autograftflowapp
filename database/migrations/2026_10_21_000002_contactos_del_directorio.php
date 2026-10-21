<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Contactos creados a mano en el Directorio (nombre, WhatsApp y correo), además de los que se
 * arman solos con las personas a las que la cuenta ya envió documentos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contactos', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cuenta_id')->constrained('cuentas')->cascadeOnDelete();
            $t->string('nombre', 120);
            $t->string('telefono', 30)->default('');
            $t->string('email', 160)->default('');
            $t->timestamps();
            $t->index(['cuenta_id', 'nombre']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contactos');
    }
};
