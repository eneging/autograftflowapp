# Libro de Reclamaciones de AutograFlow

Implementación local revisada el 22 de octubre de 2026. Proveedor indicado por el titular: Edwar Rejas Reyes, RUC 10733361510, Las Brisas de Jahui, Mz. D, Lt. 7, Subtanjalla, Ica, Ica. Correo de atención: edwarrejasreyes@gmail.com.

## Uso

- Acceso público: `/libro-de-reclamaciones`, también visible en el footer. No requiere cuenta, pago, comprobante de compra ni consentimiento publicitario.
- Administración: `/admin/reclamaciones`, protegida por la contraseña `ADMIN_PASSWORD` existente. La contraseña solo se mantiene en memoria de esa pantalla.
- Se registran reclamos y quejas, los datos del consumidor y representante cuando es menor, descripción del bien o servicio, monto opcional, detalle y pedido. Se admite respuesta por correo o carta al domicilio.
- La hoja se guarda en la base de datos con número correlativo transaccional, fecha del servidor, datos del proveedor vigentes en ese momento y clave de idempotencia para los reintentos. No hay función para eliminar hojas ni sobrescribir el texto de una respuesta definitiva.
- El consumidor descarga una constancia PDF imprimible mediante un enlace secreto. No publiques ese enlace: contiene acceso a sus datos. El correo de copia incluye el PDF completo como adjunto.
- El plazo se calcula desde el día siguiente a la presentación, en `America/Lima`, excluyendo sábados, domingos y feriados nacionales, incluidos Jueves y Viernes Santo. El límite es de 15 días hábiles para ambos tipos. `RECLAMACIONES_FERIADOS` permite añadir fechas aplicables. No se suman automáticamente los días compensables del sector público. Revisar cambios normativos y feriados nuevos.
- No se implementan acuerdos que suspendan plazos: el sistema mantiene el vencimiento original y no ofrece prórrogas automáticas. Registrar una respuesta no significa que el consumidor haya aceptado una solución.
- La administración conserva texto, responsable, estado del correo y fecha de envío. En carta, exige indicar la guía o constancia después del envío real; el operador debe conservar el comprobante original. Los errores de correo no borran la hoja ni marcan una respuesta como enviada.

## Puesta en funcionamiento

1. Desplegar los archivos, compilar con `npm run build` y ejecutar `php artisan migrate --force`.
2. Configurar `PROVEEDOR_RAZON_SOCIAL`, `PROVEEDOR_RUC`, `PROVEEDOR_DOMICILIO` y `RECLAMACIONES_CORREO` en el entorno de producción. Ya se incorporaron los datos recibidos al `.env` local. Completar cualquier otro dato pendiente de los textos legales antes de publicarlos.
3. Configurar un transporte real en `MAIL_MAILER` y sus credenciales `MAIL_*`. Indicar un `MAIL_FROM_ADDRESS` permitido por el proveedor SMTP. El correo de atención recibido no proporciona credenciales SMTP ni autorización técnica para enviar desde Gmail. Los transportes `log`, `array` y `failover` se dejan pendientes en producción para evitar presentarlos como notificaciones efectivas.
4. Habilitar el scheduler de Laravel cada minuto: `php artisan schedule:run`. Procesa hasta 50 correos cada cinco minutos. Alternativa manual: `php artisan autograflow:reclamaciones-correos` o reintentar desde la administración. El envío inicial también se intenta al registrar la hoja.
5. Verificar el envío real de copia y respuesta con el proveedor SMTP. No se enviaron mensajes reales durante las pruebas automatizadas.
6. Revisar los pendientes y vencimientos diariamente. Conservar hojas, respuestas y comprobantes de envío por al menos dos años, con copias de seguridad de la base y acceso restringido. No ejecutar el `down` de esta migración en producción: eliminaría los registros.
7. Verificar si corresponde reporte SIREC según las condiciones aplicables al proveedor; no se integra automáticamente a Indecopi. Disponer del respaldo y del procedimiento operativo que correspondan ante indisponibilidad del libro.

Si un proceso se interrumpe después de reclamar un correo, puede quedar en `enviando`. Revisar el comprobante del transporte antes de desbloquearlo: no reintentar ciegamente, pues podría duplicarse el envío. «Enviado» acredita la aceptación por el transporte, no la lectura ni la entrega final; revisar rebotes y conservar su evidencia externa. El historial es operativo, no una firma criptográfica contra modificaciones directas en la base.

El registro se mantiene disponible cuando el SMTP está pendiente; se ofrece descarga inmediata y se muestra el envío pendiente. La identificación incompleta del proveedor, en cambio, se informa en pantalla y bloquea el registro hasta completarla.

## Fuentes oficiales consultadas

- [D.S. 006-2014-PCM](https://busquedas.elperuano.pe/dispositivo/NL/1041477-1): condiciones del libro virtual y conservación de información. Se implementan copia imprimible, envío de copia y resguardo de hojas y respuestas.
- [D.S. 101-2022-PCM](https://busquedas.elperuano.pe/dispositivo/NL/2095978-1): plazo vigente para responder reclamos y quejas y diferencia entre ambas categorías.
- [Indecopi: presentación de reclamos](https://consumidor.gob.pe/presenta-tu-reclamo-productos-y-servicios/): vías de atención al consumidor.
- [D. Leg. 1729, publicado el 12/02/2026](https://busquedas.elperuano.pe/dispositivo/NL/2486266-3): atención accesible y efectiva en el comercio electrónico.
- [R.M. 244-2026-PCM](https://www.gob.pe/institucion/pcm/normas-legales/8406634-244-2026-pcm): publica un **proyecto** de modificación reglamentaria. No se ha tratado ese proyecto como norma aprobada.
- [Calendario oficial de feriados](https://www.gob.pe/feriados): referencia para los días excluidos del cómputo.

La implementación cubre el flujo tecnológico descrito. El cumplimiento continuado también requiere atención real dentro del plazo, datos exactos del proveedor, notificación, conservación y las obligaciones sectoriales aplicables.
