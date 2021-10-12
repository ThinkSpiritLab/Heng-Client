dnf update --assumeyes && \
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
screen && \
dnf module --assumeyes install nodejs:14 && \
npm install -g npm && \
npm install -g cnpm --registry=https://registry.npm.taobao.org
cd ~
wget -O /usr/bin/ojcmp https://github.com.cnpmjs.org/ThinkSpiritLab/ojcmp/releases/download/v0.4.0/ojcmp-v0.4.0-x86_64-unknown-linux-gnu && \
    chmod 755 /usr/bin/ojcmp
cd ~
git clone https://github.com.cnpmjs.org/flaryer/nsjail.git && cd nsjail && git checkout real_usr_time_kill && \
    make && mv ./nsjail /usr/bin
cd ~
git clone https://github.com.cnpmjs.org/flaryer/Heng-Client.git && cd Heng-Client && git checkout dev && cnpm i && npm run build
cd ~
cp ~/Heng-Client/Tools/testlib.h /testlib.h && chown 1000:1000 /testlib.h
cd ~

cd ~
wget https://download.redis.io/releases/redis-6.2.5.tar.gz && tar -zxf redis-6.2.5.tar.gz && cd redis-6.2.5 && make && make install
cd ~
git clone https://github.com.cnpmjs.org/flaryer/heng-controller.git && cd heng-controller && git checkout dev && cnpm i && npm run build

cd ~
git clone https://github.com.cnpmjs.org/flaryer/interval-front-end.git && cd interval-front-end && cnpm i && npm run generate