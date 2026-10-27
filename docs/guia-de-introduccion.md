# Introducción dentro del proceso real

La introducción se muestra automáticamente la primera vez que cada usuario entra a Mis documentos, cuando termina de cargar la lista. Es una tarjeta contextual y resalta el control del paso actual; no bloquea la aplicación.

## Recorrido

1. Seleccionar o arrastrar un PDF real. La guía pasa al editor después de una subida exitosa.
2. Configurar firmantes. «Ya están los firmantes» se habilita al tener nombres, y no con el nombre provisional «Firmante 1».
3. Asignar campos. El siguiente paso se habilita al tener al menos un campo por firmante. No reemplaza la validación final de envío.
4. Revisar y usar el botón real «Guardar y enviar». La guía informa de sus efectos, pero no ejecuta el envío. Las confirmaciones y reglas existentes siguen vigentes.
5. Compartir los enlaces personales desde el seguimiento. Abrir WhatsApp no se considera prueba de envío; el usuario indica cuándo ya los compartió.
6. Consultar el estado de las firmas y, cuando el documento esté completo, descargar el PDF. «Terminar introducción» finaliza la ayuda; no declara que el documento ya esté firmado.

«Mostrar dónde» desplaza la vista y enfoca el control correspondiente. «Ver guía», disponible en la barra superior fija, vuelve a la tarjeta sin reiniciar los pasos.

## Modos asistidos

- **Activo (la guía):** cada paso trae una animación «Así se hace» (HTML y CSS que imitan la pantalla real, en bucle; sin archivos GIF). Al llegar a un paso la vista va sola al control real y este parpadea 3 veces; «Mostrar dónde» repite el parpadeo.
- **Pasivo:** sin tarjeta. Empieza al subir un PDF, después de responder «¿Quién firma?»: parpadea el paso 2 (nombre). Al salir del nombre (o con Enter) baja al paso 3; cuando cada firmante tiene sus campos (o, si firmas solo tú, cuando tu firma está hecha) baja al paso 4; al salir del paso 4, al botón de envío. Cada paso parpadea una vez y solo se avanza: si haces clic directamente en otro paso, avanza sin mover la vista. No actúa si la guía acompaña ese documento.
- Ambos se activan o desactivan en «Cómo funciona» → «Ayudas mientras trabajas». El activo se guarda en la cuenta (como «Saltar guía»); el pasivo, en el navegador (`autograflow_asistido_pasivo`), activado por defecto.
- Con «reducir movimiento» no hay desplazamiento animado; el parpadeo se cambia por un resaltado breve y las animaciones muestran su imagen final.

## Preferencia y reactivación

- «Saltar guía» la oculta inmediatamente y guarda `omitida` por usuario. No se vuelve a abrir automáticamente en siguientes accesos.
- Después de omitir o terminar aparece «Activar guía» en la barra superior. Reactivarla desde un documento acompaña ese documento; desde el panel comienza con otro PDF.
- El avance se mantiene entre panel, editor y seguimiento. Desde el panel se puede volver al documento guiado. Si se abre otro documento, la guía ofrece continuar allí o regresar al anterior.
- La preferencia está en `users.guia_estado`, `guia_paso` y `guia_documento_id`. Se incluye en `/api/auth/yo` y se actualiza mediante `PUT /api/cuenta/guia`. No se comparte entre integrantes de una cuenta.
- Las escrituras se envían en orden. Hay respaldo local por ID de usuario mientras se sincronizan; si falla la API, se informa de que la preferencia solo puede mantenerse en ese navegador. No se retrasa la subida ni el envío del documento esperando esta preferencia.
- Saltar durante una subida o envío no vuelve a activar la guía cuando termina esa operación.
- Funciona también para invitados. Al convertir el invitado en cuenta se mantiene su mismo usuario y preferencia.

La página `/como-funciona` conserva el ejemplo público opcional. La introducción del panel ahora acompaña acciones reales y no envía al usuario a ese ejemplo.

## Verificación

Pruebas de API: preferencia inicial, omitir y persistir, reactivar, guardar el documento y el paso, terminar, separación entre usuarios, validación de documentos de otra cuenta y acceso protegido.

Prueba de navegador con API y envío simulados: primera entrada y resaltado, omitir, recargar sin reapertura, reactivar, subir un PDF de prueba, pasar al editor, colocar un campo, utilizar el control de envío, compartir, terminar y recargar sin reapertura. También se revisó móvil de 390 px sin desbordamiento horizontal. La prueba no envió documentos ni mensajes a clientes reales.
