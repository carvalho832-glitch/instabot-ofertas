// Wrapper de inicialização do InstaBot Ofertas.
// Ajusta automaticamente o host da API da Meta quando o token gerado é da API do Instagram.
// Tokens IGAA normalmente devem ir para graph.instagram.com, não graph.facebook.com.

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

globalThis.fetch = async (input, init = {}) => {
  let nextInput = input;

  if (typeof input === "string" && input.startsWith("https://graph.facebook.com/")) {
    const accessToken = getBodyParam(init.body, "access_token").trim();

    if (accessToken.startsWith("IGAA")) {
      nextInput = input.replace("https://graph.facebook.com/", "https://graph.instagram.com/");
      console.log("Meta Graph: usando graph.instagram.com para token IGAA.");
    }
  }

  return nativeFetch(nextInput, init);
};

await import("./server.js");
