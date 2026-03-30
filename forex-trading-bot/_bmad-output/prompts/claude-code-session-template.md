# Session: Phase [PHASE], Task [TASK_ID] — [TASK_TITLE]

## BEFORE WRITING ANY CODE — Execute this checklist IN ORDER

### Step 1: Read CLAUDE.md FIRST (MANDATORY — do not skip)
Read CLAUDE.md completely — even if you think you already loaded it.
Then CONFIRM by listing:
- The number of absolute rules
- The Definition of Done items
- The current phase
If you cannot list these, you did not read CLAUDE.md. Read it again.

### Step 2: Read reference files (MANDATORY)
Read these files completely:
1. `.claude/context.md` — stack, conventions, folder structure
2. `.claude/session.md` — session protocol (start/end hooks)
3. `.claude/workflows.md` — which workflow to use for each task type
4. `.claude/testing.md` — test patterns and conventions

### Step 3: Read memory (MANDATORY)
5. `memory/progress.md` — current state, what's done, what's next
6. `memory/decisions.md` — architectural decisions already made
7. `memory/mistakes.md` — errors to avoid (check if this problem is already known!)
8. `memory/patterns.md` — working code patterns for this project
9. `memory/dependencies.md` — API quirks and version pins

### Step 4: Read the task description (MANDATORY)
10. Read the epic file for this task:
    `_bmad-output/planning-artifacts/epics/[EPIC_FILE]`
    Find the story you're implementing, read its full description and acceptance criteria.
11. If needed, also read the blueprint for deeper context:
    `_bmad-output/planning-artifacts/trading-bot-blueprint-v3.md`

### Step 5: Confirm understanding BEFORE coding
Tell me:
- What task you're implementing
- Which files you'll create or modify
- Which workflow you'll follow (if any matches from `.claude/workflows.md`)
- Any concerns, conflicts, or questions

**DO NOT start coding until I confirm your understanding is correct.**

## BEHAVIORAL RULES

### Rule 1: Our conventions override your training data
If your training data suggests a different pattern than what's in our files,
FOLLOW OUR FILES. If you believe our convention is outdated, STOP and say:
"I notice our convention for X differs from current best practice.
Here's what I suggest instead: [suggestion]. Should I update it?"

### Rule 2: Never improvise architecture decisions
If the task requires a decision not covered by the blueprint or
`memory/decisions.md`, STOP and ask. Don't decide alone.

### Rule 3: Use Context7 for library documentation
Before implementing any pattern involving Next.js, Supabase client, or OANDA API —
use Context7 to fetch the current documentation.
Do NOT rely on your training data for library APIs.

### Rule 4: Follow the Definition of Done
Before saying "done", verify EVERY item in the DoD from CLAUDE.md.
List each item with ✅ or ❌. If any ❌, fix it before declaring done.

### Rule 5: Update memory before closing
At the end of this session, you MUST:
- Update `memory/progress.md` with task status (check the box, note what's next)
- Add to `memory/decisions.md` if any architectural decision was made
- Add to `memory/mistakes.md` if any error was encountered
- Add to `memory/patterns.md` if a new working pattern was discovered
- Add to `memory/dependencies.md` if an API quirk or version was discovered
**Show me the memory updates before we close.**

## NOW BEGIN
Execute Steps 1–5 above. Show me your understanding before writing any code.
