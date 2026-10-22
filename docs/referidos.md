# Referidos: funcionamiento y propuesta de beneficios

## Propuesta inicial

Recompensar a la cuenta que invita con documentos promocionales después de la primera compra válida de una cuenta nueva. Los valores iniciales son configurables en `config/referidos.php`.

| Primera compra del referido | Precio actual del catálogo (PEN) | Documentos para quien invita | Valor de referencia del bono a S/ 0.49/documento | Proporción respecto a la venta bruta |
| --- | ---: | ---: | ---: | ---: |
| Ocasional | S/ 4.90 | 1 | S/ 0.49 | 10.00% |
| Profesional | S/ 19.90 | 3 | S/ 1.47 | 7.39% |
| Empresarial | S/ 149.90 | 10 | S/ 4.90 | 3.27% |

El valor de referencia usa el paquete de 10 documentos a S/ 4.90. No representa el costo real del bono, una comisión en efectivo ni un descuento. Los precios provienen del catálogo local; si cambian, recalcular esta comparación. El bono no habilita las funciones de Ocasional a una cuenta Gratis, por lo que la equivalencia monetaria es solo orientativa.

Esta política preserva el importe cobrado, limita el beneficio a una primera compra y entrega capacidad del producto. No garantiza rentabilidad: faltan costos variables, comisiones de cobro, impuestos, devoluciones y costo de soporte. Medir también si los bonos sustituyen recargas que el cliente habría comprado.

Para usuarios que ya tienen Empresarial ilimitado, más documentos no aportan capacidad mientras siga vigente ese plan. La pantalla lo indica. Si ese es el público principal que invita, una segunda opción sería un descuento del 5% para su próxima renovación, limitado a una renovación y sujeto a margen, sin acumular con otras promociones. Ese descuento es una propuesta para evaluar; no se ha implementado ni prometido en esta versión. Tampoco se ofrecen meses gratis o comisiones perpetuas.

## Comprobación de margen

Por cada primera compra:

`margen de contribución = ingreso neto de impuestos - comisión de cobro - costo variable del servicio vendido - documentos del bono × costo marginal por documento - soporte incremental`

Si se reserva como máximo el 10% del ingreso neto de comisiones e impuestos para el bono, el costo marginal máximo permitido es:

`costo máximo por documento = 0.10 × ingreso neto de comisiones e impuestos / documentos de recompensa`

Ejemplo matemático: con S/ 4.00 netos y 1 documento de premio, el presupuesto sería S/ 0.40 para ese documento. No es una estimación de tus costos. Usar datos reales de almacenamiento, PDFs, correo, infraestructura y soporte antes de ampliar beneficios.

## Reglas implementadas

- Código estable por cuenta, compartido por sus miembros. Enlace directo `/registro?ref=AF-…`, también se puede escribir el código durante el registro. No se crean cookies de atribución ni se registran visitas. El dato se conserva en el propio formulario hasta enviarlo.
- Panel `/app/referidos` en «Invita y gana». Página pública de condiciones `/referidos`, enlazada desde el footer y el registro. Copia de código/enlace y enlace de WhatsApp: abre el mensaje para que el usuario decida enviarlo.
- Una relación por cuenta nueva o invitado convertido. El usuario existente no puede agregar o cambiar el referente después. No se mezcla con códigos de organización. Se bloquean la misma cuenta y correos equivalentes entre usuarios de la cuenta que invita, incluidas variantes de puntos, etiquetas y dominio de Gmail. Esto no es verificación completa de identidad ni detecta todos los autorreferidos con otras identidades.
- Registro gratuito: no genera recompensa. La primera compra aplicada en el backend genera el bono pendiente. Renovaciones y pagos repetidos no generan otro. Mercado Pago verifica monto y moneda en su integración existente. Las activaciones manuales cuentan cuando el administrador confirma el pago; debe comprobarse el abono real antes de hacerlo.
- Espera: 14 días desde el pago aplicado. Tope: 50 documentos acreditados por cuenta y mes calendario en la zona configurada para el negocio (por defecto Perú). Si el bono completo supera el tope, se difiere al primer día del mes siguiente. No se recorta el bono.
- Vigencia: 90 días desde la acreditación. Se registra saldo restante por bono. Orden de uso: cupo del plan, bono que vence primero, créditos comprados. No se altera el plan, el vencimiento del plan, los documentos comprados, los firmantes permitidos, sellos o huellas.
- Los bonos pendientes y los saldos sin usar se anulan ante un reembolso, cancelación o contracargo confirmado por Mercado Pago para el pago correspondiente. Un bono ya gastado representa un costo que no se recupera automáticamente; los 14 días no eliminan el riesgo de contracargos posteriores.
- Se conserva una copia de las reglas en cada invitación: cambiar la configuración afecta a nuevas invitaciones. `REFERIDOS_ACTIVO=false` pausa la atribución de invitaciones nuevas; los compromisos existentes siguen su curso.
- El historial visible muestra hasta 100 invitaciones recientes, con identificadores y estados. No expone nombres ni correos de las personas invitadas.

## Operación

Ejecutar migraciones y compilar al desplegar. Se añadió `2026_10_22_000003_programa_de_referidos.php`; ya se aplicó localmente. La migración convierte `consumos.origen` de enum a texto para admitir el origen `referido` conservando los valores históricos. No revertir la migración en producción con bonos en uso: se perdería su historial y saldo.

El scheduler ejecuta `php artisan autograflow:referidos-acreditar` cada hora, hasta 200 bonos pendientes por pasada. Requiere activar `php artisan schedule:run` cada minuto en el servidor. También se acreditan bonos vencida su espera al consultar el panel de referidos, consultar el saldo de la cuenta o enviar un documento, para que el flujo no dependa exclusivamente del cron.

Las asignaciones, acreditaciones, consumos y anulaciones usan transacciones y bloqueos; el pago y el referido no pueden generar dos recompensas por reintentos. Las pruebas usan pagos simulados y no realizan cobros ni envían mensajes reales.

## Referencias del diseño

- [Dropbox: referral program](https://www.dropbox.com/refer), consultado el 22 de octubre de 2026: ejemplo de beneficio ligado a capacidad del producto.
- [Wise: free transfer invite program](https://wise.com/help/articles/2487043/how-does-the-free-transfer-invite-program-work/MTDoMHRzUk.otf), consultado el 22 de octubre de 2026: ejemplo de recompensa condicionada a una operación válida. Sus reglas varían por programa y no se copian como condiciones de AutograFlow.

La cantidad de documentos, esperas, caducidad y topes propuestos aquí son decisiones para AutograFlow, no resultados de esos programas ni una previsión de conversión.
