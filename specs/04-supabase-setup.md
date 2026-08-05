# SPEC 04 — Setup base de Supabase

> **Estado:** Implementado · **Depende de:** ninguno · **Fecha:** 2026-08-05
> **Objetivo:** Instalar y configurar el cliente de Supabase (browser y server) en el
> proyecto Next.js, con variables de entorno y una ruta de verificación de conectividad,
> sin tocar autenticación ni persistencia de datos todavía.

---

## Scope

**In:**

- Instalar `@supabase/supabase-js` y `@supabase/ssr`.
- Agregar las variables de entorno `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`:
  - En `.env.template` (documentadas, commiteadas — no son secretas).
  - En `.env.local` (valores reales del proyecto Supabase ya enlazado por MCP).
- Crear `lib/supabase/client.ts` — cliente para el navegador (`createBrowserClient`),
  para usar en Client Components.
- Crear `lib/supabase/server.ts` — cliente para el servidor (`createServerClient` con
  `cookies()` de `next/headers`), para usar en Server Components y Route Handlers.
- Crear `app/api/supabase-health/route.ts` — Route Handler `GET` que instancia el
  cliente server y llama a `supabase.auth.getSession()`; devuelve `{ ok: true }` si no
  lanza error, `{ ok: false, error }` si falla.

**Fuera de alcance:**

- Autenticación real (sign up / sign in / sign out) y reemplazo de `UserContext`.
  Queda para un spec futuro que dependerá de este.
- El flujo de "JUGAR COMO INVITADO" — sin cambios.
- Persistencia de puntuaciones/leaderboard (tabla `scores`, reemplazo de
  `seededScores` y de `saveScore` en localStorage). Spec futuro.
- Middleware para refresco de sesión — no aplica sin auth todavía.
- Creación de tablas, esquema de base de datos o políticas RLS. El proyecto Supabase
  queda sin tablas al terminar este spec.
- Limpieza de las rutas legacy (`app/salon`, `app/juego/[id]`, `app/jugar/[id]`) —
  quedan como están.
- OAuth (Google/GitHub).

---

## Data model

No se introduce ningún modelo de datos persistente (el proyecto Supabase queda sin
tablas).

- **Variables de entorno** — `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. Ambas llevan el prefijo
  `NEXT_PUBLIC_` porque no son secretas (la publishable key está diseñada para
  exponerse en el cliente).
- **Respuesta de `/api/supabase-health`** — `{ ok: true }` en éxito,
  `{ ok: false; error: string }` en fallo. Tipado inline en el Route Handler, no se
  exporta.
- **Clientes Supabase** — `lib/supabase/client.ts` exporta una función `createClient()`
  que devuelve un `SupabaseClient` para el navegador. `lib/supabase/server.ts` exporta
  una función `async createClient()` que devuelve un `SupabaseClient` para el servidor
  (usa `cookies()` de `next/headers`, por eso es async). Ninguno se persiste en estado
  global; se instancian por request/componente, siguiendo el patrón oficial de
  `@supabase/ssr`.

---

## Implementation plan

1. **Instalar dependencias** — `npm install @supabase/supabase-js @supabase/ssr`.
   Verificación: ambos paquetes aparecen en `package.json` → `dependencies`.

2. **Agregar variables de entorno a `.env.template`** — añadir
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con un comentario
   indicando de dónde se obtienen (dashboard de Supabase → Settings → API Keys).
   Verificación: el archivo commiteado documenta ambas variables.

3. **Crear/actualizar `.env.local`** — agregar
   `NEXT_PUBLIC_SUPABASE_URL=https://vfhwvyfhsmbfzqcpjrlh.supabase.co` y
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...` con los valores reales del
   proyecto ya enlazado.
   Verificación: el archivo existe en la raíz, no está trackeado por git (`git status`
   no lo muestra) y contiene ambos valores.

4. **Crear `lib/supabase/client.ts`** — cliente de navegador con `createBrowserClient`
   de `@supabase/ssr`, leyendo las dos env vars.
   Verificación: el archivo exporta `createClient()` sin errores de TypeScript.

5. **Crear `lib/supabase/server.ts`** — cliente de servidor con `createServerClient` de
   `@supabase/ssr`, usando `cookies()` de `next/headers` para el manejo de cookies
   (`get`/`set`/`remove` según la firma de `@supabase/ssr`).
   Verificación: el archivo exporta `async createClient()` sin errores de TypeScript.

6. **Crear `app/api/supabase-health/route.ts`** — Route Handler `GET` que:

   - Instancia el cliente server con `createClient()` de `lib/supabase/server.ts`.
   - Llama a `supabase.auth.getSession()`.
   - Devuelve `200 { ok: true }` si no lanza error, `500 { ok: false, error }` si falla.
     Verificación: `curl http://localhost:3000/api/supabase-health` devuelve
     `{ ok: true }` con `npm run dev` corriendo.

7. **Verificación end-to-end** — `npm run build` compila sin errores y `npm run dev` +
   `curl /api/supabase-health` confirma la conexión. Ninguna ruta ni componente
   existente cambia de comportamiento.

---

## Acceptance criteria

**Instalación**

- [x] `@supabase/supabase-js` y `@supabase/ssr` aparecen en `package.json` →
      `dependencies`. Verificado: `@supabase/ssr@^0.12.4`, `@supabase/supabase-js@^2.112.1`.
- [x] `npm install` no reporta errores de peer dependencies con Next.js 16.2.6 /
      React 19.2.4. Verificado: instalación limpia (solo warnings de `npm audit`
      preexistentes, no relacionados).

**Variables de entorno**

- [x] `.env.template` documenta `NEXT_PUBLIC_SUPABASE_URL` y
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [x] `.env.local` contiene los valores reales de ambas variables y no aparece en
      `git status`. Verificado con `git status --porcelain`.

**Clientes Supabase**

- [x] `lib/supabase/client.ts` exporta `createClient()` y compila sin errores de
      TypeScript. Verificado con `npx tsc --noEmit`.
- [x] `lib/supabase/server.ts` exporta `async createClient()` y compila sin errores de
      TypeScript. Verificado con `npx tsc --noEmit`.

**Ruta de verificación**

- [x] `GET /api/supabase-health` devuelve `200 { ok: true }` cuando las env vars son
      válidas. Verificado con `npm run dev` + `curl`.
- [x] **Limitación conocida (aceptada):** `supabase.auth.getSession()` no detecta una
      `NEXT_PUBLIC_SUPABASE_URL` inválida. Sin sesión activa (no hay auth en esta app
      todavía), `getSession()` resuelve `{ session: null, error: null }` localmente,
      sin hacer round-trip de red — por lo que una URL/key rota igual da
      `{ ok: true }`. Verificado en la implementación: se probó con la URL rota y la
      ruta respondió `ok: true`. Se evaluó cambiar a `getUser()`, pero sin sesión
      activa ese método falla siempre con `AuthSessionMissingError` (incluso con
      credenciales válidas), lo que rompería el criterio anterior. Se decide mantener
      `getSession()` tal como pide este spec: el health-check confirma que el cliente
      se instancia y las env vars están presentes, no que sean válidas contra la red.

**No regresión**

- [x] **Limitación preexistente (aceptada), no bloqueante:** `npm run build` falla al
      prerenderizar `/salon` con `Error: useSession debe usarse dentro de
SessionProvider`. Verificado con `git stash` que este error existe **antes** de
      esta implementación — `SessionProvider` de `lib/session.tsx` nunca se monta en
      `app/layout.tsx` (la app usa `UserContext` en su lugar), y ese hook roto también
      lo consumen `components/GamePlayer.tsx` / `GameOverModal.tsx` (ruta activa
      `app/games/[id]/play`, en runtime). Arreglarlo de raíz requeriría tocar
      `lib/session.tsx` / `UserContext` o las rutas legacy, ambas explícitamente fuera
      de alcance de este spec (ver "Fuera de alcance" y "Decisions"). Se decide no
      tocarlo aquí; queda para un spec de limpieza aparte. Verificación alternativa
      usada en este spec: `npx tsc --noEmit` sin errores + `npm run dev` con
      `/api/supabase-health` respondiendo `200 { ok: true }`.
- [x] Ninguna página existente (`/`, `/games`, `/auth`, `/hall-of-fame`, `/about`)
      cambia de comportamiento visual o funcional. Verificado: las 5 rutas responden
      `200` con `npm run dev` corriendo.
- [x] El proyecto Supabase sigue sin tablas al terminar el spec (`list_tables`
      devuelve `[]`). Verificado con la herramienta MCP de Supabase.

---

## Decisions

- **Sí:** Instalar `@supabase/ssr` desde ya, aunque todavía no haya auth. Evita tener
  que agregarlo en el spec futuro de autenticación y permite usar el patrón oficial de
  clientes browser/server de una vez.

- **Sí:** Separar `lib/supabase/client.ts` (browser) y `lib/supabase/server.ts`
  (server) en lugar de un único cliente compartido. Es el patrón oficial de
  `@supabase/ssr` para App Router y evita reusar un cliente con estado de cookies
  entre requests distintos.

- **Sí:** Usar la publishable key nueva (`sb_publishable_...`) en lugar de la anon key
  legada (JWT). Es el formato que Supabase recomienda hoy para claves expuestas en el
  cliente.

- **Sí:** Valores reales de `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` directamente en `.env.local`, sin dejarlos
  como placeholder vacío (a diferencia de `RESEND_API_KEY` en el spec 03). Ninguna de
  las dos es secreta — están pensadas para el bundle del cliente.

- **Sí:** Ruta `app/api/supabase-health/route.ts` con `supabase.auth.getSession()`
  como verificación de conectividad, en lugar de crear una tabla de prueba. No
  requiere esquema de base de datos y confirma que el cliente se instancia y responde
  con las env vars configuradas.

- **No:** Middleware de refresco de sesión. No hay auth todavía, así que no hay
  sesión que refrescar. Se evalúa en el spec de autenticación.

- **No:** Tocar `UserContext`, `lib/session.tsx`, `seededScores` o cualquier lógica de
  auth/puntuaciones existente. Este spec es solo infraestructura de conexión.

- **No:** Limpiar las rutas legacy (`app/salon`, `app/juego/[id]`, `app/jugar/[id]`).
  Es código muerto no relacionado con Supabase; se atiende en un spec de limpieza
  aparte si se decide hacerlo.

---

## Identified risks

- **Compatibilidad de versión.** El proyecto usa Next.js 16.2.6 / React 19.2.4,
  versiones no estándar con cambios respecto a lo documentado en el entrenamiento
  (ver `AGENTS.md`). `@supabase/ssr` espera una firma específica de `cookies()` de
  `next/headers`; si esa API cambió en esta versión de Next, `lib/supabase/server.ts`
  puede no compilar. Mitigación: revisar `node_modules/next/dist/docs/` para la firma
  actual de `cookies()` antes de implementar el paso 5.

- **Health-check sin red real.** `supabase.auth.getSession()` puede resolver
  localmente sin llegar a golpear la API de Supabase si no hay sesión previa, dando un
  falso `{ ok: true }` aunque la URL o la key estén mal. Mitigación: al implementar,
  confirmar que la llamada efectivamente valida las credenciales (o documentarlo como
  limitación conocida del health-check).

  **Resuelto durante la implementación (paso 6):** se confirmó el riesgo — con
  `NEXT_PUBLIC_SUPABASE_URL` roto, la ruta sigue devolviendo `{ ok: true }`. Se
  evaluó `getUser()` como alternativa, pero sin sesión activa falla siempre
  (`AuthSessionMissingError`), incluso con credenciales válidas — no sirve para esta
  app sin auth. Decisión: mantener `getSession()` y documentar la limitación conocida
  (ver criterio de aceptación ajustado en la sección de arriba), en vez de introducir
  un `fetch` manual al endpoint de salud de Supabase.
