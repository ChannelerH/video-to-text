// Lightweight fixer for common Latin-term noise in CN speech transcripts
// Only touches ASCII words; does not modify CJK content or timestamps

const hasCJK = /[\u4e00-\u9fff]/;

function zeroToOInWords(text: string): string {
  // Replace digit 0 with letter o inside words
  return text.replace(/(?<=\w)0(?=\w)/g, 'o');
}

function applyMappings(text: string): string {
  let t = text;
  // Normalize frequent proper nouns / terms observed in samples
  const replacements: Array<[RegExp, string]> = [
    [/\bY0?UTUBE\b/gi, 'YouTube'],
    [/\bHARR?Y\s*POT+ER\b/gi, 'Harry Potter'],
    [/\bHAVIRP0T\b/gi, 'Harry Potter'],
    [/\bST(E|A)PH?EN\s*FRY\b/gi, 'Stephen Fry'],
    [/\bSTEVENFRY\b/gi, 'Stephen Fry'],
    [/\bSHAD?OWI?NG\b/gi, 'shadowing'],
    [/\bSHAT0IN\b/gi, 'shadowing'],
    // input-/output-based learning variations
    [/\bI[MN]PUT[- ]?BA(S|ST)[TE]?[- ]?LEARN(ING)?\b/gi, 'input-based learning'],
    [/\b0?OUTP(U|V)T[- ]?BA(S|ST)[TE]?[- ]?LEARN(ING)?\b/gi, 'output-based learning'],
  ];
  for (const [re, to] of replacements) t = t.replace(re, to);
  return t;
}

export function fixLatinNoise(text: string): string {
  if (!text) return text;
  // Work line by line to avoid touching CJK-rich parts unnecessarily
  return text
    .split(/(\n+)/)
    .map(chunk => {
      if (hasCJK.test(chunk)) {
        // Still fix obvious 0->o within ASCII words
        const z = zeroToOInWords(chunk);
        return applyMappings(z);
      }
      const z = zeroToOInWords(chunk);
      return applyMappings(z);
    })
    .join('');
}

export function fixLatinNoiseInSegments(segments: { text: string }[] | undefined): number {
  if (!segments || segments.length === 0) return 0;
  let changed = 0;
  for (const s of segments) {
    const orig = s.text || '';
    const now = fixLatinNoise(orig);
    if (now !== orig) { s.text = now; changed++; }
  }
  return changed;
}

