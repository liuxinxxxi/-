# PM 成长工作台 - 生产镜像（Express 同时托管前端构建产物与 API）
# 仓库结构：实际项目位于 cahnpin/cahnpin/cahnpin/ 子目录
FROM node:20-slim

WORKDIR /app

# 云端构建走官方 npm 源（仓库内 .npmrc 指向国内镜像，海外构建覆盖掉）
RUN npm config set registry https://registry.npmjs.org

# 先拷 workspace 清单，利用 Docker 层缓存安装依赖
COPY cahnpin/cahnpin/cahnpin/package.json cahnpin/cahnpin/cahnpin/package-lock.json ./
COPY cahnpin/cahnpin/cahnpin/client/package.json ./client/
COPY cahnpin/cahnpin/cahnpin/server/package.json ./server/
RUN npm ci

# 拷贝项目源码并构建前端
COPY cahnpin/cahnpin/cahnpin/ ./
RUN npm run build

# Koyeb 通过 PORT 环境变量指定端口（默认 8000）
ENV PORT=8000
EXPOSE 8000

CMD ["npm", "run", "start"]
