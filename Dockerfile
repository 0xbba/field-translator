# ============ Stage 1: 构建前端 ============
FROM node:20-alpine AS builder
WORKDIR /app

# 安装依赖（利用 Docker 缓存层）
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 复制构建所需源文件
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY src/ ./src/
COPY public/ ./public/

# 构建 → 输出到 server/public/
RUN npm run build

# ============ Stage 2: 运行时 ============
FROM node:20-alpine AS runtime
WORKDIR /app

# 设置时区为东八区
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata

# 安装服务端依赖（仅 express + pg + cors + bcryptjs + jsonwebtoken）
COPY server/package.json server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 复制服务端代码（db.js, middleware.js, init.js, routes/, utils/, server.js）
COPY server/db.js server/middleware.js server/init.js server/server.js ./
COPY server/routes/ ./routes/
COPY server/utils/ ./utils/

# 从构建阶段复制前端产物
COPY --from=builder /app/server/public ./public

EXPOSE 3456

# 健康检查（只检查端口是否响应，不依赖数据库）
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD wget -qO- http://localhost:3456/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
