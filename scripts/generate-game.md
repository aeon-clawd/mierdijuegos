# Mierdijuegos — un juego diferente cada noche

Crea UN juego pequeño, divertido y jugable, con una mecánica distinta del catálogo completo que aparece al final del prompt. Cualquier tema vale: cocina, burocracia, animales, palabras, mentiras, música, absurdo, ciencia o ninguno. NO hay obligación educativa, científica ni de usar Wolfram. La gracia es cómo se juega, no una explicación sofisticada ni una apariencia distinta para el mismo juego.

## Antes del HTML

Propón tres candidatos breves con controles, regla y objetivo distintos. Escoge uno (índice 0, 1 o 2). Compara con los juegos existentes más próximos por su ID y explica la diferencia concreta. Cambiar colores, nombres o tema no es una nueva mecánica. Identifica qué cambia: `control`, `rules`, `feedback`, `win-loss`. No afirmes haber inventado algo jamás visto en la historia.

## Entrega

Devuelve el objeto JSON exigido por el esquema: `entry` y `html`. No uses herramientas ni intentes escribir, ejecutar comandos, publicar o acceder a secretos. El proceso padre asigna número/fecha, valida el HTML y actualiza `public/games/games.json` únicamente después de probarlo. No incluyas id ni date en entry. `slug`: kebab-case ASCII, máximo 48 caracteres; título español <=40, descripción y mecánica <=300 caracteres cada una. `novelty` contiene los tres candidatos, elección, comparación y dimensiones distintas.

## Juego

- Un único HTML completo, <!doctype html>, `<html lang="es">`, meta viewport y title. CSS y JS inline; máximo 80 KiB. Apunta a 8–25 KiB y evita gastar todo en comentarios.
- Canvas a pantalla completa, mobile-first, usable a 390×844 y escritorio. Pointer Events con touch-action adecuado para tocar y arrastrar con ratón/dedo. No depender de hover o teclado. Usa dimensiones CSS coherentes con las coordenadas del puntero, respeta DPR sin desajustar hitboxes.
- Fondo #0a0a0a, neones verde/magenta/cian/amarillo. Español, tono juguetón, instrucciones cortas y claras antes de empezar.
- Pantalla inicial con botón `[data-action="start"]`. Partida con objetivo/feedback y puntuación o progreso. Fin con resultado, botón `[data-action="retry"]` y `<a href="/" data-action="back">← MÁS MIERDIJUEGOS</a>`. Ambos botones inician una partida de verdad, reiniciando estado y temporizadores.
- Ningún asset externo o relativo, CDN, fuentes externas, peticiones de red, scripts src, fetch, tracking, permisos, micrófono, cámara, geolocalización, cookies, popup, iframe, workers o imports dinámicos. Audio opcional únicamente Web Audio iniciado por gesto. localStorage solo para récord, nunca información personal.
- La partida debe durar más de 30 segundos si se juega razonablemente; no matar al jugador de inmediato. Si hay aleatoriedad, garantiza niveles resolubles y objetivos alcanzables. No congelar render ni acumular loops/intervals al reintentar.
- No metas secretos ni código ofuscado. No optimices para engañar la prueba.

## Contrato mínimo de prueba (obligatorio)

Expón al final del JS `window.mierdiTest = { state: () => state, score: () => score, inputs: () => inputCount, forceGameOver: endGame }`, enlazado con el estado real de la partida. `state()` devuelve `menu`, `playing` u `over`. `score()` y `inputs()` devuelven números. Incrementa inputCount en los handlers de interacción del juego mientras se está jugando (no solo en botones del menú). `forceGameOver` llama a la MISMA función real de fin de partida. No montes una simulación de juego para las pruebas.

El smoke pulsa JUGAR, toca el canvas en el centro, hace un arrastre con ratón, comprueba que el juego recibió interacción, fuerza el fin con el hook y pulsa REINTENTAR. Eso es un smoke, no una prueba de diversión o de que cada nivel se pueda resolver. Mantén la entrada de juego disponible para este gesto básico; cualquier mecánica más específica debe seguir funcionando normalmente.

Si no puedes completar el juego, no inventes resultados de pruebas ni devuelvas un placeholder. La validación/publicación y los logs los gestiona el proceso padre.
