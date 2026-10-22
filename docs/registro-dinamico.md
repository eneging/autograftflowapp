# Registro por pasos

`/registro` presenta tres pantallas breves: nombre y correo, contraseña y confirmación, y revisión final con las opciones de cuenta y aceptación legal.

- Valida antes de avanzar. El formulario no llama al registro en los dos primeros pasos.
- Permite volver atrás y editar conservando los datos en memoria, sin almacenar contraseñas en el navegador.
- Muestra los requisitos de contraseña y permite mostrar u ocultar ambas entradas.
- Empresa y referido son opcionales desplegables. El referido recibido por enlace aparece precargado. Cambiar entre cuenta propia y organización conserva los datos escritos; un referido incompatible con el ingreso a un equipo requiere que el usuario lo retire explícitamente.
- Conserva el plan seleccionado y la ruta de vuelta. Los enlaces entre ingreso y registro conservan la consulta. La cuenta existente puede iniciar sesión y recuperar su contraseña.
- El último paso muestra el resumen y el contexto del plan. Los planes de pago continúan a Mercado Pago después de crear la cuenta; un ingreso con código de organización no inicia un pago individual.
- Mantiene acceso a los textos legales y aceptación explícita inicialmente desmarcada. Permite explorar como invitado y explica la conservación de documentos al convertir el invitado en cuenta propia, así como la diferencia al unirse a una organización.
- Los errores del servidor devuelven al paso del campo afectado, abren los opcionales cuando corresponde y enfocan el campo. Se conservan los demás datos.
- Bloquea envíos repetidos mientras se crea la cuenta. La API y sus validaciones permanecen vigentes.

Se verificaron en navegador, con respuestas simuladas: campos requeridos, contraseñas, opción de mostrar, aceptación, referido, empresa, conflicto con organización, error de correo existente, regreso al paso correcto y conservación de datos, continuidad del pago y registro de equipo sin checkout individual. No se crearon cuentas ni se realizaron pagos reales durante estas comprobaciones.
