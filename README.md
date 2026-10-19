# Rota — Kellyson & Jeyce

Protótipo de interface estática para organizar contatos e projetos. Destino previsto: GitHub Pages; Supabase será integrado em etapa posterior.

## Abrir

```sh
python -m http.server 4173 --bind 127.0.0.1
```

Acesse http://127.0.0.1:4173/#inicio.

## Demonstração

- 85 contatos e mensagens do CSV exportado do Miro, com os status originais normalizados.
- 6 aguardando resposta, 2 sem interesse, 1 reunião marcada, 76 a enviar.
- Nenhuma data ou pessoa responsável foi inferida.
- Alterações ficam no localStorage deste navegador; não há sincronização ou autenticação.
- Abrir o canal copia a mensagem e abre o aplicativo/site. O envio deve ser marcado manualmente.
- Projetos não são inventados: o exemplo LabDemo só aparece quando solicitado pelo botão da tela.
- Prefeituras e documentos permanecem separados da prospecção privada.
- Menus personalizados com cores, ícones e controle por teclado; cartões de contatos em telas pequenas.

## Arquivos

- index.html: estrutura.
- style.css: estilos e responsividade.
- app.js: navegação e interações locais.
- selects.js: menus personalizados acessíveis.
- leads.js: dados de demonstração importados do Miro.
- data.js: contatos governamentais do kit.
- kit/: materiais originais.

## Verificação

Fluxos exercitados no Chrome headless: início, seleção de status, cópia (Clipboard API simulada), criação de contato, persistência local, marcação de envio, fila sem resposta, tarefas e projetos entregues. Verificada ausência de transbordamento horizontal da página em 390, 768 e 1024 px. Abertura real de canais e envio externo não foram executados pelos testes.

## Detalhamento de projetos e tarefas

Projetos incluem cliente, responsável, prazo, briefing, escopo, entrega, links e notas. Notas e escopo podem ser editados diretamente no projeto com salvamento local automático. Tarefas possuem descrição, responsável, solicitante, prazo, prioridade, entrega esperada, checklist, referências e notas; use Detalhar para editar. As ações de cópia incluem o briefing, as notas, uma tarefa ou o projeto completo com todas as tarefas. Alterações ainda não salvas nos formulários também podem ser copiadas.

## Publicação

O GitHub Actions publica a branch `main` no GitHub Pages. Não é necessário instalar dependências para servir o site. Os arquivos são estáticos, com caminhos relativos e navegação por hash, compatíveis com o endereço do repositório no Pages. O workflow valida o JavaScript antes de publicar.

O site usa dados de demonstração e armazenamento local do navegador. O Supabase ainda não está conectado.
