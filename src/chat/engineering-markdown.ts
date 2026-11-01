import {
  escapeCurrencyDollars,
  normalizeMathDelimiters,
} from "@assistant-ui/react-streamdown";

/**
 * Streamdown treats same-line `$$...$$` pairs as inline math. The upstream
 * normalizer emits that shape for single-line `\\[...\\]` expressions, so
 * promote standalone display expressions to fenced blocks. Do not rewrite code.
 */
export function fenceStandaloneDisplayMathBlocks(text: string): string {
  const output: string[] = [];
  let openFence: { marker: string; length: number } | undefined;

  for (const line of text.split("\n")) {
    if (openFence) {
      output.push(line);
      const closing = /^ {0,3}(`+|~+)[ \t]*\r?$/.exec(line);
      if (
        closing &&
        closing[1]![0] === openFence.marker &&
        closing[1]!.length >= openFence.length
      ) {
        openFence = undefined;
      }
      continue;
    }

    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      openFence = { marker: opening[1]![0]!, length: opening[1]!.length };
      output.push(line);
      continue;
    }

    // Repeat blockquote markers; turn list-marker width into continuation indent.
    const display = /^([ \t]{0,3}(?:>[ \t]?)*)((?:(?:[-+*]|\d+[.)])[ \t]+)?)\$\$([^\r\n]+?)\$\$([ \t]*\r?)$/.exec(line);
    if (!display) {
      output.push(line);
      continue;
    }

    const prefix = display[1]!;
    const listMarker = display[2]!;
    const body = display[3]!.trim();
    const lineEnding = display[4]!;
    const continuation = prefix + " ".repeat(listMarker.length);
    output.push(prefix + listMarker + "$$" + lineEnding);
    output.push(continuation + body + lineEnding);
    output.push(continuation + "$$" + lineEnding);
  }

  return output.join("\n");
}

export function preprocessEngineeringMath(text: string): string {
  const normalized = normalizeMathDelimiters(text);
  return escapeCurrencyDollars(fenceStandaloneDisplayMathBlocks(normalized));
}
