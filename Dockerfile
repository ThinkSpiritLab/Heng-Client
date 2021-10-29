FROM centos:8
WORKDIR /hc
COPY . .
RUN bash ./prepare-docker.sh
CMD ["node", "dist/index.js"]