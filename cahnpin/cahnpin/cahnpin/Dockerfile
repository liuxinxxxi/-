# PM 成长工作台 - 生产镜像（Express 同时托管前端构建产物与 API）
FROM node:20-slim

WORKDIR /app

# 云端构建走官方 npm 源（仓库内 .npmrc 指向国内镜像，海外构建覆盖掉）
RUN npm config set registry https://registry.npmjs.org

# 先拷 workspace 清单，利用 Docker 层缓存安装依赖
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci

# 拷贝源码并构建前端
COPY . .
RUN npm run build

# Koyeb/Render 等平台通过 PORT 环境变量指定监听端口
ENV PORT=8787
EXPOSE 8787

CMD ["npm", "run", "start"]
