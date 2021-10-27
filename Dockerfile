FROM centos:8
WORKDIR /hc
COPY . .
RUN bash ./prepare.sh
CMD ["node", "dist/index.js"]
