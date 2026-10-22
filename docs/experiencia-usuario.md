# Experiencia de entrada a AutograFlow

## Objetivo

Ayudar a una persona nueva a entender qué recibe, cómo funciona y cómo preparar su primer documento. La propuesta busca reducir dudas antes del registro; su efecto sobre la activación debe medirse con usuarios reales.

## Referencias consultadas

- [NN/g: Homepage Design — 5 Fundamental Principles](https://www.nngroup.com/articles/homepage-design-principles/). Explicar el propósito y el valor del producto desde la portada, con puntos de entrada claros.
- [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/). Presentar primero las decisiones esenciales y dejar las opciones detalladas para cuando sean necesarias.
- [NN/g: Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/). Dar orientación cerca de la tarea, cuando la persona puede aplicarla.

Consulta: 22 de octubre de 2026. Son principios de diseño, no una garantía de mayor conversión.

## Maqueta implementada

1. Portada con beneficio concreto, botón «Empezar gratis» y alternativa sin cuenta. Se mantienen los límites del catálogo compartido.
2. Documento ilustrativo identificado como ejemplo, sin testimonios, cifras de clientes ni actividad ficticia presentada como real.
3. Demostración manual de tres pasos. Cambia mediante botones y permite explorar el proceso antes de registrarse; no sube documentos ni envía mensajes.
4. Resumen del plan gratuito y acceso a la comparación de planes en su ruta existente. La portada se puede leer sin esperar la API del catálogo.
5. Preguntas frecuentes desplegables antes del registro.
6. Orientación junto a la subida del primer documento en el panel vacío.
7. Navegación por teclado, enlace para saltar al contenido, foco visible, avisos de la demostración y estilos adaptados a móvil y tema oscuro.
8. Error recuperable al cargar el catálogo en la página de planes.

## Evaluación recomendada

Probar con personas que no conocen el producto: pedirles que expliquen qué hace, encuentren cómo empezar gratis y preparen un PDF. Observar dudas, errores y si logran compartir el enlace sin ayuda.

Para evaluar el resultado en producción, medir el recorrido portada → registro o invitado → primer PDF preparado → documento enviado → documento completado. Comparar tasas y tiempo hasta el primer envío antes y después, separando móvil y escritorio. No se incorporó analítica ni seguimiento nuevo en esta modificación.
