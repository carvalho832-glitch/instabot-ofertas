// Painel de catálogos: usa a mesma chave administrativa do InstaBot.
// Os PDFs são enviados como bytes ao servidor, nunca como base64 no navegador.
(() => {
  const byId = id => document.getElementById(id);
  const form = byId("igCatalogForm");
  if (!form) return;
  const listEl = byId("igCatalogList");
  const infoEl = byId("igCatalogInfo");
  const fileEl = byId("igCatalogFile");
  const uploadBtn = byId("igCatalogUpload");
  const catTab = document.querySelector('[data-tab="catalogos"]');
  let busy = false;

  const show = (message, bad = false) => {
    infoEl.textContent = message;
    infoEl.style.color = bad ? "#ff8d8d" : "#70dc9a";
  };
  const humanSize = size => (Number(size || 0) / 1024 / 1024).toFixed(2) + " MB";

  fileEl.addEventListener("change", () => {
    const file = fileEl.files?.[0];
    byId("igCatalogSelected").textContent = file
      ? "✅ " + file.name + " • " + humanSize(file.size)
      : "Nenhum arquivo selecionado";
  });

  async function fetchCatalogs() {
    try {
      listEl.textContent = "Buscando catálogos...";
      const data = await apiRequest("/api/catalogos");
      byId("igCatalogLive").textContent = data.liveReady
        ? "✅ Direct configurado para automações (a entrega depende da permissão da conta Meta)."
        : "⚠️ Envio real do Direct ainda não está autorizado nas configurações do servidor/Instagram. Os catálogos podem ser cadastrados e testados sem disparos.";
      listEl.replaceChildren();
      if (!Array.isArray(data.catalogs) || !data.catalogs.length) {
        listEl.textContent = "Nenhum catálogo cadastrado.";
        return;
      }
      for (const cat of data.catalogs) {
        const card = document.createElement("div");
        card.className = "card";
        card.style.margin = "12px 0";
        card.style.padding = "14px";
        const title = document.createElement("strong");
        title.textContent = cat.name;
        const detail = document.createElement("p");
        detail.textContent = "Palavra-chave: " + cat.keyword + " • " + humanSize(cat.size) +
          (cat.storyId ? " • Story: " + cat.storyId : "") +
          (cat.postId ? " • Reel: " + cat.postId : "");
        detail.style.overflowWrap = "anywhere";
        const status = document.createElement("p");
        status.textContent = cat.active ? "🟢 Ativado" : "⚪ Desativado";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn " + (cat.active ? "ghost-visible" : "primary");
        button.textContent = cat.active ? "Desativar envio" : "Ativar envio automático";
        button.addEventListener("click", async () => {
          if (busy) return;
          busy = true;
          button.disabled = true;
          show("");
          try {
            await apiRequest("/api/catalogos/" + encodeURIComponent(cat.id), {
              method: "PATCH", body: JSON.stringify({active: !cat.active})
            });
            show(cat.active ? "Catálogo desativado." : "Catálogo ativado. Faça um teste pelo Direct.");
            await fetchCatalogs();
          } catch (error) {
            show(error.message || "Não foi possível atualizar.", true);
          } finally {
            busy = false;
            button.disabled = false;
          }
        });
        card.append(title, detail, status, button);
        listEl.append(card);
      }
    } catch (error) {
      listEl.textContent = "Não foi possível consultar os catálogos. " + (error.message || "");
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const file = fileEl.files?.[0];
    if (!file) return show("Selecione o arquivo PDF.", true);
    if (!file.name.toLowerCase().endsWith(".pdf") || file.size > 25 * 1024 * 1024 || file.size < 1024) {
      return show("Selecione um PDF válido entre 1 KB e 25 MB.", true);
    }
    const name = byId("igCatalogName").value.trim();
    const keyword = byId("igCatalogKeyword").value.trim();
    const storyId = byId("igCatalogStoryId").value.trim();
    const postId = byId("igCatalogPostId").value.trim();
    const params = new URLSearchParams({name, keyword});
    if (storyId) params.set("storyId", storyId);
    if (postId) params.set("postId", postId);
    busy = true;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Enviando PDF...";
    show("Carregando " + humanSize(file.size) + ". Não feche a página.");
    try {
      await apiRequest("/api/catalogos/upload?" + params.toString(), {
        method: "POST", headers: {"Content-Type": "application/pdf"}, body: file
      });
      show("✅ Catálogo cadastrado! Agora toque em Ativar envio automático no quadro ao lado.");
      form.reset();
      byId("igCatalogSelected").textContent = "Nenhum arquivo selecionado";
      await fetchCatalogs();
    } catch (error) {
      show("Falha no cadastro: " + (error.message || "erro desconhecido"), true);
    } finally {
      busy = false;
      uploadBtn.disabled = false;
      uploadBtn.textContent = "📎 Cadastrar catálogo PDF";
    }
  });

  byId("igCatalogRefresh").addEventListener("click", () => { if (!busy) void fetchCatalogs(); });
  catTab?.addEventListener("click", () => { if (!busy) void fetchCatalogs(); });
})();
