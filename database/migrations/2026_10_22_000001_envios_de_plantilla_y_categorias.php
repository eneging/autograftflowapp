<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * - documentos.plantilla_id: de qué plantilla salió el documento («Usar esta plantilla» o «Enviar a varios»), para ver
 *   en la plantilla el historial de envíos. Si se elimina la plantilla, los documentos quedan (sin vínculo).
 * - contactos.categoria: grupo del contacto en el Directorio (p. ej. «Docentes»), para elegir a todo el grupo al enviar.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('documentos', function (Blueprint $t) {
            $t->foreignId('plantilla_id')->nullable()->after('es_plantilla')->constrained('documentos')->nullOnDelete();
        });
        Schema::table('contactos', function (Blueprint $t) {
            $t->string('categoria', 60)->default('')->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('documentos', function (Blueprint $t) {
            $t->dropConstrainedForeignId('plantilla_id');
        });
        Schema::table('contactos', fn (Blueprint $t) => $t->dropColumn('categoria'));
    }
};
