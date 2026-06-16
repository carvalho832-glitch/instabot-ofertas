const $ = (id) => document.getElementById(id);

const els = {
  editingId: $("editingId"),
  formTitle: $("formTitle"),
  productName: $("productName"),
  productPlatform: $("productPlatform"),
  categoryName: $("categoryName"),
  oldPrice: $("oldPrice"),
  newPrice: $("newPrice"),
  productLink: $("productLink"),
  productImage: $("productImage"),
  postId: $("postId"),
  keywords: $("keywords"),
  couponCode: $("couponCode"),
  offerValidity: $("offerValidity"),
  benefitText: $("benefitText"),
  freeShipping: $("freeShipping"),
  messageTemplate: $("messageTemplate"),
  internalNotes: $("internalNotes"),
  saveProduct: $("saveProduct"),
  cancelEdit: $("cancelEdit"),
  clearAll: $("clearAll"),
  simPostId: $("simPostId"),
  commentUser: $("commentUser"),
  commentText: $("commentText"),
  simulateComment: $("simulateComment"),
  productsList: $("productsList"),
  productSearch: $("productSearch"),
  statusFilter: $("statusFilter"),
  matchedProduct: $("matchedProduct"),
  directMessages: $("directMessages"),
  copyLastMessage: $("copyLastMessage"),
  botLog: $("botLog"),
  dashTotalProducts: $("dashTotalProducts"),
  dashActiveProducts: $("dashActiveProducts"),
  dashComments: $("dashComments"),
  dashDirects: $("dashDirects"),
  dashRate: $("dashRate"),
  messageProductSelect: $("messageProductSelect"),
  messageTone: $("messageTone"),
  msgCoupon: $("msgCoupon"),
  msgValidity: $("msgValidity"),
  msgBenefit: $("msgBenefit"),
  msgFreeShipping: $("msgFreeShipping"),
  generateMessage: $("generateMessage"),
  applyGeneratedTemplate: $("applyGeneratedTemplate"),
  generatedTemplate: $("generatedTemplate"),
  copyGeneratedTemplate: $("copyGeneratedTemplate"),
  publicReplyPreview: $("publicReplyPreview"),
  exportProducts: $("exportProducts"),
  exportBackup: $("exportBackup"),
  clearHistory: $("clearHistory"),
  importMode: $("importMode"),
  importJson: $("importJson"),
  importData: $("importData"),
  dataTotalProducts: $("dataTotalProducts"),
  dataTotalInteractions: $("dataTotalInteractions"),
  dataTotalDirects: $("dataTotalDirects"),
  interactionsPreview: $("interactionsPreview"),
  accountName: $("accountName"),
  instagramUser: $("instagramUser"),
  instagramBusinessId: $("instagramBusinessId"),
  facebookPageId: $("facebookPageId"),
  metaAppId: $("metaAppId"),
  accessToken: $("accessToken"),
  verifyToken: $("verifyToken"),
  botMode: $("botMode"),
  webhookUrl: $("webhookUrl"),
  publicReply: $("publicReply"),
  blockDuplicate: $("blockDuplicate"),
  saveConfig: $("saveConfig"),
  resetConfig: $("resetConfig"),
  connectionTitle: $("connectionTitle"),
  connectionText: $("connectionText"),
  connectionBadge: $("connectionBadge"),
  webhookPreview: $("webhookPreview"),
  checkAccount: $("checkAccount"),
  checkPage: $("checkPage"),
  checkApp: $("checkApp"),
  checkToken: $("checkToken"),
  checkWebhook: $("checkWebhook")
};

let products = [];
let interactions = [];
let botConfig = {};
let lastGeneratedMessage = "";
let isDatabaseOnline = false;
let isBooting = true;

const defaultTemplate = `Oi, {{nome}} 😍

Vi seu comentário e separei o produto pra você:

🔥 {{produto}}
💰 De {{preco_antigo}}
✅ Por {{preco_atual}}

{{cupom}}
{{frete}}
{{validade}}
{{beneficio}}

🛒 Comprar com desconto:
{{link}}

Qualquer dúvida, me chama aqui 💬`;

const templatesByTone = {
  short: `Oi, {{nome}} 😍

Aqui está o link do produto que você pediu:

🔥 {{produto}}
✅ Por {{preco_atual}}

{{cupom}}
{{frete}}

🛒 Comprar aqui:
{{link}}`,
  seller: `Oi, {{nome}} 😍

Separei essa oferta pra você:

🔥 {{produto}}
💰 De {{preco_antigo}}
✅ Por {{preco_atual}}

✨ {{beneficio}}
{{cupom}}
{{frete}}
{{validade}}

🛒 Garanta o seu aqui:
{{link}}

Qualquer dúvida, me chama aqui 💬`,
  warm: `Oi, {{nome}} 💛

Vi seu comentário e já deixei o link separadinho pra você:

✨ {{produto}}
✅ Saindo por {{preco_atual}}

{{beneficio}}
{{cupom}}
{{frete}}

🛒 Link para comprar:
{{link}}

Espero que você aproveite essa oferta 🛍️`,
  urgent: `Oi, {{nome}} 🚨

Essa oferta está ativa agora:

🔥 {{produto}}
💰 De {{preco_antigo}}
✅ Por {{preco_atual}}

{{cupom}}
{{frete}}
⏰ {{validade}}

🛒 Comprar antes que acabe:
{{link}}`,
  coupon: `Oi, {{nome}} 🎟️

Você pediu e eu já trouxe o link:

🔥 {{produto}}
✅ Por {{preco_atual}}

🎁 {{cupom}}
{{frete}}
{{validade}}

🛒 Comprar com desconto:
{{link}}

Corre pra aproveitar 🛍️`
};

const defaultConfig = {
  accountName: "Mina de Ofertas",
  instagramUser: "@mina.de.ofertas",
  instagramBusinessId: "",
  facebookPageId: "",
  metaAppId: "",
  accessToken: "",
  verifyToken: "instabot_verify_" + Math.floor(Math.random() * 999999),
  botMode: "simulation",
  webhookUrl: "https://instabot-ofertas.onrender.com/webhook",
  publicReply: true,
  blockDuplicate: true
};

async function startApp() {
  setupTabs();
  setLoading(true);
  els.messageTemplate.value = defaultTemplate;

  await loadData();
  await loadConfig();

  if (!products.length) {
    await createDemoProduct();
  }

  clearForm(false);
  renderAll();
  loadSelectedProductToMessageFields();
  setLoading(false);
  isBooting = false;

  addLog(
    isDatabaseOnline
      ? "Banco Supabase conectado. Produtos agora são salvos na nuvem."
      : "Modo local ativo. O banco não respondeu, então usei o navegador como reserva.",
    isDatabaseOnline ? "success" : "warning"
  );
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      document.querySelectorAll(".tab-btn").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));
      button.classList.add("active");
      $("tab-" + tab).classList.add("active");
      if (tab === "messages") {
        renderMessageProducts();
        loadSelectedProductToMessageFields();
      }
      if (tab === "data") renderDataPanel();
    });
  });
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Erro na API");
  }

  return data;
}

function setLoading(isLoading) {
  [
    els.saveProduct,
    els.simulateComment,
    els.clearAll,
    els.generateMessage,
    els.applyGeneratedTemplate,
    els.importData,
    els.clearHistory,
    els.saveConfig,
    els.resetConfig
  ].forEach((button) => {
    if (button) button.disabled = isLoading;
  });
}

async function loadData() {
  try {
    const [remoteProducts, remoteInteractions] = await Promise.all([
      apiRequest("/api/produtos"),
      apiRequest("/api/interacoes")
    ]);

    products = remoteProducts.map(normalizeProduct);
    interactions = remoteInteractions || [];
    isDatabaseOnline = true;
  } catch (error) {
    const savedProducts = localStorage.getItem("instabot_products_v1_github");
    const savedInteractions = localStorage.getItem("instabot_interactions_v1_github");
    products = savedProducts ? JSON.parse(savedProducts).map(normalizeProduct) : [];
    interactions = savedInteractions ? JSON.parse(savedInteractions) : [];
    isDatabaseOnline = false;
  }
}

async function reloadFromDatabase() {
  if (!isDatabaseOnline) return;
  await loadData();
  renderAll();
}

async function createDemoProduct() {
  const demoProduct = normalizeProduct({
    name: "Fone Bluetooth Bose",
    platform: "Shopee",
    category: "Eletrônicos",
    oldPrice: "R$ 129,90",
    newPrice: "R$ 59,90",
    link: "https://s.shopee.com.br/seu-link-aqui",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
    postId: "POST-001",
    keywords: ["eu quero", "quero", "link", "manda"],
    couponCode: "20% OFF",
    offerValidity: "Oferta válida enquanto durar o estoque",
    benefitText: "Som potente, conexão rápida e ótimo custo-benefício",
    freeShipping: true,
    internalNotes: "Produto de demonstração para testar o fluxo do bot.",
    template: defaultTemplate,
    active: true
  });

  if (isDatabaseOnline) {
    try {
      const saved = await apiRequest("/api/produtos", {
        method: "POST",
        body: JSON.stringify(demoProduct)
      });
      products = [normalizeProduct(saved)];
      return;
    } catch (error) {
      addLog("Não consegui criar produto demo no banco. Usando modo local.", "warning");
      isDatabaseOnline = false;
    }
  }

  products = [demoProduct];
  saveData();
}

function getFormProduct() {
  return normalizeProduct({
    id: els.editingId.value || undefined,
    name: els.productName.value.trim(),
    platform: els.productPlatform.value,
    category: els.categoryName.value.trim(),
    oldPrice: els.oldPrice.value.trim(),
    newPrice: els.newPrice.value.trim(),
    link: els.productLink.value.trim(),
    image: els.productImage.value.trim(),
    postId: els.postId.value.trim(),
    keywords: els.keywords.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean),
    couponCode: els.couponCode.value.trim(),
    offerValidity: els.offerValidity.value.trim(),
    benefitText: els.benefitText.value.trim(),
    freeShipping: els.freeShipping.checked,
    template: els.messageTemplate.value.trim() || defaultTemplate,
    internalNotes: els.internalNotes.value.trim()
  });
}

async function saveProductHandler() {
  const data = getFormProduct();

  if (!data.name || !data.link || !data.postId || !data.keywords.length) {
    addLog("Preencha nome, link, ID do post/reel e palavras-chave.", "warning");
    return;
  }

  setLoading(true);

  try {
    if (isDatabaseOnline) {
      if (els.editingId.value) {
        const saved = await apiRequest(`/api/produtos/${els.editingId.value}`, {
          method: "PUT",
          body: JSON.stringify(data)
        });
        products = products.map((product) => (product.id === saved.id ? normalizeProduct(saved) : product));
        addLog(`Produto "${saved.name}" atualizado no Supabase.`, "success");
      } else {
        const saved = await apiRequest("/api/produtos", {
          method: "POST",
          body: JSON.stringify(data)
        });
        products.unshift(normalizeProduct(saved));
        addLog(`Produto "${saved.name}" salvo no Supabase.`, "success");
      }
    } else {
      if (els.editingId.value) {
        products = products.map((product) => (product.id === els.editingId.value ? { ...product, ...data } : product));
        addLog(`Produto "${data.name}" atualizado localmente.`, "success");
      } else {
        products.unshift(data);
        addLog(`Produto "${data.name}" salvo localmente.`, "success");
      }
      saveData();
    }

    clearForm(false);
    renderAll();
  } catch (error) {
    addLog(`Erro ao salvar produto: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

function editProduct(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;

  els.editingId.value = product.id;
  els.productName.value = product.name || "";
  els.productPlatform.value = product.platform || "Shopee";
  els.categoryName.value = product.category || "";
  els.oldPrice.value = product.oldPrice || "";
  els.newPrice.value = product.newPrice || "";
  els.productLink.value = product.link || "";
  els.productImage.value = product.image || "";
  els.postId.value = product.postId || "";
  els.keywords.value = (product.keywords || []).join(", ");
  els.couponCode.value = product.couponCode || "";
  els.offerValidity.value = product.offerValidity || "";
  els.benefitText.value = product.benefitText || "";
  els.freeShipping.checked = Boolean(product.freeShipping);
  els.messageTemplate.value = product.template || defaultTemplate;
  els.internalNotes.value = product.internalNotes || "";

  els.formTitle.textContent = "1. Editar produto";
  els.saveProduct.textContent = "Salvar alterações";
  els.cancelEdit.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
  addLog(`Editando produto "${product.name}".`, "warning");
}

async function deleteProduct(id) {
  const product = products.find((item) => item.id === id);
  if (!product || !confirm(`Excluir "${product.name}"?`)) return;

  setLoading(true);

  try {
    if (isDatabaseOnline) {
      await apiRequest(`/api/produtos/${id}`, { method: "DELETE" });
    }
    products = products.filter((item) => item.id !== id);
    interactions = interactions.filter((item) => item.productId !== id);
    saveData();
    renderAll();
    addLog(`Produto "${product.name}" excluído.`, "error");
  } catch (error) {
    addLog(`Erro ao excluir produto: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function toggleProduct(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;

  const updated = { ...product, active: !product.active };

  try {
    if (isDatabaseOnline) {
      const saved = await apiRequest(`/api/produtos/${id}`, {
        method: "PUT",
        body: JSON.stringify(updated)
      });
      products = products.map((item) => (item.id === id ? normalizeProduct(saved) : item));
    } else {
      products = products.map((item) => (item.id === id ? updated : item));
      saveData();
    }
    renderAll();
    addLog(`Produto "${product.name}" agora está ${updated.active ? "ativo" : "inativo"}.`, updated.active ? "success" : "warning");
  } catch (error) {
    addLog(`Erro ao alterar status: ${error.message}`, "error");
  }
}

function clearForm(showLog = true) {
  els.editingId.value = "";
  els.productName.value = "";
  els.productPlatform.value = "Shopee";
  els.categoryName.value = "";
  els.oldPrice.value = "";
  els.newPrice.value = "";
  els.productLink.value = "";
  els.productImage.value = "";
  els.postId.value = "";
  els.keywords.value = "eu quero, quero, link, manda";
  els.couponCode.value = "";
  els.offerValidity.value = "";
  els.benefitText.value = "";
  els.freeShipping.checked = false;
  els.messageTemplate.value = defaultTemplate;
  els.internalNotes.value = "";
  els.formTitle.textContent = "1. Cadastrar produto";
  els.saveProduct.textContent = "Salvar produto";
  els.cancelEdit.style.display = "none";
  if (showLog) addLog("Formulário limpo.", "warning");
}

async function clearAllProducts() {
  if (!confirm("Deseja apagar todos os produtos e interações?")) return;

  setLoading(true);

  try {
    if (isDatabaseOnline) {
      await apiRequest("/api/produtos", { method: "DELETE" });
    }
    products = [];
    interactions = [];
    lastGeneratedMessage = "";
    els.copyLastMessage.disabled = true;
    saveData();
    renderAll();
    resetDirectPreview();
    addLog("Todos os produtos e interações foram apagados.", "error");
  } catch (error) {
    addLog(`Erro ao limpar produtos: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function simulateInstagramComment() {
  const currentPostId = els.simPostId.value.trim();
  const username = els.commentUser.value.trim();
  const comment = els.commentText.value.trim();

  if (!currentPostId || !username || !comment) {
    addLog("Preencha ID do post/reel, usuário e comentário.", "warning");
    return;
  }

  addLog(`${username} comentou "${comment}" no post/reel ${currentPostId}.`, "success");
  const product = findProductByComment(currentPostId, comment);

  if (!product) {
    await saveInteraction(createInteraction({ username, postId: currentPostId, comment, reason: "Nenhum produto encontrado" }));
    els.matchedProduct.innerHTML = "Nenhum produto ativo encontrou esse ID + palavra-chave.";
    els.matchedProduct.className = "matched-empty";
    addLog("Nenhum produto ativo corresponde ao comentário recebido.", "warning");
    return;
  }

  renderMatchedProduct(product);

  if (alreadySent(username, product.id)) {
    await saveInteraction(createInteraction({ productId: product.id, username, postId: currentPostId, comment, reason: "Direct duplicado bloqueado" }));
    addLog(`Direct bloqueado. ${username} já recebeu o link desse produto.`, "warning");
    return;
  }

  const message = buildMessage(product, username);
  await saveInteraction(createInteraction({ productId: product.id, username, postId: currentPostId, comment, directSent: true, reason: "Mensagem enviada" }));
  await saveProductDirectCount({ ...product, directs: Number(product.directs || 0) + 1 });

  lastGeneratedMessage = message;
  els.copyLastMessage.disabled = false;
  sendDirect(username, product, message);

  if (botConfig.publicReply) addLog(`Resposta pública simulada: "${username}, te mandei o link no Direct 🛒"`, "success");
  addLog(`Palavra-chave detectada. Direct enviado para ${username}.`, "success");
}

async function saveInteraction(interaction) {
  try {
    if (isDatabaseOnline) {
      const saved = await apiRequest("/api/interacoes", {
        method: "POST",
        body: JSON.stringify(interaction)
      });
      interactions.unshift(saved);
    } else {
      interactions.push(interaction);
      saveData();
    }
    renderDashboard();
    renderDataPanel();
  } catch (error) {
    addLog(`Erro ao salvar interação: ${error.message}`, "error");
  }
}

async function saveProductDirectCount(product) {
  try {
    if (isDatabaseOnline) {
      const saved = await apiRequest(`/api/produtos/${product.id}`, {
        method: "PUT",
        body: JSON.stringify(product)
      });
      products = products.map((item) => (item.id === product.id ? normalizeProduct(saved) : item));
    } else {
      products = products.map((item) => (item.id === product.id ? product : item));
      saveData();
    }
    renderProducts();
    renderDashboard();
    renderDataPanel();
  } catch (error) {
    addLog(`Erro ao atualizar contador do produto: ${error.message}`, "error");
  }
}

function createInteraction(data) {
  return {
    id: generateId(),
    productId: data.productId || null,
    instagramUserId: data.instagramUserId || null,
    username: data.username,
    commentId: data.commentId || null,
    postId: data.postId,
    comment: data.comment,
    directSent: Boolean(data.directSent),
    reason: data.reason || "Não enviado",
    date: new Date().toISOString()
  };
}

function findProductByComment(currentPostId, comment) {
  return products.find((product) => product.active && normalizeText(product.postId) === normalizeText(currentPostId) && commentHasKeyword(comment, product.keywords || []));
}

function commentHasKeyword(comment, keywordList) {
  const normalizedComment = normalizeText(comment);
  return keywordList.some((keyword) => normalizedComment.includes(normalizeText(keyword)));
}

function alreadySent(username, productId) {
  if (!botConfig.blockDuplicate) return false;
  return interactions.some((item) => normalizeText(item.username) === normalizeText(username) && item.productId === productId && item.directSent === true);
}

function buildMessage(product, username) {
  const coupon = product.couponCode ? `🎟️ Cupom: ${product.couponCode}` : "";
  const shipping = product.freeShipping ? "🚚 Frete grátis disponível" : "";
  const validity = product.offerValidity ? `⏰ ${product.offerValidity}` : "";
  const benefit = product.benefitText ? `✨ ${product.benefitText}` : "";

  return String(product.template || defaultTemplate)
    .replaceAll("{{nome}}", extractName(username))
    .replaceAll("{{usuario}}", username)
    .replaceAll("{{produto}}", product.name || "")
    .replaceAll("{{plataforma}}", product.platform || "")
    .replaceAll("{{categoria}}", product.category || "")
    .replaceAll("{{preco_antigo}}", product.oldPrice || "")
    .replaceAll("{{preco_atual}}", product.newPrice || "")
    .replaceAll("{{cupom}}", coupon)
    .replaceAll("{{frete}}", shipping)
    .replaceAll("{{validade}}", validity)
    .replaceAll("{{beneficio}}", benefit)
    .replaceAll("{{link}}", product.link || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractName(username) {
  const clean = username.replace("@", "").trim();
  if (!clean) return "tudo bem";
  const firstPart = clean.split(".")[0].split("_")[0];
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

function sendDirect(username, product, message) {
  const empty = els.directMessages.querySelector(".empty");
  if (empty) els.directMessages.innerHTML = "";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = `
    <div class="bubble-user">Mensagem enviada para ${escapeHtml(username)}</div>
    ${product.image ? `<img src="${escapeAttribute(product.image)}" alt="Produto" />` : ""}
    <div>${escapeHtml(message).replace(/\n/g, "<br>")}</div>
  `;
  els.directMessages.appendChild(bubble);
  els.directMessages.scrollTop = els.directMessages.scrollHeight;
}

function renderMatchedProduct(product) {
  els.matchedProduct.className = "matched-product";
  els.matchedProduct.innerHTML = `
    ${product.image ? `<img src="${escapeAttribute(product.image)}" alt="Produto">` : `<div class="no-image">Sem imagem</div>`}
    <div>
      <strong>${escapeHtml(product.name)}</strong>
      <small>${escapeHtml(product.platform)} • ${escapeHtml(product.category || "Sem categoria")}</small>
      <small>Post/Reel: ${escapeHtml(product.postId)}</small>
      <p><span class="old">${escapeHtml(product.oldPrice || "")}</span><span class="price">${escapeHtml(product.newPrice || "")}</span></p>
    </div>
  `;
}

function renderProducts() {
  const search = normalizeText(els.productSearch.value || "");
  const filter = els.statusFilter.value || "all";

  const filteredProducts = products.filter((product) => {
    const searchText = normalizeText(`${product.name} ${product.postId} ${(product.keywords || []).join(" ")} ${product.link} ${product.couponCode} ${product.benefitText} ${product.platform} ${product.category} ${product.internalNotes}`);
    const matchesSearch = !search || searchText.includes(search);
    const matchesFilter = filter === "all" || (filter === "active" && product.active) || (filter === "inactive" && !product.active);
    return matchesSearch && matchesFilter;
  });

  if (!products.length) {
    els.productsList.innerHTML = `<div class="empty-list">Nenhum produto cadastrado ainda. Cadastre o primeiro produto no formulário acima.</div>`;
    return;
  }

  if (!filteredProducts.length) {
    els.productsList.innerHTML = `<div class="empty-list">Nenhum produto encontrado com esse filtro.</div>`;
    return;
  }

  els.productsList.innerHTML = filteredProducts.map((product) => {
    const imageHtml = product.image ? `<img class="product-thumb" src="${escapeAttribute(product.image)}" alt="Produto">` : `<div class="no-image">Sem imagem</div>`;
    return `
      <div class="product-item ${product.active ? "" : "inactive"}">
        ${imageHtml}
        <div class="product-info">
          <h3>${escapeHtml(product.name)}</h3>
          <p><span class="old">${escapeHtml(product.oldPrice || "")}</span><span class="price">${escapeHtml(product.newPrice || "")}</span></p>
          <p>Post/Reel ID: <strong>${escapeHtml(product.postId)}</strong></p>
          <p>Palavras: ${escapeHtml((product.keywords || []).join(", "))}</p>
          <div class="badges">
            <span class="badge ${product.active ? "active" : "inactive"}">${product.active ? "Ativo" : "Inativo"}</span>
            <span class="badge">${Number(product.directs || 0)} Directs enviados</span>
            <span class="badge">${isDatabaseOnline ? "Supabase" : "Local"}</span>
            <span class="badge">${escapeHtml(product.platform || "Sem plataforma")}</span>
            ${product.category ? `<span class="badge">${escapeHtml(product.category)}</span>` : ""}
            ${product.couponCode ? `<span class="badge">Cupom: ${escapeHtml(product.couponCode)}</span>` : ""}
            ${product.freeShipping ? `<span class="badge">Frete grátis</span>` : ""}
          </div>
        </div>
        <div class="actions">
          <button class="action-btn edit" onclick="editProduct('${product.id}')">Editar</button>
          <button class="action-btn toggle" onclick="toggleProduct('${product.id}')">${product.active ? "Desativar" : "Ativar"}</button>
          <button class="action-btn delete" onclick="deleteProduct('${product.id}')">Excluir</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderDashboard() {
  const totalProducts = products.length;
  const activeProducts = products.filter((product) => product.active).length;
  const totalComments = interactions.length;
  const totalDirects = products.reduce((sum, product) => sum + Number(product.directs || 0), 0);
  const rate = totalComments > 0 ? Math.round((totalDirects / totalComments) * 100) : 0;
  els.dashTotalProducts.textContent = totalProducts;
  els.dashActiveProducts.textContent = activeProducts;
  els.dashComments.textContent = totalComments;
  els.dashDirects.textContent = totalDirects;
  els.dashRate.textContent = `${rate}%`;
}

function renderMessageProducts() {
  if (!products.length) {
    els.messageProductSelect.innerHTML = `<option value="">Nenhum produto cadastrado</option>`;
    return;
  }

  const currentValue = els.messageProductSelect.value;
  els.messageProductSelect.innerHTML = products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)} - ${escapeHtml(product.postId)}</option>`).join("");
  if (currentValue && products.some((product) => product.id === currentValue)) els.messageProductSelect.value = currentValue;
}

function loadSelectedProductToMessageFields() {
  const product = getSelectedMessageProduct();
  if (!product) {
    els.msgCoupon.value = "";
    els.msgValidity.value = "";
    els.msgBenefit.value = "";
    els.msgFreeShipping.checked = false;
    return;
  }
  els.msgCoupon.value = product.couponCode || "";
  els.msgValidity.value = product.offerValidity || "";
  els.msgBenefit.value = product.benefitText || "";
  els.msgFreeShipping.checked = Boolean(product.freeShipping);
  updatePublicReplyPreview();
}

function getSelectedMessageProduct() {
  return products.find((product) => product.id === els.messageProductSelect.value);
}

function generateSmartMessage() {
  const product = getSelectedMessageProduct();
  if (!product) return addLog("Cadastre um produto antes de gerar mensagem.", "warning");
  els.generatedTemplate.value = templatesByTone[els.messageTone.value] || templatesByTone.short;
  updatePublicReplyPreview();
  addLog(`Modelo de mensagem gerado para "${product.name}".`, "success");
}

async function applyGeneratedTemplateToProduct() {
  const product = getSelectedMessageProduct();
  if (!product) return addLog("Selecione um produto para aplicar o modelo.", "warning");
  if (!els.generatedTemplate.value.trim()) return addLog("Gere ou escreva um modelo antes de aplicar.", "warning");

  const updated = {
    ...product,
    template: els.generatedTemplate.value.trim(),
    couponCode: els.msgCoupon.value.trim(),
    offerValidity: els.msgValidity.value.trim(),
    benefitText: els.msgBenefit.value.trim(),
    freeShipping: els.msgFreeShipping.checked
  };

  try {
    if (isDatabaseOnline) {
      const saved = await apiRequest(`/api/produtos/${product.id}`, {
        method: "PUT",
        body: JSON.stringify(updated)
      });
      products = products.map((item) => (item.id === product.id ? normalizeProduct(saved) : item));
    } else {
      products = products.map((item) => (item.id === product.id ? updated : item));
      saveData();
    }
    renderAll();
    addLog(`Modelo aplicado ao produto "${product.name}".`, "success");
  } catch (error) {
    addLog(`Erro ao aplicar modelo: ${error.message}`, "error");
  }
}

function copyGeneratedTemplateHandler() {
  const text = els.generatedTemplate.value.trim();
  if (!text) return addLog("Nenhum modelo gerado para copiar.", "warning");
  copyText(text, "Modelo copiado para a área de transferência.");
}

function usePreset(preset) {
  els.generatedTemplate.value = templatesByTone[preset] || templatesByTone.short;
  els.messageTone.value = templatesByTone[preset] ? preset : "short";
  updatePublicReplyPreview();
  addLog("Modelo rápido carregado.", "success");
}

function updatePublicReplyPreview() {
  const product = getSelectedMessageProduct();
  const user = els.commentUser.value.trim() || "@cliente";
  els.publicReplyPreview.textContent = `${user}, te mandei o link do ${product ? product.name : "produto"} no Direct 🛒`;
}

function renderDataPanel() {
  const totalDirects = products.reduce((sum, product) => sum + Number(product.directs || 0), 0);
  els.dataTotalProducts.textContent = products.length;
  els.dataTotalInteractions.textContent = interactions.length;
  els.dataTotalDirects.textContent = totalDirects;

  if (!interactions.length) {
    els.interactionsPreview.innerHTML = `<div class="empty-list">Nenhuma interação salva ainda.</div>`;
    return;
  }

  els.interactionsPreview.innerHTML = interactions
    .slice()
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 12)
    .map((item) => {
      const product = products.find((product) => product.id === item.productId);
      return `
        <div class="interaction-item">
          <strong>${escapeHtml(item.username)} comentou: "${escapeHtml(item.comment)}"</strong>
          <span>Produto: ${escapeHtml(product ? product.name : "Produto não encontrado")}</span>
          <span>Post/Reel: ${escapeHtml(item.postId)}</span>
          <span>Status: ${item.directSent ? "Direct enviado" : escapeHtml(item.reason || "Não enviado")}</span>
        </div>
      `;
    })
    .join("");
}

function exportProductsJson() {
  downloadJson("instabot-produtos.json", products);
  addLog("Produtos exportados em JSON.", "success");
}

function exportFullBackup() {
  downloadJson("instabot-backup-completo.json", {
    version: "v2-supabase",
    storage: isDatabaseOnline ? "supabase" : "local",
    exportedAt: new Date().toISOString(),
    products,
    interactions,
    botConfig
  });
  addLog("Backup completo exportado.", "success");
}

async function importJsonData() {
  const text = els.importJson.value.trim();
  if (!text) return addLog("Cole um JSON antes de importar.", "warning");
  if (!confirm("Importar esse JSON vai substituir os dados atuais. Continuar?")) return;

  setLoading(true);

  try {
    const parsed = JSON.parse(text);
    const importedProducts = els.importMode.value === "products" ? (Array.isArray(parsed) ? parsed : parsed.products) : parsed.products;

    if (!Array.isArray(importedProducts)) {
      addLog("JSON inválido. O campo products não foi encontrado.", "error");
      return;
    }

    if (isDatabaseOnline) {
      await apiRequest("/api/produtos", { method: "DELETE" });
      for (const product of importedProducts) {
        await apiRequest("/api/produtos", {
          method: "POST",
          body: JSON.stringify(normalizeProduct(product))
        });
      }
      if (els.importMode.value === "backup" && parsed.botConfig) await saveConfigToApi(parsed.botConfig);
      await reloadFromDatabase();
    } else {
      products = importedProducts.map(normalizeProduct);
      interactions = els.importMode.value === "backup" && Array.isArray(parsed.interactions) ? parsed.interactions : [];
      if (els.importMode.value === "backup" && parsed.botConfig) {
        botConfig = { ...defaultConfig, ...parsed.botConfig };
        saveConfigToStorage();
        renderConfigForm();
        updateConnectionStatus();
      }
      saveData();
      renderAll();
    }

    els.importJson.value = "";
    addLog("JSON importado com sucesso.", "success");
  } catch (error) {
    addLog(`Não foi possível importar: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function clearOnlyHistory() {
  if (!confirm("Deseja limpar somente o histórico de interações? Os produtos serão mantidos.")) return;

  setLoading(true);

  try {
    if (isDatabaseOnline) {
      await apiRequest("/api/interacoes", { method: "DELETE" });
      await reloadFromDatabase();
    } else {
      interactions = [];
      products = products.map((product) => ({ ...product, directs: 0 }));
      saveData();
      renderAll();
    }

    lastGeneratedMessage = "";
    els.copyLastMessage.disabled = true;
    resetDirectPreview();
    addLog("Histórico de interações limpo.", "warning");
  } catch (error) {
    addLog(`Erro ao limpar histórico: ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function loadConfig() {
  try {
    if (isDatabaseOnline) {
      const remoteConfig = await apiRequest("/api/configuracoes");
      botConfig = remoteConfig ? { ...defaultConfig, ...remoteConfig } : { ...defaultConfig };
    } else {
      const savedConfig = localStorage.getItem("instabot_config_v1_github");
      botConfig = savedConfig ? { ...defaultConfig, ...JSON.parse(savedConfig) } : { ...defaultConfig };
    }
  } catch (error) {
    const savedConfig = localStorage.getItem("instabot_config_v1_github");
    botConfig = savedConfig ? { ...defaultConfig, ...JSON.parse(savedConfig) } : { ...defaultConfig };
  }

  renderConfigForm();
  updateConnectionStatus();
}

function renderConfigForm() {
  els.accountName.value = botConfig.accountName || "";
  els.instagramUser.value = botConfig.instagramUser || "";
  els.instagramBusinessId.value = botConfig.instagramBusinessId || "";
  els.facebookPageId.value = botConfig.facebookPageId || "";
  els.metaAppId.value = botConfig.metaAppId || "";
  els.accessToken.value = botConfig.accessToken || "";
  els.verifyToken.value = botConfig.verifyToken || "";
  els.botMode.value = botConfig.botMode || "simulation";
  els.webhookUrl.value = botConfig.webhookUrl || "";
  els.publicReply.checked = Boolean(botConfig.publicReply);
  els.blockDuplicate.checked = Boolean(botConfig.blockDuplicate);
}

function getConfigFromForm() {
  return {
    id: botConfig.id,
    accountName: els.accountName.value.trim(),
    instagramUser: els.instagramUser.value.trim(),
    instagramBusinessId: els.instagramBusinessId.value.trim(),
    facebookPageId: els.facebookPageId.value.trim(),
    metaAppId: els.metaAppId.value.trim(),
    accessToken: els.accessToken.value.trim(),
    verifyToken: els.verifyToken.value.trim(),
    botMode: els.botMode.value,
    webhookUrl: els.webhookUrl.value.trim(),
    publicReply: els.publicReply.checked,
    blockDuplicate: els.blockDuplicate.checked
  };
}

async function saveBotConfig() {
  botConfig = getConfigFromForm();

  try {
    if (isDatabaseOnline) {
      botConfig = { ...botConfig, ...(await saveConfigToApi(botConfig)) };
    } else {
      saveConfigToStorage();
    }
    updateConnectionStatus();
    renderDataPanel();
    addLog("Configurações do Instagram salvas.", "success");
  } catch (error) {
    addLog(`Erro ao salvar configurações: ${error.message}`, "error");
  }
}

async function saveConfigToApi(config) {
  const saved = await apiRequest("/api/configuracoes", {
    method: "POST",
    body: JSON.stringify(config)
  });
  return { ...config, ...saved };
}

function saveConfigToStorage() {
  localStorage.setItem("instabot_config_v1_github", JSON.stringify(botConfig));
}

async function resetBotConfig() {
  if (!confirm("Restaurar configurações padrão?")) return;
  botConfig = { ...defaultConfig };

  try {
    if (isDatabaseOnline) {
      botConfig = { ...botConfig, ...(await saveConfigToApi(botConfig)) };
    } else {
      saveConfigToStorage();
    }
    renderConfigForm();
    updateConnectionStatus();
    renderDataPanel();
    addLog("Configurações restauradas para o padrão.", "warning");
  } catch (error) {
    addLog(`Erro ao restaurar configurações: ${error.message}`, "error");
  }
}

function updateConnectionStatus() {
  const hasMinimumData = botConfig.instagramBusinessId && botConfig.facebookPageId && botConfig.metaAppId && botConfig.webhookUrl;

  if (botConfig.botMode === "connected" && hasMinimumData) {
    els.connectionTitle.textContent = "Conta pronta para conexão";
    els.connectionText.textContent = `${botConfig.instagramUser || "Instagram"} configurado para integração real.`;
    els.connectionBadge.textContent = isDatabaseOnline ? "Banco conectado" : "Conectado";
    els.connectionBadge.className = "connection-badge connected";
  } else {
    els.connectionTitle.textContent = isDatabaseOnline ? "Supabase conectado" : "Modo simulação ativo";
    els.connectionText.textContent = isDatabaseOnline ? "Produtos e interações serão salvos no banco." : "Nenhuma conta real conectada ainda.";
    els.connectionBadge.textContent = isDatabaseOnline ? "Supabase" : "Simulação";
    els.connectionBadge.className = isDatabaseOnline ? "connection-badge connected" : "connection-badge simulation";
  }

  els.webhookPreview.textContent = botConfig.webhookUrl || "https://instabot-ofertas.onrender.com/webhook";
  toggleCheck(els.checkAccount, Boolean(botConfig.instagramUser));
  toggleCheck(els.checkPage, Boolean(botConfig.facebookPageId));
  toggleCheck(els.checkApp, Boolean(botConfig.metaAppId));
  toggleCheck(els.checkToken, Boolean(botConfig.accessToken));
  toggleCheck(els.checkWebhook, Boolean(botConfig.webhookUrl));
}

function toggleCheck(element, condition) {
  const originalText = element.textContent.replace("✅ ", "").replace("❌ ", "");
  element.classList.toggle("ok", condition);
  element.textContent = (condition ? "✅ " : "❌ ") + originalText;
}

function copyLastGeneratedMessage() {
  if (!lastGeneratedMessage) return addLog("Nenhuma mensagem disponível para copiar.", "warning");
  copyText(lastGeneratedMessage, "Última mensagem copiada para a área de transferência.");
}

function copyText(text, successMessage) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => addLog(successMessage, "success")).catch(() => fallbackCopy(text, successMessage));
    return;
  }
  fallbackCopy(text, successMessage);
}

function fallbackCopy(text, successMessage) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  addLog(successMessage, "success");
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function addLog(message, type = "success") {
  if (!els.botLog) return;
  const muted = els.botLog.querySelector(".muted");
  if (muted) els.botLog.innerHTML = "";
  const item = document.createElement("div");
  item.className = `log-item ${type}`;
  const hour = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  item.innerHTML = `<strong>${hour}</strong> - ${escapeHtml(message)}`;
  els.botLog.prepend(item);
}

function renderLogStart() {
  if (!els.botLog.querySelector(".log-item")) els.botLog.innerHTML = `<p class="muted">Aguardando comentários...</p>`;
}

function renderAll() {
  renderProducts();
  renderMessageProducts();
  renderDashboard();
  renderDataPanel();
  renderLogStart();
  updatePublicReplyPreview();
  updateConnectionStatus();
}

function resetDirectPreview() {
  els.directMessages.innerHTML = `<div class="empty">Nenhuma mensagem enviada ainda.<br />Simule um comentário para testar.</div>`;
  els.matchedProduct.innerHTML = "Nenhum comentário simulado ainda.";
  els.matchedProduct.className = "matched-empty";
}

function normalizeText(text) {
  return String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (match) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[match]));
}

function escapeAttribute(text) {
  return escapeHtml(text).replace(/`/g, "&#096;");
}

function generateId() {
  return "id_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
}

function saveData() {
  if (isDatabaseOnline && !isBooting) return;
  localStorage.setItem("instabot_products_v1_github", JSON.stringify(products));
  localStorage.setItem("instabot_interactions_v1_github", JSON.stringify(interactions));
}

function normalizeProduct(product = {}) {
  return {
    id: product.id || generateId(),
    name: product.name || "",
    platform: product.platform || "Shopee",
    category: product.category || "",
    oldPrice: product.oldPrice || "",
    newPrice: product.newPrice || "",
    link: product.link || "",
    image: product.image || "",
    postId: product.postId || "",
    keywords: Array.isArray(product.keywords) ? product.keywords : [],
    couponCode: product.couponCode || "",
    offerValidity: product.offerValidity || "",
    benefitText: product.benefitText || "",
    freeShipping: Boolean(product.freeShipping),
    internalNotes: product.internalNotes || "",
    template: product.template || defaultTemplate,
    active: product.active !== false,
    directs: Number(product.directs || 0),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: product.updatedAt || null
  };
}

els.saveProduct.addEventListener("click", saveProductHandler);
els.cancelEdit.addEventListener("click", () => clearForm());
els.simulateComment.addEventListener("click", simulateInstagramComment);
els.clearAll.addEventListener("click", clearAllProducts);
els.productSearch.addEventListener("input", renderProducts);
els.statusFilter.addEventListener("change", renderProducts);
els.copyLastMessage.addEventListener("click", copyLastGeneratedMessage);
els.messageProductSelect.addEventListener("change", loadSelectedProductToMessageFields);
els.generateMessage.addEventListener("click", generateSmartMessage);
els.applyGeneratedTemplate.addEventListener("click", applyGeneratedTemplateToProduct);
els.copyGeneratedTemplate.addEventListener("click", copyGeneratedTemplateHandler);
els.msgCoupon.addEventListener("input", updatePublicReplyPreview);
els.msgValidity.addEventListener("input", updatePublicReplyPreview);
els.msgBenefit.addEventListener("input", updatePublicReplyPreview);
els.msgFreeShipping.addEventListener("change", updatePublicReplyPreview);
document.querySelectorAll(".preset-btn").forEach((button) => button.addEventListener("click", () => usePreset(button.dataset.preset)));
els.exportProducts.addEventListener("click", exportProductsJson);
els.exportBackup.addEventListener("click", exportFullBackup);
els.importData.addEventListener("click", importJsonData);
els.clearHistory.addEventListener("click", clearOnlyHistory);
els.saveConfig.addEventListener("click", saveBotConfig);
els.resetConfig.addEventListener("click", resetBotConfig);

window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.toggleProduct = toggleProduct;

startApp();
