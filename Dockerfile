FROM node:18-slim

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com \
    && npm install --production \
    && npm cache clean --force

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]