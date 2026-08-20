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

Tres cosas, no una:

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
