function fitLogos() {
  document.querySelectorAll(".logo > span").forEach(box => {
    const small = box.querySelector("small");
    if (!small) return;
    const range = document.createRange();
    range.selectNodeContents(box.firstChild);
    const target = range.getBoundingClientRect().width;
    small.style.fontSize = "10px";
    const natural = small.getBoundingClientRect().width - parseFloat(getComputedStyle(small).letterSpacing);
    if (!target || !natural) return;
    const size = 10 * target / natural;
    small.style.fontSize = size + "px";
    small.style.marginRight = -parseFloat(getComputedStyle(small).letterSpacing) + "px";
  });
}
(document.fonts ? document.fonts.ready : Promise.resolve()).then(fitLogos);
addEventListener("resize", fitLogos);

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

$("#screens").innerHTML = SHOW.map((p, i) => `<img src="assets/shots/${p.id}.webp" alt="Tela do sistema ${esc(p.name)}" width="1200" height="750" class="${i ? "" : "on"}">`).join("");
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
  <li class="c-${p.color} ${i ? "" : "open"}">
    <button class="toc-row" type="button" aria-expanded="${!i}" aria-controls="toc-${p.id}">
      <img class="toc-logo" src="assets/logos/${p.logo}.webp" alt="" width="56" height="56" loading="lazy">
      <span class="toc-name"><strong>${esc(p.name)}</strong><small>${esc(p.what)}</small></span>
      <span class="toc-lead" aria-hidden="true"></span>
      <span class="toc-client">${esc(p.client)}</span>
      <span class="toc-year">${p.year}</span>
      <span class="toc-more"><span class="t-open">Ver telas</span><span class="t-close">Fechar</span></span>
      <span class="toc-plus" aria-hidden="true"></span>
    </button>
    <div class="toc-panel" id="toc-${p.id}" ${i ? 'style="height:0px" inert' : 'style="height:auto"'}>
      <div class="toc-body">
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
    </div>
  </li>`).join("");

const teaseHeight = () => (innerWidth < 560 ? 110 : 170);
const panelOf = li => $(".toc-panel", li);

function setHeight(panel, value) {
  if (panel.style.height === "auto") {
    panel.style.height = panel.scrollHeight + "px";
    void panel.offsetHeight;
  }
  panel.style.height = value;
}

function openItem(li) {
  const panel = panelOf(li);
  li.classList.remove("teasing");
  li.classList.add("open");
  $(".toc-row", li).setAttribute("aria-expanded", "true");
  panel.inert = false;
  setHeight(panel, panel.scrollHeight + "px");
  const done = e => {
    if (e.propertyName !== "height") return;
    panel.removeEventListener("transitionend", done);
    if (li.classList.contains("open")) panel.style.height = "auto";
    if (hasGsap) ScrollTrigger.refresh();
  };
  panel.addEventListener("transitionend", done);
  if (reduce) { panel.style.height = "auto"; if (hasGsap) ScrollTrigger.refresh(); }
}

function closeItem(li) {
  const panel = panelOf(li);
  li.classList.remove("open", "teasing");
  $(".toc-row", li).setAttribute("aria-expanded", "false");
  panel.inert = true;
  setHeight(panel, "0px");
  if (hasGsap) setTimeout(() => ScrollTrigger.refresh(), 600);
}

function tease(li, on) {
  if (li.classList.contains("open")) return;
  li.classList.toggle("teasing", on);
  setHeight(panelOf(li), on ? teaseHeight() + "px" : "0px");
}

$$("#toc > li").forEach(li => {
  $(".toc-row", li).addEventListener("click", () => {
    if (li.classList.contains("open")) return closeItem(li);
    $$("#toc > li.open").forEach(closeItem);
    openItem(li);
  });
  if (fine) {
    li.addEventListener("mouseenter", () => tease(li, true));
    li.addEventListener("mouseleave", () => tease(li, false));
  }
});

if (!reduce) {
  const demo = new IntersectionObserver(entries => {
    if (!entries[0].isIntersecting) return;
    demo.disconnect();
    const li = $$("#toc > li").find(x => !x.classList.contains("open"));
    if (!li) return;
    setTimeout(() => { if (!li.matches(":hover")) tease(li, true); }, 700);
    setTimeout(() => { if (!li.matches(":hover")) tease(li, false); }, 2300);
  }, { threshold: 0.6 });
  demo.observe($("#toc > li:nth-child(2)"));
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

const SYSTEMS = [
  { id: "sema", name: "SEMA", client: "Secretaria de Meio Ambiente", kind: "pub", year: 2025, logo: "brasao" },
  { id: "demutran", name: "DEMUTRAN", client: "Departamento de Trânsito", kind: "pub", year: 2024, logo: "demutran" },
  { id: "protocolo", name: "Protocolo SEAD", client: "Secretaria de Administração", kind: "pub", year: 2025, logo: "sead" },
  { id: "secom", name: "SECOM", client: "Secretaria de Comunicação", kind: "pub", year: 2026, logo: "brasao" },
  { id: "estagio", name: "Estágio PdF", client: "Secretaria de Administração", kind: "pub", year: 2026, logo: "sead" },
  { id: "integral", name: "Integral Clínica", client: "Fisioterapia e estética", kind: "priv", year: 2026, logo: "integral" },
  { id: "vfik", name: "VFIK", client: "Projetos e construções", kind: "priv", year: 2026, logo: "vfik" }
];
(function buildOrbit() {
  const inner = SYSTEMS.filter(x => x.kind === "pub");
  const outer = SYSTEMS.filter(x => x.kind === "priv");
  const planet = (x, angle, r, i) => `
    <div class="beam" data-id="${x.id}" style="--a:${angle}deg;--r:${r}cqw;--c:var(--${x.kind === "pub" ? "b" : "g"})"></div>
    <div class="planet ${x.kind}" data-id="${x.id}" style="--a:${angle}deg;--r:${r}cqw;--delay:${(0.35 + i * 0.12).toFixed(2)}s">
      <div class="p-face"><button class="p-btn" type="button" data-id="${x.id}" aria-label="${esc(x.name)}, ${esc(x.client)}, desde ${x.year}"><img src="assets/logos/${x.logo}.webp" alt="" width="60" height="60"><small>${esc(x.name)}</small></button></div>
    </div>`;
  $("#spin-in").innerHTML = inner.map((x, i) => planet(x, -90 + i * (360 / inner.length), 28, i)).join("");
  $("#spin-out").innerHTML = outer.map((x, i) => planet(x, 200 + i * 180, 42, inner.length + i)).join("");
  $("#o-groups").innerHTML = [["pub", "Setor público", "b", "5 sistemas · 4 órgãos"], ["priv", "Empresas", "g", "2 sistemas · 2 empresas"]].map(([k, t, c, sub]) => `
    <div class="o-group"><h3><i style="background:var(--${c})"></i>${t}<span>${sub}</span></h3>
    <div class="o-chips">${SYSTEMS.filter(x => x.kind === k).map(x => `<button class="o-chip ${k}" type="button" data-id="${x.id}"><img src="assets/logos/${x.logo}.webp" alt="" width="28" height="28">${esc(x.name)}</button>`).join("")}</div></div>`).join("");
})();

const orbitEl = $("#orbit");
let pinned = null;
function focusSystem(id) {
  const x = SYSTEMS.find(s => s.id === id);
  orbitEl.classList.toggle("paused", Boolean(x));
  orbitEl.classList.toggle("focus", Boolean(x));
  $$(".planet, .beam, .o-chip").forEach(el => el.classList.toggle("on", Boolean(x) && el.dataset.id === id));
  const card = $("#o-card");
  if (x) card.innerHTML = `<strong>${esc(x.name)}<em class="${x.kind}">${x.kind === "pub" ? "público" : "privado"}</em></strong><span>${esc(x.client)}</span><span class="since">No ar desde ${x.year}</span>`;
  card.classList.toggle("on", Boolean(x));
}
$$("[data-id].p-btn, .o-chip").forEach(el => {
  el.addEventListener("mouseenter", () => { if (fine) focusSystem(el.dataset.id); });
  el.addEventListener("mouseleave", () => { if (fine && !pinned) focusSystem(null); else if (fine && pinned) focusSystem(pinned); });
  el.addEventListener("focus", () => focusSystem(el.dataset.id));
  el.addEventListener("blur", () => { if (!pinned) focusSystem(null); });
  el.addEventListener("click", () => { pinned = pinned === el.dataset.id ? null : el.dataset.id; focusSystem(pinned); });
});
document.addEventListener("click", e => { if (pinned && !e.target.closest(".p-btn, .o-chip")) { pinned = null; focusSystem(null); } });

new IntersectionObserver((entries, obs) => {
  if (!entries[0].isIntersecting) return;
  orbitEl.classList.add("go");
  obs.disconnect();
}, { threshold: 0.3 }).observe(orbitEl);

if (fine && !reduce) {
  const stage = $("#orbit-stage");
  stage.addEventListener("mousemove", e => {
    const r = stage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    orbitEl.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 10}deg)`;
  });
  stage.addEventListener("mouseleave", () => { orbitEl.style.transform = ""; });
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

  gsap.from(".orbit-copy > :not(.eyebrow)", { y: 30, opacity: 0, duration: 0.8, stagger: 0.12, ease: "power3.out", scrollTrigger: { trigger: ".orbit-sec", start: "top 75%" } });
  gsap.from(".o-chip", { y: 16, opacity: 0, duration: 0.5, stagger: 0.05, ease: "power3.out", scrollTrigger: { trigger: ".o-groups", start: "top 85%" } });
  gsap.fromTo(".o-ring", { attr: { "stroke-dasharray": "0 300" } }, { attr: { "stroke-dasharray": "1.2 1.4" }, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: ".orbit", start: "top 75%" } });
  $$("[data-count]").forEach(el => {
    const end = Number(el.dataset.count);
    const obj = { v: 0 };
    gsap.to(obj, { v: end, duration: 1.4, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 85%" }, onUpdate: () => { el.textContent = Math.round(obj.v); } });
  });

  const mm = gsap.matchMedia();
  mm.add("(min-width: 900px)", () => {
    const items = $$(".pain-list li");
    const tl = gsap.timeline({ scrollTrigger: { trigger: ".pains", start: () => "top " + $(".nav").offsetHeight, end: () => "+=" + items.length * 380, scrub: 0.6, pin: true, anticipatePin: 1, invalidateOnRefresh: true } });
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
  gsap.from(".pack", { y: 70, opacity: 0, duration: 0.9, stagger: 0.12, ease: "power3.out", scrollTrigger: { trigger: ".pack-grid", start: "top 85%" } });
  gsap.from(".service", { y: 60, opacity: 0, rotate: 2, duration: 0.8, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: ".service-grid", start: "top 85%" } });

  gsap.fromTo(".steps-line path", { strokeDashoffset: 1000 }, { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ".steps-wrap", start: "top 75%", end: "bottom 55%", scrub: true } });
  $$(".steps li").forEach((li, i) => gsap.from(li, { y: 40, opacity: 0, duration: 0.6, ease: "power3.out", scrollTrigger: { trigger: ".steps-wrap", start: `top ${75 - i * 6}%` } }));

  gsap.from(".why-card", { clipPath: "inset(12% 8% 12% 8% round 40px)", duration: 1.2, ease: "expo.out", scrollTrigger: { trigger: ".why", start: "top 80%" } });
  gsap.from(".why-list li", { x: 40, opacity: 0, duration: 0.6, stagger: 0.1, scrollTrigger: { trigger: ".why-list", start: "top 85%" } });
  gsap.from(".faq details", { y: 24, opacity: 0, duration: 0.5, stagger: 0.06, scrollTrigger: { trigger: ".faq-list", start: "top 88%" } });
  gsap.from(".contact-form", { y: 60, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: ".contact", start: "top 80%" } });

  let refreshTimer;
  const queueRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 120); };
  window.addEventListener("load", queueRefresh);
  if (document.fonts) document.fonts.ready.then(queueRefresh);
  $$("img").forEach(img => { if (!img.complete) img.addEventListener("load", queueRefresh, { once: true }); });
  if ("ResizeObserver" in window) { let lastH = document.body.scrollHeight; new ResizeObserver(() => { const h = document.body.scrollHeight; if (Math.abs(h - lastH) > 4) { lastH = h; queueRefresh(); } }).observe(document.body); }
} else {
  $$(".hero .mark").forEach(m => m.classList.add("on"));
  $$(".before").forEach(b => b.style.setProperty("--strike", "100%"));
}

$("#year").textContent = new Date().getFullYear();
const WA_NUMBER = (window.ROTA_CONFIG || {}).whatsapp;
if (WA_NUMBER) {
  $$("[data-wa]").forEach(a => {
    a.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(a.dataset.wa)}`;
    a.target = "_blank";
    a.rel = "noopener";
  });
}
const waFloat = $(".wa-float");
const heroEnd = () => $(".hero").getBoundingClientRect().bottom;
const contactTop = () => $("#contato").getBoundingClientRect().top;
const syncFloat = () => waFloat.classList.toggle("on", heroEnd() < 0 && contactTop() > innerHeight * 0.6);
addEventListener("scroll", syncFloat, { passive: true });
syncFloat();

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
      body: JSON.stringify({ name: data.name.trim(), phone: data.phone.trim(), kind: data.kind, need: (data.need || "").trim(), consented_at: new Date().toISOString() })
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
