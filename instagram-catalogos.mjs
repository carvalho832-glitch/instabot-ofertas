import express from "express";
import crypto from "node:crypto";

// Catalogos persistidos no Supabase Storage (privado).
// A Meta recebe apenas uma URL assinada de curta duracao para buscar o PDF.
const BUCKET = "instabot-catalogos";
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const KEYWORDS_MAX = 65;
export const DEFAULT_TEXT = [
  "🌙 Olá! Seu catálogo de perfumes árabes chegou! 💛",
  "",
  "📄 Abra o PDF enviado e toque nos perfumes para conferir os anúncios no Mercado Livre.",
  "",
  "💰 Preços e disponibilidade podem mudar.",
  "📦 A venda e a entrega são responsabilidade do vendedor e/ou Mercado Livre, conforme o anúncio.",
  "🛍️ A Mina de Ofertas divulga links de afiliado e pode receber comissão.",
  "",
  "Boas compras! ✨"
].join("\n");

export function normalizeCatalogKeyword(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().trim().replace(/\s+/g, " ");
}

export function validPdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 1024 &&
    buffer.length <= MAX_PDF_BYTES &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-" &&
    buffer.subarray(-1024).toString("latin1").includes("%%EOF");
}

export function extractCatalogIncoming(payload = {}) {
  if (payload.object !== "instagram" || !Array.isArray(payload.entry)) return [];
  const found = [];
  for (const entry of payload.entry) {
    for (const event of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const msg = event.message || {};
      const senderId = String(event.sender?.id || "");
      const recipientId = String(event.recipient?.id || "");
      const mid = String(msg.mid || "");
      const text = String(msg.text || "");
      const sentAt = Number(event.timestamp);
      if (msg.is_echo || msg.is_deleted || msg.is_unsent || !text || !mid ||
          mid.length > 255 || !/^\d{10,25}$/.test(senderId) ||
          !/^\d{10,25}$/.test(recipientId) || !Number.isFinite(sentAt)) continue;
      const storyId = String(msg.reply_to?.story?.id || "");
      found.push({mid, senderId, recipientId, text: text.slice(0, 180),
        storyId: /^\d{10,25}$/.test(storyId) ? storyId : "", sentAt});
    }
  }
  return found;
}

export function eligibleCatalogInbound(item, now = Date.now()) {
  if (!item || !item.mid || !item.senderId || !item.recipientId) return false;
  const age = now - Number(item.sentAt);
  return Number.isFinite(age) && age >= -5 * 60 * 1000 && age < 24 * 60 * 60 * 1000;
}

function safeCatalog(item) {
  return {id: item.id, name: item.name, keyword: item.keyword,
    active: item.active === true, storyId: item.storyId || "",
    postId: item.postId || "", size: item.size || 0, createdAt: item.createdAt};
}

function normalizeMediaId(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (!/^\d{10,25}$/.test(value)) throw new Error("ID do Story/Reel inválido.");
  return value;
}

function validKeyword(input) {
  const word = normalizeCatalogKeyword(input);
  if (word.length < 5 || word.length > KEYWORDS_MAX || !/^EU QUERO [A-Z0-9 ]+$/.test(word))
    throw new Error("Use uma palavra-chave como EU QUERO CATÁLOGO.");
  return word;
}

function storageError(e) {
  return new Error("Falha ao acessar o armazenamento dos catálogos: " + String(e?.statusCode || e?.status || e?.code || "indisponível"));
}

export function createInstagramCatalogs({
  supabase, getLiveContext, sendPdf, sendText, sendCommentReply,
  logger = console
} = {}) {
  const router = express.Router();
  const store = () => supabase?.storage?.from(BUCKET);
  const isNotFound = error => ["404", "NoSuchBucket", "not_found"].includes(String(error?.statusCode || error?.status || error?.code));

  async function ensureBucket() {
    if (!supabase?.storage) throw new Error("Supabase não configurado.");
    const {data, error} = await supabase.storage.getBucket(BUCKET);
    if (data && !error) return;
    if (error && !isNotFound(error)) throw storageError(error);
    const created = await supabase.storage.createBucket(BUCKET, {
      public: false, allowedMimeTypes: ["application/pdf", "application/json"],
      fileSizeLimit: MAX_PDF_BYTES
    });
    if (created.error && !["409", "BucketAlreadyExists", "Duplicate"].includes(String(created.error.statusCode || created.error.code)))
      throw storageError(created.error);
  }

  async function readCatalog(id) {
    const {data, error} = await store().download("config/" + id + ".json");
    if (error) {
      if (isNotFound(error)) return null;
      throw storageError(error);
    }
    try {
      const obj = JSON.parse(await data.text());
      return obj && obj.id === id && obj.pdfPath === "pdf/" + id + ".pdf" ? obj : null;
    } catch { return null; }
  }

  async function listCatalogs() {
    if (!supabase) throw new Error("Supabase não configurado.");
    const {data, error} = await store().list("config", {limit: 100, offset: 0});
    if (error) {
      if (isNotFound(error)) return [];
      throw storageError(error);
    }
    const rows = [];
    for (const file of data || []) {
      if (!/^[-a-f0-9]{36}\.json$/.test(String(file.name))) continue;
      const cat = await readCatalog(file.name.slice(0, -5));
      if (cat) rows.push(cat);
    }
    rows.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return rows;
  }

  async function saveMetadata(cat, update = false) {
    const contents = Buffer.from(JSON.stringify(cat), "utf8");
    const object = "config/" + cat.id + ".json";
    const options = {contentType: "application/json", cacheControl: "0"};
    const result = update
      ? await store().update(object, contents, options)
      : await store().upload(object, contents, {...options, upsert: false});
    if (result.error) throw storageError(result.error);
  }

  router.get("/", async (_req, res) => {
    try {
      const cats = await listCatalogs();
      const live = await getLiveContext({checkIdentity:false}).catch(() => null);
      res.set("Cache-Control", "no-store");
      return res.json({ok: true, liveReady: Boolean(live),
        catalogs: cats.map(safeCatalog), maxPdfBytes: MAX_PDF_BYTES});
    } catch (error) {
      logger.warn?.("[INSTABOT CATALOGOS] Leitura indisponivel:", error.name);
      return res.status(503).json({ok:false,message:error.message});
    }
  });

  router.post("/upload", express.raw({type:"application/pdf",limit:"25mb"}), async (req, res) => {
    const body = req.body;
    if (!validPdf(body)) return res.status(400).json({ok:false,message:"Selecione um PDF válido com até 25 MB."});
    const name = String(req.query.name || "").trim();
    let keyword, storyId, postId;
    try {
      if (name.length < 5 || name.length > 100) throw new Error("Nome precisa ter entre 5 e 100 caracteres.");
      keyword = validKeyword(req.query.keyword);
      storyId = normalizeMediaId(req.query.storyId);
      postId = normalizeMediaId(req.query.postId);
    } catch(e) { return res.status(400).json({ok:false,message:e.message}); }
    try {
      await ensureBucket();
      const existing = await listCatalogs();
      if (existing.some(x => x.keyword === keyword))
        return res.status(409).json({ok:false,message:"Essa palavra-chave já pertence a outro catálogo."});
      if (existing.length >= 50)
        return res.status(409).json({ok:false,message:"Limite de 50 catálogos atingido."});
      const id = crypto.randomUUID();
      const pdfPath = "pdf/" + id + ".pdf";
      const {error} = await store().upload(pdfPath, body,
        {contentType:"application/pdf",cacheControl:"3600",upsert:false});
      if (error) throw storageError(error);
      const cat = {id,name,keyword,storyId,postId,active:false,pdfPath,
        size:body.length,createdAt:new Date().toISOString()};
      try { await saveMetadata(cat); }
      catch(e) { await store().remove([pdfPath]).catch(()=>{}); throw e; }
      return res.status(201).json({ok:true,catalog:safeCatalog(cat)});
    } catch (error) {
      logger.warn?.("[INSTABOT CATALOGOS] Falha no upload:",error.name);
      return res.status(503).json({ok:false,message:error.message});
    }
  });

  router.patch("/:id", express.json({limit:"20kb"}), async (req, res) => {
    const id = String(req.params.id || "");
    if (!/^[a-f0-9-]{36}$/.test(id))
      return res.status(400).json({ok:false,message:"ID de catálogo inválido."});
    try {
      const cat = await readCatalog(id);
      if (!cat) return res.status(404).json({ok:false,message:"Catálogo não encontrado."});
      if (typeof req.body?.active !== "boolean")
        return res.status(400).json({ok:false,message:"Informe active true ou false."});
      cat.active = req.body.active;
      await saveMetadata(cat, true);
      return res.json({ok:true,catalog:safeCatalog(cat)});
    } catch(error) { return res.status(503).json({ok:false,message:error.message}); }
  });

  async function claim(kind, sourceId, catalogId) {
    const digest = crypto.createHash("sha256").update(kind + ":" + sourceId).digest("hex");
    const path = "dispatch/" + digest + ".json";
    const body = Buffer.from(JSON.stringify({catalogId, status:"sending",
      createdAt:new Date().toISOString()}));
    const {error} = await store().upload(path, body,
      {contentType:"application/json",cacheControl:"0",upsert:false});
    if (error) {
      if (["409","Duplicate","ResourceAlreadyExists"].includes(String(error.statusCode || error.code)))
        return null;
      throw storageError(error);
    }
    return path;
  }
  async function record(path, catalogId, status, messageId = "") {
    const payload = Buffer.from(JSON.stringify({catalogId,status,
      messageId:String(messageId).slice(0,255),updatedAt:new Date().toISOString()}));
    const {error} = await store().update(path,payload,{contentType:"application/json",cacheControl:"0"});
    if(error) logger.warn?.("[INSTABOT CATALOGOS] Historico pendente:",String(error.code || "storage"));
  }

  async function handleIncoming(item) {
    if (!eligibleCatalogInbound(item)) return {matched:false,status:"expired_or_invalid"};
    const cats = await listCatalogs();
    const cat = cats.find(x => x.active === true && x.keyword === normalizeCatalogKeyword(item.text) &&
      (!x.storyId || !item.storyId || x.storyId === item.storyId));
    if (!cat) return {matched:false,status:"no_keyword"};
    const context = await getLiveContext({checkIdentity:true});
    if (!context) return {matched:true,status:"live_disabled"};
    // Inbound signed webhook uses professional user_id, while the Graph
    // /messages endpoint uses app-scoped /me.id.
    if (String(context.ownerRecipientId ?? context.ownerId) !== item.recipientId)
      return {matched:true,status:"wrong_account"};
    const claimPath = await claim("dm",item.mid,cat.id);
    if (!claimPath) return {matched:true,status:"duplicate"};
    try {
      const {data,error} = await store().createSignedUrl(cat.pdfPath,600);
      if (error || !data?.signedUrl) throw storageError(error);
      const sent = await sendPdf({recipientId:item.senderId,accountId:context.ownerId,
        accessToken:context.accessToken,url:data.signedUrl});
      if (!sent?.message_id) throw new Error("meta_file_not_confirmed");
      await record(claimPath,cat.id,"pdf_sent",sent.message_id);
      try {
        await sendText({recipientId:item.senderId,message:DEFAULT_TEXT,accessToken:context.accessToken});
        await record(claimPath,cat.id,"sent",sent.message_id);
        return {matched:true,status:"sent"};
      } catch(e) {
        logger.warn?.("[INSTABOT CATALOGOS] PDF entregue; mensagem complementar falhou:",e.name);
        await record(claimPath,cat.id,"pdf_sent_text_needs_review",sent.message_id);
        return {matched:true,status:"pdf_sent_text_needs_review"};
      }
    } catch(e) {
      logger.warn?.("[INSTABOT CATALOGOS] Envio PDF requer revisao:",e.name);
      await record(claimPath,cat.id,"needs_review");
      return {matched:true,status:"needs_review"};
    }
  }

  async function handleComment(item) {
    const keyword = normalizeCatalogKeyword(item.comment);
    const cats = await listCatalogs();
    const cat = cats.find(x => x.active && x.keyword === keyword &&
      (!x.postId || x.postId === String(item.postId)));
    if (!cat) return {matched:false,status:"no_keyword"};
    const context = await getLiveContext({checkIdentity:true});
    if (!context) return {matched:true,status:"live_disabled"};
    if (!/^\d{10,25}$/.test(String(item.commentId || "")))
      return {matched:true,status:"invalid_comment"};
    const path = await claim("comment",item.commentId,cat.id);
    if (!path) return {matched:true,status:"duplicate"};
    try {
      const reply = await sendCommentReply({commentId:item.commentId,
        message:"🌙 Oi! Seu catálogo da Mina de Ofertas está pronto. 💛 Responda aqui no Direct: " +
          cat.keyword + " para receber o PDF.",accessToken:context.accessToken});
      await record(path,cat.id,"private_invitation_sent",reply?.message_id);
      return {matched:true,status:"private_invitation_sent"};
    } catch(e) {
      await record(path,cat.id,"needs_review");
      logger.warn?.("[INSTABOT CATALOGOS] Resposta privada ao comentario requer revisao:",e.name);
      return {matched:true,status:"needs_review"};
    }
  }

  return {router,handleIncoming,handleComment,listCatalogs};
}
