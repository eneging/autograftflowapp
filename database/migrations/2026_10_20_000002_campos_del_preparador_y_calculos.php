<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Campos del PDF (prototipo v43):
 * - campos.firmante_id puede ser nulo: el campo lo llena quien prepara el documento (su valor queda guardado al enviar)
 *   o lo calcula el propio PDF (tipo «calculo»).
 * - campos.tipo pasa a texto corto para admitir «calculo».
 * - campos.nombre_pdf: nombre del campo en el formulario del PDF, para que sus cálculos encuentren cada valor.
 * - documentos.formulario: JSON con los campos y los scripts de cálculo del PDF, que el navegador ejecuta en el
 *   entorno aislado de pdf.js.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('campos', function (Blueprint $t) {
            $t->unsignedBigInteger('firmante_id')->nullable()->change();
            $t->string('tipo', 20)->change();
            $t->string('nombre_pdf', 200)->nullable()->after('etiqueta');
        });
        Schema::table('documentos', function (Blueprint $t) {
            $t->longText('formulario')->nullable()->after('paginas');
        });
    }

    public function down(): void
    {
        Schema::table('documentos', fn (Blueprint $t) => $t->dropColumn('formulario'));
        Schema::table('campos', fn (Blueprint $t) => $t->dropColumn('nombre_pdf'));
    }
};
