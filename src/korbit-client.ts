/**
 * Cliente HTTP da API Korbit para as ferramentas MCP.
 * - Injeta Authorization + Idempotency-Key (UUID) em mutações.
 * - Mapeia erros problem+json para mensagens com code e requestId.
 * - Nunca registra nem inclui a chave em mensagens de erro.
 */
import { randomUUID } from 'node:crypto';

export class KorbitApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(status: number, code: string | null, detail: string, requestId: string | null) {
    super(`[${status}]${code ? ` ${code}:` : ''} ${detail}${requestId ? ` (requestId: ${requestId})` : ''}`);
    this.name = 'KorbitApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export interface KorbitClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Injetável para testes. */
  fetchImpl?: typeof fetch;
}

export class KorbitClient {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(options: KorbitClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async get(path: string, query?: Record<string, unknown>): Promise<unknown> {
    const url = new URL(this.#baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return this.#request('GET', url, undefined, undefined);
  }

  async post(
    path: string,
    body?: unknown,
    options?: { idempotencyKey?: string },
  ): Promise<unknown> {
    const url = new URL(this.#baseUrl + path);
    const idempotencyKey = options?.idempotencyKey ?? randomUUID();
    return this.#request('POST', url, body, idempotencyKey);
  }

  async patch(path: string, body?: unknown): Promise<unknown> {
    return this.#request('PATCH', new URL(this.#baseUrl + path), body, randomUUID());
  }

  async delete(path: string): Promise<unknown> {
    return this.#request('DELETE', new URL(this.#baseUrl + path), undefined, randomUUID());
  }

  async #request(
    method: string,
    url: URL,
    body: unknown,
    idempotencyKey: string | undefined,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await this.#fetch(url, init);

    const text = await response.text();
    if (!response.ok) {
      let detail = response.statusText || 'Requisição falhou';
      let code: string | null = null;
      let requestId: string | null = null;
      try {
        const problem = JSON.parse(text) as {
          detail?: string;
          code?: string;
          requestId?: string;
          title?: string;
        };
        detail = problem.detail ?? problem.title ?? detail;
        code = problem.code ?? null;
        requestId = problem.requestId ?? null;
      } catch {
        // corpo não-JSON: usa o statusText
      }
      throw new KorbitApiError(response.status, code, detail, requestId);
    }
    if (text.length === 0) return { ok: true };
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
}

/** Trunca respostas grandes para não estourar a janela de contexto do agente. */
export function truncateResult(value: unknown, maxChars = 20_000): unknown {
  const json = JSON.stringify(value);
  if (json === undefined || json.length <= maxChars) return value;
  const sliced = json.slice(0, maxChars);
  return {
    truncated: true,
    hint: 'Resposta truncada. Use filtros/paginação ou busque um item específico por id.',
    partial: sliced,
  };
}
