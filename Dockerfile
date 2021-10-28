FROM centos:8
WORKDIR /hc
COPY . .
RUN bash ./prepare-ubuntu20.sh
CMD ["node", "dist/index.js"]