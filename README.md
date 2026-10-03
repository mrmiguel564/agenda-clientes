# Agenda de horas — v1 Veterinaria

Landing con **autoagendamiento de horas sin pago**. El tutor elige servicio, día y hora, ingresa su RUT y elige a su mascota. Recibe la confirmación por correo y la hora queda registrada en el **historial de visitas** de la mascota.
El dueño administra todo desde `/admin`: agenda, horario por defecto, días especiales, fichas de mascotas y ajustes.

La base es genérica: los textos, servicios, especies y FAQ viven en `app/presets/vet.js`, y los colores en `app/public/css/tokens.css`. Otros rubros se agregan creando un preset nuevo.

## Levantar el proyecto

Requisito: **Docker Desktop**.

```bash
cp .env.example .env      # y cambia las claves
docker compose up --build
```

| Qué | URL |
|---|---|
| Landing | http://localhost:3000 |
| Panel admin | http://localhost:3000/admin (usa `ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`) |
| Correos de prueba (Mailpit) | http://localhost:8025 |
| Ver la base de datos (Adminer) | `docker compose --profile dev up` → http://localhost:8080 (servidor `db`) |

Los datos viven en el volumen `pgdata`, así que `docker compose down` y luego `up` no los borra. Para empezar de cero: `docker compose down -v`.

## Correo con Gmail (miguel.espinoza.dev@gmail.com)

1. Activa la **verificación en 2 pasos** en tu cuenta de Google.
2. Ve a Cuenta de Google → Seguridad → **Contraseñas de aplicaciones** y crea una (por ejemplo, "Agenda").
3. En `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=miguel.espinoza.dev@gmail.com
   SMTP_PASS=la contraseña de aplicación de 16 letras
   MAIL_FROM="Huellitas Vet <miguel.espinoza.dev@gmail.com>"
   ```
4. `docker compose up -d --build app`

Gmail permite unos 500 correos al día. El `.env` nunca se sube a git.

## Publicar con Cloudflare Tunnel

Cloudflare Pages solo publica sitios estáticos. Esta app tiene servidor y base de datos, así que se publica con un **túnel**: el `docker compose` corre en un equipo o VPS y Cloudflare lo expone con tu dominio y HTTPS, sin abrir puertos.

1. En Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel** (tipo Cloudflared). Copia el token.
2. En el mismo túnel, en **Public hostname**, agrega por ejemplo `agenda.tudominio.cl` apuntando a `HTTP` · `app:3000`.
3. En `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=el-token
   PUBLIC_URL=https://agenda.tudominio.cl
   TRUST_PROXY=1
   ```
   Además configura el correo real (Gmail) y cambia todas las claves.
4. Levanta todo con el túnel:
   ```bash
   docker compose --profile tunnel up -d --build
   ```

Para actualizar el servidor: `git pull` y luego `docker compose --profile tunnel up -d --build`.

## Cómo funciona

**Reserva (3 pasos, pensada primero para el teléfono)**
1. Servicio, día y hora en una sola pantalla. Solo se muestran los días que tienen cupo.
2. RUT, validado con módulo 11. Al ingresarlo se recuperan las mascotas del tutor:
   - En el **mismo dispositivo** donde ya reservó: nombres completos y datos prellenados.
   - En un **dispositivo nuevo**: nombres enmascarados (`L••a · perro`) y el correo oculto (`c*****@gmail.com`).
   - Desde un dispositivo nuevo **no se puede cambiar el correo**, y la confirmación siempre va al correo registrado.
3. Resumen y confirmación. Se crea la visita `agendada` y se envía el correo con un link para ver o cancelar la hora y un archivo `.ics`.

**Anti reservas falsas**
- RUT válido obligatorio.
- Cookie técnica de dispositivo.
- Límites por RUT, por día, por dispositivo y por IP.
- Honeypot y tiempo mínimo de llenado.
- Bloqueo automático del RUT tras N inasistencias.
- La BD impide que dos horas se crucen (constraint `EXCLUDE`).
- Opcional: `OTP_ENABLED=true` agrega un código de 6 dígitos por correo antes de confirmar.

**Horarios**
- **Horario por defecto**: rangos por día de la semana.
- **Días especiales**: una fecha o un rango de fechas, cerrado o con horas propias. Si dejan horas ya agendadas fuera, el panel avisa.
- **Switch** para abrir o cerrar la agenda en línea.

**Datos personales (Ley 19.628 / 21.719)**
- Checkbox de consentimiento y página `/privacidad`.
- Desde el admin se pueden exportar los datos de un tutor (JSON), anonimizarlo o eliminarlo.
- Los tutores sin actividad por 24 meses se anonimizan automáticamente.
- Antes de producción, **revisar los textos legales con un abogado**.

## Estructura

```
docker-compose.yml        db (Postgres 16) · app (Node 20) · mailpit · adminer (dev)
app/db/schema.sql         esquema idempotente, se aplica al iniciar
app/presets/vet.js        todo lo propio del rubro
app/src/lib/slots.js      motor de disponibilidad (puro, con tests)
app/src/routes/public.js  API pública (config, disponibilidad, lookup, reservas, mis horas)
app/src/routes/admin.js   API del panel
app/public/               landing, flujo de reserva, mis horas, admin (HTML/CSS/JS vanilla)
```

## Tests

```bash
cd app && npm install && npm test
```

Cubren el validador de RUT y el motor de horarios: horario semanal, días especiales, buffer, anticipación mínima, agenda cerrada y límites de fechas.
