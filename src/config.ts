/**
 * Configuração do servidor MCP da Korbit — validação fail-fast na inicialização.
 * A chave nunca é logada; a base URL é derivada do prefixo dela.
 */

export interface KorbitMcpConfig {
  apiKey: string;
  baseUrl: string;
  environment: 'live' | 'test';
  moneyMovementEnabled: boolean;
}

const KEY_PATTERN = /^kbt_(live|test)_[A-Za-z0-9]+_[A-Za-z0-9]+$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): KorbitMcpConfig {
  const apiKey = env.KORBIT_API_KEY?.trim() ?? '';
  const match = KEY_PATTERN.exec(apiKey);
  if (!match) {
    throw new Error(
      'KORBIT_API_KEY ausente ou malformada. Use uma chave de API da Korbit no formato ' +
        'kbt_live_<publicId>_<secret> (produção) ou kbt_test_<publicId>_<secret> (sandbox). ' +
        'Gere a chave no painel Korbit em Integrações → Chaves de API.',
    );
  }
  const environment = match[1] as 'live' | 'test';
  return {
    apiKey,
    environment,
    baseUrl:
      environment === 'live'
        ? 'https://api.korbit.com.br'
        : 'https://api-test.korbit.com.br',
    moneyMovementEnabled: env.KORBIT_MCP_ENABLE_MONEY_MOVEMENT?.trim() === 'true',
  };
}
