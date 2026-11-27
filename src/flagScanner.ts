import { FlagReference } from './types';

/**
 * Matches common Flagsmith SDK calls across JS/TS, React, Python, Go, Java, Flutter:
 * - flagsmith.hasFeature("flag_name") / hasFeature('flag_name')
 * - flagsmith.getValue("flag_name") / getValue('flag_name')
 * - flags.is_feature_enabled("flag_name") / get_feature_value("flag_name") (Python)
 * - flags.IsFeatureEnabled("flag_name") / GetFeatureValue("flag_name") (Go/Java)
 * - useFlags(['flag_a', 'flag_b']) (React SDK)
 */
const SINGLE_CALL_REGEX =
  /\b(hasFeature|getValue|is_feature_enabled|get_feature_value|IsFeatureEnabled|GetFeatureValue|hasFeatureFlag)\s*\(\s*(['"`])([a-zA-Z0-9_.-]+)\2/g;

const USE_FLAGS_REGEX = /\buseFlags\s*\(\s*\[([^\]]+)\]/g;
const STRING_LITERAL_REGEX = /(['"`])([a-zA-Z0-9_.-]+)\1/g;

export function scanTextForFlags(text: string, filePath: string): FlagReference[] {
  const references: FlagReference[] = [];
  const lines = text.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Skip full-line comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      continue;
    }

    // 1. Single-flag SDK calls
    SINGLE_CALL_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SINGLE_CALL_REGEX.exec(line)) !== null) {
      const callPattern = match[1];
      const flagName = match[3];
      const quoteChar = match[2];
      const fullMatchStart = match.index;
      const quotedToken = `${quoteChar}${flagName}${quoteChar}`;
      const tokenOffset = match[0].lastIndexOf(quotedToken);
      const startCol = fullMatchStart + tokenOffset + 1;
      const endCol = startCol + flagName.length;

      references.push({
        flagName,
        filePath,
        line: lineIdx,
        startCol,
        endCol,
        callPattern,
      });
    }

    // 2. React useFlags(['flag_a', 'flag_b'])
    USE_FLAGS_REGEX.lastIndex = 0;
    while ((match = USE_FLAGS_REGEX.exec(line)) !== null) {
      const arrayContent = match[1];
      const arrayStart = match.index + match[0].indexOf('[') + 1;
      STRING_LITERAL_REGEX.lastIndex = 0;
      let strMatch: RegExpExecArray | null;
      while ((strMatch = STRING_LITERAL_REGEX.exec(arrayContent)) !== null) {
        const flagName = strMatch[2];
        const startCol = arrayStart + strMatch.index + 1;
        const endCol = startCol + flagName.length;
        references.push({
          flagName,
          filePath,
          line: lineIdx,
          startCol,
          endCol,
          callPattern: 'useFlags',
        });
      }
    }
  }

  return references;
}

/**
 * Standard Levenshtein edit distance for "Did you mean ...?" ghost flag quick fixes.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function findClosestFlagName(target: string, knownFlags: string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  const normalizedTarget = target.toLowerCase();

  for (const candidate of knownFlags) {
    const dist = levenshtein(normalizedTarget, candidate.toLowerCase());
    const maxAllowed = Math.max(2, Math.floor(candidate.length * 0.4));
    if (dist <= maxAllowed && dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best;
}
