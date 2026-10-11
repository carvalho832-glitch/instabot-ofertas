import express from "express";

export function createReviewRouter({ supabase, mediaId, mode, directEnabled }) {
  const router = express.Router();
  router.get("/overview", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (!supabase || !/^\d{10,24}$/.test(String(mediaId || ""))) {
      return res.status(503).json({ ok: false, message: "Demonstração indisponível" });
    }
    try {
      // Allowlist: only public product attributes and anonymous totals for
      // the configured demonstration post. No administrative data or user IDs.
      const [productResult, commentsResult, directsResult] = await Promise.all([
        supabase.from("produtos")
          .select("nome,plataforma,categoria,preco_antigo,preco_atual,link_afiliado,instagram_media_id,palavras_chave,ativo")
          .eq("instagram_media_id", mediaId).eq("ativo", true).limit(1),
        supabase.from("interacoes")
          .select("id", { head: true, count: "exact" }).eq("instagram_media_id", mediaId),
        supabase.from("interacoes")
          .select("id", { head: true, count: "exact" }).eq("instagram_media_id", mediaId).eq("direct_enviado", true)
      ]);
      if (productResult.error || commentsResult.error || directsResult.error) throw new Error("Database query error");
      const p = productResult.data?.[0];
      return res.json({
        ok: true, readOnly: true,
        account: "@minadeofertas_ofc",
        botMode: mode, directEnabled: Boolean(directEnabled),
        product: p ? {
          name: p.nome, platform: p.plataforma, category: p.categoria,
          oldPrice: p.preco_antigo, newPrice: p.preco_atual,
          affiliateLink: p.link_afiliado, instagramMediaId: p.instagram_media_id,
          keywords: p.palavras_chave || [], active: Boolean(p.ativo)
        } : null,
        statistics: {
          commentsProcessed: commentsResult.count ?? 0,
          directRepliesConfirmed: directsResult.count ?? 0
        }
      });
    } catch (error) {
      console.error("Read-only review query unavailable:", error?.message);
      return res.status(503).json({ ok: false, message: "Resumo temporariamente indisponível" });
    }
  });
  return router;
}
