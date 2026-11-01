// Authorized, one-time private reply to a real, signed Instagram comment.
// The test is opt-in only and leaves normal Direct automation disabled.
const TARGET_MEDIA = "18196390819392242";
const TARGET_USER = "@jc_carvalho87";
const TARGET_AFFILIATE = "https://s.shopee.com.br/4qGrw2yzZJ";

export async function runOralGosOneShot({ supabase, getAccessToken, sendPrivateReply }) {
  if (process.env.ORALGOS_ONE_SHOT_ARMED !== "true") return;
  if (!supabase || process.env.DIRECT_ENABLED === "true" ||
      String(process.env.META_LIVE_AUDIENCE || "").toLowerCase() !== "none" ||
      String(process.env.META_ACCOUNT_USERNAME_EXPECTED || "").toLowerCase() !== "minadeofertas_ofc") {
    console.warn("OralGos one-shot: denied by fail-closed configuration");
    return;
  }

  // The original user-requested test comment was delivered through Meta's
  // cryptographically signed webhook. Do not synthesize a comment or ID.
  const { data: events, error: eventsError } = await supabase.from("webhook_eventos")
    .select("created_at,instagram_comment_id,comentario_texto,produto_encontrado,modo_seguro")
    .eq("origem", "webhook").eq("tipo_evento", "comment_safe_mode")
    .eq("instagram_media_id", TARGET_MEDIA)
    .eq("instagram_username", TARGET_USER)
    .order("created_at", { ascending: false }).limit(10);
  if (eventsError) { console.warn("OralGos one-shot: signed-comment lookup failed"); return; }

  const matches = (events || []).filter(event =>
    /^\d{10,25}$/.test(String(event.instagram_comment_id || "")) &&
    String(event.comentario_texto || "").trim().toLocaleLowerCase("pt-BR") === "eu quero" &&
    event.produto_encontrado === true && event.modo_seguro === true &&
    Date.now() - Date.parse(event.created_at) >= 0 &&
    Date.now() - Date.parse(event.created_at) <= 24 * 60 * 60 * 1000
  );
  if (matches.length !== 1) {
    console.warn("OralGos one-shot: expected exactly one recent verified comment");
    return;
  }
  const commentId = String(matches[0].instagram_comment_id);

  const [previous, interactions, products] = await Promise.all([
    supabase.from("webhook_eventos").select("id").eq("instagram_comment_id", commentId)
      .in("tipo_evento", [
        "oralgos_one_shot_attempt", "comment_direct_sent", "comment_direct_error",
        "owner_live_reply_attempt", "follower_one_shot_attempt"
      ]).limit(1),
    supabase.from("interacoes").select("id,direct_enviado")
      .eq("instagram_comment_id", commentId)
      .eq("instagram_media_id", TARGET_MEDIA)
      .eq("instagram_username", TARGET_USER)
      .order("created_at", { ascending: false }).limit(5),
    supabase.from("produtos").select("id,nome,link_afiliado,directs_enviados,ativo")
      .eq("instagram_media_id", TARGET_MEDIA).eq("ativo", true).limit(2)
  ]);
  if (previous.error || interactions.error || products.error ||
      previous.data?.length ||
      !interactions.data?.some(row => row.direct_enviado === false) ||
      interactions.data.some(row => row.direct_enviado === true) ||
      products.data?.length !== 1 ||
      products.data[0].link_afiliado !== TARGET_AFFILIATE) {
    console.warn("OralGos one-shot: duplicate, missing interaction or product mismatch");
    return;
  }
  const token = getAccessToken();
  if (!token) { console.warn("OralGos one-shot: Instagram token not configured"); return; }

  // Persist an immutable send-attempt marker BEFORE the API call.
  // On ambiguous network failure it must not retry on redeploy.
  const marker = {
    origem: "owner_authorized_test",
    tipo_evento: "oralgos_one_shot_attempt",
    instagram_media_id: TARGET_MEDIA,
    instagram_comment_id: commentId,
    instagram_username: TARGET_USER,
    comentario_texto: "EU QUERO",
    produto_encontrado: true,
    modo_seguro: true,
    payload: { purpose: "one_person_reply_test", product: "OralGos" }
  };
  const { error: markerError } = await supabase.from("webhook_eventos").insert(marker);
  if (markerError) {
    console.warn("OralGos one-shot: could not persist attempt marker");
    return;
  }

  const text = [
    "Oi! 💜 Recebemos seu comentário EU QUERO no Reel do Kit OralGos com 3 frascos.",
    "Confira os detalhes e o preço atualizado na Shopee:",
    TARGET_AFFILIATE,
    "Link de afiliado. Preço e disponibilidade podem mudar.",
    "Esta mensagem é um teste autorizado do Instabot Mina de Ofertas."
  ].join("\n\n");

  let sent = null;
  let errorCode = null;
  try {
    sent = await sendPrivateReply({ commentId, message: text, accessToken: token });
  } catch (error) {
    const safeMessage = String(error?.message || "");
    errorCode = safeMessage.match(/HTTP \d{3} \(code \d+; subcode [^)]*\)/)?.[0] || error?.name || "unknown";
  }

  const success = Boolean(sent?.message_id);
  if (success) {
    const pending = interactions.data.find(row => row.direct_enviado === false);
    await supabase.from("interacoes")
      .update({ direct_enviado: true, motivo: "Resposta privada de teste autorizada" })
      .eq("id", pending.id).eq("direct_enviado", false);
    await supabase.from("produtos")
      .update({ directs_enviados: Number(products.data[0].directs_enviados || 0) + 1 })
      .eq("id", products.data[0].id);
  }

  const { error: resultError } = await supabase.from("webhook_eventos").insert({
    ...marker,
    tipo_evento: success ? "comment_direct_sent" : "comment_direct_error",
    modo_seguro: !success,
    payload: {
      purpose: "one_person_reply_test", status: success ? "accepted" : "failed",
      meta_message_id: sent?.message_id || null, meta_error: errorCode
    }
  });
  console.info("OralGos controlled reply outcome", JSON.stringify({
    acceptedByMeta: success, responseRecorded: !resultError, metaError: errorCode
  }));
}
