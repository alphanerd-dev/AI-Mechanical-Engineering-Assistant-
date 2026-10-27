# Information architecture

## Global navigation
- Workspace overview
- Projects index, create and brief review
- AI Engineering Assistant with workspace-scoped threads
- Engineering templates
- Activity
- Profile, AI configuration and engineering defaults

## Project-scoped navigation
- Project overview
- Project AI chat
- Engineering workbench
- FEA results
- P&ID/PFD
- Calculations
- Files and artifacts
- Project history
- Revisions and approvals
- Reports
- Project settings

## Navigation contract
Every project route carries a stable project ID/code. Changing the selected project updates context for all project-scoped destinations. Global chat has no implicit project context; displayed sources match explicit context. The workbench is a project sub-area, not the entire application shell.
