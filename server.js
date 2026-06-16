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

app.use(cors());
app.use(express.json({ limit: "2mb" }));
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

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    name: "instabot-ofertas",
    mode: BOT_MODE,
    database: supabase ? "configured" : "missing",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    app: "InstaBot Ofertas",
    mode: BOT_MODE,
    database: supabase ? "configured" : "missing"
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

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  console.log("Evento recebido:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`InstaBot Ofertas rodando na porta ${PORT}`);
});
