# TradeMind AI — Demo API (Node) for Railway / Render free tier
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs data.mjs market-data.mjs ./
ENV NODE_ENV=production
ENV DEMO_API_HOST=0.0.0.0
EXPOSE 8000
CMD ["node", "server.mjs"]
