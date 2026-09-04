import OpenAI from "openai";
import { z } from "zod";

export const providerSchema = z.enum(["ollama", "gemini", "openrouter"]);
export type Provider = z.infer<typeof providerSchema>;

export const providerConfigSchema = z.object({
  provider: providerSchema,
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1).max(2000),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

const baseURLs: Record<Provider, string> = {
  ollama: "https://ollama.com/v1/",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  openrouter: "https://openrouter.ai/api/v1",
};

export function createAIClient(config: ProviderConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: baseURLs[config.provider],
    timeout: 45_000,
    maxRetries: 1,
    defaultHeaders: config.provider === "openrouter" ? { "X-OpenRouter-Title": "Ôn Tập AI" } : undefined,
  });
}

export const gradeResultSchema = z.object({
  questionId: z.string(),
  isCorrect: z.boolean(),
  score: z.number(),
  matchedIdeas: z.array(z.string()).default([]),
  missingIdeas: z.array(z.string()).default([]),
  feedback: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const batchGradeSchema = z.object({ grades: z.array(gradeResultSchema) });

export function extractJSON(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}
