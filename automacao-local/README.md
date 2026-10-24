# WhatsApp local da Indexa

**Operação atual do agente e supervisor:** veja [OPERACAO.md](OPERACAO.md), com
comandos do administrador, políticas de conversa, catálogo e retornos.

O painel público da Indexa usa o login existente da equipe. Os agendamentos ficam
no Supabase; este processo no PC busca as tarefas por HTTPS e envia pelo WhatsApp
Web. Não é preciso expor uma porta do PC à internet. O PC precisa estar ligado,
com internet e com a sessão do WhatsApp conectada.

## Ativar

1. Aplicar as migrações de `../supabase/migrations/` em ordem, até
   `20261029_retornos_supervisionados.sql`, depois do schema existente. Cada uma
   deve ser aplicada uma vez. As políticas novas invalidam sugestões antigas;
   consulte as instruções de atualização em OPERACAO.md.
2. Publicar as mudanças do site. Abrir `/painel#whatsapp` com o login da equipe.
3. Clicar em **Vincular computador** e baixar a conexão. O token aparece uma vez.
4. Instalar as dependências neste diretório:

   ```sh
   npm ci
   npx puppeteer browsers install chrome
   node install-service.js
   ```

5. Abrir **Indexa WhatsApp local** pelo menu de aplicativos e importar a conexão.
6. No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo. Escanear
   o QR da tela local ou do painel. O QR só aparece para membros autenticados.
7. Escolher um contato, revisar telefone e texto, definir a data em horário de
   Fortaleza e confirmar o agendamento. Para o primeiro teste, usar um contato
   próprio e uma mensagem de teste.

Para executar sem serviço: `npm start`. O endereço com chave local fica em
`data/acesso-local.txt`. A porta padrão é 4318, somente em `127.0.0.1`.

## Comportamento

- Primeiras abordagens são preparadas e revisadas pela equipe. Respostas podem
  ser automáticas dentro das políticas; exceções chegam ao administrador pelo
  WhatsApp. O painel mostra o modo real do agente em cada computador.
- Intervalo inicial de 60 segundos entre execuções. Horário marcado é o horário
  mais cedo; a fila pode atrasar. Esse intervalo é operacional, não uma garantia
  contra restrições da conta.
- Ao receber uma resposta, cancela os agendamentos anteriores ainda na fila do
  mesmo número e mostra a resposta no painel. Antes de enviar, também verifica as
  50 mensagens recebidas mais recentes da conversa para recuperar respostas de
  quando o PC estava desligado. A conversa depende do histórico disponível ao
  dispositivo no WhatsApp.
- Pedidos explícitos como “parar”, “não tenho interesse” ou “não quero receber
  mensagens” também bloqueiam novos agendamentos. Outras recusas podem ser marcadas
  manualmente em **Não contatar**. A identificação automática usa frases exatas.
- Contatos marcados **Sem interesse** ou **Não compensa** não entram no envio.
- Depois de uma hora de atraso, o agendamento é cancelado para revisão. O executor
  não dispara uma fila antiga inteira ao voltar a ligar.
- Pausa e cancelamento têm efeito antes da chamada de envio. Uma mensagem já
  entregue à biblioteca do WhatsApp não pode ser retirada por esses controles.
- Uma chamada sem confirmação fica **Conferir no WhatsApp**, sem repetição
  automática. O histórico local permite reenviar o resultado ao banco sem mandar
  a mensagem novamente. Há uma janela inevitável entre WhatsApp e banco; não se
  promete entrega exatamente uma vez entre dois serviços independentes.
- “Enviada” significa que o WhatsApp retornou um identificador. Não é uma indicação
  de leitura ou de entrega ao destinatário.
- O painel mostra os 100 agendamentos e as 30 respostas mais recentes, partes
  confirmadas e conversas assumidas pela pessoa responsável.

## Dados e acesso

`data/` guarda a sessão do WhatsApp, o vínculo revogável e um diário SQLite por
vínculo. O diretório tem permissões 0700 e os arquivos criados pelo serviço usam
umask 0077. A pasta está fora do Git e da publicação Vercel. Não compartilhe os
arquivos de conexão, cookies ou QR Codes.

O navegador da equipe usa a chave publicável e o login Supabase já existente.
O executor usa a mesma chave publicável mais um token aleatório de 256 bits,
limitado às funções de execução. O banco guarda apenas o hash do token. Nenhuma
chave `service_role` é usada. Tabelas com RLS e funções com permissões explícitas
impedem acesso anônimo aos contatos, mensagens e QR Codes.

Só respostas de números com agendamentos deste executor são sincronizadas. As
mensagens ficam no Supabase para consulta da equipe. Áudios aparecem como tipo de
mensagem; transcrição e anexos ainda não fazem parte desta versão.

## Operação e testes

```sh
systemctl --user status indexa-whatsapp
systemctl --user restart indexa-whatsapp
journalctl --user -u indexa-whatsapp -n 50
systemctl --user disable --now indexa-whatsapp
npm test
```

O serviço inicia junto da sessão Linux do usuário. Para trocar um vínculo
revogado, pare o serviço, remova apenas `data/connection.json`, reinicie e importe
uma nova conexão. Os diários são separados por vínculo; não apague um diário
com resultados pendentes antes de conferir esses envios no WhatsApp.

Os testes usam um PostgreSQL 16 descartável em Docker, um navegador Chromium e
adaptadores de envio simulados. Nenhum teste envia WhatsApp real nem acessa dados
de produção. Capturas do painel ficam em `test-results/`, ignorado pelo Git.

Se o instalador do Chromium deixar o ZIP completo mas uma extração incompleta,
extraia o ZIP da versão indicada pelo Puppeteer em seu diretório de cache ou
configure `CHROME_PATH` com um Chrome compatível. A instalação realizada neste PC
já tem o Chromium necessário.

`whatsapp-web.js` depende de uma integração não oficial com o WhatsApp Web;
mudanças do serviço podem exigir atualização ou nova autenticação.

## Teste interativo pelo terminal

Dentro de `automacao-local`, execute `npm run testar`. Escolha entre cliente no
WhatsApp e aprovação no terminal, ou cliente no terminal e aprovação pelo
WhatsApp do admin. O destino padrão é o número de admin configurado neste PC.
Para escolher diretamente: `npm run testar -- --modo whatsapp --numero 5584999990000`.
Use `/enviar TEXTO` para iniciar a abordagem pelo WhatsApp e `/sair` para encerrar.
Veja os detalhes e os comandos em [OPERACAO.md](OPERACAO.md#laboratório-interativo).
