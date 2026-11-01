import { describe, expect, it } from "vitest";
import { normalizeMathDelimiters } from "@assistant-ui/react-streamdown";

describe("engineering chat Markdown math normalization", () => {
  it("normalizes inline LaTeX delimiters for streamed rendering", () => {
    const source = String.raw`The shaft power is \(P = T\omega\).`;
    expect(normalizeMathDelimiters(source)).toContain(String.raw`$P = T\omega$`);
  });

  it("normalizes display LaTeX delimiters without changing the equation", () => {
    const source = String.raw`\[P_h = \frac{\Delta p Q}{600}\]`;
    expect(normalizeMathDelimiters(source)).toContain(String.raw`$$P_h = \frac{\Delta p Q}{600}$$`);
  });

  it("does not turn an ordinary currency amount into a math expression", () => {
    const source = "The replacement seal costs $5.";
    expect(normalizeMathDelimiters(source)).toContain("costs $5.");
  });

  it("normalizes engineering notation with Greek symbols, subscripts and powers", () => {
    const source = String.raw`The maximum shear stress is \(\tau_{max} = \frac{16T}{\pi d^3}\).`;
    const normalized = normalizeMathDelimiters(source);
    expect(normalized).toContain(String.raw`$\tau_{max} = \frac{16T}{\pi d^3}$`);
  });

  it("preserves currency values with thousands separators and decimals", () => {
    const source = "The replacement seal costs $1,250.00.";
    expect(normalizeMathDelimiters(source)).toContain("$1,250.00");
  });
});
