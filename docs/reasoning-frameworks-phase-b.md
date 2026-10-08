# Phase B: Standardized Validation and Reasoning Records

## Standard schema validation

Skill manifests, framework manifests, and reasoning records use JSON Schema Draft 2020-12. Ajv 8 is the maintained validator implementation, configured with strict schema checking and all-errors reporting. Schemas reject undeclared top-level properties, validate version identifiers and input lists, and keep the record format serializable and explicit.

## Reasoning record contract

Each record captures a record ID and timestamp, framework ID/version, task type, inputs, assumptions, status, output when proposed, limitations, evidence references, required gates, and a validation status fixed to `NOT_PERFORMED`.

The schema intentionally excludes `VERIFIED` as a reasoning-record status. Every record must include the advisory limitation that reasoning output does not establish engineering correctness. Evidence references are references only; they are not independently validated by this module.

## Architectural boundary

This phase validates data and creates advisory records only. It does not execute capabilities, satisfy requirements, validate engineering outputs, authorize consequential actions, or replace the Engineering Core's existing validation, evidence, and approval gates.

## Versioning

Schemas carry explicit schema versions and stable IDs. Breaking contract changes require a new schema version and migration/compatibility tests rather than silent changes to the existing contract.
