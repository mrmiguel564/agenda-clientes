# Agenda de horas — v1 Veterinaria (Cloudflare Workers + D1)

Landing con **autoagendamiento de horas sin pago**. El tutor elige servicio, día y hora, ingresa su RUT y elige a su mascota. Recibe la confirmación por correo y la hora queda en el **historial de visitas** de la mascota.
El dueño administra todo desde `/admin`: agenda, horario por defecto, días especiales, fichas de mascotas y ajustes.

Corre 100% en **Cloudflare**:

| Pieza | Qué es |
|---|---|
| Worker (`src/`, Hono) | API `/api/*` |
| Static Assets (`public/`) | Landing, flujo de reserva, Mis horas, admin (HTML/CSS/JS vanilla) |
| D1 (SQLite) | Base de datos. El esquema se crea solo en la primera petición |
| Cron Trigger | Cada 10 min: vence reservas sin confirmar, limpia límites y anonimiza inactivos |
| Correo | SMTP desde el Worker con [worker-mailer](https://github.com/zou-yu/worker-mailer) (Gmail u otro) |

La base es genérica: los textos, servicios, especies y FAQ están en `presets/vet.js` y los colores en `public/css/tokens.css`.

## Publicar en Cloudflare (Workers Builds desde GitHub)

El Worker **`agenda-clientes`** ya está conectado a este repositorio (rama `master`). Cada push a `master` despliega automáticamente.

1. **Configuración de build** (Worker → Settings → Build):
   - Build command: vacío o `npm run build` (no hace nada).
   - Deploy command: `npx wrangler deploy`.
   - Root directory: `/`.
2. **Base de datos:** no hay que crearla. En el primer deploy, Cloudflare crea la D1 `agenda-clientes-db` y la vincula como `DB` ([aprovisionamiento automático](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/)).
3. **Secretos** (Worker → Settings → Variables and Secrets → *Add*, tipo **Secret**):

   | Nombre | Valor |
   |---|---|
   | `ADMIN_PASSWORD` | Clave del panel `/admin` |
   | `COOKIE_SECRET` | Texto largo y aleatorio |
   | `SMTP_PASS` | Contraseña de aplicación de Gmail (solo si activas el correo real) |

4. **URL pública:** Worker → Settings → Domains & Routes → **workers.dev → Enable**. Queda en `https://agenda-clientes.<tu-subdominio>.workers.dev`. Ahí mismo puedes agregar un dominio propio (*Custom domain*).
5. **Correo real:** por defecto `MAIL_PROVIDER=log` (los correos solo aparecen en *Observability → Logs*). Para enviarlos desde `miguel.espinoza.dev@gmail.com`:
   1. Activa la verificación en 2 pasos en tu cuenta de Google.
   2. Crea una **contraseña de aplicación** y guárdala como secreto `SMTP_PASS`.
   3. Cambia `"MAIL_PROVIDER": "log"` a `"smtp"` en `wrangler.jsonc` y haz push.

Las variables públicas (correo del admin, remitente, SMTP, `OTP_ENABLED`) están en `vars` de `wrangler.jsonc`.

## Desarrollo local

Requisito: Docker Desktop.

```bash
cp .dev.vars.example .dev.vars   # y cambia las claves
docker compose up
```

| Qué | URL |
|---|---|
| Landing | http://localhost:3000 |
| Panel admin | http://localhost:3000/admin/ (`ADMIN_EMAIL` de `wrangler.jsonc` + `ADMIN_PASSWORD` de `.dev.vars`) |
| Correos de prueba (Mailpit) | http://localhost:8025 |

Es el mismo Worker que en producción (`wrangler dev`), con D1 local guardada en `.wrangler/state`. Para empezar de cero, borra esa carpeta.
Para probar el cron en local: `curl -X POST http://localhost:3000/cdn-cgi/local/scheduled`.

## Tests

```bash
npm test
```

Cubren el validador de RUT, el motor de horarios y la zona horaria de Chile (UTC-3 / UTC-4).

## Cómo funciona

**Reserva (3 pasos, pensada primero para el teléfono)**
1. Servicio, día y hora en una sola pantalla. Solo se muestran los días con cupo.
2. RUT, validado con módulo 11. Al ingresarlo se recuperan las mascotas del tutor:
   - En el **mismo dispositivo**: nombres completos y datos prellenados.
   - En un **dispositivo nuevo**: nombres enmascarados (`L••a · perro`) y el correo oculto.
   - Desde un dispositivo nuevo **no se puede cambiar el correo**, y la confirmación siempre va al correo registrado.
3. Resumen y confirmación. Se crea la visita `agendada` y se envía el correo con un link para ver o cancelar la hora y un archivo `.ics`.

**Anti reservas falsas**
- RUT válido obligatorio.
- Cookie técnica de dispositivo (firmada).
- Límites por RUT, por día, por dispositivo y por IP (guardados en D1).
- Honeypot y tiempo mínimo de llenado.
- Bloqueo automático del RUT tras N inasistencias.
- Las horas no pueden cruzarse: la reserva se inserta con un `INSERT … WHERE NOT EXISTS (choque)`, que SQLite ejecuta de forma atómica. Probado con reservas simultáneas.
- Opcional: `OTP_ENABLED=true` agrega un código de 6 dígitos por correo.

**Horarios**
- Horario por defecto por día de la semana.
- **Días especiales**: una fecha o un rango, cerrado o con horas propias. El panel avisa si dejan horas ya agendadas fuera.
- Switch para abrir o cerrar la agenda en línea.
- Todas las fechas se guardan en UTC y se muestran en hora de Chile (`src/lib/tz.js`).

**Datos personales (Ley 19.628 / 21.719)**
- Checkbox de consentimiento y página `/privacidad`.
- Desde el admin se pueden exportar los datos de un tutor (JSON), anonimizarlo o eliminarlo.
- Los tutores sin actividad por 24 meses se anonimizan solos (cron).
- Antes de producción, **revisar los textos legales con un abogado**.

## Estructura

```
wrangler.jsonc            Worker, assets, D1, cron y variables
src/index.js              Hono: /api/*, errores y tareas programadas
src/schema.js · db.js     Esquema D1 e inicialización, consultas, límites
src/routes/public.js      API pública (config, disponibilidad, lookup, reservas, mis horas)
src/routes/admin.js       API del panel
src/lib/                  slots (horarios), tz, correo, OTP, cookies, ics
presets/vet.js            Todo lo propio del rubro
public/                   Páginas y _headers (CSP)
```
