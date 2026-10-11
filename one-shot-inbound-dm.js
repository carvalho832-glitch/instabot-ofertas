// One-off, explicitly authorized ordinary Instagram DM test.
// DISABLED unless OWNER_INBOUND_DM_TEST_ARMED is exactly "true".
// A signed inbound-message webhook must already exist in our audit database.
// The permanent attempt marker prevents repeat sends on restart/redeploy.
export async function runOwnerInboundDmTest({ supabase, getAccessToken, sendNormalDM }) {
  if (process.env.OWNER_INBOUND_DM_TEST_ARMED !== "true") return;
  const expectedSender = String(process.env.OWNER_INBOUND_DM_TEST_SENDER_ID || "").trim();
  const expectedHandle = String(process.env.OWNER_INBOUND_DM_TEST_USERNAME || "").trim().toLowerCase();
  const expectedAccount = String(process.env.META_ACCOUNT_USERNAME_EXPECTED || "").trim().toLowerCase();
  if (!supabase || !/^\d{10,25}$/.test(expectedSender) ||
      expectedHandle !== "@codigodopmarcal" || expectedAccount !== "minadeofertas_ofc") {
    console.warn("One-off DM test cancelled: invalid allowlist");
    return;
  }
  const now = Date.now();
  const windowStart = new Date(now - 60 * 60 * 1000).toISOString();
  const [inboundResult, ownerReplyResult] = await Promise.all([
    supabase.from("webhook_eventos")
      .select("id,created_at,payload")
      .eq("origem", "webhook")
      .eq("tipo_evento", "raw_event_no_comment")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false }).limit(40),
    supabase.from("webhook_eventos")
      .select("id,instagram_username,instagram_media_id,instagram_comment_id,payload")
      .eq("origem", "webhook")
      .eq("tipo_evento", "comment_direct_sent")
      .eq("instagram_username", expectedHandle)
      .order("created_at", { ascending: false }).limit(1)
  ]);
  if (inboundResult.error || ownerReplyResult.error || !ownerReplyResult.data?.length) {
    console.warn("One-off DM test cancelled: verified audit trail unavailable");
    return;
  }
  // Match the same account via the signed comment's originating user ID.
  const verifiedAccountId = String(ownerReplyResult.data[0].payload?.entry?.[0]?.id || "");
  const commentChange = ownerReplyResult.data[0].payload?.entry?.flatMap(x => x.changes || [])
    .find(x => x.value?.from?.id === expectedSender && x.value?.from?.username === expectedHandle.slice(1));
  if (!commentChange || !/^\d{10,25}$/.test(verifiedAccountId)) {
    console.warn("One-off DM test cancelled: commenter identity mismatch");
    return;
  }
  const inbound = (inboundResult.data || []).flatMap(e =>
    (e.payload?.entry || []).flatMap(entry =>
      (entry.messaging || []).map(m => ({ ...m, entryId: String(entry.id || ""), recordedAt: e.created_at }))
    )
  ).find(m =>
    String(m.sender?.id || "") === expectedSender &&
    String(m.recipient?.id || "") === verifiedAccountId &&
    m.entryId === verifiedAccountId &&
    String(m.message?.text || "").trim().toUpperCase() === "OI TESTE INSTABOT" &&
    Boolean(m.message?.mid) && !m.message?.is_echo &&
    now - Date.parse(m.recordedAt) <= 60 * 60 * 1000
  );
  if (!inbound) {
    console.warn("One-off DM test cancelled: no matching signed inbound message");
    return;
  }
  const sourceMid = String(inbound.message.mid);
  const { data: oldAttempts, error: previousError } = await supabase.from("webhook_eventos")
    .select("id").eq("tipo_evento", "owner_inbound_dm_test_attempt")
    .contains("payload", { source_mid: sourceMid }).limit(1);
  if (previousError || oldAttempts?.length) {
    console.info("One-off DM test not sent: an earlier attempt exists or duplicate check failed");
    return;
  }
  const token = getAccessToken();
  if (!token) {
    console.warn("One-off DM test cancelled: integration token unavailable");
    return;
  }
  // Claim before calling Meta: a timeout must never cause a repeated send.
  const marker = {
    origem: "owner_authorized_dm_test", tipo_evento: "owner_inbound_dm_test_attempt",
    instagram_username: expectedHandle, comentario_texto: "OI TESTE INSTABOT",
    instagram_media_id: ownerReplyResult.data[0].instagram_media_id,
    instagram_comment_id: null, produto_encontrado: false, modo_seguro: true,
    payload: { source_mid: sourceMid, sender_id: expectedSender, intent: "single_inbound_reply" }
  };
  const { error: claimError } = await supabase.from("webhook_eventos").insert(marker);
  if (claimError) {
    console.warn("One-off DM test cancelled: could not record immutable attempt");
    return;
  }
  const msg = "Oi! 😊 Aqui é a Mina de Ofertas. Recebemos seu OI TESTE INSTABOT e esta é uma resposta pelo Direct comum para verificar a entrega. Obrigado por participar do teste! 🛒";
  let result = null;
  let failure = null;
  try {
    result = await sendNormalDM({ recipientId: expectedSender, message: msg, accessToken: token });
  } catch (error) {
    failure = String(error?.message || error?.name || "unknown").slice(0,200);
  }
  const sent = Boolean(result?.message_id);
  const { error: recordError } = await supabase.from("webhook_eventos").insert({
    origem: "owner_authorized_dm_test",
    tipo_evento: sent ? "owner_inbound_dm_test_sent" : "owner_inbound_dm_test_error",
    instagram_username: expectedHandle, comentario_texto: "OI TESTE INSTABOT",
    instagram_media_id: ownerReplyResult.data[0].instagram_media_id,
    produto_encontrado: false, modo_seguro: !sent,
    payload: { source_mid: sourceMid, sender_id: expectedSender,
      meta_message_id: result?.message_id || null, error: failure }
  });
  if (recordError) console.warn("One-off DM test: result log failed");
  console.info("One-off ordinary DM test result", JSON.stringify({
    success: sent, metaError: failure, recorded: !recordError
  }));
}
