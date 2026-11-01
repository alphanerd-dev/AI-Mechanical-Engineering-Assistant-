import { describe, expect, it } from "vitest";
import { normalizeMathDelimiters } from "@assistant-ui/react-streamdown";

describe("engineering chat Markdown math normalization", () => {
  it("normalizes inline LaTeX delimiters for streamed rendering", () => {
    const source = "The shaft power is \\(P = T\\omega\\).";
    expect(normalizeMathDelimiters(source)).toContain("$P = T\\omega$");
  });

  it("normalizes display LaTeX delimiters without changing the equation", () => {
    const source = "\\[P_h = \\frac{\\Delta p Q}{600}\\]";
    expect(normalizeMathDelimiters(source)).toContain("$$P_h = \\frac{\\Delta p Q}{600}$$");
  });

  it("does not turn an ordinary currency amount into a math expression", () => {
    const source = "The replacement seal costs $5.";
    expect(normalizeMathDelimiters(source)).toContain("costs $5.");
  });
});
