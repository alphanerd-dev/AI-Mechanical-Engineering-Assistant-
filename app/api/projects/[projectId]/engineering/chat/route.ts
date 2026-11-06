import { createGoogle } from "@ai-sdk/google";
import { streamText } from "ai";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../../../src/auth/supabase-service";
import {
  parseEngineeringChatHistory,
  resolveEngineeringChatTimeout,
} from "../../../../../../src/chat/request";
import { validateShaftDesignWorkspaceState } from "../../../../../../src/workspace/shaft-design-state";
import { validateEngineeringWorkspaceSnapshot } from "../../../../../../src/workspace/validation";
import type { EngineeringWorkspaceSnapshot } from "../../../../../../src/workspace/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fastest current Gemini for interactive chat. Override with
// ENGINEERING_REASONING_MODEL_NAME when a larger model is required.
const DEFAULT_MODEL_NAME = "gemini-3.5-flash-lite";
// Flash-Lite first tokens are typically a few seconds; keep generous
// headroom under the 60s function maxDuration for cold starts.
const DEFAULT_FIRST_CHUNK_MS = 25_000;
const DEFAULT_CHUNK_MS = 15_000;
const SYSTEM_PROMPT = "You are the conversational assistant inside an engineering workspace.\n\nHelp engineers understand mechanical and related engineering concepts, frame problems, identify missing inputs, compare options, and solve ordinary analytic engineering calculations when supplied data is sufficient.¶»§q«^