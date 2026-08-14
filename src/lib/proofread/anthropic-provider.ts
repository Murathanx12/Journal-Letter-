import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { serverEnv } from "@/lib/env";

import { filterCorrections, type RawCorrection } from "./filter";
import { systemPrompt, userPrompt } from "./prompts";
import {
  ProofreadUnavailableError,
  type ProofreadProvider,
  type ProofreadRequest,
  type ProofreadResult,
} from "./types";

/**
 * Anthropic-backed proofreading.
 *
 * The API key is read here and never leaves the server. Entry text is sent only
 * when a person has pressed the button — there is no background pass over
 * anybody's journal.
 */

function extractJson(text: string): { corrections?: RawCorrection[] } | null {
  // Models occasionally wrap JSON in prose or a code fence despite instructions.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as { corrections?: RawCorrection[] };
  } catch {
    return null;
  }
}

export class AnthropicProofreadProvider implements ProofreadProvider {
  readonly name = "anthropic";

  async proofread({ paragraphs, mode }: ProofreadRequest): Promise<ProofreadResult> {
    const apiKey = serverEnv.anthropicApiKey;
    if (!apiKey) throw new ProofreadUnavailableError();

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: serverEnv.proofreadModel,
      max_tokens: 4096,
      // Near-deterministic: this is correction, not composition.
      temperature: 0,
      system: systemPrompt(mode),
      messages: [{ role: "user", content: userPrompt(paragraphs) }],
    });

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    const parsed = extractJson(text);
    if (!parsed?.corrections || !Array.isArray(parsed.corrections)) {
      return { mode, corrections: [], unchanged: true };
    }

    // Everything the model proposed is filtered before a human sees it.
    const corrections = filterCorrections(paragraphs, parsed.corrections, mode);

    return { mode, corrections, unchanged: corrections.length === 0 };
  }
}

/**
 * Resolve the configured provider.
 *
 * Returns null rather than throwing when nothing is configured, so the UI can
 * honestly say the feature is unavailable instead of pretending it works.
 */
export function getProofreadProvider(): ProofreadProvider | null {
  if (!serverEnv.anthropicApiKey) return null;
  return new AnthropicProofreadProvider();
}
