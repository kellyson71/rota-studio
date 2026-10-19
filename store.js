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
    const [contacts, projects] = await Promise.all([client.from("contacts").select("*"), client.from("projects").select("*")]);
    if (contacts.error || projects.error) fail(contacts.error || projects.error);
    Store.contacts = (contacts.data || []).map(fromRow).sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
    Store.projects = (projects.data || []).map(fromRow).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    Store.ready = true;
    subscribe();
    emit("load");
  }

  function subscribe() {
    if (channel) client.removeChannel(channel);
    channel = client.channel("rota-sync");
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
