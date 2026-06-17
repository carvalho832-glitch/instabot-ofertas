(() => {
  const button = document.getElementById("simulateComment");

  if (!button) return;

  button.addEventListener(
    "click",
    async (event) => {
      if (typeof isDatabaseOnline === "undefined" || !isDatabaseOnline) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const currentPostId = els.simPostId.value.trim();
      const username = els.commentUser.value.trim();
      const comment = els.commentText.value.trim();

      if (!currentPostId || !username || !comment) {
        addLog("Preencha ID do post/reel, usuário e comentário.", "warning");
        return;
      }

      setLoading(true);
      addLog(`${username} comentou "${comment}" no post/reel ${currentPostId}.`, "success");
      addLog("Enviando comentário para o motor backend...", "success");

      try {
        const result = await apiRequest("/api/simular-comentario", {
          method: "POST",
          body: JSON.stringify({
            postId: currentPostId,
            username,
            comment
          })
        });

        await loadData();
        renderAll();

        if (!result.matched) {
          els.matchedProduct.innerHTML = result.reason || "Nenhum produto ativo encontrou esse ID + palavra-chave.";
          els.matchedProduct.className = "matched-empty";
          addLog(result.reason || "Nenhum produto encontrado pelo motor backend.", "warning");
          return;
        }

        const product = result.product;
        renderMatchedProduct(product);

        if (result.duplicate) {
          addLog(`Direct bloqueado pelo backend. ${username} já recebeu o link desse produto.`, "warning");
          return;
        }

        lastGeneratedMessage = result.message || "";
        els.copyLastMessage.disabled = !lastGeneratedMessage;

        if (lastGeneratedMessage) {
          sendDirect(username, product, lastGeneratedMessage);
        }

        if (result.publicReply) {
          addLog(`Resposta pública simulada pelo backend: "${username}, te mandei o link no Direct 🛒"`, "success");
        }

        addLog("Motor backend validou o comentário e gerou o Direct.", "success");
      } catch (error) {
        addLog(`Erro no motor backend: ${error.message}`, "error");
      } finally {
        setLoading(false);
      }
    },
    true
  );
})();
