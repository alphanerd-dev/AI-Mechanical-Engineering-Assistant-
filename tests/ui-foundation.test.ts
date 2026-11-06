import { describe, expect, it } from "vitest";
import { buttonVariants } from "../components/ui/button";
import { badgeVariants } from "../components/ui/badge";
import { StatusBadge } from "../components/ui/status-badge";
import { cn } from "../lib/utils";

describe("Engineering OS UI foundation", () => {
  it("resolves conflicting Tailwind utilities predictably", () => {
    expect(cn("px-2 text-sm", "px-4 text-base")).toBe("px-4 text-base");
  });

  it("keeps primary actions on the Forge teal variant", () => {
    const classes = buttonVariants({ variant: "default", size: "default" });
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("text-primary-foreground");
    expect(classes).toContain("focus-visible:ring-ring");
  });

  it("provides distinct semantic status treatments", () => {
    expect(badgeVariants({ variant: "success" })).toContain("text-success");
    expect(badgeVariants({ variant: "warning" })).toContain("text-warning");
    expect(badgeVariants({ variant: "danger" })).toContain("text-destructive");
  });

  it("does not conflate execution, validation, and human approval", () => {
    const executed = StatusBadge({ status: "executed" });
    const validated = StatusBadge({ status: "validated" });
    const approved = StatusBadge({ status: "approved" });

    expect(executed.props["data-status"]).toBe("executed");
    expect(executed.props.variant).toBe("secondary");
    expect(validated.props["data-status"]).toBe("validated");
    expect(validated.props.variant).toBe("info");
    expect(approved.props["data-status"]).toBe("approved");
    expect(approved.props.variant).toBe("success");
  });
});
