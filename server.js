import express from "express";
import crypto from "node:crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { createReviewRouter } from "./review-routes.js";

// Node 18+ já possui fetch global.
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "instabot_verify_token";
const BOT_MODE = process.env.BOT_MODE || "simulation";
const GRAPH_VERSION = process.env.GRAPH_VERSION || "v25.0";
const DIRECT_ENABLED = String(process.env.DIRECT_ENABLED ?? "false").toLowerCase() === "true";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "";
const META_APP_SECRET = process.env.META_APP_SECRET || "";
// Instagram Login has its own App ID and signing secret distinct from
// the Meta parent app's secret. Store it ONLY in Render environment vars.
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || "";

// Short-lived, single-audience Meta review demonstration guard.
// The countdown starts when the Render process boots; a test cannot go live
// without an exact phrase, profile, post, explicit replay flag, and TTL.
const META_REVIEW_BOOT_AT_MS = Date.now();
const META_REVIEW_ATTEMPTED_COMMENT_IDS = new Set();

function isApprovedReviewComment({ postId, username, comment }) {
  const ttlMinutes = Number(process.env.META_TEST_TTL_MINUTES || "0");
  const expectedPhrase = normalizeText(process.env.META_TEST_COMMENT_TEXT || "");
  const expectedUser = normalizeText(process.env.META_TEST_USERNAME || "").replace(/^@/, "");
  const expectedMediaId = String(process.env.META_TEST_MEDIA_ID || "").trim();
  return String(process.env.META_LIVE_AUDIENCE || "").trim().toLowerCase() === "test"
    && process.env.META_TEST_ALLOW_ONE_REPLAY === "true"
    && Number.isFinite(ttlMinutes) && ttlMinutes > 0 && ttlMinutes <= 30
    && Date.now() < META_REVIEW_BOOT_AT_MS + ttlMinutes * 60000
    && Boolean(expectedPhrase) && Boolean(expectedUser) && Boolean(expectedMediaId)
    && normalizeText(username).replace(/^@/, "") === expectedUser
    && String(postId) === expectedMediaId
    && normalizeText(comment) === expectedPhrase;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Log only non-sensitive network error codes. Never log URLs, keys or request headers.
async function diagnosedSupabaseFetch(input, init) {
  try {
    return await fetch(input, init);
  } catch (error) {
    const cause = error?.cause;
    const nestedErrors = Array.isArray(cause?.errors) ? cause.errors : [];
    const codes = [...new Set([cause?.code, ...nestedErrors.map((item) => item?.code)].filter(Boolean))];
    console.error("Supabase network diagnostic:", JSON.stringify({
      errorType: error?.name || "Error",
      causeType: cause?.name || null,
      networkCodes: codes.slice(0, 4),
      syscall: cause?.syscall || null
    }));
    throw error;
  }
}
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { global: { fetch: diagnosedSupabaseFetch } })
  : null;

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

app.use(express.json({
  limit: "3mb",
  verify(req, res, buffer) {
    req.rawBody = Buffer.from(buffer);
  }
}));
app.use(express.urlencoded({ extended: true, limit: "3mb" }));

// All private dashboard API endpoints require the owner's secret token.
// Fail closed if the token was not configured in the hosting environment.
function constantTimeMatches(value, expected) {
  const a = Buffer.from(String(value || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.use("/api", (req, res, next) => {
  if (req.path === "/status" && req.method === "GET") return next();
  if (!ADMIN_API_TOKEN) {
    return res.status(503).json({ ok: false, message: "Acesso administrativo ainda não configurado." });
  }
  if (!constantTimeMatches(req.get("X-InstaBot-Admin"), ADMIN_API_TOKEN)) {
    return res.status(401).json({ ok: false, message: "Autenticação administrativa necessária." });
  }
  next();
});

app.get("/", (req, res) => res.redirect(302, "/revisao-meta.html"));
app.use("/review", createReviewRouter({ supabase, mediaId: process.env.META_TEST_MEDIA_ID, mode: BOT_MODE, directEnabled: DIRECT_ENABLED }));
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

function fromDbWebhookEvent(row = {}, productMap = {}) {
  const productNameFromPayload = row.payload?.produto_nome || row.payload?.product?.name || row.payload?.produto?.nome || null;

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
    productName: productMap[row.instagram_media_id] || productNameFromPayload || null,
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

function isConnectedMode(config = {}) {
  const modes = ["connected", "conectado", "real", "producao", "production", "ativo"];
  // A persisted DB setting can never override the server's simulation kill switch.
  const serverAllowsLive = modes.includes(normalizeText(BOT_MODE));
  const accountAllowsLive = modes.includes(normalizeText(config.botMode || config.modo_bot));
  return serverAllowsLive && accountAllowsLive;
}

function getMetaAccessToken(config = {}) {
  return (
    process.env.META_ACCESS_TOKEN ||
    process.env.INSTAGRAM_ACCESS_TOKEN ||
    process.env.ACCESS_TOKEN ||
    config.accessToken ||
    config.access_token ||
    ""
  ).trim();
}

// Instagram Login uses the graph.instagram.com host and Bearer authorization.
async function instagramPost(edge, payload, accessToken) {
  if (!accessToken) throw new Error("Instagram access token is not configured");
  const response = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/${edge}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    throw new Error(`Instagram API HTTP ${response.status} (code ${result.error?.code ?? "unknown"}; subcode ${result.error?.error_subcode ?? "none"})`);
  }
  return result;
}

// Resolve the account from the *same token* instead of a potentially stale ID.
async function authenticatedInstagramAccount(accessToken) {
  const response = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me?fields=id,username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(12000)
  });
  const profile = await response.json().catch(() => ({}));
  const expectedUsername = normalizeText(process.env.META_ACCOUNT_USERNAME_EXPECTED || "minadeofertas_ofc");
  if (!response.ok || !profile.id || normalizeText(profile.username) !== expectedUsername) {
    throw new Error(`Instagram account validation failed (HTTP ${response.status}; code ${profile.error?.code ?? "unknown"})`);
  }
  return String(profile.id);
}

async function sendInstagramPrivateReply({ commentId, message, accessToken }) {
  if (!commentId) throw new Error("Instagram comment ID is missing");
  const accountId = await authenticatedInstagramAccount(accessToken);
  const result = await instagramPost(`${encodeURIComponent(accountId)}/messages`, {
    recipient: { comment_id: String(commentId) },
    message: { text: String(message) }
  }, accessToken);
  if (!result.message_id) throw new Error("Instagram accepted the request but returned no message ID");
  return { recipient_id: result.recipient_id, message_id: result.message_id };
}

async function sendInstagramPublicReply({ commentId, message, accessToken }) {
  if (!commentId) throw new Error("Instagram comment ID is missing");
  return instagramPost(`${encodeURIComponent(String(commentId))}/replies`, { message: String(message) }, accessToken);
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
    payload: {
      ...(event.payload || {}),
      produto_nome: event.productName || event.payload?.produto_nome || null,
      direct_status: event.directStatus || null,
      public_reply_status: event.publicReplyStatus || null,
      erro_meta: event.metaError || null
    }
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

async function runCommentEngine({ postId, username, comment, commentId = null, userId = null, source = "simulation", rawPayload = {} }) {
  const config = await getBotConfig();
  const accessToken = getMetaAccessToken(config);
  const connectedMode = isConnectedMode(config);
  // Fail closed in test mode. Only the authorized account and the exact
  // Instagram media ID may receive a real reply. Leave all traffic disabled
  // unless the server operator explicitly selects a live audience.
  const liveAudience = String(process.env.META_LIVE_AUDIENCE || "none").trim().toLowerCase();
  const testUsername = normalizeText(process.env.META_TEST_USERNAME || "").replace(/^@/, "");
  const testMediaId = String(process.env.META_TEST_MEDIA_ID || "").trim();
  const commenter = normalizeText(username).replace(/^@/, "");
  const approvedTest = isApprovedReviewComment({ postId, username, comment });
  const approvedProduction = liveAudience === "all";
  const canSendRealDirect = source === "webhook" && connectedMode && DIRECT_ENABLED
    && Boolean(accessToken) && Boolean(commentId) && (approvedTest || approvedProduction);
  const safeMode = !canSendRealDirect;

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
    let duplicateQuery = supabase
      .from("interacoes")
      .select("id")
      .eq("produto_id", product.id)
      .eq("instagram_username", username)
      .eq("direct_enviado", true);

    // Permit exactly one new review-phrase send without deleting the previous
    // successful Direct record. Production duplicate handling stays unchanged.
    if (approvedTest) duplicateQuery = duplicateQuery.eq("comentario_texto", comment);

    const { data: duplicateRows, error: duplicateError } = await duplicateQuery.limit(1);

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
        productName: product.name,
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
  let directSent = false;
  let publicReplySent = false;
  let directResult = null;
  let publicReplyResult = null;
  let metaError = null;
  let reason = "Webhook processado em modo seguro, sem envio real.";
  let eventType = "comment_safe_mode";

  if (canSendRealDirect && approvedTest && META_REVIEW_ATTEMPTED_COMMENT_IDS.size > 0) {
    reason = "Janela de revisão já utilizou sua única tentativa de envio";
    eventType = "comment_review_repeat_blocked";
  } else if (canSendRealDirect) {
    // In-memory guard stops concurrent retries on the same comment while the
    // database records the send; the persisted duplicate query blocks later ones.
    if (approvedTest) META_REVIEW_ATTEMPTED_COMMENT_IDS.add(String(commentId));
    try {
      directResult = await sendInstagramPrivateReply({ commentId, message, accessToken });
      directSent = true;
      reason = "Direct enviado pela API da Meta";
      eventType = "comment_direct_sent";

      if (config.publicReply) {
        try {
          publicReplyResult = await sendInstagramPublicReply({
            commentId,
            message: `${username}, te mandei o link no Direct 🛒`,
            accessToken
          });
          publicReplySent = true;
        } catch (publicError) {
          publicReplyResult = { ok: false, error: publicError.message };
        }
      }
    } catch (error) {
      metaError = error.message;
      reason = `Erro ao enviar Direct pela Meta: ${error.message}`;
      eventType = "comment_direct_error";
    }
  } else if (source === "webhook" && connectedMode && !accessToken) {
    reason = "Modo conectado, mas META_ACCESS_TOKEN está ausente no Render.";
    eventType = "comment_token_missing";
  } else if (source === "webhook" && connectedMode && !commentId) {
    reason = "Modo conectado, mas o webhook não trouxe ID do comentário.";
    eventType = "comment_missing_comment_id";
  }

  const interaction = await insertInteraction({
    productId: product.id,
    username,
    instagramUserId: userId,
    commentId,
    postId,
    comment,
    directSent,
    reason
  });

  let updatedProductRow = matchedRow;

  if (directSent) {
    const nextDirects = Number(product.directs || 0) + 1;
    const { data, error: updateError } = await supabase
      .from("produtos")
      .update({ directs_enviados: nextDirects, updated_at: new Date().toISOString() })
      .eq("id", product.id)
      .select("*")
      .single();

    if (updateError) throw updateError;
    updatedProductRow = data;
  }

  const event = await insertWebhookEvent({
    source,
    eventType,
    postId,
    commentId,
    username,
    comment,
    matched: true,
    productName: product.name,
    safeMode,
    directStatus: directSent ? "enviado" : "nao_enviado",
    publicReplyStatus: publicReplySent ? "enviado" : config.publicReply ? "nao_enviado" : "desativado",
    metaError,
    payload: {
      ...rawPayload,
      meta_private_reply: directResult,
      meta_public_reply: publicReplyResult,
      connectedMode,
      directEnabled: DIRECT_ENABLED,
      hasAccessToken: Boolean(accessToken),
      hasCommentId: Boolean(commentId)
    }
  });

  return {
    ok: !metaError,
    matched: true,
    duplicate: false,
    message,
    product: fromDbProduct(updatedProductRow),
    interaction,
    webhookEvent: event,
    publicReply: publicReplySent,
    safeMode,
    directSent,
    reason
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
      const commentId = value.comment_id || value.comment?.id || value.id || null;

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
    directEnabled: DIRECT_ENABLED,
    database: supabase ? "configured" : "missing",
    webhook: META_APP_SECRET || INSTAGRAM_APP_SECRET ? "signed" : "disabled",
    instagramWebhookSigningKeyPresent: Boolean(INSTAGRAM_APP_SECRET),
    adminApi: ADMIN_API_TOKEN ? "protected" : "disabled",
    graphVersion: GRAPH_VERSION,
    metaAccessTokenConfigured: Boolean(process.env.META_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN || process.env.ACCESS_TOKEN),
    instagramAccountIdConfigured: Boolean(process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_BUSINESS_ID || process.env.IG_USER_ID),
    liveAudience: String(process.env.META_LIVE_AUDIENCE || "none"),
    timestamp: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    app: "InstaBot Ofertas",
    mode: BOT_MODE,
    directEnabled: DIRECT_ENABLED,
    database: supabase ? "configured" : "missing",
    webhook: META_APP_SECRET || INSTAGRAM_APP_SECRET ? "signed" : "disabled",
    instagramWebhookSigningKeyPresent: Boolean(INSTAGRAM_APP_SECRET),
    adminApi: ADMIN_API_TOKEN ? "protected" : "disabled"
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

  const mediaIds = [...new Set((data || []).map((event) => event.instagram_media_id).filter(Boolean))];
  let productMap = {};

  if (mediaIds.length) {
    const { data: productRows } = await supabase
      .from("produtos")
      .select("instagram_media_id,nome")
      .in("instagram_media_id", mediaIds);

    productMap = (productRows || []).reduce((map, product) => {
      map[product.instagram_media_id] = product.nome;
      return map;
    }, {});
  }

  res.json(data.map((row) => fromDbWebhookEvent(row, productMap)));
});

app.delete("/api/webhook-eventos", ensureSupabase, async (req, res) => {
  const { error } = await supabase
    .from("webhook_eventos")
    .delete()
    .not("id", "is", null);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
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
        rawPayload: req.body
      });

      results.push(result);
    }

    return res.status(200).json({
      ok: true,
      received: true,
      comments: comments.length,
      results
    });
  } catch (error) {
    console.error("Erro no webhook:", error);
    return res.status(200).json({ ok: false, received: true, error: error.message });
  }
}

function verifyMetaSignature(req, res, next) {
  // Never reveal or log secrets, signatures, comment contents or account identity.
  // Both App Secrets may legitimately sign events depending on the product.
  const configuredSecrets = [
    { type: "instagram", value: INSTAGRAM_APP_SECRET },
    { type: "meta", value: META_APP_SECRET }
  ].filter((item) => Boolean(item.value));
  if (!configuredSecrets.length) {
    console.warn("Meta webhook rejected: signing secret is missing");
    return res.status(503).json({ ok: false, message: "Webhook temporariamente indisponível." });
  }
  const signature = req.get("X-Hub-Signature-256") || "";
  if (!/^sha256=[0-9a-f]{64}$/i.test(signature)) {
    console.warn("Meta webhook rejected: SHA-256 signature header missing or malformed");
    return res.sendStatus(403);
  }
  const matchedType = configuredSecrets.find(({ value }) => {
    const expected = "sha256=" + crypto.createHmac("sha256", value)
      .update(req.rawBody || Buffer.alloc(0))
      .digest("hex");
    return constantTimeMatches(signature.toLowerCase(), expected);
  })?.type;
  if (!matchedType) {
    console.warn("Meta webhook rejected: SHA-256 signature mismatch", JSON.stringify({
      instagramKeyConfigured: Boolean(INSTAGRAM_APP_SECRET),
      metaKeyConfigured: Boolean(META_APP_SECRET)
    }));
    return res.sendStatus(403);
  }
  console.info("Meta webhook signature verified", JSON.stringify({ signer: matchedType }));
  return next();
}

app.post("/webhook", verifyMetaSignature, (req, res) => processWebhookPayload(req, res, false));

function dataDeletionResponse(req) {
  const code = `delete-${Date.now()}`;
  const host = `${req.protocol}://${req.get("host")}`;
  return {
    url: `${host}/data-deletion-status?code=${encodeURIComponent(code)}`,
    confirmation_code: code
  };
}

app.post("/data-deletion", (req, res) => res.json(dataDeletionResponse(req)));
app.post("/data-deletion-callback", (req, res) => res.json(dataDeletionResponse(req)));
app.get("/data-deletion-status", (req, res) => {
  res.json({
    ok: true,
    status: "received",
    code: req.query.code || null,
    message: "Solicitação de exclusão de dados recebida. Os dados relacionados serão removidos conforme a política do app."
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function inspectMetaSubscriptions() {
  if (process.env.META_DIAG_ON_BOOT !== "true") return;
  const token = getMetaAccessToken();
  const accountId = (process.env.INSTAGRAM_ACCOUNT_ID || process.env.INSTAGRAM_BUSINESS_ID || process.env.IG_USER_ID || "").trim();
  if (!token) {
    console.info("Meta read-only diagnostic:", JSON.stringify({ stage: "token_missing" }));
    return;
  }
  const check = async (relativePath) => {
    try {
      const response = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/${relativePath}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12000)
      });
      const json = await response.json().catch(() => ({}));
      const rows = Array.isArray(json.data) ? json.data : [];
      const fields = [...new Set(rows.flatMap((item) => item.subscribed_fields || []))];
      return {
        httpStatus: response.status,
        graphErrorCode: Number(json.error?.code || 0) || null,
        subscriptionCount: rows.length,
        subscribedFields: fields.slice(0, 25),
        hasCommentsSubscription: fields.includes("comments"),
        accountMatchesConfigured: relativePath.startsWith("me?") && accountId && json.id
          ? String(json.id) === accountId : undefined
      };
    } catch (error) {
      return { stage: "request_failed", errorCode: error?.cause?.code || error?.name || "unknown" };
    }
  };
  const [account, meSubscriptions, idSubscriptions] = await Promise.all([
    check("me?fields=id"),
    check("me/subscribed_apps"),
    accountId ? check(`${encodeURIComponent(accountId)}/subscribed_apps`) : Promise.resolve({ stage: "account_id_missing" })
  ]);
  console.info("Meta read-only diagnostic:", JSON.stringify({
    account, meSubscriptions, idSubscriptions
  }));
}

async function requestMetaCommentSubscription() {
  if (process.env.META_SUBSCRIBE_COMMENTS_ON_BOOT !== "true") return;
  // Subscription changes are only permitted during a fully disabled send window.
  if (BOT_MODE !== "simulation" || DIRECT_ENABLED) {
    console.warn("Meta subscription: blocked because safe simulation mode is not enabled");
    return;
  }
  const token = getMetaAccessToken();
  const expectedUsername = normalizeText(process.env.META_ACCOUNT_USERNAME_EXPECTED || "");
  if (!token || expectedUsername !== "minadeofertas_ofc") {
    console.warn("Meta subscription: missing token or expected account confirmation");
    return;
  }
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const profileResponse = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me?fields=id,username`, {
      headers, signal: AbortSignal.timeout(12000)
    });
    const profile = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || normalizeText(profile.username) !== expectedUsername) {
      console.warn("Meta subscription: account identity check failed", JSON.stringify({
        profileHttp: profileResponse.status, graphErrorCode: profile.error?.code || null,
        accountUsernameMatched: normalizeText(profile.username) === expectedUsername
      }));
      return;
    }
    console.info("Meta subscription: target account confirmed", JSON.stringify({
      username: profile.username, igAccountId: profile.id
    }));
    const changeResponse = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me/subscribed_apps`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: "comments,messages" }),
      signal: AbortSignal.timeout(12000)
    });
    const changed = await changeResponse.json().catch(() => ({}));
    console.info("Meta subscription: update result", JSON.stringify({
      httpStatus: changeResponse.status,
      success: changed.success === true,
      graphErrorCode: changed.error?.code || null,
      graphErrorSubcode: changed.error?.error_subcode || null
    }));
    const checkResponse = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me/subscribed_apps`, {
      headers, signal: AbortSignal.timeout(12000)
    });
    const check = await checkResponse.json().catch(() => ({}));
    const rows = Array.isArray(check.data) ? check.data : [];
    const fields = [...new Set(rows.flatMap((row) => row.subscribed_fields || []))];
    console.info("Meta subscription: verified fields", JSON.stringify({
      httpStatus: checkResponse.status, fields,
      commentsSubscribed: fields.includes("comments"),
      messagesSubscribed: fields.includes("messages")
    }));
  } catch (error) {
    console.warn("Meta subscription: request error", JSON.stringify({
      errorCode: error?.cause?.code || error?.name || "unknown"
    }));
  }
}

app.listen(PORT, () => {
  console.log(`InstaBot Ofertas rodando na porta ${PORT}`);
  console.log(`Modo inicial: ${BOT_MODE} | Direct enabled: ${DIRECT_ENABLED} | Graph: ${GRAPH_VERSION}`);
  void inspectMetaSubscriptions();
  void requestMetaCommentSubscription();
});
