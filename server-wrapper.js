// Wrapper de inicialização do InstaBot Ofertas.
// Ajusta automaticamente chamadas da API da Meta para tokens da API do Instagram.
// Tokens IGAA normalmente usam graph.instagram.com.
// Resposta privada para comentário do Instagram usa /{ig-user-id}/messages com recipient.comment_id.
// Respostas públicas ficam bloqueadas aqui para evitar loop do bot comentando no próprio post.

const nativeFetch = globalThis.fetch.bind(globalThis);

function getBodyParam(body, key) {
  if (!body) return "";

  try {
    if (body instanceof URLSearchParams) return body.get(key) || "";
    if (typeof body === "string") return new URLSearchParams(body).get(key) || "";
  } catch {
    return "";
  }

  return "";
}

function fakeMetaOk(payload = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function getInstagramAccountId() {
  return (
    process.env.INSTAGRAM_ACCOUNT_ID ||
    process.env.INSTAGRAM_BUSINESS_ID ||
    process.env.IG_USER_ID ||
    ""
  ).trim();
}

function replaceRequestBody(init = {}, entries = {}) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== null) body.append(key, String(value));
  }

  return {
    ...init,
    headers: { ...(init.headers || {}), "Content-Type": "application/x-www-form-urlencoded" },
    body
  };
}

globalThis.fetch = async (input, init = {}) => {
  let nextInput = input;
  let nextInit = init;

  if (typeof input === "string" && input.startsWith("https://graph.facebook.com/")) {
    const accessToken = getBodyParam(init.body, "access_token").trim();
    const isInstagramToken = accessToken.startsWith("IGAA");
    const publicReplyMatch = input.match(/^https:\/\/graph\.facebook\.com\/([^/]+)\/([^/]+)\/replies$/);

    if (publicReplyMatch) {
      console.log("Meta Graph: resposta publica bloqueada para evitar loop de comentarios.");
      return fakeMetaOk({ id: `public_reply_blocked_${Date.now()}`, skipped: true });
    }

    if (isInstagramToken) {
      const privateReplyMatch = input.match(/^https:\/\/graph\.facebook\.com\/([^/]+)\/([^/]+)\/private_replies$/);

      if (privateReplyMatch) {
        const graphVersion = privateReplyMatch[1];
        const commentId = privateReplyMatch[2];
        const igAccountId = getInstagramAccountId();
        const messageText = getBodyParam(init.body, "message");

        if (igAccountId) {
          nextInput = `https://graph.instagram.com/${graphVersion}/${igAccountId}/messages`;
          nextInit = replaceRequestBody(init, {
            recipient: JSON.stringify({ comment_id: commentId }),
            message: JSON.stringify({ text: messageText }),
            access_token: accessToken
          });
          console.log("Meta Graph: private reply via /messages com recipient.comment_id.");
        } else {
          nextInput = input.replace("https://graph.facebook.com/", "https://graph.instagram.com/");
          console.log("Meta Graph: INSTAGRAM_ACCOUNT_ID ausente; usando graph.instagram.com sem converter endpoint.");
        }
      } else {
        nextInput = input.replace("https://graph.facebook.com/", "https://graph.instagram.com/");
        console.log("Meta Graph: usando graph.instagram.com para token IGAA.");
      }
    }
  }

  return nativeFetch(nextInput, nextInit);
};

await import("./server.js");
