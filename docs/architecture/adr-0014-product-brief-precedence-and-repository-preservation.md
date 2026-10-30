# ADR-0014: Product brief precedence and repository preservation

- **Status:** Accepted for the Forge phased implementation
- **Date:** 2026-10-29
- **Context:** The Forge master prompt contains example technology choices and a broad route/schema wishlist. The established AI Mechanical Engineering Assistant repository already contains Next.js, Supabase-backed project/workspace state, capability routing, deterministic calculations, isolated engineering workers, private CAD artifact persistence and validation/evidence contracts. The Forge v11.2 handoff is a visual/interaction reference, not a backend.
- **Decision:** Continue the existing repository and modular monolith. Preserve this precedence: (1) original product brief, doctrine and accepted ADRs; (2) source, migrations and verified behavior on the exact revision; (3) v11.2 screenshots/tokens/UX contracts; (4) implementation instructions. The explicit instruction to retain Supabase supersedes incidental Firebase mentions. No second Firebase database or separately generated application is introduced.
- **Consequences:**
  1. Current routes and tables are inspected and mapped before replacement or expansion. Handoff routes are design targets, not assertions about what exists.
  2. New persistence entities require an evidenced domain gap, migration, indexes/foreign keys, RLS and isolated acceptance. Prompt table names alone do not justify duplicate stores.
  3. AI providers stay behind server-side adapters. Gemini may be added through the provider boundary when configured and tested; a prompt or environment variable alone does not establish connectivity.
  4. Deterministic engineering services, independent validators, artifact digests and audit lineage remain authoritative. Model output, process exit, a rendered viewer or a persisted file cannot independently imply engineering acceptance.
  5. Unconnected CAD/FEA/P&ID and other integrations remain clearly marked planned, pilot, unavailable or illustrative.
  6. Implement changes as small feature-branch vertical slices, with tests and current-SHA evidence. Do not rewrite the app or change production settings to satisfy the prompt.
- **Alternatives rejected:** Start a fresh Google AI Studio/Firebase app; migrate existing Supabase state; port the complete HTML prototype as one React component; claim all prototype routes/viewers as implemented; introduce a multi-agent framework before a demonstrated need.
- **Verification:** Baseline repository and current route inventory inspected; 16 migration files identified; v11.2 ZIP/HTML hashes matched the pinned handoff; main SHA 3579fcdc64c20745e5490177d31e1eb1d67e6e9b has successful current check runs, including isolated authenticated CAD/persistence acceptance. The exact follow-up branch must re-run relevant tests before its changes are considered accepted.
