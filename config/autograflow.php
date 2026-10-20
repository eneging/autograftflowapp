<?php

/*
 * Configuración de AutograFlow. Los valores secretos van en el archivo .env.
 */

// cloudinary://API_KEY:API_SECRET@CLOUD_NAME
$cloudinary = parse_url((string) env('CLOUDINARY_URL', '')) ?: [];

return [
    'admin_password' => (string) env('ADMIN_PASSWORD', ''),
    'moneda' => (string) env('MONEDA', 'PEN'),
    // Zona horaria para las fechas que se imprimen en la plantilla de reembolso (la base guarda todo en UTC).
    'zona' => (string) env('ZONA_HORARIA', 'America/Lima'),

    'mercadopago' => [
        'token' => (string) env('MP_ACCESS_TOKEN', ''),
        'secreto_webhook' => (string) env('MP_WEBHOOK_SECRET', ''),
        'api' => rtrim((string) env('MP_API_URL', 'https://api.mercadopago.com'), '/'),
    ],

    'cloudinary' => [
        'nube' => $cloudinary['host'] ?? '',
        'clave' => isset($cloudinary['user']) ? urldecode($cloudinary['user']) : '',
        'secreto' => isset($cloudinary['pass']) ? urldecode($cloudinary['pass']) : '',
        'carpeta' => (string) env('CLOUDINARY_CARPETA', 'autograflow'),
        'api' => rtrim((string) env('CLOUDINARY_API_URL', 'https://api.cloudinary.com'), '/'),
    ],

    'limites' => [
        'pdf_bytes' => 20 * 1024 * 1024,
        'paginas' => 200,
        'firmantes' => 20,
        'campos' => 400,
        'imagen_bytes' => 600_000,
        // Fotos del DNI (frente y reverso, JPG): más grandes que una firma para que se lean en el certificado.
        'dni_bytes' => 1_500_000,
        'texto' => 500,
    ],
];
