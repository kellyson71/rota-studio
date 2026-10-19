const PROJECTS = [
  { id: "integral", logo: "integral", name: "Integral Clínica", what: "Agendamento online e prontuário", client: "Fisioterapia e estética", year: "2026", color: "r", url: "https://rafaelamagalhaes.com.br/agendar", host: "rafaelamagalhaes.com.br/agendar", result: "A paciente escolhe o serviço e o horário sozinha. A ficha de avaliação é assinada no iPad e os avisos saem pelo WhatsApp.", tags: ["Agenda", "Assinatura digital", "WhatsApp"] },
  { id: "sema", logo: "brasao", name: "SEMA", what: "Alvará ambiental pela internet", client: "Prefeitura de Pau dos Ferros", year: "2025", color: "g", url: "https://sema.protocolosead.com/", host: "sema.protocolosead.com", result: "O pedido de licença sai do balcão. A equipe técnica emite o parecer e o alvará é assinado digitalmente.", tags: ["Protocolo", "Parecer técnico", "Assinatura digital"] },
  { id: "demutran", logo: "demutran", name: "DEMUTRAN", what: "Recursos e vaga especial online", client: "Prefeitura de Pau dos Ferros", year: "2024", color: "b", url: "https://demutranpaudosferros.com.br/", host: "demutranpaudosferros.com.br", result: "Defesa de multa, recurso à JARI e credencial de vaga especial sem precisar ir ao órgão.", tags: ["Portal", "Formulários", "Notícias"] },
  { id: "protocolo", logo: "sead", name: "Protocolo SEAD", what: "Pedidos dos servidores", client: "Prefeitura de Pau dos Ferros", year: "2025", color: "y", url: "https://protocolosead.com/", host: "protocolosead.com", result: "Férias, licenças e requerimentos abertos de casa, com resposta da secretaria no próprio sistema.", tags: ["Login por matrícula", "Painel", "E-mail"] },
  { id: "secom", logo: "brasao", name: "SECOM", what: "Central de demandas", client: "Prefeitura de Pau dos Ferros", year: "2026", color: "b", url: "https://secom.protocolosead.com/", host: "secom.protocolosead.com", result: "Pedidos de cobertura, arte e gabinete em um formulário só, com número para acompanhar.", tags: ["Demandas", "Acessibilidade", "Painel"] },
  { id: "estagio", logo: "sead", name: "Estágio PdF", what: "Credenciamento de estagiários", client: "Prefeitura de Pau dos Ferros", year: "2026", color: "g", url: "http://estagiopaudosferros.com/", host: "estagiopaudosferros.com", result: "Cadastro em etapas com documentos e ficha em PDF gerada na hora.", tags: ["Formulário em etapas", "PDF"] },
  { id: "vfik", logo: "vfik", name: "VFIK", what: "Gestão de obras", client: "Projetos e construções", year: "2026", color: "y", url: "https://vfikprojetoseconstrucoes.com.br/", host: "vfikprojetoseconstrucoes.com.br", result: "Obras, orçamentos, contratos e diário de obra organizados por projeto.", tags: ["API", "Orçamentos", "Contratos"] }
];
const SHOW = ["integral", "sema", "demutran", "secom"].map(id => PROJECTS.find(p => p.id === id));

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
if (hasGsap) document.documentElement.classList.add("motion");

$("#screens").innerHTML = SHOW.map((p, i) => `<img src="assets/shots/${p.id}.webp" alt="Tela do sistema ${esc(p.name)}" width="1200" height="750" class="${i ? "" : "on"}" ${i ? 'loading="lazy"' : ""}>`).join("");
$("#show-dots").innerHTML = SHOW.map((p, i) => `<button type="button" role="tab" aria-label="${esc(p.name)}" aria-selected="${!i}" class="${i ? "" : "on"}"><i></i></button>`).join("");

let current = 0;
let timer;
const DURATION = 4500;
function showSlide(i) {
  const p = SHOW[i];
  $$("#screens img").forEach((img, k) => img.classList.toggle("on", k === i));
  $$("#show-dots button").forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-selected", k === i); });
  const cap = $(".show-caption");
  cap.classList.remove("swap");
  void cap.offsetWidth;
  cap.classList.add("swap");
  $("#show-logo").src = `assets/logos/${p.logo}.webp`;
  $("#show-name").textContent = p.name;
  $("#show-what").textContent = p.what;
  $("#show-url").textContent = p.host;
  current = i;
}
function autoplay() {
  clearInterval(timer);
  if (reduce) return;
  timer = setInterval(() => showSlide((current + 1) % SHOW.length), DURATION);
}
$$("#show-dots button").forEach((b, i) => b.addEventListener("click", () => { showSlide(i); autoplay(); }));
document.documentElement.style.setProperty("--slide", DURATION + "ms");
autoplay();

if (fine && !reduce) {
  const show = $("#showcase");
  const frame = $(".frame", show);
  show.addEventListener("mousemove", e => {
    const r = show.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    frame.style.transform = `perspective(1400px) rotateY(${x * 6}deg) rotateX(${-y * 5}deg)`;
  });
  show.addEventListener("mouseleave", () => { frame.style.transform = ""; });
}

const rowShots = PROJECTS.map(p => `<figure><img src="assets/shots/${p.id}.webp" alt="" loading="lazy" width="1200" height="750"></figure>`).join("");
$(".g-row.r1").innerHTML = rowShots + rowShots;
$(".g-row.r2").innerHTML = [...PROJECTS].reverse().map(p => `<figure><img src="assets/shots/${p.id}.webp" alt="" loading="lazy" width="1200" height="750"></figure>`).join("").repeat(2);

$("#toc").innerHTML = PROJECTS.map((p, i) => `
  <li class="c-${p.color}">
    <button class="toc-row" type="button" aria-expanded="${!i}" aria-controls="toc-${p.id}" data-peek="assets/shots/${p.id}.webp">
      <img class="toc-logo" src="assets/logos/${p.logo}.webp" alt="" width="56" height="56" loading="lazy">
      <span class="toc-name"><strong>${esc(p.name)}</strong><small>${esc(p.what)}</small></span>
      <span class="toc-lead" aria-hidden="true"></span>
      <span class="toc-client">${esc(p.client)}</span>
      <span class="toc-year">${p.year}</span>
      <span class="toc-plus" aria-hidden="true"></span>
    </button>
    <div class="toc-body" id="toc-${p.id}" ${i ? "hidden" : ""}>
      <div class="toc-media">
        <figure class="mini-frame"><div class="bar"><i></i><i></i><i></i><span>${esc(p.host)}</span></div><img src="assets/shots/${p.id}.webp" alt="Tela de ${esc(p.name)}" loading="lazy" width="1200" height="750"></figure>
        <figure class="mini-phone"><img src="assets/shots/${p.id}-m.webp" alt="${esc(p.name)} no celular" loading="lazy" width="480" height="1039"></figure>
      </div>
      <div class="toc-info">
        <p>${esc(p.result)}</p>
        <div class="tags">${p.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>
        <a class="btn" href="${p.url}" target="_blank" rel="noopener">Ver no ar ↗</a>
      </div>
    </div>
  </li>`).join("");

$$(".toc-row").forEach(btn => btn.addEventListener("click", () => {
  const body = document.getElementById(btn.getAttribute("aria-controls"));
  const open = btn.getAttribute("aria-expanded") === "true";
  $$(".toc-row[aria-expanded=true]").forEach(b => { if (b !== btn) toggle(b, false); });
  toggle(btn, !open);
  if (!open && hasGsap) setTimeout(() => ScrollTrigger.refresh(), 450);
}));

function toggle(btn, open) {
  const body = document.getElementById(btn.getAttribute("aria-controls"));
  btn.setAttribute("aria-expanded", open);
  if (reduce || !hasGsap) { body.hidden = !open; return; }
  if (open) {
    body.hidden = false;
    gsap.fromTo(body, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.55, ease: "power3.out", clearProps: "height" });
    gsap.from($$("figure, p, .tags, .btn", body), { y: 24, opacity: 0, duration: 0.6, stagger: 0.06, ease: "power3.out", delay: 0.1 });
  } else {
    gsap.to(body, { height: 0, opacity: 0, duration: 0.35, ease: "power2.in", onComplete: () => { body.hidden = true; gsap.set(body, { clearProps: "all" }); } });
  }
}

const peek = $("#peek");
const peekImg = $("img", peek);
if (fine) {
  $$("[data-peek]").forEach(a => {
    a.addEventListener("mouseenter", () => { if (a.getAttribute("aria-expanded") === "true") return; peekImg.src = a.dataset.peek; peek.classList.add("on"); });
    a.addEventListener("mouseleave", () => peek.classList.remove("on"));
    a.addEventListener("click", () => peek.classList.remove("on"));
  });
  let x = 0, y = 0, px = 0, py = 0;
  document.addEventListener("mousemove", e => { x = e.clientX; y = e.clientY; });
  (function follow() {
    px += (x - px) * 0.16;
    py += (y - py) * 0.16;
    peek.style.transform = `translate(${px + 28}px, ${py - 110}px) rotate(${Math.max(-7, Math.min(7, (x - px) * 0.1))}deg)`;
    requestAnimationFrame(follow);
  })();
}

if (fine && !reduce) {
  $$(".magnetic").forEach(el => {
    el.addEventListener("mousemove", e => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.22}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`;
    });
    el.addEventListener("mouseleave", () => { el.style.transform = ""; });
  });
}

function splitWords(el) {
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(document.createTextNode(part));
          const outer = document.createElement("span");
          outer.className = "w";
          const inner = document.createElement("span");
          inner.textContent = part;
          outer.append(inner);
          frag.append(outer);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
  };
  walk(el);
  return $$(".w > span", el);
}

if (hasGsap && !reduce) {
  gsap.registerPlugin(ScrollTrigger);
  const heroWords = splitWords($(".hero h1"));
  gsap.timeline({ defaults: { ease: "power4.out" } })
    .from(".hero .eyebrow", { y: 16, opacity: 0, duration: 0.6 })
    .from(heroWords, { yPercent: 110, rotate: 4, duration: 0.9, stagger: 0.05 }, "-=0.3")
    .add(() => $$(".hero .mark").forEach(m => m.classList.add("on")), "-=0.3")
    .from(".hero .fade-up", { y: 26, opacity: 0, duration: 0.8, stagger: 0.1 }, "-=0.6")
    .from(".showcase", { y: 60, opacity: 0, scale: 0.94, duration: 1.1, ease: "expo.out" }, 0.35)
    .from(".trust-logos img", { scale: 0, duration: 0.5, stagger: 0.07, ease: "back.out(2)" }, "-=0.6");

  $$("h2.split").forEach(h => {
    const words = splitWords(h);
    gsap.from(words, { yPercent: 110, duration: 0.85, stagger: 0.04, ease: "power4.out", scrollTrigger: { trigger: h, start: "top 85%" } });
  });
  $$(".eyebrow:not(.hero .eyebrow)").forEach(e => gsap.from(e, { x: -20, opacity: 0, duration: 0.6, scrollTrigger: { trigger: e, start: "top 88%" } }));

  $$("[data-count]").forEach(el => {
    const end = Number(el.dataset.count);
    const obj = { v: 0 };
    gsap.to(obj, { v: end, duration: 1.6, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 90%" }, onUpdate: () => { el.textContent = Math.round(obj.v); } });
  });
  gsap.from(".numbers > div", { y: 30, opacity: 0, duration: 0.7, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: ".numbers", start: "top 90%" } });

  const mm = gsap.matchMedia();
  mm.add("(min-width: 900px)", () => {
    const items = $$(".pain-list li");
    const tl = gsap.timeline({ scrollTrigger: { trigger: ".pains", start: "top top", end: "+=" + items.length * 380, scrub: 0.6, pin: true } });
    items.forEach((li, i) => {
      tl.to(li, { opacity: 1, duration: 0.2 }, i)
        .to($(".before", li), { "--strike": "100%", color: "rgba(19,18,16,.35)", duration: 0.5 }, i + 0.1)
        .fromTo($(".after", li), { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, i + 0.45);
    });
    gsap.set(items, { opacity: 0.25 });
  });
  mm.add("(max-width: 899px)", () => {
    $$(".pain-list li").forEach(li => {
      gsap.timeline({ scrollTrigger: { trigger: li, start: "top 80%" } })
        .to($(".before", li), { "--strike": "100%", color: "rgba(19,18,16,.35)", duration: 0.5 })
        .from($(".after", li), { y: 16, opacity: 0, duration: 0.5 }, "-=0.1");
    });
  });

  gsap.to(".g-row.r1", { xPercent: -22, ease: "none", scrollTrigger: { trigger: ".gallery", start: "top bottom", end: "bottom top", scrub: true } });
  gsap.fromTo(".g-row.r2", { xPercent: -30 }, { xPercent: -8, ease: "none", scrollTrigger: { trigger: ".gallery", start: "top bottom", end: "bottom top", scrub: true } });

  gsap.from("#toc > li", { y: 40, opacity: 0, duration: 0.7, stagger: 0.07, ease: "power3.out", scrollTrigger: { trigger: "#toc", start: "top 85%" } });
  gsap.from(".service", { y: 60, opacity: 0, rotate: 2, duration: 0.8, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: ".service-grid", start: "top 85%" } });

  gsap.fromTo(".steps-line path", { strokeDashoffset: 1000 }, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ".steps-wrap", start: "top 75%", end: "bottom 55%", scrub: true } });
  $$(".steps li").forEach((li, i) => gsap.from(li, { y: 40, opacity: 0, duration: 0.6, ease: "power3.out", scrollTrigger: { trigger: ".steps-wrap", start: `top ${75 - i * 6}%` } }));

  gsap.from(".why-card", { clipPath: "inset(12% 8% 12% 8% round 40px)", duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: ".why", start: "top 80%" } });
  gsap.from(".why-list li", { x: 40, opacity: 0, duration: 0.6, stagger: 0.1, scrollTrigger: { trigger: ".why-list", start: "top 85%" } });
  gsap.from(".faq details", { y: 24, opacity: 0, duration: 0.5, stagger: 0.06, scrollTrigger: { trigger: ".faq-list", start: "top 88%" } });
  gsap.from(".contact-form", { y: 60, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: ".contact", start: "top 80%" } });

  window.addEventListener("load", () => ScrollTrigger.refresh());
} else {
  $$(".hero .mark").forEach(m => m.classList.add("on"));
  $$(".before").forEach(b => b.style.setProperty("--strike", "100%"));
}

$$(".faq details").forEach(d => d.addEventListener("toggle", () => { if (d.open) $$(".faq details").forEach(o => { if (o !== d) o.open = false; }); }));

$("#contact-form").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const msg = $("#form-msg");
  const data = Object.fromEntries(new FormData(form));
  const cfg = window.ROTA_CONFIG || {};
  const button = $("button[type=submit]", form);
  button.disabled = true;
  msg.className = "form-msg";
  msg.textContent = "Enviando…";
  try {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/inbound`, {
      method: "POST",
      headers: { apikey: cfg.supabaseKey, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ name: data.name.trim(), phone: data.phone.trim(), kind: data.kind, need: (data.need || "").trim() })
    });
    if (!res.ok) throw new Error(res.status);
    form.reset();
    msg.className = "form-msg ok";
    msg.textContent = "Recebido. Vamos chamar você no WhatsApp em breve.";
  } catch {
    msg.className = "form-msg err";
    msg.textContent = "Não foi possível enviar agora. Tente de novo em instantes.";
  } finally {
    button.disabled = false;
  }
});
