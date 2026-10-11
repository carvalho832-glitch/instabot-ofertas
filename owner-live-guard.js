// Safeguards for the owner-managed Instagram account's live comment-to-DM flow.
// This never creates unsolicited messages; a signed "comments" webhook is required.
// One message per comment and a conservative hourly cap prevent accidental bursts.
const inflight = new Set();
const attemptedAt = [];
const apiErrorsAt = [];
let pausedUntil = 0;
const MAX_ATTEMPTS_PER_HOUR = 100;

function recentTimes(values, windowMs, now) {
  while (values.length && now - values[0] > windowMs) values.shift();
}

export function reserveOwnerReply({ commentId, postId, username }) {
  const now = Date.now();
  recentTimes(attemptedAt, 3600000, now);
  if (now < pausedUntil) return { allowed: false, reason: "Envios preventivamente pausados após erros da API" };
  if (!/^\d{10,25}$/.test(String(commentId || "")) || !/^\d{10,25}$/.test(String(postId || ""))) {
    return { allowed: false, reason: "ID de comentário ou publicação inválido" };
  }
  const commenter = String(username || "").trim().toLowerCase();
  const owner = String(process.env.META_ACCOUNT_USERNAME_EXPECTED || "minadeofertas_ofc").trim().toLowerCase();
  if (!/^@[a-z0-9_.]{1,30}$/.test(commenter) || commenter === "@" + owner || commenter === "@cliente") {
    return { allowed: false, reason: "Perfil ausente, inválido ou pertencente à própria loja" };
  }
  if (inflight.has(String(commentId))) return { allowed: false, reason: "Comentário já em processamento" };
  if (attemptedAt.length >= MAX_ATTEMPTS_PER_HOUR) {
    return { allowed: false, reason: "Limite preventivo de 100 tentativas por hora atingido" };
  }
  inflight.add(String(commentId));
  attemptedAt.push(now);
  return { allowed: true, reason: null };
}

export function releaseOwnerReply(commentId) {
  inflight.delete(String(commentId));
}

export function reportOwnerReplyError(error) {
  const now = Date.now();
  recentTimes(apiErrorsAt, 600000, now);
  apiErrorsAt.push(now);
  const reason = String(error?.message || "");
  // Authentication, permission and rate-limit failures should not be probed repeatedly.
  if (/HTTP\s+(401|403|429)\b|code\s+(4|10|17|32|190|613)\b/i.test(reason)) {
    pausedUntil = Number.MAX_SAFE_INTEGER;
    console.warn("Live Instagram sends paused: Meta permission or rate limit rejection");
  } else if (apiErrorsAt.length >= 3) {
    pausedUntil = now + 30 * 60000;
    console.warn("Live Instagram sends paused for 30 min after repeated errors");
  }
}

export async function sendOwnerReplyOnce({
  supabase, commentId, postId, username, comment, message, accessToken,
  insertAuditEvent, sendPrivateReply
}) {
  const reservation = reserveOwnerReply({ commentId, postId, username });
  if (!reservation.allowed) throw new Error("ENVIO_PREVENTIVO_BLOQUEADO: " + reservation.reason);
  try {
    // A persisted audit marker is written BEFORE the Meta request. If Meta times
    // out ambiguously, restarting the service cannot cause a duplicate reply.
    const { data: already, error: checkError } = await supabase.from("webhook_eventos")
      .select("id").eq("instagram_comment_id", String(commentId))
      .in("tipo_evento", ["owner_live_reply_attempt", "comment_direct_sent", "follower_one_shot_attempt"])
      .limit(1);
    if (checkError) throw new Error("ENVIO_PREVENTIVO_BLOQUEADO: Falha na consulta de duplicidades");
    if (already?.length) throw new Error("ENVIO_PREVENTIVO_BLOQUEADO: Comentário já recebeu uma tentativa");

    const marker = await insertAuditEvent({
      source: "webhook",
      eventType: "owner_live_reply_attempt",
      postId, commentId, username, comment,
      matched: true, safeMode: true,
      payload: { purpose: "owner_managed_instagram_private_reply" }
    });
    if (!marker) throw new Error("ENVIO_PREVENTIVO_BLOQUEADO: Registro de tentativa indisponível");

    try {
      return await sendPrivateReply({ commentId, accessToken, message });
    } catch (error) {
      reportOwnerReplyError(error);
      throw error;
    }
  } finally {
    releaseOwnerReply(commentId);
  }
}
