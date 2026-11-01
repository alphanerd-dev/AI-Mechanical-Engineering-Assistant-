import { describe, expect, it } from "vitest";
import { normalizeMathDelimiters } from "@assistant-ui/react-streamdown";
import { preprocessEngineeringMath } from "../src/chat/engineering-markdown.js";

describe("engineering chat Markdown math normalization", () => {
  it("normalizes inline LaTeX delimiters for single-dollar rendering", () => {
    const source = String.raw`The shaft power is \\(P = T\\omega\\).`;
    expect(normalizeMathDelimiters(source)).toContain(String.raw`$P = T\\omega$`);
  });

  it("converts single-line bracket display math into a fenced Streamdown block", () => {
    const source = String.raw`\\[P_h = \\frac{\\Delta p Q}{600}\\]`;
    const normalized = preprocessEngineeringMath(source);
    expect(normalized).toContain(String.raw`$$` + "\n" + String.raw`P_h = \\frac{\\Delta p Q}{600}` + "\n" + String.raw`$$`);
  });

  it("keeps double-dollar text inside fenced code blocks literal", () => {
    const source = ["```text", "$$literal$$", "```", "", String.raw`\\[x^2\\]`].join("\n");
    const normalized = preprocessEngineeringMath(source);
    expect(normalized).toContain("```text\n$$literal$$\n```");
    expect(normalized).toContain(String.raw`$$` + "\n" + String.raw`x^2` + "\n" + String.raw`$$`);
  });

  it("keeps display math inside a numbered list and blockquote", () => {
    const source = String.raw`> 1. \\[P_h = \\frac{pQ}{600}\\]`;
    const normalized = preprocessEngineeringMath(source);
    expect(normalized).toContain("> 1. $$\n>    P_h = \\frac{pQ}{600}\n>    $$");
  });

  it("escapes a single-dollar currency amount without turning it into math", () => {
    expect(preprocessEngineeringMath("The replacement seal costs $5."))
      .toContain(String.raw`costs \\$5.`);
  });

  it("renders inline engineering notation while preserving nearby currency", () => {
    const source = String.raw`Power is \\(P = T\\omega\\); a seal costs $5.`;
    const normalized = preprocessEngineeringMath(source);
    expect(normalized).toContain(String.raw`$P = T\\omega$`);
    expect(normalized).toContain(String.raw`costs \\$5.`);
  });

  it("normalizes engineering notation with Greek symbols, subscripts and powers", () => {
    const source = String.raw`The maximum shear stress is \\(\\tau_{max} = \\frac{16T}{\\pi d^3}\\).`;
    expect(normalizeMathDelimiters(source))
      .toContain(String.raw`$\\tau_{max} = \\frac{16T}{\\pi d^3}$`);
  });

  it("preserves currency values with thousands separators and decimals", () => {
    expect(preprocessEngineeringMath("The replacement seal costs $1,250.00."))
      .toContain(String.raw`\\$1,250.00`);
  });
});
