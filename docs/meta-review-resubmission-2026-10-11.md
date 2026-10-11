# InstaBot Ofertas: retomada da análise Meta (11/10/2026)

**App Meta:** `bot-ofertas-julio` (ID `1706788850634117`)
**Instagram de teste/negócio:** `@minadeofertas_ofc`
**Backend:** https://instabot-ofertas.onrender.com
**Repositório:** https://github.com/carvalho832-glitch/instabot-ofertas

## Diagnóstico documentado no Meta for Developers

No painel `App Review > Envios`, o envio concluído em 14/07/2026 exibe:

- `instagram_business_basic`: aprovado.
- `instagram_business_manage_messages`: aprovado.
- `instagram_business_manage_comments`: **não aprovado**.

O parecer para comentários diz: **“Screencast não alinhado com detalhes do caso de uso”** (Developer Policy 1.6, criar um produto confiável).

A análise afirma que o caso de uso é permitido, mas o vídeo anexado não demonstrou sua experiência completa. Solicita mostrar autenticação/acesso, permissão, fluxo completo do caso de uso, boas práticas de vídeo e informar quando a integração usa token de sistema ou comunicação servidor a servidor. O vídeo antigo contém o painel em **modo simulação**.

Não interpretar a publicação do app como aprovação de todas as permissões. Não reenviar somente o vídeo antigo.

## Situação técnica verificada

Em 11/10/2026, o endpoint `/health` respondeu:

- mode: `simulation`
- directEnabled: `true`
- database: `configured`
- webhook: `ready`
- graphVersion: `v25.0`

O código do servidor implementa extração de eventos de comentários, vínculo por ID do post/Reel e palavra-chave, bloqueio de duplicados e tentativas de respostas privadas/públicas pela API oficial. Porém **não há prova aqui de ponta a ponta com comentário real recebido e Direct entregue**.

### Bloqueios de segurança a resolver antes de ativar produção

1. As rotas administrativas de produtos, interações e configuração precisam de autenticação/autorização. O backend usa credenciais de banco em servidor; evite que endpoints abertos exponham ou alterem os dados.
2. A configuração administrativa retornada pelo backend não deve expor tokens de acesso ou outros segredos, mesmo para clientes do painel.
3. Validar a assinatura dos webhooks da Meta com o segredo do app antes de processar eventos não confiáveis.
4. Auditar rate limits, duplicidade, expiração de tokens, logs (redigir dados sensíveis) e formas de desativar envios.
5. Testar permissões reais da conta profissional vinculada, URL e assinatura do webhook. Não usar comentários de clientes como teste.
6. Antes do teste real: restringir o ambiente de teste ao administrador/conta autorizada, confirmar token e Instagram Account ID e manter `BOT_MODE=simulation` até existir uma janela controlada.

**Não ativar modo `connected` ou mudar variáveis de produção sem concluir os controles acima e validar uma conta de teste.**

## Roteiro do novo screencast (gravar funcionamento VERDADEIRO)

A gravação deve ser clara, contínua, com interface ou legendas em inglês, narrando os cliques e sem exibir senha/tokens.

1. **Introdução (10-20 s).** Mostrar nome do aplicativo e identificar `@minadeofertas_ofc`. Explicar que a marca publica ofertas e usa respostas somente quando usuários comentam demonstrando interesse.
2. **Autorização e arquitetura (30-60 s).** Mostrar o vínculo da conta profissional com o app; se a API usa integração servidor a servidor/token de sistema sem login frontal, declarar isso explicitamente, com segredo oculto. Não encenar login inexistente.
3. **Configuração do produto (20-40 s).** Mostrar uma postagem/Reel real da conta de teste. No painel, cadastrar o mesmo Media ID, uma oferta de teste e a palavra-chave `eu quero`.
4. **Comentário REAL (20-30 s).** Na conta autorizada de teste, abrir a publicação no Instagram e publicar o comentário `EU QUERO`. Não usar botão interno de simulação neste trecho.
5. **Recebimento e ação (20-40 s).** Mostrar o evento real no log do webhook e o produto correspondente. Mostrar a resposta privada sendo enviada pela API e sua entrega no Direct da conta de teste. Ocultar informações pessoais e credenciais.
6. **Controles (10-20 s).** Explicar bloqueio de mensagens duplicadas, escopo limitado a comentários relevantes e que o bot não envia mensagens espontâneas a quem não interagiu.
7. **Conclusão (10 s).** Nomear exatamente a permissão `instagram_business_manage_comments` e por que ela é necessária.

Se algum passo real falhar, interromper a preparação do vídeo, corrigir tecnicamente e regravar. Não apresentar simulação como envio real.

## Suggested explanation for Meta App Review (English, draft)

> InstaBot Ofertas is a business tool for the Instagram professional account @minadeofertas_ofc. It helps the business respond to genuine interest in products published in its own Instagram posts and Reels. When a user leaves a comment such as “EU QUERO” (“I want it”), our application receives the Instagram comment event through Meta's official webhook, matches the Instagram media ID and the keyword to a product configured by the business, and sends a relevant private reply with the requested product's affiliate link using Meta's official API. Duplicate responses are restricted, and the app does not initiate unrelated messages or contact users without their prior comment.
>
> The instagram_business_manage_comments permission is needed to receive and process comments on the connected professional account's own content and associate those comments with the correct offer. The instagram_business_manage_messages permission was previously approved and is used for the corresponding private replies. We have updated our review demonstration to show the complete, authentic flow: account connection or server-to-server authentication explanation, product setup, a real Instagram comment, webhook receipt, matching, and delivery of the private reply. Credentials and unrelated personal data are concealed in the recording.

**Important:** This text is a *draft*. Do not claim the new demonstration has been completed until the actual recording and a successful end-to-end test exist. Replace the last sentence with future tense if submitting before recording (but uploading a complete recording first is preferable).

## Checklist for resubmission

- [x] Read Meta's historic feedback.
- [x] Confirm the two approvals and the rejection.
- [x] Verify health endpoint and current simulation mode.
- [ ] Harden authentication and avoid exposing access tokens in client responses.
- [ ] Validate real webhook signatures, event subscriptions and Instagram API endpoint/token.
- [ ] Perform an end-to-end test exclusively with an authorized account.
- [ ] Record a new, complete video including account connection/server token explanation, actual comment and Direct delivery.
- [ ] Fill in English reviewer instructions and attach the new recording.
- [ ] Ask the owner to review and explicitly authorize the final resubmission.
- [ ] Submit the request and monitor the App Review status.

## Where to resume

Meta: `developers.facebook.com/apps/1706788850634117/app-review/submissions/`.
Feedback: within the prior submission (ID `1709182287061440`).
This document is a preparation checklist, not proof of Meta approval or live deployment.
