---
name: session-close
description: End-of-session hygiene check — audits CLAUDE.md, AGENTS.md, SKILL.md, and the memory system for what genuinely needs updating, file by file, against each file's real purpose, not a generic "make sure it's current."
---

Before ending this session, audit each of the following against its own
real purpose — don't touch a file just because it's on this list, only
if something concrete actually changed today that belongs there.

**`CLAUDE.md` / `AGENTS.md`** — only update if a hard rule that should
apply to every future session was decided or changed today. Not facts,
not project status, not history — only standing rules. Confirm
`AGENTS.md` is still imported via `@AGENTS.md` if both exist. If nothing
rule-level changed, say so explicitly instead of padding the file.

**`.claude/skills/*/SKILL.md`** — only update if the actionable process
a skill describes changed today, not if a fact behind it changed. If a
recurring task done today doesn't have a Skill yet and clearly will
repeat, propose one — don't create it silently without flagging it.

**The memory system** — real facts, decisions, and their reasoning from
today go here, for whatever a future session would need to know.

Report back in this shape: CLAUDE.md/AGENTS.md — changed / not needed.
Skills — changed / new one proposed / not needed. Memory — what was
added, or "nothing new to persist." If everything reports "not needed,"
that's valid — don't invent a change to have something to report.
