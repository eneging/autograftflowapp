# Dominio correcto en los referidos

El enlace se generaba desde `APP_URL`. Si ese valor conserva una dirección de ngrok, el enlace muestra ese túnel.

## Corregir la configuración del hosting

En el archivo `.env` de producción, configura tu dominio real, incluyendo `https://`:

```dotenv
APP_URL=https://tu-dominio.com
```

Sustituye `tu-dominio.com` por tu dominio; no uses el valor del ejemplo literalmente. Después, desde la carpeta Laravel del servidor:

```bash
php artisan config:clear
php artisan config:cache
```

Si no dispones de terminal, puedes eliminar únicamente el archivo generado `bootstrap/cache/config.php`, si existe, desde el administrador de archivos de cPanel. Laravel volverá a leer la configuración del `.env`. No elimines `config/app.php` ni el `.env`.

Abre la aplicación desde tu dominio y vuelve a cargar «Invita y gana». Esta corrección de `APP_URL` también es necesaria para los enlaces generados en correos y las URLs de retorno y avisos del proveedor de pagos.

## Parche de referidos

El ZIP `autograflow-corregir-dominio-referidos.zip` incluye dos archivos PHP con sus rutas:

- `app/Servicios/Referidos.php`
- `app/Http/Controllers/ReferidosController.php`

Reemplázalos en la carpeta Laravel del servidor conservando esas rutas. Esta versión genera el enlace de referido con el dominio y protocolo de la petición actual, para que no dependa de una URL antigua de desarrollo. No requiere importar SQL ni recompilar React.

El parche se verificó con `APP_URL` apuntando a un túnel de ejemplo y peticiones desde dos dominios HTTPS diferentes: cada respuesta utiliza el dominio visitado y conserva el mismo código de referido. Pasaron las 9 pruebas del módulo.
