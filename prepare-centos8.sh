if [ $UID -ne 0 ]; then  
    echo Please run as root
    exit
fi

HCDIR=`dirname $(readlink -f "$0")`
export GIT_SSL_NO_VERIFY=true

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

export RUSTUP_DIST_SERVER=https://mirror.sjtu.edu.cn/rust-static
export RUSTUP_UPDATE_ROOT=https://mirror.sjtu.edu.cn/rust-static/rustup
curl https://cdn.jsdelivr.net/gh/rust-lang-nursery/rustup.rs/rustup-init.sh -sSf | sh -s -- --profile default -y && source ~/.cargo/env
echo '# 放到 `$HOME/.cargo/config` 文件中
[source.crates-io]
registry = "https://github.com/rust-lang/crates.io-index"

# 替换成你偏好的镜像源
replace-with = "sjtu"
# replace-with = "ustc"

# 清华大学
[source.tuna]
registry = "https://mirrors.tuna.tsinghua.edu.cn/git/crates.io-index.git"

# 中国科学技术大学
[source.ustc]
registry = "git://mirrors.ustc.edu.cn/crates.io-index"

# 上海交通大学
[source.sjtu]
registry = "https://mirrors.sjtug.sjtu.edu.cn/git/crates.io-index"

# rustcc 社区
[source.rustcc]
registry = "git://crates.rustcc.cn/crates.io-index"
' > ~/.cargo/config
source /etc/profile

npm install -g npm --registry=https://registry.npm.taobao.org
npm i -g cnpm --registry=https://registry.npm.taobao.org && source /etc/profile

git clone -b v0.4.0 --depth=1 --single-branch https://github.com.cnpmjs.org/ThinkSpiritLab/ojcmp.git ~/ojcmp \
&& cd ~/ojcmp && cargo build --release && cp target/release/ojcmp /usr/bin

git clone -b real_usr_time_kill --depth=1 --single-branch https://github.com.cnpmjs.org/flaryer/nsjail.git ~/nsjail \
&& cd ~/nsjail && make && cp ~/nsjail/nsjail /usr/bin/nsjail

mv ~/.rustup/toolchains/`ls ~/.rustup/toolchains/ | grep "stable"` /usr/local/rustup && ln -s /usr/local/rustup/bin/rustc /usr/bin/rustc

cp $HCDIR/Tools/testlib.h /testlib.h

cd $HCDIR && cnpm install && npm run build
