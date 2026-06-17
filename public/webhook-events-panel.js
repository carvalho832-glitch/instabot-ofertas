(() => {
  const state = {
    events: [],
    loading: false,
    autoRefresh: false,
    timer: null,
    lastLoadedAt: "--:--"
  };

  function injectStyles() {
    if (document.getElementById("webhookEventsStyles")) return;

    const style = document.createElement("style");
    style.id = "webhookEventsStyles";
    style.textContent = `
      .webhook-events-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
      .webhook-actions { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 14px; }
      .webhook-actions a, .webhook-actions button { border: 0; border-radius: 999px; padding: 13px 14px; text-decoration: none; text-align: center; color: #fff; font-weight: 900; background: rgba(255, 255, 255, .10); cursor: pointer; }
      .webhook-actions .primary-action { background: linear-gradient(90deg, #ff2e92, #ff7a59); }
      .webhook-actions .danger-action { background: rgba(255, 82, 117, .18); color: #ffd5df; border: 1px solid rgba(255, 82, 117, .25); }
      .webhook-actions .active-action { background: rgba(157,255,195,.14); color: #9dffc3; border: 1px solid rgba(157,255,195,.25); }
      .webhook-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
      .webhook-summary-item { background: rgba(0, 0, 0, .24); border: 1px solid rgba(255, 255, 255, .09); border-radius: 16px; padding: 14px; }
      .webhook-summary-item small { display: block; color: #b8b8c8; margin-bottom: 7px; }
      .webhook-summary-item strong { display: block; font-size: 24px; color: #9dffc3; }
      .webhook-list { display: grid; gap: 12px; }
      .webhook-event-card { background: rgba(0, 0, 0, .23); border: 1px solid rgba(255, 255, 255, .10); border-radius: 18px; padding: 15px; }
      .webhook-event-card.real-event { border-color: rgba(157,255,195,.25); box-shadow: 0 0 0 1px rgba(157,255,195,.05) inset; }
      .webhook-event-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 12px; }
      .webhook-event-head strong { display: block; font-size: 17px; line-height: 1.25; }
      .webhook-event-head small { color: #b8b8c8; }
      .webhook-pills { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
      .webhook-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 7px 10px; font-weight: 900; font-size: 12px; white-space: nowrap; }
      .webhook-pill.ok { background: rgba(157,255,195,.12); color: #9dffc3; }
      .webhook-pill.warn { background: rgba(255,224,157,.14); color: #ffe09d; }
      .webhook-pill.info { background: rgba(168,216,255,.12); color: #a8d8ff; }
      .webhook-pill.real { background: rgba(157,255,195,.16); color: #9dffc3; }
      .webhook-meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .webhook-meta { background: rgba(255, 255, 255, .055); border: 1px solid rgba(255, 255, 255, .075); border-radius: 14px; padding: 11px; }
      .webhook-meta small { display: block; color: #b8b8c8; margin-bottom: 5px; font-weight: 800; }
      .webhook-meta span { display: block; color: #fff; overflow-wrap: anywhere; }
      .webhook-meta span.product-name { color: #9dffc3; font-weight: 900; }
      .webhook-empty { padding: 22px; border: 1px dashed rgba(255,255,255,.18); border-radius: 18px; color: #d8d8ee; text-align: center; line-height: 1.5; }
      .webhook-technical { margin-top: 12px; background: rgba(0,0,0,.25); border-radius: 14px; overflow: hidden; }
      .webhook-technical summary { cursor: pointer; padding: 12px; color: #a8d8ff; font-weight: 900; }
      .webhook-technical pre { margin: 0; padding: 12px; max-height: 260px; overflow: auto; border-top: 1px solid rgba(255,255,255,.08); white-space: pre-wrap; overflow-wrap: anywhere; color: #d9fff0; font-size: 12px; }
      @media (max-width: 980px) { .webhook-actions { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 820px) { .webhook-summary { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 560px) { .webhook-summary, .webhook-meta-grid, .webhook-actions { grid-template-columns: 1fr; } .webhook-event-head { flex-direction: column; } .webhook-pills { justify-content: flex-start; } }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (match) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[match]));
  }

  function formatDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function eventLabel(event) {
    const labels = {
      comment: "Comentário",
      comment_safe_mode: "Comentário seguro",
      comment_processed: "Comentário processado",
      comment_duplicate: "Duplicado bloqueado",
      raw_event_no_comment: "Evento bruto"
    };
    return labels[event.eventType || "comment"] || event.eventType || "Comentário";
  }

  function sourceLabel(source = "") {
    if (source === "webhook_test") return "Teste fake";
    if (source === "simulation") return "Simulação painel";
    if (source === "webhook") return "Webhook real";
    return source || "Webhook";
  }

  function isRealWebhook(event) {
    return event.source === "webhook";
  }

  function createTab() {
    if (document.getElementById("tab-webhooks")) return;
    injectStyles();

    const tabs = document.querySelector(".tabs");
    const app = document.querySelector(".app");
    if (!tabs || !app) return;

    const button = document.createElement("button");
    button.className = "tab-btn";
    button.dataset.tab = "webhooks";
    button.textContent = "🛰️ Eventos Webhook";
    button.addEventListener("click", () => openWebhookTab());

    const configButton = tabs.querySelector('[data-tab="config"]');
    tabs.insertBefore(button, configButton || null);

    const section = document.createElement("section");
    section.id = "tab-webhooks";
    section.className = "tab-content";
    section.innerHTML = `
      <main class="webhook-events-grid">
        <section class="card">
          <div class="section-title with-action"><div><h2>🛰️ Eventos Webhook</h2><p>Últimos eventos recebidos pelo webhook da Meta/Instagram, incluindo testes fakes e futuros comentários reais.</p></div></div>
          <div class="webhook-actions">
            <button id="refreshWebhookEvents" class="primary-action" type="button">Atualizar eventos</button>
            <button id="toggleWebhookAuto" type="button">Auto: desligado</button>
            <button id="clearWebhookEvents" class="danger-action" type="button">Limpar eventos</button>
            <a href="/teste-webhook.html" target="_blank">Abrir teste</a>
            <a href="/api/webhook-eventos" target="_blank">JSON bruto</a>
          </div>
          <div class="webhook-summary">
            <div class="webhook-summary-item"><small>Total recente</small><strong id="webhookTotal">0</strong></div>
            <div class="webhook-summary-item"><small>Produto encontrado</small><strong id="webhookMatched">0</strong></div>
            <div class="webhook-summary-item"><small>Webhook real</small><strong id="webhookReal">0</strong></div>
            <div class="webhook-summary-item"><small>Atualizado</small><strong id="webhookUpdated">--:--</strong></div>
          </div>
        </section>
        <section class="card">
          <div class="section-title"><h2>Histórico de eventos</h2><p>Use isso para conferir se a Meta está chegando no seu bot.</p></div>
          <div id="webhookEventsList" class="webhook-list"><div class="webhook-empty">Carregando eventos...</div></div>
        </section>
      </main>
    `;

    const configSection = document.getElementById("tab-config");
    app.insertBefore(section, configSection || null);

    document.getElementById("refreshWebhookEvents")?.addEventListener("click", () => loadWebhookEvents(true));
    document.getElementById("toggleWebhookAuto")?.addEventListener("click", toggleAutoRefresh);
    document.getElementById("clearWebhookEvents")?.addEventListener("click", clearWebhookEvents);
  }

  function openWebhookTab() {
    document.querySelectorAll(".tab-btn").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((item) => item.classList.remove("active"));
    document.querySelector('[data-tab="webhooks"]')?.classList.add("active");
    document.getElementById("tab-webhooks")?.classList.add("active");
    loadWebhookEvents(false);
  }

  function updateAutoButton() {
    const button = document.getElementById("toggleWebhookAuto");
    if (!button) return;
    button.textContent = state.autoRefresh ? "Auto: ligado" : "Auto: desligado";
    button.classList.toggle("active-action", state.autoRefresh);
  }

  function toggleAutoRefresh() {
    state.autoRefresh = !state.autoRefresh;
    updateAutoButton();

    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }

    if (state.autoRefresh) {
      loadWebhookEvents(false);
      state.timer = setInterval(() => loadWebhookEvents(false), 15000);
      if (typeof addLog === "function") addLog("Atualização automática dos webhooks ligada.", "success");
    } else if (typeof addLog === "function") {
      addLog("Atualização automática dos webhooks desligada.", "warning");
    }
  }

  async function loadWebhookEvents(showLog = false) {
    if (state.loading) return;
    state.loading = true;
    renderLoading();

    try {
      const events = await apiRequest("/api/webhook-eventos");
      state.events = Array.isArray(events) ? events : [];
      state.lastLoadedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      renderSummary();
      renderEvents();
      if (showLog && typeof addLog === "function") addLog("Eventos Webhook atualizados.", "success");
    } catch (error) {
      renderError(error.message);
      if (showLog && typeof addLog === "function") addLog(`Erro ao carregar eventos webhook: ${error.message}`, "error");
    } finally {
      state.loading = false;
    }
  }

  async function clearWebhookEvents() {
    if (!confirm("Limpar todos os eventos webhook salvos? As interações do bot não serão apagadas.")) return;

    try {
      await apiRequest("/api/webhook-eventos", { method: ["DE", "LETE"].join("") });
      state.events = [];
      state.lastLoadedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      renderSummary();
      renderEvents();
      if (typeof addLog === "function") addLog("Eventos Webhook limpos.", "success");
    } catch (error) {
      renderError(error.message);
      if (typeof addLog === "function") addLog(`Erro ao limpar eventos webhook: ${error.message}`, "error");
    }
  }

  function renderLoading() {
    const list = document.getElementById("webhookEventsList");
    if (list && !state.events.length) list.innerHTML = `<div class="webhook-empty">Carregando eventos...</div>`;
  }

  function renderSummary() {
    const total = state.events.length;
    const matched = state.events.filter((event) => event.matched).length;
    const real = state.events.filter((event) => isRealWebhook(event)).length;
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    set("webhookTotal", total);
    set("webhookMatched", matched);
    set("webhookReal", real);
    set("webhookUpdated", state.lastLoadedAt);
  }

  function renderEvents() {
    const list = document.getElementById("webhookEventsList");
    if (!list) return;

    if (!state.events.length) {
      list.innerHTML = `<div class="webhook-empty">Nenhum evento recebido ainda.<br>Abra o teste webhook e envie um comentário fake para acender este painel.</div>`;
      return;
    }

    list.innerHTML = state.events.map((event) => {
      const foundClass = event.matched ? "ok" : "warn";
      const foundText = event.matched ? "Produto encontrado" : "Sem produto";
      const real = isRealWebhook(event);
      const payload = JSON.stringify(event.payload || {}, null, 2);
      const productName = event.productName || (event.matched ? "Produto encontrado" : "--");

      return `
        <article class="webhook-event-card ${real ? "real-event" : ""}">
          <div class="webhook-event-head">
            <div><strong>${escapeHtml(eventLabel(event))}</strong><small>${escapeHtml(formatDate(event.createdAt))} • ${escapeHtml(sourceLabel(event.source))}</small></div>
            <div class="webhook-pills"><span class="webhook-pill ${real ? "real" : "info"}">${real ? "Real" : "Teste"}</span><span class="webhook-pill ${foundClass}">${foundText}</span></div>
          </div>
          <div class="webhook-meta-grid">
            <div class="webhook-meta"><small>Produto</small><span class="product-name">${escapeHtml(productName)}</span></div>
            <div class="webhook-meta"><small>Origem</small><span>${escapeHtml(sourceLabel(event.source))}</span></div>
            <div class="webhook-meta"><small>Cliente</small><span>${escapeHtml(event.username || "@cliente")}</span></div>
            <div class="webhook-meta"><small>Comentário</small><span>${escapeHtml(event.comment || "--")}</span></div>
            <div class="webhook-meta"><small>Post/Reel ID</small><span>${escapeHtml(event.mediaId || "--")}</span></div>
            <div class="webhook-meta"><small>Modo seguro</small><span>${event.safeMode ? "Ativo, sem Direct real" : "Desativado"}</span></div>
          </div>
          <details class="webhook-technical"><summary>Ver payload técnico</summary><pre>${escapeHtml(payload)}</pre></details>
        </article>
      `;
    }).join("");
  }

  function renderError(message) {
    const list = document.getElementById("webhookEventsList");
    if (!list) return;
    list.innerHTML = `<div class="webhook-empty">Não consegui carregar os eventos.<br>${escapeHtml(message)}</div>`;
  }

  createTab();
  updateAutoButton();
  setTimeout(() => loadWebhookEvents(false), 1200);
})();
