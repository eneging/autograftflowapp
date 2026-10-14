<!doctype html>
<html lang="es">
<body style="margin:0;background:#f6f4fb;font-family:Arial,sans-serif;color:#1f1330">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:900;letter-spacing:-1px"><span style="color:#4d148c">Autogra</span><span style="color:#ff6200">Flow</span></div>
  <div style="background:#fff;border:1px solid #e7e1f3;border-radius:16px;padding:22px;margin-top:14px">
    <h1 style="font-size:20px;margin:0 0 12px">{{ $titulo }}</h1>
    @foreach ($parrafos as $p)
      <p style="line-height:1.5;color:#4b4560">{{ $p }}</p>
    @endforeach
    @if ($boton)
      <p style="margin:22px 0 6px"><a href="{{ $boton['url'] }}" style="background:#4d148c;color:#fff;text-decoration:none;font-weight:bold;padding:13px 20px;border-radius:10px;display:inline-block">{{ $boton['texto'] }}</a></p>
      <p style="font-size:12px;color:#6b7280;word-break:break-all">{{ $boton['url'] }}</p>
    @endif
  </div>
  <p style="font-size:12px;color:#6b7280;text-align:center">Enviado por AutograFlow. Si no esperabas este correo, puedes ignorarlo.</p>
</div>
</body>
</html>
