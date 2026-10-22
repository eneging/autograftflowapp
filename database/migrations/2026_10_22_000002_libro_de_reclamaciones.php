<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('reclamacion_secuencia', function (Blueprint $t) {
            $t->unsignedInteger('id')->primary();
            $t->unsignedBigInteger('valor')->default(0);
        });
        DB::table('reclamacion_secuencia')->insert(['id' => 1, 'valor' => 0]);
        Schema::create('reclamaciones', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('numero')->unique();
            $t->uuid('solicitud_id')->unique();
            $t->string('token_hash', 64)->unique();
            $t->string('entrada_hash', 64);
            $t->json('datos');
            $t->json('proveedor');
            $t->dateTime('registrado_en');
            $t->date('vence_el')->index();
            $t->text('respuesta')->nullable();
            $t->dateTime('respuesta_redactada_en')->nullable();
            $t->dateTime('respondido_en')->nullable();
            $t->string('responsable', 150)->nullable();
            $t->string('constancia_postal', 500)->nullable();
        });
        Schema::create('reclamacion_correos', function (Blueprint $t) {
            $t->id();
            $t->foreignId('reclamacion_id')->constrained('reclamaciones');
            $t->string('tipo', 20);
            $t->string('destinatario', 254);
            $t->string('estado', 20)->default('pendiente')->index();
            $t->unsignedInteger('intentos')->default(0);
            $t->dateTime('enviado_en')->nullable();
            $t->timestamps();
            $t->unique(['reclamacion_id', 'tipo']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reclamacion_correos');
        Schema::dropIfExists('reclamaciones');
        Schema::dropIfExists('reclamacion_secuencia');
    }
};
