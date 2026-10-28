# Ecolens

Before planning or building any feature, read `docs/project-brief.md`. It is the source of truth for scope, workflow and guardrails.

- The approved technical stack is in `docs/stack.md`. Don't add new services or libraries outside it without flagging it first.
- Every feature should map to a stage of the operating model: Observe → Analyse → Interpret → Validate → Escalate → Report.
- Follow the non-negotiable principles in section 7 of the brief (human in the loop, an anomaly is not proof, provenance/confidence on everything, auditable status changes, role-based access).
- If a request falls outside the brief, flag it before building it.
- Record new product decisions in section 11 of the brief.
