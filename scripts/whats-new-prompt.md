You are writing this week's "What's New" bulletin for the Cores Worldwide timesheet app. Readers: Niki (approves the crew's days in SMS Review, payroll) and Tracy (office: supplies, Gear Photos, admin). Jim reads it first and decides whether to forward it. Neither reader is technical.

PERIOD: changes merged to origin/main from {{SINCE}} to {{UNTIL}} (inclusive). Issue date: {{UNTIL}}.

DO ONLY THIS. Do not edit, commit, push, deploy or run anything else. Do not touch the database. The only files you may write are under docs/whats-new/.

1. Find the changes:
   git log origin/main --since="{{SINCE}} 00:00" --until="{{UNTIL}} 23:59" --date=short --pretty='%h %ad %s'
   For each one with a PR number like (#123), read the PR description:
   gh pr view 123 --repo cores-worldwide/cores-timesheet --json title,body,mergedAt
   (If gh fails, use git show --stat <hash> and the commit message.)

2. Sort every change into exactly one place:
   - "crew": something the techs will notice when they text the bot or use the crew app, or something they should do differently. Give each a "say": one or two plain sentences Niki can text to the crew as-is. Use "say_label": "Say to new hires" when it's only for new people.
   - "office": a change to a screen Niki or Tracy uses (SMS Review, Timesheets, Payroll, Weekly Summary, Job Reports, Gear Photos, Admin Panel, printouts). Group under the screen name. Say what changed and what to click or do.
   - "behind": worth a one-line mention but nothing to do (reliability, backups, cost, security). Keep to 4 lines at most.
   - leave out: tests, docs, dev tooling, workflow/YAML fixes, refactors, reverts of something never seen, anything only Jim would care about.
   A change can feed both crew and office when both are true (e.g. a new rule the crew must follow and an office screen that enforces it).

3. Write docs/whats-new/{{UNTIL}}.json in this exact shape (see docs/whats-new/2026-10-09.json for a finished example and copy its tone):
   {"issued": "{{UNTIL}}", "period": "<Mon D - Mon D, YYYY>", "audience": "For Niki and Tracy, from Jim",
    "intro": "<one or two sentences>", "crew": [{"title","date","body","say"}], "office": [{"group","items":[{"title","date","body"}]}],
    "behind": ["..."], "foot": "Questions about any of this? Ask Jim."}
   "date" is the merge date like "Oct 14". Order crew items by how much they matter to the crew, office groups by how often the office uses that screen.

   Writing rules: plain words a payroll clerk uses. Name things by what's on screen (button and tab names), never file, table, function or PR names. Short, direct sentences. No emoji or symbols such as check marks or arrows (the PDF can't draw them). Never invent a detail that isn't in the PR or commit. Never name a crew member. If a PR says something was not tested or not yet live, leave it out or say it's coming.

   If nothing in the period is worth telling Niki or Tracy, still write the file with empty "crew" and "office" lists and an intro saying it was a quiet week.

4. Build it:
   python3 scripts/whats-new.py docs/whats-new/{{UNTIL}}.json --out docs/whats-new

5. Finish with ONE line only, no other output: either
   READY: <n> crew items, <m> office items
   or
   QUIET: nothing for the office this week
