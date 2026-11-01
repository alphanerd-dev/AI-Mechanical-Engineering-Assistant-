import { describe, expect, it } from "vitest";
import {
  escapeCurrencyDollars,
  normalizeMathDelimiters,
} from "@assistant-ui/react-streamdown";

function preprocessEngineeringMath(text: string): string {
  return escapeCurrencyDollars(normalizeMathDelimiters(text));
}

describe("engineering chat Markdown math normalization", () => {
  it("normalizes inline LaTeX delimiters for single-dollar rendering", () => {
    const source = String.raw`The shaft power is \(P = T\omega\).`;
    expect(normalizeMathDelimiters(source)).toContain(String.raw`$P = T\omega$`);
  });

  it("normalizes display LaTeX delimiters without changing the equation", () => {
    const source = String.raw`\[P_h = \frac{\Delta p Q}{600}\]`;
    expect(normalizeMathDelimiters(source)).toContain(String.raw`$$P_h = \frac{\Delta p Q}{600}$$`);
  });

  it("preserves display-math delimiters through currency escaping", () => {
    const source = String.raw`\[P_h = \frac{\Delta p \cdot Q}{600}\]`;
    const normalized = preprocessEngineeringMath(source);
    expect(normalized).toContain(String.raw`$$P_h = \frac{\Delta p \cdot Q}{600}$$`);
  });

  it("keeps a single-dollar currency amount out of inline math", () => {
    expect(preprocessEngineeringMath("The replacement seal costs $5."))
      .toContain(String.raw`costs \$5.`);
  });

  it("renders inline engineering notation while preserving nearby currency", () => {
    const source = String.raw`Power is \(P = T\omega\); a seal costs $5.`;
    const normalized = preprocessEngineeringMath(source);
    expect(normalized).toContain(String.raw`$P = T\omega$`);
    expect(normalized).toContain(String.raw`costs \$5.`);
  });

  it("normalizes engineering notation with Greek symbols, subscripts and powers", () => {
    const source = String.raw`The maximum shear stress is \(\tau_{max} = \frac{16T}{\pi d^3}\).`;
    expect(normalizeMathDelimiters(source))
      .toContain(String.raw`$\tau_{max} = \frac{16T}{\pi d^3}$`);
  });

  it("preserves currency values with thousands separators and decimals", () => {
    expect(preprocessEngineeringMath("The replacement seal costs $1,250.00."))
      .toContain(String.raw`\$1,250.00`);
  });
});
