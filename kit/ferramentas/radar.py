                      
"""
Radar de oportunidades nas prefeituras da região de Pau dos Ferros (Portal Nacional de Contratações Públicas).

O que faz:
  python3 radar.py                 -> contratações com proposta ABERTA hoje nos 34 municípios, filtradas por palavras de software/seleção
  python3 radar.py --tudo          -> as mesmas, sem filtro de palavras (tudo que está aberto na região)
  python3 radar.py --novas 14      -> o que foi PUBLICADO nos últimos 14 dias (dispensa, pregão, credenciamento...), filtrado
  python3 radar.py --vencimentos 120  -> contratos de software da região que vencem nos próximos 120 dias (lista contratos_regiao.json)

Só usa a biblioteca padrão do Python 3.8+. Salva um CSV com o resultado na pasta atual.
Pense nele como um vigia: você roda uma vez por semana (ou deixa o GitHub rodar sozinho, ver radar.yml) e ele avisa
quando uma prefeitura da região abriu algo que tem a ver com o que você vende.
"""
import csv, json, sys, time, unicodedata, urllib.parse, urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

API = "https://pncp.gov.br/api/consulta/v1"

                                                                             
MUNICIPIOS = {
    "2409407": "Pau dos Ferros", "2412500": "São Miguel", "2400505": "Alexandria", "2409308": "Patu",
    "2414100": "Tenente Ananias", "2414506": "Umarizal", "2407005": "Luís Gomes", "2407401": "Martins",
    "2407302": "Marcelino Vieira", "2410207": "Portalegre", "2403202": "Doutor Severiano", "2400901": "Antônio Martins",
    "2403301": "Encanto", "2406007": "José da Penha", "2410504": "Rafael Fernandes", "2400604": "Almino Afonso",
    "2413557": "Serrinha dos Pintos", "2402907": "Coronel João Pessoa", "2411908": "São Francisco do Oeste",
    "2410801": "Riacho de Santana", "2404002": "Frutuoso Gomes", "2408607": "Paraná", "2407252": "Major Sales",
    "2408409": "Olho d'Água do Borges", "2406908": "Lucrécia", "2414753": "Venha-Ver", "2410009": "Pilões",
    "2400406": "Água Nova", "2410603": "Rafael Godeiro", "2410702": "Riacho da Cruz", "2403905": "Francisco Dantas",
    "2413805": "Taboleiro Grande", "2405900": "João Dias", "2414902": "Viçosa",
}

                                                                                     
PALAVRAS = [
    "software", "sistema informatizado", "sistema web", "sistema de gestao", "sistemas integrados", "sistema integrado",
    "licenca de uso", "locacao de software", "locacao de sistema", "cessao de uso", "cessao de direito de uso",
    "plataforma digital", "plataforma web", "plataforma online", "plataforma de gestao", "aplicativo",
    "tecnologia da informacao", "processo seletivo", "selecao publica simplificada", "inscricoes online", "inscricao online",
    "sistema de inscricao", "ponto eletronico", "controle de frequencia", "gestao de frota", "controle de frota",
    "gerenciamento de frota", "ouvidoria", "e-sic", "site oficial", "site institucional", "website", "portal da transparencia",
    "hospedagem de site", "hospedagem de sistema", "data center", "matricula online", "aldir blanc", "pnab",
    "banca organizadora", "banca examinadora", "organizacao de concurso", "diario oficial eletronico",
]
                                   
FORA = ["sistema de abastecimento de agua", "sistema de esgoto", "cameras", "cftv", "pecas", "pneus", "combustive",
        "medicamento", "merenda", "generos alimenticios", "atracoes musicais", "manutencao preventiva e corretiva dos veiculos"]

MODALIDADES = {4: "Concorrência eletrônica", 6: "Pregão eletrônico", 7: "Pregão presencial", 8: "Dispensa",
               9: "Inexigibilidade", 12: "Credenciamento"}


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", (s or "").lower()) if unicodedata.category(c) != "Mn")


def interessa(texto):
    t = norm(texto)
    return any(p in t for p in PALAVRAS) and not any(f in t for f in FORA)


def get(path, params, tentativas=4):
    """Busca uma página da API. Tenta de novo quando o portal responde 'muitas requisições'."""
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(url, timeout=90) as r:
                if r.status == 204:
                    return None
                corpo = r.read()
                return json.loads(corpo) if corpo else None
        except Exception as e:
            erro = e
            time.sleep(5 + i * 10)
    print(f"  aviso: falhou {url} ({erro})", file=sys.stderr)
    return None


def todas_paginas(path, params):
    """Junta todas as páginas de uma consulta (50 itens por página)."""
    itens, pagina = [], 1
    while True:
        d = get(path, {**params, "pagina": pagina, "tamanhoPagina": 50})
        if not d or not d.get("data"):
            break
        itens += d["data"]
        if pagina >= d.get("totalPaginas", 1):
            break
        pagina += 1
        time.sleep(1)
    return itens


def link(c):
    o = c.get("orgaoEntidade", {})
    return f"https://pncp.gov.br/app/editais/{o.get('cnpj')}/{c.get('anoCompra')}/{c.get('sequencialCompra')}"


def linha(c):
    u = c.get("unidadeOrgao", {})
    fim = (c.get("dataEncerramentoProposta") or "")[:16].replace("T", " ")
    return {
        "municipio": MUNICIPIOS.get(u.get("codigoIbge"), u.get("municipioNome")),
        "orgao": c.get("orgaoEntidade", {}).get("razaoSocial"),
        "modalidade": c.get("modalidadeNome"),
        "objeto": " ".join((c.get("objetoCompra") or "").split())[:240],
        "valor_estimado": c.get("valorTotalEstimado"),
        "propostas_ate": fim,
        "publicado": (c.get("dataPublicacaoPncp") or "")[:10],
        "link": link(c),
    }


def abertas(filtrar=True):
    """Tudo do RN com proposta aberta; fica só com os 34 municípios."""
    hoje = date.today()
    itens = todas_paginas("/contratacoes/proposta", {"dataFinal": (hoje + timedelta(days=365)).strftime("%Y%m%d"), "uf": "RN"})
    regiao = [c for c in itens if c.get("unidadeOrgao", {}).get("codigoIbge") in MUNICIPIOS]
    return [linha(c) for c in regiao if not filtrar or interessa(c.get("objetoCompra"))]


def novas(dias, filtrar=True):
    """Publicadas nos últimos N dias, por modalidade, no RN; fica só com os 34 municípios."""
    fim = date.today()
    ini = fim - timedelta(days=dias)
    def uma(mod):
        return todas_paginas("/contratacoes/publicacao", {"dataInicial": ini.strftime("%Y%m%d"), "dataFinal": fim.strftime("%Y%m%d"),
                                                            "codigoModalidadeContratacao": mod, "uf": "RN"})
    listas = []
    for mod in MODALIDADES:                                                                      
        listas.append(uma(mod))
        time.sleep(2)
    itens = [c for l in listas for c in l if c.get("unidadeOrgao", {}).get("codigoIbge") in MUNICIPIOS]
    return [linha(c) for c in itens if not filtrar or interessa(c.get("objetoCompra"))]


def vencimentos(dias):
    """Contratos de software conhecidos da região (contratos_regiao.json) que vencem nos próximos N dias."""
    arq = Path(__file__).with_name("contratos_regiao.json")
    contratos = json.loads(arq.read_text(encoding="utf-8"))
    hoje, limite = date.today(), date.today() + timedelta(days=dias)
    saida = []
    for c in contratos:
        if not c.get("fim"):
            continue
        fim = datetime.strptime(c["fim"][:10], "%Y-%m-%d").date()
        if hoje <= fim <= limite:
            saida.append({"municipio": c["municipio"], "categoria": c["categoria"], "fornecedor": c["fornecedor"],
                          "valor": c["valor"], "vence": c["fim"][:10], "dias": (fim - hoje).days, "objeto": c["objeto"][:200]})
    return sorted(saida, key=lambda x: x["vence"])


def mostrar(rotulo, linhas, campos):
    print(f"\n{rotulo}: {len(linhas)} encontrado(s)\n")
    for l in linhas:
        print(" · ".join(str(l[k]) for k in campos if l.get(k) not in (None, "")))
        print()
    if linhas:
        nome = f"radar_{date.today():%Y%m%d}_{rotulo.split()[0].lower()}.csv"
        with open(nome, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(linhas[0].keys()))
            w.writeheader()
            w.writerows(linhas)
        print(f"Salvo em {nome}")


if __name__ == "__main__":
    args = sys.argv[1:]
    filtrar = "--tudo" not in args
    if "--vencimentos" in args:
        i = args.index("--vencimentos")
        dias = int(args[i + 1]) if len(args) > i + 1 and args[i + 1].isdigit() else 120
        mostrar(f"Vencimentos nos próximos {dias} dias", vencimentos(dias), ["vence", "municipio", "categoria", "fornecedor", "valor"])
    elif "--novas" in args:
        i = args.index("--novas")
        dias = int(args[i + 1]) if len(args) > i + 1 and args[i + 1].isdigit() else 14
        mostrar(f"Novas publicações dos últimos {dias} dias", novas(dias, filtrar),
                ["publicado", "municipio", "modalidade", "objeto", "valor_estimado", "link"])
    else:
        mostrar("Abertas agora", abertas(filtrar), ["propostas_ate", "municipio", "modalidade", "objeto", "valor_estimado", "link"])
