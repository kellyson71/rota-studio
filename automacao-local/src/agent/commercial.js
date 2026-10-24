import { norm } from './validator.js';

export const POLICY_VERSION = 'indexa-2026-10-24.1';
export const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/\u00a0/g, ' ');
export const MODULES = ['site', 'agendamento', 'recepcao', 'prontuario', 'fichas', 'configuracao', 'importacao', 'treinamento'];
export const COMMERCIAL_REPLIES = [
  'O desconto na implantação é para pagamento à vista no Pix. Você prefere essa opção ou o parcelamento com juros no cartão?',
  'O primeiro ano de hospedagem já está entrando como bônus nessa proposta. As duas condições são alternativas; quer manter o bônus ou ver o valor à vista?'
];

export function calculateQuote({ service, tier = 'acquisition', scope, baseCents, concession = 'none', discountPercent = 0, payment = 'pix', previous = null }) {
  if (!['presenca','agenda'].includes(service)) throw Error('Serviço precisa de escopo específico');
  if (!Array.isArray(scope) || !scope.length || scope.some(m => !MODULES.includes(m))) throw Error('Liste somente módulos existentes conferidos');
  if (service === 'presenca' && scope.some(m => !['site','configuracao','treinamento'].includes(m))) throw Error('Módulo fora do pacote Presença');
  if (!['acquisition','normal'].includes(tier)) throw Error('Enquadramento comercial inválido');
  if (!['pix','card'].includes(payment)) throw Error('Pagamento inválido');
  if (!['none','cash_discount','hosting_bonus'].includes(concession)) throw Error('Concessão inválida');
  if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 10) throw Error('Desconto fora do limite');
  if (concession !== 'cash_discount' && discountPercent !== 0) throw Error('Não acumular bônus e desconto');
  if (concession === 'cash_discount' && (payment !== 'pix' || discountPercent === 0)) throw Error('Desconto só no pagamento à vista');
  if (previous && (previous.service !== service || previous.baseCents !== (baseCents ?? previous.baseCents) || JSON.stringify(previous.scope) !== JSON.stringify(scope))) throw Error('Mudança de escopo ou preço já proposto exige revisão humana');
  const base = previous?.baseCents ?? baseCents ?? (service === 'presenca' ? 50000 : tier === 'normal' ? 200000 : 125000);
  if (!Number.isSafeInteger(base) || (service === 'presenca' ? base !== 50000 : tier === 'acquisition' ? base !== 125000 : base < 175000 || base > 212500)) throw Error('Preço inicial fora do catálogo');
  const implementationCents = base - Math.round(base * discountPercent / 100);
  const hostingCents = concession === 'hosting_bonus' ? 0 : 30000;
  return { policyVersion: POLICY_VERSION, service, tier, scope, baseCents: base, concession, discountPercent, payment,
    implementationCents, hostingCents, renewalCents: 30000, totalCents: implementationCents + hostingCents,
    pixEntryCents: payment === 'pix' ? Math.ceil(implementationCents / 2) : null,
    pixDeliveryCents: payment === 'pix' ? Math.floor(implementationCents / 2) : null,
    maxInstallments: payment === 'card' ? 12 : 1, domainSeparate: true };
}

export function renderQuote(q) {
  const label = q.service === 'presenca' ? 'site' : 'sistema com os módulos combinados';
  const payment = q.payment === 'card'
    ? 'No cartão, dá para parcelar em até 12x com juros; o valor de cada parcela e o total serão exibidos no link do Mercado Pago antes do pagamento.'
    : q.concession === 'cash_discount' ? 'Esse valor é para a implantação paga à vista no Pix.'
    : `No Pix, a implantação fica em ${money(q.pixEntryCents)} de entrada e ${money(q.pixDeliveryCents)} na entrega.`;
  const hosting = q.hostingCents === 0 ? 'O primeiro ano de hospedagem entra como bônus. Depois, a renovação é de R$ 300 por ano.' : 'A hospedagem fica em R$ 300 por ano.';
  return `Para o ${label}, a implantação fica em ${money(q.implementationCents)}. ${hosting}\n\n${payment}\n\nO domínio é registrado no seu nome e cobrado à parte pelo custo real. Correções de bugs do escopo estão incluídas no plano; atendimento de uso, ajustes e novas funções são à parte. Posso preparar a proposta com o escopo escrito?`;
}

export function commercialIntent(text) {
  const n = norm(text);
  if (/\b(desconto|negoci|mais barato|melhora.{0,15}(preco|valor)|hospedagem.{0,20}(bonus|inclus|gratis))/.test(n)) return 'negotiation';
  if (/\b(quanto (?:custa|fica|sai|e)|preco|valor|orcamento|custa|custaria|parcel\w*|pagamento|pagar|pago|paga)\b/.test(n)) return 'price';
  return null;
}

export function commercialResponse({ message, profile, previous, lastSent = '' }) {
  if (!commercialIntent(message)) return null;
  if (!profile?.scopeConfirmed) return { final: 'draft', text: '', why: 'O supervisor precisa conferir o escopo e o enquadramento antes do primeiro orçamento', needsProfile: true };
  const n = norm(message);
  let concession = previous?.concession || 'none', discountPercent = previous?.discountPercent || 0;
  const payment = /cartao|parcel/.test(n) ? 'card' : /pix|a vista/.test(n) ? 'pix' : previous?.payment || 'pix';
  if (/desconto|mais barato|melhora.{0,15}(preco|valor)/.test(n)) {
    if (payment === 'card') return { final: 'send', text: COMMERCIAL_REPLIES[0], why: 'condição de pagamento cadastrada', deterministic: true };
    if (concession === 'hosting_bonus') return { final: 'send', text: COMMERCIAL_REPLIES[1], why: 'bônus e desconto não se acumulam', deterministic: true };
    concession = 'cash_discount'; discountPercent = 10;
  }
  if (/hospedagem/.test(n) && /bonus|inclus|gratis/.test(n)) {
    concession = 'hosting_bonus'; discountPercent = 0;
  }
  if (payment === 'card' && concession === 'cash_discount') { concession = 'none'; discountPercent = 0; }
  const quote = calculateQuote({ ...profile, previous, payment, concession, discountPercent });
  const text = renderQuote(quote);
  if (norm(lastSent) === norm(text)) return { final: 'ignore', why: 'a mesma proposta já foi enviada' };
  return { final: 'send', text, quote, deterministic: true, why: 'proposta calculada pelo catálogo aprovado', intencao: 'preco' };
}
