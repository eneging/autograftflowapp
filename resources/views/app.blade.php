<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#ffffff" />
    <meta name="description" content="Envía tus PDF por WhatsApp y recibe firmas desde el celular con AutograFlow. Empieza gratis, sigue cada firma y descarga el documento con su certificado." />
    <title>AutograFlow — Firma tus documentos</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2064%2064%27%3E%3Crect%20x%3D%2710%27%20y%3D%2710%27%20width%3D%2748%27%20height%3D%2748%27%20rx%3D%2710%27%20fill%3D%27%23191919%27%2F%3E%3Crect%20x%3D%275%27%20y%3D%275%27%20width%3D%2748%27%20height%3D%2748%27%20rx%3D%2710%27%20fill%3D%27%23fff%27%20stroke%3D%27%23191919%27%20stroke-width%3D%273.6%27%2F%3E%3Ctext%20x%3D%2729%27%20y%3D%2738%27%20text-anchor%3D%27middle%27%20font-family%3D%27Georgia%2Cserif%27%20font-weight%3D%27700%27%20font-size%3D%2729%27%20fill%3D%27%23191919%27%3EA%3C%2Ftext%3E%3Cpath%20d%3D%27M14.5%2045.5c5-4.2%208.6%202.4%2013.2-.8%204.2-3%207.6-4.6%2012.3-.6%27%20fill%3D%27none%27%20stroke%3D%27%23191919%27%20stroke-width%3D%272.6%27%20stroke-linecap%3D%27round%27%2F%3E%3C%2Fsvg%3E" />
    {{-- Tema y paleta antes de dibujar (sin parpadeo de colores). La paleta propia trae sus variables ya calculadas (apariencia.ts). --}}
    <script>try{var h=document.documentElement,s=localStorage;h.setAttribute("data-theme",s.getItem("autograflow_tema")==="dark"?"dark":"light");var p=s.getItem("autograflow_paleta");if(/^(urban|frosted|autumn|propia)$/.test(p||"")){h.setAttribute("data-paleta",p);var v=p==="propia"?JSON.parse(s.getItem("autograflow_paleta_vars")||"{}"):{};for(var k in v)if(/^--[a-zA-Z0-9]+$/.test(k)&&/^#[0-9a-fA-F]{6,8}$/.test(v[k]))h.style.setProperty(k,v[k])}}catch(e){}</script>
    @viteReactRefresh
    @vite('resources/web/src/main.tsx')
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
