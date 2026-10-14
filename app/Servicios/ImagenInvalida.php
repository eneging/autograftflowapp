<?php

namespace App\Servicios;

use InvalidArgumentException;

/** La imagen enviada no es PNG/JPG o es demasiado grande. */
class ImagenInvalida extends InvalidArgumentException
{
}
