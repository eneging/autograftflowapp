<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->string('guia_estado', 12)->default('pendiente');
            $t->unsignedTinyInteger('guia_paso')->default(1);
            // Sin FK: borrar un documento no debe borrar la preferencia del usuario.
            $t->unsignedBigInteger('guia_documento_id')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn(['guia_estado', 'guia_paso', 'guia_documento_id']));
    }
};
