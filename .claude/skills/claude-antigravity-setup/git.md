# git.md — cómo se escriben PRs, issues y contribuciones en GitHub

Mini playbook, escrito 20-ago-2026. Complementa la convención de
coautoría ya en uso en este repo (todo commit con asistencia de IA lleva
el trailer `Co-Authored-By: Claude`, ver los mensajes de commit reales de
`stellar/js-stellar-sdk#1672` y `x402-foundation/x402#3215`) — este
archivo cubre cómo se escribe algo NUEVO desde el principio para GitHub
(PRs, issues, comentarios), no una limpieza posterior de texto ya escrito.

## Instalación en cualquier proyecto — dos pasos, no uno

**Este archivo solo no hace nada.** Nadie lo carga automáticamente — hace
falta que `AGENTS.md` apunte a él. Periplo todavía no tiene `AGENTS.md`
(ver `.claude/skills/claude-antigravity-setup/SKILL.md`, punto 2); hasta
que exista, este archivo se sigue por convención directa, no por carga
automática.

1. Copia este archivo completo a `playbooks/git.md` del proyecto nuevo (o
   donde ese proyecto guarde sus playbooks — en este proyecto es
   `.claude/skills/claude-antigravity-setup/git.md`, mismo lugar que
   `SKILL.md`).
2. Agrega esto al final de `AGENTS.md` de ese proyecto:

```
**Todo PR, issue o comentario que se publique en un repo de GitHub —
propio o ajeno — se escribe humanizado al máximo, sin verbosidad, con el
trailer de coautoría de IA incluido, nunca oculto.** No basta con
reportar "encontré algo" — cuando la causa raíz ya está confirmada con
evidencia real, se propone el fix, no solo el hallazgo. Detalle en
`.claude/skills/claude-antigravity-setup/git.md`.
```

## La regla, en corto

Cuatro cosas, no una:

1. **Humanizado al máximo, sin verbosidad.** Nada de relleno tipo "es
   importante destacar que", nada de repetir en la conclusión lo que ya
   se dijo arriba, nada de listas de adjetivos vacíos. Se escribe como
   escribe una persona que ya sabe de qué habla, directo al hallazgo, la
   evidencia, y qué se hizo al respecto. Misma disciplina de registro que
   ya se aplicó en las pasadas de prosa de `README.md`, `docs/INTEROP.md`
   y `docs/SELLERS.md` (fuera guiones largos, negación-para-énfasis,
   negrita sobreusada) — esto no reemplaza esas pasadas, las extiende a
   contenido nuevo desde el momento en que se escribe, no como pasada
   posterior.
2. **El trailer de coautoría de IA nunca se oculta ni se quita.** El
   riesgo real no es que aparezca IA, es que **solo** aparezca IA sin
   juicio humano visible detrás — verificar en código real, correr los
   tests, confirmar contra la fuente, no solo redactar bonito.
3. **No basta con reportar — cuando la causa raíz está confirmada, se
   propone el fix.** Un issue que solo dice "encontré un bug" es más
   débil que uno que además incluye una reparación verificada con código
   real, no solo razonamiento. Pero esto tiene un límite explícito: si la
   causa raíz **no** está confirmada todavía, no se fuerza un fix — se
   investiga primero, con la misma reproducción aislada y verificada que
   ya se exige para el reporte original, y solo después de confirmar se
   escribe la reparación.
4. **Citar o parafrasear un hilo ajeno exige releer la fuente real ese
   mismo día, antes de publicar, no recitar desde lo que ya está en el
   contexto de una lectura anterior de la sesión.** Regla añadida
   26-ago-2026. Detalle completo abajo.

## Citar o parafrasear un hilo ajeno: releer primero, el disclosure es la consecuencia, no una plantilla

Cuando un PR/issue/comentario cite o parafrasee algo dicho en otro hilo
(un comentario ajeno, un PR body, un issue), el orden importa:

1. **Primero se relee la fuente real, hoy.** No se cita desde memoria de
   sesión ni desde una lectura anterior, por reciente que sea — la fuente
   pudo haberse editado (ver `x402-foundation/x402#3181`, cuya PR body
   tiene un edit fechado 25-ago corrigiendo una mischaracterización de
   una cita anterior) o la cita pudo copiarse mal la primera vez.
2. **Solo después, y solo si de verdad se releyó, el disclosure agrega
   una segunda oración:**

   ```
   Disclosure: drafted with AI assistance under my direction and reviewed
   by hand. Both quotations above were re-verified against the linked
   comments today.
   ```

   Ajustar `"Both"`/`"the"` al número real de citas del comentario
   (`"The quotation above was re-verified..."` para una sola,
   `"All three quotations above..."` para tres, etc.).

**La oración es la consecuencia de haber releído, no una plantilla que se
pega y después se justifica.** Si no hubo tiempo de releer la fuente
antes de publicar, la oración no va — un disclosure corto y verdadero es
mejor que uno largo sin respaldo real detrás. Una afirmación específica
que resulta falsa es peor que una vaga que nunca se comprueba, porque
ahora hay algo concreto que contradecir si alguien la chequea.

Aplica desde ya en cualquier comentario nuevo. No hace falta corregir
retroactivamente los ya publicados.

## Antes de publicar cualquier PR/issue/comentario — checklist

1. ¿Se lee como lo escribiría la persona que de verdad encontró esto, o
   como una lista de features generada? Si es lo segundo, reescribir.
2. ¿El trailer de coautoría sigue ahí? Nunca se borra para que "se vea
   más humano" — esa no es la forma correcta de humanizar el texto.
3. ¿La causa raíz está confirmada con evidencia real (código corrido, no
   solo la descripción de otro)? Si sí, y hay una reparación razonable,
   inclúyela. Si no, no inventes una — reporta el hallazgo tal cual y
   sigue investigando aparte.
4. ¿Se probó algo más allá de lo mínimo pedido (un caso límite extra, una
   verificación cruzada), o solo se repitió el caso obvio? La evidencia
   extra es lo que separa un reporte creíble de uno superficial.
5. ¿Hay una cita o paráfrasis de otro hilo? Si sí: ¿se releyó la fuente
   real hoy, antes de este publish? Solo si la respuesta es sí va la
   segunda oración del disclosure ("re-verified against the linked
   comments today"). Si no se releyó, esa oración no se agrega, aunque
   el resto del disclosure sí vaya.
