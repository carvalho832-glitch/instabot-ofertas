import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, "server.js");
const runtimePath = path.join(__dirname, ".runtime-server.js");

let source = fs.readFileSync(serverPath, "utf8");

const marker = 'app.post("/webhook", (req, res) => processWebhookPayload(req, res, false));';

const dataDeletionRoutes = `
function getPublicBaseUrl(req) {
  return "https://" + req.get("host");
}

app.get("/data-deletion-callback", (req, res) => {
  const code = "delete-" + Date.now();
  const baseUrl = getPublicBaseUrl(req);
  return res.status(200).json({
    url: baseUrl + "/data-deletion-status?code=" + code,
    confirmation_code: code
  });
});

app.post("/data-deletion-callback", (req, res) => {
  const code = "delete-" + Date.now();
  const baseUrl = getPublicBaseUrl(req);
  return res.status(200).json({
    url: baseUrl + "/data-deletion-status?code=" + code,
    confirmation_code: code
  });
});

app.get("/data-deletion-status", (req, res) => {
  return res.status(200).send("Solicitação de exclusão de dados recebida. Código: " + (req.query.code || ""));
});
`;

if (!source.includes(marker)) {
  console.warn("Marcador do webhook não encontrado. Iniciando server.js sem injeção de rotas de exclusão.");
  await import(pathToFileURL(serverPath).href);
} else {
  source = source.replace(marker, dataDeletionRoutes + "\n" + marker);
  fs.writeFileSync(runtimePath, source, "utf8");
  await import(pathToFileURL(runtimePath).href);
}
