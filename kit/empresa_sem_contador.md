# Abrir e manter a empresa sem contador

Resumo do levantamento de 09/10/2026. O que está marcado **[conferir]** depende de uma tela ou de uma regra local que não deu para confirmar daqui.

## Formato

- **MEI não serve.** Programação não está na lista de atividades do MEI (Res. CGSN 140/2018, Anexo XI). O PLP 25/2026, que incluiria programador, ainda não é lei.
- **Sociedade Limitada Unipessoal (SLU), microempresa, Simples Nacional.** Só você de sócio, e o seu patrimônio fica separado das dívidas e multas de contrato (Código Civil, art. 1.052). O Empresário Individual é um pouco mais barato, mas responde com os bens pessoais.
- **Capital social.** Edital pode exigir capital ou patrimônio de até 10% do valor do contrato (Lei 14.133, art. 69, §4º). R$ 5.000 cobre contratos de até R$ 50 mil.
- **CNAEs.** 6201-5/01 (sob encomenda), 6202-3/00 (customizável, o típico sistema para prefeitura), 6203-1/00 (licenciamento), 6209-1/00 (suporte), 6311-9/00 (hospedagem). Todos são de baixo risco, dispensados de alvará se você trabalha em casa sem atender público (Res. CGSIM 51/2019).

## Passo a passo

1. **Conta gov.br prata ou ouro** no seu CPF. Ela assina quase tudo; o certificado e-CNPJ (R$ 200 a 280 por ano) fica para quando uma plataforma de compras exigir.
2. **Viabilidade no Sigfácil** (redesim.rn.gov.br): nome empresarial e endereço. A prefeitura confirma que a atividade pode funcionar no endereço.
3. **Coletor Nacional (DBE)** com CNAEs, endereço e capital, pelo próprio Sigfácil ou pelo site da Receita.
4. **Contrato social de SLU** (modelo padrão da Junta), pagamento da guia da JUCERN e assinatura eletrônica. Taxa: entre R$ 300 e R$ 700 para SLU **[conferir na guia]**.
5. **CNPJ e NIRE** saem com o deferimento.
6. **Inscrição municipal em Pau dos Ferros** (tributosmunicipais.com.br ou Secretaria de Tributação). Pergunte se cobram taxa de funcionamento para baixo risco **[conferir]**.
7. **Opção pelo Simples Nacional** no Portal do Simples, em até 30 dias do deferimento da inscrição municipal e no máximo 60 dias da abertura do CNPJ. Perder esse prazo deixa a empresa no Lucro Presumido até janeiro.
8. **Conta PJ** num banco digital (sem tarifa).
9. **Nota fiscal.** A Res. CGSN 191/2026 obriga ME do Simples a usar o Emissor Nacional da NFS-e (nfse.gov.br) a partir de 01/11/2026. Pau dos Ferros usa sistema próprio e aparecia como não conveniado em 2025: pergunte à Tributação qual emissor usar **[conferir antes da primeira nota]**.
10. **Certidões** (federal, FGTS, trabalhista, estadual, municipal, falência). Valem de 30 a 180 dias e são exigidas em toda contratação.

## Imposto: com ou sem pró-labore

Software fica no Anexo III (6%) se o pró-labore dos últimos 12 meses for pelo menos 28% da receita (Fator R). Sem isso, vai para o Anexo V (15,5%). O pró-labore mínimo é um salário mínimo (R$ 1.621 em 2026), com INSS de 11% (R$ 178,31 por mês).

| Receita do mês | Sem pró-labore (Anexo V) | Com pró-labore (Anexo III + INSS) | Mais barato |
| --- | --- | --- | --- |
| R$ 750 | R$ 116 | R$ 45 + R$ 178 = R$ 223 | sem |
| R$ 1.500 | R$ 233 | R$ 90 + R$ 178 = R$ 268 | sem |
| R$ 2.500 | R$ 388 | R$ 150 + R$ 178 = R$ 328 | com |
| R$ 5.000 | R$ 775 | R$ 300 + R$ 178 = R$ 478 | com |

- O ponto de virada é perto de **R$ 1.880 de receita por mês**.
- Ficar sem pró-labore é **controverso**: a Receita entende que o sócio que trabalha tem remuneração (Solução de Consulta COSIT 228/2023). Com valores pequenos o risco é baixo, mas existe.
- O INSS do pró-labore conta para aposentadoria e auxílio-doença. Como estagiário, você hoje não contribui.
- O Fator R olha 12 meses para trás: começar o pró-labore só quando a receita subir deixa alguns meses no Anexo V. O `empresa.py das` mostra isso mês a mês.

## Rotina sem contador

| Quando | O quê |
| --- | --- |
| Todo mês, dia 20 | PGDAS-D e DAS do mês anterior, **mesmo com receita zero** (há multa por atraso desde 2026) |
| Todo mês, se houver pró-labore | eSocial até o dia 15, DCTFWeb e DARF do INSS até o dia 20 |
| Sempre | Livro caixa (obrigatório): `empresa.py caixa` |
| Até 31/03 | DEFIS do ano anterior (a Res. CGSN 190/2026 a substitui por informação anual no PGDAS-D a partir de 2027) **[conferir em jan/2027]** |
| Antes de cada proposta | Certidões em dia: `empresa.py certidoes` |
| A partir de jan/2027 | O DAS passa a ser cobrado na emissão da nota, não no recebimento. Prefeitura que atrasa pagamento pesa no caixa. |

## Onde a lei exige contador

- **Balanço patrimonial e DRE assinados por contador** (Código Civil, art. 1.184, §2º), exigidos quando a contratação pede qualificação econômico-financeira (Lei 14.133, art. 69).
- Em contrato abaixo de **R$ 16.373,03** a prefeitura pode dispensar esses documentos (art. 70, III). É escolha dela, não direito seu; a certidão do INSS continua obrigatória.
- Plano: fazer tudo sozinho e pagar um contador **uma vez por ano** para o balanço quando aparecer uma contratação maior. O contador online mensal custa de R$ 150 a R$ 450.

## Dois cuidados que não mudam

- **Não venda para a Prefeitura de Pau dos Ferros** enquanto for estagiário de lá (Lei 14.133, art. 9º, §1º).
- **O que você fez no estágio é da prefeitura** (Lei 9.609, art. 4º, §3º). O Seletivo da empresa precisa ser código novo, escrito fora do horário e do equipamento da prefeitura.

Este resumo não substitui orientação contábil ou jurídica.
