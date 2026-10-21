<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Los campos de texto, fecha y casilla de los firmantes pasan a ser opcionales por defecto: quien prepara el documento
 * marca los obligatorios con «✱ Marcar campos obligatorios». Antes nacían obligatorios, así que en los borradores y
 * plantillas (aún no enviados) se dejan opcionales. Los documentos ya enviados no cambian.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('campos')
            ->whereIn('tipo', ['texto', 'fecha', 'casilla'])
            ->whereIn('documento_id', DB::table('documentos')->where('estado', 'borrador')->select('id'))
            ->update(['obligatorio' => false]);
    }

    public function down(): void
    {
        // No se puede saber cuáles eran obligatorios a propósito.
    }
};
