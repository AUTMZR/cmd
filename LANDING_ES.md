# Landing ES - Autmzr

*v1, 2026-05-04. Traducido al espanol para la comunidad de desarrollo de LATAM. Tono: humano, directo, vocabulario de desarrollador.*

---

## 1. Hero

### Todos tus VPS y CLIs en una sola interfaz movil

Conecta cualquier CLI a un servidor - y usalo en todos los demas. Ejemplos: envia un deploy desde un taxi, revisa los logs de prod en la fila del cafe, corrige una configuracion desde el sofa - por voz.

✓ Codigo abierto para auto-hospedaje
✓ Disenado primero para movil
✓ Entrada por voz

**[⭐ Dar estrella en GitHub]**   **[Version Cloud - $4.99/mes, prueba gratuita de 14 dias]**

---

## 2. El problema - te suena familiar?

- Se te ocurre una idea en transito. Anotas "lo hago esta noche" - por la noche ni recuerdas por que.
- Prod se cae a las 2am. Hora de sacar la laptop, conectarte por SSH, depurar a mano.
- Compraste una suscripcion CLI de $200 - tienes 3 servidores, pero solo funciona en uno.
- Configuraste un bot de Telegram. Se crashea, pierde contexto, muere despues de 5 minutos en medio de una tarea.

---

## 3. Como funciona - 3 pasos

### Paso 1. Instala Autmzr en cualquier servidor que tengas

```bash
curl https://cmd.autmzr.com/install | bash
```

O ejecutalo via `docker compose`. El auto-hospedaje es gratis, sin limites y sin telemetria.

### Paso 2. Conecta tus CLIs

En la interfaz web, instala Claude Code, Gemini CLI, o cualquier otro agente en tus servidores. Autentificate una vez - todo lo demas pasa por la app.

### Paso 3. Abrela en tu telefono

Todos tus VPS y proyectos, en un solo lugar. Lanza tareas, monitorea el progreso, dicta prompts por voz.

---

## 4. Que hace

### Un CLI para todo tu fleet

Conecta un CLI a un servidor - funciona en todos los demas a traves de un proxy integrado. Una suscripcion en lugar de tres. Nadie mas hace esto - porque va en contra de la forma en que monetizan.

### Asincrono - dispara y olvida

Lanza una tarea desde tu telefono, cierra la app, vete. El agente sigue corriendo en tu servidor por el tiempo que necesites - una hora, dos, toda la noche. Vuelve cuando quieras, mira el resultado.

A diferencia de los bots de Telegram que mueren a los 5 minutos con un falso "✅ listo".

### Entrada por voz

Escribir prompts largos en un telefono es doloroso. Toca el boton del microfono, dicta, envia. La voz se procesa en el navegador via Web Speech API - tu audio no llega a nuestros servidores.

Funciona en iOS Safari 14.5+, Chrome, Edge, Samsung Internet. Firefox todavia no, pero eso es ~3% de los usuarios.

### Multi-proyecto, multi-proveedor

Cualquier numero de proyectos en cualquier numero de servidores con cualquier agente.

Hoy: **Claude Code** y **Gemini CLI**. Proximos: Codex CLI, Aider, Cursor CLI - y lo que la comunidad pida (PRs bienvenidos).

### Auto-hospedaje: tus llaves se quedan tuyas

Tokens OAuth, llaves API, contexto del agente, historial de sesiones - todo almacenado solo en tu infraestructura. Sin servidor de sincronizacion de terceros, sin proxy intermediario. Es codigo abierto - `git clone` y verifica.

---

## 5. Escenarios reales - como lo vas a usar de verdad

### En transito

Se te ocurre una idea en un taxi. Abre la app, dicta por voz: "crea rama feature/dark-mode, anade un tema oscuro en Settings, abre un PR". Para cuando llegas, Claude hizo el trabajo y abrio el PR. Entras, abres tu laptop, revisas, mergeas.

### En el gimnasio

Entre series revisas los logs de prod. Algo esta fallando. Lanza a Claude a investigar desde tu telefono. Vuelve a tu ultima serie. Media hora despues - notificacion push: esta arreglado.

### En la fila del cafe

Cinco minutos son suficientes para actualizar una configuracion de nginx en tres servidores y lanzar un deploy. El cafe esta listo. Tu tambien.

### Desde el sofa

Acostado, sin ganas de caminar al escritorio. Dicta: "que hay de nuevo en proyecto X, que pendientes hay en Y, deploya Z a staging". El agente recorre el fleet y hace el trabajo. No te moviste.

---

## 6. Seguridad - tus cosas se quedan tuyas

Si auto-hospedas, no tenemos nada de tus datos. Nada.

- **Llaves API y tokens OAuth** se almacenan solo en tu base de datos Postgres. Nunca nos llegan a nosotros, nunca llegan a un broker de Anthropic, nunca salen de tu infraestructura excepto para la llamada real a Claude/Gemini.
- **Contexto del agente e historial de sesiones** - todo en tu servidor. Sin telemetria, sin analiticas, sin "telemetry pings".
- **El codigo es abierto** - si no nos crees, clona el repo y verifica tu mismo.

---

## 7. Roadmap

| Trimestre | Que viene |
|-----------|-----------|
| Q2 2026 | Soporte para Codex CLI, Aider |
| Q3 2026 | Soporte para Windows, app nativa de iOS/Android |
| Q4 2026 | Modo offline, sincronizacion P2P entre dispositivos |

---

## 8. Como empezar

### Opcion 1: Cloud (mas facil)

1. Registrate en [cmd.autmzr.com](https://cmd.autmzr.com)
2. Conecta tu primer servidor
3. Instala Claude Code o Gemini CLI
4. Empieza a usarlo desde tu telefono

### Opcion 2: Auto-hospedaje (gratis, sin limites)

```bash
git clone https://github.com/AUTMZR/cmd.git
cd cmd
docker compose up -d
```

Abre `http://localhost:3000` en tu navegador.

---

## 9. Comunidad

- [Discord](https://discord.gg/autmzr) - chat en tiempo real
- [GitHub Discussions](https://github.com/AUTMZR/cmd/discussions) - preguntas y propuestas
- [Twitter/X](https://x.com/autmzr) - actualizaciones

---

## 10. Idiomas

- [English (default)](LANDING_EN.md)
- [Russian](LANDING_RU.md)
- [Chinese](LANDING_ZH.md)
- [Spanish](LANDING_ES.md)

---

*Codigo abierto bajo licencia MIT. Hecho con ♥ por el equipo Autmzr.*
