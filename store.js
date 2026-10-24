(() => {
  const cfg = window.ROTA_CONFIG || {};
  const PREFIX = "rota-v2-";
  const listeners = new Set();
  const timers = new Map();
  const clone = x => JSON.parse(JSON.stringify(x));
  const local = {
    read(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(PREFIX + key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {}
    }
  };
  let client = null;
  let channel = null;
  const tab = Math.random().toString(36).slice(2);

  const Store = {
    mode: cfg.supabaseUrl && cfg.supabaseKey ? "cloud" : "demo",
    ready: false,
    user: null,
    member: null,
    contacts: [],
    projects: [],
    settings: {},
    error: "",
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    local
  };

  const emit = (reason, detail) => listeners.forEach(fn => fn(reason, detail));
  const contactRow = c => ({ id: c.id, kind: c.kind || "private", status: c.status || "A enviar", owner: c.owner || "", data: { ...c, tab }, updated_by: Store.member?.name || null });
  const projectRow = p => ({ id: p.id, status: p.status || "Em andamento", data: { ...p, tab }, updated_by: Store.member?.name || null });
  const fromRow = r => ({ ...r.data, tab: undefined, id: r.id, status: r.status, owner: r.owner ?? r.data?.owner, kind: r.kind ?? r.data?.kind, updatedAt: r.updated_at, updatedBy: r.updated_by });

  function persistDemo() {
    local.write("contacts", Store.contacts);
    local.write("projects", Store.projects);
  }

  function fail(error) {
    Store.error = error?.message || String(error);
    emit("error", Store.error);
  }

  function upsertLocal(list, item) {
    const index = list.findIndex(x => x.id === item.id);
    if (index === -1) list.unshift(item);
    else list[index] = item;
  }

  async function write(table, item) {
    if (Store.mode === "demo") return persistDemo();
    const { error } = await client.from(table).upsert(table === "contacts" ? contactRow(item) : projectRow(item));
    if (error) fail(error);
  }

  function schedule(table, item, debounce) {
    const key = table + item.id;
    clearTimeout(timers.get(key));
    if (!debounce) {
      timers.delete(key);
      return write(table, item);
    }
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      write(table, item);
    }, 700));
  }

  Store.saveContact = (c, { debounce = false, silent = false } = {}) => {
    upsertLocal(Store.contacts, c);
    if (!silent) emit("contacts", c.id);
    return schedule("contacts", c, debounce);
  };

  Store.saveProject = (p, { debounce = false, silent = false } = {}) => {
    upsertLocal(Store.projects, p);
    if (!silent) emit("projects", p.id);
    return schedule("projects", p, debounce);
  };

  Store.removeProject = async id => {
    Store.projects = Store.projects.filter(p => p.id !== id);
    emit("projects", id);
    if (Store.mode === "demo") return persistDemo();
    const { error } = await client.from("projects").delete().eq("id", id);
    if (error) fail(error);
  };

  Store.saveSettings = async data => {
    Store.settings = data;
    emit("settings");
    if (Store.mode === "demo") return local.write("settings", data);
    const { error } = await client.from("settings").upsert({ id: "config", data: { ...data, tab }, updated_by: Store.member?.name || null });
    if (error) fail(error);
  };

  async function pullInbound() {
    const { data, error } = await client.from("inbound").select("*").order("created_at");
    if (error || !data?.length) return;
    for (const lead of data) {
      const id = "site-" + lead.id;
      if (!Store.contacts.some(c => c.id === id)) {
        const contact = {
          id,
          kind: "private",
          order: 0,
          name: lead.name,
          phone: lead.phone,
          category: lead.kind || "Chegou pelo site",
          city: "",
          channel: "WhatsApp",
          status: "Respondeu",
          owner: "",
          priority: "Alta",
          notes: lead.need ? `Pediu pelo site: ${lead.need}` : "Pediu contato pelo site.",
          message: "Oi, {nome}! Aqui é {eu}, da Indexa. Vi sua mensagem no nosso site. Podemos conversar 10 minutos sobre o que você precisa?",
          followupMessage: "Oi! Passando para saber se ainda faz sentido conversarmos sobre o seu projeto.",
          person: lead.name.split(" ")[0],
          source: "Formulário do site",
          respondedAt: lead.created_at,
          consentedAt: lead.consented_at || "",
          history: [{ text: "Pediu contato pelo site", type: "reply", actor: lead.name, at: lead.created_at }]
        };
        upsertLocal(Store.contacts, contact);
        await write("contacts", contact);
      }
      await client.from("inbound").delete().eq("id", lead.id);
    }
    emit("inbound", data.length);
  }

  Store.resetDemo = () => {
    Store.contacts = clone(window.SEED_CONTACTS);
    Store.projects = [];
    persistDemo();
    emit("load");
  };

  Store.signIn = async (email, password) => {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  Store.signUp = async (email, password) => {
    const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split("#")[0] } });
    if (error) throw error;
    return Boolean(data.session);
  };

  Store.signOut = async () => {
    await client.auth.signOut();
  };

  Store.waRpc = async (name, args = {}) => {
    if (!client || !Store.member) throw new Error("Entre com a conta da equipe para agendar envios.");
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  };
  Store.waLoad = async () => {
    if (!client || !Store.member) throw new Error("O agendamento precisa do login da equipe e do Supabase.");
    const results = await Promise.all([
      client.from("wa_devices").select("id,name,enabled,paused,interval_seconds,status,heartbeat_at,qr,last_error,created_at,agent_mode,auto_limit,policy_version").order("created_at"),
      client.from("wa_messages").select("*").order("created_at", { ascending: false }).limit(100),
      client.from("wa_replies").select("*").order("received_at", { ascending: false }).limit(30),
      client.from("wa_blocks").select("*"),
      client.from("wa_drafts").select("*").eq("status", "pending").order("created_at").limit(30),
      client.from("wa_conversations").select("device_id,phone,owner,pause_reason,version").eq("owner","human"),
      client.from("wa_message_parts").select("message_id,part_index,remote_id,sent_at").order("sent_at",{ascending:false}).limit(300)
    ]);
    const failed = results.slice(0, 4).find(r => r.error);
    if (failed) throw failed.error;
    // Rascunhos são opcionais: sem a migração do agente a aba continua funcionando.
    return Object.fromEntries(["devices", "messages", "replies", "blocks", "drafts", "conversations", "parts"].map((key, i) => [key, results[i].data || []]));
  };
  Store.waDraftCount = async () => {
    if (!client || !Store.member) return 0;
    const { count, error } = await client.from("wa_drafts").select("id", { count: "exact", head: true }).eq("status", "pending");
    return error ? 0 : count || 0;
  };

  async function loadCloud() {
    Store.ready = false;
    if (!Store.user) {
      Store.member = null;
      Store.contacts = [];
      Store.projects = [];
      Store.ready = true;
      return emit("auth");
    }
    const { data: member, error: memberError } = await client.from("members").select("*").eq("email", Store.user.email.toLowerCase()).maybeSingle();
    if (memberError) fail(memberError);
    Store.member = member || null;
    if (!member) {
      Store.ready = true;
      return emit("auth");
    }
    const [contacts, projects, settings] = await Promise.all([client.from("contacts").select("*"), client.from("projects").select("*"), client.from("settings").select("*").eq("id", "config").maybeSingle()]);
    Store.settings = settings.data?.data || {};
    if (contacts.error || projects.error) fail(contacts.error || projects.error);
    Store.contacts = (contacts.data || []).map(fromRow).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    Store.projects = (projects.data || []).map(fromRow).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    Store.ready = true;
    subscribe();
    emit("load");
    pullInbound();
  }

  function subscribe() {
    if (channel) client.removeChannel(channel);
    channel = client.channel("rota-sync");
    channel.on("postgres_changes", { event: "*", schema: "public", table: "settings" }, payload => {
      if (payload.new?.data?.tab === tab) return;
      Store.settings = payload.new?.data || {};
      emit("settings");
    });
    channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "inbound" }, () => pullInbound());
    for (const table of ["contacts", "projects"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, payload => {
        const list = Store[table];
        if (payload.eventType === "DELETE") {
          Store[table] = list.filter(x => x.id !== payload.old.id);
        } else {
          if (payload.new.data?.tab === tab) return;
          upsertLocal(list, fromRow(payload.new));
        }
        emit("remote", { table, id: payload.new?.id || payload.old?.id, by: payload.new?.updated_by });
      });
    }
    channel.subscribe();
  }

  Store.init = async () => {
    if (Store.mode === "cloud" && !window.supabase) {
      Store.mode = "demo";
      Store.error = "Não consegui carregar o Supabase. Abrindo em modo demonstração.";
    }
    if (Store.mode === "demo") {
      Store.contacts = local.read("contacts", null) || clone(window.SEED_CONTACTS);
      Store.projects = local.read("projects", []);
      Store.settings = local.read("settings", {});
      Store.ready = true;
      return emit("load");
    }
    client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    const { data } = await client.auth.getSession();
    Store.user = data.session?.user || null;
    client.auth.onAuthStateChange((_event, session) => {
      const previous = Store.user?.id;
      Store.user = session?.user || null;
      if (previous !== Store.user?.id) loadCloud();
    });
    await loadCloud();
  };

  window.Store = Store;
})();
