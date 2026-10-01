#!/usr/bin/env node
/**
 * Servidor MCP da Korbit.
 *
 * Segurança por padrão: ferramentas que movimentam dinheiro (payouts, refunds,
 * cancelamento de assinatura, beneficiários) só são registradas quando
 * KORBIT_MCP_ENABLE_MONEY_MOVEMENT=true.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { KorbitClient, truncateResult } from './korbit-client.js';
import { toolsForContext } from './tools.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new KorbitClient({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  const tools = toolsForContext({ client, moneyMovementEnabled: config.moneyMovementEnabled });

  const server = new McpServer(
    { name: 'korbit', version: '0.1.0' },
    {
      instructions:
        'Ferramentas da API Korbit (pagamentos PIX/cartão, catálogo, assinaturas, saldo, saques e webhooks) ' +
        `autenticadas com uma chave do ambiente "${config.environment}". ` +
        'Valores são sempre em centavos (BRL). Toda mutação usa Idempotency-Key automaticamente. ' +
        (config.moneyMovementEnabled
          ? 'Ferramentas de movimentação de dinheiro estão HABILITADAS: confirme valor e destinatário com o usuário antes de executá-las.'
          : 'Ferramentas de movimentação de dinheiro estão DESLIGADAS nesta instalação (defina KORBIT_MCP_ENABLE_MONEY_MOVEMENT=true para habilitá-las).'),
    },
  );

  for (const tool of tools) {
    server.registerTool(tool.name, {
      title: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }, async (args) => {
      try {
        const result = await tool.run(args ?? {});
        return { content: [{ type: 'text' as const, text: JSON.stringify(truncateResult(result)) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    });
  }

  await server.connect(new StdioServerTransport());
  // stdio não deve receber logs; erros de configuração vão para stderr antes do connect.
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
