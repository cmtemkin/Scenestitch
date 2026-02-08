import { openai } from "./openai";
import type {
  GenerateHookVariantsRequest,
  GenerateComedyTimingRequest,
} from "@shared/schema";

export async function generateHookVariants(input: GenerateHookVariantsRequest): Promise<string[]> {
  const fallback = fallbackHookVariants(input.script, input.count);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      temperature: 0.9,
      max_completion_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You write high-retention opening hooks for faceless explainers and short comedy clips. Return only a JSON array of strings.",
        },
        {
          role: "user",
          content: `Create ${input.count} opening hooks for this ${input.style} script. Keep each under 18 words.\n\n${input.script}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "";
    const parsed = parseJsonArray(raw);
    if (!parsed.length) {
      return fallback;
    }
    return parsed.slice(0, input.count);
  } catch (error) {
    console.warn("[content-intelligence] Hook generation fallback used:", error);
    return fallback;
  }
}

export function generateComedyTiming(input: GenerateComedyTimingRequest) {
  return input.scenes.map((scene) => {
    const wordCount = scene.text.split(/\s+/).filter(Boolean).length;
    const suggestedDuration = scene.estimatedDurationSec ?? Math.max(3, Math.round(wordCount / 2.8));
    const punchlinePauseMs = Math.max(250, Math.min(900, Math.round(wordCount * 8)));
    const emphasisWords = extractEmphasisWords(scene.text);

    return {
      sceneNumber: scene.sceneNumber,
      wordCount,
      suggestedDurationSec: suggestedDuration,
      punchlinePauseMs,
      emphasisWords,
      pacing: suggestedDuration < 5 ? "fast" : suggestedDuration > 11 ? "slow" : "balanced",
    };
  });
}

function parseJsonArray(raw: string): string[] {
  try {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    const candidate = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(candidate);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function fallbackHookVariants(script: string, count: number): string[] {
  const firstSentence =
    script.split(/[.!?]/).map((segment) => segment.trim()).filter(Boolean)[0] ||
    "This changes how creators build videos";

  const templates = [
    `Stop scrolling: ${firstSentence}`,
    `This one trick makes ${firstSentence.toLowerCase()}`,
    `Most creators miss this: ${firstSentence}`,
    `In 30 seconds: ${firstSentence}`,
    `Why this works: ${firstSentence}`,
  ];
  return templates.slice(0, count);
}

function extractEmphasisWords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "that",
    "this",
    "is",
    "are",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word))
    .slice(0, 6);
}
