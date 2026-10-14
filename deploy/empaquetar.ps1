# Genera deploy/autograflow-hosting.zip, listo para subir a un hosting compartido.
#   Uso (en la carpeta autograflow):  powershell -ExecutionPolicy Bypass -File deploy/empaquetar.ps1
# Compila React, copia el proyecto sin lo que no va al servidor e instala las dependencias de PHP de producción
# en esa copia (tu carpeta de trabajo no cambia: puedes seguir corriendo las pruebas).
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$temporal = Join-Path ([IO.Path]::GetTempPath()) "autograflow-paquete"
$zip = Join-Path $PSScriptRoot "autograflow-hosting.zip"

Write-Host "1/4 Compilando la página React..." -ForegroundColor Cyan
Push-Location $raiz
npm run build
if ($LASTEXITCODE -ne 0) { throw "Falló npm run build" }
Pop-Location

Write-Host "2/4 Copiando archivos..." -ForegroundColor Cyan
if (Test-Path $temporal) { Remove-Item $temporal -Recurse -Force }
$excluirCarpetas = @("node_modules", "vendor", "tests", ".git", ".idea", ".vscode")
$excluirArchivos = @(".env", ".env.backup", ".phpunit.result.cache", "hot", "autograflow-hosting.zip", "*.log")
robocopy $raiz $temporal /E /NFL /NDL /NJH /NJS /NP /XD $excluirCarpetas (Join-Path $raiz "storage") /XF $excluirArchivos | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Falló la copia (robocopy $LASTEXITCODE)" }

# storage vacío pero con su estructura (los PDF y las sesiones se crean en el servidor).
foreach ($c in @("app/private", "app/public", "framework/cache/data", "framework/sessions", "framework/views", "logs")) {
    New-Item -ItemType Directory -Force (Join-Path $temporal "storage/$c") | Out-Null
    Set-Content -Path (Join-Path $temporal "storage/$c/.gitignore") -Value "*`n!.gitignore" -Encoding ascii
}
Get-ChildItem (Join-Path $temporal "bootstrap/cache") -Filter *.php -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "3/4 Instalando dependencias de PHP (sin las de desarrollo)..." -ForegroundColor Cyan
Push-Location $temporal
composer install --no-dev --optimize-autoloader --no-interaction --no-progress
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Falló composer install" }
Pop-Location

Write-Host "4/4 Comprimiendo..." -ForegroundColor Cyan
if (Test-Path $zip) { Remove-Item $zip -Force }
# Cada entrada con «/»: el hosting es Linux y con «\» los archivos se descomprimirían mal.
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$archivo = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
try {
    Get-ChildItem $temporal -Recurse -File -Force | ForEach-Object {
        $ruta = $_.FullName.Substring($temporal.Length).TrimStart('\').Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archivo, $_.FullName, $ruta, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $archivo.Dispose()
}
Remove-Item $temporal -Recurse -Force

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Listo: $zip ($mb MB)" -ForegroundColor Green
Write-Host "Sigue deploy/HOSTING-COMPARTIDO.md desde el paso 2."
