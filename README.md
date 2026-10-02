# taskghost

Panel always-on-top (timer de sesión + tarea actual + todo list) y dashboard. 100% local, sin red.

```
npm install
npm start          # correr
npm test           # tests de la lógica
npm run dist       # .exe portable (Windows) / AppImage (Linux)
```

## Uso

Estilo inspirado en Apple (superficies con material y sombra, esquinas continuas, tipografía con escala de macOS, animaciones con springs) y pensada para usarse con el teclado.

**Regla de las teclas:** cada acción usa la primera letra de su nombre, y en la interfaz esa letra está subrayada. Si dos acciones chocan, gana la más usada; las que tienen tecla estándar la usan (`Ctrl+Z`, `Supr`, `Espacio`, flechas).

| Atajo (global) | Acción |
|---|---|
| `Ctrl+Alt+T` | Alterna fantasma ↔ panel activo |
| `Ctrl+Alt+N` | Captura rápida: una línea para agregar una tarea sin abrir el panel |
| `Ctrl+Alt+L` | **Tecla líder**: ~2 s de teclas sueltas (abajo) |
| `Ctrl+Alt+H` | Marca la tarea actual como hecha y pasa a la siguiente |
| `Ctrl+Alt+P` | Inicia / pausa / reanuda la sesión |
| `Ctrl+Alt+D` | Abre el dashboard |

**Tecla líder** (widget en fantasma, sin robarle el foco a lo que estés haciendo): `↑`/`↓` tarea anterior/siguiente · `h` completa la actual ·
`p` pausa · `r` reanuda · `i` inicia · `t` termina (dos veces si la sesión se descartaría) · `n` nueva · `Ctrl+Z` deshacer · `a` abre el panel · `d` dashboard · `c` claro/oscuro · `Esc` cancela.
Cada tecla renueva la ventana de 2 s.

**Panel activo, modal como vim.** Se abre en **NORMAL** (o en INSERT si no hay tareas):
`↑`/`↓` elige · `Inicio`/`Fin` · `1`–`9` selecciona por número · `Enter`/`a` activa · `h`/`Espacio` hecha · `Alt+↑`/`Alt+↓` reordena ·
`bb`/`Supr` borra · `Ctrl+Z` deshace · `l` limpia hechas · `i` inicia · `p` pausa · `r` reanuda · `tt` termina · `n` nueva tarea en **INSERT**
(va al proyecto del widget; `Enter` agrega, `Esc` vuelve a NORMAL) · `#` cambia de proyecto · `c` claro/oscuro · `d` dashboard · `?` ayuda · `Esc` sale a fantasma.

**Un proyecto a la vez:** el widget trabaja en un solo proyecto (se ve en el título) y las tareas nuevas van ahí sin escribir `#`.
Para cambiarlo: `#` en el panel (o click en el chip), escribí el nombre y `Enter` (`#` solo = sin proyecto); o Dashboard → Proyectos → *usar*.

**Dashboard:** `F1`–`F6` (o `1`–`6`) cambian de vista; en Tareas `↑`/`↓` mueve la fila, `h` hecha, `a` activa, `bb` borra,
`Alt+↑`/`Alt+↓` reordena, `r` renombra, `n` nueva, `p` `e` filtran proyecto/estado, `Ctrl+Z` deshace; `c` claro/oscuro, `?` ayuda.

Modo fantasma: los clicks atraviesan la ventana y nunca toma foco.
La sesión se pausa sola al bloquear la pantalla, suspender o cerrar la app.

**Acento:** Dashboard → Ajustes → *Color de acento*: los colores de sistema de Apple (azul por defecto, con su variante clara y oscura) o cualquier color. Los rellenos usan el color vivo; el texto en acento se ajusta solo por tema para no perder contraste.

**Ícono:** la fuente es `assets/logo.svg` (y la silueta de una tinta, `assets/glyph.svg`). `npx electron assets/make_icon.js` regenera `icon.png`, `icon.ico` y los íconos de bandeja (`tray-dark`/`tray-light`).
Si otra app ya usa un atajo global, el widget avisa al arrancar; se cambia en `config.json` → `shortcuts`.

## Datos

Carpeta de usuario de la app (`%APPDATA%\taskghost` en Windows, `~/.config/taskghost` en Linux):

- `state.json` — tareas, proyectos, proyecto del widget, sesión en curso, posición de la ventana
- `intervals.jsonl` — un tramo trabajado por línea (tarea, inicio, fin); base de los gráficos
- `sessions.jsonl` — una línea por sesión terminada
- `config.json` — tema, `accent` (color de acento `#rrggbb`), estilo de reposo (`ghostStyle`: `pill`/`dot`), opacidad del *fondo* en reposo (el texto siempre es opaco), mínimos de sesión y atajos. Casi todo se cambia desde Dashboard → Ajustes; los atajos globales requieren reiniciar

Una sesión no se guarda si dura menos de `minSessionMinutes` (5 por defecto) o si no se completó ninguna tarea
(`requireCompletedTask`). Además, una sesión trabaja en un solo proyecto: el del widget al iniciarla, y no se puede cambiar hasta terminarla.
