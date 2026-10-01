# @korbit/mcp

Servidor MCP (Model Context Protocol) da Korbit: pagamentos por PIX e cartão, catálogo, assinaturas, saldo, saques e webhooks — direto das ferramentas do seu agente de IA (Claude Desktop, Claude Code, Cursor, Codex e qualquer cliente MCP).

```bash
npx -y @korbit/mcp
```

## Segurança por padrão

> **Ferramentas que movimentam dinheiro (saques, refunds, beneficiários, cancelamento de assinatura) ficam DESLIGADAS por padrão.** Elas só são registradas quando você define `KORBIT_MCP_ENABLE_MONEY_MOVEMENT=true` — sem a flag, elas não aparecem para o agente. Mesmo ligadas, a chave da sua conta só permite o que o escopo dela permite.

Toda mutação envia `Idempotency-Key` automaticamente (UUID por chamada, com opção de chave explícita), então retries nunca duplicam cobranças. A chave de API **nunca** aparece em logs ou mensagens de erro.

## Configuração

Gere a chave no painel Korbit (**Integrações → Chaves de API**). O ambiente é derivado do prefixo da chave: `kbt_live_…` → produção, `kbt_test_…` → sandbox (`api-test.korbit.com.br`).

### Claude Desktop

`claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "korbit": {
      "command": "npx",
      "args": ["-y", "@korbit/mcp"],
      "env": {
        "KORBIT_API_KEY": "kbt_test_EXEMPLO_NAO_USAR"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` — mesma estrutura:

```json
{
  "mcpServers": {
    "korbit": {
      "command": "npx",
      "args": ["-y", "@korbit/mcp"],
      "env": { "KORBIT_API_KEY": "kbt_test_EXEMPLO_NAO_USAR" }
    }
  }
}
```

### Claude Code / Codex CLI

```bash
claude mcp add korbit --env KORBIT_API_KEY=kbt_test_EXEMPLO_NAO_USAR -- npx -y @korbit/mcp
```

### Habilitar movimentação de dinheiro

```json
"env": {
  "KORBIT_API_KEY": "kbt_live_EXEMPLO_NAO_USAR",
  "KORBIT_MCP_ENABLE_MONEY_MOVEMENT": "true"
}
```

Reinicie o cliente MCP depois de alterar a configuração. Comece sempre por uma chave `kbt_test_` (sandbox) — nada ali move dinheiro real.

## Ferramentas

**Sempre disponíveis (25):**

| Grupo | Ferramentas |
| --- | --- |
| Saldo & saques | `get_balance`, `get_balance_breakdown`, `list_payout_requests`, `get_payout_request`, `list_payout_beneficiaries` |
| Pagamentos | `create_payment_intent`, `get_payment_intent` |
| Clientes & pedidos | `list_orders`, `get_order`, `list_customers`, `get_customer`, `create_customer` |
| Catálogo & checkout | `list_products`, `get_product`, `create_product`, `create_price`, `create_offer`, `publish_offer`, `get_checkout_link` |
| Assinaturas | `list_subscriptions`, `get_subscription` |
| Refunds | `list_refund_cases`, `get_refund_case` |
| Webhooks | `list_webhook_subscriptions`, `create_webhook_subscription` |

**Somente com `KORBIT_MCP_ENABLE_MONEY_MOVEMENT=true` (+4):**

`create_payout_request`, `create_payout_beneficiary`, `create_refund`, `cancel_subscription`

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `KORBIT_API_KEY` | sim | Chave de API do merchant (`kbt_live_…` ou `kbt_test_…`) |
| `KORBIT_MCP_ENABLE_MONEY_MOVEMENT` | não | `"true"` habilita as ferramentas que movimentam dinheiro (padrão: desligado) |

## Desenvolvimento

```bash
npm install
npm test        # testes unitários (sem rede)
npm run build   # compila para dist/
```

## Licença

MIT
