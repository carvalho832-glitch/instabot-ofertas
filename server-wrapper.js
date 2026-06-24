// Wrapper de inicialização do InstaBot Ofertas.
// Ajusta chamadas da API da Meta para tokens da API do Instagram.
// Também pode inserir dados empresariais públicos na página inicial via variáveis de ambiente.

import express from "express";
import fs from "fs/promises";
import path from "path";

const nativeFetch = globalThis.fetch.bind(globalThis);
const nativeStatic = express.static.bind(express);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildBusinessFooter() {
  const legalName = (process.env.BUSINESS_LEGAL_NAME || "").trim();
  const tradeName = (process.env.BUSINESS_TRADE_NAME || "Mina de Ofertas").trim();
  const businessSite = (process.env.BUSINESS_SITE || "https://instabot-ofertas.onrender.com").trim();

  if (!legalName) return "";

  return `
<footer id="business-verification-footer" style="margin:30px auto;max-width:760px;padding:18px;border-radius:14px;background:#24182c;color:white;font-family:Arial,sans-serif;text-align:center;line-height:1.6;">
  <strong>${escapeHtml(tradeName)}</strong><br>
  Razão social: ${escapeHtml(legalName)}<br>
  Nome comercial: ${escapeHtml(tradeName)}<br>
  Site: ${escapeHtml(businessSite)}
</footer>`;
}

express.static = function patchedExpressStatic(root, options) {
  const staticMiddleware = nativeStatic(root, options);

  return async function patchedStatic(req, res, next) {
    const requestPath = String(req.path || req.url || "").split("?")[0];

    if (req.method === "GET" && (requestPath === "/" || requestPath === "/index.html")) {
      try {
        const indexPath = path.join(root, "index.html");
        let html = await fs.readFile(indexPath, "utf8");
        const footer = buildBusinessFooter();

        if (footer && !html.includes("business-verification-footer")) {
          html = html.replace(/<\/body>/i, `${footer}\n</body>`);
        }

        res.type("html").send(html);
        return;
      } catch (error) {
        console.warn("Business footer injection skipped:", error.message);
      }
    }

    return staticMiddleware(req, res, next);
  };
};

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
