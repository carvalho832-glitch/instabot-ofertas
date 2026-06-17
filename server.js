import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "instabot_verify_token";
const BOT_MODE = process.env.BOT_MODE || "simulation";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public")));

function ensureSupabase(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      ok: false,
      message: "Supabase ainda não configurado. Adicione SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Render."
    });
  }

  next();
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function commentHasKeyword(comment, keywordList = []) {
  const normalizedComment = normalizeText(comment);
  return keywordList.some((keyword) => normalizedComment.includes(normalizeText(keyword)));
}

function extractName(username = "") {
  const clean = String(username).replace("@", "").trim();
  if (!clean) return "tudo bem";
  const firstPart = clean.split(".")[0].split("_")[0];
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
}

function toDbProduct(product = {}) {
  return {
    nome: product.name ?? product.nome ?? "",
    plataforma: product.platform ?? product.plataforma ?? "Shopee",
    categoria: product.category ?? product.categoria ?? "",
    preco_antigo: product.oldPrice ?? product.preco_antigo ?? "",
    preco_atual: product.newPrice ?? product.preco_atual ?? "",
    link_afiliado: product.link ?? product.link_afiliado ?? "",
    imagem_url: product.image ?? product.imagem_url ?? "",
    instagram_media_id: product.postId ?? product.instagram_media_id ?? "",
    palavras_chave: Array.isArray(product.keywords) ? product.keywords : product.palavras_chave ?? [],
    cupom: product.couponCode ?? product.cupom ?? "",
    validade_oferta: product.offerValidity ?? product.validade_oferta ?? "",
    beneficio: product.benefitText ?? product.beneficio ?? "",
    frete_gratis: Boolean(product.freeShipping ?? product.frete_gratis),
    mensagem_template: product.template ?? product.mensagem_template ?? "",
    observacoes_internas: product.internalNotes ?? product.observacoes_internas ?? "",
    ativo: product.active ?? product.ativo ?? true,
    directs_enviados: Number(product.directs ?? product.directs_enviados ?? 0),
    updated_at: new Date().toISOString()
  };
}

function fromDbProduct(row = {}) {
  return {
    id: row.id,
    name: row.nome,
    platform: row.plataforma,
    category: row.categoria,
    oldPrice: row.preco_antigo,
    newPrice: row.preco_atual,
    link: row.link_afiliado,
    image: row.imagem_url,
    postId: row.instagram_media_id,
    keywords: row.palavras_chave || [],
    couponCode: row.cupom,
    offerValidity: row.validade_oferta,
    benefitText: row.beneficio,
    freeShipping: row.frete_gratis,
    template: row.mensagem_template,
    internalNotes: row.observacoes_internas,
    active: row.ativo,
    directs: row.directs_enviados || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildDirectMessage(product, username) {
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

function toDbInteraction(interaction = {}) {
  return {
    produto_id: interaction.productId || interaction.produto_id || null,
    instagram_user_id: interaction.instagramUserId || interaction.instagram_user_id || null,
    instagram_username: interaction.username || interaction.instagram_username || "",
    instagram_comment_id: interaction.commentId || interaction.instagram_comment_id || null,
    instagram_media_id: interaction.postId || interaction.instagram_media_id || "",
    comentario_texto: interaction.comment || interaction.comentario_texto || "",
    direct_enviado: Boolean(interaction.directSent ?? interaction.direct_enviado),
    motivo: interaction.reason || interaction.motivo || ""
  };
}

function fromDbInteraction(row = {}) {
  return {
    id: row.id,
    productId: row.produto_id,
    instagramUserId: row.instagram_user_id,
    username: row.instagram_username,
    commentId: row.instagram_comment_id,
    postId: row.instagram_media_id,
    comment: row.comentario_texto,
    directSent: row.direct_enviado,
    reason: row.motivo,
    date: row.created_at
  };
}

function toDbConfig(config = {}) {
  return {
    nome_conta: config.accountName ?? config.nome_conta ?? "",
    instagram_user: config.instagramUser ?? config.instagram_user ?? "",
    instagram_business_id: config.instagramBusinessId ?? config.instagram_business_id ?? "",
    facebook_page_id: config.facebookPageId ?? config.facebook_page_id ?? "",
    meta_app_id: config.metaAppId ?? config.meta_app_id ?? "",
    webhook_url: config.webhookUrl ?? config.webhook_url ?? "",
    modo_bot: config.botMode ?? config.modo_bot ?? "simulation",
    responder_publicamente: Boolean(config.publicReply ?? config.responder_publicamente),
    bloquear_duplicado: Boolean(config.blockDuplicate ?? config.bloquear_duplicado),
    updated_at: new Date().toISOString()
  };
}

function fromDbConfig(row = {}) {
  return {
    id: row.id,
    accountName: row.nome_conta,
    instagramUser: row.instagram_user,
    instagramBusinessId: row.instagram_business_id,
    facebookPageId: row.facebook_page_id,
    metaAppId: row.meta_app_id,
    webhookUrl: row.webhook_url,
    botMode: row.modo_bot,
    publicReply: row.responder_publicamente,
    blockDuplicate: row.bloquear_duplicado,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function fromDbWebhookEvent(row = {}) {
  return {
    id: row.id,
    source: row.origem,
    eventType: row.tipo_evento,
    mediaId: row.instagram_media_id,
    commentId: row.instagram_comment_id,
    username: row.instagram_username,
    comment: row.comentario_texto,
    matched: row.produto_encontrado,
    safeMode: row.modo_seguro,
    payload: row.payload,
    createdAt: row.created_at
  };
}

async function getBotConfig() {
  const { data } = await supabase
    .from("configuracoes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  return data?.[0]
    ? fromDbConfig(data[0])
    : { publicReply: true, blockDuplicate: true, botMode: "simulation" };
}

async function insertInteraction(interaction) {
  const { data, error } = await supabase
    .from("interacoes")
    .insert(toDbInteraction(interaction))
    .select("*")
    .single();

  if (error) throw error;
  return fromDbInteraction(data);
}

async function insertWebhookEvent(event) {
  const payload = {
    origem: event.source || "webhook",
    tipo_evento: event.eventType || "comment",
    instagram_media_id: event.postId || null,
    instagram_comment_id: event.commentId || null,
    instagram_username: event.username || "",
    comentario_texto: event.comment || "",
    produto_encontrado: Boolean(event.matched),
    modo_seguro: event.safeMode !== false,
    payload: event.payload || {}
  };

  const { data, error } = await supabase
    .from("webhook_eventos")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    console.warn("webhook_eventos não gravado:", error.message);
    return null;
  }

  return fromDbWebhookEvent(data);
}

async function runCommentEngine({ postId, username, comment, commentId = null, userId = null, source = "simulation", safeMode = true, rawPayload = {} }) {
  const config = await getBotConfig();

  const { data: rows, error: productError } = await supabase
    .from("produtos")
    .select("*")
    .eq("ativo", true)
    .eq("instagram_media_id", postId);

  if (productError) throw productError;

  const matchedRow = (rows || []).find((row) => commentHasKeyword(comment, row.palavras_chave || []));

  if (!matchedRow) {
    const interaction = await insertInteraction({
      username,
      instagramUserId: userId,
      commentId,
      postId,
      comment,
      directSent: false,
      reason: source === "webhook" ? "Webhook recebido, nenhum produto encontrado" : "Nenhum produto encontrado"
    });

    const event = await insertWebhookEvent({
      source,
      eventType: "comment",
      postId,
      commentId,
      username,
      comment,
      matched: false,
      safeMode,
      payload: rawPayload
    });

    return {
      ok: true,
      matched: false,
      duplicate: false,
      message: null,
      product: null,
      interaction,
      webhookEvent: event,
      publicReply: false,
      safeMode,
      reason: "Nenhum produto ativo encontrou esse ID + palavra-chave."
    };
  }

  const product = fromDbProduct(matchedRow);

  if (config.blockDuplicate) {
    const { data: duplicateRows, error: duplicateError } = await supabase
      .from("interacoes")
      .select("id")
      .eq("produto_id", product.id)
      .eq("instagram_username", username)
      .eq("direct_enviado", true)
      .limit(1);

    if (duplicateError) throw duplicateError;

    if (duplicateRows?.length) {
      const interaction = await insertInteraction({
        productId: product.id,
        username,
        instagramUserId: userId,
        commentId,
        postId,
        comment,
        directSent: false,
        reason: "Direct duplicado bloqueado"
      });

      const event = await insertWebhookEvent({
        source,
        eventType: "comment_duplicate",
        postId,
        commentId,
        username,
        comment,
        matched: true,
        safeMode,
        payload: rawPayload
      });

      return {
        ok: true,
        matched: true,
        duplicate: true,
        message: null,
        product,
        interaction,
        webhookEvent: event,
        publicReply: false,
        safeMode,
        reason: "Direct duplicado bloqueado"
      };
    }
  }

  const message = buildDirectMessage(product, username);

  const interaction = await insertInteraction({
    productId: product.id,
    username,
    instagramUserId: userId,
    commentId,
    postId,
    comment,
    directSent: true,
    reason: safeMode ? "Mensagem gerada em modo seguro" : "Mensagem enviada pelo motor backend"
  });

  const nextDirects = Number(product.directs || 0) + 1;
  const { data: updatedProductRow, error: updateError } = await supabase
    .from("produtos")
    .update({ directs_enviados: nextDirects, updated_at: new Date().toISOString() })
    .eq("id", product.id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  const event = await insertWebhookEvent({
    source,
    eventType: safeMode ? "comment_safe_mode" : "comment_processed",
    postId,
    commentId,
    username,
    comment,
    matched: true,
    safeMode,
    payload: rawPayload
  });

  return {
    ok: true,
    matched: true,
    duplicate: false,
    message,
    product: fromDbProduct(updatedProductRow),
    interaction,
    webhookEvent: event,
    publicReply: Boolean(config.publicReply),
    safeMode,
    reason: safeMode ? "Webhook processado em modo seguro, sem envio real." : "Mensagem gerada pelo motor backend"
  };
}

function extractInstagramComments(payload = {}) {
  const events = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const text = value.text || value.comment_text || value.message || "";
      const postId = value.media_id || value.media?.id || value.post_id || value.id || "";
      const username = value.from?.username || value.username || value.from?.name || "@cliente";
      const userId = value.from?.id || value.user_id || null;
      const commentId = value.comment_id || value.id || null;

      if (text && postId) {
        events.push({
          postId: String(postId),
          username: String(username).startsWith("@") ? String(username) : `@${username}`,
          comment: String(text),
          commentId: commentId ? String(commentId) : null,
          userId: userId ? String(userId) : null,
          field: change.field || "comments"
        });
      }
    }
  }

  return events;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    name: "instabot-ofertas",
    mode: BOT_MODE,
    database: supabase ? "configured" : "missing",
    webhook: "ready",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    app: "InstaBot Ofertas",
    mode: BOT_MODE,
    database: supabase ? "configured" : "missing",
    webhook: "ready"
  });
});

app.get("/api/produtos", ensureSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from("produtos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json(data.map(fromDbProduct));
});

app.post("/api/produtos", ensureSupabase, async (req, res) => {
  const payload = toDbProduct(req.body);

  if (!payload.nome || !payload.link_afiliado || !payload.instagram_media_id) {
    return res.status(400).json({ ok: false, message: "Nome, link e ID do post/reel são obrigatórios." });
  }

  const { data, error } = await supabase
    .from("produtos")
    .insert(payload)
    .select("*")
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.status(201).json(fromDbProduct(data));
});

app.put("/api/produtos/:id", ensureSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from("produtos")
    .update(toDbProduct(req.body))
    .eq("id", req.params.id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json(fromDbProduct(data));
});

app.delete("/api/produtos/:id", ensureSupabase, async (req, res) => {
  const { error } = await supabase
    .from("produtos")
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
});

app.delete("/api/produtos", ensureSupabase, async (req, res) => {
  const { error } = await supabase
    .from("produtos")
    .delete()
    .not("id", "is", null);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  await supabase.from("interacoes").delete().not("id", "is", null);
  res.json({ ok: true });
});

app.get("/api/interacoes", ensureSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from("interacoes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json(data.map(fromDbInteraction));
});

app.post("/api/interacoes", ensureSupabase, async (req, res) => {
  const payload = toDbInteraction(req.body);

  const { data, error } = await supabase
    .from("interacoes")
    .insert(payload)
    .select("*")
    .single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.status(201).json(fromDbInteraction(data));
});

app.delete("/api/interacoes", ensureSupabase, async (req, res) => {
  const { error } = await supabase
    .from("interacoes")
    .delete()
    .not("id", "is", null);

  if (error) return res.status(500).json({ ok: false, error: error.message });

  await supabase
    .from("produtos")
    .update({ directs_enviados: 0, updated_at: new Date().toISOString() })
    .not("id", "is", null);

  res.json({ ok: true });
});

app.get("/api/configuracoes", ensureSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json(data?.[0] ? fromDbConfig(data[0]) : null);
});

app.post("/api/configuracoes", ensureSupabase, async (req, res) => {
  const payload = toDbConfig(req.body);
  const id = req.body.id;

  const query = id
    ? supabase.from("configuracoes").update(payload).eq("id", id)
    : supabase.from("configuracoes").insert(payload);

  const { data, error } = await query.select("*").single();

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json(fromDbConfig(data));
});

app.get("/api/webhook-eventos", ensureSupabase, async (req, res) => {
  const { data, error } = await supabase
    .from("webhook_eventos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return res.json([]);
  res.json(data.map(fromDbWebhookEvent));
});

app.post("/api/simular-comentario", ensureSupabase, async (req, res) => {
  try {
    const postId = String(req.body.postId || "").trim();
    const username = String(req.body.username || "").trim();
    const comment = String(req.body.comment || "").trim();

    if (!postId || !username || !comment) {
      return res.status(400).json({ ok: false, message: "Informe postId, username e comment." });
    }

    const result = await runCommentEngine({
      postId,
      username,
      comment,
      source: "simulation",
      safeMode: false,
      rawPayload: { postId, username, comment }
    });

    return res.json(result);
  } catch (error) {
    console.error("Erro na simulação backend:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/testar-webhook-meta", ensureSupabase, async (req, res) => {
  const postId = String(req.body.postId || "POST-001").trim();
  const username = String(req.body.username || "@cliente.meta").trim();
  const comment = String(req.body.comment || "eu quero").trim();

  req.body = {
    object: "instagram",
    entry: [
      {
        id: "IG_BUSINESS_TEST",
        time: Date.now(),
        changes: [
          {
            field: "comments",
            value: {
              id: "COMMENT_TEST_" + Date.now(),
              media_id: postId,
              text: comment,
              from: {
                id: "USER_TEST",
                username: username.replace("@", "")
              }
            }
          }
        ]
      }
    ]
  };

  return processWebhookPayload(req, res, true);
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

async function processWebhookPayload(req, res, isInternalTest = false) {
  try {
    if (!supabase) return res.sendStatus(200);

    const comments = extractInstagramComments(req.body);
    const results = [];

    if (!comments.length) {
      await insertWebhookEvent({
        source: isInternalTest ? "webhook_test" : "webhook",
        eventType: "raw_event_no_comment",
        safeMode: true,
        matched: false,
        payload: req.body
      });

      return res.status(200).json({ ok: true, received: true, comments: 0, results: [] });
    }

    for (const item of comments) {
      const result = await runCommentEngine({
        postId: item.postId,
        username: item.username,
        comment: item.comment,
        commentId: item.commentId,
        userId: item.userId,
        source: isInternalTest ? "webhook_test" : "webhook",
        safeMode: true,
        rawPayload: req.body
      });

      results.push(result);
    }

    return res.status(200).json({
      ok: true,
      received: true,
      comments: comments.length,
      safeMode: true,
      results
    });
  } catch (error) {
    console.error("Erro no webhook:", error);
    return res.status(200).json({ ok: false, received: true, error: error.message });
  }
}

app.post("/webhook", (req, res) => processWebhookPayload(req, res, false));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`InstaBot Ofertas rodando na porta ${PORT}`);
});
