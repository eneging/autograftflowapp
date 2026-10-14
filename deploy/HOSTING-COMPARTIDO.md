# Publicar AutograFlow en un hosting compartido (cPanel)

El hosting solo necesita **PHP 8.2 o superior y MySQL**: no hace falta Node. La página React se compila en tu computadora y se sube ya lista, en `public/build`.

## Requisitos del hosting

- **PHP 8.2 o superior.** En cPanel lo eliges en *Seleccionar versión de PHP* o *MultiPHP Manager*.
- **Extensiones de PHP:** `pdo_mysql`, `mbstring`, `openssl`, `curl`, `fileinfo`, `gd`, `zip` y `zlib`. Casi siempre ya vienen activadas.
- **MySQL o MariaDB.**
- **SSL gratis (AutoSSL o Let's Encrypt):** obligatorio para Mercado Pago.
- **Recomendado: acceso a Terminal o SSH.** Sin él también funciona: ver el paso 4.

## 1. Preparar los archivos en tu computadora

**Forma rápida:** en la carpeta `autograflow`, ejecuta en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/empaquetar.ps1
```

El script crea `deploy/autograflow-hosting.zip`, con la página ya compilada y las dependencias de producción, y sin `.env`, pruebas ni `node_modules`. Ese zip se probó descomprimido en Apache, igual que en un hosting. Con él puedes pasar directo al paso 2.

**A mano**, si prefieres hacerlo paso por paso, en la carpeta `autograflow` ejecuta:

```bash
composer install --no-dev --optimize-autoloader   # dependencias de PHP, sin las de pruebas
npm install
npm run build                                     # compila React en public/build
```

Si en lugar de un zip subes el código con Git, borra la línea `/public/build` de `.gitignore`, porque el hosting no puede compilar React.

Comprime la carpeta `autograflow` en un `.zip`. Deja **fuera** del zip:
- `node_modules`
- `.env`
- `tests`
- `storage/logs/*`

Al terminar, vuelve a ejecutar `composer install` (sin `--no-dev`) en tu PC si quieres seguir corriendo las pruebas.

## 2. Subir al hosting

**Opción A (recomendada).** Sube y descomprime el zip **fuera** de `public_html`, por ejemplo en `/home/TU_USUARIO/autograflow`. Luego, en cPanel → *Dominios*, cambia la **raíz del documento** del dominio a `/home/TU_USUARIO/autograflow/public`.

**Opción B (si no puedes cambiar la raíz).** Descomprime todo dentro de `public_html`. Después copia [deploy/public_html.htaccess](public_html.htaccess) como `public_html/.htaccess`: envía las visitas a `public/` y bloquea `.env` y el código.

**Permisos:** las carpetas `storage` y `bootstrap/cache` deben poder escribirse (775).

**Límites de subida:** copia [deploy/user.ini](user.ini) como `public/.user.ini`, o pon esos valores en el *Editor INI de MultiPHP*. Así se aceptan PDF de hasta 20 MB.

## 3. Base de datos y archivo `.env`

1. En cPanel → *Bases de datos MySQL*, crea una base y un usuario, y dale **todos los privilegios** sobre esa base.
2. En el servidor, copia `.env.example` como `.env` y complétalo:

| Variable | Valor |
|---|---|
| `APP_ENV` / `APP_DEBUG` | `production` / `false` |
| `APP_URL` | `https://tu-dominio.com` |
| `APP_KEY` | se genera en el paso 4 |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | los datos que creaste (en cPanel suelen llevar tu usuario como prefijo: `usuario_autograflow`) |
| `MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_PORT=465`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_SCHEME=smtps`, `MAIL_FROM_ADDRESS` | el correo del hosting (cPanel → *Cuentas de correo* → *Conectar dispositivos* muestra estos datos) |
| `ADMIN_PASSWORD` | una clave larga para el panel `/admin` |
| `MONEDA` | `PEN`, `ARS`, `MXN`, `CLP`, `COP`… (los precios están en `resources/shared/planes.json`) |
| `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET` | ver el paso 5 |
| `CLOUDINARY_URL` | ver el paso 6 |
| `ZONA_HORARIA` | por ejemplo `America/Lima` |

## 4. Instalar

**Con Terminal o SSH (cPanel → *Terminal*):**

```bash
cd ~/autograflow
php artisan key:generate --force
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
```

Si el comando `php` es otra versión, usa la ruta completa que indique tu hosting, por ejemplo `/opt/cpanel/ea-php82/root/usr/bin/php`.

**Sin Terminal:**
1. Abre phpMyAdmin, selecciona tu base e **importa** [deploy/base-de-datos.sql](base-de-datos.sql).
2. Genera la clave en tu PC con `php artisan key:generate --show` y pega el resultado en `APP_KEY` del `.env` del servidor.

Comprueba que funciona abriendo `https://tu-dominio.com/api/salud`: debe responder `{"ok":true}`.

## 5. Mercado Pago

1. Entra a <https://www.mercadopago.com/developers/panel>, crea una aplicación (Checkout Pro) y copia el **Access Token** en `MP_ACCESS_TOKEN`.
2. En **Webhooks**, configura la URL `https://tu-dominio.com/api/pagos/webhook` con el evento **Pagos** y copia la **clave secreta** en `MP_WEBHOOK_SECRET`.
3. Prueba primero con las credenciales y tarjetas **de prueba**; cuando todo funcione, cambia a las de producción.
4. Si usaste `config:cache`, ejecuta `php artisan config:cache` otra vez después de editar el `.env`.

## 6. Cloudinary (imágenes de firmas, sellos, huellas y logos)

1. Crea una cuenta en <https://cloudinary.com>.
2. En *Dashboard → API Keys* copia el **API environment variable**, que tiene esta forma: `cloudinary://API_KEY:API_SECRET@CLOUD_NAME`.
3. Pégalo en `CLOUDINARY_URL`.

Las imágenes se suben como **privadas**: no tienen una dirección pública. AutograFlow las entrega solo a quien tiene el enlace del documento. Si dejas `CLOUDINARY_URL` vacío, se guardan en `storage/app` del hosting.

## 7. Copias de seguridad

Respalda dos cosas:
- **La base de datos:** cPanel → *Copias de seguridad*, o exportándola con phpMyAdmin.
- **La carpeta `storage/app`:** tiene los PDF originales y firmados.

Las imágenes ya quedan guardadas en Cloudinary.

## Actualizar a una versión nueva

1. Vuelve a hacer el paso 1 en tu PC y sube los archivos, **sin borrar** `.env` ni `storage`.
2. Ejecuta `php artisan migrate --force && php artisan config:cache`. Sin Terminal, importa en phpMyAdmin el SQL de actualización de esa versión: [deploy/actualizar-2026-10-09.sql](actualizar-2026-10-09.sql) agrega el equipo Empresarial y los bloqueos de firma y sello, y pasa los planes antiguos «Básico» y «Pro» al Profesional.
