HCDIR=$(dirname $(readlink -f "$0"))

# https://www.centos.org/centos-linux-eol/
sed -i 's/mirrorlist/#mirrorlist/g' /etc/yum.repos.d/CentOS-*
sed -i 's|#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|g' /etc/yum.repos.d/CentOS-*

dnf update --assumeyes

pkgs="autoconf \
bison \
flex \
gcc \
gcc-c++ \
libstdc++ \
libstdc++-static \
glibc-static \
git \
libtool \
make \
pkg-config \
protobuf-devel \
protobuf-compiler \
git \
wget \
java-1.8.0-openjdk \
java-1.8.0-openjdk-devel \
python3 \
libnl3-devel"

dnf install --enablerepo=PowerTools --assumeyes $pkgs || dnf install --enablerepo=powertools --assumeyes $pkgs

dnf module --assumeyes install nodejs:14

curl https://sh.rustup.rs -sSf | sh -s -- --profile default -y && source ~/.cargo/env

source /etc/profile

npm install -g npm

git clone -b v0.4.0 --depth=1 --single-branch https://github.com/ThinkSpiritLab/ojcmp.git ~/ojcmp &&
    cd ~/ojcmp && cargo build --release && cp target/release/ojcmp /usr/bin && cd ~

git clone --depth=1 --single-branch https://github.com/google/nsjail.git ~/nsjail &&
    cd ~/nsjail && make && cp ~/nsjail/nsjail /usr/bin/nsjail && cd ~

git clone --depth=1 --single-branch https://github.com/ThinkSpiritLab/Heng-Core.git ~/Heng-Core &&
    cd ~/Heng-Core && make && cp ~/Heng-Core/hc /usr/bin/hc && cd ~

cp -r ~/.rustup/toolchains/$(ls ~/.rustup/toolchains/ | grep "stable") /usr/local/rustup && ln -s /usr/local/rustup/bin/rustc /usr/bin/rustc

cp $HCDIR/Tools/testlib.h /testlib.h

cd $HCDIR && npm install && npm run build && cd ~

dnf clean all
rm -rf /var/cache/yum
rm -rf /var/cache/dnf
rm -rf ~/ojcmp
rm -rf ~/nsjail
rm -rf ~/Heng-Core
rm -rf ~/.cargo
rm -rf ~/.rustup/
rm -rf /usr/local/rustup/share/doc
npm cache clean --force
