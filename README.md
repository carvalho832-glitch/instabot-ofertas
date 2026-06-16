# InstaBot Ofertas

Painel para automatizar respostas de interesse em produtos no Instagram.

Fluxo do projeto:

```text
Cliente comenta em um Feed/Reel: "eu quero"
        ↓
O bot identifica o post/reel
        ↓
Busca o produto cadastrado
        ↓
Monta uma mensagem personalizada
        ↓
Em uma etapa futura, envia o link no Direct pela integração oficial
```

## Status atual

Esta primeira versão é um MVP em modo simulação.

Ela já tem:

- Cadastro de produtos
- Plataforma: Shopee, Mercado Livre, Amazon ou Outros
- Categoria
- Preço antes e preço atual
- Cupom
- Frete grátis
- Validade da oferta
- Benefício principal
- Observações internas
- Simulação de comentários
- Prévia do Direct
- Dashboard de métricas
- Gerador de mensagens
- Exportação e importação JSON
- Configurações visuais para Instagram
- Webhook inicial no backend

## Como rodar localmente

```bash
npm install
npm run dev
```

Depois abra:

```text
http://localhost:3000
```

## Arquivos principais

```text
public/index.html   Interface do painel
public/style.css    Estilos do painel
public/script.js    Lógica do painel em modo simulação
server.js           Servidor Express e webhook inicial
.env.example        Exemplo das variáveis de ambiente
package.json        Configuração Node.js
```

## Variáveis de ambiente

Copie o arquivo `.env.example` para `.env` quando for rodar localmente:

```bash
cp .env.example .env
```

O arquivo `.env` não deve ser enviado para o GitHub.

## Próximas etapas

1. Publicar no Render
2. Criar banco Supabase
3. Trocar localStorage por banco real
4. Configurar Meta Developers
5. Validar o webhook
6. Receber comentários reais
7. Enviar resposta privada no Direct usando a integração oficial
