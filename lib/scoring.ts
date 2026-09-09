export type Severity = "LOW" | "MEDIUM" | "HIGH";

const rules: Array<{ label: string; weight: number; pattern: RegExp }> = [
  { label: "decryption", weight: 4, pattern: /\bdecrypt(?:ion|ed|ing)?\b/i },
  { label: "release key", weight: 5, pattern: /\brelease\s+(?:the\s+)?key\b/i },
  { label: "key", weight: 2, pattern: /\bkey\b/i },
  { label: "passphrase", weight: 4, pattern: /\bpassphrase\b/i },
  { label: "password", weight: 3, pattern: /\bpassword\b/i },
  { label: "kunci", weight: 2, pattern: /\bkunci\b/i },
  { label: "dibuka/unlocked", weight: 3, pattern: /\b(?:unlock(?:ed)?|dibuka)\b/i },
  { label: "encrypted", weight: 2, pattern: /\bencrypt(?:ed|ion)?\b/i },
  { label: "archive", weight: 1, pattern: /\b(?:archive|arsip)\b/i },
  { label: "magnet", weight: 2, pattern: /\bmagnet\b/i },
  { label: "sha-256/hash", weight: 2, pattern: /\b(?:sha-?256|hash)\b/i },
  { label: "release", weight: 2, pattern: /\brelease(?:d)?\b/i },
  { label: "urgent", weight: 1, pattern: /\b(?:urgent|penting|important)\b/i },
  { label: "file name", weight: 6, pattern: /d6993[0-9a-f]{8,}\.tar\.zst\.age/i }
];

export function scorePost(text: string) {
  const extra = (process.env.EXTRA_KEYWORDS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  let score = 0;
  const matches: string[] = [];

  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      score += rule.weight;
      matches.push(rule.label);
    }
  }

  for (const word of extra) {
    if (word && text.toLowerCase().includes(word.toLowerCase())) {
      score += 2;
      matches.push(`custom:${word}`);
    }
  }

  // Context bonus: combinations are more meaningful than isolated words.
  const t = text.toLowerCase();
  if ((t.includes("key") || t.includes("kunci")) &&
      (t.includes("release") || t.includes("rilis") || t.includes("publish") || t.includes("terbit"))) {
    score += 5;
    matches.push("key + release context");
  }
  if ((t.includes("decrypt") || t.includes("decryption") || t.includes("passphrase")) &&
      (t.includes("archive") || t.includes("arsip") || t.includes(".age"))) {
    score += 4;
    matches.push("decryption + archive context");
  }

  const severity: Severity = score >= 9 ? "HIGH" : score >= 4 ? "MEDIUM" : "LOW";
  return { score, severity, matches: [...new Set(matches)] };
}