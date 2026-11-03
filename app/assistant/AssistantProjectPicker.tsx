"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  FolderKanban,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Project = {
  id: string;
  name: string;
  stage: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETE";
  revision: number;
  created_at: string;
  updated_at: string;
};

type ProjectsResponse = {
  projects?: Project[];
  error?: string;
  code?: string;
};

function projectStatusLabel(status: Project["status"]): string {
  if (status === "BLOCKED") return "Blocked";
  if (status === "COMPLETE") return "Complete";
  return "Active";
}

function projectStatusVariant(status: Project["status"]): "info" | "warning" | "success" {
  if (status === "BLOCKED") return "warning";
  if (status === "COMPLETE") return "success";
  return "info";
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Update time unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AssistantProjectPicker() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const loadProjects = useCallback(async (refresh = false, signal?: AbortSignal) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setErrorCode("");

    try {
      const response = await fetch("/api/projects", {
        cache: "no-store",
        headers: { accept: "application/json" },
        sign...[truncated]