FROM node:18-slim

# 设置 Debian 镜像源为腾讯云源
RUN sed -i 's/deb.debian.org/mirrors.cloud.tencent.com/g' /etc/apt/sources.list.d/debian.sources

# 只安装运行 Chromium 所需的最小依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /usr/src/app

# 分层复制package文件以利用缓存
COPY package*.json ./

# 设置npm镜像并安装依赖
RUN npm config set registry https://registry.npmmirror.com \
    && npm install --production \
    && npm cache clean --force

EXPOSE 3000

CMD ["node", "index.js"]