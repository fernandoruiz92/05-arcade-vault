# SPEC 01 — MVP visual: las cinco pantallas de Arcade Vault

> **Estado:** Implementado
> **Depende de:** —
> **Fecha:** 2026-08-02
> **Objetivo:** Portar a Next.js 16 las cinco pantallas de la maqueta en `references/` (biblioteca, detalle, reproductor, autenticación y salón de la fama) como interfaz puramente visual, sin implementar ningún juego.

---

## Por qué existe este spec

El repositorio es hoy un scaffold de `create-next-app` sin código de producto. En `references/` hay una maqueta completa en React 18 con Babel standalone: nueve archivos que definen un tema retro de neón y cinco pantallas funcionando.

Dos observaciones sobre esa carpeta que condicionan el trabajo:

1. **Los nombres de archivo están desfasados respecto a su contenido.** Cada archivo lleva el nombre de otro:

   | Archivo | Contenido real |
   | --- | --- |
   | `app.jsx` | el `index.html` |
   | `Arcade Vault.html` | `biblioteca.jsx` (Library) |
   | `auth.jsx` | `nav.jsx` (Nav) |
   | `biblioteca.jsx` | `data.jsx` (GAMES, CATS, seededScores) |
   | `data.jsx` | `styles.css` |
   | `detalle.jsx` | `auth.jsx` (Auth) |
   | `nav.jsx` | `app.jsx` (App + router en el hash) |
   | `salon.jsx` | `reproductor.jsx` (GamePlayer) |
   | `styles.css` | `salon.jsx` (HallOfFame) |

2. **Falta el contenido de `GameDetail`.** Hay nueve archivos y nueve contenidos, pero ninguno es la pantalla de detalle. Sí existe su CSS completo (`.av-detail`, `.detail-cover`, `.stat-strip`, `.leaderboard`, `.lb-row`) y su contrato de uso en `App`. Se reconstruye a partir de ahí.

---

## Alcance

**Dentro:**

- **Tema global.** `references/styles.css` se porta casi literal a `app/globals.css`, conservando los nombres de clase originales (`.card`, `.btn`, `.crt`, `.cover-*`, `.podium-slot`…). Los colores y las dos familias tipográficas se declaran además como tokens en `@theme inline`.
- **Tipografías.** `Press Start 2P` y `JetBrains Mono` cargadas con `next/font/google` y enlazadas a `--pixel` y `--mono`. Se elimina el `font-family: Arial` que hoy `globals.css` fuerza sobre `body`.
- **Fondo global.** Los dos nodos decorativos `.av-bg` (rejilla en perspectiva + scanlines + viñeta) y `.av-noise` viven en `app/layout.tsx`.
- **Datos mock tipados.** `lib/games.ts` con los 8 juegos, las 5 categorías, los 18 jugadores y `seededScores`, contenido idéntico al referente y tipos `Game` y `ScoreRow`.
- **Sesión simulada.** Un contexto cliente que persiste el usuario en `localStorage` bajo `av_user` y las puntuaciones bajo `av_scores`.
- **Chrome de la aplicación.** Barra de navegación fija con logo, enlaces, contador de créditos, botón de sesión, panel lateral móvil con backdrop, y el pie de página.
- **Cinco rutas.** `/` (biblioteca), `/juego/[id]` (detalle), `/jugar/[id]` (reproductor), `/auth` y `/salon`.
- **Biblioteca.** Hero con parpadeo, buscador por nombre, chips de categoría, rejilla de tarjetas con inclinación 3D al pasar el ratón y estado vacío «NO HAY RESULTADOS».
- **Detalle.** Reconstruida a partir del CSS existente: portada 16/10, título, etiquetas, descripción larga, franja de tres estadísticas, acciones y tabla de clasificación del juego.
- **Reproductor.** HUD con jugador, puntuación, vidas y nivel; chasis CRT con arena animada; pausa; modal de fin con guardado de puntuación y toast de máquina de escribir.
- **Autenticación.** Tarjeta con pestañas iniciar sesión / crear cuenta, campos, entrada como invitado y botones sociales decorativos.
- **Salón de la fama.** Pestañas por juego, podio de tres puestos, tabla de doce filas con animación escalonada y la fila destacada del usuario cuando hay sesión.
- **Responsive.** Los mismos puntos de corte del referente: 900 px para el detalle, 840 px para la barra de navegación, 720 px para podio y tablas.

**Fuera de alcance (para specs futuros):**

- Cualquier motor de juego. Ninguno de los 8 títulos es jugable.
- Autenticación real, backend, base de datos o sesiones de servidor.
- Puntuaciones reales, ranking global o competición entre usuarios.
- Sistema de créditos o monedas. El «CRÉDITOS · 03» de la barra es texto fijo.
- Los botones de Google y GitHub. Son decorativos y no navegan a ningún sitio.
- Página de perfil o de cuenta. El botón con el nombre del usuario solo cierra sesión.
- Framework de tests y CI.
- Accesibilidad más allá de la del referente y `prefers-reduced-motion`.
- Metadata por ruta, Open Graph y SEO.
- Ampliar el catálogo de juegos o de jugadores.
- Internacionalización. La interfaz es solo español.

---

## Modelo de datos

Dos módulos concentran todo el estado. No hay backend ni esquema de base de datos.

### `lib/games.ts` — catálogo estático

```ts
export type Category = "TODOS" | "ARCADE" | "PUZZLE" | "SHOOTER" | "VERSUS";
export type Accent = "cyan" | "magenta" | "yellow" | "green";

export type Game = {
  id: string;        // "bloque-buster" — también es el segmento de URL
  title: string;     // "BLOQUE BUSTER"
  short: string;     // una línea, para la tarjeta
  long: string;      // párrafo, para el detalle
  cat: Exclude<Category, "TODOS">;
  cover: string;     // "cover-bricks" — clase CSS que genera la portada
  color: Accent;     // color del botón JUGAR
  best: number;      // 28450
  plays: string;     // "12.4K"
};

export type ScoreRow = {
  rank: number;
  name: string;      // "PX_KAI"
  score: number;
  date: string;      // "07/03/2026" — formato dd/mm/yyyy, ya renderizado
};

export const GAMES: Game[];              // los 8 títulos del referente
export const CATS: Category[];           // ["TODOS", "ARCADE", "PUZZLE", "SHOOTER", "VERSUS"]
export const PLAYERS: string[];          // los 18 alias
export function seededScores(seed: number, count?: number): ScoreRow[];
```

### `lib/session.tsx` — sesión y puntuaciones simuladas

```ts
export type AvUser = { name: string };   // nombre en mayúsculas, máximo 10 caracteres

export type ScoreEntry = {
  game: string;      // Game["id"]
  name: string;
  score: number;
  at: number;        // Date.now() en el momento de guardar
};

// Claves de localStorage
const USER_KEY = "av_user";      // AvUser | null, serializado con JSON
const SCORES_KEY = "av_scores";  // ScoreEntry[], se hace push, nunca se poda
```

### Convenciones

- **`seededScores` es determinista.** Usa un generador congruencial lineal (`s = (s * 9301 + 49297) % 233280`) sin `Date` ni `Math.random`, así que servidor y cliente producen las mismas filas. La semilla de cada juego se deriva de su `id`, igual que en el referente.
- **`Game.cover` es una clase CSS, no una imagen.** Las ocho portadas se dibujan con gradientes y pseudoelementos. No hay ni un archivo en `public/`.
- **Números formateados con `toLocaleString("es-ES")`.** Se hace solo en cliente o con valores que ya coinciden entre servidor y cliente.
- **Las claves de `localStorage` no llevan versión.** Son las del referente y los datos son desechables: si el formato cambia, se descartan.
- **Nada de `localStorage` se lee durante el render.** Ver la sección de riesgos.
- **`av_scores` se escribe pero nunca se lee.** El salón de la fama sigue mostrando `seededScores`, igual que el referente.

---

## Plan de implementación

Cada paso deja la aplicación arrancable con `npm run dev` y es commiteable por sí solo.

1. **Tema global.** Portar `references/styles.css` a `app/globals.css` conservando los nombres de clase. Mantener el `@import "tailwindcss"` en la primera línea y declarar los colores y las dos fuentes como tokens dentro de `@theme inline`. Eliminar el `font-family: Arial` del `body`. Comprobación manual: `npm run dev`, la página del scaffold aparece con fondo oscuro y texto claro.

2. **Chasis del layout.** En `app/layout.tsx`, cargar `Press Start 2P` y `JetBrains Mono` con `next/font/google` sobre las variables `--pixel` y `--mono`, poner `lang="es"` y renderizar los divs `.av-bg` y `.av-noise` antes del contenido. Comprobación manual: se ve la rejilla en perspectiva animada, las scanlines y el grano.

3. **Catálogo.** Crear `lib/games.ts` con los tipos `Game`, `ScoreRow`, `Category` y `Accent`, las constantes `GAMES`, `CATS`, `PLAYERS` y la función `seededScores`. Comprobación manual: `npx tsc --noEmit` sin errores.

4. **Sesión.** Crear `lib/session.tsx` con `SessionProvider` y el hook `useSession`, que expone `user`, `signIn`, `signOut` y `saveScore`. La lectura de `localStorage` ocurre dentro de un `useEffect`, nunca en el render inicial. Montar el proveedor en `app/layout.tsx`. Comprobación manual: la aplicación sigue cargando y la consola no muestra avisos de hidratación.

5. **Navegación.** Crear `components/Nav.tsx` (cliente) con logo, los enlaces a Biblioteca y Salón de la Fama usando `<Link>`, el estado activo derivado de `usePathname`, el contador de créditos fijo, el botón de sesión y el panel lateral móvil con su backdrop. Añadir el pie de página en `app/layout.tsx`. Comprobación manual: la barra aparece en todas las rutas y por debajo de 840 px el hamburguesa abre y cierra el panel.

6. **Tarjeta de juego.** Crear `components/GameCard.tsx` (cliente) con la portada generada por CSS, la etiqueta de categoría, título, descripción corta, la mejor puntuación y el botón JUGAR con su color de acento. El efecto de inclinación 3D se aplica con un `ref` sobre `style.transform`, igual que el referente. Comprobación manual: montar una tarjeta suelta y verificar que se inclina al pasar el ratón.

7. **Biblioteca.** Sustituir `app/page.tsx` por la pantalla de biblioteca (cliente): hero con `.flicker`, buscador controlado, chips de categoría, rejilla filtrada por nombre y categoría, y el estado vacío. Comprobación manual: buscar «ser» deja solo SERPENTINA; el chip PUZZLE deja solo CAÍDA; una búsqueda sin resultados muestra «NO HAY RESULTADOS».

8. **Clasificación.** Crear `components/Leaderboard.tsx`, que recibe un `Game` y pinta diez filas de `seededScores` con los estilos de oro, plata y bronce en los tres primeros puestos. Comprobación manual: `npx tsc --noEmit` sin errores.

9. **Detalle.** Crear `app/juego/[id]/page.tsx` como componente de servidor asíncrono que hace `await params`, busca el juego y llama a `notFound()` si no existe. Renderiza portada, título, etiquetas, descripción larga, la franja de estadísticas (mejor puntuación, partidas, categoría), los botones JUGAR y VOLVER, y el `Leaderboard`. Ejecutar `npx next typegen` para tipar con `PageProps<'/juego/[id]'>`. Comprobación manual: pulsar una tarjeta lleva a `/juego/caida` y la URL es compartible; `/juego/inexistente` da 404.

10. **Reproductor: HUD y pantalla.** Crear `app/jugar/[id]/page.tsx` (servidor, resuelve el juego) que monta `components/GamePlayer.tsx` (cliente) con el HUD de jugador, puntuación, vidas y nivel, el chasis CRT con la arena animada y la barra inferior, los botones PAUSA, FIN y SALIR, y el velo de EN PAUSA. La puntuación sube con un `setInterval` de 220 ms que se detiene en pausa y al terminar. Comprobación manual: la puntuación corre, PAUSA la congela y muestra el velo, SALIR vuelve al detalle.

11. **Reproductor: fin de partida.** Añadir `components/GameOverModal.tsx` con la puntuación final, el campo de iniciales limitado a 10 caracteres en mayúsculas, GUARDAR PUNTUACIÓN que llama a `saveScore` y deja el toast de máquina de escribir, y las acciones JUGAR DE NUEVO y VOLVER AL VAULT. Comprobación manual: pulsar FIN abre el modal; guardar muestra el toast y añade una entrada a `av_scores`; jugar de nuevo reinicia el marcador a cero.

12. **Autenticación.** Crear `app/auth/page.tsx` (cliente) con las dos pestañas, los campos de usuario, correo (solo en crear cuenta, con la animación de entrada) y contraseña, el botón de envío, JUGAR COMO INVITADO, el separador y los dos botones sociales decorativos. El envío llama a `signIn` con el nombre en mayúsculas recortado a 10 caracteres y navega a `/`. Comprobación manual: entrar con «px_kai» deja «PX_KAI ▾» en la barra y sobrevive a un refresco.

13. **Salón de la fama.** Crear `app/salon/page.tsx` (cliente) con la cabecera en degradado, las pestañas por juego, el podio de tres puestos y la tabla de doce filas con la animación escalonada. Cuando hay sesión, añadir la etiqueta y la fila destacada del usuario. Comprobación manual: cambiar de pestaña cambia las filas; con sesión aparece la fila amarilla al final.

14. **Limpieza del scaffold.** Borrar los SVG sin usar de `public/` y cualquier resto del `create-next-app`. Comprobación manual: `npm run build` y `npm run lint` sin errores ni avisos.

---

## Criterios de aceptación

### Base

- [ ] `npm run build` termina sin errores.
- [ ] `npm run lint` no reporta errores ni avisos.
- [ ] `npx tsc --noEmit` termina sin errores.
- [ ] Al cargar cualquier ruta, la consola del navegador no muestra errores ni avisos de hidratación.
- [ ] `public/` no contiene los SVG del scaffold de `create-next-app`.

### Tema

- [ ] El texto de interfaz usa `Press Start 2P` y el texto corrido usa `JetBrains Mono`; en ningún punto se ve Arial.
- [ ] La rejilla en perspectiva del fondo se desplaza en bucle y las scanlines son visibles sobre el contenido.
- [ ] `app/globals.css` define los ocho colores del referente (`--cyan`, `--magenta`, `--yellow`, `--green`, `--gold`, `--silver`, `--bronze`, más los tres de fondo) y están declarados como tokens en `@theme inline`.

### Navegación

- [ ] La barra está fija arriba y visible en las cinco rutas.
- [ ] En `/` el enlace «Biblioteca» está en cian con su subrayado de neón; en `/salon` lo está «Salón de la Fama».
- [ ] En `/juego/caida` y en `/jugar/caida` el enlace activo sigue siendo «Biblioteca».
- [ ] Por debajo de 840 px los enlaces y el contador de créditos desaparecen y aparece el botón hamburguesa.
- [ ] El hamburguesa abre el panel lateral deslizándolo; pulsar el backdrop lo cierra.
- [ ] Sin sesión, la barra muestra «Iniciar Sesión»; con sesión muestra el nombre del usuario seguido de «▾».
- [ ] El pie de página muestra «© 2026 ARCADE VAULT · HECHO CON PIXELES Y NEÓN · v2.6.0».

### Biblioteca (`/`)

- [ ] Se muestran las 8 tarjetas del catálogo.
- [ ] Escribir «ser» en el buscador deja únicamente SERPENTINA.
- [ ] Pulsar el chip PUZZLE deja únicamente CAÍDA; el chip activo se pinta en magenta.
- [ ] Combinar el chip SHOOTER con la búsqueda «caída» muestra el bloque «NO HAY RESULTADOS».
- [ ] Cada tarjeta muestra su portada generada por CSS, su etiqueta de categoría y su mejor puntuación con separador de miles español (28.450).
- [ ] Pasar el ratón sobre una tarjeta la inclina y le enciende el borde cian.
- [ ] Pulsar una tarjeta, o su botón JUGAR, navega a `/juego/<id>`.

### Detalle (`/juego/[id]`)

- [ ] `/juego/caida` muestra el título CAÍDA, su descripción larga y su portada `cover-tetro`.
- [ ] La franja de estadísticas muestra tres valores: mejor puntuación, partidas y categoría.
- [ ] La tabla de clasificación muestra 10 filas y los puestos 1, 2 y 3 salen en oro, plata y bronce.
- [ ] El botón JUGAR navega a `/jugar/caida`.
- [ ] `/juego/no-existe` devuelve la página 404 de Next.
- [ ] Por debajo de 900 px las dos columnas se apilan.

### Reproductor (`/jugar/[id]`)

- [ ] El HUD muestra jugador, puntuación, vidas como corazones y nivel con dos dígitos.
- [ ] Sin sesión el jugador es «INVITADO»; con sesión es el nombre del usuario.
- [ ] La puntuación aumenta sola aproximadamente cinco veces por segundo.
- [ ] PAUSA detiene el contador y superpone el velo «EN PAUSA»; REANUDAR lo reactiva.
- [ ] El nivel sube al cruzar cada múltiplo de 2500 puntos.
- [ ] Dentro del CRT se ven la rejilla animada, la nave cian oscilando y los tres enemigos a la deriva.
- [ ] SALIR navega a `/juego/<id>`.
- [ ] FIN abre el modal con la puntuación final formateada.
- [ ] En el modal, el campo de iniciales convierte a mayúsculas y corta a 10 caracteres.
- [ ] GUARDAR PUNTUACIÓN sustituye el campo por el toast «▸ PUNTUACIÓN GUARDADA_» con efecto de máquina de escribir y añade una entrada a `av_scores` en `localStorage`.
- [ ] JUGAR DE NUEVO cierra el modal y devuelve puntuación a 0, vidas a 3 y nivel a 01.
- [ ] VOLVER AL VAULT navega a `/`.

### Autenticación (`/auth`)

- [ ] La pestaña INICIAR SESIÓN muestra usuario y contraseña; CREAR CUENTA añade el campo de correo con la animación de entrada.
- [ ] El botón de envío dice «ENTRAR AL VAULT» o «CREAR Y JUGAR» según la pestaña.
- [ ] Enviar con el usuario «px_kai» navega a `/` y la barra pasa a mostrar «PX_KAI».
- [ ] Enviar con el campo de usuario vacío inicia sesión como «PLAYER1».
- [ ] JUGAR COMO INVITADO navega a `/` sin dejar sesión iniciada.
- [ ] Tras iniciar sesión, refrescar el navegador conserva la sesión.
- [ ] Pulsar el nombre del usuario en la barra cierra la sesión y borra `av_user`.
- [ ] Los botones GOOGLE y GITHUB son visibles y no hacen nada al pulsarlos.

### Salón de la fama (`/salon`)

- [ ] Hay una pestaña por cada uno de los 8 juegos y la primera está activa al entrar.
- [ ] Cambiar de pestaña cambia las filas de la tabla y del podio.
- [ ] Las mismas pestañas producen siempre las mismas puntuaciones entre recargas.
- [ ] El podio muestra el primer puesto en el centro, más alto, con el rótulo CAMPEÓN.
- [ ] La tabla muestra 12 filas ordenadas de mayor a menor puntuación y aparecen escalonadas.
- [ ] Con sesión, al final de la tabla aparecen la etiqueta «▸ TU MEJOR MARCA EN <juego>» y la fila amarilla del usuario.
- [ ] Sin sesión, ni la etiqueta ni la fila del usuario aparecen.
- [ ] Por debajo de 720 px el podio se apila en una columna.

---

## Decisiones

### Estructura y framework

- **Sí:** rutas reales del App Router (`/`, `/juego/[id]`, `/jugar/[id]`, `/auth`, `/salon`). Da URLs compartibles, 404 gratis y prefetch en los `<Link>`.
- **No:** portar el router del referente, que serializa la ruta a JSON y la mete en el hash. Funciona, pero desperdicia el framework y ninguna pantalla es enlazable.
- **No:** montar el reproductor como modal sobre el detalle. Tener `/jugar/<id>` propio deja la pantalla completa sin competir con el fondo del detalle.
- **Sí:** rutas en español y código en inglés. Es lo que ya hace el referente y separa lo que lee el usuario de lo que lee el equipo.
- **Sí:** servidor por defecto, cliente donde hay estado. Solo `Nav`, `GameCard`, la biblioteca, el reproductor, el formulario de acceso y el salón llevan `'use client'`.

### Estilos

- **Sí:** portar `styles.css` casi literal a `app/globals.css` con los nombres de clase intactos. Es CSS con `clip-path`, portadas dibujadas en `::after` y una docena de `@keyframes`; traducirlo a utilidades daría un resultado peor tras mucho más trabajo.
- **Sí:** duplicar los colores y las fuentes como tokens en `@theme inline`. Cuesta veinte líneas y deja disponibles utilidades como `text-cyan` para lo que se construya después.
- **No:** reescribir el diseño en utilidades de Tailwind. Se descarta por coste y por riesgo de desviación visual, no por dogma.
- **No:** CSS Modules por componente. Partiría en trozos un tema que el referente ya tiene resuelto como una unidad y complicaría el port.
- **Sí:** portadas por CSS. Ocho fondos generados con gradientes, cero peticiones de imagen, cero decisiones sobre `next/image`.

### Datos y estado

- **Sí:** `localStorage` para `av_user` y `av_scores`, igual que el referente. Que la sesión sobreviva a un refresco es lo que separa una maqueta de una demo creíble.
- **No:** cookies o sesión de servidor. Implicaría decidir sobre auth de verdad, y esto es una fachada.
- **Sí:** leer `localStorage` dentro de `useEffect`, con `null` como estado inicial. Ver riesgos.
- **Sí:** conservar el generador congruencial lineal de `seededScores` tal cual. Es determinista, así que servidor y cliente coinciden sin esfuerzo.
- **Sí:** escribir en `av_scores` aunque nadie lo lea. Mantiene el gesto del referente y deja el gancho puesto para el spec que cierre el ciclo.
- **No:** que el salón lea las puntuaciones guardadas. Mezclar datos sembrados con datos reales exige decidir orden, deduplicación y empates; eso es un spec, no un detalle.
- **Sí:** el catálogo en `lib/games.ts` tipado, no en JSON. TypeScript valida el contenido en el sitio donde se define.

### Alcance

- **Sí:** reconstruir la pantalla de detalle desde su CSS. El CSS está completo y el contrato del componente es conocido; esperar a un archivo que puede no existir bloquea el MVP entero.
- **Sí:** portar el reproductor completo, temporizador incluido. Simular una puntuación que sube no es implementar un juego: es la maqueta de la pantalla, que es justo lo que pide este spec.
- **No:** framework de tests. Elegir runner y configurarlo es una decisión con consecuencias que merece su propio spec, y aquí no hay lógica que testear, hay píxeles que mirar.
- **No:** `prefers-reduced-motion`, `aria-label` y foco por teclado más allá de lo que ya trae el referente. Se deja fuera conscientemente, no por olvido: la accesibilidad de este diseño merece un repaso propio.
- **No:** metadata por ruta y Open Graph. Trivial de añadir después y ortogonal a lo visual.
- **No:** ampliar el catálogo. Ocho juegos bastan para que la rejilla y el salón se vean poblados.

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Desajuste de hidratación al leer `localStorage`. El servidor no tiene sesión y el cliente sí, así que la barra renderizaría «Iniciar Sesión» en el HTML y el nombre del usuario al hidratar. | El estado inicial de `SessionProvider` es siempre `null`. La lectura ocurre en un `useEffect`, de modo que el primer render del cliente coincide con el del servidor y la sesión aparece justo después. |
| `toLocaleString("es-ES")` puede formatear distinto en el servidor que en el navegador según el ICU disponible. | Solo se usa en componentes de cliente o sobre valores que ya se renderizan tras el montaje. Si aparece un desajuste, se sustituye por un formateador propio con punto como separador de miles. |
| Nombres de clase globales sin prefijo (`.card`, `.btn`, `.chip`, `.modal`) chocando con lo que se construya en specs futuros. | Todo el tema está en `app/globals.css` y las clases vienen del referente. Cualquier componente nuevo que no sea de este spec usa utilidades de Tailwind o un prefijo propio. |
| El port de 951 líneas de CSS es tedioso y es donde más fácil se cuela una regla perdida. | Se copia el archivo completo de una vez en el paso 1, en lugar de ir extrayendo reglas pantalla a pantalla. Los criterios de aceptación visuales cubren el resto. |
| El detalle reconstruido no coincidirá exactamente con el `detalle.jsx` original si este aparece. | El CSS fija la estructura casi por completo. Si aparece el archivo, la diferencia se resuelve con un ajuste, no con una reescritura. |
| El `setInterval` del reproductor sigue vivo al navegar fuera de la pantalla. | El efecto devuelve su `clearInterval` y depende de `paused` y `over`, así que se limpia al desmontar y al terminar la partida. |
| Los tres fondos fijos (`.av-bg` con su rejilla animada, `.av-noise`, las scanlines) repintando de forma continua en equipos modestos. | La rejilla anima `background-position` y el resto es estático. Si aparece tirón, el primer candidato a desactivar es la animación `gridscroll`. |
| `next/font/google` falla en el arranque si no hay red la primera vez. | Next cachea las fuentes tras la primera descarga. Si el entorno de desarrollo no tiene salida a internet, hay que descargarlas y servirlas con `next/font/local`. |

---

## Lo que **no** entra en este spec

- Ningún juego jugable. Los 8 títulos son fichas de catálogo.
- Autenticación real, backend o base de datos.
- Puntuaciones reales, ranking global o competición entre usuarios.
- Sistema de créditos o monedas.
- Página de perfil o de cuenta.
- Acceso con Google o GitHub.
- Framework de tests y CI.
- Accesibilidad más allá de la del referente, incluido `prefers-reduced-motion`.
- Metadata por ruta, Open Graph y SEO.
- Ampliar el catálogo de juegos o de jugadores.
- Internacionalización.

Cada uno de ellos, si llega, va en su propio spec.
