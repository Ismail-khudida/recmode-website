import Anthropic from "@anthropic-ai/sdk";
import type { DocumentAnalysis, RiskLevel } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

// Erlaubte Upload-Typen und die zugehörigen Claude-Content-Blöcke.
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

const SYSTEM_PROMPT = `Du bist FristPilot, ein Assistent, der deutschsprachigen Nutzern hilft, wichtige Fristen und Handlungspflichten aus Dokumenten zu erkennen (Briefe, Behördenpost, Rechnungen, Verträge, Versicherungen).

Analysiere das Dokument und gib AUSSCHLIESSLICH ein JSON-Objekt zurück – kein einleitender Text, keine Erklärungen, keine Markdown-Codeblöcke.

Das JSON-Objekt hat exakt diese Struktur:
{
  "document_type": "Versicherung | Behörde | Vertrag | Rechnung | Sonstiges",
  "sender": "Name des Absenders (oder 'Unbekannt')",
  "summary_simple": "Einfache, beruhigende Erklärung des Dokuments in 2-4 Sätzen, in klarer Alltagssprache, ohne Fachbegriffe",
  "deadlines": [
    {
      "date": "YYYY-MM-DD oder null, falls kein konkretes Datum erkennbar",
      "description": "Was passiert an diesem Datum?",
      "required_action": "Was muss der Nutzer konkret tun?"
    }
  ],
  "recommended_actions": ["Konkreter nächster Schritt", "..."],
  "risk_level": "low | medium | high",
  "confidence": 0.0,
  "extracted_text": "Die wichtigsten Textpassagen des Dokuments als Klartext"
}

Regeln:
- Antworte auf Deutsch.
- Erfinde keine Fristen. Wenn keine Frist erkennbar ist, gib ein leeres Array zurück.
- "confidence" ist eine Zahl zwischen 0.0 und 1.0 und beschreibt, wie sicher du dir bei der Analyse bist.
- "risk_level": high = wichtige Frist mit möglichen rechtlichen/finanziellen Folgen, medium = relevant aber unkritisch, low = informativ.
- Sei vorsichtig: Im Zweifel weise auf Unsicherheit hin, statt zu raten.`;

interface AnalyzeInput {
  /** Rohdaten der Datei. */
  data: Buffer;
  mimeType: string;
}

function clampRisk(value: unknown): RiskLevel {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// Extrahiert das erste JSON-Objekt aus dem Modelltext – robust gegen
// versehentliche Codeblöcke oder Vor-/Nachtext.
function parseAnalysis(raw: string): DocumentAnalysis {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;

  const deadlines = Array.isArray(parsed.deadlines)
    ? parsed.deadlines.map((d) => {
        const item = (d ?? {}) as Record<string, unknown>;
        return {
          date:
            typeof item.date === "string" && item.date.trim() !== ""
              ? item.date
              : null,
          description: String(item.description ?? ""),
          required_action: String(item.required_action ?? ""),
        };
      })
    : [];

  const recommended = Array.isArray(parsed.recommended_actions)
    ? parsed.recommended_actions.map((a) => String(a)).filter(Boolean)
    : [];

  return {
    document_type: String(parsed.document_type ?? "Sonstiges"),
    sender: String(parsed.sender ?? "Unbekannt"),
    summary_simple: String(parsed.summary_simple ?? ""),
    deadlines,
    recommended_actions: recommended,
    risk_level: clampRisk(parsed.risk_level),
    confidence: clampConfidence(parsed.confidence),
    extracted_text:
      typeof parsed.extracted_text === "string"
        ? parsed.extracted_text
        : undefined,
  };
}

// Schickt das Dokument direkt an Claude. PDFs werden als Dokument-Block,
// Bilder als Bild-Block übergeben – Claude übernimmt Texterkennung (OCR)
// und Analyse in einem Schritt.
export async function analyzeDocument({
  data,
  mimeType,
}: AnalyzeInput): Promise<DocumentAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");
  }

  const client = new Anthropic({ apiKey });
  const base64 = data.toString("base64");

  const documentBlock =
    mimeType === "application/pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: base64,
          },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: mimeType as "image/jpeg" | "image/png",
            data: base64,
          },
        };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          {
            type: "text",
            text: "Analysiere dieses Dokument und gib nur das beschriebene JSON-Objekt zurück.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Die KI-Analyse lieferte keine verwertbare Antwort.");
  }

  return parseAnalysis(textBlock.text);
}
