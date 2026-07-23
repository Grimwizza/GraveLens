@AGENTS.md

---

## Response Structure (REQUIRED — every response)

Every response MUST end with this status block:

🟢 **Actions Taken:** [What you did/wrote/changed this turn. If none: "Nothing changed"]
🟡 **Decisions Required:** [What the user must decide before you can proceed. If none: "No decisions needed"]
🔴 **User Actions:** [Manual actions the user must perform. If none: "No actions needed"]
🔵 **Next Steps:** [Strategic recommendations for what should happen next.]

All four lines are mandatory. Never skip this block, even for short answers.

---

> **Note on `.claude/skills/`:** these are a **synced copy** of the canonical agent skills that live
> in the LowHigh monorepo. Do not edit skills here — edit the canonical copy in the monorepo and run
> `scripts/sync-skills.sh` to propagate. Local edits here will be overwritten on the next sync.
