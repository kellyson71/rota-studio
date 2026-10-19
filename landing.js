const PROJECTS = [
  {
    id: "sema", name: "SEMA", full: "Protocolo de alvará ambiental", client: "Secretaria de Meio Ambiente · Pau dos Ferros", year: "2025", color: "g",
    url: "https://sema.protocolosead.com/", host: "sema.protocolosead.com",
    problem: "Pedidos de licença ambiental chegavam no balcão, com documentos em papel e boleto feito à mão.",
    solution: ["Requerimento online em três etapas, com busca pelo tipo de serviço", "Equipe técnica analisa, emite parecer e o alvará sai com assinatura digital", "Cidadão acompanha o andamento e recebe o boleto por e-mail"],
    tags: ["PHP", "MySQL", "assinatura digital"]
  },
  {
    id: "demutran", name: "DEMUTRAN", full: "Portal do trânsito", client: "Departamento Municipal de Trânsito · Pau dos Ferros", year: "2024", color: "b",
    url: "https://demutranpaudosferros.com.br/", host: "demutranpaudosferros.com.br",
    problem: "Defesa de multa, recurso e credencial de vaga especial exigiam ir até o órgão.",
    solution: ["Defesa de autuação e recurso à JARI pela internet", "Credencial de vaga especial para PCD e idoso online", "Notícias e campanhas do trânsito no mesmo portal"],
    tags: ["PHP", "painel administrativo", "notícias"]
  },
  {
    id: "protocolo", name: "Protocolo SEAD", full: "Protocolo dos servidores", client: "Secretaria de Administração · Pau dos Ferros", year: "2025", color: "r",
    url: "https://protocolosead.com/", host: "protocolosead.com",
    problem: "Férias, licenças e requerimentos dos servidores andavam em papel entre as secretarias.",
    solution: ["Servidor entra com matrícula e abre o protocolo de casa", "A secretaria direciona, responde e o servidor vê a resposta", "Regras específicas para cada tipo de pedido"],
    tags: ["PHP", "login por matrícula", "e-mail"]
  },
  {
    id: "secom", name: "SECOM", full: "Central de demandas da comunicação", client: "Secretaria de Comunicação · Pau dos Ferros", year: "2026", color: "y",
    url: "https://secom.protocolosead.com/", host: "secom.protocolosead.com",
    problem: "Pedidos de cobertura, arte e gabinete chegavam soltos pelo WhatsApp.",
    solution: ["Um formulário só para três equipes", "Número para acompanhar a demanda", "Painel para a equipe organizar e entregar"],
    tags: ["PHP", "acessibilidade", "Docker"]
  },
  {
    id: "estagio", name: "Estágio PdF", full: "Credenciamento de estagiários", client: "Secretaria de Administração · Pau dos Ferros", year: "2026", color: "b",
    url: "http://estagiopaudosferros.com/", host: "estagiopaudosferros.com",
    problem: "O banco de talentos de estágio dependia de fichas preenchidas à mão.",
    solution: ["Cadastro em seções, com documentos e dados acadêmicos", "Ficha gerada em PDF automaticamente", "Painel para a SEAD consultar os inscritos"],
    tags: ["PHP", "PDF", "formulário em etapas"]
  },
  {
    id: "integral", name: "Integral Clínica", full: "Agenda e prontuário da clínica", client: "Fisioterapia e estética · Pau dos Ferros", year: "2026", color: "r",
    url: "https://rafaelamagalhaes.com.br/", host: "rafaelamagalhaes.com.br",
    problem: "Agenda no caderno, ficha de avaliação em papel e confirmação um por um no WhatsApp.",
    solution: ["Paciente vê horários livres e agenda sozinho", "Ficha de avaliação com assinatura no iPad", "Avisos automáticos por WhatsApp e controle das sessões"],
    tags: ["PHP", "MySQL", "WhatsApp", "notificações"]
  },
  {
    id: "vfik", name: "VFIK", full: "Gestão de obras e página profissional", client: "VFIK Projetos e Construções", year: "2026", color: "y",
    url: "https://vfikprojetoseconstrucoes.com.br/", host: "vfikprojetoseconstrucoes.com.br",
    problem: "Orçamentos, contratos e diário de obra espalhados em planilhas.",
    solution: ["Página de contato da engenheira com WhatsApp, Instagram e e-mail", "API própria para obras, orçamentos e contratos", "Diário de obra organizado por projeto"],
    tags: ["PHP", "API REST", "PostgreSQL"]
  }
];

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

$("#toc").innerHTML = PROJECTS.map((p, i) => `
  <li class="reveal" style="--d:${i * 50}ms">
    <a href="#caso-${p.id}" data-peek="assets/shots/${p.id}.webp" class="c-${p.color}">
      <span class="toc-num">${String(i + 1).padStart(2, "0")}</span>
      <span class="toc-name"><strong>${esc(p.name)}</strong><small>${esc(p.full)}</small></span>
      <span class="toc-lead" aria-hidden="true"></span>
      <span class="toc-client">${esc(p.client)}</span>
      <span class="toc-year">${p.year}</span>
    </a>
  </li>`).join("");

$("#casos").innerHTML = PROJECTS.map((p, i) => `
  <article class="case reveal c-${p.color} ${i % 2 ? "flip" : ""}" id="caso-${p.id}">
    <div class="case-media">
      <figure class="win"><div class="bar"><i></i><i></i><i></i><span>${esc(p.host)}</span></div><img src="assets/shots/${p.id}.webp" alt="Tela de ${esc(p.name)}" loading="lazy" width="1200" height="750"></figure>
      <figure class="phone"><img src="assets/shots/${p.id}-m.webp" alt="${esc(p.name)} no celular" loading="lazy" width="480" height="1039"></figure>
    </div>
    <div class="case-text">
      <p class="case-num">${String(i + 1).padStart(2, "0")} / ${String(PROJECTS.length).padStart(2, "0")}</p>
      <h3>${esc(p.name)}<small>${esc(p.full)}</small></h3>
      <p class="case-client">${esc(p.client)}</p>
      <div class="case-before"><span>Antes</span>${esc(p.problem)}</div>
      <ul class="case-after">${p.solution.map(s => `<li>${esc(s)}</li>`).join("")}</ul>
      <div class="case-foot"><div class="tags">${p.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div><a class="btn" href="${p.url}" target="_blank" rel="noopener">Ver no ar ↗</a></div>
    </div>
  </article>`).join("");

const peek = $("#peek");
const peekImg = $("img", peek);
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
if (finePointer) {
  document.querySelectorAll("[data-peek]").forEach(a => {
    a.addEventListener("mouseenter", () => { peekImg.src = a.dataset.peek; peek.classList.add("on"); });
    a.addEventListener("mouseleave", () => peek.classList.remove("on"));
  });
  let x = 0, y = 0, px = 0, py = 0;
  document.addEventListener("mousemove", e => { x = e.clientX; y = e.clientY; });
  (function follow() {
    px += (x - px) * 0.18;
    py += (y - py) * 0.18;
    peek.style.transform = `translate(${px + 24}px, ${py - 120}px) rotate(${Math.max(-6, Math.min(6, (x - px) * 0.08))}deg)`;
    requestAnimationFrame(follow);
  })();
}

const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

const wins = [...document.querySelectorAll(".stack .win")];
let front = 0;
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  setInterval(() => {
    front = (front + 1) % wins.length;
    wins.forEach((w, i) => { w.dataset.pos = (i - front + wins.length) % wins.length; });
  }, 3200);
}
wins.forEach((w, i) => { w.dataset.pos = i; });

$("#contact-form").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const msg = $("#form-msg");
  const data = Object.fromEntries(new FormData(form));
  const cfg = window.ROTA_CONFIG || {};
  const button = $("button", form);
  button.disabled = true;
  msg.className = "form-msg";
  msg.textContent = "Enviando…";
  try {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/inbound`, {
      method: "POST",
      headers: { apikey: cfg.supabaseKey, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name: data.name.trim(), phone: data.phone.trim(), kind: data.kind, need: data.need.trim() })
    });
    if (!res.ok) throw new Error(res.status);
    form.reset();
    msg.className = "form-msg ok";
    msg.textContent = "Recebido! A gente chama você no WhatsApp em breve.";
  } catch {
    msg.className = "form-msg err";
    msg.textContent = "Não consegui enviar agora. Tenta de novo em instantes?";
  } finally {
    button.disabled = false;
  }
});
