import Groq from "groq-sdk";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
} from "groq-sdk";
import { env } from "../config/env";
import { ApiError } from "../utils/api-error";
import { logger } from "../utils/logger";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateTextInput {
  systemInstruction: string;
  contents: ChatTurn[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface GenerateTextResult {
  text: string;
  model: string;
}

export interface GroqStatus {
  provider: "groq";
  configured: boolean;
  providerReachable: boolean | null;
  model: string;
  checkedAt: string;
  note?: string;
  errorCode?: string;
}

const MAX_RESPONSE_CHARS = 15_000;
const DEFAULT_MODEL = "openai/gpt-oss-120b";

function extractStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const value = Number((error as { status?: unknown }).status);
    return Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown error";
}

function extractProviderCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string" && direct.trim()) return direct;
  const nested = (error as { error?: { code?: unknown } }).error;
  if (nested && typeof nested.code === "string" && nested.code.trim()) return nested.code;
  return undefined;
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof APIConnectionTimeoutError || error instanceof APIUserAbortError) return true;
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "AbortError" || name === "APIConnectionTimeoutError" || name === "APIUserAbortError") return true;
  const message = extractMessage(error).toLowerCase();
  return message.includes("timed out") || message.includes("timeout") || message.includes("aborted");
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof APIConnectionError) return true;
  if (typeof error === "object" && error !== null) {
    const name = (error as { name?: string }).name ?? "";
    if (name === "APIConnectionError") return true;
  }
  const message = extractMessage(error).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("enotfound") ||
    message.includes("econn") ||
    message.includes("socket hang up")
  );
}

/**
 * Maps Groq SDK/API failures to safe, client-facing ApiErrors. Provider
 * response bodies, request ids and credentials are never forwarded verbatim.
 */
function mapUpstreamError(error: unknown): ApiError {
  const status = extractStatus(error);
  const providerCode = extractProviderCode(error)?.toLowerCase();
  const message = extractMessage(error).toLowerCase();

  if (isTimeoutError(error)) {
    return new ApiError(
      503,
      "AI_TIMEOUT",
      "The AI assistant took too long to respond. Please try again.",
    );
  }
  if (status === 429 || providerCode === "rate_limit_exceeded" || message.includes("rate limit") || message.includes("quota")) {
    return new ApiError(
      503,
      "AI_QUOTA_EXCEEDED",
      "The AI assistant is temporarily over its usage quota or rate limit. Please try again later.",
    );
  }
  if (
    status === 401 ||
    status === 403 ||
    providerCode === "invalid_api_key" ||
    message.includes("api key") ||
    message.includes("permission")
  ) {
    return new ApiError(
      503,
      "AI_CONFIGURATION_ERROR",
      "The AI assistant is not configured correctly or the API key is invalid.",
    );
  }
  if (
    status === 404 ||
    providerCode === "model_not_found" ||
    providerCode === "model_decommissioned" ||
    (message.includes("model") &&
      (message.includes("not found") ||
        message.includes("does not exist") ||
        message.includes("decommissioned") ||
        message.includes("unsupported")))
  ) {
    return new ApiError(
      503,
      "AI_MODEL_UNAVAILABLE",
      "The configured Groq model is unavailable. Check GROQ_MODEL in the backend environment.",
    );
  }
  if (status === 400 || status === 422) {
    return new ApiError(
      502,
      "AI_REQUEST_REJECTED",
      "The AI provider rejected the request. Try rephrasing your question.",
    );
  }
  if (isNetworkError(error)) {
    return new ApiError(
      503,
      "AI_NETWORK_ERROR",
      "The AI provider could not be reached. Check network connectivity and try again.",
    );
  }
  if (status !== undefined && status >= 500) {
    return new ApiError(
      503,
      "AI_PROVIDER_UNAVAILABLE",
      "The AI provider is temporarily unavailable. You can continue using the rest of the system.",
    );
  }
  return new ApiError(
    502,
    "AI_UPSTREAM_ERROR",
    "The AI assistant is temporarily unavailable. You can continue using the rest of the system.",
  );
}

/**
 * Server-only Groq wrapper. The SDK is initialised with a backend secret and
 * no tools are registered, so the model can never run SQL, call HTTP or modify
 * records. Responses are length-validated before being returned.
 *
 * The SDK targets the official Groq API (`https://api.groq.com/openai/v1`).
 */
class GroqService {
  private client: Groq | null;
  private testGenerator: ((input: GenerateTextInput) => Promise<GenerateTextResult>) | null = null;
  model = DEFAULT_MODEL;
  private resolvedModel: string | null = null;
  private lastProbe: { at: number; status: GroqStatus } | null = null;
  private probeTtlMs = 60_000;

  constructor() {
    this.model = (env.GROQ_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    this.resolvedModel = this.model;
    this.client = env.GROQ_API_KEY
      ? new Groq({
          apiKey: env.GROQ_API_KEY,
          timeout: env.GROQ_TIMEOUT_MS,
          maxRetries: 0,
        })
      : null;
  }

  isConfigured(): boolean {
    return this.client !== null || this.testGenerator !== null;
  }

  /** Test hook: allows deterministic/mocked generation in automated tests. */
  __setTestGenerator(generator: ((input: GenerateTextInput) => Promise<GenerateTextResult>) | null): void {
    this.testGenerator = generator;
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    if (this.testGenerator) {
      try {
        const result = await this.testGenerator(input);
        const text = (result.text ?? "").trim();
        if (!text) {
          throw new ApiError(
            502,
            "AI_EMPTY_RESPONSE",
            "The AI assistant returned an empty response. Please try again.",
          );
        }
        const model = result.model || this.resolvedModel || this.model;
        this.resolvedModel = model;
        this.model = model;
        return { text: text.slice(0, MAX_RESPONSE_CHARS), model };
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (isTimeoutError(error)) {
          throw new ApiError(
            503,
            "AI_TIMEOUT",
            "The AI assistant took too long to respond. Please try again.",
          );
        }
        throw mapUpstreamError(error);
      }
    }

    if (!this.client) {
      throw new ApiError(
        503,
        "AI_NOT_CONFIGURED",
        "The AI assistant is not configured on this server. Add GROQ_API_KEY to the backend environment.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.GROQ_TIMEOUT_MS + 1000);
    try {
      const completion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            { role: "system", content: input.systemInstruction },
            ...input.contents.map((turn) => ({ role: turn.role, content: turn.content })),
          ],
          temperature: input.temperature ?? 0.35,
          top_p: 0.9,
          max_tokens: input.maxOutputTokens ?? 1200,
          stream: false,
        },
        { signal: controller.signal },
      );

      const text = (completion.choices[0]?.message?.content ?? "").trim();
      if (!text) {
        throw new ApiError(
          502,
          "AI_EMPTY_RESPONSE",
          "The AI assistant returned an empty response. Please try again.",
        );
      }

      const model = completion.model || this.model;
      if (model !== this.model) {
        logger.info("Groq resolved model", { requested: this.model, resolved: model });
      }
      this.resolvedModel = model;
      this.model = model;
      return { text: text.slice(0, MAX_RESPONSE_CHARS), model };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError(
          503,
          "AI_TIMEOUT",
          "The AI assistant took too long to respond. Please try again.",
        );
      }
      if (!isTimeoutError(error)) {
        logger.warn("Groq request failed", {
          model: this.model,
          message: extractMessage(error),
          status: extractStatus(error),
          code: extractProviderCode(error),
        });
      }
      throw mapUpstreamError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async probe(force = false): Promise<GroqStatus> {
    const now = Date.now();
    if (!force && this.lastProbe && now - this.lastProbe.at < this.probeTtlMs) {
      return this.lastProbe.status;
    }

    const checkedAt = new Date().toISOString();
    let status: GroqStatus;

    if (!this.isConfigured()) {
      status = {
        provider: "groq",
        configured: false,
        providerReachable: false,
        model: this.model,
        checkedAt,
        note: "Groq is not configured. Set GROQ_API_KEY on the backend.",
        errorCode: "AI_NOT_CONFIGURED",
      };
      this.lastProbe = { at: now, status };
      return status;
    }

    try {
      const result = await this.generateText({
        systemInstruction: "Reply with the single word OK.",
        contents: [{ role: "user", content: "Health check" }],
        // Reasoning-capable models spend part of the completion budget on
        // internal reasoning, so keep enough headroom for the visible reply
        // while staying within provider tokens-per-minute limits.
        maxOutputTokens: 128,
        temperature: 0,
      });
      status = {
        provider: "groq",
        configured: true,
        providerReachable: true,
        model: result.model,
        checkedAt,
        note: "Groq responded successfully.",
      };
    } catch (error) {
      const apiError = error instanceof ApiError ? error : mapUpstreamError(error);
      status = {
        provider: "groq",
        configured: true,
        providerReachable: false,
        model: this.resolvedModel || this.model,
        checkedAt,
        note: apiError.message,
        errorCode: apiError.code,
      };
    }

    this.lastProbe = { at: now, status };
    return status;
  }
}

export const groqService = new GroqService();
