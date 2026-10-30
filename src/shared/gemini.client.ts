import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import * as z from 'zod';

// Some Gemini models reject array length limits (minItems/maxItems) with a bare
// "invalid argument", so they are dropped from the schema sent to the model;
// Zod still enforces them when the response is parsed.
const DROPPED_KEYWORDS = new Set(['$schema', 'minItems', 'maxItems']);

export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(z.toJSONSchema(schema), (key, value: unknown) => (DROPPED_KEYWORDS.has(key) ? undefined : value)),
  ) as Record<string, unknown>;
}

export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// The one place that talks to Gemini. Shared by every planner module.
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly ai: GoogleGenAI | null;
  // Tried in order. Each free-tier model has its own daily quota, so a busy or
  // rate-limited model falls through to the next one.
  private readonly models: string[];

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    const primary = config.get<string>('GEMINI_MODEL') || 'gemini-3.8-flash';
    const fallbacks = (config.get<string>('GEMINI_FALLBACK_MODELS') ?? 'gemini-3.7-flash,gemini-3.6-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    this.models = [...new Set([primary, ...fallbacks])];
  }

  // Returns the model's text; with a schema, the text is JSON constrained to it.
  async generate(prompt: string, schema: Record<string, unknown> | null = null): Promise<string> {
    if (!this.ai) {
      throw new HttpException('GEMINI_API_KEY is not set on the API server.', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    let lastStatus = 0;
    let hitDailyLimit = false;
    for (const model of this.models) {
      try {
        const interaction = await this.ai.interactions.create({
          model,
          input: prompt,
          ...(schema && { response_format: { type: 'text', mime_type: 'application/json', schema } }),
        });
        return interaction.output_text ?? '';
      } catch (err) {
        lastStatus = typeof err === 'object' && err && 'status' in err ? Number(err.status) : 0;
        this.logger.warn(`Gemini ${model} failed (${lastStatus || 'network'}): ${(err as Error).message}`);
        if (lastStatus === 429) hitDailyLimit = true;
        // Only quota and overload errors are worth retrying on another model.
        if (lastStatus !== 429 && lastStatus !== 503) break;
      }
    }
    // Report the daily limit whenever any model hit it, even if the last
    // fallback was merely busy: "try again shortly" would be misleading then.
    if (hitDailyLimit && (lastStatus === 429 || lastStatus === 503)) {
      throw new HttpException(
        "Today's free AI limit has been used up (it resets at midnight US Pacific time), and the backup model is busy. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new HttpException('The AI is unavailable right now. Try again shortly.', HttpStatus.BAD_GATEWAY);
  }
}
