<?php

namespace App\Servicios;

use RuntimeException;

/** Error con un mensaje para mostrar a la persona, su código HTTP y, si hay, errores por campo. */
class ErrorUso extends RuntimeException
{
    public function __construct(string $mensaje, public int $estado = 400, public array $campos = [])
    {
        parent::__construct($mensaje);
    }
}
