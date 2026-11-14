# AgriCapital — Agente de crédito por WhatsApp

Prueba técnica: un **agente de IA por WhatsApp** que atiende a clientes preferenciales, antiguos y nuevos y los lleva hasta una solicitud de crédito radicada; una **API REST** en capas sobre PostgreSQL; y un **panel web** donde el equipo ve las solicitudes.

| Lo que pide la prueba                                        | Dónde está                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Agente que distingue preferencial / antiguo / nuevo y radica | [`backend/src/agent`](backend/src/agent) · [Agente](#el-agente)                                                |
| Nunca aprueba: toda solicitud queda "en revisión"            | Base de datos + API + filtro de salida · [Guardrails](#guardrails-protección-en-capas)                         |
| Protección de datos de terceros ante engaños                 | [`backend/src/agent/guardrails`](backend/src/agent/guardrails) · [Guardrails](#guardrails-protección-en-capas) |
| API REST para buscar clientes, BD relacional, validaciones   | [`backend/src`](backend/src) · [API](#api-rest)                                                                |
| Capas, linter y formateador                                  | `routes → controllers → services → models` · oxlint + Prettier                                                 |
| Panel: listado, filtro en tiempo real, detalle en modal      | [`frontend/src`](frontend/src) · [Panel](#el-panel)                                                            |
| Ramas, PRs etiquetados con auto-revisión, al menos un issue  | PRs #1–#14 · issue #10 · [Flujo de trabajo](#flujo-de-trabajo-en-github)                                       |

---

## Contenido

1. [Arquitectura](#arquitectura)
2. [Instalación](#instalación)
3. [Ejecutar](#ejecutar)
4. [Probar](#probar)
5. [El agente](#el-agente)
6. [Guardrails: protección en capas](#guardrails-protección-en-capas)
7. [Seguridad de la API y la infraestructura](#seguridad-de-la-api-y-la-infraestructura)
8. [API REST](#api-rest)
9. [El panel](#el-panel)
10. [WhatsApp real (Meta y Twilio)](#whatsapp-real-meta-y-twilio)
11. [Decisiones](#decisiones)
12. [Supuestos](#supuestos)
13. [Flujo de trabajo en GitHub](#flujo-de-trabajo-en-github)
14. [Retos, limitaciones y mejoras](#retos-limitaciones-y-mejoras)

---

## Arquitectura

```
 WhatsApp ──► Meta Cloud API / Twilio ──► POST /webhooks/{meta,whatsapp}
                                              │  firma verificada, respuesta 200 inmediata
                                              ▼
                                     procesador común (anti-duplicados, solo Colombia)
                                              │
                                              ▼
            ┌──────────────────────── Agente (Claude Sonnet 5.5) ────────────────────────┐
            │ guardia de entrada (heurísticas + Haiku 5.5) → loop de tool use → filtro de │
            │ salida. Herramientas: registrar_consentimiento, identificar_cliente,        │
            │ crear_solicitud                                                             │
            └─────────────────────────────────────┬───────────────────────────────────────┘
                                                  │ mismas reglas que la API
 Panel (React) ──► /api (proxy de Vite) ──► routes → controllers → services → models ──► PostgreSQL
                                           (HTTP+Zod)   (negocio)    (Prisma)
```

Monorepo con npm workspaces:

| Carpeta     | Stack                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------- |
| `backend/`  | Node 22, Express 5, TypeScript, Prisma 7 + PostgreSQL 16, Zod, pino, SDK de Anthropic, Vitest + Supertest |
| `frontend/` | React 19, Vite, TypeScript, CSS sin librerías, Vitest + Testing Library                                   |
| raíz        | oxlint (con `jsx-a11y`), Prettier, husky + lint-staged, CI en GitHub Actions, Docker Compose              |

```
backend/src/
├── routes/        # URL → controlador
├── controllers/   # HTTP: valida con Zod, llama al servicio, serializa
├── services/      # reglas de negocio (tipo de cliente, duplicados, verificación)
├── models/        # acceso a datos con Prisma
├── schemas/       # validación y normalización (cédula, teléfono, nombre)
├── agent/         # agente: loop, herramientas, prompt, FAQ, guardrails
├── channels/      # WhatsApp: Meta y Twilio con un procesador común
├── middlewares/   # errores con formato único
└── lib/           # logger con redacción de datos, AppError, mutex, nombres
```

## Instalación

**Requisitos:** Node 22.12 o superior (`.nvmrc`), Docker (para PostgreSQL) y una API key de Anthropic para el agente.

```bash
git clone <repo> && cd agriCapital
npm install                         # instala ambos workspaces y genera el cliente de Prisma
cp backend/.env.example backend/.env
# Edita backend/.env: como mínimo ANTHROPIC_API_KEY (el resto tiene valores por defecto)

npm run db:up                       # PostgreSQL 16 en Docker (espera a que esté sano)
npm run db:migrate                  # aplica las migraciones
npm run db:seed                     # 13 clientes ficticios y 5 solicitudes de ejemplo
```

`npm run db:reset` deja la base de datos como recién sembrada.

### Variables de entorno (`backend/.env`)

| Variable                            | Para qué                                                                                                      | Obligatoria        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| `DATABASE_URL`                      | Conexión a Postgres (ya coincide con `docker-compose.yml`)                                                    | Sí                 |
| `ANTHROPIC_API_KEY`                 | Agente y guardia de entrada                                                                                   | Para el agente     |
| `AGENT_MODEL` / `GUARD_MODEL`       | `claude-sonnet-5-5` / `claude-haiku-5-5` por defecto                                                          | No                 |
| `CONVERSATION_TTL_MINUTES`          | Minutos de inactividad tras los que la conversación empieza de cero (30)                                      | No                 |
| `DEMO_PHONE`                        | Tu número E.164: el seed crea un cliente preferencial y uno antiguo con él                                    | No                 |
| `META_*`                            | Canal de WhatsApp con la Cloud API de Meta ([guía](#meta-cloud-api))                                          | Para WhatsApp real |
| `TWILIO_*`, `PUBLIC_BASE_URL`       | Canal de WhatsApp con Twilio ([guía](#twilio))                                                                | Para WhatsApp real |
| `PORT`, `LOG_LEVEL`, `COMPANY_NAME` | Puerto (3000), nivel de logs, nombre con el que se presenta el agente                                         | No                 |
| `HOST`                              | Interfaz en la que escucha la API. Por defecto `127.0.0.1`: solo esta máquina                                 | No                 |
| `API_ACCESO_REMOTO`                 | `true` (o `1`) para servir `/api` también a peticiones que llegan por un proxy. Por defecto se rechazan (403) | No                 |

## Ejecutar

```bash
npm run dev:api     # API en http://127.0.0.1:3000 (recarga al guardar)
npm run dev:web     # Panel en http://localhost:5173 (reenvía /api al backend)
```

Hay tres formas de hablar con el agente:

| Forma                   | Cómo                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Chat en la terminal** | `npm run chat -- +573000000101` (el número es el "WhatsApp" desde el que escribes)                               |
| **Simulador HTTP**      | `POST /api/chat/simulate` con `{ "telefono": "+573000000101", "mensaje": "Hola" }` (deshabilitado en producción) |
| **WhatsApp real**       | Ver [WhatsApp real](#whatsapp-real-meta-y-twilio)                                                                |

### Guion para probar los tres tipos de cliente

Los datos del seed son ficticios. La identidad está ligada al teléfono (ver [Guardrails](#guardrails-protección-en-capas)), así que hay que escribir **desde el teléfono registrado** del cliente:

| Caso                                       | Teléfono (`npm run chat -- …`) | Cédula       | Qué debe pasar                                                                                                |
| ------------------------------------------ | ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------- |
| Preferencial                               | `+573000000101`                | `1010101010` | Saluda a María por su nombre y le dice su cupo preaprobado ($8.000.000)                                       |
| Antiguo                                    | `+573000000201`                | `2010101010` | Saluda a Pedro y le pregunta si quiere un nuevo crédito                                                       |
| Nuevo                                      | `+573001112233`                | `1234567890` | Pregunta en qué puede ayudar y si quiere radicar                                                              |
| **Engaño**: cédula ajena desde otro número | `+573001112233`                | `1010101010` | Responde **igual que a un nuevo**: ni nombre ni cupo. Si radica, la solicitud queda con "Verificar identidad" |

Después de radicar, la solicitud aparece en el panel (botón **Actualizar**).

## Probar

```bash
npm run db:up                                        # los tests del backend usan Postgres
npm run format:check && npm run lint && npm run typecheck && npm test
```

- **Backend (220 tests):** unitarios (clasificación, normalización, nombres, guardia, filtro de salida), seguridad HTTP (cabeceras y límite de peticiones) e integración con Supertest contra una **base de datos aparte** (`agricapital_test`), que `globalSetup` crea y migra sola. El agente se prueba con un **LLM falso de respuestas programadas**: sin costo, sin red y determinista, y valida las mismas reglas de historial que la API real.
- **Frontend (28 tests):** el panel completo con la API simulada (carga, filtros, detalle, errores, paginación, respuestas tardías, móvil) y el selector de tema.
- **`npm run eval:guardia -w backend`:** evalúa el clasificador de prompt injection **contra el modelo real** con 12 mensajes legítimos y 12 ataques. Usa la API key.
- **`npm run test:hooks`:** tests del hook de revisión IA con un `claude` falso.

En cada commit corren lint y formato sobre lo que cambió (lint-staged). Antes de cada push corren typecheck y tests (husky). En cada PR, el CI corre formato, lint, typecheck y tests con un Postgres de servicio.

## El agente

Un loop de _tool use_ con **Claude Sonnet 5.5** que conversa en español. Las reglas críticas viven en las herramientas (código), no solo en el prompt:

| Herramienta                | Qué hace                                           | Qué hace cumplir el código                                                                                             |
| -------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `registrar_consentimiento` | Guarda la autorización de datos (Ley 1581 de 2012) | Sin autorización no se consulta ni se radica. `acepta: false` la revoca                                                |
| `identificar_cliente`      | Clasifica la cédula                                | Devuelve **solo el primer nombre y el cupo** (minimización). Una cédula por conversación. Identidad ligada al teléfono |
| `crear_solicitud`          | Radica la solicitud                                | El **teléfono sale del canal**, no del modelo. Reutiliza la validación de la API. Siempre `EN_REVISION`                |

- **Tipo de cliente** (lo decide el servidor, nunca el modelo ni quien llama): tiene cupo preaprobado mayor que 0 → **preferencial**; está registrado sin cupo → **antiguo**; no está → **nuevo**.
- **Conocimiento:** una FAQ ficticia ([`faq.md`](backend/src/agent/knowledge/faq.md)) va completa en el system prompt, que es estático y usa _prompt caching_. Con ~1 página no hace falta RAG. Lo que no está en la FAQ, el agente dice que no lo sabe y no lo inventa.
- **Memoria:** el historial se guarda append-only en `conversaciones`. La sesión se reinicia tras 30 min de inactividad, para que otra persona con el mismo celular no herede una sesión identificada.
- **Robustez:** un mensaje a la vez por teléfono (mutex); máximo 6 iteraciones por mensaje; mensajes de más de 1000 caracteres se rechazan sin llamar al modelo; si la API falla no se guarda un historial a medias.

## Guardrails: protección en capas

Si una capa falla, la siguiente sigue protegiendo.

| #   | Capa                              | Qué hace                                                                                                                                                                                                                                               |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Identidad ligada al teléfono**  | Si la cédula existe pero su teléfono no es el de WhatsApp, el agente recibe **exactamente lo mismo que para una cédula inexistente**. Así nadie puede enumerar clientes probando cédulas. La solicitud se puede radicar y queda marcada para verificar |
| 2   | **Una cédula por conversación**   | Pedir una segunda cédula da error                                                                                                                                                                                                                      |
| 3   | **Nombre distinto al registrado** | La solicitud queda con `requiereVerificacion`. Nunca se le dice a la persona que no coincide                                                                                                                                                           |
| 4   | **Guardia de entrada**            | Heurísticas y clasificador Haiku 5.5. Un ataque no llega al modelo principal y en el historial queda un marcador, no el texto del ataque                                                                                                               |
| 5   | **Filtro de salida**              | Reemplaza respuestas con promesas de aprobación o con cédulas o teléfonos ajenos                                                                                                                                                                       |
| 6   | **Límite de mensajes**            | 15 mensajes cada 5 minutos por teléfono                                                                                                                                                                                                                |

Además, **toda solicitud nace `EN_REVISION`**: la API rechaza un body que intente fijar `estado` o `tipoCliente`. Los logs (pino) **redactan** cédula, teléfono y nombre.

## Seguridad de la API y la infraestructura

Además de la protección del agente, esto es lo que protege a la API y a los datos, contrastado con una checklist estándar de seguridad para backends:

| Práctica                               | Estado | Cómo                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validación en el servidor              | ✅     | Zod en cada endpoint: tipo, formato, longitud y rango. El body de `POST /api/solicitudes` es estricto (si trae `estado` o `tipoCliente`, 400)                                                                                                                                                                                                                                                                                                                        |
| Consultas parametrizadas               | ✅     | Todo pasa por Prisma. La única consulta SQL directa (el bloqueo contra duplicados) usa un template parametrizado                                                                                                                                                                                                                                                                                                                                                     |
| Saneamiento de salidas (XSS)           | ✅     | La API solo devuelve JSON. El panel muestra todo con React, que escapa el contenido, y no usa `innerHTML`                                                                                                                                                                                                                                                                                                                                                            |
| Cabeceras de seguridad                 | ✅     | Helmet: `Content-Security-Policy`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS. Sin `X-Powered-By`                                                                                                                                                                                                                                                                                                                                                         |
| CORS                                   | ✅     | No está habilitado, que es lo más estricto: ningún sitio externo puede leer la API desde un navegador. El panel entra por el proxy de Vite                                                                                                                                                                                                                                                                                                                           |
| Límite de peticiones                   | ✅     | Por IP: 300/min en la API y 600/min en los webhooks (429 con `Retry-After`). El agente además limita a 15 mensajes cada 5 min por teléfono                                                                                                                                                                                                                                                                                                                           |
| Webhooks autenticados                  | ✅     | Firma HMAC de Meta y firma de Twilio, comparadas en tiempo constante; sin firma válida, 403                                                                                                                                                                                                                                                                                                                                                                          |
| Aislamiento de red                     | 🟡     | La API y Postgres escuchan solo en `127.0.0.1`. El túnel de WhatsApp (`cloudflared --url`) reenvía todo el puerto, así que `/api` **rechaza con 403 lo que llega reenviado** (cabeceras `X-Forwarded-For`, `Cf-Connecting-Ip`…): por el túnel solo se llega a `/webhooks` y `/health`. Es una defensa por cabeceras pensada para cloudflared, que siempre las agrega; **no sustituye al login**. Si `HOST` abre la API a la red, el servidor lo advierte al arrancar |
| Errores genéricos                      | ✅     | Los 500 responden "Error interno del servidor" sin stack; el detalle va al log                                                                                                                                                                                                                                                                                                                                                                                       |
| Logs sin datos sensibles               | ✅     | pino oculta cédula, teléfono y nombre. De Meta y Twilio solo se registran ids y códigos                                                                                                                                                                                                                                                                                                                                                                              |
| Secretos fuera del repo                | ✅     | Solo en `backend/.env` (ignorado por git). El revisor IA no puede leerlo                                                                                                                                                                                                                                                                                                                                                                                             |
| Auditoría de dependencias              | ✅     | `npm audit --omit=dev --audit-level=high` en un job propio del CI y Dependabot semanal (y de inmediato para avisos de seguridad)                                                                                                                                                                                                                                                                                                                                     |
| Cifrado en tránsito                    | 🟡     | Lo externo ya va por HTTPS (túnel de Cloudflare, Meta, Twilio, Anthropic). En local es HTTP; en producción, TLS en el balanceador                                                                                                                                                                                                                                                                                                                                    |
| Autenticación y autorización           | ❌     | El panel y la API no tienen login (supuesto de la prueba). Ver la mejora abajo                                                                                                                                                                                                                                                                                                                                                                                       |
| Cifrado en reposo y gestor de secretos | ❌     | Dependen de dónde se despliegue. Ver la mejora abajo                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Para llevarlo a producción

- **Autenticación con el SSO de la empresa** (OpenID Connect con Google Workspace, Microsoft Entra, Auth0…) con MFA o passkeys del proveedor y sesiones cortas. Así no se guardan contraseñas propias. Si algún día hicieran falta, irían con Argon2id.
- **Autorización por roles (RBAC)**, verificada en cada endpoint: un asesor solo lee y un coordinador puede aprobar o rechazar. Cada cambio de estado queda auditado (quién, cuándo, desde qué estado).
- **HTTPS en todo el camino**: TLS 1.2+ en el balanceador, redirección de HTTP y HSTS (Helmet ya envía la cabecera).
- **Base de datos administrada en una subred privada** (RDS, Cloud SQL), con disco y backups cifrados, accesible solo desde la app.
- **Secretos en un gestor** (AWS Secrets Manager, Vault, los secretos de la plataforma) en vez de `.env`, con rotación de las claves de Meta, Twilio y Anthropic.
- **Límite de peticiones compartido** (Redis) si hay varias instancias; hoy vive en la memoria de cada proceso. Ajustar `trust proxy` al balanceador real: hoy confía solo en `127.0.0.1` (el túnel), y detrás de otro proxy todos los clientes compartirían un contador.
- **Exponer a internet solo `/webhooks`** (reglas del proxy o del túnel). El panel y la API quedan en la red interna o detrás del SSO.
- **Monitoreo y alertas**: picos de 429, firmas inválidas, mensajes bloqueados por la guardia (#10) y errores 500.

## API REST

Base: `http://127.0.0.1:3000`. Todas las respuestas de error tienen el formato `{ "error": { "code", "message", "details?" } }`. En validación, `details` lista `{ campo, mensaje }`.

| Método       | Ruta                                                 | Respuestas                                                                       |
| ------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET`        | `/api/clientes/:cedula`                              | 200 con tipo y cupo · 400 cédula inválida · 404                                  |
| `GET`        | `/api/clientes?cedula=&telefono=&page=&pageSize=`    | 200 paginado (búsqueda parcial por dígitos) · 400                                |
| `GET`        | `/api/solicitudes?cedula=&telefono=&page=&pageSize=` | 200 paginado, más reciente primero · 400                                         |
| `GET`        | `/api/solicitudes/:id`                               | 200 · 400 id no es UUID · 404                                                    |
| `POST`       | `/api/solicitudes`                                   | 201 + `Location` · 400 validación · 409 ya hay una en revisión                   |
| `POST`       | `/api/chat/simulate`                                 | 200 respuesta del agente · 503 sin `ANTHROPIC_API_KEY` (no existe en producción) |
| `GET`        | `/health`                                            | 200                                                                              |
| `GET`/`POST` | `/webhooks/meta`                                     | Verificación y mensajes de Meta (firma HMAC) · 403 · 503 sin configurar          |
| `POST`       | `/webhooks/whatsapp`                                 | Mensajes de Twilio (firma) · 403 · 503 sin configurar                            |

```bash
curl -s 127.0.0.1:3000/api/clientes/1010101010
curl -s "127.0.0.1:3000/api/solicitudes?cedula=1010&page=1&pageSize=20"
```

La validación **normaliza** lo que la gente escribe: `1.010.101.010` → `1010101010`, y `300 123 4567` o `+57 300…` → `+573001234567`. El nombre exige al menos nombre y apellido. El 409 está protegido contra condiciones de carrera con un _advisory lock_ de Postgres por cédula: hay un test con 5 peticiones simultáneas.

## El panel

`http://localhost:5173` — listado de solicitudes con nombre, cédula, teléfono, municipio, tipo de cliente y fecha de radicación.

- **Filtro en tiempo real** por cédula y teléfono. Consulta 300 ms después de la última tecla, acepta puntos, espacios y `+57`, y la búsqueda es parcial. Una búsqueda vieja que responde tarde se descarta y nunca reemplaza la actual.
- **Detalle en un `<dialog>` nativo** al hacer clic en una fila (o con el botón del nombre, desde el teclado), con todos los datos y un aviso cuando hay que verificar la identidad.
- Estados de **carga, vacío** (distinto con y sin filtros) y **error con "Reintentar"**; paginación; botón **Actualizar**.
- **Móvil:** por debajo de 640 px cada fila se convierte en una tarjeta con el título de cada dato.
- **Tema:** Sistema, Claro u Oscuro. Se recuerda en el navegador y no parpadea al recargar.
- **HTML semántico y accesible:** `<search>`, `<table>` con `caption` y `scope`, `<output>` que anuncia el número de resultados, `<dl>`, `<time>`; el tipo de cliente usa color **y** texto; foco visible; controles de 44 px; contraste AA en los dos temas.

## WhatsApp real (Meta y Twilio)

El backend tiene dos canales que comparten el mismo procesador. Los dos necesitan una URL pública hacia `127.0.0.1:3000`, por ejemplo con `cloudflared tunnel --url http://127.0.0.1:3000`, cuya URL cambia en cada reinicio.

### Meta Cloud API

1. En developers.facebook.com, crear una app con el caso de uso **"Conectar con clientes a través de WhatsApp"** y vincularla a un portafolio comercial.
2. **Casos de uso → Personalizar → Paso 1. Pruébalo → Solicitar número de prueba.** De ahí salen el token temporal (`META_WHATSAPP_TOKEN`, dura unas horas) y el **Phone number ID** (`META_PHONE_NUMBER_ID`). Agregar tu WhatsApp como destinatario y verificarlo con el código.
3. **Configuración de la app → Básica → Clave secreta** → `META_APP_SECRET`. El `META_VERIFY_TOKEN` lo inventas tú (`openssl rand -hex 16`), sin comillas.
4. **Webhooks:** URL `https://<túnel>/webhooks/meta`, el verify token, y suscribir el campo **`messages`**.
5. ⚠️ **Suscribir la cuenta de WhatsApp (WABA) a la app:** `POST /{WABA_ID}/subscribed_apps` con el token. Sin esto el webhook queda verificado pero los mensajes reales no llegan.
6. Completar el perfil del negocio y agregar un método de pago. Si las respuestas no llegan, consultar `GET /{WABA_ID}?fields=health_status`; el backend registra en el log cada entrega fallida con su código de Meta.
7. Para una demo, usar un token permanente de **usuario del sistema** (Configuración del negocio → Usuarios del sistema).

### Twilio

1. Crear la cuenta y activar el sandbox de WhatsApp. Llenar `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` y `TWILIO_WHATSAPP_FROM`.
2. `PUBLIC_BASE_URL` = la URL del túnel, sin `/` final. La firma de Twilio se valida contra ella.
3. En el sandbox, _When a message comes in_ → `https://<túnel>/webhooks/whatsapp` (POST).

> Ver [Retos](#retos-limitaciones-y-mejoras): las cuentas de prueba de ambos proveedores tienen limitaciones que impidieron completar la entrega en un teléfono real.

## Decisiones

**Agente**

- **Las reglas críticas en el código, no en el prompt.** El modelo decide _cómo_ conversar; las herramientas deciden _qué_ se puede hacer. Por ejemplo, el teléfono sale del canal, el estado es siempre `EN_REVISION`, el tipo de cliente lo calcula el servidor y sin consentimiento no se consulta nada.
- **Loop de tool use manual** (no el Tool Runner del SDK): cada paso es visible y testeable.
- **Minimización de datos:** el modelo solo recibe el primer nombre y el cupo, nunca la cédula completa de otra persona ni datos que no necesita.
- **Guardia fail-open** si el clasificador falla (red, JSON inválido), porque las reglas críticas igual las aplican las herramientas. Si el clasificador _declina_, bloquea.
- **Eval de la guardia contra el modelo real:** con el modelo real aparecieron falsos positivos ("¿me garantizan que me aprueban?" se bloqueaba). Se ajustó el prompt del clasificador y se pasó de 83 % a 100 % en 24 casos. Los ejemplos del prompt son distintos de los del eval.

**Backend**

- **El tipo de cliente no se guarda en `clientes`**: se deriva del cupo, así nunca queda desincronizado. La solicitud sí guarda el tipo como foto del momento.
- **Una solicitud en revisión por cédula _y_ teléfono.** Desde otro teléfono se puede radicar, y entonces todas las solicitudes en revisión de esa cédula quedan para verificar. Así un impostor no le quita el lugar al titular, y el 409 nunca revela solicitudes de otra persona.
- **Solo accesible desde esta máquina:** la API escucha en `127.0.0.1` (configurable con `HOST`) y Docker publica Postgres solo en `127.0.0.1`. Sin esto, cualquiera en la misma red (p. ej. una Wi-Fi compartida) podría consultar la API, que no tiene login, o conectarse a la base de datos con las credenciales de desarrollo.
- **Webhooks antes de `express.json`:** la firma de Meta se calcula sobre los bytes exactos del cuerpo.
- **Responder 200 de inmediato** a los webhooks y procesar en segundo plano: Meta y Twilio reintentan si la respuesta tarda.
- **oxlint en vez de ESLint:** es el linter de la plantilla de Vite, mucho más rápido, y evita problemas de compatibilidad con TypeScript 7.
- **Tests de integración contra Postgres real** (BD aparte), no contra mocks de Prisma: así se prueban también las restricciones, los locks y las migraciones.

**Frontend**

- **Proxy de Vite en vez de CORS:** la API no necesita abrirse a otros orígenes.
- **`<dialog>` nativo:** el navegador resuelve el foco atrapado, Escape, el fondo inerte y devolver el foco al botón que lo abrió.
- **"Cargando" es estado derivado** de "¿la última respuesta es de la búsqueda actual?", en vez de un `useState` más que hay que mantener sincronizado.
- **Colores con `light-dark()`:** cada color se define una vez. El tema lo decide `color-scheme`, que sigue al sistema o al selector.
- **Tarjetas en móvil solo con CSS** sobre la misma tabla, con roles ARIA explícitos para que Safari no pierda la semántica de tabla.

## Supuestos

- **Definición de "cliente nuevo".** La prueba define _nuevo_ como "nunca ha radicado una solicitud" y _antiguo_ como "ya tuvo un crédito". Eso deja un hueco: alguien que radicó antes pero nunca tuvo crédito. **Supuesto:** la tabla `clientes` contiene a quienes ya tuvieron crédito con la empresa, y todo el que no está ahí se trata como **nuevo**, aunque tenga solicitudes previas. Si ya tiene una solicitud en revisión desde el mismo teléfono, el agente se lo dice.
- **Solo números de Colombia (+57):** a otros números se les responde con un aviso y no se atienden.
- **El agente pide la autorización de tratamiento de datos** (Ley 1581 de 2012) antes de pedir la cédula. No lo pide la prueba, pero sin ella no se deberían consultar datos personales.
- **La cédula colombiana tiene de 6 a 10 dígitos**; el celular se guarda en E.164.
- **La FAQ es ficticia** (tasas, plazos, requisitos), según la instrucción de no usar datos reales.
- **El panel es de uso interno y no tiene autenticación**, igual que la API. Muestra datos personales, así que antes de exponerlo fuera de la red del equipo necesita login y permisos. Queda fuera del alcance de la prueba.
- **El panel no se actualiza solo:** se usa el botón "Actualizar".
- **Navegadores recientes** para el panel (Baseline 2024: `light-dark()`, `<dialog>`, `<search>`).
- **El monto no se pide**: la prueba solo exige nombre completo y municipio. Si la persona lo menciona, el agente lo guarda.

## Flujo de trabajo en GitHub

- **Una rama por funcionalidad** (`chore/setup`, `feature/db`, `feature/api`, `feature/agent`, `feature/guardrails`, `feature/whatsapp`, `feature/whatsapp-meta`, `feature/front`, `docs/readme`…), con commits en formato _conventional commits_, en español.
- **PRs etiquetados con auto-revisión:** cada uno explica qué cambia, por qué, cómo se probó y los supuestos, y tiene la checklist de la plantilla. Los hallazgos de las revisiones se corrigieron en PRs propios (por ejemplo, el #5) con un test que reproducía el problema antes de corregirlo.
- **Revisión IA independiente antes de cada PR** (`.claude/settings.json` → [`scripts/ai-review.sh`](scripts/ai-review.sh)):
  - Al crear un PR desde Claude Code, una sesión **nueva** de Claude, sin el contexto de quien escribió el código y solo con herramientas de lectura (sin acceso a `.env`), revisa el diff con la checklist de [`.claude/review/instrucciones.md`](.claude/review/instrucciones.md).
  - Esa checklist se lee siempre desde `main`, para que un PR no pueda debilitarla.
  - Si encuentra un hallazgo crítico, **bloquea** el PR. Lo hizo con la primera versión del #7: encontró dos fugas de datos reales, que se corrigieron.
- **Issue #10:** mejora propuesta para auditar los mensajes que bloquea la guardia de entrada.

## Retos, limitaciones y mejoras

- **Entrega en WhatsApp real.**
  - **Twilio:** su cuenta de prueba nueva solo permite responder con plantillas (error 21654), no con texto libre.
  - **Meta:** la prueba funcionó de punta a punta hasta el envío, pero Meta rechazó la entrega con **131031 "Business Account locked"**. Se resolvió el perfil del negocio (131000) y el método de pago (141006); el bloqueo persiste porque exige verificar una empresa real (141010).
  - El código de ambos canales funciona con una cuenta sin esas restricciones. Para la demo se usan `npm run chat` y `POST /api/chat/simulate`.
  - El detalle completo está en los PRs #8 y #9.
- **La guardia del modelo real no es la de los tests:** por eso existe `eval:guardia`, que mide falsos positivos y negativos con el modelo de verdad.
- **Mejoras:**
  - lo necesario para producción: login con SSO, roles, TLS, secretos y base de datos administrada (ver [Para llevarlo a producción](#para-llevarlo-a-producción));
  - acciones del equipo de crédito (aprobar o rechazar) con auditoría;
  - actualización en vivo del panel;
  - auditoría de los mensajes bloqueados (#10);
  - plantillas aprobadas de WhatsApp para escribir fuera de la ventana de 24 h.
