# Operação do agente e do supervisor

## Laboratório interativo

Com o serviço local conectado ao WhatsApp:

```sh
cd /home/kellyson/Projetos/rota-studio/automacao-local
npm run testar
```

O menu pede o modo e o telefone do cliente de teste. Enter usa o admin como
destino. Para iniciar sem o menu, informe as duas opções:

```sh
npm run testar -- --modo whatsapp --numero 5584999990000
npm run testar -- --modo terminal --numero 5584999990000
```

| Modo | Onde conversar como cliente | Onde autorizar |
|---|---|---|
| `whatsapp` | WhatsApp do telefone escolhido | Terminal |
| `terminal` | Terminal, digitando mensagens normais | WhatsApp do admin |

Os números dos exemplos são ilustrativos. Sem `--numero`, o destino é o admin
configurado; não é necessário editar arquivos. No modo terminal, o número do
cliente é apenas a identidade da simulação e não recebe mensagens reais.

No modo WhatsApp, comece no terminal com, por exemplo:

```text
/enviar Oi! Sou o Kellyson, da Indexa. Como vocês fazem hoje a confirmação das consultas?
```

Depois, responda pelo WhatsApp como cliente. Se a conta conectada for a própria
conta admin, use a conversa consigo mesmo. Mensagens enviadas pelo agente são
identificadas para não voltarem como entrada. Durante esse modo, o texto que o
admin escreve no WhatsApp é fala de cliente; não é uma autorização.

O terminal acompanha mensagens, decisões, sugestões e códigos. No canal de
autorização, use `ok CODIGO`, `não CODIGO`, `edita CODIGO TEXTO`, `pendências`,
`status`, `orcar TELEFONE agenda normal | agendamento,recepcao`, ou
`pausar TELEFONE` / `retomar TELEFONE`. No modo terminal, esses comandos devem
ser enviados pelo WhatsApp do admin. A própria saída do modelo nunca aprova.

`/ajuda` mostra os comandos do terminal; `/status` consulta a sessão; `/sair`,
Ctrl+C ou o fechamento normal da entrada encerra. Perda de conexão do terminal
encerra o teste em até 90 segundos sem acompanhamento. Só há uma sessão por PC.
Reiniciar o serviço também encerra o teste. Operações de envio já em andamento
precisam concluir ou expirar antes de liberar a automação normal.

Durante a sessão, filas, respostas, retornos e avisos normais deste PC ficam
suspensos. Não se altera a pausa salva no Supabase: ao sair, o estado anterior é
respeitado. Os testes usam o mesmo agente, validador e catálogo, mas histórico,
orçamentos e aprovações são locais, sem criar leads nem propostas no CRM.
Entradas do WhatsApp consumidas pelo teste são lembradas no diário local para
não serem reprocessadas como conversas reais após sair ou reiniciar.

Horário comercial é ignorado apenas no laboratório. Validação de texto,
limites comerciais, pausa por intervenção, expiração/invalidação de códigos e
proteção contra repetição continuam valendo. Retornos de vários dias não são
agendados no laboratório. O teste usa os provedores de modelo configurados no
PC; indisponibilidade aparece como pedido de revisão. Sem confirmação de envio,
a sessão pausa e o mesmo código não repete uma tentativa incerta.

As mensagens enviadas pelo canal WhatsApp são reais. Autorizações de teste
nesse canal vêm identificadas como `[TESTE ...]`. Registros ficam privados em
`automacao-local/data/testes/SESSAO.jsonl`, com permissão de arquivo 600. Nada
desse diretório é publicado no site nem versionado.

## Componentes

- O painel Indexa autentica a equipe no Supabase. A primeira abordagem continua
  sendo revisada pela pessoa responsável antes do agendamento.
- O executor Node no PC mantém a sessão do WhatsApp e processa a fila com diário
  SQLite. O telefone do administrador fica somente em `data/agent.json`.
- O agente de conversa sugere texto; o motor comercial calcula a proposta, e as
  políticas do executor e do banco autorizam o envio.
- O supervisor atende o administrador pelo WhatsApp. Perguntas em linguagem
  natural são consultas; alterações e aprovações usam comandos explícitos.

## Administrador pelo WhatsApp

O número é normalizado para código de país e DDD. Celulares brasileiros com e
sem o nono dígito são comparados pela mesma chave. A autorização usa o remetente
da mensagem do WhatsApp, nunca um número escrito no corpo do texto.

Quando o número do administrador é o próprio número conectado, a conversa
consigo mesmo também é um console. Avisos do sistema são registrados para não
serem interpretados como comandos ou perguntas do usuário.

Comandos:

```text
ajuda
status
pendências
pausar TELEFONE
retomar TELEFONE
pausar tudo
retomar tudo
ok CODIGO_DE_8_CARACTERES
não CODIGO_DE_8_CARACTERES
edita CODIGO_DE_8_CARACTERES texto revisado
orcar TELEFONE presenca aquisicao | site
orcar TELEFONE agenda normal | agendamento,recepcao,prontuario
retornos TELEFONE sim
retornos TELEFONE nao
```

`orcar` confirma o enquadramento e os módulos que você verificou. Se houver um
pedido de orçamento pendente, ele será reprocessado com esses dados quando a
conversa estiver liberada. Uma cotação já apresentada não pode subir de preço
automaticamente: alterações de escopo precisam de revisão.

O código identifica uma sugestão específica. Uma mensagem nova invalida a
sugestão anterior. Aprovações repetidas, códigos antigos, ambíguos ou de outro
computador não executam novamente. Rascunhos expiram para aprovação após 24 h.

O supervisor não se autoriza: uma resposta do modelo que diga “aprovado” ou
contenha um comando não dispara uma ação. O diário local registra remetente,
comando e resultado; o banco registra a decisão e a origem da aprovação.

## Quando uma conversa para

Uma resposta manual enviada pelo celular assume a conversa. A automação só
volta com `retomar TELEFONE` ou com o botão explícito no painel. Isso também
invalida agendamentos e sugestões que usavam o contexto anterior.

Perguntas sobre ser automação, reclamações, arquivos que ainda não são
interpretados e informações de pagamento geram encaminhamento para o admin.
Não se confirma pagamento nem início de trabalho pela mensagem “já paguei”.

Captura de saídas manuais começa na primeira execução desta versão. O histórico
disponível no WhatsApp é consultado nas reconexões, mas não se promete recuperar
mensagens que o dispositivo não disponibiliza. Em caso de contexto alterado, a
resposta gerada é descartada.

## Regras de envio

- Nenhuma saída do modelo é convertida automaticamente para string ou número.
  A ação `rascunho` jamais permite envio. Campos extras e tipos inválidos ficam
  retidos para revisão.
- Agradecimentos curtos geralmente encerram sem outra resposta.
- Preço por extenso, percentual, concessão ou compromisso de entrega não pode
  sair do texto livre do modelo. Catálogo e cálculo são a origem da proposta.
- URLs precisam de HTTPS, host autorizado e ausência de credenciais ou porta
  alternativa. Um domínio que apenas contém o nome da Indexa não é aceito.
- Respostas automáticas respeitam modo, horário e limite também no banco e no
  despacho, além das verificações feitas quando a sugestão foi gerada.
- Os horários atuais para automático são segunda a sexta, 8h–18h, e sábado,
  8h–12h, em Fortaleza. Agendamentos explícitos do operador usam a data escolhida.
- Texto pode ter até três partes. Cada parte tem nova conferência de conexão,
  contexto, pausa e bloqueio, e sua própria confirmação persistida.
- Uma interrupção depois de uma parte confirmada fica para conferência, sem
  reenviar automaticamente as partes que já saíram.

## Catálogo aprovado

| Serviço | Implantação inicial | Negociação |
|---|---:|---|
| Presença | R$ 500 | Até 10% à vista, piso R$ 450 |
| Agenda para aquisição de oportunidade menor | R$ 1.250 | Até 10% à vista, piso R$ 1.125 |
| Agenda normal | R$ 2.000 como referência; faixa R$ 1.750–2.125 | Até 10% à vista sobre a base escolhida |

O primeiro valor é definido após entender o pedido, o porte e o trabalho de
implantação. Escopo e módulos são confirmados pelo admin antes da primeira
cotação automática. A referência “normal” não é um aumento depois de apresentar
um preço menor ao cliente.

Hospedagem: R$ 300/ano. Primeiro ano pode ser bônus, sem acumular com desconto na
implantação. Domínio no nome do cliente, separado e pelo custo real. O plano
cobre bugs do escopo entregue; atendimento de uso, ajustes e funções novas são à
parte. Os projetos usam PHP na hospedagem Hostinger do responsável.

O pacote Agenda usa módulos existentes listados por escrito, incluindo fichas e
prontuário quando aplicável. Novos módulos, integrações e grandes alterações
são orçados separadamente. **O recurso de WhatsApp vendido à clínica é manual:**
template e botão para abrir a conversa, sem lembrete ou envio automático.

Pix: entrada de 50% e saldo na entrega; desconto exige pagamento à vista da
implantação. Cartão: cobrança integral parcelável em até 12x com juros para o
comprador. Valores de parcelas, juros e recebimento dependem do checkout.

Mercado Pago foi escolhido, mas conta, credenciais e confirmação de pagamento
ainda precisam ser conectadas. Esta versão não inventa links, taxas ou
comprovantes. Quando necessário, a cobrança e sua confirmação ficam com o admin.
Estimativa de prazo depende do escopo e da disponibilidade; não há mínimo
automático de três semanas nem compromisso de data pelo modelo.

## Retornos

Retornos são desativados por padrão. `retornos TELEFONE sim` registra a liberação
do administrador depois de conferir a abertura do cliente. Sem mensagem recebida
do cliente, o banco recusa ativar retornos automáticos.

Há até dois retornos por período de silêncio, após 3 e 7 dias úteis do último
envio elegível. Nova resposta, recusa, posse humana ou revogação impedem o
despacho. O computador não envia os dois atrasados de uma vez. Retornos muito
antigos são encerrados. Não se cria retomada automática para contatos frios só
porque o número está publicado.

O calendário considera fins de semana, feriados nacionais fixos e Paixão de
Cristo. Datas locais e dias de suspensão do atendimento são configurados em
`businessHolidays` (formato `AAAA-MM-DD`) no arquivo privado `data/agent.json`.

## Publicação e verificação

Aplicar as migrações em ordem até `20261029_retornos_supervisionados.sql`, com o
executor parado e sem uma chamada de envio ativa. A migração de políticas
invalida rascunhos antigos e respostas automáticas enfileiradas pela versão
anterior. Mensagens já enviadas e o histórico não são apagados.

Depois: publicar o painel, atualizar `data/agent.json`, reiniciar o serviço e
conferir `/api/status` e o comando `status` no WhatsApp do admin. A sessão local
do WhatsApp é preservada.

```sh
npm test
systemctl --user restart indexa-whatsapp
systemctl --user status indexa-whatsapp
journalctl --user -u indexa-whatsapp -n 30
```

Os testes de modelos e de transporte são simulados. As políticas do banco são
testadas em PostgreSQL 16 descartável. Testes não enviam mensagens reais.

Para impedir ferramentas no OpenCode, o processo usa uma configuração local com
permissão global `deny` e execução sem plugins externos. O agy usa modo de plano,
sandbox e expansão de comandos desativada. Isso não substitui as verificações de
ação, contexto e conteúdo feitas pelo aplicativo e pelo banco.
