/**
 * Definições das ferramentas MCP da Korbit.
 * Ferramentas marcadas com `moneyMovement: true` só são registradas quando
 * KORBIT_MCP_ENABLE_MONEY_MOVEMENT=true.
 */
import { z, type ZodRawShape } from 'zod';
import type { KorbitClient } from './korbit-client.js';

export interface ToolContext {
  client: KorbitClient;
  moneyMovementEnabled: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  moneyMovement?: boolean;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

const uuid = z.string().uuid();
const cents = z.number().int().positive().describe('Valor em centavos (BRL). Ex.: 14990 = R$ 149,90.');

const cursor = z.string().optional().describe('Cursor da página anterior (paginação).');
const limit = z.number().int().min(1).max(100).optional().describe('Itens por página (1–100).');

export function buildTools(ctx: ToolContext): ToolDefinition[] {
  const { client } = ctx;
  const t = (
    name: string,
    description: string,
    inputSchema: ZodRawShape,
    run: (args: Record<string, unknown>) => Promise<unknown>,
    moneyMovement = false,
  ): ToolDefinition => ({ name, description, inputSchema, run, moneyMovement });

  const post = (path: string, body?: unknown, idempotencyKey?: string) =>
    idempotencyKey === undefined
      ? client.post(path, body)
      : client.post(path, body, { idempotencyKey });

  return [
    // ───────────── Saldo & Saques ─────────────
    t('get_balance', 'Consulta o saldo da conta Korbit: disponível para saque, a liberar e reservado.', {}, () =>
      client.get('/v1/balance'),
    ),
    t('get_balance_breakdown', 'Detalha a composição do saldo (disponível, pendente, reservas).', {}, () =>
      client.get('/v1/balance/breakdown'),
    ),
    t(
      'list_payout_requests',
      'Lista solicitações de saque com estados e tarifas.',
      { cursor, limit },
      (a) => client.get('/v1/payout-requests', { cursor: a.cursor, limit: a.limit }),
    ),
    t('get_payout_request', 'Detalha um saque: reserva, aprovação, execução PIX e conciliação.', { id: uuid }, (a) =>
      client.get(`/v1/payout-requests/${a.id}`),
    ),
    t(
      'list_payout_beneficiaries',
      'Lista as chaves PIX cadastradas para saques (sempre mascaradas).',
      {},
      () => client.get('/v1/payout-beneficiaries'),
    ),
    t(
      'create_payout_beneficiary',
      'Cadastra uma chave PIX de destino para saques. ATENÇÃO: define para onde o dinheiro sai — confirme o titular com o usuário antes de executar.',
      {
        pixKey: z.string().min(1).describe('A chave PIX (CPF, CNPJ, e-mail, telefone ou EVP).'),
        pixKeyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP']).describe('Tipo da chave PIX.'),
      },
      (a) => post('/v1/payout-beneficiaries', a),
      true,
    ),
    t(
      'create_payout_request',
      'Solicita a transferência do saldo disponível para um beneficiário PIX. ATENÇÃO: reserva dinheiro real — confirme valor e destinatário com o usuário antes de executar.',
      {
        amountMinor: cents,
        currency: z.literal('BRL').default('BRL'),
        beneficiaryId: uuid.describe('Id do beneficiário (chave PIX de destino).'),
      },
      (a) => post('/v1/payout-requests', a),
      true,
    ),

    // ───────────── Pagamentos ─────────────
    t(
      'create_payment_intent',
      'Cria uma cobrança PIX ou cartão. A resposta vem em REQUIRES_ACTION com o código PIX copia-e-cola (ou dados do desafio 3DS). Idempotency-Key é gerada automaticamente.',
      {
        amount: cents,
        paymentMethod: z.enum(['PIX', 'CARD']),
        description: z.string().max(200).optional().describe('Descrição para conciliação (ex.: "Pedido #1042").'),
        externalReference: z.string().max(200).optional().describe('Seu identificador interno do pedido.'),
        expiresInSeconds: z.number().int().min(60).max(86400).optional().describe('TTL da cobrança em segundos (PIX padrão: 900).'),
        idempotencyKey: z.string().uuid().optional().describe('Chave de idempotência explícita; se omitida, uma UUID é gerada.'),
      },
      (a) => {
        const { idempotencyKey, ...body } = a;
        return post(
          '/v1/payment-intents',
          body,
          typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
        );
      },
    ),
    t('get_payment_intent', 'Consulta o estado atual e os dados de uma cobrança.', { id: uuid }, (a) =>
      client.get(`/v1/payment-intents/${a.id}`),
    ),

    // ───────────── Clientes e Pedidos ─────────────
    t(
      'list_orders',
      'Lista pedidos da conta com filtros e paginação.',
      { cursor, limit, status: z.string().optional().describe('Filtro por estado do pedido (ex.: PAID).') },
      (a) => client.get('/v1/orders', { cursor: a.cursor, limit: a.limit, status: a.status }),
    ),
    t('get_order', 'Detalha um pedido: valores, método de pagamento e comprador.', { id: uuid }, (a) =>
      client.get(`/v1/orders/${a.id}`),
    ),
    t(
      'list_customers',
      'Lista clientes da sua base, com busca opcional.',
      { cursor, limit, search: z.string().max(100).optional().describe('Busca por nome ou e-mail.') },
      (a) => client.get('/v1/customers', { cursor: a.cursor, limit: a.limit, search: a.search }),
    ),
    t('get_customer', 'Detalha um cliente e seu histórico resumido.', { id: uuid }, (a) =>
      client.get(`/v1/customers/${a.id}`),
    ),
    t(
      'create_customer',
      'Cadastra um cliente. O e-mail é único na sua base.',
      {
        name: z.string().min(1).max(200),
        email: z.string().email(),
        phone: z.string().max(30).optional(),
        externalId: z.string().max(200).optional().describe('Seu identificador interno do cliente.'),
      },
      (a) => post('/v1/customers', a),
    ),

    // ───────────── Catálogo & Checkout ─────────────
    t('list_products', 'Lista o catálogo de produtos.', { cursor, limit }, (a) =>
      client.get('/v1/products', { cursor: a.cursor, limit: a.limit }),
    ),
    t('get_product', 'Detalha um produto, incluindo preços e ofertas.', { id: uuid }, (a) =>
      client.get(`/v1/products/${a.id}`),
    ),
    t(
      'create_product',
      'Cria um produto (a "ficha" do que você vende). Preço e oferta são criados depois.',
      {
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        externalReference: z.string().max(200).optional(),
      },
      (a) => post('/v1/products', a),
    ),
    t(
      'create_price',
      'Cria uma nova versão de preço para o produto (histórico preservado).',
      {
        productId: uuid,
        amountMinor: cents,
        currency: z.literal('BRL').default('BRL'),
      },
      (a) => post(`/v1/products/${a.productId}/prices`, { amountMinor: a.amountMinor, currency: a.currency }),
    ),
    t(
      'create_offer',
      'Cria uma oferta (produto + preço + métodos de pagamento). Só ofertas publicadas vendem.',
      {
        productId: uuid,
        priceId: uuid.describe('Id da versão de preço vigente.'),
        paymentMethods: z.array(z.enum(['PIX', 'CARD'])).min(1),
        maxInstallments: z.number().int().min(1).max(12).optional().describe('Parcelamento máximo no cartão.'),
      },
      (a) => {
        const { productId, ...body } = a;
        return post(`/v1/products/${productId}/offers`, body);
      },
    ),
    t(
      'publish_offer',
      'Publica a oferta e habilita o link de pagamento. Retorna o código público do link.',
      { offerId: uuid },
      (a) => post(`/v1/offers/${a.offerId}/publish`),
    ),
    t(
      'get_checkout_link',
      'Consulta um link de pagamento pelo código público (korbit.com.br/o/{publicCode}).',
      { publicCode: z.string().min(20).max(64) },
      (a) => client.get(`/v1/checkout-links/${a.publicCode}`),
    ),

    // ───────────── Assinaturas ─────────────
    t('list_subscriptions', 'Lista assinaturas recorrentes da conta.', { cursor, limit }, (a) =>
      client.get('/v1/subscriptions', { cursor: a.cursor, limit: a.limit }),
    ),
    t('get_subscription', 'Detalha uma assinatura: oferta vigente, estado e cobranças agendadas.', { id: uuid }, (a) =>
      client.get(`/v1/subscriptions/${a.id}`),
    ),
    t(
      'cancel_subscription',
      'Cancela uma assinatura imediatamente — nenhuma nova fatura é gerada. ATENÇÃO: confirme com o usuário antes de executar.',
      { id: uuid },
      (a) => post(`/v1/subscriptions/${a.id}/cancel`),
      true,
    ),

    // ───────────── Refunds ─────────────
    t('list_refund_cases', 'Lista casos de refund/disputa com prazos de resposta.', { cursor, limit }, (a) =>
      client.get('/v1/refund-cases', { cursor: a.cursor, limit: a.limit }),
    ),
    t('get_refund_case', 'Detalha um caso de refund: pagamento, prazo e histórico.', { caseId: uuid }, (a) =>
      client.get(`/v1/refund-cases/${a.caseId}`),
    ),
    t(
      'create_refund',
      'Cria um refund (devolução total ou parcial) de um pagamento. ATENÇÃO: devolve dinheiro real ao comprador — confirme valor e pagamento com o usuário antes de executar.',
      {
        paymentIntentId: uuid,
        amountMinor: cents.describe('Valor a devolver em centavos (≤ saldo restante do pagamento).'),
        reason: z.string().max(200).optional().describe('Motivo operacional (ex.: produto_nao_entregue).'),
      },
      (a) => post('/v1/refunds', a),
      true,
    ),

    // ───────────── Webhooks ─────────────
    t('list_webhook_subscriptions', 'Lista as assinaturas de webhook e seus estados.', {}, () =>
      client.get('/v1/webhook-subscriptions'),
    ),
    t(
      'create_webhook_subscription',
      'Registra um endpoint HTTPS para receber eventos assinados da Korbit.',
      {
        url: z.string().url().refine((u) => u.startsWith('https://'), 'Use HTTPS público.').describe('Endpoint de destino.'),
        eventTypes: z
          .array(
            z.enum([
              'payment.created.v1', 'payment.requires_action.v1', 'payment.succeeded.v1', 'payment.failed.v1',
              'refund.requested.v1', 'refund.updated.v1', 'refund.succeeded.v1',
              'payout.requested.v1', 'payout.updated.v1',
              'dispute.opened.v1', 'dispute.updated.v1',
              'merchant.kyc.updated.v1', 'merchant.status.updated.v1',
            ]),
          )
          .min(1)
          .describe('Tipos de evento a receber.'),
      },
      (a) => post('/v1/webhook-subscriptions', a),
    ),
  ];
}

export function toolsForContext(ctx: ToolContext): ToolDefinition[] {
  return buildTools(ctx).filter((tool) => !tool.moneyMovement || ctx.moneyMovementEnabled);
}
