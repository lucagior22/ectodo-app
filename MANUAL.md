# taskghost — Manual de uso

taskghost es un panel que queda siempre arriba a la derecha de tu pantalla, con un timer de sesión, un timer de la tarea actual y tu lista de tareas. Corre 100% local: no usa internet ni cuentas.

---

## 1. Puesta en marcha

**Desde el código** (requiere Node.js):

```
cd D:\dev\taskghost
npm install
npm start
```

**Como ejecutable portable (Windows):**

```
npm run dist
```

Genera `dist\taskghost 0.2.0.exe`. Es un solo archivo: copialo donde quieras y ejecutalo. Como no está firmado, Windows SmartScreen puede avisar la primera vez ("Más información" → "Ejecutar de todas formas").

Al iniciar, aparece la **píldora** arriba a la derecha y un ícono en la bandeja del sistema. Solo se puede tener una instancia abierta: si lo ejecutás de nuevo, abre el panel de la que ya corre.

---

## 2. Los dos estados del widget

### Fantasma (estado normal)
Por defecto, una píldora semitransparente con:

```
00:18:05                 ← reloj de la tarea actual
▶ Arreglar bug de login  ← tarea activa
```

- **Un solo reloj, sin tickeo:** en reposo solo se muestra el de la tarea y avanza **de a 5 segundos**, para no distraer. El reloj de sesión aparece cuando abrís el panel.
- Los clicks **atraviesan** la ventana: no tapa botones ni te roba el foco mientras trabajás.
- Si la sesión está pausada, muestra `⏸ pausada`. Sin sesión, muestra `Sin sesión`.
- **Se corre si dejás el mouse encima:** al apoyar el cursor sobre la píldora, se desliza al otro lado de la pantalla, a la misma altura, y vuelve cuando sacás el cursor de esa esquina. Pasar de largo no la mueve. Al cerrar el panel con el cursor encima tampoco: primero tenés que sacar el mouse. No cambia la posición guardada. En el estilo círculo no se mueve, porque ahí el hover abre el rectángulo.

#### Variante opcional: círculo con logo
En **Ajustes → Widget en reposo → Círculo**, el estado de reposo pasa a ser solo el logo de la app en un circulito arriba a la derecha (el borde cambia de color: el de acento corriendo, naranja pausada, gris sin sesión). **Al pasar el mouse por el círculo, el círculo se expande en el rectángulo** con los dos relojes en vivo; se vuelve a cerrar en el círculo al sacar el mouse o, si no lo movés, solo a los ~3,5 s. Abrir y cerrar el panel también se anima desde y hacia el círculo. Sigue siendo click-through: es solo para mirar.

No está disponible en Linux (no se puede detectar el mouse a través de una ventana transparente); ahí se usa la píldora.

### Activo (panel completo)
Se abre con `Ctrl+Alt+T`. Es casi opaco, interactivo y muestra la lista completa. Se vuelve a fantasma con `Esc`, con `Ctrl+Alt+T` otra vez, o al hacer click en cualquier otra ventana.

Es **modal, como vim** (la barra de estado de abajo dice en cuál estás):

- **NORMAL** (al abrir): las teclas sueltas son comandos. Es el modo para moverte y actuar.
- **INSERT**: escribís una tarea. Se entra con `n` (o haciendo click en el campo), y se vuelve con `Esc`. Si no hay ninguna tarea, el panel abre directo en INSERT.
- **AYUDA** (`?`): una hoja con todas las teclas.

Podés **arrastrar** el panel desde la zona de los timers; recuerda la posición para la próxima vez.

### Captura rápida
`Ctrl+Alt+N` muestra solo la píldora y **una línea** para escribir. `Enter` agrega la tarea al proyecto del widget (o `#nombre` solo cambia de proyecto) y vuelve a fantasma; `Esc` cancela. Es la forma de anotar algo sin cortar lo que estás haciendo.

---

## 3. Atajos de teclado

Todo el programa se puede usar sin mouse. Con `?` (en el panel y en el dashboard) y en **Ajustes → Atajos de teclado** ves siempre la lista vigente.

**Regla de las teclas:** la tecla de una acción es **la primera letra de su nombre**, y en la interfaz esa letra aparece <u>subrayada</u> (botones, barra de estado, leyenda de la líder). Si dos acciones quieren la misma letra, gana la que más se usa. Las acciones con una tecla estándar la usan: `Ctrl+Z` deshace, `Supr` borra, `Espacio` marca hecha, las flechas mueven.

### Globales (funcionan desde cualquier programa)

| Atajo | Acción |
|---|---|
| `Ctrl+Alt+T` | Alterna fantasma ↔ panel activo |
| `Ctrl+Alt+N` | Captura rápida de una tarea |
| `Ctrl+Alt+L` | **Tecla líder** (ver abajo) |
| `Ctrl+Alt+H` | Marca la tarea actual como **h**echa y pasa a la siguiente |
| `Ctrl+Alt+P` | Inicia sesión / pausa / reanuda |
| `Ctrl+Alt+D` | Abre el **d**ashboard |

Si tu `config.json` todavía tenía los atajos predeterminados anteriores (`Ctrl+Alt+D` para completar, `Ctrl+Alt+B` para el dashboard), se cambian solos a los nuevos; uno que hayas personalizado no se toca.

### Tecla líder
`Ctrl+Alt+L` con el widget en fantasma habilita **2 segundos de teclas sueltas** sin darle foco al widget (lo que estés haciendo en otro programa no se interrumpe). La píldora muestra la leyenda. Cada tecla renueva los 2 s, así que `↓ ↓ ↓` recorre varias tareas.

| Tecla | Acción |
|---|---|
| `↑` / `↓` | Activa la tarea anterior / siguiente |
| `h` | Marca **h**echa la tarea actual y pasa a la siguiente |
| `p` / `r` | **P**ausa / **r**eanuda |
| `i` | **I**nicia la sesión (si no hay una) |
| `t` | **T**ermina la sesión (si se descartaría, hay que pulsar `t` **dos veces**) |
| `n` | **N**ueva tarea (captura rápida) |
| `Ctrl+Z` | Deshace la última acción |
| `a` / `d` | **A**bre el panel / el **d**ashboard |
| `c` | Alterna **c**laro/oscuro |
| `Esc` | Cancela |

Pasados los 2 s sin pulsar nada, todas las teclas se liberan solas. Abrir el panel o la captura también las libera, para que nunca compitan con lo que escribís. Con el panel abierto la líder no hace nada.

### Dentro del panel activo
**Modo NORMAL**

| Tecla | Acción |
|---|---|
| `↓` / `↑` | Cambia la selección |
| `Inicio` / `Fin` | Primera / última tarea |
| `1`–`9` | Selecciona la tarea con ese número (el que se ve a la izquierda) |
| `n` | **N**ueva tarea (pasa a INSERT) |
| `h` o `Espacio` (o `Ctrl+D`) | Marca **h**echa / reabre |
| `Enter` o `a` | **A**ctiva la tarea seleccionada |
| `Alt+↑` / `Alt+↓` | Reordena |
| `bb` (o `Supr`) | **B**orra la tarea |
| `Ctrl+Z` | **Deshace** la última acción sobre la lista |
| `l` | **L**impia las hechas (las archiva) |
| `i` | **I**nicia la sesión |
| `p` | **P**ausa la sesión |
| `r` | **R**eanuda la sesión |
| `tt` | **T**ermina la sesión |
| `c` | Alterna **c**laro/oscuro |
| `d` | Abre el **d**ashboard |
| `?` | Hoja de ayuda |
| `Esc` | Cancela un prefijo pendiente; si no hay, vuelve a fantasma |

Las acciones destructivas se **duplican** (`bb`, `tt`) y la barra de estado muestra el prefijo pendiente (`b-`) durante 1.2 s. La barra de abajo solo muestra lo que aplica en ese momento (sin sesión: **i**niciar; corriendo: **p**ausa y **t**erminar; pausada: **r**eanudar y **t**erminar).

**Modo INSERT:** `Enter` agrega la tarea al proyecto del widget (un `#otro` en el texto manda; `#nombre` solo cambia de proyecto), `Enter` con el campo vacío vuelve a NORMAL, `Esc` vuelve a NORMAL, `↑` / `↓` siguen cambiando la selección.

### Deshacer
`Ctrl+Z` deshace agregar, completar/reabrir, eliminar, reordenar y limpiar hechas (hasta 50 pasos). **No revierte el tiempo ya trabajado**: si completás una tarea, seguís un rato en la siguiente y deshacés, ese tiempo queda registrado donde corresponde. La pila se vacía al iniciar o terminar una sesión.

También podés usar el mouse: click en el título activa la tarea, en el círculo la marca hecha, en `×` la elimina.

### En el dashboard
| Tecla | Acción |
|---|---|
| `F1`–`F6` o `1`–`6` | Hoy · Tareas · Proyectos · Sesiones · Gráficos · Ajustes |
| `↑` / `↓` | En **Tareas**, mueve el cursor de fila; en las otras vistas, desplaza |
| `h` / `Espacio`, `a` / `Enter`, `bb`, `Alt+↑` / `Alt+↓` | **H**echa, **a**ctivar, **b**orrar, reordenar la fila del cursor |
| `r` | **R**enombra la tarea del cursor (`Enter` confirma) |
| `n` | Va al campo “**N**ueva tarea” |
| `p`, `e` | Cicla el filtro de **p**royecto · de **e**stado |
| `Inicio` / `Fin` | Primera / última fila (o arriba / abajo del todo) |
| `Ctrl+Z` | Deshace |
| `c` | Alterna **c**laro/oscuro |
| `?` | Hoja de ayuda |
| `Esc` | Sale de un campo de texto / quita el cursor |

---

## 4. Flujo de trabajo típico

1. `Ctrl+Alt+N` para anotar tareas al vuelo (o `Ctrl+Alt+T` y `n` para cargar varias seguidas).
2. `Ctrl+Alt+T`, elegí con `↑`/`↓` (o el número) la primera y `Enter` para activarla, o dejá la primera que queda activa sola.
3. `i` (o `Ctrl+Alt+P`) inicia la sesión. Los timers empiezan a correr.
4. `Esc` y a trabajar: la píldora sigue visible y semitransparente.
5. Con la líder, sin abrir nada: `Ctrl+Alt+L` y `h` completa la tarea y pasa a la siguiente; `↑`/`↓` cambia de tarea; `p` pausa.
6. ¿Te equivocaste? `Ctrl+Z` (en el panel, la líder o el dashboard).
7. Al final, abrí el panel y `tt` (o click en **Terminar**).

---

## 5. Timers y sesiones

- **Tiempo de sesión:** suma solo mientras la sesión está corriendo. Las pausas no cuentan.
- **Tiempo de tarea:** total acumulado de esa tarea (en todas las sesiones), contando solo cuando es la activa y la sesión corre.
- **Cambiar de tarea** cierra el tramo de la anterior y abre uno nuevo: el tiempo se reparte solo.
- **Pausa automática** al bloquear la pantalla, suspender la PC o cerrar la app. No reanuda sola: al volver, `Ctrl+Alt+P`.
- **Recuperación:** si la app se cae, al reabrir la sesión queda pausada en el último guardado (se guarda cada 30 s).
- **Terminar sesión:** guarda el registro en el historial y archiva las tareas hechas (siguen visibles en el dashboard, pero salen del panel).
- **Sesiones que no se guardan:** una sesión se **descarta** (no entra al historial, ni su tiempo a los totales y gráficos) si dura menos de **5 minutos** o si **no completaste ninguna tarea**. Cuando esto aplica, el botón **Terminar** se pone en naranja y el panel avisa *"Si terminás ahora la sesión no se guarda"*; al terminar, la píldora muestra *"Sesión descartada: motivo"* unos segundos. Ambos mínimos se cambian en Ajustes.

---

## 6. Tareas y proyectos

- **Proyecto con `#`:** escribí `arreglar login #taskghost` y la tarea queda en el proyecto `taskghost`. El `#tag` se saca del título. Los proyectos se crean solos, con un color asignado.
- **El widget trabaja en un proyecto:** se ve en el título (`taskghost · #web`) y en el chip junto a *Iniciar*. El panel muestra solo las tareas de ese proyecto (avisa cuántas de otros quedan ocultas) y **toda tarea nueva sin `#tag` va ahí**: no hace falta escribir el proyecto cada vez.
- **Cambiar de proyecto:** `#` en NORMAL (o click en el chip) abre INSERT con `#` escrito; completá el nombre y `Enter`. `#` solo = *sin proyecto*. También desde Dashboard → Proyectos → **usar**, o activando (▶) una tarea de otro proyecto. Si no existe, se crea. No se puede cambiar con una sesión en curso.
- **Una sesión, un proyecto:** la sesión arranca en el proyecto del widget y queda fijada a él: solo podés activar sus tareas y al completar una salta a la siguiente **del mismo proyecto**. Las tareas *sin proyecto* cuentan como un grupo más.
- **Sin tareas abiertas no se puede iniciar sesión.**
- **Limpiar hechas:** el botón del pie del panel archiva las tareas hechas sin terminar la sesión.
- **Tareas hechas:** se pueden reabrir desde el panel (`Ctrl+D`) o desde el dashboard.
- **Eliminar una tarea** no borra su tiempo registrado: queda en el historial y los gráficos.

---

## 7. Dashboard

Se abre con `Ctrl+Alt+D` (o `d` desde el panel), desde el ícono de la bandeja o con el botón **Dashboard** del panel. Es una ventana normal; podés cerrarla sin afectar el widget.

| Vista | Qué muestra |
|---|---|
| **Hoy** | Tiempo trabajado hoy, sesiones, tareas cerradas, tarea activa y línea de tiempo del día: una fila por tarea (en orden de inicio, con su total), las sesiones arriba (un hueco dentro de una sesión es una pausa) y una línea en la hora actual |
| **Tareas** | Arriba, dos tarjetas para crear: **Nueva tarea** (título, proyecto por botones o uno nuevo escrito, `Enter` agrega) y **Agregar varias** (una por línea, cada una acepta su `#proyecto`; `Ctrl+Enter` o el botón las agrega). Debajo, la tabla editable: renombrar (click en el texto y `Enter`), cambiar proyecto, marcar hecha, activar (▶), reordenar (↑↓), eliminar (✕), con filtros por proyecto y estado. Con una sesión en curso, las tareas de otros proyectos se atenúan y no se pueden activar |
| **Proyectos** | Tiempo total, tareas abiertas/hechas y reparto por proyecto. El selector de color cambia el color en todo el programa; **usar** lo pone como proyecto del widget |
| **Sesiones** | Historial: fecha, horario, duración, pausas y cuánto se dedicó a cada tarea |
| **Ajustes** | Tema, **color de acento**, estilo del widget en reposo (píldora/círculo), opacidad del fondo, duración mínima de sesión, exigir tarea completada, y la hoja de atajos (los globales se editan en `config.json`). Todo se guarda en `config.json` y se aplica al instante |
| **Gráficos** | Horas por día (14 días, apiladas por proyecto), reparto por proyecto (30 días) y tendencia semanal (8 semanas) |

Los números de "Hoy" y "Tareas" corren en vivo mientras hay una sesión activa.

---

## 8. Bandeja del sistema

Click en el ícono: abre el panel. Click derecho: mostrar panel, abrir dashboard, iniciar/pausar/reanudar, terminar sesión y **Salir**.

Cerrar el dashboard **no** cierra la app. Para salir del todo, usá **Salir** en la bandeja.

---

## 9. Configuración

Casi todo se cambia desde **Dashboard → Ajustes** y se guarda solo en `config.json` (en la carpeta de datos, se crea al primer inicio). El modo claro/oscuro también se alterna con el botón ☾/☀ del panel, el del dashboard o el menú de la bandeja. Los **atajos** solo se editan a mano en el archivo y **requieren reiniciar**.

```json
{
  "shortcuts": {
    "togglePanel": "Control+Alt+T",
    "completeCurrent": "Control+Alt+H",
    "togglePause": "Control+Alt+P",
    "dashboard": "Control+Alt+D",
    "capture": "Control+Alt+N",
    "leader": "Control+Alt+L"
  },
  "ghostOpacity": 0.55,
  "accent": "#3dff7a",
  "theme": "dark",
  "ghostStyle": "pill",
  "minSessionMinutes": 5,
  "requireCompletedTask": true
}
```

| Clave | Valores |
|---|---|
| `theme` | `"dark"` / `"light"` |
| `accent` | Color de acento `#rrggbb`. En cada tema se aclara u oscurece lo necesario para mantener un contraste mínimo de 4.5:1 contra el fondo, así que cualquier color queda legible |
| `ghostStyle` | `"pill"` (píldora) / `"dot"` (círculo con logo) |
| `minSessionMinutes` | 0–240; las sesiones más cortas se descartan |
| `requireCompletedTask` | `true` descarta las sesiones sin ninguna tarea completada |

- **Atajos:** formato de Electron (`Control+Shift+K`, `Alt+F9`, etc.). Si un atajo choca con otro programa, la app lo ignora y **lo avisa en el widget** al arrancar; cambialo por otro. Ojo en Windows: `Ctrl+Alt` equivale a **AltGr**, y en teclados español/latino combinaciones con dígitos y algunas letras escriben símbolos (`@`, `#`, `|`, `€`); evitá esas.
- **ghostOpacity:** de `0.2` a `1`. Controla solo la opacidad del **fondo** del widget en reposo (el texto siempre se ve opaco).

---

## 10. Dónde se guardan los datos

| Sistema | Carpeta |
|---|---|
| Windows | `%APPDATA%\taskghost` |
| Linux | `~/.config/taskghost` |

| Archivo | Contenido |
|---|---|
| `state.json` | Tareas, proyectos, proyecto del widget, sesión en curso, posición de la ventana |
| `intervals.jsonl` | Un tramo trabajado por línea (tarea, inicio, fin). De acá salen los gráficos |
| `sessions.jsonl` | Una línea por sesión terminada |
| `config.json` | Atajos, tema, estilo y opacidad del widget, mínimos de sesión |

Son archivos de texto: podés hacer **backup** copiando la carpeta, o **empezar de cero** cerrando la app y borrándola. Si `state.json` se corrompe, la app lo renombra a `state.corrupt-<fecha>.json` y arranca limpia (el historial no se pierde).

---

## 11. Problemas comunes

| Problema | Solución |
|---|---|
| `Ctrl+Alt+T` (u otro atajo) no hace nada | Otro programa usa ese atajo; el widget lo avisa al arrancar. Cambialo en `config.json` (la líder, por ejemplo, choca con otras apps si usan `Ctrl+Alt+Espacio`: por eso el defecto es `Ctrl+Alt+L`) |
| El panel se abre pero no puedo escribir | Es el modo NORMAL: pulsá `i` (o hacé click en el campo) para escribir; `Esc` vuelve |
| Las teclas del panel no responden | Hacé click dentro del panel; en Windows el foco a veces tarda |
| El panel desapareció de pantalla | Cerrar sesión de monitor/cambiar resolución puede dejarlo fuera. Borrá `"window"` de `state.json` (o el archivo) y reiniciá: vuelve arriba a la derecha |
| La píldora tapa algo | Es click-through: podés clickear a través, y si dejás el mouse encima se corre al otro lado. Si molesta la vista, bajá `ghostOpacity` o arrastrala desde el panel activo |
| No veo la app en la barra de tareas | Es intencional: vive en la bandeja del sistema (puede estar en el menú `^`) |
| Terminé una sesión y no aparece en el historial | Se descartó por durar menos del mínimo o no tener ninguna tarea completada (la píldora lo avisa al terminar). Ajustá los mínimos en Ajustes |
| No puedo activar una tarea durante la sesión | Es de otro proyecto que la sesión. Terminá la sesión, cambiá de proyecto (`#`) y empezá otra |
| Agregué una tarea y no aparece en el panel | Tenía un `#tag` de otro proyecto (el widget avisa). Está en el dashboard, o cambiá de proyecto con `#` |
| El reloj de la píldora salta de a 5 segundos | Es intencional, para que no distraiga. El panel muestra los segundos en vivo |
| El timer no avanza | Probablemente la sesión está pausada o no hay tarea activa. Mirá la segunda línea de la píldora |
| Linux: sin transparencia o no queda arriba | Se fuerza X11/XWayland, pero depende del compositor. Esta versión no fue probada en Linux |

---

## 12. Alcance y límites (v0.1)

Incluido: sesiones con pausa, tareas con proyectos, historial, dashboard con tablas y gráficos.

Incluido también: descarte automático de sesiones vacías o muy cortas, una sesión por proyecto, pantalla de Ajustes, tema claro/oscuro y estilo de reposo en círculo.

No incluido todavía: pomodoro, subtareas, múltiples listas, exportar a CSV, metas de horas, arranque automático con Windows, configuración de atajos desde una pantalla.
