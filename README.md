# Rota — Kellyson & Jeyce

Central de freelas da dupla: quem já recebeu mensagem, quem respondeu, quem sumiu e os projetos em andamento. Site estático na Vercel com Supabase como banco.

## Telas

- **Hoje**: missão do dia, quem respondeu, quem está no vácuo, agenda, projetos e o mural da dupla.
- **Modo turbo**: um contato por vez com a mensagem pronta. `C` copia, `A` abre o canal, `E` marca como mandado e passa para o próximo, `→` pula.
- **Contatos**: lista ou quadro arrastável por etapa, busca (`/`), filtros, cadastro rápido (cole o WhatsApp, @ ou e-mail) e importação em lote.
- **Ficha do contato**: modelos de mensagem (1º contato, retorno, marcar conversa, pós-conversa, proposta), etapa, responsável, resposta do cliente, lembrete de retorno, reunião, notas e histórico.
- **Projetos**: briefing, escopo, tarefas detalhadas com checklist e cópia rápida.
- **WhatsApp**: agendar mensagens pelo site, acompanhar respostas e pausar envios executados pelo PC. Instruções de ativação em [automacao-local/README.md](automacao-local/README.md).

## Supabase

`supabase/schema.sql` cria `members`, `contacts` e `projects` com RLS: só usuários logados cujo e-mail está em `members` leem e escrevem. As mudanças chegam em tempo real para a outra pessoa.

Para ligar, coloque a chave publicável (Project Settings › API Keys) em `config.js`. Sem a chave, o site roda em modo demonstração, salvando no navegador.

Login por usuário: `kellyson` ou `jeyce` (vira `usuario@rota-studio.app` no Supabase Auth). Para liberar outra pessoa, crie o usuário no Auth e rode `insert into members (email, name) values ('nome@rota-studio.app', 'Nome');`

## Publicação

O site roda na Vercel em https://rota-studio-plum.vercel.app, publicado a cada push na `main`. O endereço antigo do GitHub Pages só redireciona para lá.

## Rodar local

```sh
python -m http.server 4173 --directory .
```
