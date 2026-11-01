import { describe, expect, it } from "vitest";
import { normalizeMathDelimiters } from "@assistant-ui/react-streamdown";
import { preprocessEngineeringMath } from "../src/chat/engineering-markdown.js";

describe("engineering chat Markdown math normalization", () => {
  it("normalizes inline LaTeX delimiters", () => {
    const input = String.raw`The shaft power is \(P = T\omega\).`;
    expect(normalizeMathDelimiters(input)).toContain(String.raw`$P = T\omega$`);
  });

  it("converts single-line bracket display math into a Streamdown block", () => {
    const input = String.raw`\[P_h = \frac{\Delta p Q}{600}\]`;
    const expected = String.raw`$$` + "\n" + String.raw`P_h = \frac{\Delta p Q}{600}` + "\n" + String.raw`$$`;
    expect(preprocessEngineeringMath(input)).toContain(expected);
  });

  it("leaves double-dollar text inside fenced code blocks literal", () => {
    const input = ["```text", "$$literal$$", "```", "", String.raw`\[x^2\]`].join("\n");
    const output = preprocessEngineeringMath(input);
    expect(output).toContain("```text\n$$literal$$\n```");
    expect(output).toContain("$$\nx^2\n$$");
  });

  it("preserves display math inside a numbered list and blockquote", () => {
    const input = String.raw`> 1. \[P_h = \frac{pQ}{600}\]`;
    const expected = "> 1. $$\n>    P_h = " + String.raw`\frac{pQ}{600}` + "\n>    $$";
    expect(preprocessEngineeringMath(input)).toContain(expected);
  });

  it("escapes currency without turning it into math", () => {
    expect(preprocessEngineeringMath("The replacement seal costs $5."))
      .toContain(String.raw`costs \$5.`);
  });

  it("renders inline engineering notation while preserving nearby currency", () => {
    const input = String.raw`Power is \(P = T\omega\); a seal costs $5.`;
    const output = preprocessEngineeringMath(input);
    expect(output).toContain(String.raw`$P = T\omega$`);
    expect(output).toContain(String.raw`costs \$5.`);
  });

  it("normalizes Greek symbols, subscripts, fractions and powers", () => {
    const input = String.raw`The maximum shear stress is \(\tau_{max} = \frac{16T}{\pi d^3}\).`;
    expect(normalizeMathDelimiters(input)).toContain(String.raw`$\tau_{max} = \frac{16T}{\pi d^3}$`);
  });

  it("preserves currency values with thousands separators and decimals", () => {
    expect(preprocessEngineeringMath("The replacement seal costs $1,250.00."))
      .toContain(String.raw`\$1,250.00`);
  });
});
