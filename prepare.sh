HCDIR=`dirname $(readlink -f "$0")`

dnf update --assumeyes

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
nodejs:14

npm update -g npm@latest

curl https://sh.rustup.rs -sSf | sh -- --profile default -y

source ~/.cargo/env
source /etc/profile

git clone -b v0.4.0 --depth=1 --single-branch https://github.com/ThinkSpiritLab/ojcmp.git ~/ojcmp
cd ~/ojcmp && cargo build --release && cp target/release/ojcmp /usr/bin

git clone -b real_usr_time_kill --depth=1 --single-branch https://github.com/flaryer/nsjail.git ~/nsjail
cd ~/nsjail && make && mv ~/nsjail/nsjail /usr/bin

cp $HCDIR/Tools/testlib.h /testlib.h

cd $HCDIR && npm install && npm run build
