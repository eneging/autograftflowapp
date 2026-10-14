<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Cada cliente es una cuenta con su plan; una cuenta puede tener varios usuarios.
        Schema::create('cuentas', function (Blueprint $t) {
            $t->id();
            $t->string('nombre', 120);
            $t->string('plan', 30)->default('gratis');
            $t->dateTime('plan_vence')->nullable();
            $t->integer('creditos')->default(0);
            // Imagen del logo (id de Cloudinary o ruta local).
            $t->string('logo')->nullable();
            $t->timestamps();
        });

        Schema::table('users', function (Blueprint $t) {
            $t->foreignId('cuenta_id')->nullable()->after('id')->constrained('cuentas')->cascadeOnDelete();
        });

        Schema::create('documentos', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cuenta_id')->constrained('cuentas')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained('users');
            $t->string('nombre', 160);
            $t->enum('estado', ['borrador', 'en_firma', 'completado', 'rechazado', 'anulado'])->default('borrador');
            $t->boolean('es_plantilla')->default(false);
            $t->enum('orden', ['secuencial', 'paralelo'])->default('secuencial');
            $t->string('mensaje', 500)->default('');
            // PDF preparado (en disco), huella SHA-256 del archivo original y tamaño de cada página en puntos.
            $t->string('archivo');
            $t->char('sha256_original', 64);
            $t->text('paginas');
            $t->string('archivo_final')->nullable();
            $t->char('sha256_final', 64)->nullable()->index();
            $t->dateTime('enviado_en')->nullable();
            $t->dateTime('completado_en')->nullable();
            $t->timestamps();
            $t->index(['cuenta_id', 'created_at']);
            $t->index('sha256_original');
        });

        Schema::create('firmantes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('documento_id')->constrained('documentos')->cascadeOnDelete();
            $t->smallInteger('orden');
            $t->string('nombre', 120);
            $t->string('telefono', 30)->default('');
            $t->string('email', 160)->default('');
            $t->char('color', 7);
            $t->char('token', 32)->nullable()->unique();
            $t->enum('estado', ['pendiente', 'firmado', 'rechazado'])->default('pendiente');
            $t->dateTime('abierto_en')->nullable();
            $t->dateTime('firmado_en')->nullable();
            $t->string('ip', 64)->nullable();
            $t->string('agente', 300)->nullable();
            $t->string('motivo_rechazo', 500)->nullable();
            $t->index(['documento_id', 'orden']);
        });

        // Posición en puntos PDF desde la esquina superior izquierda de la página.
        Schema::create('campos', function (Blueprint $t) {
            $t->id();
            $t->foreignId('documento_id')->constrained('documentos')->cascadeOnDelete();
            $t->foreignId('firmante_id')->constrained('firmantes')->cascadeOnDelete();
            $t->enum('tipo', ['firma', 'texto', 'fecha', 'casilla', 'sello', 'huella']);
            $t->smallInteger('pagina');
            $t->double('x');
            $t->double('y');
            $t->double('w');
            $t->double('h');
            $t->string('etiqueta', 120)->default('');
            $t->boolean('obligatorio')->default(true);
            // Texto, fecha o «1»/«0»; las imágenes van a Cloudinary (o al disco) y aquí se guarda su id.
            $t->text('valor')->nullable();
            $t->string('imagen')->nullable();
        });

        // Registro de auditoría: todo lo que pasa con cada documento.
        Schema::create('eventos', function (Blueprint $t) {
            $t->id();
            $t->foreignId('documento_id')->constrained('documentos')->cascadeOnDelete();
            $t->foreignId('firmante_id')->nullable()->constrained('firmantes')->nullOnDelete();
            $t->string('tipo', 40);
            $t->string('detalle', 500)->default('');
            $t->string('ip', 64)->nullable();
            $t->string('agente', 300)->nullable();
            $t->dateTime('creado_en');
        });

        // Cada documento enviado gasta uno: del cupo mensual del plan o de los créditos de paquetes.
        Schema::create('consumos', function (Blueprint $t) {
            $t->unsignedBigInteger('documento_id')->primary();
            $t->foreignId('cuenta_id')->constrained('cuentas')->cascadeOnDelete();
            $t->enum('origen', ['plan', 'credito']);
            $t->dateTime('creado_en');
            $t->index(['cuenta_id', 'creado_en']);
        });

        Schema::create('pagos', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cuenta_id')->constrained('cuentas')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained('users');
            $t->string('producto', 40);
            $t->string('titulo', 160);
            $t->decimal('monto', 10, 2);
            $t->char('moneda', 3);
            $t->enum('estado', ['pendiente', 'aprobado', 'rechazado', 'cancelado'])->default('pendiente');
            // «mercadopago» o «manual» (activado desde el panel de administración).
            $t->string('medio', 20)->default('mercadopago');
            $t->string('mp_preferencia', 80)->nullable();
            $t->string('mp_pago_id', 40)->nullable();
            $t->dateTime('aplicado_en')->nullable();
            $t->timestamps();
        });

        // Plantilla «Solicitud de reembolso»: Firmante 1 (solicitante) y Firmante 2 (aprobador).
        Schema::create('solicitudes', function (Blueprint $t) {
            $t->id();
            $t->string('numero_factura', 20)->unique();
            $t->char('token_solicitante', 32)->unique();
            $t->char('token_aprobador', 32)->unique();
            $t->enum('estado', ['pendiente', 'aprobada', 'rechazada'])->default('pendiente');
            $t->string('nombre', 120);
            $t->string('estaca', 120);
            $t->string('barrio', 120);
            $t->string('telefono', 30);
            $t->bigInteger('total_centavos');
            $t->longText('datos');
            $t->string('firma_solicitante');
            $t->dateTime('firmado_en');
            $t->string('aprobador_nombre', 120)->nullable();
            $t->string('firma_aprobador')->nullable();
            $t->dateTime('decidido_en')->nullable();
            $t->string('motivo_rechazo', 500)->nullable();
            $t->timestamps();
            $t->index(['estado', 'created_at']);
        });
    }

    public function down(): void
    {
        foreach (['solicitudes', 'pagos', 'consumos', 'eventos', 'campos', 'firmantes', 'documentos'] as $tabla) {
            Schema::dropIfExists($tabla);
        }
        Schema::table('users', fn (Blueprint $t) => $t->dropConstrainedForeignId('cuenta_id'));
        Schema::dropIfExists('cuentas');
    }
};
