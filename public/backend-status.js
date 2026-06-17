(() => {
  const state = {
    lastSimulation: localStorage.getItem("instabot_last_backend_status") || "Nenhuma ainda"
  };

  function addStyles() {
    if (document.getElementById("motorBackendStyles")) return;
    const style = document.createElement("style");
    style.id = "motorBackendStyles";
    style.textContent = `
      .motor-backend-card {
        margin-bottom: 18px;
        background: linear-gradient(135deg, rgba(67,255,138,.12), rgba(67,211,255,.10));
        border-color: rgba(67,255,138,.22);
      }
      .motor-backend-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .motor-backend-head h2 { margin: 0; font-size: 21px; }
      .motor-backend-head p { margin: 6px 0 0; color: #b8b8c8; line-height: 1.4; }
      .motor-refresh {
        border: 0;
        border-radius: 999px;
        padding: 10px 13px;
        background: rgba(255,255,255,.11);
        color: #fff;
        font-weight: 800;
        cursor: pointer;
        white-space: nowrap;
      }
      .motor-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }
      .motor-item {
        background: rgba(0,0,0,.24);
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 16px;
        padding: 14px;
        min-height: 92px;
      }
      .motor-item small { color: #b8b8c8; display: block; margin-bottom: 7px; }
      .motor-item strong { display: block; font-size: 17px; line-height: 1.3; }
      .motor-item span { display: block; color: #d8d8ee; font-size: 13px; margin-top: 6px; }
      .motor-ok strong { color: #9dffc3; }
      .motor-warn strong { color: #ffe09d; }
      .motor-bad strong { color: #ff9db2; }
      .motor-info strong { color: #a8d8ff; }
      @media (max-width: 900px) { .motor-grid { grid-template-columns: 1fr 1fr; } .motor-backend-head { flex-direction: column; } }
      @media (max-width: 560px) { .motor-grid { grid-template-columns: 1fr; } .motor-refresh { width: 100%; } }
    `;
    document.head.appendChild(style);
  }

  function createCard() {
    if (document.getElementById("motorBackendCard")) return;
    const dashboard = document.querySelector("#tab-bot .dashboard");
    if (!dashboard) return;
    addStyles();

    const card = document.createElement("section");
    card.id = "motorBackendCard";
    card.className = "card motor-backend-card";

    const head = document.createElement("div");
    head.className = "motor-backend-head";

    const titleBox = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = "🧠 Motor Backend";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Status do cérebro real do bot: Render, Supabase, webhook e última simulação.";
    titleBox.append(title, subtitle);

    const button = document.createElement("button");
    button.id = "refreshMotorBackend";
    button.className = "motor-refresh";
    button.type = "button";
    button.textContent = "Atualizar status";
    button.addEventListener("click", () => refresh(true));

    head.append(titleBox, button);

    const grid = document.createElement("div");
    grid.className = "motor-grid";
    grid.innerHTML = `
      <div id="motorBackendRender" class="motor-item motor-info"><small>Backend Render</small><strong>Verificando...</strong><span>Servidor Node.js</span></div>
      <div id="motorBackendDatabase" class="motor-item motor-info"><small>Supabase</small><strong>Verificando...</strong><span>Banco de produtos</span></div>
      <div id="motorBackendWebhook" class="motor-item motor-ok"><small>Webhook</small><strong>Pronto</strong><span>/webhook configurado</span></div>
      <div id="motorBackendLast" class="motor-item motor-info"><small>Última simulação</small><strong>Nenhuma ainda</strong><span>Aguardando teste</span></div>
    `;

    card.append(head, grid);
    dashboard.insertAdjacentElement("afterend", card);
  }

  function setItem(id, className, title, detail) {
    const item = document.getElementById(id);
    if (!item) return;
    item.classList.remove("motor-ok", "motor-warn", "motor-bad", "motor-info");
    item.classList.add(className);
    item.querySelector("strong").textContent = title;
    item.querySelector("span").textContent = detail;
  }

  async function refresh(showLog = false) {
    createCard();
    try {
      const health = await apiRequest("/health");
      const productCount = Array.isArray(products) ? products.length : 0;
      const interactionCount = Array.isArray(interactions) ? interactions.length : 0;
      const lastInteraction = Array.isArray(interactions) && interactions.length
        ? interactions.slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0]
        : null;
      const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      setItem("motorBackendRender", health.ok ? "motor-ok" : "motor-bad", health.ok ? "Online" : "Offline", `Modo ${health.mode || "simulation"} • ${now}`);
      setItem("motorBackendDatabase", health.database === "configured" && isDatabaseOnline ? "motor-ok" : "motor-warn", health.database === "configured" && isDatabaseOnline ? "Conectado" : "Atenção", `${productCount} produtos • ${interactionCount} interações`);
      setItem("motorBackendWebhook", "motor-ok", "Pronto", `${location.origin}/webhook`);
      setItem("motorBackendLast", state.lastSimulation === "Nenhuma ainda" ? "motor-info" : "motor-ok", state.lastSimulation, lastInteraction ? `${lastInteraction.username || "@cliente"} • ${lastInteraction.directSent ? "Direct enviado" : lastInteraction.reason || "Sem Direct"}` : "Nenhuma interação salva");

      if (showLog) addLog("Status do Motor Backend atualizado.", "success");
    } catch (error) {
      setItem("motorBackendRender", "motor-bad", "Erro", "Não consegui consultar /health");
      setItem("motorBackendDatabase", "motor-warn", "Indefinido", "Verifique Render/Supabase");
      if (showLog) addLog(`Erro ao atualizar Motor Backend: ${error.message}`, "error");
    }
  }

  window.markMotorBackendSimulation = (username, result) => {
    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const productName = result?.product?.name || "sem produto";
    state.lastSimulation = `${now} • ${username} • ${productName}`;
    localStorage.setItem("instabot_last_backend_status", state.lastSimulation);
    refresh(false);
  };

  createCard();
  setTimeout(() => refresh(false), 1000);
  setInterval(() => refresh(false), 30000);
})();
