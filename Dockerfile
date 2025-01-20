FROM zenika/alpine-chrome:with-node


ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser

# 设置工作目录
WORKDIR /usr/src/app

# 首先复制package文件以利用Docker缓存
COPY --chown=chrome package*.json ./
RUN npm install --production

# 复制应用代码
COPY --chown=chrome . .

# 暴露应用端口
EXPOSE 4000


# 启动应用
CMD ["node", "index.js"]
