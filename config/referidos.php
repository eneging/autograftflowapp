<?php

return [
    'activo' => (bool) env('REFERIDOS_ACTIVO', true),
    'bonos' => ['ocasional' => 1, 'profesional' => 3, 'empresarial' => 10],
    'espera_dias' => 14,
    'vigencia_dias' => 90,
    'tope_mensual' => 50,
    'version' => '2026-10-22.1',
];
