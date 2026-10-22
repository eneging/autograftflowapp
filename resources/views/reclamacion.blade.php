<h1>Libro de Reclamaciones</h1>
<h2>Hoja de Reclamación {{ $hoja['numero'] }}</h2>
<p><b>Fecha y hora (Perú):</b> {{ $hoja['registradoEn'] }}<br>
<b>Proveedor:</b> {{ $hoja['proveedor']['razonSocial'] }} — RUC {{ $hoja['proveedor']['ruc'] }}<br>
<b>Domicilio:</b> {{ $hoja['proveedor']['domicilio'] }}<br>
<b>Correo:</b> {{ $hoja['proveedor']['correo'] }}</p>
<h3>1. Identificación del consumidor reclamante</h3>
<p><b>Nombre:</b> {{ $hoja['datos']['nombre'] }}<br>
<b>Documento:</b> {{ $hoja['datos']['documentoTipo'] }} {{ $hoja['datos']['documento'] }}<br>
<b>Domicilio:</b> {{ $hoja['datos']['domicilio'] }}<br>
<b>Teléfono:</b> {{ $hoja['datos']['telefono'] ?? 'No indicado' }}<br>
<b>Correo:</b> {{ $hoja['datos']['email'] ?: 'No indicado' }}<br>
<b>Menor de edad:</b> {{ $hoja['datos']['menor'] ? 'Sí' : 'No' }}<br>
@if($hoja['datos']['menor'])
<b>Padre, madre o representante:</b> {{ $hoja['datos']['representante'] }}<br>
<b>Documento del representante:</b> {{ $hoja['datos']['representanteDocumento'] }}<br>
@endif
<b>Canal de respuesta elegido:</b> {{ $hoja['datos']['canal'] === 'email' ? 'Correo electrónico' : 'Carta al domicilio indicado' }}</p>
<h3>2. Identificación del bien contratado</h3>
<p><b>Tipo:</b> {{ ucfirst($hoja['datos']['bien']) }}<br>
<b>Monto reclamado:</b> {{ $hoja['datos']['monto'] === null ? 'No precisado' : $hoja['datos']['moneda'].' '.$hoja['datos']['monto'] }}<br>
<b>Descripción:</b> {!! nl2br(e($hoja['datos']['descripcion'])) !!}</p>
<h3>3. Detalle de la reclamación y pedido del consumidor</h3>
<p><b>Tipo:</b> {{ ucfirst($hoja['datos']['tipo']) }}<br>
<b>Detalle:</b><br>{!! nl2br(e($hoja['datos']['detalle'])) !!}<br>
<b>Pedido:</b><br>{!! nl2br(e($hoja['datos']['pedido'])) !!}</p>
<p>Presentación virtual: no requiere firma manuscrita.</p>
<h3>4. Observaciones y acciones adoptadas por el proveedor</h3>
@if($incluirRespuesta && $hoja['respuesta'])
<p><b>Responsable:</b> {{ $hoja['responsable'] }}<br>
{!! nl2br(e($hoja['respuesta'])) !!}<br>
<b>Fecha de envío registrada:</b> {{ $hoja['respondidoEn'] ?? 'Pendiente de envío' }} (UTC)<br>
@if($hoja['constanciaPostal'])<b>Guía o constancia postal:</b> {{ $hoja['constanciaPostal'] }}@endif</p>
@else
<p>Pendiente de atención por el proveedor.</p>
@endif
<p><b>Fecha límite de respuesta:</b> {{ $hoja['venceEl'] }}. Máximo 15 días hábiles improrrogables.</p>
<p>Reclamo: disconformidad relacionada con el producto o servicio. Queja: disconformidad con la atención u otros aspectos no relacionados con el producto o servicio.</p>
<p>La presentación no impide acudir a otras vías de solución de controversias ni es requisito previo para denunciar ante el Indecopi. El registro es gratuito y no está condicionado a un pago.</p>
