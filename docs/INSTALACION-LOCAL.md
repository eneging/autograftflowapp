# Instalar AutograFlow en otra PC (desarrollo local)

Esta guía explica cómo clonar el repositorio y dejar AutograFlow funcionando en una PC con **Windows y XAMPP**. Al final hay notas para macOS y Linux.

El proyecto tiene dos partes:

- **Laravel 12 (PHP):** la API, las sesiones, la base de datos MySQL y el PDF final. Lo ejecuta PHP desde XAMPP.
- **React + TypeScript:** la página. Node.js la compila con Vite.

---

## 1. Programas necesarios

Instálalos en este orden. Si ya tienes alguno, comprueba que su versión sea igual o mayor a la indicada.

| Programa | Versión | Para qué sirve | Descarga |
|---|---|---|---|
| **Git** | 2.40 o superior | Clonar el repositorio y subir cambios | https://git-scm.com/download/win |
| **XAMPP** | Con **PHP 8.2 o superior** (por ejemplo, XAMPP 8.2.x) | PHP y MySQL/MariaDB (también incluye phpMyAdmin) | https://www.apachefriends.org/es/download.html |
| **Composer** | 2.x | Instalar las dependencias de PHP (Laravel, FPDI, TCPDF) | https://getcomposer.org/Composer-Setup.exe |
| **Node.js** | **22 LTS** (mínimo 20.19) | Instalar las dependencias de la página y compilarla con Vite | https://nodejs.org/es |
| Editor (opcional) | — | Recomendado: Visual Studio Code | https://code.visualstudio.com |

> Vite 7 no funciona con Node 18 ni con versiones anteriores a la 20.19. Si `npm run build` falla con un error de sintaxis o de versión, actualiza Node.

### 1.1 Git

1. Instálalo con las opciones por defecto. Así podrás usar Git desde PowerShell, CMD y «Git Bash».
2. La primera vez, configura tu nombre y correo, que aparecerán en cada commit:

   ```bash
   git config --global user.name "Tu Nombre"
   git config --global user.email "tu-correo@ejemplo.com"
   ```

3. **Recomendado en Windows:** para que Git no cambie los saltos de línea de los archivos, ejecuta:

   ```bash
   git config --global core.autocrlf input
   ```

### 1.2 XAMPP (PHP + MySQL)

1. Instálalo en `C:\xampp`, la ruta por defecto. En los componentes basta con **Apache, MySQL, PHP y phpMyAdmin**.
2. Abre el **XAMPP Control Panel** e inicia **MySQL**. Apache solo hace falta si quieres usar phpMyAdmin.
3. **Activa las extensiones de PHP.** En el panel, en la fila de Apache, haz clic en *Config → PHP (php.ini)*. Busca cada línea y quítale el `;` del principio:

   ```ini
   extension=curl
   extension=fileinfo
   extension=gd
   extension=mbstring
   extension=openssl
   extension=pdo_mysql
   extension=pdo_sqlite
   extension=sqlite3
   extension=zip
   ```

   - En XAMPP, `gd` y `zip` suelen venir desactivadas. Sin ellas fallan Composer y la generación del PDF.
   - `pdo_sqlite` y `sqlite3` solo las usan las pruebas automáticas (`php artisan test`).

4. En el mismo `php.ini`, sube los límites para aceptar PDF grandes:

   ```ini
   upload_max_filesize = 20M
   post_max_size = 25M
   memory_limit = 512M
   ```

5. Guarda los cambios y reinicia Apache y MySQL desde el panel.
6. **Agrega PHP al PATH** para poder escribir `php` en la terminal:
   1. Abre *Inicio*, busca «variables de entorno» y entra en *Editar las variables de entorno del sistema*.
   2. Haz clic en *Variables de entorno* y edita la variable `Path`.
   3. Haz clic en *Nuevo* y escribe `C:\xampp\php`.
   4. Cierra y vuelve a abrir la terminal.
7. Comprueba la instalación:

   ```bash
   php -v          # debe decir PHP 8.2 o superior
   php -m          # debe listar gd, zip, pdo_mysql, mbstring, etc.
   ```

### 1.3 Composer

1. Ejecuta `Composer-Setup.exe`. Cuando pregunte por PHP, elige `C:\xampp\php\php.exe`.
2. Comprueba la instalación con `composer -V`.

### 1.4 Node.js

1. Instala la versión **LTS** (22.x). Viene con `npm`.
2. Comprueba la instalación:

   ```bash
   node -v   # v22.x (o v20.19 o superior)
   npm -v
   ```

---

## 2. Clonar el repositorio

El repositorio está en GitHub: **https://github.com/eneging/autograftflowapp**

1. Abre PowerShell o Git Bash en la carpeta donde quieras el proyecto, por ejemplo `C:\proyectos`.

   > No hace falta ponerlo dentro de `C:\xampp\htdocs`. Laravel trae su propio servidor (`php artisan serve`).

2. Clona el repositorio:

   ```bash
   git clone https://github.com/eneging/autograftflowapp.git
   cd autograftflowapp
   ```

   - Si el repositorio es privado, GitHub te pedirá iniciar sesión. Con *Git Credential Manager*, que viene con Git para Windows, se abre el navegador para autorizar.
   - Otra opción es usar un *token* personal: en GitHub, ve a *Settings → Developer settings → Personal access tokens* y úsalo como contraseña.

3. Revisa las ramas y cámbiate a la que vayas a usar:

   ```bash
   git branch -a                                   # lista las ramas locales y remotas
   git checkout main                               # rama principal
   # o una rama de trabajo, por ejemplo:
   git checkout claude/eager-feynman-p8ys2o
   ```

---

## 3. Instalar dependencias

Ejecuta estos comandos dentro de la carpeta `autograftflowapp`.

```bash
composer install      # dependencias de PHP → carpeta vendor/
npm install           # dependencias de la página → carpeta node_modules/
```

`vendor/` y `node_modules/` no están en Git, porque se generan con estos comandos. Por eso hay que ejecutarlos en cada PC nueva.

### Dependencias principales del proyecto

**PHP (`composer.json`):**

| Paquete | Uso |
|---|---|
| `laravel/framework` ^12 | Framework de la API |
| `setasign/fpdi` ^2.6 | Leer y reutilizar páginas de PDF |
| `tecnickcom/tcpdf` ^6.7 | Generar el PDF final con las firmas |
| `laravel/tinker` | Consola interactiva |
| Solo para desarrollo: `phpunit`, `mockery`, `faker`, `pint`, `pail`, `collision` | Pruebas, formato y registros |

**Node (`package.json`):**

| Paquete | Uso |
|---|---|
| `react`, `react-dom`, `react-router-dom` | La página |
| `pdf-lib`, `pdfjs-dist` | Preparar y mostrar los PDF en el navegador |
| `signature_pad` | Dibujar la firma |
| `zod` | Validar los datos |
| Solo para desarrollo: `vite`, `laravel-vite-plugin`, `@vitejs/plugin-react`, `typescript`, `vitest`, `concurrently` | Compilar, comprobar los tipos y ejecutar las pruebas |

---

## 4. Configurar el archivo `.env`

1. Copia el ejemplo y genera la clave de la aplicación:

   ```bash
   # PowerShell / CMD
   copy .env.example .env
   # Git Bash
   cp .env.example .env

   php artisan key:generate
   ```

2. Abre `.env` y revisa estos valores. Para trabajar en local, los que vienen ya sirven casi todos.

   | Variable | Valor en local | Nota |
   |---|---|---|
   | `APP_URL` | `http://localhost:8000` | Debe coincidir con la dirección que abres en el navegador |
   | `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | MySQL de XAMPP |
   | `DB_DATABASE` | `autograflow` | Créala en el paso 5 |
   | `DB_USERNAME` / `DB_PASSWORD` | `root` / *(vacío)* | Usuario por defecto de XAMPP |
   | `MAIL_MAILER` | `log` | Los correos se guardan en `storage/logs/laravel.log` en lugar de enviarse |
   | `ADMIN_PASSWORD` | La clave que quieras | Contraseña del panel `/admin` |
   | `MONEDA` | `PEN` | Moneda de los precios |
   | `MP_ACCESS_TOKEN` | *(vacío)* | Sin este valor, los pagos de Mercado Pago quedan desactivados. Para probarlos, usa credenciales **de prueba** |
   | `CLOUDINARY_URL` | *(vacío)* | Sin este valor, las imágenes se guardan en el disco (`storage/`) |
   | `ZONA_HORARIA` | `America/Lima` | |

> **Nunca subas `.env` a Git.** Ya está en `.gitignore` porque contiene contraseñas y claves.

---

## 5. Crear la base de datos

1. Con MySQL encendido en XAMPP, crea la base de datos. Puedes hacerlo de dos formas:
   - **Con phpMyAdmin:** entra en http://localhost/phpmyadmin, haz clic en *Nueva* y crea la base `autograflow` con el cotejamiento `utf8mb4_unicode_ci`.
   - **Desde la terminal:**

     ```bash
     C:\xampp\mysql\bin\mysql -u root -e "CREATE DATABASE autograflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
     ```

2. Crea las tablas con las migraciones:

   ```bash
   php artisan migrate
   ```

---

## 6. Ejecutar el proyecto

### Opción A: modo desarrollo, con recarga automática (recomendado)

Necesitas **dos terminales** abiertas en la carpeta del proyecto:

```bash
# Terminal 1: servidor de Laravel
php artisan serve
```

```bash
# Terminal 2: Vite, que recarga la página al guardar cambios en React
npm run dev
```

Abre **http://localhost:8000**. No uses el puerto de Vite (5173): esa dirección solo sirve los archivos de la página.

> Atajo: `composer run dev` abre todo junto (servidor, Vite, cola y registros) en una sola terminal.

### Opción B: página compilada, sin recarga automática

```bash
npm run build         # compila React en public/build
php artisan serve     # http://localhost:8000
```

Usa esta opción si solo quieres ver la aplicación funcionando. Cada vez que cambies la página tendrás que volver a ejecutar `npm run build`.

> **Importante:** si existe el archivo `public/hot`, Laravel buscará el servidor de Vite. Si la página sale en blanco y no estás ejecutando `npm run dev`, borra `public/hot`.

### Atajo: instalación completa en un solo comando

Cuando ya tienes la base de datos creada (paso 5), este comando hace los pasos 3, 4 y 5.2 y además compila la página:

```bash
composer run setup
```

Ejecuta `composer install`, copia `.env`, genera la clave, ejecuta las migraciones, `npm install` y `npm run build`. Igual tendrás que revisar `.env`, como se indica en el paso 4.

---

## 7. Comprobar que todo funciona

```bash
php artisan test      # pruebas de PHP (usan SQLite en memoria; no tocan tu base MySQL)
npx vitest run        # pruebas de TypeScript
npx tsc --noEmit      # comprobación de tipos de la página
```

Direcciones útiles:

| Dirección | Qué es |
|---|---|
| http://localhost:8000 | Portada y planes |
| http://localhost:8000/admin | Panel de administración (usa `ADMIN_PASSWORD`) |
| http://localhost:8000/verificar | Verificación pública de documentos |
| http://localhost/phpmyadmin | Base de datos (requiere Apache encendido en XAMPP) |

---

## 8. Trabajar con Git día a día

```bash
git status                          # qué archivos cambiaron
git pull                            # traer los últimos cambios de GitHub
git checkout -b mi-nueva-rama       # crear una rama para un cambio
git add .                           # preparar los cambios
git commit -m "Describe el cambio"  # guardar los cambios en tu PC
git push -u origin mi-nueva-rama    # subir la rama a GitHub
```

**Después de cada `git pull`**, si otra persona cambió las dependencias o la base de datos, ejecuta:

```bash
composer install
npm install
php artisan migrate
```

Para traer una rama que se creó en otra PC:

```bash
git fetch origin
git checkout nombre-de-la-rama
```

---

## 9. Problemas frecuentes

| Problema | Solución |
|---|---|
| `php` no se reconoce como comando | Agrega `C:\xampp\php` al PATH (paso 1.2) o usa `C:\xampp\php\php.exe artisan ...` |
| Composer dice que falta `ext-gd`, `ext-zip` o `ext-fileinfo` | Activa la extensión en `php.ini` (paso 1.2) y vuelve a abrir la terminal |
| `SQLSTATE[HY000] [2002]` o *Connection refused* | MySQL no está iniciado en XAMPP o `DB_PORT` no coincide |
| `SQLSTATE[HY000] [1049] Unknown database` | Falta crear la base `autograflow` (paso 5) |
| `No application encryption key has been specified` | Ejecuta `php artisan key:generate` |
| La página sale en blanco o con el error *Vite manifest not found* | Ejecuta `npm run build` o deja `npm run dev` corriendo. Si no usas `npm run dev`, borra `public/hot` |
| `npm run build` falla con un error de versión de Node | Instala Node 22 LTS |
| Cambiaste `.env` y no se nota | Ejecuta `php artisan config:clear` |
| Error al subir un PDF grande | Sube `upload_max_filesize` y `post_max_size` en `php.ini` y reinicia la terminal |
| Errores de permisos en `storage/` | Comprueba que las carpetas `storage` y `bootstrap/cache` se puedan escribir |

---

## 10. Notas para macOS y Linux

- En lugar de XAMPP puedes usar el XAMPP para macOS o Linux, o instalar PHP 8.2 o superior y MySQL/MariaDB con el gestor de paquetes:
  - **macOS:** `brew install php mysql composer node`
  - **Ubuntu/Debian:** `sudo apt install php php-{mysql,sqlite3,mbstring,xml,curl,gd,zip} mysql-server composer` (para Node, usa `nvm` o NodeSource)
- Para copiar el ejemplo de `.env`, usa `cp .env.example .env`.
- Si usas MySQL del sistema, cambia `DB_USERNAME` y `DB_PASSWORD` por tu usuario.

---

Para publicar en un hosting compartido, sigue [deploy/HOSTING-COMPARTIDO.md](../deploy/HOSTING-COMPARTIDO.md).
