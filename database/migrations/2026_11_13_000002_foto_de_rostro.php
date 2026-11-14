<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Verificación con foto de rostro:
 *  - firmantes.pedir_rostro: el firmante debe tomarse una foto del rostro con la cámara al firmar.
 *  - firmantes.foto_rostro: referencia a esa foto (Cloudinary privado o disco); va en la hoja de evidencias del PDF,
 *    junto a las fotos del DNI si también se pidieron, para compararlas a simple vista.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('firmantes', function (Blueprint $t) {
            $t->boolean('pedir_rostro')->default(false)->after('pedir_dni');
            $t->string('foto_rostro')->nullable()->after('dni_reverso');
        });
    }

    public function down(): void
    {
        Schema::table('firmantes', fn (Blueprint $t) => $t->dropColumn(['pedir_rostro', 'foto_rostro']));
    }
};
