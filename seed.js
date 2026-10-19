window.SEED_CONTACTS = [
  ...window.LEADS.map((c, i) => ({ ...c, order: i + 1, kind: "private", history: c.history || [] })),
  ...window.CONTACTS.map((c, i) => ({
    id: "gov-" + i,
    order: 1000 + i,
    kind: "government",
    name: c.municipio + " · " + c.secretaria,
    person: c["secretario(a)"] || "",
    city: c.municipio,
    category: c.secretaria,
    status: "Mais tarde",
    owner: "",
    priority: "Normal",
    channel: c.whatsapp_oficial ? "WhatsApp" : "E-mail",
    phone: c.whatsapp_oficial || "",
    email: c.email_secretaria || c.email_prefeitura || "",
    instagram: c.instagram || "",
    telephone: c.telefone_secretaria || c.telefone_prefeitura || "",
    website: c.site || "",
    tip: c.sinais || "",
    notes: "",
    message: `Bom dia! Somos Kellyson e Jeyce, desenvolvedores aqui do Alto Oeste. Gostaríamos de conversar com a equipe de ${c.secretaria} sobre um sistema de inscrição online para seletivos e editais. Qual é o melhor contato para enviar a proposta?`,
    followupMessage: "Bom dia! Passando para saber se conseguiram ver nossa mensagem. Se for melhor falar com outra pessoa, é só indicar. Obrigado!",
    source: "Kit · contatos_prefeituras.csv",
    history: []
  }))
];
