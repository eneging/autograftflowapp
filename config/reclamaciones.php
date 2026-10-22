<?php

return [
    'proveedor' => [
        'marca' => 'AutograFlow',
        'razonSocial' => (string) env('PROVEEDOR_RAZON_SOCIAL', ''),
        'ruc' => (string) env('PROVEEDOR_RUC', ''),
        'domicilio' => (string) env('PROVEEDOR_DOMICILIO', ''),
        'correo' => (string) env('RECLAMACIONES_CORREO', ''),
    ],
    // Fechas adicionales, separadas por coma; no incluye automáticamente días compensables del sector público.
    'feriados_adicionales' => array_filter(explode(',', (string) env('RECLAMACIONES_FERIADOS', ''))),
];
