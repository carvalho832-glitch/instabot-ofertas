FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js server-wrapper.js boot.js review-routes.js owner-live-guard.js one-shot-inbound-dm.js one-shot-follower.js one-shot-oralgos.js story-replies.js ./
COPY public ./public
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server-wrapper.js"]
