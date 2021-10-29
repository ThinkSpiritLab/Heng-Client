FROM centos:8
WORKDIR /hc
COPY . .
RUN bash ./prepare-centos8.sh \
    && dnf clean all \
    && rm -rf /var/cache/yum \
    && rm -rf /var/cache/dnf \
    && rm -rf ~/ojcmp \
    && rm -rf ~/nsjail \
    && rm -rf /usr/local/rustup/share/doc \
    && rm -rf ~/.rustup \
    && npm cache clean --force
CMD ["node", "dist/index.js"]