                      
"""
Caderno da empresa: livro caixa, DAS do Simples (Anexo III/V com Fator R), agenda de obrigações e certidões.
Feito para uma ME de software no Simples Nacional, sem empregados, tocada pelo próprio dono.

Pense nele como o caderno que um contador manteria, só que em CSV na sua máquina:
cada linha que você registra é uma folha do caderno, e os comandos fazem as contas que o contador faria.

Comandos (rode na pasta onde quer guardar os dados):
  python3 empresa.py iniciar 2026-11 "Nome da Empresa" 00.000.000/0001-00
  python3 empresa.py receita 2026-12 3000 "Seletivo PSS 001/2027 - Alexandria" --nf 1 --recebido 2027-02-10
  python3 empresa.py despesa 2026-12-05 89.90 "Servidor VPS dezembro"
  python3 empresa.py prolabore 2026-12 1621
  python3 empresa.py das 2026-12              -> quanto pagar de DAS (e INSS do pró-labore) e até quando
  python3 empresa.py comparar 2026-12 1621    -> Anexo V sem pró-labore x Anexo III com pró-labore
  python3 empresa.py caixa 2026               -> livro caixa do ano, mês a mês (obrigatório: LC 123, art. 26, §2º)
  python3 empresa.py agenda 2026-12           -> o que vence neste mês
  python3 empresa.py certidao federal 2026-11-03          -> registra a emissão (validade padrão conhecida)
  python3 empresa.py certidao municipal 2026-11-03 2027-01-02   -> registra com validade impressa na certidão
  python3 empresa.py certidoes                -> o que está vencido ou vence em 15 dias

Não substitui orientação contábil. As tabelas são as da LC 123/2006 (Anexos III e V) em vigor em out/2026.
"""
import csv, json, sys
from datetime import date, datetime, timedelta
from pathlib import Path

PASTA = Path.cwd()
CFG = PASTA / "empresa.json"
RECEITAS = PASTA / "receitas.csv"                                                                    
DESPESAS = PASTA / "despesas.csv"                         
FOLHA = PASTA / "prolabore.csv"                                              
CERT = PASTA / "certidoes.json"

                                                                               
ANEXO_III = [(180000, .06, 0), (360000, .112, 9360), (720000, .135, 17640), (1800000, .16, 35640), (3600000, .21, 125640), (4800000, .33, 648000)]
ANEXO_V = [(180000, .155, 0), (360000, .18, 4500), (720000, .195, 9900), (1800000, .205, 17100), (3600000, .23, 62100), (4800000, .305, 540000)]
INSS_SOCIO = .11
SALARIO_MINIMO = 1621.00                                

VALIDADE_PADRAO = {                                                               
    "federal": 180,                                                            
    "fgts": 30,                                                       
    "trabalhista": 180,                
}
LINKS_CERT = {
    "federal": "https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir",
    "fgts": "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf",
    "trabalhista": "https://cndt-certidao.tst.jus.br/inicio.faces",
    "estadual": "Secretaria da Fazenda do RN (set.rn.gov.br), Certidão Negativa de Débitos",
    "municipal": "Secretaria de Tributação de Pau dos Ferros / tributosmunicipais.com.br",
    "falencia": "https://www.tjrn.jus.br (certidão de distribuição cível - falência e recuperação)",
}


                                  
def brl(v):
    s = f"{abs(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-R$ " if v < 0 else "R$ ") + s

def pct(v):
    return f"{v * 100:.2f}%".replace(".", ",")

def ler_csv(arq):
    if not arq.exists():
        return []
    with open(arq, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def anexar_csv(arq, campos, linha):
    novo = not arq.exists()
    with open(arq, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        if novo:
            w.writeheader()
        w.writerow(linha)

def mes_add(ym, n):
    a, m = map(int, ym.split("-"))
    t = a * 12 + (m - 1) + n
    return f"{t // 12:04d}-{t % 12 + 1:02d}"

def cfg():
    if not CFG.exists():
        sys.exit("Rode primeiro: python3 empresa.py iniciar AAAA-MM \"Nome\" CNPJ  (AAAA-MM = mês de abertura do CNPJ)")
    return json.loads(CFG.read_text(encoding="utf-8"))

def receita_mes(ym):
    return sum(float(r["valor"]) for r in ler_csv(RECEITAS) if r["competencia"] == ym)

def folha_mes(ym):
    return sum(float(r["valor"]) for r in ler_csv(FOLHA) if r["competencia"] == ym)


                                        
def acumulado_12(ym, func, inicio):
    """Soma dos 12 meses anteriores ao período, com a regra de início de atividade (LC 123, art. 18, §2º):
    no 1º mês usa o próprio mês x 12; do 2º ao 12º mês usa a média dos meses anteriores x 12."""
    meses_ativos = 0
    m = inicio
    while m < ym:
        meses_ativos += 1
        m = mes_add(m, 1)
    if meses_ativos == 0:
        return func(ym) * 12, "1º mês de atividade: receita do mês x 12"
    anteriores = [mes_add(ym, -i) for i in range(1, min(12, meses_ativos) + 1)]
    soma = sum(func(x) for x in anteriores)
    if meses_ativos < 12:
        return soma / meses_ativos * 12, f"início de atividade: média de {meses_ativos} mês(es) x 12"
    return soma, "soma dos 12 meses anteriores"

def aliquota_efetiva(rbt12, tabela):
    for limite, nom, ded in tabela:
        if rbt12 <= limite:
            if rbt12 <= 0:
                return nom
            return (rbt12 * nom - ded) / rbt12
    raise SystemExit("Receita acima do limite do Simples (R$ 4,8 milhões).")

def calcular_das(ym, prolabore_hipotetico=None):
    c = cfg()
    inicio = c["inicio"]
    rbt12, regra = acumulado_12(ym, receita_mes, inicio)
    if prolabore_hipotetico is None:
        folha12, _ = acumulado_12(ym, folha_mes, inicio)
    else:
        folha12, _ = acumulado_12(ym, lambda m: prolabore_hipotetico, inicio)
    fator_r = (folha12 / rbt12) if rbt12 > 0 else 0
    anexo = "III" if fator_r >= 0.28 else "V"
    tabela = ANEXO_III if anexo == "III" else ANEXO_V
    aliq = aliquota_efetiva(rbt12, tabela)
    rec = receita_mes(ym)
    das = rec * aliq
    return {"ym": ym, "receita": rec, "rbt12": rbt12, "regra": regra, "folha12": folha12, "fator_r": fator_r,
            "anexo": anexo, "aliquota": aliq, "das": das, "vence": f"{mes_add(ym, 1)}-20"}


                                
def cmd_iniciar(args):
    ym, nome, cnpj = args[0], args[1], args[2] if len(args) > 2 else ""
    CFG.write_text(json.dumps({"inicio": ym, "nome": nome, "cnpj": cnpj}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Empresa registrada. Início de atividade: {ym}. Dados ficam nesta pasta ({PASTA}).")

def opt(args, nome, padrao=""):
    return args[args.index(nome) + 1] if nome in args and args.index(nome) + 1 < len(args) else padrao

def cmd_receita(args):
    ym, valor, desc = args[0], float(args[1].replace(",", ".")), args[2]
    anexar_csv(RECEITAS, ["competencia", "valor", "descricao", "nf", "recebido"],
               {"competencia": ym, "valor": f"{valor:.2f}", "descricao": desc, "nf": opt(args, "--nf"), "recebido": opt(args, "--recebido")})
    print(f"Receita de {brl(valor)} registrada em {ym}.")

def cmd_recebido(args):
    nf, data = args[0], args[1]
    linhas = ler_csv(RECEITAS)
    for l in linhas:
        if l["nf"] == nf:
            l["recebido"] = data
    with open(RECEITAS, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["competencia", "valor", "descricao", "nf", "recebido"])
        w.writeheader(); w.writerows(linhas)
    print(f"NF {nf} marcada como recebida em {data}.")

def cmd_despesa(args):
    data, valor, desc = args[0], float(args[1].replace(",", ".")), args[2]
    anexar_csv(DESPESAS, ["data", "valor", "descricao"], {"data": data, "valor": f"{valor:.2f}", "descricao": desc})
    print(f"Despesa de {brl(valor)} registrada em {data}.")

def cmd_prolabore(args):
    ym, valor = args[0], float(args[1].replace(",", "."))
    if valor < SALARIO_MINIMO:
        print(f"Atenção: pró-labore abaixo do salário mínimo ({brl(SALARIO_MINIMO)}) não é aceito como base do INSS.")
    anexar_csv(FOLHA, ["competencia", "valor"], {"competencia": ym, "valor": f"{valor:.2f}"})
    print(f"Pró-labore de {brl(valor)} em {ym}. INSS a recolher (11%): {brl(valor * INSS_SOCIO)} até o dia 20 do mês seguinte.")

def cmd_das(args):
    r = calcular_das(args[0])
    inss = folha_mes(args[0]) * INSS_SOCIO
    print(f"\nDAS de {r['ym']}  (pagar até {r['vence']}; se cair em fim de semana, o PGDAS-D mostra a data certa)")
    print(f"  Receita do mês ............ {brl(r['receita'])}")
    print(f"  Receita de 12 meses (RBT12) {brl(r['rbt12'])}   [{r['regra']}]")
    print(f"  Folha de 12 meses ......... {brl(r['folha12'])}")
    print(f"  Fator R ................... {pct(r['fator_r'])}  -> Anexo {r['anexo']}" + ("" if r["anexo"] == "III" else "  (abaixo de 28%)"))
    print(f"  Alíquota efetiva .......... {pct(r['aliquota'])}")
    print(f"  DAS ....................... {brl(r['das'])}")
    if inss:
        print(f"  INSS do pró-labore (DARF) . {brl(inss)}  (gerado pela DCTFWeb)")
    print(f"  Total de impostos do mês .. {brl(r['das'] + inss)}\n")
    print("  Declare no PGDAS-D: https://www8.receita.fazenda.gov.br/SimplesNacional/  (mesmo com receita zero)")

def cmd_comparar(args):
    ym = args[0]
    pl = float(args[1]) if len(args) > 1 else SALARIO_MINIMO
    sem = calcular_das(ym, prolabore_hipotetico=0)
    com = calcular_das(ym, prolabore_hipotetico=pl)
    inss = pl * INSS_SOCIO
    print(f"\n{ym} · receita do mês {brl(sem['receita'])}")
    print(f"  Sem pró-labore: Anexo {sem['anexo']} · DAS {brl(sem['das'])}")
    print(f"  Com pró-labore de {brl(pl)}: Anexo {com['anexo']} · DAS {brl(com['das'])} + INSS {brl(inss)} = {brl(com['das'] + inss)}")
    melhor = "SEM pró-labore" if sem["das"] < com["das"] + inss else "COM pró-labore"
    print(f"  Mais barato neste mês: {melhor}.  (A conta supõe o mesmo pró-labore desde a abertura: o Fator R olha os 12 meses anteriores.)")
    print("  Lembrete: sócio que trabalha sem pró-labore é tema controverso na Receita (Solução de Consulta COSIT 228/2023);")
    print("  o INSS do pró-labore também conta para a sua aposentadoria e auxílio-doença.\n")

def cmd_caixa(args):
    ano = args[0]
    rec = [r for r in ler_csv(RECEITAS) if r.get("recebido", "").startswith(ano)]
    des = [d for d in ler_csv(DESPESAS) if d["data"].startswith(ano)]
    print(f"\nLivro caixa {ano} (entradas pela data de recebimento; saídas pela data de pagamento)\n")
    print(f"{'mês':<8}{'entradas':>14}{'saídas':>14}{'saldo':>14}{'lucro isento*':>16}")
    tot_e = tot_s = 0
    for m in range(1, 13):
        ym = f"{ano}-{m:02d}"
        e = sum(float(r["valor"]) for r in rec if r["recebido"][:7] == ym)
        s = sum(float(d["valor"]) for d in des if d["data"][:7] == ym)
        das = calcular_das(ym)["das"] if CFG.exists() and ym >= cfg()["inicio"] else 0
        isento = max(0, receita_mes(ym) * .32 - das)
        tot_e += e; tot_s += s
        print(f"{ym:<8}{brl(e):>14}{brl(s):>14}{brl(e - s):>14}{brl(isento):>16}")
    print(f"{'total':<8}{brl(tot_e):>14}{brl(tot_s):>14}{brl(tot_e - tot_s):>14}")
    print("\n* Quanto você pode retirar como lucro sem imposto, sem contabilidade completa: 32% da receita do mês menos o DAS (LC 123, art. 14).")
    print("  Guarde notas e comprovantes de tudo; o livro caixa é obrigatório.\n")

def cmd_agenda(args):
    ym = args[0] if args else date.today().strftime("%Y-%m")
    tem_pl = folha_mes(mes_add(ym, -1)) > 0
    ant = mes_add(ym, -1)
    print(f"\nObrigações de {ym}\n")
    if tem_pl:
        print(f"  dia 15  eSocial: S-1200, S-1210 e S-1299 do pró-labore de {ant}")
    print(f"  dia 20  PGDAS-D e DAS de {ant} (declare mesmo com receita zero)")
    if tem_pl:
        print(f"  dia 20  DARF do INSS do pró-labore de {ant} (transmita a DCTFWeb antes para gerar a guia)")
        print(f"  último dia útil  DCTFWeb de {ant}")
    m = int(ym[5:])
    if m == 1:
        print("  janeiro  Atualize SALARIO_MINIMO neste arquivo; confira no PGDAS-D as novidades do ano")
    if m == 3:
        print("  até 31/03  DEFIS do ano anterior (a partir de 2027 vira informação anual dentro do PGDAS-D: confira no Portal)")
    if m in (4, 5):
        print("  até o prazo da Receita  IRPF da pessoa física (declare pró-labore e lucros recebidos)")
    print("  sempre  Certidões válidas antes de mandar qualquer proposta (python3 empresa.py certidoes)\n")

def cmd_certidao(args):
    tipo, emissao = args[0].lower(), args[1]
    vence = args[2] if len(args) > 2 else None
    if not vence:
        if tipo not in VALIDADE_PADRAO:
            sys.exit(f"Informe a data de validade impressa na certidão: python3 empresa.py certidao {tipo} {emissao} AAAA-MM-DD")
        vence = (datetime.strptime(emissao, "%Y-%m-%d") + timedelta(days=VALIDADE_PADRAO[tipo])).strftime("%Y-%m-%d")
    dados = json.loads(CERT.read_text(encoding="utf-8")) if CERT.exists() else {}
    dados[tipo] = {"emissao": emissao, "vence": vence}
    CERT.write_text(json.dumps(dados, indent=1), encoding="utf-8")
    print(f"Certidão {tipo}: emitida em {emissao}, vale até {vence}.")

def cmd_certidoes(args):
    dados = json.loads(CERT.read_text(encoding="utf-8")) if CERT.exists() else {}
    hoje = date.today()
    print("\nCertidões (exigidas em toda contratação pública)\n")
    for tipo, link in LINKS_CERT.items():
        d = dados.get(tipo)
        if not d:
            print(f"  {tipo:<12} NÃO REGISTRADA   emitir em: {link}")
            continue
        dias = (datetime.strptime(d["vence"], "%Y-%m-%d").date() - hoje).days
        estado = "VENCIDA" if dias < 0 else ("vence em %d dias" % dias if dias <= 15 else "ok (%d dias)" % dias)
        print(f"  {tipo:<12} {estado:<18} válida até {d['vence']}   {link if dias <= 15 else ''}")
    print()


COMANDOS = {"iniciar": cmd_iniciar, "receita": cmd_receita, "recebido": cmd_recebido, "despesa": cmd_despesa,
            "prolabore": cmd_prolabore, "das": cmd_das, "comparar": cmd_comparar, "caixa": cmd_caixa,
            "agenda": cmd_agenda, "certidao": cmd_certidao, "certidoes": cmd_certidoes}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMANDOS:
        print(__doc__)
        sys.exit(0)
    COMANDOS[sys.argv[1]](sys.argv[2:])
