"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getEngineeringDecisionPresentation } from "../../../../src/intent/decision-presentation.js";
import { getEngineeringIntentRetryGuidance } from "../../../../src/intent/retry-guidance.js";
import { ENGINEERING_CORE_HANDOFF_EVENT, ENGINEERING_CHAT_RESULT_EVENT, parseEngineeringCoreHandoffDetail } from "../../../../src/chat/engineering-core-handoff.js";

type DecisionMetric = { key: string; value: number | string; unit?: string };
type Decision = {
  status: string;
  validationPassed: boolean;
  metrics: DecisionMetric[];
  evidenceIds: string[];
  nextAction?: string;
  nextQuestion?: string;
};

type AssistantResponse = {
  status: string;
  decision: Decision;
  decisionSummary: string;
  nextQuestion?: string;
  sessionRevision?: number;
};

type Message = { role: "engineer" | "assistant"; text: string; decision?: Decision; at?: string };

type RestoreState = "loading" | "ready" | "restore_failed";

const WELCOME: Message = {
  role: "assistant",
  text: "Describe the engineering task in your own words. I will reuse available session context, ask only for material missing inputs, and show the result, checks, evidence status, and next decision.",
};

function storageKey(projectId: string): string {
  return `engineering-intent-session:${projectId}`;
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.ran¶»§q«^