<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cambios del prototipo v43 (versión final):
 * - documentos.flujo: el firmante llena primero sus datos en un formulario guiado y después firma.
 * - documentos.certificado_evidencias: el certificado incluye la cronología de cada firmante con sus imágenes.
 * - firmantes.pedir_dni: la firma y la huella se toman con fotos del DNI (frente, firma en papel, reverso).
 * - firmantes.dni_frente / dni_reverso: referencias a esas fotos (Cloudinary privado o disco).
 * - firmantes.evidencias: JSON con los momentos de cada captura (según el dispositivo) y la ubicación si la autorizó.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documentos', function (Blueprint $t) {
            $t->boolean('flujo')->default(false)->after('bloquear_sello');
            $t->boolean('certificado_evidencias')->default(false)->after('flujo');
        });
        Schema::table('firmantes', function (Blueprint $t) {
            $t->boolean('pedir_dni')->default(false)->after('color');
            $t->string('dni_frente')->nullable()->after('motivo_rechazo');
            $t->string('dni_reverso')->nullable()->after('dni_frente');
            $t->text('evidencias')->nullable()->after('dni_reverso');
        });
    }

    public function down(): void
    {
        Schema::table('documentos', fn (Blueprint $t) => $t->dropColumn(['flujo', 'certificado_evidencias']));
        Schema::table('firmantes', fn (Blueprint $t) => $t->dropColumn(['pedir_dni', 'dni_frente', 'dni_reverso', 'evidencias']));
    }
};
