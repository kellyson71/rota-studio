const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = n => String(n).padStart(2, "0");
const now = () => new Date().toISOString();
const localDay = d => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const today = () => localDay(Date.now());
const addDays = n => localDay(Date.now() + n * 864e5);
const daysSince = iso => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5)) : null);
const pick = list => list[Math.floor(Math.random() * list.length)];
const shortName = c => String(c.name || "Sem nome").split(" - ")[0];
const initials = s => String(s || "?").replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase() || "?";
const tone = s => [...String(s)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 5;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const STATUS = {
  "A enviar": { icon: "↗", tone: "new", label: "A enviar" },
  "Aguardando resposta": { icon: "◷", tone: "wait", label: "No vácuo" },
  "Respondeu": { icon: "↩", tone: "reply", label: "Respondeu" },
  "Reunião marcada": { icon: "▦", tone: "reply", label: "Reunião marcada" },
  "Interessado": { icon: "✦", tone: "win", label: "Interessado" },
  "Proposta enviada": { icon: "▤", tone: "reply", label: "Proposta enviada" },
  "Fechado": { icon: "✓", tone: "win", label: "Fechado" },
  "Sem interesse": { icon: "−", tone: "no", label: "Sem interesse" },
  "Mais tarde": { icon: "◴", tone: "new", label: "Mais tarde" }
};
const STATUSES = Object.keys(STATUS);
const TALKING = ["Respondeu", "Reunião marcada", "Interessado", "Proposta enviada"];
const TEAM = ["Kellyson", "Jeyce"];
const TASK_STATES = ["A fazer", "Fazendo", "Em revisão", "Feito"];
const STAGES = [
  { id: "novos", label: "A enviar", icon: "↗", match: c => c.status === "A enviar", drop: "A enviar" },
  { id: "vacuo", label: "No vácuo", icon: "◷", match: c => c.status === "Aguardando resposta", drop: "Aguardando resposta" },
  { id: "conversa", label: "Conversando", icon: "↩", match: c => TALKING.includes(c.status), drop: "Respondeu" },
  { id: "fechado", label: "Fechados", icon: "✓", match: c => c.status === "Fechado", drop: "Fechado" },
  { id: "parado", label: "Parados", icon: "−", match: c => ["Sem interesse", "Mais tarde"].includes(c.status), drop: "Mais tarde" }
];
const QUALIFICATION = { "COMPENSA": ["vale a pena", "", "hot"], "NAO COMPENSA": ["não compensa", "", "cold"], "bleh, ate que vai": ["bleh, até que vai", "", "meh"] };
const PRIORITY_RANK = { Urgente: 0, Alta: 1, Normal: 2, Baixa: 3 };
const QUAL_RANK = { "COMPENSA": 0, "": 1, "bleh, ate que vai": 1, "NAO COMPENSA": 3 };

const JOKES = {
  sent: ["Mandado. Agora é fingir que não está olhando o “visto por último”.", "Foi. Uma porta a menos pra bater.", "Mensagem no ar. Próximo!", "Pronto. O resto é com o cliente."],
  streak: ["Cinco seguidas. Ritmo bom.", "Isso já é maratona.", "Sequência boa, segue assim."],
  closed: ["Fechou! Agora é entregar bem.", "Contrato na mão. Pode comemorar.", "Cliente novo na casa."],
  lost: ["Um não hoje, um case amanhã.", "Sem problema, tem mais porta.", "Anotado. Próximo."],
  skip: ["Pulado. Volta no fim da fila.", "Esse fica pra depois."],
  done: ["Fila zerada.", "Acabou a fila. Até o WhatsApp descansou.", "Nenhuma mensagem pendente por aqui."]
};

const TEMPLATES = [
  { id: "message", label: "1º contato", stored: true },
  { id: "followupMessage", label: "Retorno", stored: true },
  { id: "meet", label: "Marcar conversa", text: "{oi}! Que bom que respondeu Consigo te mostrar em 10 minutos, por vídeo ou aí pessoalmente. Qual dia e horário ficam melhor essa semana?" },
  { id: "after", label: "Pós-conversa", text: "{oi}! Obrigado pela conversa. Como combinamos, vou montar a proposta e te mando até {prazo}. Qualquer dúvida, é só chamar aqui. {eu}" },
  { id: "proposal", label: "Proposta", text: "{oi}! Segue a proposta que conversamos: {preco}. Inclui a implantação, os ajustes iniciais e o suporte. Se fizer sentido, a gente já combina o início. Ficou alguma dúvida?" },
  { id: "nudge", label: "Cutucar proposta", text: "{oi}! Conseguiu dar uma olhada na proposta? Se quiser, ajusto o escopo para caber melhor no momento de vocês." }
];
const DEFAULT_MESSAGE = "Oi, tudo bem? Sou {eu}, desenvolvedor(a) aqui do Alto Oeste. Faço sites e sistemas para facilitar o dia a dia de negócios da região. Posso te mostrar em 10 minutos como funcionaria para vocês?";
const DEFAULT_FOLLOWUP = "Oi! Passando só para saber se viu minha mensagem. Se não for o momento, sem problema. Obrigado!";

const ui = {
  kind: "private",
  search: "",
  stage: "todos",
  owner: "Todos",
  category: "Todos",
  view: Store.local.read("view", "lista"),
  limit: 30,
  turbo: { mode: "novos", owner: "meus", category: "Todos", queue: [], index: 0, sent: 0, built: false, anim: "" },
  projectTab: "Em andamento",
  taskOwner: "Todos",
  openProject: Store.local.read("open-project", null),
  pendingRender: false,
  drawerId: null,
  drawerTemplate: "message",
  drawerDraft: null
};

const DEFAULT_SETTINGS = { weeklyGoal: { Kellyson: 8, Jeyce: 8 }, returnDays: 3, followupDays: 5 };
const settings = () => ({ ...DEFAULT_SETTINGS, ...Store.settings, weeklyGoal: { ...DEFAULT_SETTINGS.weeklyGoal, ...(Store.settings?.weeklyGoal || {}) } });
const goalOf = who => Number(settings().weeklyGoal[who] ?? 8);

function weekStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function sentThisWeek(who) {
  const ws = weekStart();
  return Store.contacts.reduce((n, c) => n + (c.history || []).filter(h => h.type === "sent" && new Date(h.at) >= ws && (!who || h.actor === who)).length, 0);
}

function claim(c) {
  if (!c || c.owner) return false;
  c.owner = actor();
  log(c, "Pegou o contato ao copiar a mensagem", "owner");
  Store.saveContact(c, { silent: route() === "turbo" });
  return true;
}

function actor() {
  if (Store.mode === "cloud") return Store.member?.name || Store.user?.email || "Alguém";
  return Store.local.read("actor", "Kellyson");
}

const route = () => (location.hash.slice(1) || "inicio").split("?")[0];
const contactsOf = kind => Store.contacts.filter(c => (c.kind || "private") === kind);
const byId = id => Store.contacts.find(c => c.id === id);
const projectById = id => Store.projects.find(p => p.id === id);
const ownerLabel = o => o || "Ninguém";

function log(c, text, type = "note") {
  c.history = [{ text, type, actor: actor(), at: now() }, ...(c.history || [])].slice(0, 80);
}

function snapshot(c) {
  return JSON.parse(JSON.stringify(c));
}

function restore(c, snap) {
  Object.keys(c).forEach(k => { if (!(k in snap)) delete c[k]; });
  Object.assign(c, snap);
  Store.saveContact(c);
}

function setStatus(c, status) {
  if (!c || c.status === status) return;
  const snap = snapshot(c);
  const from = c.status;
  c.status = status;
  if (TALKING.includes(status) && !c.respondedAt) c.respondedAt = now();
  log(c, `${STATUS[from]?.label || from} → ${STATUS[status]?.label || status}`, "status");
  Store.saveContact(c);
  const undo = () => restore(c, snap);
  if (status === "Fechado") {
    confetti();
    toast(pick(JOKES.closed), undo);
  } else if (status === "Sem interesse") {
    toast(pick(JOKES.lost), undo);
  } else {
    toast(`${shortName(c)} → ${STATUS[status].label}`, undo);
  }
}

function setOwner(c, owner) {
  if (!c || (c.owner || "") === owner) return;
  c.owner = owner;
  log(c, owner ? `Agora quem cuida é ${owner}` : "Ficou sem responsável", "owner");
  Store.saveContact(c);
}

function markSent(c, mode = "message", { quiet = false } = {}) {
  if (!c) return;
  const snap = snapshot(c);
  const followup = mode !== "message";
  c.status = "Aguardando resposta";
  c.sentAt = now();
  c.owner = c.owner || actor();
  c.returnAt = addDays(followup ? settings().followupDays : settings().returnDays);
  if (followup) c.followups = (c.followups || 0) + 1;
  log(c, followup ? "Mandou um retorno" : "Mandou a primeira mensagem", "sent");
  Store.saveContact(c);
  if (!quiet) toast(pick(JOKES.sent) + ` Retorno em ${relDay(c.returnAt)}.`, () => restore(c, snap));
  return snap;
}

function logReply(c, text) {
  const snap = snapshot(c);
  if (!TALKING.includes(c.status) && c.status !== "Fechado") c.status = "Respondeu";
  c.respondedAt = c.respondedAt || now();
  c.returnAt = "";
  log(c, text ? `Resposta: “${text}”` : "Respondeu", "reply");
  Store.saveContact(c);
  toast("Resposta registrada. A bola tá com vocês", () => restore(c, snap));
}

function fmtDay(ymd) {
  return ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "";
}

function fmtWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function relDay(ymd) {
  if (!ymd) return "";
  const diff = Math.round((new Date(ymd + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  if (diff < 0) return `há ${-diff} dias`;
  if (diff < 7) return `em ${diff} dias`;
  return fmtDay(ymd);
}

function ago(iso) {
  const d = daysSince(iso);
  if (d === null) return "";
  if (d === 0) {
    const h = Math.floor((Date.now() - new Date(iso)) / 36e5);
    return h < 1 ? "agora há pouco" : `há ${h}h`;
  }
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function vacuum(c) {
  const d = daysSince(c.sentAt);
  if (d === null) return { label: "envio sem data", cls: "muted" };
  if (d === 0) return { label: "mandado hoje", cls: "fresh" };
  if (d < 3) return { label: `${d}d · fresquinho`, cls: "fresh" };
  if (d < 7) return { label: `${d}d de vácuo`, cls: "warm" };
  return { label: `${d}d · vácuo raiz`, cls: "cold" };
}

function isDue(c) {
  return c.status === "Aguardando resposta" && (!c.returnAt || c.returnAt <= today());
}

function sentTodayBy(who) {
  const day = today();
  return Store.contacts.reduce((n, c) => n + (c.history || []).filter(h => h.type === "sent" && localDay(h.at) === day && (!who || h.actor === who)).length, 0);
}

const safeUrl = u => { try { const p = new URL(u); return ["http:", "https:"].includes(p.protocol) ? p.href : ""; } catch { return ""; } };

function channels(c, text = "") {
  const list = [];
  const digits = String(c.phone || "").replace(/\D/g, "");
  if (digits.length >= 10) list.push({ name: "WhatsApp", icon: "◉", url: `https://wa.me/${digits.startsWith("55") ? digits : "55" + digits}${text ? "?text=" + encodeURIComponent(text) : ""}`, prefill: true });
  if (c.instagram) {
    const ig = c.instagram.startsWith("http") ? safeUrl(c.instagram) : "https://www.instagram.com/" + encodeURIComponent(c.instagram.replace(/^@/, "").replace(/'/g, "")) + "/";
    if (ig) list.push({ name: "Instagram", icon: "◎", url: ig });
  }
  if (c.email && c.email.includes("@")) list.push({ name: "E-mail", icon: "✉", url: `mailto:${c.email}?subject=${encodeURIComponent(c.subject || "")}&body=${encodeURIComponent(text)}`, prefill: true });
  if (c.website && safeUrl(c.website)) list.push({ name: "Site", icon: "↗", url: safeUrl(c.website) });
  if (c.telephone) list.push({ name: "Telefone", icon: "☎", url: "tel:" + c.telephone.replace(/[^+\d]/g, "") });
  if (!list.length && safeUrl(c.channelUrl)) list.push({ name: c.channel || "Link", icon: "↗", url: safeUrl(c.channelUrl) });
  const primary = c.channel === "Fixo" ? "Telefone" : c.channel;
  return list.sort((a, b) => (b.name === primary) - (a.name === primary));
}

function fillTemplate(text, c) {
  const person = String(c.person || "").split(/[ (]/)[0];
  return String(text || "")
    .replaceAll("{oi}", person ? `Oi, ${person}` : "Oi")
    .replaceAll("{nome}", person || shortName(c))
    .replaceAll("{empresa}", shortName(c))
    .replaceAll("{eu}", actor())
    .replaceAll("{cidade}", c.city || "região")
    .replaceAll("{preco}", c.price || "[valor]")
    .replaceAll("{prazo}", fmtDay(addDays(3)));
}

function messageFor(c, mode = "message") {
  if (mode === "message") return fillTemplate(c.message || DEFAULT_MESSAGE, c);
  if (mode === "followupMessage") return fillTemplate(c.followupMessage || DEFAULT_FOLLOWUP, c);
  return fillTemplate(TEMPLATES.find(t => t.id === mode)?.text || "", c);
}

async function copy(text, label = "Copiado") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.append(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    if (!ok) return toast("Não consegui copiar. Selecione o texto e use Ctrl+C."), false;
  }
  toast(label + " ✓");
  return true;
}

function copyAndOpen(c, text, channelName) {
  const list = channels(c, text);
  const target = list.find(x => !channelName || x.name === channelName) || list[0];
  if (!target) {
    openDrawer(c.id);
    return toast("Esse contato ainda não tem canal. Edite a ficha e adicione um.");
  }
  window.open(target.url, "_blank", "noopener,noreferrer");
  copy(text, target.prefill ? `Abri o ${target.name} com a mensagem pronta` : `Mensagem copiada, é só colar no ${target.name}`);
}

let toastTimer;
function toast(text, undo) {
  const el = $("#toast");
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button">Desfazer</button>' : ""}`;
  if (undo) $("button", el).onclick = () => { undo(); el.classList.remove("show"); toast("Desfeito ↺"); };
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  toastTimer = setTimeout(() => el.classList.remove("show"), undo ? 6000 : 3200);
}

function confetti() {
  if (reduceMotion()) return;
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
  const colors = ["#c6f432", "#b9a4ff", "#ff8a4c", "#ff7eb6", "#16150f", "#5fd1ff"];
  const parts = Array.from({ length: 160 }, () => ({ x: innerWidth / 2, y: innerHeight * 0.4, vx: (Math.random() - 0.5) * 16, vy: Math.random() * -15 - 4, s: Math.random() * 7 + 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: pick(colors) }));
  const start = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts.forEach(p => {
      p.vy += 0.42;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    });
    if (t - start < 2600) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(start);
}

const opts = (values, chosen, label = v => v) => values.map(v => `<option value="${esc(v)}" ${v === chosen ? "selected" : ""}>${esc(label(v))}</option>`).join("");
const statusPill = s => `<span class="pill tone-${STATUS[s]?.tone || "new"}"><b>${STATUS[s]?.icon || "•"}</b>${esc(STATUS[s]?.label || s)}</span>`;
const avatar = (name, cls = "") => `<span class="avatar t${tone(name)} ${cls}">${esc(initials(name))}</span>`;
const personDot = who => who ? `<span class="person p-${esc(who.toLowerCase())}">${esc(who[0])}</span>` : '<span class="person p-none">?</span>';

function qualBadge(c) {
  const q = QUALIFICATION[c.qualification];
  return q ? `<span class="sticker s-${q[2]}">${q[1]} ${q[0]}</span>` : "";
}

const NAV = [
  { id: "inicio", icon: "◈", label: "Hoje" },
  { id: "turbo", icon: "⚡︎", label: "Modo turbo", badge: () => contactsOf("private").filter(c => c.status === "A enviar").length },
  { id: "contatos", icon: "☷", label: "Contatos", badge: () => contactsOf("private").filter(c => TALKING.includes(c.status)).length, badgeHot: true },
  { id: "projetos", icon: "▦", label: "Projetos", badge: () => Store.projects.filter(p => p.status !== "Entregue").length },
  { id: "prefeituras", icon: "⌂", label: "Prefeituras", later: true },
  { id: "materiais", icon: "▤", label: "Materiais", later: true }
];

function renderChrome() {
  const r = route();
  const item = n => {
    const b = n.badge?.();
    return `<a href="#${n.id}" class="${r === n.id ? "active" : ""}" ${r === n.id ? 'aria-current="page"' : ""}><b>${n.icon}</b><span>${n.label}</span>${b ? `<small class="${n.badgeHot ? "hot" : ""}">${b}</small>` : ""}</a>`;
  };
  $("#nav").innerHTML = NAV.filter(n => !n.later).map(item).join("") + '<div class="nav-sep">pra depois</div>' + NAV.filter(n => n.later).map(item).join("");
  $("#tabbar").innerHTML = NAV.slice(0, 4).map(item).join("") + `<a href="#materiais" class="${["materiais", "prefeituras"].includes(r) ? "active" : ""}"><b>⋯</b><span>Mais</span></a>`;
  $("#crumb").innerHTML = `<span>Freelas Alto Oeste</span> / <strong>${esc(NAV.find(n => n.id === r)?.label || "Hoje")}</strong>`;
  const me = actor();
  if (Store.mode === "cloud") {
    $("#who").innerHTML = Store.member ? `<span class="who">${personDot(me)}<span>${esc(me)}</span></span>` : "";
    $("#sidebar-foot").innerHTML = Store.member ? `<button class="side-settings" data-action="settings" type="button">⚙ Metas e ajustes</button><div class="sync"><span class="live"></span>Sincronizado com a dupla</div><button class="link" data-action="sign-out" type="button">Sair da conta</button>` : "";
  } else {
    $("#who").innerHTML = `<label class="who">${personDot(me)}<span class="sr-only">Usando como</span><select id="actor" aria-label="Usando como">${opts(TEAM, me)}</select></label>`;
    $("#sidebar-foot").innerHTML = `<button class="side-settings" data-action="settings" type="button">⚙ Metas e ajustes</button><div class="sync demo"><span class="live"></span>Modo demonstração</div><p>Tudo fica salvo só neste navegador até o Supabase ser ligado.</p><button class="link" data-action="reset-demo" type="button">Restaurar dados de exemplo</button>`;
  }
  $("#quick-add-top").hidden = Store.mode === "cloud" && !Store.member;
}

function pageHead(kicker, title, sub, actions = "") {
  return `<section class="page-head"><div><span class="kicker">${kicker}</span><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${actions ? `<div class="head-actions">${actions}</div>` : ""}</section>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Boa madrugada (vai dormir)" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function homePage() {
  const me = actor();
  const priv = contactsOf("private");
  const toSend = priv.filter(c => c.status === "A enviar");
  const waiting = priv.filter(c => c.status === "Aguardando resposta").sort((a, b) => String(a.sentAt || "").localeCompare(String(b.sentAt || "")));
  const due = waiting.filter(isDue);
  const talking = priv.filter(c => TALKING.includes(c.status)).sort((a, b) => TALKING.indexOf(b.status) - TALKING.indexOf(a.status));
  const meetings = priv.filter(c => c.meetingAt && c.meetingAt.slice(0, 10) >= today()).sort((a, b) => a.meetingAt.localeCompare(b.meetingAt));
  const goal = goalOf(me);
  const mine = sentThisWeek(me);
  const team = sentThisWeek();
  const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
  const feed = Store.contacts.flatMap(c => (c.history || []).map(h => ({ ...h, id: c.id, name: shortName(c) }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 7);
  const active = Store.projects.filter(p => p.status !== "Entregue");
  const next = turboList("novos")[0];
  const mood = mine >= goal ? "Meta da semana batida. O resto é bônus." : mine ? `Faltam ${goal - mine} mensagens e ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} na semana.` : due.length ? `${due.length} ${due.length === 1 ? "pessoa está" : "pessoas estão"} esperando um retorno educado.` : toSend.length ? "Nenhuma mensagem nesta semana ainda. O primeiro “oi” é o mais difícil." : "Fila vazia. Hora de caçar contatos novos.";
  const blocks = Array.from({ length: Math.max(goal, mine) }, (_, i) => `<i class="${i < mine ? (i < goal ? "on" : "extra") : ""}" style="--d:${i * 40}ms"></i>`).join("");

  return `
  <section class="hero rise" style="--i:0">
    <div class="hero-copy">
      <span class="kicker">${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</span>
      <h1>${greeting()},<br><span class="hl">${esc(me)}</span>.</h1>
      <p>${esc(mood)}</p>
      <div class="hero-actions">
        <a class="btn primary big" href="#turbo" data-action="turbo-mode" data-mode="novos">Modo turbo <small>${toSend.length} na fila</small></a>
        <a class="btn big dark" href="#turbo" data-action="turbo-mode" data-mode="retornos">Retornos <small>${due.length} vencidos</small></a>
      </div>
    </div>
    <div class="goal-card">
      <header><span class="kicker">meta da semana</span><button class="link" data-action="settings" type="button">ajustar metas</button></header>
      <div class="goal-big"><strong>${mine}</strong><span>/ ${goal} mensagens suas</span></div>
      <div class="blocks" role="img" aria-label="${mine} de ${goal} mensagens">${blocks}</div>
      <ul class="goal-people">${TEAM.map(p => { const n = sentThisWeek(p), g = goalOf(p); return `<li>${personDot(p)}<span>${esc(p)}</span><span class="mini-bar"><i style="width:${Math.min(100, (n / g) * 100)}%"></i></span><b>${n}/${g}</b></li>`; }).join("")}</ul>
      <p class="goal-foot">${team} pela dupla nesta semana · ${sentTodayBy()} hoje</p>
      ${next ? `<div class="up-next"><div><span class="kicker">próximo da fila</span><strong>${esc(shortName(next))}</strong><small>${esc([next.category, next.city].filter(Boolean).join(" · "))}</small></div><a class="btn small" href="#turbo" data-action="turbo-mode" data-mode="novos">Mandar →</a></div>` : ""}
    </div>
  </section>
  <section class="funnel rise" style="--i:1" aria-label="Funil">
    ${STAGES.map(s => { const n = priv.filter(s.match).length; return `<a href="#contatos" data-action="stage" data-stage="${s.id}" class="stage st-${s.id}"><span class="stage-icon">${s.icon}</span><strong>${pad(n)}</strong><span>${s.label}</span><i style="--w:${priv.length ? Math.max(4, (n / priv.length) * 100) : 0}%"></i></a>`; }).join("")}
  </section>
  <div class="home-grid">
    <section class="panel rise hot-panel" style="--i:3">
      <header><div><span class="kicker">a bola tá com vocês</span><h2>Responderam <em>${talking.length}</em></h2></div><a class="link" href="#contatos" data-action="stage" data-stage="conversa">ver todos</a></header>
      ${talking.length ? talking.slice(0, 5).map(c => `
        <div class="line">
          ${avatar(shortName(c))}
          <button class="line-main" data-action="open" data-id="${c.id}" type="button"><strong>${esc(shortName(c))}</strong><small>${statusPill(c.status)} ${c.meetingAt ? "· " + esc(fmtWhen(c.meetingAt)) : ""}</small></button>
          ${personDot(c.owner)}
          <button class="btn small" data-action="open" data-id="${c.id}" data-template="${c.status === "Respondeu" ? "meet" : c.status === "Reunião marcada" ? "after" : c.status === "Proposta enviada" ? "nudge" : "proposal"}" type="button">Responder ↗</button>
        </div>`).join("") : `<div class="empty-mini"><b>…</b><p>Ninguém respondeu ainda. Normal. Bora encher a fila de mensagens.</p></div>`}
    </section>
    <section class="panel rise" style="--i:4">
      <header><div><span class="kicker">hora do follow-up educado</span><h2>No vácuo <em>${waiting.length}</em></h2></div><a class="link" href="#turbo" data-action="turbo-mode" data-mode="retornos">cutucar em série</a></header>
      ${waiting.length ? waiting.slice(0, 5).map(c => { const v = vacuum(c); return `
        <div class="line">
          ${avatar(shortName(c))}
          <button class="line-main" data-action="open" data-id="${c.id}" type="button"><strong>${esc(shortName(c))}</strong><small><span class="vac v-${v.cls}">${esc(v.label)}</span>${c.returnAt ? ` · retorno ${esc(relDay(c.returnAt))}` : ""}</small></button>
          <button class="icon-btn" data-action="go" data-id="${c.id}" data-mode="followupMessage" type="button" title="Copiar retorno e abrir canal" aria-label="Cutucar ${esc(shortName(c))}">↗</button>
          <button class="icon-btn ok" data-action="sent" data-id="${c.id}" data-mode="followupMessage" type="button" title="Já mandei o retorno" aria-label="Marcar retorno enviado para ${esc(shortName(c))}">✓</button>
        </div>`; }).join("") : `<div class="empty-mini"><b>✓</b><p>Ninguém te deixando no vácuo. Paz interior desbloqueada.</p></div>`}
    </section>
    <section class="panel rise" style="--i:5">
      <header><div><span class="kicker">agenda</span><h2>Conversas marcadas</h2></div></header>
      ${meetings.length ? meetings.slice(0, 4).map(c => `
        <button class="agenda" data-action="open" data-id="${c.id}" type="button"><span class="date-chip"><b>${new Date(c.meetingAt).getDate()}</b>${new Date(c.meetingAt).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span><span><strong>${esc(shortName(c))}</strong><small>${esc(fmtWhen(c.meetingAt))} · ${esc(ownerLabel(c.owner))}</small></span></button>`).join("") : talking.some(c => c.status === "Reunião marcada") ? `<div class="empty-mini"><b>▦</b><p>Tem reunião marcada sem data registrada. Abra a ficha e anote o dia.</p><button class="btn small" data-action="open" data-id="${talking.find(c => c.status === "Reunião marcada").id}" type="button">Anotar data</button></div>` : `<div class="empty-mini"><b>▦</b><p>Quando marcarem uma conversa, ela aparece aqui.</p></div>`}
    </section>
    <section class="panel rise" style="--i:6">
      <header><div><span class="kicker">da conversa à entrega</span><h2>Projetos <em>${active.length}</em></h2></div><a class="link" href="#projetos">abrir</a></header>
      ${active.length ? active.slice(0, 4).map(p => { const done = p.tasks.filter(t => t.status === "Feito").length; return `<a class="line" href="#projetos" data-action="open-project" data-id="${p.id}">${avatar(p.name)}<span class="line-main"><strong>${esc(p.name)}</strong><small>${done}/${p.tasks.length} tarefas · ${esc(p.owner || "Dupla")}</small></span><span class="mini-bar"><i style="width:${p.tasks.length ? (done / p.tasks.length) * 100 : 0}%"></i></span></a>`; }).join("") : `<div class="empty-mini"><b>▤</b><p>Fechou um cliente? Crie o projeto pela ficha do contato.</p><button class="btn small" data-action="new-project" type="button">＋ Projeto</button></div>`}
    </section>
  </div>
  <section class="panel feed rise" style="--i:7">
    <header><div><span class="kicker">últimas movimentações</span><h2>O que a dupla andou fazendo</h2></div></header>
    ${feed.length ? `<ol>${feed.map(h => `<li><button data-action="open" data-id="${h.id}" type="button">${personDot(h.actor)}<span><strong>${esc(h.actor)}</strong> ${esc(h.text.charAt(0).toLowerCase() + h.text.slice(1))} · <em>${esc(h.name)}</em></span><small>${esc(ago(h.at))}</small></button></li>`).join("")}</ol>` : '<div class="empty-mini"><b>○</b><p>Nada por aqui ainda. Mande a primeira mensagem e ela aparece nesse mural.</p></div>'}
  </section>`;
}

function turboList(forceMode) {
  const t = forceMode ? { ...ui.turbo, mode: forceMode, owner: "meus", category: "Todos" } : ui.turbo;
  const me = actor();
  let list = contactsOf("private").filter(c => (t.mode === "novos" ? c.status === "A enviar" : c.status === "Aguardando resposta"));
  if (t.owner === "meus") list = list.filter(c => !c.owner || c.owner === me);
  if (t.category !== "Todos") list = list.filter(c => c.category === t.category);
  if (t.mode === "novos") {
    list.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) || (QUAL_RANK[a.qualification || ""] ?? 1) - (QUAL_RANK[b.qualification || ""] ?? 1) || (a.order ?? 999) - (b.order ?? 999));
  } else {
    list.sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || String(a.sentAt || "").localeCompare(String(b.sentAt || "")));
  }
  return list;
}

function buildQueue() {
  const first = ui.turbo.first;
  ui.turbo.first = null;
  ui.turbo.queue = turboList().map(c => c.id);
  if (first && ui.turbo.queue.includes(first)) ui.turbo.queue = [first, ...ui.turbo.queue.filter(x => x !== first)];
  ui.turbo.index = 0;
  ui.turbo.built = true;
}

function turboPage() {
  const t = ui.turbo;
  if (!t.built) buildQueue();
  const mode = t.mode === "novos" ? "message" : "followupMessage";
  const cats = [...new Set(contactsOf("private").filter(c => (t.mode === "novos" ? c.status === "A enviar" : c.status === "Aguardando resposta")).map(c => c.category).filter(Boolean))].sort();
  const novos = contactsOf("private").filter(c => c.status === "A enviar").length;
  const retornos = contactsOf("private").filter(c => c.status === "Aguardando resposta").length;
  const c = byId(t.queue[t.index]);
  const total = t.queue.length;
  const head = `
  <section class="turbo-head">
    <div><span class="kicker">copiar · abrir · mandar · repetir</span><h1>Modo turbo <span class="bolt">⚡︎</span></h1></div>
    <div class="turbo-controls">
      <div class="seg" role="tablist" aria-label="Fila">
        <button role="tab" aria-selected="${t.mode === "novos"}" class="${t.mode === "novos" ? "on" : ""}" data-action="turbo-mode" data-mode="novos" type="button">Primeiro contato <small>${novos}</small></button>
        <button role="tab" aria-selected="${t.mode === "retornos"}" class="${t.mode === "retornos" ? "on" : ""}" data-action="turbo-mode" data-mode="retornos" type="button">Retornos <small>${retornos}</small></button>
      </div>
      <div class="seg small">
        <button class="${t.owner === "meus" ? "on" : ""}" data-action="turbo-owner" data-owner="meus" type="button">Meus + sem dono</button>
        <button class="${t.owner === "todos" ? "on" : ""}" data-action="turbo-owner" data-owner="todos" type="button">Todos</button>
      </div>
      <label class="filter">Tipo <select data-field="turbo-category" aria-label="Filtrar por tipo">${opts(["Todos", ...cats], t.category)}</select></label>
    </div>
  </section>`;
  if (!c) {
    return head + `<section class="turbo-done rise" style="--i:0"><div class="big-emoji">${t.sent ? "✓" : "○"}</div><h2>${esc(pick(JOKES.done))}</h2><p>${t.sent ? `Você mandou ${t.sent} nesta sessão. Agora é esperar o “digitando…”.` : "Nenhum contato nessa fila com esses filtros."}</p><div class="hero-actions"><button class="btn primary" data-action="quick-add" type="button">＋ Adicionar contatos</button><button class="btn" data-action="turbo-mode" data-mode="${t.mode === "novos" ? "retornos" : "novos"}" type="button">Ir para ${t.mode === "novos" ? "retornos" : "primeiro contato"}</button></div></section>`;
  }
  const text = messageFor(c, mode);
  const ch = channels(c, text);
  const v = vacuum(c);
  const next = t.queue.slice(t.index + 1, t.index + 5).map(byId).filter(Boolean);
  return head + `
  <div class="turbo-stage">
    <article class="turbo-card ${t.anim}" data-id="${c.id}">
      <div class="turbo-progress"><span>${t.index + 1} de ${total}</span><div class="meter thin"><div style="width:${((t.index + 1) / total) * 100}%"></div></div><span>${t.sent} mandadas ✓</span></div>
      <div class="turbo-tags"><span class="tag">${esc(c.category || "Sem tipo")}</span><span class="tag">${esc(c.city || "")}</span>${c.proposal ? `<span class="tag ink">${esc(c.proposal)}</span>` : ""}${qualBadge(c)}${t.mode === "retornos" ? `<span class="vac v-${v.cls}">${esc(v.label)}</span>` : ""}</div>
      <h2><button data-action="open" data-id="${c.id}" type="button">${esc(c.name)}</button></h2>
      <div class="turbo-meta">${personDot(c.owner)} ${c.owner ? `cuidado por ${esc(c.owner)}` : "sem dono ainda: quem mandar fica"} ${c.price ? `· <strong>${esc(c.price)}</strong>` : ""}</div>
      ${c.tip ? `<div class="tip"><b>Antes de mandar</b>${esc(c.tip)}</div>` : ""}
      ${c.notes ? `<div class="tip note"><b>Nota de vocês</b>${esc(c.notes)}</div>` : ""}
      <label class="msg-label" for="turbo-msg">${t.mode === "novos" ? "Mensagem de primeiro contato" : "Mensagem de retorno"} <span>edite à vontade, salva sozinho</span></label>
      <textarea id="turbo-msg" data-field="turbo-msg" data-id="${c.id}" data-mode="${mode}">${esc(text)}</textarea>
      <div class="channel-row">${ch.map((x, i) => `<button class="chan ${i ? "" : "main"}" data-action="go" data-id="${c.id}" data-mode="${mode}" data-channel="${esc(x.name)}" data-from="turbo" type="button"><b>${x.icon}</b>${esc(x.name)}${i ? "" : ' <kbd>A</kbd>'}</button>`).join("") || '<span class="hint">Sem canal cadastrado. Abra a ficha para adicionar.</span>'}</div>
      <div class="turbo-actions">
        <button class="btn" data-action="copy" data-id="${c.id}" data-mode="${mode}" data-from="turbo" type="button">⧉ Copiar <kbd>C</kbd></button>
        <button class="btn primary grow" data-action="turbo-sent" type="button">✓ Mandei, próximo <kbd>E</kbd></button>
      </div>
      <div class="turbo-secondary">
        <button class="link" data-action="turbo-back" type="button" ${t.index ? "" : "disabled"}>← voltar</button>
        <button class="link" data-action="turbo-skip" type="button">pular <kbd>→</kbd></button>
        <button class="link" data-action="turbo-later" type="button">não compensa agora</button>
        ${t.mode === "retornos" ? '<button class="link" data-action="turbo-replied" type="button">ele respondeu!</button>' : ""}
      </div>
    </article>
    <aside class="turbo-side">
      <div class="panel"><span class="kicker">próximos da fila</span>${next.length ? `<ol class="next-list">${next.map(n => `<li>${avatar(shortName(n))}<span><strong>${esc(shortName(n))}</strong><small>${esc(n.category || "")} · ${esc(n.city || "")}</small></span></li>`).join("")}</ol>` : '<p class="hint">Esse é o último. Força!</p>'}</div>
      ${c.context ? `<div class="panel"><span class="kicker">o que se sabe</span><p class="small-text">${esc(c.context)}</p></div>` : ""}
      <div class="panel keys"><span class="kicker">atalhos</span><p><kbd>C</kbd> copiar <kbd>A</kbd> abrir canal <kbd>E</kbd> mandei <kbd>→</kbd> pular <kbd>←</kbd> voltar</p></div>
    </aside>
  </div>`;
}

function turboAdvance(action) {
  const t = ui.turbo;
  const id = t.queue[t.index];
  const c = byId(id);
  if (action === "sent" && c) {
    markSent(c, t.mode === "novos" ? "message" : "followupMessage", { quiet: true });
    t.sent++;
    t.index++;
    toast(t.sent % 5 === 0 ? pick(JOKES.streak) : pick(JOKES.sent));
  } else if (action === "skip") {
    t.queue.splice(t.index, 1);
    t.queue.push(id);
    if (t.queue.length === 1) t.index = 0;
    toast(pick(JOKES.skip));
  } else if (action === "back") {
    t.index = Math.max(0, t.index - 1);
  } else if (action === "later" && c) {
    const snap = snapshot(c);
    c.status = "Mais tarde";
    c.priority = "Baixa";
    log(c, "Ficou pra depois (não compensa agora)", "status");
    Store.saveContact(c, { silent: true });
    t.queue.splice(t.index, 1);
    toast("Foi pra geladeira", () => restore(c, snap));
  } else if (action === "replied" && c) {
    logReply(c, "");
    t.queue.splice(t.index, 1);
    openDrawer(c.id, "meet");
  }
  t.anim = action === "back" ? "from-left" : "from-right";
  render();
  t.anim = "";
}

function filteredContacts() {
  const stage = STAGES.find(s => s.id === ui.stage);
  const q = ui.search.trim().toLowerCase();
  return contactsOf(ui.kind).filter(c =>
    (!stage || stage.match(c)) &&
    (ui.owner === "Todos" || (ui.owner === "Ninguém" ? !c.owner : c.owner === ui.owner)) &&
    (ui.category === "Todos" || c.category === ui.category) &&
    (!q || [c.name, c.category, c.city, c.notes, c.person, c.phone, c.instagram, c.email].join(" ").toLowerCase().includes(q))
  );
}

function contactsPage() {
  const gov = ui.kind === "government";
  const all = contactsOf(ui.kind);
  const cats = [...new Set(all.map(c => c.category).filter(Boolean))].sort();
  const rows = filteredContacts();
  return pageHead(
    gov ? "guardado pra depois do CNPJ" : "quem já recebeu, quem respondeu, quem sumiu",
    gov ? "Prefeituras" : "Contatos",
    gov ? "Secretarias do kit. Pau dos Ferros fica de fora enquanto o Kellyson for estagiário de lá." : "Clique no nome para abrir a ficha com a mensagem. Arraste no quadro para mudar de etapa.",
    `<button class="btn" data-action="bulk-add" type="button">⇣ Colar vários</button><button class="btn primary" data-action="quick-add" type="button">＋ Novo contato</button>`
  ) + `
  <div class="toolbar">
    <label class="search"><span>⌕</span><input id="search" type="search" placeholder="Buscar nome, cidade, telefone, nota…  ( / )" value="${esc(ui.search)}" aria-label="Buscar contatos"></label>
    <label class="filter">Quem cuida <select data-field="owner-filter" aria-label="Filtrar por responsável">${opts(["Todos", ...TEAM, "Ninguém"], ui.owner)}</select></label>
    <label class="filter">Tipo <select data-field="category-filter" aria-label="Filtrar por tipo">${opts(["Todos", ...cats], ui.category)}</select></label>
    <div class="seg small view-toggle"><button class="${ui.view === "lista" ? "on" : ""}" data-action="view" data-view="lista" type="button">☰ Lista</button><button class="${ui.view === "quadro" ? "on" : ""}" data-action="view" data-view="quadro" type="button">▥ Quadro</button></div>
  </div>
  <div class="chips" role="tablist" aria-label="Etapa">
    <button class="chip ${ui.stage === "todos" ? "on" : ""}" data-action="stage" data-stage="todos" type="button">Todos <small>${all.length}</small></button>
    ${STAGES.map(s => `<button class="chip st-${s.id} ${ui.stage === s.id ? "on" : ""}" data-action="stage" data-stage="${s.id}" type="button"><b>${s.icon}</b>${s.label} <small>${all.filter(s.match).length}</small></button>`).join("")}
  </div>
  ${ui.view === "quadro" ? boardView(rows) : listView(rows)}`;
}

function listView(rows) {
  if (!rows.length) return `<div class="empty"><div class="big-emoji">⌕</div><h2>Ninguém por aqui.</h2><p>Troque o filtro ou adicione um contato novo.</p><button class="btn primary" data-action="quick-add" type="button">＋ Novo contato</button></div>`;
  return `<div class="list">${rows.slice(0, ui.limit).map((c, i) => {
    const v = c.status === "Aguardando resposta" ? vacuum(c) : null;
    const last = c.history?.[0];
    const mode = c.status === "Aguardando resposta" ? "followupMessage" : "message";
    return `<article class="row rise" style="--i:${Math.min(i, 12)}">
      ${avatar(shortName(c))}
      <button class="row-main" data-action="open" data-id="${c.id}" type="button"><strong>${esc(c.name)}</strong><small>${esc([c.category, c.city, channels(c)[0]?.name].filter(Boolean).join(" · "))}</small></button>
      <div class="row-status"><select data-field="status" data-id="${c.id}" aria-label="Etapa de ${esc(shortName(c))}">${opts(STATUSES, c.status, s => STATUS[s].label)}</select></div>
      <div class="row-owner"><select data-field="owner" data-id="${c.id}" aria-label="Quem cuida de ${esc(shortName(c))}">${opts(["", ...TEAM], c.owner || "", ownerLabel)}</select></div>
      <div class="row-touch">${v ? `<span class="vac v-${v.cls}">${esc(v.label)}</span>` : last ? `<small>${esc(ago(last.at))}</small>` : '<small class="muted">nunca tocado</small>'}</div>
      <div class="row-actions">
        <button class="icon-btn" data-action="copy" data-id="${c.id}" data-mode="${mode}" title="Copiar mensagem" aria-label="Copiar mensagem para ${esc(shortName(c))}" type="button">⧉</button>
        <button class="icon-btn" data-action="go" data-id="${c.id}" data-mode="${mode}" title="Copiar e abrir canal" aria-label="Abrir canal de ${esc(shortName(c))}" type="button">↗</button>
        <button class="icon-btn ok" data-action="sent" data-id="${c.id}" data-mode="${mode}" title="Já mandei" aria-label="Marcar enviado para ${esc(shortName(c))}" type="button">✓</button>
      </div>
    </article>`;
  }).join("")}</div>
  <div class="list-foot"><span>${Math.min(ui.limit, rows.length)} de ${rows.length}</span>${rows.length > ui.limit ? '<button class="btn small" data-action="more" type="button">Mostrar mais</button>' : ""}</div>`;
}

function boardView(rows) {
  return `<div class="board-wrap"><div class="pipeline">${STAGES.map(s => {
    const items = rows.filter(s.match);
    return `<section class="lane st-${s.id}" data-drop="${s.drop}" data-stage-id="${s.id}" aria-label="${s.label}">
      <header><b>${s.icon}</b>${s.label}<small>${items.length}</small></header>
      <div class="lane-body">${items.slice(0, 40).map(c => `<article class="card" draggable="true" data-card="${c.id}">
        <button data-action="open" data-id="${c.id}" type="button"><strong>${esc(shortName(c))}</strong><small>${esc(c.category || "")} · ${esc(c.city || "")}</small></button>
        <div class="card-foot">${s.id === "conversa" || s.id === "parado" ? statusPill(c.status) : c.status === "Aguardando resposta" ? `<span class="vac v-${vacuum(c).cls}">${esc(vacuum(c).label)}</span>` : qualBadge(c) || "<span></span>"}${personDot(c.owner)}</div>
      </article>`).join("")}${items.length > 40 ? `<button class="link more-lane" data-action="stage" data-stage="${s.id}" data-view="lista" type="button">+${items.length - 40} na lista</button>` : ""}${items.length ? "" : '<p class="lane-empty">solte aqui</p>'}</div>
    </section>`;
  }).join("")}</div></div>`;
}

function openDrawer(id, template) {
  const c = byId(id);
  if (!c) return;
  const fresh = ui.drawerId !== id || !$("#drawer").open;
  ui.drawerId = id;
  if (template) {
    ui.drawerTemplate = template;
    ui.drawerDraft = null;
  } else if (fresh) {
    ui.drawerTemplate = c.status === "Aguardando resposta" ? "followupMessage" : TALKING.includes(c.status) ? "meet" : "message";
    ui.drawerDraft = null;
  }
  renderDrawer();
  if (!$("#drawer").open) $("#drawer").showModal();
}

function renderDrawer() {
  const c = byId(ui.drawerId);
  if (!c) return $("#drawer").close();
  const tpl = ui.drawerTemplate;
  const text = ui.drawerDraft ?? messageFor(c, tpl);
  const ch = channels(c, text);
  const v = c.status === "Aguardando resposta" ? vacuum(c) : null;
  $("#drawer-content").innerHTML = `
  <header class="d-head">
    ${avatar(shortName(c), "lg")}
    <div><span class="kicker">${esc([c.category, c.city].filter(Boolean).join(" · "))}</span><h2>${esc(c.name)}</h2>
    <div class="d-tags">${statusPill(c.status)}${v ? `<span class="vac v-${v.cls}">${esc(v.label)}</span>` : ""}${c.proposal ? `<span class="tag ink">${esc(c.proposal)}</span>` : ""}${qualBadge(c)}${c.person ? `<span class="tag"> ${esc(c.person)}</span>` : ""}</div></div>
    <button class="btn small" data-action="edit-contact" data-id="${c.id}" type="button">✎ Editar</button>
  </header>
  <section class="d-block msg-block">
    <div class="tpl-row" role="tablist" aria-label="Modelo de mensagem">${TEMPLATES.map(t => `<button class="chip ${tpl === t.id ? "on" : ""}" data-action="template" data-template="${t.id}" type="button">${t.label}</button>`).join("")}</div>
    <textarea id="d-msg" data-field="drawer-msg" aria-label="Mensagem">${esc(text)}</textarea>
    <p class="hint">${TEMPLATES.find(t => t.id === tpl)?.stored ? "Suas edições ficam salvas nesse contato." : "Modelo rápido: edite antes de mandar."} ${c.price ? "Preço de referência: <strong>" + esc(c.price) + "</strong>" : ""}</p>
    <div class="channel-row">${ch.map((x, i) => `<button class="chan ${i ? "" : "main"}" data-action="go" data-id="${c.id}" data-channel="${esc(x.name)}" data-from="drawer" type="button"><b>${x.icon}</b>${esc(x.name)}</button>`).join("") || '<span class="hint">Nenhum canal. Clique em Editar e cole o WhatsApp ou @.</span>'}</div>
    <div class="d-actions"><button class="btn" data-action="copy" data-id="${c.id}" data-from="drawer" type="button">⧉ Copiar</button><button class="btn primary grow" data-action="sent" data-id="${c.id}" data-mode="${tpl === "message" ? "message" : "followupMessage"}" type="button">✓ Já mandei</button></div>
  </section>
  <section class="d-block">
    <h3>Etapa</h3>
    <div class="status-grid">${STATUSES.map(s => `<button class="st-btn tone-${STATUS[s].tone} ${c.status === s ? "on" : ""}" data-action="set-status" data-id="${c.id}" data-value="${esc(s)}" type="button" aria-pressed="${c.status === s}"><b>${STATUS[s].icon}</b>${esc(STATUS[s].label)}</button>`).join("")}</div>
    <h3>Quem cuida</h3>
    <div class="seg small">${["", ...TEAM].map(o => `<button class="${(c.owner || "") === o ? "on" : ""}" data-action="set-owner" data-id="${c.id}" data-value="${o}" type="button">${o ? personDot(o) : ""}${esc(ownerLabel(o))}</button>`).join("")}</div>
  </section>
  <section class="d-block reply-block">
    <h3>Responderam?</h3>
    <textarea id="d-reply" placeholder="Cole aqui o que responderam (opcional)" rows="2"></textarea>
    <button class="btn small" data-action="log-reply" data-id="${c.id}" type="button">Registrar resposta</button>
  </section>
  <section class="d-block">
    <div class="field-grid">
      <div class="field"><label for="d-return">Lembrar de retornar</label><input type="date" id="d-return" data-field="returnAt" data-id="${c.id}" value="${esc(c.returnAt || "")}"><div class="quick-dates">${[["amanhã", 1], ["+3 dias", 3], ["+1 semana", 7]].map(([l, n]) => `<button class="link" data-action="return-in" data-id="${c.id}" data-days="${n}" type="button">${l}</button>`).join("")}</div></div>
      <div class="field"><label for="d-meeting">Reunião / conversa</label><input type="datetime-local" id="d-meeting" data-field="meetingAt" data-id="${c.id}" value="${esc(c.meetingAt || "")}"></div>
    </div>
    <div class="field"><label for="d-notes">Notas da dupla</label><textarea id="d-notes" data-field="notes" data-id="${c.id}" placeholder="O que combinaram, objeções, próximo passo…">${esc(c.notes || "")}</textarea></div>
  </section>
  ${c.tip || c.context || c.source ? `<details class="d-block"><summary>Contexto e fonte</summary>${c.tip ? `<p><b>Antes de mandar:</b> ${esc(c.tip)}</p>` : ""}${c.context ? `<p><b>O que se sabe:</b> ${esc(c.context)}</p>` : ""}${c.source ? `<p class="hint">${esc(c.source)}</p>` : ""}</details>` : ""}
  <section class="d-block">
    <h3>Histórico</h3>
    <ol class="timeline">${(c.history || []).map(h => `<li class="h-${h.type}">${personDot(h.actor)}<div>${esc(h.text)}<small>${esc(h.actor)} · ${esc(ago(h.at))}</small></div></li>`).join("") || '<li class="h-empty"><div>Nenhuma movimentação registrada ainda.<small>Dados importados do Miro, sem datas.</small></div></li>'}</ol>
  </section>
  <div class="d-foot"><button class="btn" data-action="new-project" data-id="${c.id}" type="button">＋ Criar projeto deste cliente</button></div>`;
}

function parseHandle(raw) {
  const v = String(raw || "").trim();
  const out = {};
  if (!v) return out;
  if (/instagram\.com\/|^@[\w.]+$/i.test(v)) out.instagram = v.startsWith("@") ? v : v.replace(/\?.*$/, "");
  else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) out.email = v;
  else if (/wa\.me\/|whatsapp|api\.whatsapp/i.test(v) || v.replace(/\D/g, "").length >= 10) {
    const digits = v.replace(/\D/g, "");
    const d = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
    out.phone = d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : v;
  } else if (/^https?:\/\//i.test(v) || /\.\w{2,}(\/|$)/.test(v)) out.website = v.startsWith("http") ? v : "https://" + v;
  out.channel = out.instagram ? "Instagram" : out.email ? "E-mail" : out.phone ? "WhatsApp" : out.website ? "Site" : "";
  return out;
}

function newContact(data) {
  return {
    id: "c-" + uid(),
    kind: ui.kind,
    order: Date.now(),
    status: "A enviar",
    owner: "",
    priority: "Normal",
    city: "Pau dos Ferros",
    message: DEFAULT_MESSAGE,
    followupMessage: DEFAULT_FOLLOWUP,
    history: [],
    source: `Adicionado por ${actor()}`,
    createdAt: now(),
    ...data
  };
}

function quickAddForm() {
  const cats = [...new Set(Store.contacts.map(c => c.category).filter(Boolean))].sort();
  modal(`
  <span class="kicker">mais uma porta pra bater</span>
  <h2>Novo contato</h2>
  <form id="quick-form" class="form">
    <div class="field"><label for="q-handle">Cole o WhatsApp, @, link ou e-mail</label><input id="q-handle" name="handle" autocomplete="off" placeholder="ex.: (84) 99999-0000 ou instagram.com/loja" autofocus><span class="detect" id="q-detect"></span></div>
    <div class="field-grid">
      <div class="field"><label for="q-name">Nome do negócio *</label><input id="q-name" name="name" required></div>
      <div class="field"><label for="q-person">Pessoa de contato</label><input id="q-person" name="person" placeholder="opcional"></div>
      <div class="field"><label for="q-category">Tipo</label><input id="q-category" name="category" list="q-cats" placeholder="Saúde, Academia…"><datalist id="q-cats">${cats.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
      <div class="field"><label for="q-city">Cidade</label><input id="q-city" name="city" value="Pau dos Ferros"></div>
    </div>
    <div class="field"><label for="q-message">Mensagem</label><textarea id="q-message" name="message">${esc(fillTemplate(DEFAULT_MESSAGE, {}))}</textarea></div>
    <label class="check"><input type="checkbox" name="already"> Já mandei mensagem pra esse contato</label>
    <div class="form-actions"><button class="btn primary" type="submit">Adicionar ✓</button><button class="btn" type="submit" name="go" value="turbo">Adicionar e mandar agora ⚡︎</button></div>
  </form>`);
  const detect = () => { const p = parseHandle($("#q-handle").value); $("#q-detect").textContent = p.channel ? `✓ ${p.channel} detectado` : ""; };
  $("#q-handle").oninput = detect;
  $("#quick-form").onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const goTurbo = e.submitter?.value === "turbo";
    const c = newContact({ name: f.name.trim(), person: f.person.trim(), category: f.category.trim(), city: f.city.trim(), message: f.message, ...parseHandle(f.handle) });
    if (!c.name) return;
    log(c, "Contato adicionado", "add");
    if (f.already) {
      c.status = "Aguardando resposta";
      c.sentAt = now();
      c.owner = actor();
      c.returnAt = addDays(3);
      log(c, "Mandou a primeira mensagem", "sent");
    }
    Store.saveContact(c);
    $("#modal").close();
    toast(`${shortName(c)} entrou na roda ✓`);
    if (goTurbo && !f.already) {
      ui.turbo.mode = "novos";
      ui.turbo.first = c.id;
      if (route() === "turbo") { buildQueue(); render(); } else location.hash = "turbo";
    }
  };
}

function bulkAddForm() {
  modal(`
  <span class="kicker">modo atacadão</span>
  <h2>Colar vários contatos</h2>
  <p class="hint">Um por linha, separado por <b>;</b> ou <b>tab</b> (dá pra colar direto da planilha): <code>Nome; contato; tipo; cidade</code></p>
  <form id="bulk-form" class="form">
    <textarea id="bulk-text" rows="8" placeholder="Ótica Visão; (84) 99999-1111; Ótica; Pau dos Ferros&#10;Academia Fit; @academiafit; Academia; Encanto"></textarea>
    <p class="hint" id="bulk-preview">Nada pra importar ainda.</p>
    <div class="form-actions"><button class="btn primary" type="submit">Importar</button></div>
  </form>`);
  const parse = () => $("#bulk-text").value.split("\n").map(l => l.split(/\t|;/).map(x => x.trim())).filter(p => p[0]);
  $("#bulk-text").oninput = () => { const n = parse().length; $("#bulk-preview").textContent = n ? `${n} contato${n > 1 ? "s" : ""} prontos pra entrar.` : "Nada pra importar ainda."; };
  $("#bulk-form").onsubmit = e => {
    e.preventDefault();
    const lines = parse();
    lines.forEach(([name, handle, category, city], i) => {
      const c = newContact({ name, category: category || "", city: city || "Pau dos Ferros", order: Date.now() + i, ...parseHandle(handle) });
      log(c, "Contato adicionado em lote", "add");
      Store.saveContact(c, { silent: true });
    });
    $("#modal").close();
    render();
    toast(`${lines.length} contatos novos na fila`);
  };
}

function editContactForm(c) {
  const fields = [["name", "Nome *"], ["person", "Pessoa de contato"], ["category", "Tipo"], ["city", "Cidade"], ["phone", "WhatsApp"], ["instagram", "Instagram (@ ou link)"], ["email", "E-mail"], ["website", "Site"], ["telephone", "Telefone fixo"], ["price", "Preço de referência"], ["proposal", "Proposta (criar, melhorar…)"]];
  modal(`
  <span class="kicker">ficha do contato</span>
  <h2>Editar ${esc(shortName(c))}</h2>
  <form id="edit-form" class="form">
    <div class="field-grid">${fields.map(([k, l]) => `<div class="field"><label for="e-${k}">${l}</label><input id="e-${k}" name="${k}" value="${esc(c[k] || "")}" ${k === "name" ? "required" : ""}></div>`).join("")}
      <div class="field"><label for="e-channel">Canal principal</label><select id="e-channel" name="channel">${opts(["WhatsApp", "Instagram", "E-mail", "Site", "Telefone"], c.channel === "Fixo" ? "Telefone" : c.channel)}</select></div>
      <div class="field"><label for="e-priority">Prioridade</label><select id="e-priority" name="priority">${opts(["Alta", "Normal", "Baixa"], c.priority || "Normal")}</select></div>
    </div>
    <div class="field"><label for="e-message">Mensagem de primeiro contato</label><textarea id="e-message" name="message">${esc(c.message || "")}</textarea></div>
    <div class="field"><label for="e-followup">Mensagem de retorno</label><textarea id="e-followup" name="followupMessage">${esc(c.followupMessage || "")}</textarea></div>
    <p class="hint">Variáveis: {oi} {nome} {empresa} {eu} {cidade} {preco} {prazo}</p>
    <div class="form-actions"><button class="btn primary" type="submit">Salvar ✓</button></div>
  </form>`);
  $("#edit-form").onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!data.name.trim()) return;
    Object.assign(c, data);
    log(c, "Editou a ficha", "edit");
    Store.saveContact(c);
    $("#modal").close();
    if ($("#drawer").open) renderDrawer();
    toast("Ficha atualizada ✓");
  };
}

function modal(html) {
  $("#modal-content").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
}

function fullDate(v) {
  return v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : "não definido";
}

function taskText(p, t) {
  return [
    `TAREFA: ${t.name}`, `Projeto: ${p.name}`, `Para quem: ${t.recipient || p.client || "Projeto interno"}`, `Responsável: ${t.owner || "Dupla"}`, `Status: ${t.status}`, `Prioridade: ${t.priority || "Normal"}`, `Prazo: ${fullDate(t.deadline)}`, `Entrega: ${t.delivery || "não especificada"}`,
    t.description && `\nDESCRIÇÃO\n${t.description}`,
    t.checklist?.length && `\nPARA CONCLUIR\n${t.checklist.map(x => `[${x.done ? "x" : " "}] ${x.text}`).join("\n")}`,
    t.links && `\nLINKS\n${t.links}`,
    t.notes && `\nNOTAS\n${t.notes}`
  ].filter(Boolean).join("\n");
}

function projectText(p, withTasks = true) {
  return [
    `PROJETO: ${p.name}`, `Cliente: ${p.client || "Projeto interno"}`, `Responsável: ${p.owner || "Dupla"}`, `Status: ${p.status}`, `Prazo: ${fullDate(p.deadline)}`, `Entrega: ${p.delivery || "não especificada"}`, p.value && `Valor: ${p.value}`,
    p.description && `\nBRIEFING\n${p.description}`,
    p.scope && `\nESCOPO E APROVAÇÃO\n${p.scope}`,
    p.url && `\nEntrega: ${p.url}`, p.repository && `Repositório: ${p.repository}`,
    p.notes && `\nNOTAS\n${p.notes}`,
    withTasks && p.tasks?.length && `\nTAREFAS (${p.tasks.filter(t => t.status === "Feito").length}/${p.tasks.length} feitas)\n\n${p.tasks.map(t => taskText(p, t)).join("\n\n----------\n\n")}`
  ].filter(Boolean).join("\n");
}

const input = (id, name, label, value, type = "text", req = false) => `<div class="field"><label for="${id}">${label}${req ? " *" : ""}</label><input id="${id}" name="${name}" type="${type}" value="${esc(value || "")}" ${req ? "required" : ""}></div>`;
const area = (id, name, label, value, ph = "") => `<div class="field full"><label for="${id}">${label}</label><textarea id="${id}" name="${name}" placeholder="${esc(ph)}">${esc(value || "")}</textarea></div>`;
const sel = (id, name, label, values, value) => `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${name}">${opts(values, value)}</select></div>`;

function projectForm(contact, project) {
  const p = project || { client: contact ? shortName(contact) : "", owner: actor(), status: "Em andamento", value: contact?.price || "" };
  modal(`
  <span class="kicker">configurações do projeto</span>
  <h2>${project ? "Tudo combinado, num lugar só" : "Bora organizar esse trabalho"}</h2>
  <form id="project-form" class="form"><div class="field-grid">
    ${input("p-name", "name", "Nome do projeto", p.name, "text", true)}${input("p-client", "client", "Cliente", p.client)}
    ${area("p-description", "description", "Briefing e objetivo", p.description, "Que problema vamos resolver? O que foi combinado?")}
    ${sel("p-owner", "owner", "Quem cuida", ["Kellyson", "Jeyce", "Dupla"], p.owner)}${sel("p-status", "status", "Situação", ["Em andamento", "Em revisão", "Entregue"], p.status)}
    ${input("p-deadline", "deadline", "Prazo", p.deadline, "date")}${input("p-value", "value", "Valor combinado", p.value)}
    ${input("p-delivery", "delivery", "O que será entregue", p.delivery)}${input("p-url", "url", "Link da entrega", p.url, "url")}
    ${input("p-repository", "repository", "Repositório / arquivos", p.repository, "url")}
    ${area("p-scope", "scope", "Escopo e critérios de aprovação", p.scope, "Como saber que está pronto?")}
    ${area("p-notes", "notes", "Notas e combinados", p.notes)}
  </div><div class="form-actions"><button class="btn primary" type="submit">Salvar projeto ✓</button><button class="btn" type="button" id="copy-project-form">⧉ Copiar briefing</button>${project ? '<button class="btn danger" type="button" id="delete-project">Excluir</button>' : ""}</div></form>`);
  $("#copy-project-form").onclick = () => copy(projectText({ ...p, ...Object.fromEntries(new FormData($("#project-form"))) }, false), "Briefing copiado");
  if (project) $("#delete-project").onclick = () => {
    const snap = JSON.parse(JSON.stringify(project));
    Store.removeProject(project.id);
    ui.openProject = null;
    $("#modal").close();
    toast("Projeto excluído", () => Store.saveProject(snap));
  };
  $("#project-form").onsubmit = e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!data.name.trim()) return;
    let saved = project;
    if (saved) Object.assign(saved, data, { updatedAt: now() });
    else saved = { ...data, id: "p-" + uid(), contactId: contact?.id || "", tasks: [], createdAt: now() };
    Store.saveProject(saved);
    if (contact && !project) {
      log(contact, `Virou o projeto “${saved.name}”`, "project");
      Store.saveContact(contact, { silent: true });
    }
    $("#modal").close();
    $("#drawer").close();
    ui.openProject = saved.id;
    Store.local.write("open-project", saved.id);
    ui.projectTab = "Todos";
    if (route() !== "projetos") location.hash = "projetos";
    else render();
    toast("Projeto salvo ✓");
  };
}

function taskForm(p, task) {
  const t = task || { owner: actor(), status: "A fazer", priority: "Normal", recipient: p.client || "", deadline: p.deadline || "", checklist: [] };
  modal(`
  <span class="kicker">${esc(p.name)} / tarefa</span>
  <h2>${task ? "Detalhes da tarefa" : "O que precisa ser feito?"}</h2>
  <form id="task-form" class="form"><div class="field-grid">
    <div class="field full"><label for="t-name">Título *</label><input id="t-name" name="name" value="${esc(t.name || "")}" required></div>
    ${area("t-description", "description", "Descrição e contexto", t.description, "Explique o que fazer e por quê. Dá para colar direto no agente.")}
    ${sel("t-owner", "owner", "Responsável", ["Kellyson", "Jeyce", "Dupla"], t.owner)}${sel("t-status", "status", "Andamento", TASK_STATES, t.status)}
    ${input("t-recipient", "recipient", "Para quem / solicitante", t.recipient)}${input("t-deadline", "deadline", "Data da entrega", t.deadline, "date")}
    ${sel("t-priority", "priority", "Prioridade", ["Baixa", "Normal", "Alta", "Urgente"], t.priority || "Normal")}${input("t-delivery", "delivery", "Entrega esperada", t.delivery)}
    ${area("t-criteria", "criteria", "Checklist de conclusão (um por linha)", (t.checklist || []).map(x => x.text).join("\n"), "Ex.: formulário funcionando no celular")}
    ${area("t-links", "links", "Links e referências", t.links)}
    ${area("t-notes", "notes", "Notas e combinados", t.notes)}
  </div><div class="form-actions"><button class="btn primary" type="submit">Salvar tarefa ✓</button><button class="btn" type="button" id="copy-task-form">⧉ Copiar tudo</button>${task ? '<button class="btn danger" type="button" id="delete-task">Excluir</button>' : ""}</div></form>`);
  const draft = () => {
    const d = Object.fromEntries(new FormData($("#task-form")));
    const checklist = d.criteria.split("\n").map(x => x.trim()).filter(Boolean).map(text => ({ text, done: t.checklist?.find(x => x.text === text)?.done || false }));
    delete d.criteria;
    return { ...t, ...d, checklist };
  };
  $("#copy-task-form").onclick = () => copy(taskText(p, draft()), "Tarefa copiada");
  if (task) $("#delete-task").onclick = () => { p.tasks = p.tasks.filter(x => x.id !== task.id); Store.saveProject(p); $("#modal").close(); toast("Tarefa excluída"); };
  $("#task-form").onsubmit = e => {
    e.preventDefault();
    const d = draft();
    if (!d.name.trim()) return;
    if (task) Object.assign(task, d, { updatedAt: now() });
    else p.tasks.push({ ...d, id: "t-" + uid(), createdAt: now() });
    Store.saveProject(p);
    $("#modal").close();
    toast("Tarefa salva ✓");
  };
}

function demoProject() {
  const p = {
    id: "p-" + uid(), name: "LabDemo", client: "Exemplo · agendamento de exames", status: "Em andamento", owner: "Dupla", createdAt: now(),
    description: "Protótipo de agendamento online de exames para mostrar a laboratórios e clínicas da lista.",
    tasks: ["Configurar o projeto", "Página de unidades", "Catálogo com busca", "Página do exame", "Agendar: unidade e exames", "Agendar: dia e horário", "Agendar: confirmação", "Painel da recepção"].map((name, i) => ({ id: "t-" + uid(), name, owner: i ? "Jeyce" : "Kellyson", status: "A fazer", priority: "Normal", checklist: [] }))
  };
  Store.saveProject(p);
  ui.openProject = p.id;
  Store.local.write("open-project", p.id);
  render();
}

function projectsPage() {
  const list = [...Store.projects].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)).filter(p => ui.projectTab === "Todos" || (ui.projectTab === "Entregues" ? p.status === "Entregue" : p.status !== "Entregue"));
  const open = projectById(ui.openProject);
  return pageHead("da conversa à entrega", "Projetos", "Cada cliente fechado vira um projeto com briefing, tarefas e entrega.", '<button class="btn primary" data-action="new-project" type="button">＋ Novo projeto</button>') + `
  <div class="seg small">${["Em andamento", "Entregues", "Todos"].map(t => `<button class="${ui.projectTab === t ? "on" : ""}" data-action="project-tab" data-tab="${t}" type="button">${t}</button>`).join("")}</div>
  <div class="projects-grid">${list.map((p, i) => { const done = p.tasks.filter(t => t.status === "Feito").length; return `
    <article class="project-card rise ${open?.id === p.id ? "on" : ""}" style="--i:${i}" data-pid="${p.id}">
      <div class="pc-top"><span class="pill tone-${p.status === "Entregue" ? "win" : p.status === "Em revisão" ? "reply" : "wait"}">${esc(p.status)}</span><span>${esc(p.owner || "Dupla")}</span></div>
      <h3>${esc(p.name)}</h3><p>${esc(p.client || "Projeto interno")}</p>
      <div class="meter thin"><div style="width:${p.tasks.length ? (done / p.tasks.length) * 100 : 0}%"></div></div>
      <div class="pc-foot"><span>${done}/${p.tasks.length} tarefas</span><span>${p.deadline ? "prazo " + esc(fmtDay(p.deadline)) : "sem prazo"}</span></div>
      <button class="btn small" data-action="open-project" data-id="${p.id}" type="button">${open?.id === p.id ? "Aberto ↓" : "Abrir ↗"}</button>
    </article>`; }).join("") || `<div class="empty"><div class="big-emoji">▤</div><h2>${ui.projectTab === "Entregues" ? "As entregas aparecem aqui." : "Nenhum projeto ainda."}</h2><p>Quando um cliente fechar, crie o projeto pela ficha dele.</p><button class="btn" data-action="demo-project" type="button">Ver exemplo com o LabDemo</button></div>`}</div>
  ${open ? projectWorkspace(open) : ""}`;
}

function dueInfo(t) {
  if (!t.deadline || t.status === "Feito") return null;
  const diff = Math.round((new Date(t.deadline + "T12:00:00") - new Date(today() + "T12:00:00")) / 864e5);
  if (diff < 0) return { cls: "late", label: diff === -1 ? "atrasada 1 dia" : `atrasada ${-diff} dias` };
  if (diff === 0) return { cls: "soon", label: "vence hoje" };
  if (diff === 1) return { cls: "soon", label: "vence amanhã" };
  return { cls: "", label: fmtDay(t.deadline) };
}

function taskToolbar(p) {
  const done = p.tasks.filter(t => t.status === "Feito").length;
  const late = p.tasks.filter(t => dueInfo(t)?.cls === "late").length;
  const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
  return `<div class="task-toolbar">
    <div class="ws-progress"><div class="meter thin"><div style="width:${pct}%"></div></div><span><b>${done}/${p.tasks.length}</b> feitas · ${pct}%${late ? ` · <em class="late-count">${late} atrasada${late > 1 ? "s" : ""}</em>` : ""}</span></div>
    <div class="seg small" role="group" aria-label="Filtrar tarefas por responsável">${["Todos", "Kellyson", "Jeyce", "Dupla"].map(o => `<button class="${ui.taskOwner === o ? "on" : ""}" data-action="task-owner" data-owner="${o}" type="button">${o === "Todos" ? "Todos" : personDot(o === "Dupla" ? "" : o) + o}</button>`).join("")}</div>
  </div>`;
}

function taskCard(p, t) {
  const due = dueInfo(t);
  const doneItems = t.checklist?.filter(x => x.done).length || 0;
  const total = t.checklist?.length || 0;
  return `<article class="task ${t.status === "Feito" ? "is-done" : ""}" data-task="${t.id}">
    <div class="task-top"><span class="grip" aria-hidden="true">⋮⋮</span>${personDot(t.owner === "Dupla" ? "" : t.owner)}<span>${esc(t.owner || "Dupla")}</span>${t.priority && t.priority !== "Normal" ? `<span class="prio p-${esc(t.priority.toLowerCase())}">${esc(t.priority)}</span>` : ""}</div>
    <button class="task-title" data-action="edit-task" data-project="${p.id}" data-id="${t.id}" type="button">${esc(t.name)}</button>
    ${t.description ? `<p class="task-desc">${esc(t.description)}</p>` : ""}
    <div class="task-facts">${due ? `<span class="due ${due.cls}">◷ ${esc(due.label)}</span>` : ""}${t.recipient ? `<span>↗ ${esc(t.recipient)}</span>` : ""}${t.delivery ? `<span>▤ ${esc(t.delivery)}</span>` : ""}</div>
    ${total ? `<div class="check-bar" title="${doneItems} de ${total} critérios"><i style="width:${(doneItems / total) * 100}%"></i></div><details class="checklist"><summary>✓ ${doneItems}/${total} critérios</summary>${t.checklist.map((x, i) => `<label><input type="checkbox" data-field="criterion" data-project="${p.id}" data-id="${t.id}" data-index="${i}" ${x.done ? "checked" : ""}><span>${esc(x.text)}</span></label>`).join("")}</details>` : ""}
    <div class="task-controls"><select data-field="task-status" data-project="${p.id}" data-id="${t.id}" aria-label="Andamento de ${esc(t.name)}">${opts(TASK_STATES, t.status)}</select></div>
    <div class="task-actions"><button class="link" data-action="edit-task" data-project="${p.id}" data-id="${t.id}" type="button">detalhar</button><button class="link" data-action="copy-task" data-project="${p.id}" data-id="${t.id}" type="button">⧉ copiar</button></div>
  </article>`;
}

function taskLane(p, st) {
  const visible = p.tasks.filter(t => t.status === st && (ui.taskOwner === "Todos" || (t.owner || "Dupla") === ui.taskOwner));
  return `<section class="lane lane-${TASK_STATES.indexOf(st)}"><header>${st}<small>${p.tasks.filter(t => t.status === st).length}</small></header><div class="lane-body" data-status="${st}" data-project="${p.id}">${visible.map(t => taskCard(p, t)).join("")}</div><form class="quick-task" data-project="${p.id}" data-status="${st}"><input name="name" placeholder="＋ Adicionar tarefa" aria-label="Nova tarefa em ${st}" autocomplete="off" maxlength="140"></form></section>`;
}

function syncBoard(p) {
  const pool = new Map(p.tasks.map(t => [t.id, t]));
  const next = [];
  let finished = 0;
  $$(".lane-body[data-status]").forEach(body => {
    $$(".task[data-task]", body).forEach(el => {
      const t = pool.get(el.dataset.task);
      if (!t) return;
      if (t.status !== body.dataset.status) {
        if (body.dataset.status === "Feito") finished++;
        t.status = body.dataset.status;
        t.updatedAt = now();
      }
      next.push(t);
      pool.delete(t.id);
    });
  });
  p.tasks = [...next, ...pool.values()];
  p.updatedAt = now();
  Store.saveProject(p, { silent: true });
  render();
  if (finished) toast(pick(["Tarefa feita. Próxima!", "Riscou da lista.", "Feito. Bom trabalho."]));
}

function initBoards() {
  if (!window.Sortable) return;
  const p = projectById(ui.openProject);
  if (!p) return;
  $$(".lane-body[data-status]").forEach(body => {
    Sortable.create(body, {
      group: "tasks-" + p.id,
      animation: 220,
      easing: "cubic-bezier(.2, .8, .2, 1)",
      ghostClass: "task-ghost",
      chosenClass: "task-chosen",
      dragClass: "task-drag",
      delay: 160,
      delayOnTouchOnly: true,
      forceFallback: true,
      fallbackOnBody: true,
      fallbackTolerance: 5,
      swapThreshold: 0.6,
      scroll: true,
      scrollSensitivity: 90,
      scrollSpeed: 14,
      bubbleScroll: true,
      filter: "input, select, textarea, summary, label, a, .select-wrap, .task-actions, .task-controls",
      preventOnFilter: false,
      onChoose: () => window.getSelection()?.removeAllRanges(),
      onStart: () => { window.getSelection()?.removeAllRanges(); document.body.classList.add("dragging-task"); },
      onMove: evt => { $$(".lane.drop-target").forEach(l => l.classList.remove("drop-target")); evt.to.closest(".lane")?.classList.add("drop-target"); },
      onEnd: () => { ui.dragEndAt = Date.now(); document.body.classList.remove("dragging-task"); $$(".lane.drop-target").forEach(l => l.classList.remove("drop-target")); window.getSelection()?.removeAllRanges(); syncBoard(p); }
    });
  });
  const grid = $(".projects-grid");
  if (grid && !grid.dataset.sortable) {
    grid.dataset.sortable = "1";
    Sortable.create(grid, {
      animation: 180,
      draggable: ".project-card",
      filter: "button, a",
      preventOnFilter: false,
      forceFallback: true,
      fallbackTolerance: 4,
      ghostClass: "task-ghost",
      onEnd: () => {
        $$(".project-card[data-pid]", grid).forEach((el, i) => { const pr = projectById(el.dataset.pid); if (pr && pr.order !== i) { pr.order = i; Store.saveProject(pr, { silent: true }); } });
      }
    });
  }
}

function projectWorkspace(p) {
  return `<section class="workspace" id="workspace">
    <header class="ws-head"><div><span class="kicker">${esc(p.client || "interno")}</span><h2>${esc(p.name)}</h2></div>
      <div class="head-actions"><button class="btn small" data-action="copy-project" data-id="${p.id}" type="button">⧉ Tudo</button><button class="btn small" data-action="copy-brief" data-id="${p.id}" type="button">⧉ Briefing</button><button class="btn small" data-action="edit-project" data-id="${p.id}" type="button">⚙ Configurar</button><button class="btn small primary" data-action="add-task" data-id="${p.id}" type="button">＋ Tarefa</button></div></header>
    <div class="facts">${[["quem cuida", p.owner || "Dupla"], ["prazo", fullDate(p.deadline)], ["situação", p.status], ["entrega", p.delivery || "a combinar"], ["valor", p.value || "—"]].map(([k, v]) => `<div><span>${k}</span><strong>${esc(v)}</strong></div>`).join("")}</div>
    ${p.description ? `<p class="brief">${esc(p.description)}</p>` : ""}
    <div class="ws-links">${[["Entrega", p.url], ["Repositório", p.repository]].map(([l, u]) => safeUrl(u) ? `<a class="btn small" href="${esc(safeUrl(u))}" target="_blank" rel="noopener">${l} ↗</a>` : "").join("")}</div>
    <details class="notebook"><summary>✎ Notas e escopo</summary><div class="field-grid">
      <div class="field"><label for="ws-notes">Notas compartilhadas</label><textarea id="ws-notes" data-field="project-notes" data-id="${p.id}">${esc(p.notes || "")}</textarea></div>
      <div class="field"><label for="ws-scope">Escopo e aprovação</label><textarea id="ws-scope" data-field="project-scope" data-id="${p.id}">${esc(p.scope || "")}</textarea></div>
    </div></details>
    ${taskToolbar(p)}
    <div class="board-wrap"><div class="tasks-board">${TASK_STATES.map(st => taskLane(p, st)).join("")}</div></div>
  </section>`;
}

function libraryPage() {
  const files = [["Proposta comercial", "Escopo e preço para mandar depois da conversa.", "modelos/proposta_comercial.docx", "01"], ["Sequência de e-mails", "Primeiro contato, retorno, pós-conversa e cobrança.", "divulgacao/emails.md", "02"], ["Instagram", "Bio, legendas e como prospectar sem falar com estranhos.", "divulgacao/instagram.md", "03"], ["Declarações", "Modelos para contratação pública.", "modelos/declaracoes_contratacao.docx", "04"], ["Atestado técnico", "Para o cliente emitir depois da entrega.", "modelos/atestado_capacidade_tecnica_modelo.docx", "05"], ["Tratamento de dados", "Termo de LGPD para os sistemas.", "modelos/termo_tratamento_dados.docx", "06"], ["Abrir a empresa", "Passo a passo do CNPJ sem contador.", "empresa_sem_contador.md", "07"]];
  return pageHead("o arsenal", "Materiais", "Modelos e arquivos do kit para a hora de mandar proposta.") + `
  <div class="library">${files.map(([t, d, u, e], i) => `<a class="lib-card rise" style="--i:${i}" href="kit/${u}" download><span class="lib-emoji">${e}</span><h3>${t}</h3><p>${d}</p><span class="link">baixar ↓</span></a>`).join("")}
  <button class="lib-card rise" style="--i:7" data-action="settings" type="button"><span class="lib-emoji">⚙</span><h3>Metas e ajustes</h3><p>Meta semanal de cada um e prazos dos lembretes.</p><span class="link">ajustar →</span></button>
  <a class="lib-card rise" style="--i:8" href="#prefeituras"><span class="lib-emoji">08</span><h3>Prefeituras</h3><p>79 secretarias guardadas para depois do CNPJ.</p><span class="link">abrir →</span></a>
  <a class="lib-card rise" style="--i:9" href="plano-original.html" target="_blank" rel="noopener"><span class="lib-emoji">09</span><h3>Plano original</h3><p>Rota Alto Oeste: projeção, preços e contatos.</p><span class="link">abrir ↗</span></a></div>`;
}

function authPage() {
  if (Store.user && !Store.member) {
    return `<section class="auth rise" style="--i:0"><div class="big-emoji">→</div><h1>Quase lá.</h1><p>Você entrou como <strong>${esc(Store.user.email)}</strong>, mas esse usuário ainda não está na lista da dupla.</p><p class="hint">Peça para adicionar o e-mail na tabela <code>members</code> do Supabase.</p><button class="btn" data-action="sign-out" type="button">Sair</button></section>`;
  }
  return `<section class="auth rise" style="--i:0">
    <span class="kicker">área restrita da dupla</span><h1>Entra aí</h1><p>Só Kellyson e Jeyce passam daqui.</p>
    <form id="auth-form" class="form">
      <div class="field"><label for="a-user">Usuário</label><input id="a-user" name="user" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="kellyson ou jeyce" required></div>${input("a-password", "password", "Senha", "", "password", true)}
      <div class="form-actions"><button class="btn primary grow" type="submit">Entrar</button></div>
      <p class="hint" id="auth-msg">${esc(Store.error || "")}</p>
    </form></section>`;
}

function render() {
  if (!Store.ready) {
    $("#app").innerHTML = '<div class="loading"><span class="spinner"></span>Carregando os contatos…</div>';
    return;
  }
  document.body.classList.toggle("locked", Store.mode === "cloud" && !Store.member);
  renderChrome();
  const r = route();
  if (Store.mode === "cloud" && !Store.member) {
    $("#app").innerHTML = authPage();
    const form = $("#auth-form");
    if (form) form.onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const msg = $("#auth-msg");
      msg.textContent = "Um segundo…";
      try {
        const user = f.user.trim().toLowerCase();
        await Store.signIn(user.includes("@") ? user : `${user}@rota-studio.app`, f.password);
      } catch (err) {
        msg.textContent = /invalid login/i.test(err.message) ? "Usuário ou senha não batem" : err.message;
      }
    };
    return;
  }
  ui.kind = r === "prefeituras" ? "government" : "private";
  const pages = { inicio: homePage, turbo: turboPage, contatos: contactsPage, prefeituras: contactsPage, projetos: projectsPage, materiais: libraryPage };
  $("#app").innerHTML = (pages[r] || homePage)();
  bindPage();
  if (r === "projetos") initBoards();
}

function bindPage() {
  const s = $("#search");
  if (s) s.oninput = e => {
    ui.search = e.target.value;
    ui.limit = 30;
    const pos = e.target.selectionStart;
    render();
    const n = $("#search");
    n.focus();
    n.setSelectionRange(pos, pos);
  };
  $$("[data-card]").forEach(card => {
    card.ondragstart = e => { e.dataTransfer.setData("text/plain", card.dataset.card); card.classList.add("dragging"); };
    card.ondragend = () => card.classList.remove("dragging");
  });
  $$(".lane[data-drop]").forEach(lane => {
    lane.ondragover = e => { e.preventDefault(); lane.classList.add("over"); };
    lane.ondragleave = () => lane.classList.remove("over");
    lane.ondrop = e => {
      e.preventDefault();
      lane.classList.remove("over");
      const c = byId(e.dataTransfer.getData("text/plain"));
      const stage = STAGES.find(x => x.id === lane.dataset.stageId);
      if (c && stage && !stage.match(c)) {
        if (stage.drop === "Aguardando resposta") markSent(c);
        else setStatus(c, stage.drop);
      }
    };
  });
}

const actions = {
  open: el => openDrawer(el.dataset.id, el.dataset.template),
  copy: el => {
    const c = byId(el.dataset.id);
    const text = el.dataset.from === "drawer" ? $("#d-msg").value : el.dataset.from === "turbo" ? $("#turbo-msg").value : messageFor(c, el.dataset.mode);
    copy(text, claim(c) ? "Mensagem copiada · agora o contato é seu" : "Mensagem copiada");
  },
  go: el => {
    const c = byId(el.dataset.id);
    const text = el.dataset.from === "drawer" ? $("#d-msg").value : el.dataset.from === "turbo" ? $("#turbo-msg").value : messageFor(c, el.dataset.mode);
    claim(c);
    copyAndOpen(c, text, el.dataset.channel);
  },
  sent: el => markSent(byId(el.dataset.id), el.dataset.mode),
  "set-status": el => setStatus(byId(el.dataset.id), el.dataset.value),
  "set-owner": el => setOwner(byId(el.dataset.id), el.dataset.value),
  template: el => { ui.drawerTemplate = el.dataset.template; ui.drawerDraft = null; renderDrawer(); },
  "log-reply": el => { logReply(byId(el.dataset.id), $("#d-reply").value.trim()); ui.drawerTemplate = "meet"; ui.drawerDraft = null; },
  "return-in": el => { const c = byId(el.dataset.id); c.returnAt = addDays(Number(el.dataset.days)); Store.saveContact(c); toast(`Lembrete: retornar ${relDay(c.returnAt)} ⏰`); },
  "edit-contact": el => editContactForm(byId(el.dataset.id)),
  "quick-add": () => quickAddForm(),
  "bulk-add": () => bulkAddForm(),
  stage: el => { ui.stage = el.dataset.stage; ui.limit = 30; if (el.dataset.view) { ui.view = el.dataset.view; Store.local.write("view", ui.view); } if (route() !== "contatos" && route() !== "prefeituras") location.hash = "contatos"; else render(); },
  view: el => { ui.view = el.dataset.view; Store.local.write("view", ui.view); render(); },
  more: () => { ui.limit += 30; render(); },
  "turbo-mode": el => { ui.turbo.mode = el.dataset.mode; ui.turbo.sent = 0; buildQueue(); if (route() !== "turbo") location.hash = "turbo"; else render(); },
  "turbo-owner": el => { ui.turbo.owner = el.dataset.owner; buildQueue(); render(); },
  "turbo-sent": () => turboAdvance("sent"),
  "turbo-skip": () => turboAdvance("skip"),
  "turbo-back": () => turboAdvance("back"),
  "turbo-later": () => turboAdvance("later"),
  "turbo-replied": () => turboAdvance("replied"),
  settings: () => {
    const cfg = settings();
    modal(`<span class="kicker">ajustes da dupla</span><h2>Metas e lembretes</h2>
    <form id="settings-form" class="form">
      <div class="field-grid">${TEAM.map(p => `<div class="field"><label for="g-${p}">Meta semanal · ${p}</label><input id="g-${p}" name="goal-${p}" type="number" min="1" max="200" value="${goalOf(p)}"></div>`).join("")}
        <div class="field"><label for="s-return">Lembrar do retorno após o 1º contato (dias)</label><input id="s-return" name="returnDays" type="number" min="1" max="30" value="${cfg.returnDays}"></div>
        <div class="field"><label for="s-follow">Lembrar de novo após um retorno (dias)</label><input id="s-follow" name="followupDays" type="number" min="1" max="60" value="${cfg.followupDays}"></div>
      </div>
      <p class="hint">Vale para os dois e sincroniza na hora. A semana começa na segunda.</p>
      <div class="form-actions"><button class="btn primary" type="submit">Salvar ajustes</button></div>
    </form>`);
    $("#settings-form").onsubmit = e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      Store.saveSettings({ weeklyGoal: Object.fromEntries(TEAM.map(p => [p, Math.max(1, Number(f["goal-" + p]) || 8)])), returnDays: Math.max(1, Number(f.returnDays) || 3), followupDays: Math.max(1, Number(f.followupDays) || 5) });
      $("#modal").close();
      toast("Ajustes salvos");
    };
  },
  "new-project": el => projectForm(el.dataset.id ? byId(el.dataset.id) : null),
  "demo-project": () => demoProject(),
  "project-tab": el => { ui.projectTab = el.dataset.tab; render(); },
  "task-owner": el => { ui.taskOwner = el.dataset.owner; render(); },
  "open-project": el => {
    ui.openProject = el.dataset.id;
    Store.local.write("open-project", ui.openProject);
    if (route() !== "projetos") location.hash = "projetos";
    else { render(); $("#workspace")?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" }); }
  },
  "edit-project": el => projectForm(null, projectById(el.dataset.id)),
  "add-task": el => taskForm(projectById(el.dataset.id)),
  "edit-task": el => {
    if (Date.now() - (ui.dragEndAt || 0) < 300) return;
    const p = projectById(el.dataset.project);
    taskForm(p, p.tasks.find(t => t.id === el.dataset.id));
  },
  "copy-task": el => { const p = projectById(el.dataset.project); copy(taskText(p, p.tasks.find(t => t.id === el.dataset.id)), "Tarefa copiada"); },
  "copy-project": el => copy(projectText(projectById(el.dataset.id)), "Projeto completo copiado"),
  "copy-brief": el => copy(projectText(projectById(el.dataset.id), false), "Briefing copiado"),
  "reset-demo": () => {
    modal(`<h2>Restaurar a demonstração?</h2><p>Apaga os testes feitos neste navegador e volta aos dados do Miro.</p><div class="form-actions"><button class="btn danger" id="confirm-reset" type="button">Restaurar</button></div>`);
    $("#confirm-reset").onclick = () => { Store.resetDemo(); ui.turbo.built = false; $("#modal").close(); toast("Tudo como novo"); };
  },
  "sign-out": () => Store.signOut()
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  if (el.tagName === "A" && el.getAttribute("href")?.startsWith("#")) {
    e.preventDefault();
    const target = el.getAttribute("href").slice(1);
    fn(el);
    if (route() !== target && !["stage", "turbo-mode", "open-project"].includes(el.dataset.action)) location.hash = target;
    return;
  }
  fn(el);
});

document.addEventListener("change", e => {
  const el = e.target;
  const f = el.dataset?.field;
  if (el.id === "actor") {
    Store.local.write("actor", el.value);
    ui.turbo.built = false;
    toast(`Agora você é ${el.value}`);
    return render();
  }
  if (!f) return;
  const c = el.dataset.id ? byId(el.dataset.id) : null;
  if (f === "status") setStatus(c, el.value);
  else if (f === "owner") setOwner(c, el.value);
  else if (f === "owner-filter") { ui.owner = el.value; ui.limit = 30; render(); }
  else if (f === "category-filter") { ui.category = el.value; ui.limit = 30; render(); }
  else if (f === "turbo-category") { ui.turbo.category = el.value; buildQueue(); render(); }
  else if (f === "returnAt" || f === "meetingAt") {
    c[f] = el.value;
    if (f === "meetingAt" && el.value && !["Reunião marcada", "Interessado", "Proposta enviada", "Fechado"].includes(c.status)) { setStatus(c, "Reunião marcada"); return; }
    Store.saveContact(c);
  } else if (f === "task-status") {
    const p = projectById(el.dataset.project);
    const t = p.tasks.find(x => x.id === el.dataset.id);
    t.status = el.value;
    Store.saveProject(p);
    if (el.value === "Feito") toast(pick(["Tarefa feita ✓ Próxima!", "Riscou da lista. Que sensação boa", "Feito! O cliente nem imagina o esforço."]));
  } else if (f === "criterion") {
    const p = projectById(el.dataset.project);
    p.tasks.find(x => x.id === el.dataset.id).checklist[Number(el.dataset.index)].done = el.checked;
    Store.saveProject(p, { silent: true });
    const sum = el.closest("details").querySelector("summary");
    const list = p.tasks.find(x => x.id === el.dataset.id).checklist;
    sum.textContent = `✓ ${list.filter(x => x.done).length}/${list.length} critérios`;
  }
});

document.addEventListener("submit", e => {
  const form = e.target.closest(".quick-task");
  if (!form) return;
  e.preventDefault();
  const name = form.elements.name.value.trim();
  if (!name) return;
  const p = projectById(form.dataset.project);
  const owner = ui.taskOwner !== "Todos" ? ui.taskOwner : actor();
  p.tasks.push({ id: "t-" + uid(), name, owner, status: form.dataset.status, priority: "Normal", checklist: [], createdAt: now() });
  Store.saveProject(p, { silent: true });
  ui.pendingRender = false;
  render();
  const f = $(`.quick-task[data-status="${form.dataset.status}"] input`);
  if (f) f.focus();
});

document.addEventListener("input", e => {
  const el = e.target;
  const f = el.dataset?.field;
  if (!f) return;
  if (f === "turbo-msg") {
    const c = byId(el.dataset.id);
    c[el.dataset.mode] = el.value;
    Store.saveContact(c, { debounce: true, silent: true });
  } else if (f === "drawer-msg") {
    const c = byId(ui.drawerId);
    if (TEMPLATES.find(t => t.id === ui.drawerTemplate)?.stored) {
      c[ui.drawerTemplate] = el.value;
      Store.saveContact(c, { debounce: true, silent: true });
    } else ui.drawerDraft = el.value;
  } else if (f === "notes") {
    const c = byId(el.dataset.id);
    c.notes = el.value;
    Store.saveContact(c, { debounce: true, silent: true });
  } else if (f === "project-notes" || f === "project-scope") {
    const p = projectById(el.dataset.id);
    p[f === "project-notes" ? "notes" : "scope"] = el.value;
    Store.saveProject(p, { debounce: true, silent: true });
  }
});

document.addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (e.key === "/" && !typing && $("#search")) { e.preventDefault(); $("#search").focus(); return; }
  if (route() !== "turbo" || typing || e.ctrlKey || e.metaKey || e.altKey || $("#modal").open || $("#drawer").open) return;
  const card = $(".turbo-card");
  if (!card) return;
  const k = e.key.toLowerCase();
  if (k === "c") $('[data-action="copy"][data-from="turbo"]')?.click();
  else if (k === "a") $(".turbo-card .chan.main")?.click();
  else if (k === "e") turboAdvance("sent");
  else if (e.key === "ArrowRight") turboAdvance("skip");
  else if (e.key === "ArrowLeft") turboAdvance("back");
  else return;
  e.preventDefault();
});

$$("dialog .close").forEach(b => (b.onclick = () => b.closest("dialog").close()));
$$("dialog").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));
$("#drawer").addEventListener("close", () => { ui.drawerDraft = null; if (ui.pendingRender) { ui.pendingRender = false; render(); } });
$("#quick-add-top").onclick = () => quickAddForm();

function isEditing() {
  const a = document.activeElement;
  return a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== "checkbox";
}

Store.onChange((reason, detail) => {
  if (reason === "error") return toast("Ops, não salvou: " + detail);
  if (reason === "inbound") toast(`${detail} ${detail === 1 ? "pedido novo chegou" : "pedidos novos chegaram"} pelo site`);
  if (reason === "remote" && detail?.by && detail.by !== actor()) {
    const c = detail.table === "contacts" ? byId(detail.id) : projectById(detail.id);
    if (c) toast(`${detail.by} mexeu em ${shortName(c)}`);
  }
  if (reason === "load" || reason === "auth") ui.turbo.built = false;
  if ($("#drawer").open) {
    if (isEditing() && $("#drawer").contains(document.activeElement)) { ui.pendingRender = true; return; }
    renderDrawer();
    ui.pendingRender = true;
    return;
  }
  if (isEditing() && $("#app").contains(document.activeElement) && document.activeElement.id !== "search") { ui.pendingRender = true; return; }
  if (route() === "turbo" && reason !== "load" && reason !== "auth") return renderChrome();
  render();
});

document.addEventListener("focusout", () => setTimeout(() => {
  if (ui.pendingRender && !isEditing() && !$("#drawer").open && !$("#modal").open) { ui.pendingRender = false; render(); }
}, 0));

window.addEventListener("hashchange", () => {
  if (route() === "turbo") buildQueue();
  if (!["contatos", "prefeituras"].includes(route())) { ui.search = ""; }
  render();
  window.scrollTo(0, 0);
});

render();
Store.init().catch(err => { Store.error = err.message; Store.ready = true; render(); });
