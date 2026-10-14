<?php

namespace App\Servicios;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use setasign\Fpdi\PdfParser\StreamReader;
use setasign\Fpdi\Tcpdf\Fpdi;

/** Plataforma AutograFlow: documentos, firmantes, campos, firma y PDF final con certificado. */
class Documentos
{
    public const TIPOS = ['firma', 'texto', 'fecha', 'casilla', 'sello', 'huella'];
    public const TIPOS_IMAGEN = ['firma', 'sello', 'huella'];
    public const COLORES = ['#4d148c', '#ff6200', '#0e9f6e', '#2563eb', '#c026d3', '#b45309', '#0891b2', '#be123c'];
    private const ETIQUETA = ['firma' => 'firma', 'texto' => 'texto', 'fecha' => 'fecha', 'casilla' => 'casilla', 'sello' => 'sello', 'huella' => 'huella'];

    private static function disco()
    {
        return Storage::disk('local');
    }

    public static function evento(int $documentoId, string $tipo, string $detalle, ?array $origen = null, ?int $firmanteId = null): void
    {
        DB::table('eventos')->insert([
            'documento_id' => $documentoId, 'firmante_id' => $firmanteId, 'tipo' => $tipo, 'detalle' => Str::limit($detalle, 497),
            'ip' => $origen['ip'] ?? null, 'agente' => isset($origen['agente']) ? Str::limit($origen['agente'], 297) : null, 'creado_en' => now(),
        ]);
    }

    // ---------------------------------------------------------------- dueño del documento

    /**
     * Guarda un PDF subido. La página ya lo preparó (enderezó las páginas y lo guardó sin «object streams»
     * para que FPDI pueda leerlo); aquí se comprueba que se pueda leer y se toman sus medidas reales.
     */
    public static function crear(User $u, string $nombre, string $original, string $preparado, array $detectados, array $origen): array
    {
        foreach ([$original, $preparado] as $pdf) {
            if (! str_starts_with($pdf, '%PDF-')) {
                throw new ErrorUso('El archivo no es un PDF');
            }
        }
        try {
            $lector = new Fpdi('P', 'pt'); // medidas en puntos PDF, como las coordenadas de los campos
            $n = $lector->setSourceFile(StreamReader::createByString($preparado));
            $paginas = [];
            for ($i = 1; $i <= $n; $i++) {
                $t = $lector->getTemplateSize($lector->importPage($i));
                $paginas[] = ['ancho' => round($t['width'], 3), 'alto' => round($t['height'], 3)];
            }
        } catch (\Throwable) {
            throw new ErrorUso('No se pudo leer el PDF. Si está protegido con contraseña, quita la protección y vuelve a subirlo.');
        }
        if (! $paginas) {
            throw new ErrorUso('El PDF no tiene páginas.');
        }
        if (count($paginas) > config('autograflow.limites.paginas')) {
            throw new ErrorUso('El PDF tiene más de '.config('autograflow.limites.paginas').' páginas.');
        }

        // Campos detectados en el PDF (texto, casillas, firmas): son sugerencias, se validan y se recortan a la página.
        $campos = [];
        foreach (array_slice($detectados, 0, config('autograflow.limites.campos')) as $c) {
            $p = $paginas[(int) ($c['pagina'] ?? 0) - 1] ?? null;
            if (! $p || ! in_array($c['tipo'] ?? '', self::TIPOS, true)) {
                continue;
            }
            $campos[] = self::recortar(['tipo' => $c['tipo'], 'pagina' => (int) $c['pagina'], 'x' => (float) $c['x'], 'y' => (float) $c['y'],
                'w' => (float) $c['w'], 'h' => (float) $c['h'], 'etiqueta' => Str::limit((string) ($c['etiqueta'] ?? ''), 117)], $p);
        }

        $id = DB::transaction(function () use ($u, $nombre, $original, $preparado, $paginas, $campos, $origen) {
            $id = DB::table('documentos')->insertGetId([
                'cuenta_id' => $u->cuenta_id, 'user_id' => $u->id, 'nombre' => Str::limit($nombre, 157), 'archivo' => '',
                'sha256_original' => hash('sha256', $original), 'paginas' => json_encode($paginas), 'created_at' => now(), 'updated_at' => now(),
            ]);
            $ruta = "documentos/{$id}/original.pdf";
            self::disco()->put($ruta, $preparado);
            DB::table('documentos')->where('id', $id)->update(['archivo' => $ruta]);
            $f = DB::table('firmantes')->insertGetId(['documento_id' => $id, 'orden' => 1, 'nombre' => 'Firmante 1', 'color' => self::COLORES[0]]);
            foreach ($campos as $c) {
                DB::table('campos')->insert($c + ['documento_id' => $id, 'firmante_id' => $f, 'obligatorio' => $c['tipo'] === 'firma']);
            }
            self::evento($id, 'creado', "Documento creado por {$u->name} ({$u->email})", $origen);
            return $id;
        });
        return ['id' => $id, 'camposDetectados' => count($campos)];
    }

    private static function recortar(array $c, array $p): array
    {
        $c['w'] = min(max($c['w'], 6), $p['ancho']);
        $c['h'] = min(max($c['h'], 6), $p['alto']);
        $c['x'] = min(max(0, $c['x']), $p['ancho'] - $c['w']);
        $c['y'] = min(max(0, $c['y']), $p['alto'] - $c['h']);
        return $c;
    }

    public static function documentoDe(int $cuentaId, int $id): object
    {
        return DB::table('documentos')->where('id', $id)->where('cuenta_id', $cuentaId)->first() ?? throw new ErrorUso('Documento no encontrado', 404);
    }

    public static function listar(int $cuentaId): array
    {
        return DB::table('documentos as d')->leftJoin('firmantes as f', 'f.documento_id', '=', 'd.id')
            ->where('d.cuenta_id', $cuentaId)
            ->groupBy('d.id', 'd.nombre', 'd.estado', 'd.es_plantilla', 'd.created_at', 'd.enviado_en', 'd.completado_en')
            ->orderByDesc('d.id')->limit(500)
            ->get(['d.id', 'd.nombre', 'd.estado', 'd.es_plantilla', 'd.created_at', 'd.enviado_en', 'd.completado_en',
                DB::raw('COUNT(f.id) as firmantes'), DB::raw("SUM(CASE WHEN f.estado = 'firmado' THEN 1 ELSE 0 END) as firmados")])
            ->map(fn ($f) => [
                'id' => $f->id, 'nombre' => $f->nombre, 'estado' => $f->estado, 'creadoEn' => Fechas::iso($f->created_at),
                'enviadoEn' => Fechas::iso($f->enviado_en), 'completadoEn' => Fechas::iso($f->completado_en),
                'firmantes' => (int) $f->firmantes, 'firmados' => (int) $f->firmados, 'esPlantilla' => (bool) $f->es_plantilla,
            ])->all();
    }

    public static function detalle(int $cuentaId, int $id): array
    {
        $d = self::documentoDe($cuentaId, $id);
        if ($d->estado === 'en_firma' && ! DB::table('firmantes')->where('documento_id', $id)->where('estado', '<>', 'firmado')->exists()) {
            self::completarSinFallar($id);
            $d = self::documentoDe($cuentaId, $id);
        }
        $clave = fn ($fid) => "f{$fid}";
        return [
            'id' => $d->id, 'nombre' => $d->nombre, 'estado' => $d->estado, 'esPlantilla' => (bool) $d->es_plantilla, 'orden' => $d->orden,
            'bloquearDibujo' => (bool) $d->bloquear_dibujo, 'bloquearSello' => (bool) $d->bloquear_sello,
            'mensaje' => $d->mensaje, 'paginas' => json_decode($d->paginas, true), 'sha256Original' => $d->sha256_original, 'sha256Final' => $d->sha256_final,
            'creadoEn' => Fechas::iso($d->created_at), 'enviadoEn' => Fechas::iso($d->enviado_en), 'completadoEn' => Fechas::iso($d->completado_en),
            'firmantes' => DB::table('firmantes')->where('documento_id', $id)->orderBy('orden')->get()->map(fn ($f) => [
                'id' => $f->id, 'clave' => $clave($f->id), 'orden' => $f->orden, 'nombre' => $f->nombre, 'telefono' => $f->telefono, 'email' => $f->email,
                'color' => $f->color, 'token' => $f->token, 'estado' => $f->estado, 'abiertoEn' => Fechas::iso($f->abierto_en),
                'firmadoEn' => Fechas::iso($f->firmado_en), 'motivoRechazo' => $f->motivo_rechazo,
            ])->all(),
            'campos' => DB::table('campos')->where('documento_id', $id)->orderBy('id')->get()->map(fn ($c) => [
                'id' => $c->id, 'firmante' => $clave($c->firmante_id), 'tipo' => $c->tipo, 'pagina' => $c->pagina,
                'x' => (float) $c->x, 'y' => (float) $c->y, 'w' => (float) $c->w, 'h' => (float) $c->h,
                'etiqueta' => $c->etiqueta, 'obligatorio' => (bool) $c->obligatorio, 'lleno' => (bool) ($c->imagen || ($c->valor !== null && $c->valor !== '' && $c->valor !== '0')),
            ])->all(),
            'eventos' => DB::table('eventos as e')->leftJoin('firmantes as f', 'f.id', '=', 'e.firmante_id')->where('e.documento_id', $id)->orderBy('e.id')
                ->get(['e.tipo', 'e.detalle', 'e.creado_en', 'f.nombre as firmante'])
                ->map(fn ($e) => ['tipo' => $e->tipo, 'detalle' => $e->detalle, 'firmante' => $e->firmante, 'creadoEn' => Fechas::iso($e->creado_en)])->all(),
        ];
    }

    /** Lo hecho en el editor (solo en borrador): reemplaza firmantes y campos. */
    public static function guardar(int $cuentaId, int $id, array $datos): void
    {
        $d = self::documentoDe($cuentaId, $id);
        if ($d->estado !== 'borrador') {
            throw new ErrorUso('El documento ya fue enviado y no se puede modificar', 409);
        }
        $paginas = json_decode($d->paginas, true);
        $claves = array_column($datos['firmantes'], 'clave');
        if (count(array_unique($claves)) !== count($claves)) {
            throw new ErrorUso('Hay firmantes repetidos');
        }
        foreach ($datos['campos'] as &$c) {
            if (! in_array($c['firmante'], $claves, true)) {
                throw new ErrorUso('Hay un campo asignado a un firmante que no existe');
            }
            $p = $paginas[$c['pagina'] - 1] ?? throw new ErrorUso('Hay un campo en una página que no existe');
            $c = self::recortar($c, $p);
        }
        unset($c);
        DB::transaction(function () use ($id, $datos) {
            DB::table('documentos')->where('id', $id)->update(['nombre' => $datos['nombre'], 'orden' => $datos['orden'], 'mensaje' => $datos['mensaje'],
                'bloquear_dibujo' => $datos['bloquearDibujo'] ?? false, 'bloquear_sello' => $datos['bloquearSello'] ?? false, 'updated_at' => now()]);
            DB::table('campos')->where('documento_id', $id)->delete();
            DB::table('firmantes')->where('documento_id', $id)->delete();
            $ids = [];
            foreach ($datos['firmantes'] as $i => $f) {
                $ids[$f['clave']] = DB::table('firmantes')->insertGetId([
                    'documento_id' => $id, 'orden' => $i + 1, 'nombre' => $f['nombre'], 'telefono' => $f['telefono'], 'email' => $f['email'],
                    'color' => self::COLORES[$i % count(self::COLORES)],
                ]);
            }
            foreach ($datos['campos'] as $c) {
                DB::table('campos')->insert([
                    'documento_id' => $id, 'firmante_id' => $ids[$c['firmante']], 'tipo' => $c['tipo'], 'pagina' => $c['pagina'],
                    'x' => $c['x'], 'y' => $c['y'], 'w' => $c['w'], 'h' => $c['h'], 'etiqueta' => $c['etiqueta'], 'obligatorio' => $c['obligatorio'],
                ]);
            }
        });
    }

    /** Envía a firmar: descuenta un documento del plan y crea el enlace de cada firmante. */
    public static function enviar(User $u, int $id, array $origen): void
    {
        $det = self::detalle($u->cuenta_id, $id);
        if ($det['estado'] !== 'borrador') {
            throw new ErrorUso('El documento ya fue enviado', 409);
        }
        if ($det['esPlantilla']) {
            throw new ErrorUso('Es una plantilla: usa «Usar plantilla» para crear un documento nuevo y enviarlo', 409);
        }
        if (! $det['firmantes']) {
            throw new ErrorUso('Agrega al menos un firmante');
        }
        $sinCampos = array_filter($det['firmantes'], fn ($f) => ! array_filter($det['campos'], fn ($c) => $c['firmante'] === $f['clave']));
        if ($sinCampos) {
            throw new ErrorUso(implode(', ', array_column($sinCampos, 'nombre')).' no tiene campos para llenar o firmar');
        }
        DB::transaction(function () use ($u, $id, $det, $origen) {
            Planes::consumirEnvio($u->cuenta_id, $id, count($det['firmantes']), array_column($det['campos'], 'tipo'));
            foreach ($det['firmantes'] as $f) {
                DB::table('firmantes')->where('id', $f['id'])->update(['token' => Str::random(32)]);
            }
            DB::table('documentos')->where('id', $id)->update(['estado' => 'en_firma', 'enviado_en' => now(), 'updated_at' => now()]);
            self::evento($id, 'enviado', 'Enviado a firmar a '.implode(', ', array_column($det['firmantes'], 'nombre')).' ('.($det['orden'] === 'secuencial' ? 'en orden' : 'en paralelo').')', $origen);
        });
        // Aviso por correo: a todos si firman a la vez, o solo al primero si firman en orden.
        self::despues(fn () => Avisos::turno($id, $det['orden'] === 'paralelo' ? 'todos' : 'siguiente'));
    }

    /** Reenvía por correo la invitación a un firmante pendiente (como máximo una vez cada 10 minutos). */
    public static function recordar(int $cuentaId, int $id, int $firmanteId): void
    {
        $d = self::documentoDe($cuentaId, $id);
        if ($d->estado !== 'en_firma') {
            throw new ErrorUso('El documento ya no está en firma', 409);
        }
        $f = DB::table('firmantes')->where('id', $firmanteId)->where('documento_id', $id)->first() ?? throw new ErrorUso('Firmante no encontrado', 404);
        if ($f->estado !== 'pendiente') {
            throw new ErrorUso("{$f->nombre} ya respondió", 409);
        }
        if (! $f->email) {
            throw new ErrorUso("{$f->nombre} no tiene correo: envíale el enlace por WhatsApp");
        }
        if ($d->orden === 'secuencial' && DB::table('firmantes')->where('documento_id', $id)->where('orden', '<', $f->orden)->where('estado', '<>', 'firmado')->exists()) {
            throw new ErrorUso("Todavía no es el turno de {$f->nombre}", 409);
        }
        if (! \Illuminate\Support\Facades\Cache::add("recordar:{$f->id}", true, now()->addMinutes(10))) {
            throw new ErrorUso('Ya le enviaste un recordatorio hace poco. Espera unos minutos.', 429);
        }
        if (! Avisos::recordar($id, $f->id)) {
            \Illuminate\Support\Facades\Cache::forget("recordar:{$f->id}");
            throw new ErrorUso('No se pudo enviar el correo. Revisa la configuración de correo del servidor.', 502);
        }
    }

    public static function marcarPlantilla(int $cuentaId, int $id, bool $es): void
    {
        if (self::documentoDe($cuentaId, $id)->estado !== 'borrador') {
            throw new ErrorUso('Solo un borrador puede ser plantilla', 409);
        }
        DB::table('documentos')->where('id', $id)->update(['es_plantilla' => $es]);
    }

    /** Borrador nuevo con el mismo PDF, firmantes (sin contactos si es plantilla) y campos. */
    public static function duplicar(User $u, int $id, array $origen): array
    {
        $d = self::documentoDe($u->cuenta_id, $id);
        $det = self::detalle($u->cuenta_id, $id);
        $nuevo = DB::transaction(function () use ($u, $d, $det, $origen) {
            $nuevo = DB::table('documentos')->insertGetId([
                'cuenta_id' => $u->cuenta_id, 'user_id' => $u->id, 'nombre' => $d->nombre, 'orden' => $d->orden, 'mensaje' => $d->mensaje,
                'bloquear_dibujo' => $d->bloquear_dibujo, 'bloquear_sello' => $d->bloquear_sello,
                'archivo' => '', 'sha256_original' => $d->sha256_original, 'paginas' => $d->paginas, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $ruta = "documentos/{$nuevo}/original.pdf";
            self::disco()->put($ruta, self::disco()->get($d->archivo));
            DB::table('documentos')->where('id', $nuevo)->update(['archivo' => $ruta]);
            $ids = [];
            foreach ($det['firmantes'] as $f) {
                $ids[$f['clave']] = DB::table('firmantes')->insertGetId([
                    'documento_id' => $nuevo, 'orden' => $f['orden'], 'nombre' => $f['nombre'], 'color' => $f['color'],
                    'telefono' => $det['esPlantilla'] ? '' : $f['telefono'], 'email' => $det['esPlantilla'] ? '' : $f['email'],
                ]);
            }
            foreach ($det['campos'] as $c) {
                DB::table('campos')->insert([
                    'documento_id' => $nuevo, 'firmante_id' => $ids[$c['firmante']], 'tipo' => $c['tipo'], 'pagina' => $c['pagina'],
                    'x' => $c['x'], 'y' => $c['y'], 'w' => $c['w'], 'h' => $c['h'], 'etiqueta' => $c['etiqueta'], 'obligatorio' => $c['obligatorio'],
                ]);
            }
            self::evento($nuevo, 'creado', "Creado por {$u->name} a partir de «{$d->nombre}»".($det['esPlantilla'] ? ' (plantilla)' : ''), $origen);
            return $nuevo;
        });
        return ['id' => $nuevo];
    }

    public static function eliminar(User $u, int $id, array $origen): string
    {
        $d = self::documentoDe($u->cuenta_id, $id);
        if ($d->estado === 'borrador') {
            DB::table('documentos')->where('id', $id)->delete();
            self::disco()->deleteDirectory("documentos/{$id}");
            return 'eliminado';
        }
        if ($d->estado !== 'en_firma') {
            throw new ErrorUso('Solo se pueden anular documentos que siguen en firma', 409);
        }
        DB::table('documentos')->where('id', $id)->update(['estado' => 'anulado']);
        self::evento($id, 'anulado', "Anulado por {$u->name}", $origen);
        return 'anulado';
    }

    public static function archivo(object $d, string $cual): string
    {
        $ruta = $cual === 'final' ? $d->archivo_final : $d->archivo;
        if (! $ruta) {
            throw new ErrorUso('El documento firmado todavía no está listo', 404);
        }
        return self::disco()->get($ruta);
    }

    public static function imagenCampo(int $documentoId, int $campoId): string
    {
        $ref = DB::table('campos')->where('id', $campoId)->where('documento_id', $documentoId)->value('imagen') ?? throw new ErrorUso('Imagen no encontrada', 404);
        return Imagenes::leer($ref);
    }

    /**
     * Directorio: las personas a las que la cuenta ya envió documentos (sin repetir), para completar
     * nombre, WhatsApp y correo al preparar uno nuevo.
     */
    public static function contactos(int $cuentaId): array
    {
        $vistos = [];
        $filas = DB::table('firmantes as f')->join('documentos as d', 'd.id', '=', 'f.documento_id')->where('d.cuenta_id', $cuentaId)
            ->orderByDesc('f.id')->limit(3000)->get(['f.nombre', 'f.telefono', 'f.email', 'f.firmado_en', 'd.created_at']);
        foreach ($filas as $f) {
            $nombre = trim($f->nombre);
            if (preg_match('/^Firmante \d+$/u', $nombre)) {
                continue;
            }
            $k = mb_strtolower(Str::ascii($nombre));
            $c = $vistos[$k] ?? ['nombre' => $nombre, 'telefono' => '', 'email' => '', 'documentos' => 0, 'firmados' => 0, 'ultimo' => Fechas::iso($f->created_at)];
            $c['telefono'] = $c['telefono'] ?: (string) $f->telefono;
            $c['email'] = $c['email'] ?: (string) $f->email;
            $c['documentos']++;
            $c['firmados'] += $f->firmado_en ? 1 : 0;
            $vistos[$k] = $c;
        }
        return array_values($vistos);
    }

    // ---------------------------------------------------------------- firmantes

    public static function firmantePorToken(string $t, bool $bloquear = false): object
    {
        if (! preg_match('/^[A-Za-z0-9_-]{32}$/', $t)) {
            throw new ErrorUso('Enlace no válido', 404);
        }
        $q = DB::table('firmantes as f')->join('documentos as d', 'd.id', '=', 'f.documento_id')->join('users as u', 'u.id', '=', 'd.user_id')
            ->join('cuentas as c', 'c.id', '=', 'd.cuenta_id')->where('f.token', $t)
            ->select('f.*', 'd.nombre as doc_nombre', 'd.estado as doc_estado', 'd.orden as doc_orden', 'd.mensaje as doc_mensaje',
                'd.paginas as doc_paginas', 'd.bloquear_dibujo', 'd.bloquear_sello', 'd.archivo', 'd.archivo_final', 'd.cuenta_id', 'u.name as remitente', 'c.nombre as empresa', 'c.logo as cuenta_logo');
        return ($bloquear ? $q->lockForUpdate() : $q)->first() ?? throw new ErrorUso('Enlace no válido', 404);
    }

    private static function turno(object $f): array
    {
        if ($f->doc_orden !== 'secuencial') {
            return [true, null];
        }
        $antes = DB::table('firmantes')->where('documento_id', $f->documento_id)->where('orden', '<', $f->orden)->where('estado', '<>', 'firmado')->orderBy('orden')->value('nombre');
        return [$antes === null, $antes];
    }

    public static function vista(string $t, array $origen): array
    {
        $f = self::firmantePorToken($t);
        if ($f->doc_estado === 'anulado') {
            throw new ErrorUso('Este documento fue anulado por quien lo envió', 410);
        }
        if (! $f->abierto_en) {
            if (DB::table('firmantes')->where('id', $f->id)->whereNull('abierto_en')->update(['abierto_en' => now()])) {
                self::evento($f->documento_id, 'abierto', 'Abrió el documento', $origen, $f->id);
            }
        }
        [$turno, $esperando] = self::turno($f);
        $firmantes = DB::table('firmantes')->where('documento_id', $f->documento_id)->orderBy('orden')->get();
        $colores = $firmantes->pluck('color', 'id');
        $siguiente = $f->doc_orden === 'secuencial' && $f->estado === 'firmado' ? $firmantes->first(fn ($x) => $x->orden > $f->orden && $x->estado === 'pendiente') : null;
        return [
            'documento' => [
                'nombre' => $f->doc_nombre, 'estado' => $f->doc_estado, 'mensaje' => $f->doc_mensaje, 'paginas' => json_decode($f->doc_paginas, true),
                'remitente' => $f->remitente, 'empresa' => $f->empresa, 'logo' => (bool) $f->cuenta_logo && ! Planes::esGratis($f->cuenta_id),
                'bloquearDibujo' => (bool) $f->bloquear_dibujo, 'bloquearSello' => (bool) $f->bloquear_sello,
            ],
            'yo' => ['orden' => $f->orden, 'nombre' => $f->nombre, 'estado' => $f->estado, 'color' => $f->color, 'total' => $firmantes->count()],
            'turno' => $turno, 'esperando' => $esperando,
            'campos' => DB::table('campos')->where('documento_id', $f->documento_id)
                ->where(fn ($q) => $q->where('firmante_id', $f->id)->orWhereNotNull('imagen')->orWhereNotNull('valor'))
                ->orderBy('pagina')->orderBy('y')->orderBy('x')->get()->map(fn ($c) => [
                    'id' => $c->id, 'tipo' => $c->tipo, 'pagina' => $c->pagina, 'x' => (float) $c->x, 'y' => (float) $c->y, 'w' => (float) $c->w, 'h' => (float) $c->h,
                    'etiqueta' => $c->etiqueta, 'obligatorio' => (bool) $c->obligatorio, 'mio' => $c->firmante_id === $f->id,
                    'valor' => $c->tipo === 'casilla' ? ($c->valor === null ? null : $c->valor === '1') : $c->valor,
                    'imagen' => (bool) $c->imagen, 'color' => $colores[$c->firmante_id] ?? '#4d148c',
                ])->all(),
            'siguiente' => $siguiente ? ['nombre' => $siguiente->nombre, 'telefono' => $siguiente->telefono, 'enlace' => $siguiente->token] : null,
        ];
    }

    /** Guarda lo que llenó un firmante; si era el último, genera el PDF final. */
    public static function firmar(string $t, array $valores, array $origen): array
    {
        $subidas = [];
        try {
            $resultado = DB::transaction(function () use ($t, $valores, $origen, &$subidas) {
                $f = self::firmantePorToken($t, true);
                if ($f->doc_estado !== 'en_firma') {
                    throw new ErrorUso('Este documento ya no se puede firmar', 409);
                }
                if ($f->estado !== 'pendiente') {
                    throw new ErrorUso('Ya firmaste este documento', 409);
                }
                [$turno, $esperando] = self::turno($f);
                if (! $turno) {
                    throw new ErrorUso("Todavía no es tu turno: falta que firme {$esperando}", 409);
                }
                $faltan = [];
                // La misma imagen usada en varios campos se sube una sola vez.
                $porImagen = [];
                foreach (DB::table('campos')->where('firmante_id', $f->id)->get() as $c) {
                    $v = $valores[(string) $c->id] ?? null;
                    $nombre = $c->etiqueta ?: self::ETIQUETA[$c->tipo];
                    if (in_array($c->tipo, self::TIPOS_IMAGEN, true)) {
                        if (is_string($v) && str_starts_with($v, 'data:image/')) {
                            $clave = sha1($v);
                            if (! isset($porImagen[$clave])) {
                                $bytes = Imagenes::desdeDataUrl($v, config('autograflow.limites.imagen_bytes'));
                                $subidas[] = $porImagen[$clave] = Imagenes::guardar($bytes, "documentos/{$f->documento_id}");
                            }
                            DB::table('campos')->where('id', $c->id)->update(['imagen' => $porImagen[$clave]]);
                        } elseif ($c->obligatorio) {
                            $faltan[$c->id] = "Falta: {$nombre}";
                        }
                    } elseif ($c->tipo === 'casilla') {
                        $marcado = $v === true;
                        if ($c->obligatorio && ! $marcado) {
                            $faltan[$c->id] = "Debes marcar: {$nombre}";
                        }
                        DB::table('campos')->where('id', $c->id)->update(['valor' => $marcado ? '1' : '0']);
                    } else {
                        $s = is_string($v) ? Str::limit(trim($v), config('autograflow.limites.texto'), '') : '';
                        if ($c->tipo === 'fecha' && $s !== '' && ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
                            $faltan[$c->id] = "Fecha inválida: {$nombre}";
                        }
                        if ($c->obligatorio && $s === '') {
                            $faltan[$c->id] = "Falta: {$nombre}";
                        }
                        DB::table('campos')->where('id', $c->id)->update(['valor' => $s === '' ? null : $s]);
                    }
                }
                if ($faltan) {
                    throw new ErrorUso('Completa los campos obligatorios', 400, $faltan);
                }
                DB::table('firmantes')->where('id', $f->id)->update([
                    'estado' => 'firmado', 'firmado_en' => now(), 'ip' => $origen['ip'], 'agente' => Str::limit((string) $origen['agente'], 297),
                ]);
                self::evento($f->documento_id, 'firmado', 'Firmó el documento', $origen, $f->id);
                $pendientes = DB::table('firmantes')->where('documento_id', $f->documento_id)->where('estado', '<>', 'firmado')->count();
                return ['documentoId' => $f->documento_id, 'completo' => $pendientes === 0];
            });
        } catch (\Throwable $e) {
            // Si no se pudo guardar, se borran las imágenes que ya se habían subido.
            foreach ($subidas as $ref) {
                rescue(fn () => Imagenes::borrar($ref), report: false);
            }
            throw $e;
        }
        if ($resultado['completo']) {
            self::completarSinFallar($resultado['documentoId']);
            self::despues(fn () => Avisos::completado($resultado['documentoId']));
        } else {
            self::despues(fn () => Avisos::turno($resultado['documentoId'], 'siguiente'));
        }
        return $resultado;
    }

    public static function rechazar(string $t, string $motivo, array $origen): void
    {
        $f = DB::transaction(function () use ($t, $motivo, $origen) {
            $f = self::firmantePorToken($t, true);
            if ($f->doc_estado !== 'en_firma' || $f->estado !== 'pendiente') {
                throw new ErrorUso('Este documento ya no se puede rechazar', 409);
            }
            DB::table('firmantes')->where('id', $f->id)->update([
                'estado' => 'rechazado', 'motivo_rechazo' => $motivo, 'firmado_en' => now(), 'ip' => $origen['ip'], 'agente' => Str::limit((string) $origen['agente'], 297),
            ]);
            DB::table('documentos')->where('id', $f->documento_id)->update(['estado' => 'rechazado']);
            self::evento($f->documento_id, 'rechazado', "Rechazó el documento: {$motivo}", $origen, $f->id);
            return $f;
        });
        self::despues(fn () => Avisos::dueno($f->documento_id, "{$f->nombre} rechazó «{$f->doc_nombre}»", ["Motivo: «{$motivo}»", 'El documento quedó rechazado y ya no se puede firmar.']));
    }

    /** Si falla la generación del PDF final, el documento queda «en firma» con todos firmados y se reintenta al consultarlo. */
    private static function completarSinFallar(int $id): void
    {
        try {
            self::completar($id);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** PDF final con todo lo firmado y el certificado de auditoría. */
    private static function completar(int $id): void
    {
        $d = DB::table('documentos as d')->join('users as u', 'u.id', '=', 'd.user_id')->join('cuentas as c', 'c.id', '=', 'd.cuenta_id')
            ->where('d.id', $id)->first(['d.*', 'u.name as u_nombre', 'u.email as u_email', 'c.logo as cuenta_logo']);
        $firmantes = DB::table('firmantes')->where('documento_id', $id)->orderBy('orden')->get();
        $campos = DB::table('campos')->where('documento_id', $id)->get();
        $imagenes = [];
        $leer = function (?string $ref) use (&$imagenes) {
            return $ref ? ($imagenes[$ref] ??= Imagenes::leer($ref)) : null;
        };
        $gratis = Planes::esGratis($d->cuenta_id);
        $completadoEn = now();
        $eventos = DB::table('eventos as e')->leftJoin('firmantes as f', 'f.id', '=', 'e.firmante_id')->where('e.documento_id', $id)->orderBy('e.id')
            ->get(['e.creado_en', 'e.detalle', 'e.ip', 'f.nombre as firmante'])
            ->map(fn ($e) => ['creadoEn' => $e->creado_en, 'detalle' => $e->detalle, 'firmante' => $e->firmante, 'ip' => $e->ip])->all();
        $eventos[] = ['creadoEn' => $completadoEn, 'detalle' => 'Documento completado por todos los firmantes', 'firmante' => null, 'ip' => null];

        $final = PdfFinal::generar(self::disco()->get($d->archivo), [
            'id' => $id, 'nombre' => $d->nombre, 'remitente' => "{$d->u_nombre} ({$d->u_email})", 'sha256Original' => $d->sha256_original,
            'enviadoEn' => $d->enviado_en, 'completadoEn' => $completadoEn, 'marcaAgua' => $gratis,
            'logo' => ! $gratis && $d->cuenta_logo ? rescue(fn () => Imagenes::leer($d->cuenta_logo), null, false) : null,
            'urlVerificacion' => rtrim(config('app.url'), '/').'/verificar',
            'campos' => $campos->map(fn ($c) => ['tipo' => $c->tipo, 'pagina' => $c->pagina, 'x' => $c->x, 'y' => $c->y, 'w' => $c->w, 'h' => $c->h, 'valor' => $c->valor, 'imagen' => $leer($c->imagen)])->all(),
            'firmantes' => $firmantes->map(fn ($f) => [
                'orden' => $f->orden, 'nombre' => $f->nombre, 'telefono' => $f->telefono, 'email' => $f->email, 'estado' => $f->estado,
                'abiertoEn' => $f->abierto_en, 'firmadoEn' => $f->firmado_en, 'ip' => $f->ip, 'agente' => $f->agente,
                'firma' => $leer($campos->first(fn ($c) => $c->firmante_id === $f->id && $c->tipo === 'firma' && $c->imagen)?->imagen),
            ])->all(),
            'eventos' => $eventos,
        ]);
        $ruta = "documentos/{$id}/firmado.pdf";
        self::disco()->put($ruta, $final);
        DB::table('documentos')->where('id', $id)->update(['estado' => 'completado', 'completado_en' => $completadoEn, 'archivo_final' => $ruta, 'sha256_final' => hash('sha256', $final)]);
        self::evento($id, 'completado', 'Documento completado por todos los firmantes');
    }

    // ---------------------------------------------------------------- verificación pública

    /** Busca un PDF por su huella SHA-256 (del documento firmado o del original). */
    public static function verificar(string $sha): array
    {
        if (! preg_match('/^[a-f0-9]{64}$/', $sha)) {
            throw new ErrorUso('Huella inválida');
        }
        $d = DB::table('documentos as d')->join('cuentas as c', 'c.id', '=', 'd.cuenta_id')
            ->where(fn ($q) => $q->where('d.sha256_final', $sha)->orWhere(fn ($q) => $q->where('d.sha256_original', $sha)->where('d.estado', '<>', 'borrador')))
            ->orderByRaw('CASE WHEN d.sha256_final = ? THEN 0 ELSE 1 END', [$sha])->orderByDesc('d.id')
            ->first(['d.id', 'd.nombre', 'd.estado', 'd.enviado_en', 'd.completado_en', 'd.sha256_final', 'c.nombre as empresa']);
        if (! $d) {
            return ['encontrado' => false];
        }
        return [
            'encontrado' => true, 'tipo' => $d->sha256_final === $sha ? 'firmado' : 'original',
            'documento' => ['nombre' => $d->nombre, 'estado' => $d->estado, 'empresa' => $d->empresa, 'enviadoEn' => Fechas::iso($d->enviado_en), 'completadoEn' => Fechas::iso($d->completado_en)],
            'firmantes' => DB::table('firmantes')->where('documento_id', $d->id)->orderBy('orden')->get()
                ->map(fn ($f) => ['nombre' => $f->nombre, 'estado' => $f->estado, 'firmadoEn' => Fechas::iso($f->firmado_en)])->all(),
        ];
    }

    /** Tareas que no deben demorar la respuesta (correos). En hosting compartido se ejecutan al terminar la petición. */
    public static function despues(\Closure $tarea): void
    {
        // Una sola vez: si la aplicación atiende varias peticiones seguidas, no se repite el envío.
        $hecho = false;
        app()->terminating(function () use ($tarea, &$hecho) {
            if (! $hecho) {
                $hecho = true;
                rescue($tarea);
            }
        });
    }
}
