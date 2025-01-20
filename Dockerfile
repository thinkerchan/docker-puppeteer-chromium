# 使用 alpine-chrome 基础镜像
FROM zenika/alpine-chrome:latest

USER root
# 安装 Node.js 和相关依赖
RUN apk add --no-cache \
        nodejs \
        npm \
        ttf-freefont # 渲染所需字体

# 设置工作目录
WORKDIR /app

# 复制项目文件
COPY package.json ./
COPY index.js ./

# 安装依赖
RUN npm install --production

# 暴露端口
EXPOSE 3000

# 启动服务
CMD ["node", "index.js"]
