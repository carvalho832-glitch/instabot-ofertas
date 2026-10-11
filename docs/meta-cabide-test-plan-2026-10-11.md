# Ensaio técnico do InstaBot: comentário "EU QUERO" (11/10/2026)

## Autorização e escopo

- Aplicativo: bot-ofertas-julio, ID 1706788850634117.
- Instagram profissional: @minadeofertas_ofc.
- Perfil que enviará o comentário de teste: @jc_carvalho87 (autorização do proprietário em 11/10/2026).
- Publicação de teste: https://www.instagram.com/p/DeSDlELAr3H/ (cabide organizador, 09/10/2026).
- Instagram Media ID informado pelas métricas da publicação: 17925187620200856.
- Palavra de teste: EU QUERO.
- Teste autorizado, sem envolvimento de outras pessoas.

## Status verificado

- Banco Supabase instabot-ofertas: ACTIVE_HEALTHY.
- Serviço Render: live, app operacional.
- META_ACCESS_TOKEN e IG Account ID: configurados no processo, **validade do token ainda não comprovada**.
- META_APP_SECRET: ainda não configurada no processo; assinatura do webhook permanece desabilitada e POST /webhook rejeita pedidos.
- BOT_MODE: simulation e DIRECT_ENABLED: false.
- Segurança adicional instalada: audiência limitada a modo test e ao par @jc_carvalho87 / media ID 17925187620200856. O envio fica bloqueado se esse par não corresponder.
- Permissão de comentários: rejeitada na revisão anterior por vídeo insuficiente; aprovação ainda necessária.

## Pendências antes de testar comentário real

1. No **Meta for Developers > App > Settings > Basic**, clicar em Mostrar no campo **Chave Secreta do Aplicativo**. A Meta exige confirmação de senha. O proprietário deve digitá-la diretamente no site autenticado da Meta (nunca fornecê-la em chat).
2. Configurar essa chave de app no Render como variável secreta `META_APP_SECRET` (sem anexar a nenhum arquivo, repositório ou conversa). Após publicar, `/health` deve indicar `webhook: "signed"`.
3. Cadastrar a postagem real no banco usando seu Instagram Media ID e um **link de afiliado verificado para o produto cabide organizador**. Ainda falta o link correto da oferta; não misturar com links de produtos diferentes.
4. Conferir se a conta profissional está inscrita no webhook de comentários da Meta e se o token de acesso é válido.
5. Testar em modo simulação, avaliando correspondência de Media ID, palavra-chave e histórico sem enviar mensagens.
6. Conferir permissões para o cenário de testes e se o app consegue receber comentários da conta @jc_carvalho87 em ambiente de teste.
7. Liberar temporariamente apenas durante o teste: BOT_MODE=connected, DIRECT_ENABLED=true e configuração do banco `modo_bot=connected`, **mantendo** META_LIVE_AUDIENCE=test, META_TEST_USERNAME=jc_carvalho87, META_TEST_MEDIA_ID=17925187620200856.
8. Gravar vídeo real do comentário chegando pelo webhook e da resposta privada entregue; redigir senhas/tokens. Ao terminar, restaurar BOT_MODE=simulation, DIRECT_ENABLED=false e modo_bot=simulation.
9. Anexar vídeo e texto detalhado na nova solicitação para a permissão `instagram_business_manage_comments` em App Review. Não enviar gravação simulada como se fosse um fluxo real.

## Critério de sucesso

- Comentário `EU QUERO` do @jc_carvalho87 na publicação indicada aparece no log de webhook como evento do mesmo Media ID.
- Produto cabide encontrado e mensagem correspondente enviada e visualizada pelo teste.
- Nenhuma mensagem enviada a terceiros.
- Registro no banco com status real de envio, sem segredos em logs.
- Vídeo e descrição submetidos à Meta, após inspeção.

## Roteiro de vídeo

0. Breve apresentação do InstaBot e da página @minadeofertas_ofc.
1. Exibir autenticação ou explicar ligação servidor a servidor, conforme o modelo de token real.
2. Mostrar cadastro do produto com Media ID e link correspondente.
3. Mostrar comentário `EU QUERO` **real** feito pelo perfil secundário.
4. Mostrar a entrada verificada no servidor e registro do produto encontrado.
5. Mostrar a chegada do Direct na conta secundária do Instagram.
6. Mostrar bloqueio de duplicações, sem envio para quem não interagiu.
7. Concluir com pedido de `instagram_business_manage_comments`.

**Respeitar a rejeição anterior da Meta: demonstração deve mostrar o fluxo real, não apenas a simulação.**