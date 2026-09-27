/**
 * AI 코치 문장 생성 어댑터 — DeepSeek 모델 (사용자 결정 2026-09-28 — 설계 §2).
 *
 * ⚠️ 제공사를 바꿀 때 고칠 곳은 **이 파일 하나**다. 밖으로는
 *    `(system, user) → { text, model }` 모양만 내보낸다.
 *
 * 경로는 둘이다. 같은 DeepSeek 모델을 부르고 응답 모양(OpenAI 호환)도 같다.
 * - **OpenRouter** (`OPENROUTER_API_KEY`) — 사용자가 2026-09-28에 이 키로 정했다. 기본 경로
 * - DeepSeek 직접 (`DEEPSEEK_API_KEY`) — OpenRouter 키가 없을 때만
 *
 * DeepSeek 직접 (공식 문서 api-docs.deepseek.com, 2026-09-28 확인):
 * - `POST https://api.deepseek.com/chat/completions`, `Authorization: Bearer <key>`
 * - 모델: `deepseek-flash`(V4.1-Flash) · `deepseek-v4-pro`
 * - **생각 모드가 기본으로 켜져 있다.** 문장 다듬기에는 필요 없고 느려지므로 `thinking`으로 끈다
 *
 * OpenRouter (2026-09-28 실측 — 공개 모델 목록 + 실제 호출 1회, 200·1.2초·추론 토큰 0):
 * - `POST https://openrouter.ai/api/v1/chat/completions`
 * - 모델 슬러그 `deepseek/deepseek-v4.1-flash` — 위 `deepseek-flash`와 같은 모델
 * - 추론 끄기는 `reasoning: {enabled: false}` (DeepSeek의 `thinking`은 안 보낸다)
 * - `provider.data_collection: "deny"` — 입력을 보관·학습하는 제공사로는 보내지 않는다
 * - `provider.require_parameters: true` — JSON 모드를 못 하는 제공사로 새지 않게 한다
 * - ⚠️ 실제로 처리하는 제공사는 OpenRouter가 고른다(실측 때 StreamLake). 개인정보 고지 대상이다
 *
 * 공통:
 * - JSON 모드: `response_format: {type: "json_object"}` — 지시문에 "json"과 예시가 있어야 한다
 * - DeepSeek 문서 경고: JSON 모드가 **가끔 빈 content를 준다** → `empty_output`으로 실패 처리
 *
 * ⚠️ 이 모듈은 키를 인자로만 받는다. `process.env`를 읽는 것은 라우트다 —
 *    `NEXT_PUBLIC_` 접두사가 없어 클라이언트 번들에 들어가지 않는다.
 */

export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const DEFAULT_COACH_MODEL = "deepseek-flash";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_OPENROUTER_COACH_MODEL = "deepseek/deepseek-v4.1-flash";

export type ProviderErrorCode =
  | "not_configured"
  | "timeout"
  | "network_error"
  | "empty_output"
  | "truncated"
  | "content_filter"
  | `provider_http_${number}`
  | "bad_response";

/** 제공사 실패. `code`만 저장한다 — 원문(키가 섞일 수 있다)은 남기지 않는다 */
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode) {
    super(`ai_provider:${code}`);
    this.name = "ProviderError";
  }
}

export type GenerateText = (prompt: {
  system: string;
  user: string;
}) => Promise<{ text: string; model: string }>;

type GeneratorOptions = {
  apiKey: string | undefined;
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
};

/** OpenAI 호환 chat/completions 공통 호출. 제공사별 차이는 `extraBody`로만 준다 */
function createChatCompletionsGenerator(
  endpoint: string,
  defaultModel: string,
  extraBody: Record<string, unknown>,
  options: GeneratorOptions,
): GenerateText {
  const model = options.model || defaultModel;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  return async ({ system, user }) => {
    if (!options.apiKey) throw new ProviderError("not_configured");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          ...extraBody,
          max_tokens: options.maxTokens ?? 1500,
          temperature: 0.3,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) throw new ProviderError("timeout");
      void error;
      throw new ProviderError("network_error");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new ProviderError(`provider_http_${response.status}`);
    }

    let body: {
      model?: string;
      choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    };
    try {
      body = await response.json();
    } catch {
      throw new ProviderError("bad_response");
    }
    const choice = body.choices?.[0];
    if (choice?.finish_reason === "length") throw new ProviderError("truncated");
    if (choice?.finish_reason === "content_filter") {
      throw new ProviderError("content_filter");
    }
    const text = choice?.message?.content;
    if (!text || !text.trim()) throw new ProviderError("empty_output");
    return { text, model: body.model || model };
  };
}

export function createDeepSeekGenerator(options: GeneratorOptions): GenerateText {
  return createChatCompletionsGenerator(
    DEEPSEEK_ENDPOINT,
    DEFAULT_COACH_MODEL,
    { thinking: { type: "disabled" } },
    options,
  );
}

export function createOpenRouterGenerator(options: GeneratorOptions): GenerateText {
  return createChatCompletionsGenerator(
    OPENROUTER_ENDPOINT,
    DEFAULT_OPENROUTER_COACH_MODEL,
    {
      reasoning: { enabled: false },
      provider: { data_collection: "deny", require_parameters: true },
    },
    options,
  );
}

/**
 * 라우트가 쓰는 입구. OpenRouter 키가 있으면 OpenRouter, 없으면 DeepSeek 직접.
 * `model`은 고른 경로의 이름 체계를 따라야 한다(OpenRouter는 `deepseek/…` 슬러그).
 */
export function createCoachGenerator(options: {
  openRouterApiKey?: string;
  deepSeekApiKey?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): GenerateText {
  const common = {
    model: options.model,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
  };
  if (options.openRouterApiKey) {
    return createOpenRouterGenerator({ ...common, apiKey: options.openRouterApiKey });
  }
  return createDeepSeekGenerator({ ...common, apiKey: options.deepSeekApiKey });
}
