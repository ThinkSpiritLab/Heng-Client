FROM centos:8
RUN dnf update --assumeyes && \
    # yum install --assumeyes dnf-plugins-core && \
    # yum config-manager --set-enabled powertools && \
    # dnf install --assumeyes epel-release && \
    dnf module --assumeyes install nodejs:14 && \
    npm install -g npm && \
    dnf install --enablerepo=powertools --assumeyes \
    autoconf \
    bison \
    flex \
    gcc \
    gcc-c++ \
    libstdc++ \
    libstdc++-static \
    glibc-static \
    git \
    protobuf-devel \
    libnl3-devel \
    libtool \
    make \
    pkg-config \
    protobuf-compiler \
    git \
    wget \
    java-1.8.0-openjdk \
    java-1.8.0-openjdk-devel \
    python3 \
    && dnf clean all \
    && rm -rf /var/cache/yum \
    && rm -rf /var/cache/dnf
    RUN wget -o /usr/bin/ojcmp https://github.com/ThinkSpiritLab/ojcmp/releases/download/v0.3.2/ojcmp-v0.3.2-x86_64-unknown-linux-gnu
    #WORKDIR /ojcmp
    #run git clone https://github.com/ThinkSpiritLab/ojcmp.git /ojcmp && \
    #curl https://sh.rustup.rs -sSf | bash -s -- -y && \
    #source $HOME/.cargo/env && \
    #cargo build --release && \
    #cp target/release/ojcmp /usr/bin && \
    #RM -rf -- /ojcmp
WORKDIR /hc
RUN git clone https://github.com/ThinkSpiritLab/Heng-Core.git /hc && \
    make && \
    make install && \
    rm -rf -- /hc
WORKDIR /nsjail
RUN git clone https://github.com/google/nsjail.git /nsjail && \
    make && mv /nsjail/nsjail /usr/bin && rm -rf -- /nsjail
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["node","dist/index.js"]
