/* Install interface and safe worker registration for InstaBot PWA. */
(() => {
  let installPrompt = null;
  const button = document.getElementById("installInstabot");
  const tip = document.getElementById("pwaInstallTip");
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  function hint(message) {
    if (tip) {
      tip.textContent = message;
      tip.hidden = false;
    }
  }
  function refresh() {
    if (button) button.hidden = isStandalone();
    if (isStandalone() && tip) tip.hidden = true;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    refresh();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    refresh();
    hint("InstaBot instalado na tela inicial!");
  });
  if (button) {
    button.addEventListener("click", async () => {
      if (isStandalone()) return;
      if (!installPrompt) {
        hint("No Android, abra o menu ⋮ do Chrome e toque em ‘Instalar aplicativo’ ou ‘Adicionar à tela inicial’.");
        return;
      }
      const event = installPrompt;
      installPrompt = null;
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice?.outcome !== "accepted") {
          hint("Você pode instalar depois pelo menu ⋮ do Chrome.");
        }
      } catch (_) {
        hint("Use o menu ⋮ do Chrome e escolha ‘Instalar aplicativo’.");
      }
    });
  }
  refresh();
  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () =>
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .catch(() => { /* Application still works online without the worker. */ })
    );
  }
})();
