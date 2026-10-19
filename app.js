const $ = s => document.querySelector(s), esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[c]));

const read = (k, d) => {
    try {
        return JSON.parse(localStorage.getItem("rota-demo-" + k)) ?? d;
    } catch {
        return d;
    }
}, write = (k, v) => localStorage.setItem("rota-demo-" + k, JSON.stringify(v));

const clone = x => JSON.parse(JSON.stringify(x));

let leads = read("leads", clone(window.LEADS)), gov = read("gov", CONTACTS.map((c, i) => ({
    id: "gov-" + i,
    name: c.municipio + " · " + c.secretaria,
    city: c.municipio,
    category: c.secretaria,
    kind: "government",
    status: "Mais tarde",
    owner: "",
    priority: "Normal",
    channel: c.whatsapp_oficial ? "WhatsApp" : "E-mail",
    phone: c.whatsapp_oficial || "",
    email: c.email_secretaria || c.email_prefeitura,
    instagram: c.instagram,
    telephone: c.telefone_secretaria || c.telefone_prefeitura,
    website: c.site,
    tip: c.sinais,
    notes: "Prefeituras ficam para depois, conforme nota de vocês no Miro.",
    message: `Olá! Somos Kellyson e Jeyce, desenvolvedores do Alto Oeste. Gostaríamos de conversar com a equipe de ${c.secretaria} sobre sistemas para facilitar o trabalho da secretaria. Qual seria o melhor contato?`,
    source: "Kit · contatos_prefeituras.csv",
    history: []
})));

let dashboardOwner = "Dupla";

let projects = read("projects", []), actor = read("actor", "Kellyson"), activeTab = "Todos", search = "", ownerFilter = "Todos", channelFilter = "Todos", page = 1, projectTab = "Em andamento", messageMode = "message";

const STATUSES = [ "A enviar", "Aguardando resposta", "Respondeu", "Reunião marcada", "Interessado", "Proposta enviada", "Fechado", "Sem interesse", "Mais tarde" ];

const TASK_STATES = [ "A fazer", "Fazendo", "Em revisão", "Feito" ];

const initials = s => s.split(" ").filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();

const all = () => [ ...leads, ...gov ];

const byId = id => all().find(c => c.id === id);

const route = () => location.hash.slice(1) || "inicio";

const persist = () => {
    write("leads", leads);
    write("gov", gov);
    write("projects", projects);
};

const now = () => (new Date).toISOString();

const fmt = d => d ? new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit"
}) : "Data não registrada";

const options = (vals, chosen) => vals.map(v => `<option value="${esc(v)}" ${v === chosen ? "selected" : ""}>${esc(v || "Sem responsável")}</option>`).join("");

const statusClass = s => s === "Aguardando resposta" ? "status-wait" : [ "Respondeu", "Reunião marcada", "Proposta enviada" ].includes(s) ? "status-reply" : [ "Interessado", "Fechado" ].includes(s) ? "status-win" : s === "Sem interesse" ? "status-no" : "status-new";

let toastTimer;

function toast(t) {
    clearTimeout(toastTimer);
    $("#toast").textContent = t;
    $("#toast").classList.add("show");
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3200);
}

function log(c, text) {
    c.history = c.history || [];
    c.history.unshift({
        text: text,
        actor: actor,
        at: now()
    });
}

function setStatus(c, status) {
    if (c.status !== status) {
        log(c, `Status: ${c.status} → ${status}`);
        c.status = status;
        if ([ "Respondeu", "Reunião marcada", "Interessado", "Sem interesse" ].includes(status) && !c.respondedAt) c.respondedAt = now();
        persist();
    }
    render();
}

function markSent(c) {
    c.sentAt = now();
    c.owner = c.owner || actor;
    c.status = "Aguardando resposta";
    log(c, "Envio marcado manualmente");
    persist();
    render();
    toast("Envio registrado. Na fila de respostas ✓");
}

function saveField(c, key, value) {
    c[key] = value;
    persist();
}

const safeUrl = u => {
    try {
        const p = new URL(u);
        return [ "http:", "https:" ].includes(p.protocol) ? p.href : "";
    } catch {
        return "";
    }
};

function channels(c, msg = c.message) {
    const result = [];
    const digits = (c.phone || "").replace(/\D/g, "");
    if (digits.length >= 10) result.push({
        name: "WhatsApp",
        url: `https://wa.me/${digits.startsWith("55") ? digits : "55" + digits}?text=${encodeURIComponent(msg || "")}`
    });
    if (c.instagram) {
        let u = c.instagram.startsWith("http") ? safeUrl(c.instagram) : "https://www.instagram.com/" + encodeURIComponent(c.instagram.replace(/^@/, "")) + "/";
        if (u) result.push({
            name: "Instagram",
            url: u
        });
    }
    if (c.email && c.email.includes("@")) result.push({
        name: "E-mail",
        url: `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(c.subject || "")}&body=${encodeURIComponent(msg || "")}`
    });
    if (c.website && safeUrl(c.website)) result.push({
        name: "Site",
        url: safeUrl(c.website)
    });
    if (c.telephone) result.push({
        name: "Telefone",
        url: "tel:" + c.telephone.replace(/[^+\d]/g, "")
    });
    if (!result.length && safeUrl(c.channelUrl)) result.push({
        name: c.channel || "Site",
        url: safeUrl(c.channelUrl)
    });
    return result.sort((a, b) => (b.name === c.channel) - (a.name === c.channel));
}

async function copyMessage(c, mode = "message") {
    const text = c[mode] || c.message || "";
    try {
        await navigator.clipboard.writeText(text);
        toast("Mensagem copiada. Pode colar no canal ↗");
        return true;
    } catch {
        toast("Cópia indisponível. Selecione a mensagem no painel.");
        return false;
    }
}

function copyOpen(c, mode = "message", channelName) {
    const link = channels(c, c[mode] || c.message).find(x => !channelName || x.name === channelName);
    if (!link) {
        openContact(c.id);
        toast("Adicione um canal na ficha do contato.");
        return;
    }
    window.open(link.url, "_blank", "noopener,noreferrer");
    copyMessage(c, mode);
}

const head = (title, desc, action = "") => `<section class="page-head"><div><span class="eyebrow">KELLYSON & JEYCE / NOSSO DIA A DIA</span><h1>${title}</h1><p>${desc}</p></div>${action}</section>`;

function nav() {
    const r = route();
    $("nav").innerHTML = `<a href="#inicio" class="${r === "inicio" ? "active" : ""}"><b>◈</b>Início</a><a href="#contatos" class="${r === "contatos" ? "active" : ""}"><b>☷</b>Contatos <small>${leads.length}</small></a><a href="#retornos" class="${r === "retornos" ? "active" : ""}"><b>↶</b>Sem resposta <small>${leads.filter(c => c.status === "Aguardando resposta").length}</small></a><a href="#projetos" class="${r === "projetos" ? "active" : ""}"><b>▦</b>Projetos <small>${projects.length}</small></a><div class="nav-separator">GUARDADO POR AQUI</div><a href="#governo" class="${r === "governo" ? "active" : ""}"><b>⌂</b>Prefeituras <small>depois</small></a><a href="#biblioteca" class="${r === "biblioteca" ? "active" : ""}"><b>▤</b>Materiais</a>`;
    $("#actor").value = actor;
    $("#breadcrumb").textContent = "Freelas Alto Oeste / " + ({
        contatos: "Contatos",
        inicio: "Início",
        retornos: "Sem resposta",
        projetos: "Projetos",
        governo: "Prefeituras",
        biblioteca: "Materiais"
    }[r] || "Contatos");
}

const count = s => leads.filter(c => Array.isArray(s) ? s.includes(c.status) : c.status === s).length;

function metrics() {
    return `<section class="summary">${[ [ "A enviar", "A enviar", "Ainda para conversar", "↗" ], [ "Aguardando resposta", "Sem resposta", "Na espera do “oi”", "◷" ], [ [ "Respondeu", "Reunião marcada", "Interessado", "Proposta enviada", "Fechado", "Sem interesse" ], "Responderam", "Conversa que andou", "↩" ], [ "Reunião marcada", "Reunião marcada", "Bora conversar de verdade", "✳" ], [ "Fechado", "Fechados", "Agora é entregar", "✓" ] ].map(([s, t, caption, icon]) => `<button data-metric="${Array.isArray(s) ? "Responderam" : s}"><span class="metric-title">${t}</span><span class="metric-icon">${icon}</span><strong class="metric-value">${String(count(s)).padStart(2, "0")}</strong><span class="metric-caption">${caption}</span></button>`).join("")}</section>`;
}

function matches(c, tab) {
    return tab === "Todos" || tab === "Responderam" && [ "Respondeu", "Reunião marcada", "Interessado", "Proposta enviada", "Fechado", "Sem interesse" ].includes(c.status) || c.status === tab;
}

function source() {
    return route() === "governo" ? gov : leads;
}

function filtered() {
    return source().filter(c => matches(c, route() === "retornos" ? "Aguardando resposta" : activeTab) && (!search || [ c.name, c.category, c.city, c.notes ].join(" ").toLowerCase().includes(search.toLowerCase())) && (ownerFilter === "Todos" || (ownerFilter === "Sem responsável" ? !c.owner : c.owner === ownerFilter)) && (channelFilter === "Todos" || channels(c).some(x => x.name === channelFilter)));
}

function contactsPage() {
    let g = route() === "governo", f = route() === "retornos";
    return head(g ? "Prefeituras, para depois." : f ? "Quem ainda não respondeu." : "Conversas que viram projetos.", g ? "Contatos do kit, separados da rotina de prospecção." : f ? "Retome a conversa sem precisar caçar a última mensagem." : "Copiar, conversar, atualizar. Tudo no mesmo lugar.", `<button class="btn" id="new-contact">＋ Novo contato</button>`) + (g ? '<div class="page-note">Nota de vocês: retomar prefeituras depois de organizar o CNPJ. Pau dos Ferros fica fora da prospecção enquanto Kellyson for estagiário de lá.</div>' : metrics()) + `<div class="work-layout"><section class="contact-area"><div class="list-panel">${!f ? `<div class="filter-tabs">${[ "Todos", "A enviar", "Aguardando resposta", "Responderam", "Interessado", "Fechado", "Sem interesse" ].map(t => `<button data-tab="${t}" class="${activeTab === t ? "active" : ""}">${t === "Aguardando resposta" ? "Sem resposta" : t}<small>${source().filter(c => matches(c, t)).length}</small></button>`).join("")}</div>` : ""}<div class="search-row"><label class="search-box"><span>⌕</span><input id="search" aria-label="Buscar contato" placeholder="Buscar empresa, pessoa ou cidade…" value="${esc(search)}"></label><select id="owner-filter" aria-label="Filtrar responsável">${options([ "Todos", "Kellyson", "Jeyce", "Sem responsável" ], ownerFilter)}</select><select id="channel-filter" aria-label="Filtrar canal">${options([ "Todos", "WhatsApp", "Instagram", "E-mail", "Site", "Telefone" ], channelFilter)}</select></div><div class="table-scroll"><table><thead><tr><th>CONTATO</th><th>STATUS</th><th>QUEM CUIDA</th><th>AÇÕES</th></tr></thead><tbody id="rows"></tbody></table></div><div class="table-foot"><span id="result-count"></span><div class="bottom-tools"><button class="icon-btn" id="prev" aria-label="Página anterior">‹</button><button class="icon-btn" id="next" aria-label="Próxima página">›</button></div></div></div><div class="below-list"><span>⧉ copiar · ↗ copiar e abrir canal · ✓ marcar envio</span><span>Dados de demonstração</span></div></section><aside class="right-rail">${rail()}</aside></div>`;
}

function rail() {
    const meeting = leads.find(c => c.status === "Reunião marcada"), waiting = leads.filter(c => c.status === "Aguardando resposta").slice(0, 3);
    return (meeting ? `<section class="rail-card meeting"><span class="eyebrow">✳ TEM CONVERSA BOA AQUI</span><h3>${esc(meeting.name.split(" - ")[0])}</h3><p>Reunião marcada<br>${meeting.meetingAt ? esc(new Date(meeting.meetingAt).toLocaleString("pt-BR")) : "Data e horário a registrar"}</p><button class="btn light" data-open="${meeting.id}">Abrir conversa <span>↗</span></button></section>` : "") + `<section class="rail-card"><div class="rail-head"><h2>No aguardo…</h2><span>◷</span></div>${waiting.map(c => `<div class="rail-item"><div><strong>${esc(c.name.split(" - ")[0])}</strong><small>${esc(c.channel)} · ${c.sentAt ? "enviado " + fmt(c.sentAt) : "envio sem data no Miro"}</small></div><button class="icon-btn" data-open="${c.id}" aria-label="Abrir ${esc(c.name)}">↗</button></div>`).join("") || '<p class="hint">Ninguém esperando resposta por aqui.</p>'}</section><section class="quiet-note"><span class="tiny-face">◡◡</span><strong>O vácuo não é um não.</strong><p>Mas três “oi, sumido” também não viram estratégia.</p></section>`;
}

function fillRows() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / 9));
    page = Math.min(page, pages);
    $("#rows").innerHTML = rows.slice((page - 1) * 9, page * 9).map((c, i) => `<tr><td><div class="contact-name"><span class="company-mark tone-${i % 4}">${esc(initials(c.name))}</span><button data-open="${c.id}">${esc(c.name.split(" - ")[0])}<small>${esc(c.category)} · ${esc(c.city)}</small></button></div></td><td><select data-status="${c.id}" class="row-select ${statusClass(c.status)}" aria-label="Status de ${esc(c.name)}">${options(STATUSES, c.status)}</select></td><td><select data-owner="${c.id}" class="owner-select" aria-label="Responsável por ${esc(c.name)}">${options([ "", "Kellyson", "Jeyce" ], c.owner)}</select></td><td><div class="row-actions"><button class="icon-btn" title="Copiar mensagem" aria-label="Copiar mensagem para ${esc(c.name)}" data-copy="${c.id}">⧉</button><button class="icon-btn" title="Copiar e abrir canal" aria-label="Copiar e abrir canal de ${esc(c.name)}" data-channel="${c.id}">↗</button><button class="icon-btn send-btn" title="Já enviei: marcar envio" aria-label="Marcar envio para ${esc(c.name)}" data-sent="${c.id}">✓</button></div></td></tr>`).join("") || '<tr><td colspan="4"><div class="empty"><strong>Ninguém por aqui.</strong>Tente outro filtro ou adicione um contato.</div></td></tr>';
    $("#result-count").textContent = `${rows.length ? (page - 1) * 9 + 1 : 0}–${Math.min(page * 9, rows.length)} de ${rows.length} contatos · página ${page}/${pages}`;
    $("#prev").disabled = page === 1;
    $("#next").disabled = page >= pages;
    bindActions($("#rows"));
    $("#rows").querySelectorAll("[data-status]").forEach(e => e.onchange = () => setStatus(byId(e.dataset.status), e.value));
    $("#rows").querySelectorAll("[data-owner]").forEach(e => e.onchange = () => {
        const c = byId(e.dataset.owner);
        saveField(c, "owner", e.value);
        fillRows();
        toast("Responsável atualizado");
    });
}

function bindActions(el) {
    el.querySelectorAll("[data-open]").forEach(b => b.onclick = () => openContact(b.dataset.open));
    el.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => copyMessage(byId(b.dataset.copy), route() === "retornos" ? "followupMessage" : "message"));
    el.querySelectorAll("[data-channel]").forEach(b => b.onclick = () => copyOpen(byId(b.dataset.channel), route() === "retornos" ? "followupMessage" : "message"));
    el.querySelectorAll("[data-sent]").forEach(b => b.onclick = () => markSent(byId(b.dataset.sent)));
}

function openContact(id) {
    const c = byId(id);
    messageMode = route() === "retornos" ? "followupMessage" : "message";
    $("#detail-content").innerHTML = `<span class="eyebrow">FICHA DO CONTATO <button class="subtle-btn" id="edit-contact">· editar dados</button></span><h2>${esc(c.name)}</h2><div class="drawer-sub">${esc(c.category)} · ${esc(c.city)} ${c.proposal ? " / " + esc(c.proposal) : ""}</div><div class="field-grid"><div class="field"><label for="detail-status">Andamento</label><select id="detail-status">${options(STATUSES, c.status)}</select></div><div class="field"><label for="detail-owner">Quem cuida</label><select id="detail-owner">${options([ "", "Kellyson", "Jeyce" ], c.owner)}</select></div><div class="field"><label for="return-date">Lembrar de retornar</label><input type="date" id="return-date" value="${esc(c.returnAt || "")}"></div><div class="field"><label for="meeting-date">Reunião</label><input type="datetime-local" id="meeting-date" value="${esc(c.meetingAt || "")}"></div></div>${c.notes ? `<div class="note">✎ ${esc(c.notes)}</div>` : ""}<div class="message-box"><div class="message-top">Mensagem <select id="message-mode" aria-label="Tipo de mensagem">${options([ "Primeiro contato", "Retorno" ], messageMode === "message" ? "Primeiro contato" : "Retorno")}</select></div><textarea id="message" aria-label="Mensagem para o contato">${esc(c[messageMode] || "")}</textarea><div class="message-actions"><button class="btn light" id="copy-message">⧉ Copiar</button><button class="btn lime" id="open-channel">Copiar e abrir canal ↗</button></div><div class="channel-options" id="channel-options"></div></div><div class="sent-strip"><p><strong>Já mandou a mensagem?</strong>Abrir o canal não registra o envio.</p><button class="btn small light" id="sent-confirm">✓ Já enviei</button></div><div class="field"><label for="notes">Notas de vocês</label><textarea id="notes" placeholder="O que respondeu, o que combinamos, o próximo passo…">${esc(c.notes || "")}</textarea></div><div class="section-title">Histórico</div><ul class="timeline" id="timeline"></ul><button class="btn light" id="make-project">＋ Criar projeto deste contato</button><details><summary>Contexto, proposta e fonte</summary><p>${esc(c.tip || "")}</p><p>${esc(c.price || "Sem preço registrado")}</p><p>${esc(c.context || "")}</p><p>${esc(c.source || "Adicionado na demonstração")}</p></details>`;
    $("#detail").showModal();
    $("#edit-contact").onclick = () => contactForm(c);
    $("#detail-status").onchange = e => {
        setStatus(c, e.target.value);
        updateTimeline(c);
    };
    $("#detail-owner").onchange = e => {
        saveField(c, "owner", e.target.value);
        render();
    };
    $("#return-date").onchange = e => saveField(c, "returnAt", e.target.value);
    $("#meeting-date").onchange = e => {
        saveField(c, "meetingAt", e.target.value);
        render();
    };
    $("#notes").oninput = e => saveField(c, "notes", e.target.value);
    $("#message").oninput = e => saveField(c, messageMode, e.target.value);
    $("#message-mode").onchange = e => {
        messageMode = e.target.value === "Retorno" ? "followupMessage" : "message";
        $("#message").value = c[messageMode] || "";
    };
    $("#copy-message").onclick = () => copyMessage(c, messageMode);
    $("#open-channel").onclick = () => copyOpen(c, messageMode);
    $("#sent-confirm").onclick = () => {
        markSent(c);
        $("#detail-status").value = c.status;
        $("#detail-owner").value = c.owner;
        updateTimeline(c);
    };
    $("#make-project").onclick = () => projectForm(c);
    $("#channel-options").innerHTML = channels(c).map(x => `<button class="subtle-btn" data-channel-name="${esc(x.name)}">${esc(x.name)} ↗</button>`).join("") || "Nenhum canal cadastrado. Edite os dados acima.";
    $("#channel-options").querySelectorAll("button").forEach(b => b.onclick = () => copyOpen(c, messageMode, b.dataset.channelName));
    updateTimeline(c);
}

function updateTimeline(c) {
    $("#timeline").innerHTML = (c.history || []).map(e => `<li>${esc(e.text)}<small>${esc(e.actor)} · ${fmt(e.at)}</small></li>`).join("") + `<li>Dados de exemplo importados do Miro<small>Datas e responsáveis ausentes não foram preenchidos.</small></li>`;
}

function contactForm(c) {
    const fields = [ [ "name", "Empresa ou pessoa", "text", true ], [ "category", "Segmento", "text" ], [ "city", "Cidade", "text" ], [ "phone", "WhatsApp com DDD", "tel" ], [ "instagram", "Instagram (@ ou URL)", "text" ], [ "email", "E-mail", "email" ], [ "website", "Site", "url" ], [ "telephone", "Telefone fixo", "tel" ] ];
    $("#form-content").innerHTML = `<h2>${c ? "Editar contato" : "Mais um contato na roda."}</h2><form id="contact-form"><div class="field-grid">${fields.map(([key, label, type, required]) => `<div class="field"><label for="f-${key}">${label}${required ? " *" : ""}</label><input id="f-${key}" name="${key}" type="${type}" value="${esc(c?.[key] || "")}" ${required ? "required" : ""}></div>`).join("")}<div class="field"><label for="f-owner">Quem cuida</label><select id="f-owner" name="owner">${options([ "", "Kellyson", "Jeyce" ], c?.owner || actor)}</select></div><div class="field"><label for="f-channel">Canal principal</label><select id="f-channel" name="channel">${options([ "WhatsApp", "Instagram", "E-mail", "Site", "Telefone" ], c?.channel || "WhatsApp")}</select></div><div class="field full"><label for="f-message">Mensagem</label><textarea id="f-message" name="message">${esc(c?.message || "Oi, tudo bem? Somos Kellyson e Jeyce, desenvolvedores aqui do Alto Oeste. Podemos conversar sobre um site ou sistema para facilitar o dia a dia de vocês?")}</textarea></div></div><button class="btn lime">${c ? "Salvar alterações" : "Adicionar contato"} ↗</button><p class="hint">Demonstração: fica salvo apenas neste navegador.</p></form>`;
    $("#form-dialog").showModal();
    $("#contact-form").onsubmit = e => {
        e.preventDefault();
        let data = Object.fromEntries(new FormData(e.target));
        data.name = data.name.trim();
        if (!data.name) return;
        const existing = Boolean(c);
        if (c) Object.assign(c, data); else {
            c = {
                ...data,
                id: "custom-" + crypto.randomUUID(),
                kind: route() === "governo" ? "government" : "private",
                status: "A enviar",
                priority: "Normal",
                history: [],
                followupMessage: "Oi! Passando para saber se conseguiu ver nossa mensagem. Podemos conversar?"
            };
            (c.kind === "government" ? gov : leads).unshift(c);
        }
        persist();
        $("#form-dialog").close();
        if ($("#detail").open && existing) openContact(c.id);
        activeTab = "Todos";
        search = "";
        ownerFilter = "Todos";
        channelFilter = "Todos";
        page = 1;
        render();
        toast(existing ? "Contato atualizado ✓" : "Contato adicionado ✓");
    };
}

function projectPage() {
    const list = projects.filter(p => projectTab === "Todos" || (projectTab === "Entregues" ? p.status === "Entregue" : p.status !== "Entregue"));
    return head("Os projetos da dupla.", "Em andamento, em revisão e entregues. Cada trabalho com seu lugar.", `<button class="btn" id="new-project">＋ Novo projeto</button>`) + `<div class="view-switch">${[ "Em andamento", "Entregues", "Todos" ].map(t => `<button class="${projectTab === t ? "active" : ""}" data-project-tab="${t}">${t}</button>`).join("")}</div><div class="projects-grid">${list.map(p => `<article class="project-card"><div class="project-meta"><span class="tag">${esc(p.status)}</span><span>${esc(p.owner || "Dupla")}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.client || "Projeto interno")}</p><div class="progress"><div style="width:${p.tasks.length ? p.tasks.filter(t => t.status === "Feito").length / p.tasks.length * 100 : 0}%"></div></div><div class="project-meta"><span>${p.tasks.filter(t => t.status === "Feito").length}/${p.tasks.length} tarefas</span><span>${p.deadline ? "Prazo " + fmt(p.deadline + "T12:00:00") : "Sem prazo definido"}</span></div><button class="btn light" data-project="${p.id}">Abrir projeto ↗</button></article>`).join("") || `<div class="empty" style="grid-column:1/-1;border:1px dashed #ccd3bd;border-radius:10px"><strong>${projectTab === "Entregues" ? "As entregas aparecem aqui." : "Qual projeto vocês estão tocando?"}</strong>Nenhum projeto foi marcado como concluído nos arquivos recebidos.<br><br><button class="btn light" id="demo-project">Experimentar quadro com LabDemo</button></div>`}</div><div id="project-board"></div>`;
}

function projectForm(contact, project) {
    const p = project || {
        client: contact?.name || "",
        owner: actor,
        status: "Em andamento"
    };
    $("#form-content").innerHTML = `<span class="eyebrow">CONFIGURAÇÕES DO PROJETO</span><h2>${project ? "Tudo combinado, num lugar só." : "Vamos organizar esse trabalho."}</h2><form id="project-form"><div class="field-grid">${formInput("p", "name", "Nome do projeto", p.name, "text", true)}${formInput("p", "client", "Para quem / cliente", p.client)}<div class="field full">${formArea("p", "description", "Briefing e objetivo", p.description, "Qual problema vamos resolver? O que foi combinado?")}</div>${formSelect("p", "owner", "Quem cuida", [ "Kellyson", "Jeyce", "Dupla" ], p.owner)}${formSelect("p", "status", "Situação", [ "Em andamento", "Em revisão", "Entregue" ], p.status)}${formInput("p", "deadline", "Prazo combinado", p.deadline, "date")}${formInput("p", "delivery", "O que será entregue", p.delivery)}${formInput("p", "url", "Link da entrega", p.url, "url")}${formInput("p", "repository", "Repositório / arquivos", p.repository, "url")}<div class="field full">${formArea("p", "scope", "Escopo e critérios de aprovação", p.scope, "Funcionalidades, limites e como saber que está pronto.")}</div><div class="field full">${formArea("p", "notes", "Notas e combinados", p.notes, "Decisões, referências e pedidos do cliente.")}</div></div><div class="form-actions"><button class="btn lime" type="submit">Salvar projeto ✓</button><button class="btn light" type="button" id="copy-project-form">⧉ Copiar briefing</button></div><p class="hint">Dados de demonstração · salvos neste navegador.</p></form>`;
    $("#form-dialog").showModal();
    $("#copy-project-form").onclick = () => copyText(projectText({
        ...p,
        ...formValues("#project-form")
    }, false), "Briefing copiado");
    $("#project-form").onsubmit = e => {
        e.preventDefault();
        const data = formValues("#project-form");
        if (!data.name.trim()) return;
        let saved = project;
        if (saved) Object.assign(saved, data, {
            updatedAt: now()
        }); else {
            saved = {
                ...data,
                id: "project-" + crypto.randomUUID(),
                contactId: contact?.id,
                tasks: [],
                createdAt: now()
            };
            projects.unshift(saved);
        }
        persist();
        $("#form-dialog").close();
        $("#detail").close();
        projectTab = "Todos";
        write("open-project", saved.id);
        location.hash = "projetos";
        render();
        toast("Projeto atualizado ✓");
    };
}

function formInput(prefix, key, label, value, type = "text", required = false) {
    return `<div class="field"><label for="${prefix}-${key}">${label}${required ? " *" : ""}</label><input id="${prefix}-${key}" name="${key}" type="${type}" value="${esc(value || "")}" ${required ? "required" : ""}></div>`;
}

function formArea(prefix, key, label, value, placeholder = "") {
    return `<label for="${prefix}-${key}">${label}</label><textarea id="${prefix}-${key}" name="${key}" placeholder="${esc(placeholder)}">${esc(value || "")}</textarea>`;
}

function formSelect(prefix, key, label, values, value) {
    return `<div class="field"><label for="${prefix}-${key}">${label}</label><select id="${prefix}-${key}" name="${key}">${options(values, value)}</select></div>`;
}

function formValues(selector) {
    return Object.fromEntries(new FormData($(selector)));
}

async function copyText(text, label = "Copiado") {
    try {
        await navigator.clipboard.writeText(text);
        toast(label + " ✓");
    } catch {
        toast("Não foi possível copiar. Tente novamente pelo navegador.");
    }
}

function fullDate(value) {
    return value ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR") : "Não definido";
}

function taskText(p, t) {
    return [ `TAREFA: ${t.name}`, `Projeto: ${p.name}`, `Para quem: ${t.recipient || p.client || "Projeto interno"}`, `Responsável: ${t.owner || "Dupla"}`, `Status: ${t.status}`, `Prioridade: ${t.priority || "Normal"}`, `Prazo: ${fullDate(t.deadline)}`, `Entrega: ${t.delivery || "Não especificada"}`, t.description && `\nDESCRIÇÃO\n${t.description}`, t.checklist?.length && `\nPARA CONCLUIR\n${t.checklist.map(x => `[${x.done ? "x" : " "}] ${x.text}`).join("\n")}`, t.links && `\nLINKS E REFERÊNCIAS\n${t.links}`, t.notes && `\nNOTAS\n${t.notes}` ].filter(Boolean).join("\n");
}

function projectText(p, withTasks = true) {
    return [ `PROJETO: ${p.name}`, `Cliente: ${p.client || "Projeto interno"}`, `Responsável: ${p.owner || "Dupla"}`, `Status: ${p.status}`, `Prazo: ${fullDate(p.deadline)}`, `Entrega: ${p.delivery || "Não especificada"}`, p.description && `\nBRIEFING\n${p.description}`, p.scope && `\nESCOPO E APROVAÇÃO\n${p.scope}`, p.url && `\nLink da entrega: ${p.url}`, p.repository && `Repositório / arquivos: ${p.repository}`, p.notes && `\nNOTAS E COMBINADOS\n${p.notes}`, withTasks && p.tasks?.length && `\nTAREFAS (${p.tasks.filter(t => t.status === "Feito").length}/${p.tasks.length} concluídas)\n\n${p.tasks.map(t => taskText(p, t)).join("\n\n--------------------\n\n")}` ].filter(Boolean).join("\n");
}

function taskForm(p, task) {
    const t = task || {
        owner: actor,
        status: "A fazer",
        priority: "Normal",
        recipient: p.client || "",
        deadline: p.deadline || "",
        checklist: []
    };
    $("#form-content").innerHTML = `<span class="eyebrow">${esc(p.name)} / TAREFA</span><h2>${task ? "Detalhes da tarefa" : "O que precisa ser feito?"}</h2><form id="task-form"><div class="field-grid"><div class="field full"><label for="task-name">Título da tarefa *</label><input id="task-name" name="name" value="${esc(t.name || "")}" required></div><div class="field full">${formArea("task", "description", "Descrição e contexto", t.description, "Explique o que fazer e por quê. Dá para colar esse texto direto no agente.")}</div>${formSelect("task", "owner", "Responsável", [ "Kellyson", "Jeyce", "Dupla" ], t.owner)}${formSelect("task", "status", "Andamento", TASK_STATES, t.status)}${formInput("task", "recipient", "Para quem / solicitante", t.recipient || p.client)}${formInput("task", "deadline", "Data da entrega", t.deadline, "date")}${formSelect("task", "priority", "Prioridade", [ "Baixa", "Normal", "Alta", "Urgente" ], t.priority || "Normal")}${formInput("task", "delivery", "Entrega esperada", t.delivery)}<div class="field full">${formArea("task", "criteria", "Checklist de conclusão", t.checklist?.map(c => c.text).join("\n"), "Uma condição por linha. Ex.: formulário funcionando no celular.")}<p class="hint">Depois de salvar, marque cada item no quadro do projeto.</p></div><div class="field full">${formArea("task", "links", "Links e referências", t.links, "Protótipo, página, repositório ou arquivo. Um por linha.")}</div><div class="field full">${formArea("task", "notes", "Notas e combinados", t.notes, "Observações, decisões e o que falta confirmar.")}</div></div><div class="form-actions"><button class="btn lime" type="submit">Salvar tarefa ✓</button><button class="btn light" id="copy-task-form" type="button">⧉ Copiar tudo</button></div></form>`;
    const draft = () => {
        const d = formValues("#task-form");
        const checklist = d.criteria.split("\n").map(x => x.trim()).filter(Boolean).map(text => ({
            text: text,
            done: t.checklist?.find(x => x.text === text)?.done || false
        }));
        delete d.criteria;
        return {
            ...t,
            ...d,
            checklist: checklist
        };
    };
    $("#form-dialog").showModal();
    $("#copy-task-form").onclick = () => copyText(taskText(p, draft()), "Tarefa copiada");
    $("#task-form").onsubmit = e => {
        e.preventDefault();
        const d = draft();
        if (!d.name.trim()) return;
        if (task) Object.assign(task, d, {
            updatedAt: now()
        }); else p.tasks.push({
            ...d,
            id: crypto.randomUUID(),
            createdAt: now()
        });
        p.updatedAt = now();
        persist();
        $("#form-dialog").close();
        render();
        openProject(p.id, false);
        toast("Tarefa salva ✓");
    };
}

function openProject(id, scroll = true) {
    const p = projects.find(p => p.id === id);
    if (!p || !$("#project-board")) return;
    write("open-project", id);
    $("#project-board").innerHTML = `<section class="project-workspace"><div class="project-workspace-top"><div><span class="eyebrow">ÁREA DO PROJETO / ${esc(p.client || "INTERNO")}</span><h2>${esc(p.name)}</h2></div><div class="project-action-bar"><button class="btn light small" id="copy-project">⧉ Copiar tudo</button><button class="btn light small" id="copy-brief">⧉ Briefing</button><button class="btn light small" id="edit-project">⚙ Configurar</button><button class="btn small" id="add-task">＋ Tarefa</button></div></div><div class="project-overview"><div class="project-facts"><div><span>QUEM CUIDA</span><strong>${esc(p.owner || "Dupla")}</strong></div><div><span>ENTREGA</span><strong>${esc(fullDate(p.deadline))}</strong></div><div><span>SITUAÇÃO</span><strong>${esc(p.status)}</strong></div><div><span>O QUE ENTREGAR</span><strong>${esc(p.delivery || "A combinar")}</strong></div></div>${p.description ? `<p class="project-description">${esc(p.description)}</p>` : '<p class="hint">Registre o briefing em Configurar para deixar o combinado acessível para a dupla.</p>'}<div class="project-links">${[ [ "Entrega", p.url ], [ "Repositório / arquivos", p.repository ] ].map(([label, url]) => safeUrl(url) ? `<a class="btn light small" href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${label} ↗</a>` : "").join("")}</div><details class="project-notebook"><summary>✎ Notas, combinados e escopo</summary><div class="field-grid"><div class="field">${formArea("workspace", "notes", "Notas compartilhadas", p.notes, "Anotem decisões, feedback e próximos passos.")}</div><div class="field">${formArea("workspace", "scope", "Escopo e aprovação", p.scope, "Como saber que o projeto está pronto?")}</div></div><div class="notebook-foot"><span id="note-saved">Salvo neste navegador</span><button class="subtle-btn" id="copy-project-notes">⧉ Copiar notas</button></div></details></div><div class="board">${TASK_STATES.map(s => `<section class="board-col"><h3>${s}<span>${p.tasks.filter(t => t.status === s).length}</span></h3>${p.tasks.filter(t => t.status === s).map(t => `<article class="task-card detailed-task"><div class="task-card-top"><span class="eyebrow">${esc(t.owner || "Dupla")}</span>${t.priority && t.priority !== "Normal" ? `<span class="task-priority ${t.priority === "Urgente" ? "urgent" : ""}">${esc(t.priority)}</span>` : ""}</div><button class="task-title" data-edit-task="${t.id}">${esc(t.name)}</button>${t.description ? `<p class="task-preview">${esc(t.description)}</p>` : ""}<div class="task-facts">${t.recipient ? `<span>↗ ${esc(t.recipient)}</span>` : ""}${t.deadline ? `<span>◷ ${esc(fullDate(t.deadline))}</span>` : ""}${t.delivery ? `<span>▤ ${esc(t.delivery)}</span>` : ""}</div>${t.checklist?.length ? `<details class="task-checklist"><summary>✓ ${t.checklist.filter(c => c.done).length}/${t.checklist.length} critérios</summary>${t.checklist.map((c, i) => `<label><input type="checkbox" data-criterion="${t.id}" data-index="${i}" ${c.done ? "checked" : ""}><span>${esc(c.text)}</span></label>`).join("")}</details>` : ""}<div class="task-card-controls"><select data-task-status="${t.id}" aria-label="Status de ${esc(t.name)}">${options(TASK_STATES, t.status)}</select><select data-task-owner="${t.id}" aria-label="Responsável por ${esc(t.name)}">${options([ "Kellyson", "Jeyce", "Dupla" ], t.owner)}</select></div><div class="task-card-actions"><button data-edit-task="${t.id}">Detalhar ↗</button><button data-copy-task="${t.id}" aria-label="Copiar tarefa ${esc(t.name)}">⧉ Copiar</button></div></article>`).join("") || '<div class="column-empty">As tarefas desta etapa aparecem aqui.</div>'}</section>`).join("")}</div></section>`;
    $("#edit-project").onclick = () => projectForm(null, p);
    $("#add-task").onclick = () => taskForm(p);
    $("#copy-project").onclick = () => copyText(projectText(p), "Projeto completo copiado");
    $("#copy-brief").onclick = () => copyText(projectText(p, false), "Briefing copiado");
    $("#copy-project-notes").onclick = () => copyText([ p.name, p.notes || "Sem notas", p.scope || "" ].filter(Boolean).join("\n\n"), "Notas copiadas");
    [ "notes", "scope" ].forEach(key => $("#workspace-" + key).oninput = e => {
        p[key] = e.target.value;
        p.updatedAt = now();
        persist();
        $("#note-saved").textContent = "Alterações salvas neste navegador ✓";
    });
    const board = $("#project-board");
    board.querySelectorAll("[data-edit-task]").forEach(b => b.onclick = () => taskForm(p, p.tasks.find(t => t.id === b.dataset.editTask)));
    board.querySelectorAll("[data-copy-task]").forEach(b => b.onclick = () => copyText(taskText(p, p.tasks.find(t => t.id === b.dataset.copyTask)), "Tarefa copiada"));
    board.querySelectorAll("[data-task-status]").forEach(e => e.onchange = () => {
        p.tasks.find(t => t.id === e.dataset.taskStatus).status = e.value;
        persist();
        render();
        openProject(id, false);
    });
    board.querySelectorAll("[data-task-owner]").forEach(e => e.onchange = () => {
        p.tasks.find(t => t.id === e.dataset.taskOwner).owner = e.value;
        persist();
        openProject(id, false);
    });
    board.querySelectorAll("[data-criterion]").forEach(e => e.onchange = () => {
        p.tasks.find(t => t.id === e.dataset.criterion).checklist[Number(e.dataset.index)].done = e.checked;
        persist();
        e.closest("details").querySelector("summary").textContent = "✓ " + p.tasks.find(t => t.id === e.dataset.criterion).checklist.filter(c => c.done).length + "/" + p.tasks.find(t => t.id === e.dataset.criterion).checklist.length + " critérios";
    });
    if (scroll) $("#project-board").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start"
    });
}

function demoProject() {
    let p = projects.find(p => p.id === "demo-lab");
    if (!p) {
        p = {
            id: "demo-lab",
            name: "LabDemo",
            client: "Exemplo de organização · não é cliente fechado",
            status: "Em andamento",
            owner: "Dupla",
            tasks: [ "Configurar o projeto", "Página de unidades", "Catálogo com busca", "Página do exame", "Agendar: unidade e exames", "Agendar: dia e horário", "Agendar: confirmação", "Painel da recepção", "Acabamento no celular" ].map((name, i) => ({
                id: "lab-" + i,
                name: name,
                owner: i === 0 ? "Kellyson" : "Jeyce",
                status: "A fazer"
            }))
        };
        projects.push(p);
        persist();
    }
    render();
    openProject(p.id);
}

function library() {
    return head("Materiais de apoio.", "Os arquivos ficam aqui quando vocês precisarem.") + `<div class="resources">${[ [ "Proposta comercial", "Escopo e preço para enviar ao cliente.", "modelos/proposta_comercial.docx" ], [ "Mensagens", "Modelos de e-mail do kit original.", "divulgacao/emails.md" ], [ "Declarações", "Documentos para contratação.", "modelos/declaracoes_contratacao.docx" ], [ "Atestado técnico", "Modelo de capacidade técnica.", "modelos/atestado_capacidade_tecnica_modelo.docx" ], [ "Tratamento de dados", "Modelo de termo do kit.", "modelos/termo_tratamento_dados.docx" ], [ "Instagram", "Legendas e materiais de divulgação.", "divulgacao/instagram.md" ] ].map(([t, d, u]) => `<article class="resource"><span class="eyebrow">ARQUIVO DO KIT</span><h3>${t}</h3><p>${d}</p><a href="kit/${u}" download>Baixar ↗</a></article>`).join("")}</div><div class="page-note" style="margin-top:22px">Empresa: vocês anotaram que querem evitar gastos e avaliar a estrutura existente antes de abrir outra. Esses pontos ficam como notas para revisão, sem transformar o guia antigo em regra para a dupla.</div><a class="btn light" href="plano-original.html" target="_blank" rel="noopener">Consultar material original ↗</a>`;
}

function render() {
    nav();
    const r = route();
    $("#app").innerHTML = r === "inicio" ? dashboard() : r === "projetos" ? projectPage() : r === "biblioteca" ? library() : contactsPage();
    if ($("#home-view")) {
        bindDashboard();
    }
    if ($("#rows")) {
        fillRows();
        bindActions($(".right-rail"));
        $("#new-contact").onclick = () => contactForm();
        $("#search").oninput = e => {
            search = e.target.value;
            page = 1;
            fillRows();
        };
        $("#owner-filter").onchange = e => {
            ownerFilter = e.target.value;
            page = 1;
            fillRows();
        };
        $("#channel-filter").onchange = e => {
            channelFilter = e.target.value;
            page = 1;
            fillRows();
        };
        $("#prev").onclick = () => {
            page--;
            fillRows();
        };
        $("#next").onclick = () => {
            page++;
            fillRows();
        };
        document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
            activeTab = b.dataset.tab;
            page = 1;
            render();
        });
        document.querySelectorAll("[data-metric]").forEach(b => b.onclick = () => {
            activeTab = b.dataset.metric;
            page = 1;
            if (route() === "retornos") location.hash = "contatos";
            render();
        });
    }
    if ($("#new-project")) {
        $("#new-project").onclick = () => projectForm();
        document.querySelectorAll("[data-project-tab]").forEach(b => b.onclick = () => {
            projectTab = b.dataset.projectTab;
            render();
        });
        document.querySelectorAll("[data-project]").forEach(b => b.onclick = () => openProject(b.dataset.project));
        if ($("#demo-project")) $("#demo-project").onclick = demoProject;
        const selected = read("open-project", null);
        if (selected) openProject(selected, false);
    }
}

$("#actor").onchange = e => {
    actor = e.target.value;
    write("actor", actor);
    toast("Usando como " + actor);
};

document.querySelectorAll("dialog .close").forEach(b => b.onclick = () => b.closest("dialog").close());

$("#reset").onclick = () => {
    $("#form-content").innerHTML = '<h2>Restaurar a demonstração?</h2><p>Isso apaga os testes feitos neste navegador e restaura os dados de exemplo do Miro.</p><button class="btn" id="confirm-reset">Restaurar dados de exemplo</button>';
    $("#form-dialog").showModal();
    $("#confirm-reset").onclick = () => {
        [ "leads", "gov", "projects" ].forEach(k => localStorage.removeItem("rota-demo-" + k));
        location.reload();
    };
};

window.addEventListener("hashchange", () => {
    page = 1;
    search = "";
    ownerFilter = "Todos";
    channelFilter = "Todos";
    if (route() !== "contatos") activeTab = "Todos";
    render();
    window.scrollTo(0, 0);
});

render();

function dashboard() {
    const visible = leads.filter(c => dashboardOwner === "Dupla" || c.owner === dashboardOwner), waiting = visible.filter(c => c.status === "Aguardando resposta"), meetings = visible.filter(c => c.status === "Reunião marcada"), responded = visible.filter(c => [ "Respondeu", "Reunião marcada", "Interessado", "Proposta enviada", "Fechado", "Sem interesse" ].includes(c.status)), active = projects.filter(p => p.status !== "Entregue" && (dashboardOwner === "Dupla" || p.owner === dashboardOwner || p.owner === "Dupla"));
    const due = visible.filter(c => c.returnAt).sort((a, b) => a.returnAt.localeCompare(b.returnAt)).slice(0, 3), meeting = meetings[0];
    const activity = visible.flatMap(c => (c.history || []).map(e => ({
        ...e,
        name: c.name,
        id: c.id
    }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
    return `<div id="home-view">${head("O que temos pra hoje?", "As conversas, os retornos e as entregas da dupla.", '<button class="btn" id="home-add">＋ Novo contato</button>')}\n <div class="home-command"><div class="home-greeting"><span class="eyebrow">✳ NOSSO ESPAÇO, NOSSO RITMO</span><h2>${waiting.length ? "Tem conversa esperando<br>o próximo capítulo." : "Bora fazer o dia andar."}</h2><p>${waiting.length ? `${waiting.length} contatos aguardam resposta. Um retorno bem colocado pode movimentar o dia.` : "Veja os contatos e os projetos para escolher a próxima ação."}</p><a class="btn" href="#retornos">Ver quem não respondeu <span>↗</span></a></div><div class="command-visual" aria-hidden="true"><span class="mini-orbit"></span><div class="chat-sticker"><span>FREELA EM ANDAMENTO</span><strong>oi, sumido<span class="typing">...</span></strong><small>com contexto, por favor.</small><i>↗</i></div><span class="floating-label">mensagem boa abre portas ✳</span></div></div>\n <div class="home-section-head"><h2>O movimento da dupla</h2><div class="view-switch home-owner">${[ "Dupla", "Kellyson", "Jeyce" ].map(x => `<button data-home-owner="${x}" class="${dashboardOwner === x ? "active" : ""}">${x}</button>`).join("")}</div></div>\n <div class="home-metrics">${[ [ waiting.length, "Sem resposta", "Aguardando resposta", "◷", "amber" ], [ responded.length, "Responderam", "Responderam", "↩", "violet" ], [ meetings.length, "Reuniões marcadas", "Reunião marcada", "✳", "mint" ], [ visible.filter(c => c.status === "Fechado").length, "Negócios fechados", "Fechado", "✓", "lime" ] ].map(([n, t, key, icon, color]) => `<button data-home-filter="${key}" class="home-metric ${color}"><span class="metric-symbol">${icon}</span><div><strong>${String(n).padStart(2, "0")}</strong><span>${t}</span></div><b>↗</b></button>`).join("")}</div>\n <div class="home-grid"><section class="home-panel"><div class="home-panel-head"><div><span class="eyebrow">É A VEZ DO FOLLOW-UP</span><h2>Na fila de resposta <span>${waiting.length}</span></h2></div><a href="#retornos">Ver todos ↗</a></div><div class="home-contact-list">${waiting.slice(0, 4).map((c, i) => `<article class="home-contact"><span class="company-mark tone-${i % 4}">${esc(initials(c.name))}</span><div class="home-contact-info"><button data-open="${c.id}">${esc(c.name.split(" - ")[0])}</button><small>${esc(c.channel)} · ${c.sentAt ? "enviado " + fmt(c.sentAt) : "data do envio não registrada"}</small></div><button class="btn light small" data-followup="${c.id}">Retomar ↗</button></article>`).join("") || '<div class="empty">Nenhum contato nesta fila para o filtro selecionado.</div>'}</div></section>\n <section class="home-panel home-meeting"><div class="home-panel-head"><div><span class="eyebrow">UM PASSO ALÉM DO “OI”</span><h2>${meeting ? "Reunião marcada" : "Agenda de conversas"}</h2></div><span class="calendar-icon">▦</span></div>${meeting ? `<h3>${esc(meeting.name.split(" - ")[0])}</h3><p>${meeting.meetingAt ? esc(new Date(meeting.meetingAt).toLocaleString("pt-BR")) : "O Miro já marca a reunião. Falta registrar dia e horário."}</p><div class="meeting-person"><span class="avatar">${meeting.owner ? esc(meeting.owner[0]) : "?"}</span>${esc(meeting.owner || "Responsável a definir")}</div><button class="btn light" data-open="${meeting.id}">Ver detalhes e anotar horário ↗</button>` : "<p>As reuniões marcadas aparecem aqui, com dia, horário e responsável.</p>"}</section>\n <section class="home-panel"><div class="home-panel-head"><div><span class="eyebrow">DA CONVERSA À ENTREGA</span><h2>Projetos em andamento <span>${active.length}</span></h2></div><a href="#projetos">Ver projetos ↗</a></div>${active.length ? active.slice(0, 3).map(p => `<a class="home-project" href="#projetos"><span class="company-mark">▦</span><div><strong>${esc(p.name)}</strong><small>${esc(p.owner)} · ${p.tasks.filter(t => t.status === "Feito").length}/${p.tasks.length} tarefas</small></div><span>↗</span></a>`).join("") : `<div class="project-empty"><span>▦</span><div><strong>O próximo projeto tem lugar aqui.</strong><p>Adicione um trabalho em andamento ou uma entrega já feita.</p><button class="subtle-btn" id="home-project">＋ Adicionar projeto</button></div></div>`}</section>\n <section class="home-panel"><div class="home-panel-head"><div><span class="eyebrow">PRA NÃO FICAR PRA DEPOIS</span><h2>Próximos retornos</h2></div><span>↶</span></div>${due.length ? due.map(c => `<button class="reminder" data-open="${c.id}"><span>${fmt(c.returnAt + "T12:00:00")}</span><strong>${esc(c.name.split(" - ")[0])}</strong><b>↗</b></button>`).join("") : '<p class="hint">Nenhum retorno agendado. Na ficha do contato, escolha a data em “Lembrar de retornar”.</p>'}<div class="small-aside">✳ Organização é lembrar sem depender da memória.</div></section></div>\n <section class="activity-strip"><div><span class="eyebrow">ÚLTIMAS MOVIMENTAÇÕES</span><h2>Passou por aqui.</h2></div>${activity.length ? activity.map(e => `<button data-open="${e.id}"><strong>${esc(e.name.split(" - ")[0])}</strong><span>${esc(e.text)}</span><small>${esc(e.actor)} · ${fmt(e.at)}</small></button>`).join("") : "<p>As mudanças que vocês fizerem nesta demonstração aparecem aqui.</p>"}</section></div>`;
}

function bindDashboard() {
    bindActions($("#home-view"));
    $("#home-add").onclick = () => contactForm();
    if ($("#home-project")) $("#home-project").onclick = () => projectForm();
    document.querySelectorAll("[data-home-owner]").forEach(b => b.onclick = () => {
        dashboardOwner = b.dataset.homeOwner;
        render();
    });
    document.querySelectorAll("[data-home-filter]").forEach(b => b.onclick = () => {
        activeTab = b.dataset.homeFilter;
        location.hash = "contatos";
        render();
    });
    document.querySelectorAll("[data-followup]").forEach(b => b.onclick = () => {
        openContact(b.dataset.followup);
        $("#message-mode").value = "Retorno";
        $("#message-mode").dispatchEvent(new Event("change"));
    });
}
