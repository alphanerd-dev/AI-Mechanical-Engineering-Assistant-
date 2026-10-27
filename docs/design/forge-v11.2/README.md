# Forge v11.2 — Design reference

This directory versions the text specifications and canonical design tokens from the supplied design handoff package.

The source package SHA-256 is f52bc8f9877f7512edc5fdc95732f6ffe4a90119d78a841c7853857021498b31. The audited prototype HTML SHA-256 is a6d37e004d9d04167457a01174b839d40b998e4463af1b680e008b2b98e24d66.

The original archive contains 21 desktop screenshots at 1440×1000, 9 mobile captures at 390×844, a clickable screenshot catalogue, the unmodified audited prototype, design tokens, wireframes, component contracts and QA notes. Open screens/index.html inside the original archive to browse captures. Binary screenshots are not duplicated in this source-only commit.

## Authority
- Product intent, security, engineering validity and capability maturity: docs/product-brief.md and docs/implementation-plan.md.
- Visual appearance: supplied v11.2 desktop/mobile captures and copied token values.
- Screen structure and interactions: UX_CONTRACT.md, WIREFRAMES.md, INFORMATION_ARCHITECTURE.md and COMPONENT_SPEC.md.
- Actual implementation status: source code and test evidence on the exact commit, never screenshot presence alone.

The HTML prototype is a visual and interaction reference, not a production backend. Demo messages, runs, validation receipts, geometry, field values and approvals remain fixtures until real services supply them. Preserve the Supabase-backed modular monolith; do not replace it with Firebase or rebuild the engineering core.

## Screen inventory
Desktop: home, overview, projects, create, brief, chat, assistant, workbench, calculations, fea, pid, files, reports, history, revisions, projectSettings, settingsProfile, settingsAI, settingsUnits, templates, activity.

Mobile: home, overview, projects, create, chat, assistant, workbench, fea, settingsAI.

## QA boundary
The supplied capture report records 21/21 desktop and 9/9 mobile screenshots attempted and zero browser page errors during capture. That is not a full interaction, backend, authorization or accessibility audit. Re-capture the real application and compare at the same viewport sizes before release.
