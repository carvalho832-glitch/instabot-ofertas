// Explicit, one-off authorization check for one previously verified Instagram comment.
// Neither the webhook nor the dashboard can activate this function.
// All normal automation remains in simulation mode during this diagnostic.
const normalized = value => String(value || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export async function runApprovedFollowerOneShot({ supabase, getAccessToken, sendPrivateReply }) {
  if (process.env.META_ONE_OFF_REPLY_ARMED !== "true") return;
  const commentId = String(process.env.META_ONE_OFF_REPLY_COMMENT_ID || "").trim();
  const mediaId = String(process.env.META_ONE_OFF_REPLY_MEDIA_ID || "").trim();
  const username = String(process.env.META_ONE_OFF_REPLY_USERNAME || "").trim();
  const phrase = String(process.env.META_ONE_OFF_REPLY_PHRASE || "").trim();
  const expectedMedia = String(process.env.META_TEST_MEDIA_ID || "").trim();
  if (!supabase || !/^\d{10,25}$/.test(commentId) ||
      !/^\d{10,25}$/.test(mediaId) || mediaId !== expectedMedia ||
      !/^@[a-z0-9_.]{3,30}$/i.test(username) ||
      normalized(phrase) !== "eu quero teste seguidor" ||
      normalized(process.env.META_ACCOUNT_USERNAME_EXPECTED) !== "minadeofertas_ofc") {
    console.warn("Authorized one-shot check: aborted, invalid allowlist or missing database");
    return;
  }
  // Check the real, signed-webhook-derived record. Refuse stale/unmatched comments.
  const { data: eventRows, error: eventErr } = await supabase.from("webhook_eventos")
    .select("id,created_at,comentario_texto,produto_encontrado,modo_seguro")
    .eq("origem", "webhook").eq("tipo_evento", "comment_safe_mode")
    .eq("instagram_comment_id", commentId).eq("instagram_media_id", mediaId)
    .eq("instagram_username", username).limit(1);
  if (eventErr || eventRows?.length !== 1 || !eventRows[0].produto_encontrado ||
      !eventRows[0].modo_seguro || normalized(eventRows[0].comentario_texto) !== normalized(phrase) ||
      Date.now() - Date.parse(eventRows[0].created_at) > 120 * 60 * 1000 ||
      Date.now() < Date.parse(eventRows[0].created_at)) {
    console.warn("Authorized one-shot check: no recent verified matching comment");
    return;
  }
  // Immutable-attempt ledger: a redeploy must not repeat an already attempted Direct.
  const { data: previous, error: previousErr } = await supabase.from("webhook_eventos")
    .select("id").eq("instagram_comment_id", commentId)
    .in("tipo_evento", ["follower_one_shot_attempt", "comment_direct_sent"]).limit(1);
  const { data: interactions, error: interactionsErr } = await supabase.from("interacoes")
    .select("id,direct_enviado").eq("instagram_comment_id", commentId)
    .eq("instagram_media_id", mediaId).eq("instagram_username", username)
    .order("created_at", { ascending: false }).limit(5);
  if (previousErr || interactionsErr || previous?.length ||
      !interactions?.some(x => x.direct_enviado === false) ||
      interactions.some(x => x.direct_enviado === true)) {
    console.warn("Authorized one-shot check: already attempted, sent, or no matching interaction");
    return;
  }
  const { data: products, error: prodErr } = await supabase.from("produtos")
    .select("id,nome,link_afiliado,directs_enviados,ativo")
    .eq("instagram_media_id", mediaId).eq("ativo", true).limit(1);
  const p = products?.[0];
  if (prodErr || !p || !/^https:\/\/s\.shopee\.com\.br\//i.test(p.link_afiliado || "")) {
    console.warn("Authorized one-shot check: missing or invalid affiliate product");
    return;
  }
  const accessToken = getAccessToken();
  if (!accessToken) {
    console.warn("Authorized one-shot check: Instagram token unavailable");
    return;
  }
  // Log intent BEFORE contacting Meta. This permanently prevents automatic retries
  // even if an API timeout leaves actual delivery uncertain.
  const { error: claimErr } = await supabase.from("webhook_eventos").insert({
    origem: "one_shot_owner_authorized",
    tipo_evento: "follower_one_shot_attempt",
    instagram_media_id: mediaId,
    instagram_comment_id: commentId,
    instagram_username: username,
    comentario_texto: phrase,
    produto_encontrado: true,
    modo_seguro: true,
    payload: { test: "single_comment_private_reply", created_by: "explicit_owner_approval" }
  });
  if (claimErr) {
    console.warn("Authorized one-shot check: failed to persist attempt marker");
    return;
  }
  // Clear disclosure and clear distinction between displayed item and affiliate listing.
  const message = [
    "Oi! 😊 Recebemos seu comentário de teste na Mina de Ofertas.",
    "Aqui está o link do cabide organizador (modelo semelhante ao mostrado na publicação):",
    p.link_afiliado,
    "🔎 Confira o modelo e o preço na Shopee antes de comprar.",
    "Link de afiliado (#publi). Teste autorizado do InstaBot."
  ].join("\n\n");
  let result = null, failure = null;
  try {
    result = await sendPrivateReply({ commentId, message, accessToken });
  } catch (error) {
    failure = String(error?.message || "unknown").slice(0,180);
  }
  if (result?.message_id) {
    const target = interactions.find(x => x.direct_enviado === false);
    const { error: updateErr } = await supabase.from("interacoes")
      .update({ direct_enviado: true, motivo: "Direct único de seguidor autorizado enviado pela API da Meta" })
      .eq("id", target.id).eq("direct_enviado", false);
    if (updateErr) console.warn("Authorized one-shot check: interaction update error");
    const { error: countErr } = await supabase.from("produtos")
      .update({ directs_enviados: Number(p.directs_enviados || 0) + 1 })
      .eq("id", p.id);
    if (countErr) console.warn("Authorized one-shot check: count update error");
  }
  const { error: logErr } = await supabase.from("webhook_eventos").insert({
    origem: "one_shot_owner_authorized",
    tipo_evento: result?.message_id ? "comment_direct_sent" : "comment_direct_error",
    instagram_media_id: mediaId,
    instagram_comment_id: commentId,
    instagram_username: username,
    comentario_texto: phrase,
    produto_encontrado: true,
    modo_seguro: !result?.message_id,
    payload: {
      direct_status: result?.message_id ? "enviado" : "nao_enviado",
      meta_message_id: result?.message_id || null,
      error: failure
    }
  });
  if (logErr) console.warn("Authorized one-shot check: result log error");
  console.info("Authorized follower one-shot result", JSON.stringify({
    success: Boolean(result?.message_id),
    metaError: failure,
    persisted: !logErr
  }));
}
