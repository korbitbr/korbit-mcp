import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KorbitApiError, KorbitClient, truncateResult } from '../src/korbit-client.js';
import { buildTools, toolsForContext } from '../src/tools.js';

function fakeClient(responder: (method: string, path: string, body?: unknown, idem?: string) => {
  status: number;
  body?: unknown;
}): { client: KorbitClient; calls: Array<{ method: string; path: string; body?: unknown; idem?: string }> } {
  const calls: Array<{ method: string; path: string; body?: unknown; idem?: string }> = [];
  const client = new KorbitClient({
    baseUrl: 'https://api-test.korbit.com.br',
    apiKey: 'kbt_test_a_b',
    fetchImpl: async (_url, init) => {
      const method = init?.method ?? 'GET';
      const path = new URL(String(_url)).pathname;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const idem = headers['Idempotency-Key'];
      calls.push({ method, path, body, idem });
      const result = responder(method, path, body, idem);
      return new Response(result.body === undefined ? '' : JSON.stringify(result.body), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return { client, calls };
}

const ctx = { client: null as unknown as KorbitClient, moneyMovementEnabled: false };

test('registry: ferramentas de movimentação só entram com a flag', () => {
  const { client } = fakeClient(() => ({ status: 200, body: {} }));
  const all = buildTools({ client, moneyMovementEnabled: true });
  const gated = all.filter((tool) => tool.moneyMovement).map((tool) => tool.name);
  assert.ok(gated.length >= 4, 'esperava pelo menos 4 ferramentas gated');
  assert.deepEqual(
    toolsForContext({ client, moneyMovementEnabled: false }).map((tool) => tool.name),
    all.filter((tool) => !tool.moneyMovement).map((tool) => tool.name),
  );
  assert.deepEqual(
    toolsForContext({ client, moneyMovementEnabled: true }).map((tool) => tool.name),
    all.map((tool) => tool.name),
  );
});

test('create_payment_intent injeta Idempotency-Key UUID e monta o corpo', async () => {
  const { client, calls } = fakeClient(() => ({ status: 201, body: { id: 'pi_1', status: 'REQUIRES_ACTION' } }));
  const tool = toolsForContext({ client, moneyMovementEnabled: false }).find((t) => t.name === 'create_payment_intent')!;
  const result = await tool.run({ amount: 14990, paymentMethod: 'PIX' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/v1/payment-intents');
  assert.match(calls[0].idem ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(calls[0].body, { amount: 14990, paymentMethod: 'PIX' });
  assert.deepEqual(result, { id: 'pi_1', status: 'REQUIRES_ACTION' });
});

test('idempotencyKey explícita é respeitada', async () => {
  const { client, calls } = fakeClient(() => ({ status: 201, body: {} }));
  const tool = toolsForContext({ client, moneyMovementEnabled: false }).find((t) => t.name === 'create_payment_intent')!;
  const key = '11111111-2222-3333-4444-555555555555';
  await tool.run({ amount: 100, paymentMethod: 'PIX', idempotencyKey: key });
  assert.equal(calls[0].idem, key);
});

test('create_payout_request (gated) envia corpo correto', async () => {
  const { client, calls } = fakeClient(() => ({ status: 201, body: { id: 'po_1' } }));
  const tool = toolsForContext({ client, moneyMovementEnabled: true }).find((t) => t.name === 'create_payout_request')!;
  await tool.run({ amountMinor: 150000, currency: 'BRL', beneficiaryId: '99999999-9999-9999-9999-999999999999' });
  assert.equal(calls[0].path, '/v1/payout-requests');
  assert.equal(calls[0].body && (calls[0].body as any).amountMinor, 150000);
});

test('erros problem+json viram KorbitApiError com code e requestId', async () => {
  const { client } = fakeClient(() => ({
    status: 409,
    body: {
      code: 'IDEMPOTENCY_KEY_REUSED',
      detail: 'Mesma chave com payload diferente.',
      requestId: 'req-123',
      title: 'Conflict',
    },
  }));
  await assert.rejects(
    () => client.get('/v1/balance'),
    (error: unknown) => {
      assert.ok(error instanceof KorbitApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, 'IDEMPOTENCY_KEY_REUSED');
      assert.equal(error.requestId, 'req-123');
      assert.match(error.message, /IDEMPOTENCY_KEY_REUSED/);
      assert.match(error.message, /req-123/);
      assert.doesNotMatch(error.message, /kbt_test/);
      return true;
    },
  );
});

test('truncation: resposta gigante é cortada com hint', () => {
  const big = { data: Array.from({ length: 5000 }, (_, i) => ({ i, text: 'x'.repeat(20) })) };
  const result = truncateResult(big, 5_000) as { truncated: boolean; partial: string };
  assert.equal(result.truncated, true);
  assert.match(result.hint, /paginação/i);
  assert.ok(result.partial.length <= 5_000);
  assert.deepEqual(truncateResult({ small: true }), { small: true });
});
