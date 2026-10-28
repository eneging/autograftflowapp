{{-- Comprobante de pago (Perfiles::comprobante). TCPDF: solo tablas y estilos en línea. --}}
<table cellpadding="0" cellspacing="0" width="100%">
<tr>
<td width="58%">
<span style="font-size:20px;font-weight:bold;color:#141414;">{{ $c['proveedor']['marca'] }}</span><br>
<span style="font-size:9px;color:#555;">
@if($c['proveedor']['razonSocial']){{ $c['proveedor']['razonSocial'] }}<br>@endif
@if($c['proveedor']['domicilio']){{ $c['proveedor']['domicilio'] }}<br>@endif
@if($c['proveedor']['correo']){{ $c['proveedor']['correo'] }}@endif
</span>
</td>
<td width="42%" align="center" style="border:1.5px solid #141414;">
<br><span style="font-size:10px;">@if($c['proveedor']['ruc'])RUC {{ $c['proveedor']['ruc'] }}@else&nbsp;@endif</span><br>
<span style="font-size:13px;font-weight:bold;">COMPROBANTE DE PAGO</span><br>
<span style="font-size:12px;font-weight:bold;">{{ $c['numero'] }}</span><br>
</td>
</tr>
</table>
<br><br>
<table cellpadding="4" cellspacing="0" width="100%" style="font-size:9.5px;">
<tr><td width="28%" style="color:#555;">{{ $c['cliente']['tipo'] === 'factura' ? 'Razón social' : 'Cliente' }}</td><td width="72%"><b>{{ $c['cliente']['nombre'] }}</b></td></tr>
<tr><td style="color:#555;">{{ $c['cliente']['documentoTipo'] === 'PASAPORTE' ? 'Pasaporte' : $c['cliente']['documentoTipo'] }}</td><td>{{ $c['cliente']['documento'] }}</td></tr>
@if($c['cliente']['direccion'])<tr><td style="color:#555;">{{ $c['cliente']['tipo'] === 'factura' ? 'Dirección fiscal' : 'Dirección' }}</td><td>{{ $c['cliente']['direccion'] }}</td></tr>@endif
@if($c['cliente']['correo'])<tr><td style="color:#555;">Correo</td><td>{{ $c['cliente']['correo'] }}</td></tr>@endif
<tr><td style="color:#555;">Comprobante solicitado</td><td>{{ $c['cliente']['tipo'] === 'factura' ? 'Factura' : 'Boleta de venta' }}</td></tr>
<tr><td style="color:#555;">Fecha de pago</td><td>{{ $c['fechaPago'] }} (hora de Perú)</td></tr>
<tr><td style="color:#555;">Medio de pago</td><td>{{ $c['medio'] }}@if($c['operacion']) · operación {{ $c['operacion'] }}@endif</td></tr>
</table>
<br><br>
<table cellpadding="6" cellspacing="0" width="100%" style="font-size:9.5px;">
<tr style="background-color:#141414;color:#ffffff;font-weight:bold;">
<td width="10%" align="center">Cant.</td><td width="60%">Descripción</td><td width="15%" align="right">P. unitario</td><td width="15%" align="right">Importe</td>
</tr>
<tr>
<td align="center" style="border-bottom:0.5px solid #cccccc;">1</td>
<td style="border-bottom:0.5px solid #cccccc;">{{ $c['concepto'] }}</td>
<td align="right" style="border-bottom:0.5px solid #cccccc;">{{ $c['moneda'] }} {{ $c['monto'] }}</td>
<td align="right" style="border-bottom:0.5px solid #cccccc;">{{ $c['moneda'] }} {{ $c['monto'] }}</td>
</tr>
<tr>
<td colspan="3" align="right" style="font-size:11px;"><b>TOTAL PAGADO</b></td>
<td align="right" style="font-size:11px;"><b>{{ $c['moneda'] }} {{ $c['monto'] }}</b></td>
</tr>
</table>
<br><br><br>
<span style="font-size:8px;color:#666;">Emitido el {{ $c['emitido'] }}. Este documento es una constancia del pago realizado en {{ $c['proveedor']['marca'] }} con los datos de facturación indicados por el cliente; no es un comprobante electrónico validado por SUNAT.</span>
