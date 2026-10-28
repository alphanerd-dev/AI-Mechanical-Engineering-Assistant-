# Design system

Visual language: dark technical workspace, near-black navy background, layered blue-gray surfaces, restrained teal primary accent, semantic amber for provisional/warning, red for failure, blue for information and green for verified success. Never use color as the only status indicator.

Use tokens/design-tokens.css and tokens/design-tokens.json as the canonical starting point. Layout spacing follows 4px increments. Main surfaces use 10–14px radii; borders remain subtle but visible. Primary actions are filled teal; secondary actions are outlined or neutral. Interface text uses a system sans stack; IDs, units and engineering values use monospace.

Desktop uses a persistent sidebar and top bar; content width may reach approximately 1600px. Workbench panes may be resizable. Mobile uses drawer navigation, stacked cards/forms, sheet/tab access to chat context, reachable viewer controls and non-hover affordances.

The live CSS should consume these tokens semantically rather than introducing isolated color values. Token changes require rendered desktop and mobile review.
