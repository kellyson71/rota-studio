(() => {
    let current = null, scheduled = false;
    const styles = {
        Baixa: [ "↓", "status-new" ],
        Normal: [ "−", "status-new" ],
        Alta: [ "↑", "status-wait" ],
        Urgente: [ "!", "status-no" ],
        "A enviar": [ "↗", "status-new" ],
        "Aguardando resposta": [ "◷", "status-wait" ],
        Respondeu: [ "↩", "status-reply" ],
        "Reunião marcada": [ "▦", "status-reply" ],
        Interessado: [ "✦", "status-win" ],
        "Proposta enviada": [ "▤", "status-reply" ],
        Fechado: [ "✓", "status-win" ],
        "Sem interesse": [ "−", "status-no" ],
        "Mais tarde": [ "◴", "status-new" ],
        Kellyson: [ "K", "person-k" ],
        Jeyce: [ "J", "person-j" ],
        Dupla: [ "♡", "status-reply" ],
        "A fazer": [ "○", "status-new" ],
        Fazendo: [ "◔", "status-wait" ],
        "Em revisão": [ "◈", "status-reply" ],
        Feito: [ "✓", "status-win" ],
        "Em andamento": [ "◔", "status-wait" ],
        Entregue: [ "✓", "status-win" ],
        WhatsApp: [ "◉", "status-win" ],
        Instagram: [ "◎", "status-reply" ],
        "E-mail": [ "✉", "status-wait" ],
        Site: [ "↗", "status-new" ],
        Telefone: [ "☎", "status-new" ],
        Todos: [ "☷", "status-new" ],
        Retorno: [ "↶", "status-wait" ],
        "Primeiro contato": [ "↗", "status-new" ]
    };
    const iconFor = v => styles[v] || [ "○", "status-new" ];
    function close(focus = false) {
        if (!current) return;
        const {menu: menu, trigger: trigger} = current;
        menu.remove();
        trigger.setAttribute("aria-expanded", "false");
        if (focus && trigger.isConnected) trigger.focus();
        current = null;
    }
    function update(select, trigger) {
        const option = select.selectedOptions[0];
        const label = option?.textContent || "Selecionar";
        const [icon, color] = iconFor(select.value);
        trigger.innerHTML = `<span class="select-icon ${color}"></span><span class="select-label"></span><span class="select-caret">⌄</span>`;
        trigger.querySelector(".select-icon").textContent = icon;
        trigger.querySelector(".select-label").textContent = label;
        trigger.className = "select-trigger " + select.dataset.originalClass;
        if (select.dataset.status) trigger.className = "select-trigger row-select " + color;
        trigger.setAttribute("aria-label", (select.getAttribute("aria-label") || select.labels?.[0]?.textContent || "Selecionar") + ": " + label);
        trigger.title = label;
    }
    function open(select, trigger) {
        if (current?.trigger === trigger) {
            close();
            return;
        }
        close();
        const menu = document.createElement("div");
        menu.className = "select-menu";
        menu.id = "select-options-" + (select.id || Math.random().toString(36).slice(2));
        menu.role = "listbox";
        menu.setAttribute("aria-label", select.getAttribute("aria-label") || select.labels?.[0]?.textContent || "Opções");
        const heading = document.createElement("div");
        heading.className = "select-menu-heading";
        heading.textContent = select.dataset.status || select.id === "detail-status" ? "ATUALIZAR STATUS" : select.dataset.owner || select.id?.includes("owner") ? "QUEM CUIDA" : "SELECIONE UMA OPÇÃO";
        menu.append(heading);
        Array.from(select.options).forEach((option, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "select-option";
            b.role = "option";
            b.tabIndex = -1;
            b.setAttribute("aria-selected", String(option.selected));
            b.setAttribute("aria-label", option.textContent);
            const [icon, color] = iconFor(option.value);
            const span = document.createElement("span");
            span.className = "option-icon " + color;
            span.textContent = icon;
            const label = document.createElement("span");
            label.textContent = option.textContent;
            const check = document.createElement("span");
            check.className = "check";
            check.textContent = option.selected ? "✓" : "";
            b.append(span, label, check);
            b.disabled = option.disabled;
            b.onclick = () => {
                select.value = option.value;
                close(true);
                update(select, trigger);
                select.dispatchEvent(new Event("change", {
                    bubbles: true
                }));
            };
            menu.append(b);
        });
        (select.closest("dialog") || document.body).append(menu);
        const rect = trigger.getBoundingClientRect(), width = Math.min(Math.max(rect.width, 235), innerWidth - 24);
        menu.style.width = width + "px";
        menu.style.left = Math.max(12, Math.min(rect.left, innerWidth - width - 12)) + "px";
        const availableBelow = innerHeight - rect.bottom - 12, above = rect.top - 12;
        let below = availableBelow >= 220 || availableBelow >= above;
        menu.style.maxHeight = Math.min(410, Math.max(130, below ? availableBelow : above)) + "px";
        if (below) menu.style.top = rect.bottom + 6 + "px"; else menu.style.top = Math.max(12, rect.top - menu.getBoundingClientRect().height - 6) + "px";
        trigger.setAttribute("aria-expanded", "true");
        trigger.setAttribute("aria-controls", menu.id);
        current = {
            menu: menu,
            trigger: trigger
        };
        const items = () => [ ...menu.querySelectorAll("[role=option]:not(:disabled)") ];
        (menu.querySelector("[aria-selected=true]") || items()[0])?.focus({
            preventScroll: true
        });
        menu.onkeydown = e => {
            const opts = items(), index = opts.indexOf(document.activeElement);
            if ([ "ArrowDown", "ArrowUp", "Home", "End" ].includes(e.key)) {
                e.preventDefault();
                opts[e.key === "Home" ? 0 : e.key === "End" ? opts.length - 1 : (index + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length]?.focus();
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close(true);
            } else if (e.key === "Tab") {
                close(true);
            } else if (e.key.length === 1) {
                const target = opts.find(b => b.children[1].textContent.toLowerCase().startsWith(e.key.toLowerCase()));
                target?.focus();
            }
        };
    }
    function enhance() {
        document.querySelectorAll("select:not([data-customized])").forEach(select => {
            select.dataset.customized = "true";
            select.dataset.originalClass = select.className;
            const wrapper = document.createElement("span");
            wrapper.className = "select-wrap";
            const trigger = document.createElement("button");
            trigger.type = "button";
            trigger.setAttribute("aria-haspopup", "listbox");
            trigger.setAttribute("aria-expanded", "false");
            select.parentNode.insertBefore(wrapper, select);
            wrapper.append(select, trigger);
            select.classList.add("native-select");
            select.tabIndex = -1;
            select.setAttribute("aria-hidden", "true");
            update(select, trigger);
            trigger.onclick = () => open(select, trigger);
            trigger.onkeydown = e => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    open(select, trigger);
                }
            };
            select.addEventListener("change", () => update(select, trigger));
        });
    }
    new MutationObserver(() => {
        if (current && !current.trigger.isConnected) close();
        if (!scheduled) {
            scheduled = true;
            queueMicrotask(() => {
                scheduled = false;
                enhance();
            });
        }
    }).observe(document.body, {
        childList: true,
        subtree: true
    });
    document.addEventListener("pointerdown", e => {
        if (current && !current.menu.contains(e.target) && !current.trigger.contains(e.target)) close();
    });
    window.addEventListener("resize", () => close());
    [ "wheel", "touchmove" ].forEach(event => window.addEventListener(event, e => {
        if (current && !current.menu.contains(e.target)) close();
    }, {
        capture: true,
        passive: true
    }));
    document.querySelectorAll("dialog").forEach(d => d.addEventListener("close", () => close()));
    enhance();
})();
