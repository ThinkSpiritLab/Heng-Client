if [ $UID -ne 0 ]; then  
    echo Please run as root
    exit
fi

HCDIR=`dirname $(readlink -f "$0")`

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
python3"

dnf install --enablerepo=PowerTools --assumeyes $pkgs || dnf install --enablerepo=powertools --assumeyes $pkgs

dnf module --assumeyes install nodejs:14

export RUSTUP_DIST_SERVER=https://mirror.sjtu.edu.cn/rust-static
export RUSTUP_UPDATE_ROOT=https://mirror.sjtu.edu.cn/rust-static/rustup
curl https://sh.rustup.rs -sSf | sh -s -- --profile default -y && source ~/.cargo/env

source /etc/profile

npm install -g npm
npm install -g cnpm && source /etc/profile

git clone -b v0.4.0 --depth=1 --single-branch https://github.com.cnpmjs.org/ThinkSpiritLab/ojcmp.git ~/ojcmp \
&& cd ~/ojcmp && cargo build --release && cp target/release/ojcmp /usr/bin

git clone -b real_usr_time_kill --depth=1 --single-branch https://github.com.cnpmjs.org/flaryer/nsjail.git ~/nsjail \
&& cd ~/nsjail && make && cp ~/nsjail/nsjail /usr/bin/nsjail

cp -r ~/.rustup/toolchains/`ls ~/.rustup/toolchains/ | grep "stable"` /usr/local/rustup && ln -s /usr/local/rustup/bin/rustc /usr/bin/rustc

cp $HCDIR/Tools/testlib.h /testlib.h

cd $HCDIR && cnpm install && npm run build
