import { describe, expect, it, vi } from "vitest";
import {
  createCoachGenerator,
  createDeepSeekGenerator,
  createOpenRouterGenerator,
  ProviderError,
} from "./deepseek";

function okResponse(content: string | null, finish = "stop") {
  return new Response(
    JSON.stringify({
      model: "deepseek-flash",
      choices: [{ message: { content }, finish_reason: finish }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("createDeepSeekGenerator", () => {
  it("JSON 모드·생각 끔·키를 실어 보낸다", async () => {
    const fetchImpl = vi.fn(async () => okResponse('{"summary":"x"}'));
    const generate = createDeepSeekGenerator({
      apiKey: "sk-test",
      model: "deepseek-flash",
      fetchImpl,
    });
    const result = await generate({ system: "sys json", user: "data" });
    expect(result).toEqual({ text: '{"summary":"x"}', model: "deepseek-flash" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: "system", content: "sys json" },
      { role: "user", content: "data" },
    ]);
  });

  it("키가 없으면 호출하지 않고 not_configured", async () => {
    const fetchImpl = vi.fn();
    const generate = createDeepSeekGenerator({ apiKey: "", fetchImpl });
    await expect(generate({ system: "s", user: "u" })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("HTTP 오류는 provider_error로, 키 같은 원문은 싣지 않는다", async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"error":"Authentication Fails, key sk-test"}', { status: 401 }),
    );
    const generate = createDeepSeekGenerator({ apiKey: "sk-test", fetchImpl });
    const error = await generate({ system: "s", user: "u" }).catch((e) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.code).toBe("provider_http_401");
    expect(String(error.message)).not.toContain("sk-test");
  });

  it("빈 응답(공식 문서가 경고한 경우)은 empty_output", async () => {
    const generate = createDeepSeekGenerator({
      apiKey: "k",
      fetchImpl: vi.fn(async () => okResponse("")),
    });
    await expect(generate({ system: "s", user: "u" })).rejects.toMatchObject({
      code: "empty_output",
    });
  });

  it("길이 제한으로 잘린 응답은 truncated", async () => {
    const generate = createDeepSeekGenerator({
      apiKey: "k",
      fetchImpl: vi.fn(async () => okResponse('{"summary":', "length")),
    });
    await expect(generate({ system: "s", user: "u" })).rejects.toMatchObject({
      code: "truncated",
    });
  });

  it("시간을 넘기면 timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const generate = createDeepSeekGenerator({
      apiKey: "k",
      fetchImpl,
      timeoutMs: 10,
    });
    await expect(generate({ system: "s", user: "u" })).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("네트워크 오류는 network_error", async () => {
    const generate = createDeepSeekGenerator({
      apiKey: "k",
      fetchImpl: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    await expect(generate({ system: "s", user: "u" })).rejects.toMatchObject({
      code: "network_error",
    });
  });
});

describe("createOpenRouterGenerator", () => {
  it("OpenRouter 주소·모델 슬러그·추론 끔·수집 거부 제공사만 쓴다", async () => {
    const fetchImpl = vi.fn(async () => okResponse('{"summary":"x"}'));
    const generate = createOpenRouterGenerator({ apiKey: "sk-or-test", fetchImpl });
    await generate({ system: "sys json", user: "data" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("deepseek/deepseek-v4.1-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning).toEqual({ enabled: false });
    // DeepSeek 전용 파라미터는 OpenRouter에 보내지 않는다
    expect(body.thinking).toBeUndefined();
    // 입력을 학습·보관하는 제공사로는 보내지 않는다. JSON 모드를 못 하는 제공사도 거른다
    expect(body.provider).toEqual({ data_collection: "deny", require_parameters: true });
  });

  it("키가 없으면 호출하지 않고 not_configured", async () => {
    const fetchImpl = vi.fn();
    const generate = createOpenRouterGenerator({ apiKey: undefined, fetchImpl });
    await expect(generate({ system: "s", user: "u" })).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createCoachGenerator", () => {
  it("OpenRouter 키가 있으면 OpenRouter를 쓴다", async () => {
    const fetchImpl = vi.fn(async () => okResponse('{"summary":"x"}'));
    const generate = createCoachGenerator({
      openRouterApiKey: "sk-or",
      deepSeekApiKey: "sk-ds",
      fetchImpl,
    });
    await generate({ system: "s", user: "u" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("OpenRouter 키가 없으면 DeepSeek 직접 호출로 떨어진다", async () => {
    const fetchImpl = vi.fn(async () => okResponse('{"summary":"x"}'));
    const generate = createCoachGenerator({ deepSeekApiKey: "sk-ds", fetchImpl });
    await generate({ system: "s", user: "u" });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
  });

  it("둘 다 없으면 not_configured", async () => {
    const generate = createCoachGenerator({ fetchImpl: vi.fn() });
    await expect(generate({ system: "s", user: "u" })).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  it("모델을 지정하면 그 모델을 쓴다", async () => {
    const fetchImpl = vi.fn(async () => okResponse('{"summary":"x"}'));
    const generate = createCoachGenerator({
      openRouterApiKey: "sk-or",
      model: "deepseek/deepseek-v4-pro",
      fetchImpl,
    });
    await generate({ system: "s", user: "u" });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).model).toBe("deepseek/deepseek-v4-pro");
  });
});
