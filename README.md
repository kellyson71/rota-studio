# Rota — Kellyson & Jeyce

Central de freelas da dupla: quem já recebeu mensagem, quem respondeu, quem sumiu e os projetos em andamento. Site estático no GitHub Pages com Supabase como banco.

## Telas

- **Hoje**: missão do dia, quem respondeu, quem está no vácuo, agenda, projetos e o mural da dupla.
- **Modo turbo**: um contato por vez com a mensagem pronta. `C` copia, `A` abre o canal, `E` marca como mandado e passa para o próximo, `→` pula.
- **Contatos**: lista ou quadro arrastável por etapa, busca (`/`), filtros, cadastro rápido (cole o WhatsApp, @ ou e-mail) e importação em lote.
- **Ficha do contato**: modelos de mensagem (1º contato, retorno, marcar conversa, pós-conversa, proposta), etapa, responsável, resposta do cliente, lembrete de retorno, reunião, notas e histórico.
- **Projetos**: briefing, escopo, tarefas detalhadas com checklist e cópia rápida.

## Supabase

`supabase/schema.sql` cria `members`, `contacts` e `projects` com RLS: só usuários logados cujo e-mail está em `members` leem e escrevem. As mudanças chegam em tempo real para a outra pessoa.

Para ligar, coloque a chave publicável (Project Settings › API Keys) em `config.js`. Sem a chave, o site roda em modo demonstração, salvando no navegador.

Para liberar alguém: `insert into members (email, name) values ('email@exemplo.com', 'Jeyce');`

## Rodar local

```sh
python -m http.server 4173 --directory .
```
