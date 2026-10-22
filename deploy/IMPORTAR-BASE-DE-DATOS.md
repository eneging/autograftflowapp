# Base de datos de producción — AutograFlow

Archivo: `autograflow-produccion-2026-10-22.sql`.

Incluye la estructura actual de 22 tablas y el registro de 16 migraciones, con Libro de Reclamaciones, referidos y guía de introducción. El contador del Libro de Reclamaciones comienza en cero. La primera hoja será `LR-00000001`.

No contiene usuarios, contraseñas, correos de clientes, documentos, firmas, reclamos, pagos ni sesiones de desarrollo. No crea usuarios de MySQL ni incluye credenciales. Los PDF y otros archivos tampoco forman parte de esta exportación.

## Instalación nueva desde phpMyAdmin

1. Usa la base `edwarrej_autograflow`, que debe estar vacía para esta instalación. Asigna un usuario y los permisos necesarios desde el panel del hosting. Usa `utf8mb4_unicode_ci` para la codificación/colación si el panel lo solicita.
2. Abre phpMyAdmin y selecciona `edwarrej_autograflow` en el panel izquierdo.
3. En **Importar**, selecciona `autograflow-produccion-2026-10-22.sql`. Usa el formato SQL y la codificación UTF-8. Ejecuta la importación.
4. Configura el `.env` del servidor con los valores reales del hosting:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://tu-dominio.com

DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=edwarrej_autograflow
DB_USERNAME=usuario_de_la_base
DB_PASSWORD="clave_del_usuario_de_la_base"

SESSION_DRIVER=database
CACHE_STORE=database
QUEUE_CONNECTION=database
```

El nombre de la base ya está indicado. El usuario, la contraseña, el host y el puerto son los que te entrega tu hosting; el usuario puede ser distinto del nombre de la base. No copies literalmente el usuario ni la contraseña del ejemplo. Si defines `DB_URL`, verifica que no esté sustituyendo estos valores.

5. Para una instalación nueva, configura una `APP_KEY` propia de producción. Si tienes terminal, usa `php artisan key:generate --force`. Si no, genera una clave con `php artisan key:generate --show` en tu PC y copia solo el resultado a `APP_KEY` del servidor. **No reemplaces la clave de una instalación existente.**
6. Si tienes terminal, ejecuta `php artisan config:clear` y `php artisan migrate:status`. Las 16 migraciones incluidas deben figurar como aplicadas. `php artisan migrate --force` no debe intentar repetirlas.
7. Publica el código y la compilación actual de AutograFlow. El SQL nuevo corresponde a esa versión del código, no al ZIP de aplicación antiguo que pudiera haber en `deploy/`.

Como alternativa a importar el SQL, en una base vacía puedes ejecutar directamente `php artisan migrate --force` con la configuración de producción. No es necesario realizar ambos procedimientos.

## Si producción ya tiene datos

No importes este archivo de instalación completa sobre esa base. Haz una copia de seguridad y actualiza la aplicación mediante:

```bash
php artisan migrate --force
php artisan config:clear
```

Las migraciones aplican solo los cambios pendientes y conservan los registros. No uses `migrate:fresh`, `migrate:refresh` ni `migrate:reset` en producción. Si no dispones de terminal y la base ya existe, hace falta un SQL incremental correspondiente a las migraciones que tenga aplicadas; este archivo no es ese parche.

## Configuración fuera de la base

Los datos del proveedor del Libro de Reclamaciones y su correo se configuran en `.env` con `PROVEEDOR_RAZON_SOCIAL`, `PROVEEDOR_RUC`, `PROVEEDOR_DOMICILIO` y `RECLAMACIONES_CORREO`. Configura también el correo SMTP y el scheduler de Laravel (`php artisan schedule:run` cada minuto) para los envíos pendientes y la acreditación periódica de referidos. Estos datos no están en el SQL.

## Comprobación realizada

El archivo se importó en una base temporal aislada de MySQL. Se verificó la estructura de las 22 tablas, las 16 migraciones, el contador inicial y que todas las tablas de negocio quedaran vacías. La base temporal se eliminó al terminar. La base de desarrollo no se modificó durante la exportación.

`base-de-datos.sql` es una copia idéntica del archivo fechado. Para regenerar ambos desde una base local con todas las migraciones aplicadas:

```bash
php deploy/exportar-estructura.php --verificar
```

La opción de verificación necesita permiso local para crear y eliminar una base temporal con el prefijo `autograflow_validacion_`. No ejecutes este script en el servidor de producción como parte de la instalación.
