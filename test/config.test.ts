import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';

test('deriva ambiente e base URL de chave live', () => {
  const config = loadConfig({ KORBIT_API_KEY: 'kbt_live_abc123_secret456' });
  assert.equal(config.environment, 'live');
  assert.equal(config.baseUrl, 'https://api.korbit.com.br');
  assert.equal(config.moneyMovementEnabled, false);
});

test('deriva ambiente sandbox de chave test', () => {
  const config = loadConfig({ KORBIT_API_KEY: 'kbt_test_abc123_secret456' });
  assert.equal(config.environment, 'test');
  assert.equal(config.baseUrl, 'https://api-test.korbit.com.br');
});

test('habilita movimentação de dinheiro apenas com a flag', () => {
  const env = { KORBIT_API_KEY: 'kbt_test_a_b' };
  assert.equal(loadConfig(env).moneyMovementEnabled, false);
  assert.equal(loadConfig({ ...env, KORBIT_MCP_ENABLE_MONEY_MOVEMENT: 'true' }).moneyMovementEnabled, true);
  assert.equal(loadConfig({ ...env, KORBIT_MCP_ENABLE_MONEY_MOVEMENT: '1' }).moneyMovementEnabled, false);
});

test('falha com mensagem clara para chave ausente ou malformada', () => {
  assert.throws(() => loadConfig({}), /KORBIT_API_KEY ausente/);
  for (const bad of ['sk_live_xxx', 'kbt_sandbox_a_b', 'kbt_live_onlyonepart']) {
    assert.throws(() => loadConfig({ KORBIT_API_KEY: bad }), /KORBIT_API_KEY ausente ou malformada/);
  }
});
