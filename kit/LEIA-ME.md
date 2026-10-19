# Kit de início · empresa de sistemas para prefeituras

```
kit/
├── LEIA-ME.md
├── empresa_sem_contador.md        abrir e manter a ME sozinho, imposto com e sem pró-labore
├── contatos_prefeituras.csv       33 prefeituras: telefone, e-mail, Instagram, secretários e sinais
├── ferramentas/
│   ├── empresa.py                 livro caixa, DAS, Fator R, agenda e certidões
│   ├── radar.py                   oportunidades abertas no PNCP e contratos vencendo
│   ├── contratos_regiao.json      80 contratos de software das prefeituras (2024–2026)
│   └── .github/workflows/radar.yml   roda o radar toda segunda no GitHub
├── modelos/                       proposta, declarações, atestado e termo de dados (.docx)
└── divulgacao/
    ├── instagram.md               perfil, legendas e como prospectar
    ├── emails.md                  sequência de e-mails
    ├── posts/post_1..9.png        9 posts prontos (1080 x 1350)
    ├── posts_fonte.html           fonte dos posts, para trocar o nome
    ├── folha_seletivo.html        PDF de uma página: edite e imprima como PDF
    └── folha_seletivo_exemplo.pdf
```

## Ferramentas (precisa só de Python 3)

```bash
cd ferramentas

# Radar
python3 radar.py                    # o que está com proposta aberta hoje na região e tem a ver com software ou seleção
python3 radar.py --novas 14         # o que foi publicado nos últimos 14 dias
python3 radar.py --vencimentos 120  # contratos de software que vencem em 120 dias (hora de se apresentar)
python3 radar.py --tudo             # tudo que está aberto na região, sem filtro

# Caderno da empresa (rode numa pasta só sua: os dados ficam em CSV ali)
python3 empresa.py iniciar 2026-11 "Oiticica Tecnologia Ltda" 00.000.000/0001-00
python3 empresa.py receita 2026-12 3000 "Seletivo piloto" --nf 1
python3 empresa.py recebido 1 2027-02-10
python3 empresa.py despesa 2026-12-05 89.90 "Servidor"
python3 empresa.py das 2026-12
python3 empresa.py comparar 2027-01 1621
python3 empresa.py caixa 2027
python3 empresa.py agenda
python3 empresa.py certidao federal 2026-11-03
python3 empresa.py certidoes
```

O portal de compras às vezes responde "muitas requisições" (erro 429). O radar espera e tenta de novo; se ainda faltar alguma página, rode outra vez mais tarde.

**Radar automático:** crie um repositório privado no GitHub, coloque o conteúdo de `ferramentas/` (com a pasta `.github`), e o radar roda toda segunda às 7h. O resultado aparece na aba Actions, no resumo da execução.

## Trocar o nome

O nome Oiticica aparece nos posts e no PDF. Para trocar, edite `posts_fonte.html` e `folha_seletivo.html` (procure por "Oiticica"), abra no Chrome e salve de novo. Os posts podem ser recortados com a ferramenta de captura do navegador (F12 › Ctrl+Shift+P › "Capture node screenshot" em cada `section`).
