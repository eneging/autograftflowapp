# Completar edwarrej_autograflow

Usa **`edwarrej_autograflow-completar.sql`** para la base representada por el archivo que compartiste, que contiene únicamente las tablas `cache` y `cache_locks`.

1. En phpMyAdmin, selecciona `edwarrej_autograflow`.
2. Abre **Importar** y elige `edwarrej_autograflow-completar.sql`.
3. Usa el formato **SQL**, codificación **UTF-8**, y ejecuta la importación una sola vez.

Este archivo agrega las otras 20 tablas, los índices, los AUTO_INCREMENT, las relaciones, el registro de las 16 migraciones y el contador inicial del Libro de Reclamaciones. No vuelve a crear ni modifica `cache` o `cache_locks`, y no elimina sus registros.

La estructura está organizada siguiendo el formato de tu exportación de phpMyAdmin: tablas, datos técnicos, índices, AUTO_INCREMENT y restricciones, en secciones separadas. Incluye `USE edwarrej_autograflow` para dirigir la importación a la base indicada.

Si la base ya tiene otras tablas además de las dos de tu archivo, o la importación informa otro error, conserva el mensaje antes de volver a importar. Las operaciones de estructura de MySQL no se revierten íntegramente con `ROLLBACK`, aunque el formato incluya `START TRANSACTION`.

Después de importar, el `.env` del servidor debe contener `DB_DATABASE=edwarrej_autograflow` y el usuario y contraseña MySQL autorizados para esa base. El SQL no incluye credenciales ni crea una cuenta de usuario de AutograFlow; esa cuenta se crea desde la página.

También se generó `edwarrej_autograflow-completa.sql`, reservado para una instalación nueva en una base completamente vacía. **No uses ese archivo completo en la base de tu exportación**, porque `cache` y `cache_locks` ya existen.

## Verificación

Se importó tu archivo de referencia en una base temporal aislada. Se añadió un registro temporal de prueba a `cache` y luego se importó el parche. Se comprobó que el registro permaneciera intacto, que las 22 tablas coincidieran con la estructura actual y que las 16 migraciones estuvieran registradas. La base temporal se eliminó al terminar. No se modificó tu archivo original ni la base de producción.
