# 众衡

本系统是为 ThinkSpirit 实验室的下一代在线评测系统设计的评测机系统的评测端。专职负责运行用户程序并得出判定结论。

系统的详细结构参见[协议仓库](https://github.com/ThinkSpiritLab/Heng-Protocol), 参考的控制端实现在 [Heng-Controler](https://github.com/ThinkSpiritLab/heng-controller)

本仓库的 `Docker` 镜像（语言环境已封装）见 [https://hub.docker.com/r/thinkspiritlab/heng-client](https://hub.docker.com/r/thinkspiritlab/heng-client)

## 部署

对于 ubuntu，无论是否使用 docker，都不能跳过[这个步骤](https://blog.csdn.net/SUKI547/article/details/112328873)。

### Docker

```
dnf install --assumeyes yum-utils device-mapper-persistent-data lvm2
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
dnf install --assumeyes docker-ce
systemctl start docker
systemctl enable docker
docker pull thinkspiritlab/heng-client:latest
docker run --cgroupns private --privileged -it -v $(pwd)/config.toml:/hc/config.toml thinkspiritlab/heng-client
# docker run --cgroupns private --privileged -d --restart=always -v $(pwd)/config.toml:/hc/config.toml thinkspiritlab/heng-client
```

### CentOS8

```bash
cd ~
dnf install git -y
git clone https://github.com/ThinkSpiritLab/Heng-Client.git
cd ./Heng-Client
bash prepare-centos8.sh
cp config.example.toml config.toml
npm run start # pm2 start ./dist/index.js --name judger
```

### Ubuntu20.04

```bash
sudo -i
cd ~
apt update
apt install git -y
git clone https://github.com/ThinkSpiritLab/Heng-Client.git
cd ./Heng-Client
bash prepare-ubuntu20.sh
cp config.example.toml config.toml
npm run start # pm2 start ./dist/index.js --name judger
```

## 依赖

### 沙盒部分

本系统依赖魔改 `nsjail` 作为沙盒内核。需要在配置文件中指定对应路径。

它的仓库是 [https://github.com/flaryer/nsjail/tree/real_usr_time_kill](https://github.com/flaryer/nsjail/tree/real_usr_time_kill)。

### 语言

为了评测机正常工作，需要其支持的各种语言环境。

### 运行时

开发使用 `nodejs:14` 不保证在更低版本下能够运行。

## 架构

### 基础设施

#### 沙盒运行支持

使用魔改 `nsjail`。

#### 语言支持

对于每种语言，实现一个 `Language` 类型的函数并在 `src/Spawn/Language/index.ts` 中 `import` 并注册。

#### 限流

`Throttle` 模块实现了异步限流，调用方法是将逻辑封装在异步函数中发送给 `withThrottle` 方法。

### 业务逻辑

#### 控制端模块

在 `src/controller.ts` 中实现了控制端相关逻辑。

调用时，实例化一个 `Controller` 对象，注册各类评测机方法后获取 token 并开启连接。

#### 评测

仅通过 `ExecutableAgent` 调用外部程序，`ExecutableAgent` 有编译和运行功能；`ExecutableAgent` 传入可执行对象 `Executable`（包括代码、语言、限制），根据不同语言调用相应 `Language`。编译或运行时可提供输入输出流，`ExecutableAgent` 询问 `Language` 编译参数或运行参数，并作一些合并，然后执行。

对于 `Normal` 和 `Spj`，用户程序的输出被重定向到文件，随后被提供给结果判断程序；对于 `Interactive`，`user` 和 `interactor` 同时运行，双方的输入输出被 pipe 到另一方，由于管道缓冲区有容量限制，写满后写程序阻塞，要避免大量输入输出、避免 `interactor` 过慢、避免 `interactor` 时限小于 `user`。

对于 `Normal` 和 `Spj`，用户程序没有正常结束运行时，跳过执行结果判断程序。

可能无法检测 `OutpuLimitExceeded`。

## 其他

### spj 返回值及输出结果汇总

```cpp
#ifndef OK_EXIT_CODE
#   ifdef CONTESTER
#       define OK_EXIT_CODE 0xAC
#   else
#       define OK_EXIT_CODE 0
#   endif
#endif

#ifndef WA_EXIT_CODE
#   ifdef EJUDGE
#       define WA_EXIT_CODE 5
#   elif defined(CONTESTER)
#       define WA_EXIT_CODE 0xAB
#   else
#       define WA_EXIT_CODE 1
#   endif
#endif

#ifndef PE_EXIT_CODE
#   ifdef EJUDGE
#       define PE_EXIT_CODE 4
#   elif defined(CONTESTER)
#       define PE_EXIT_CODE 0xAA
#   else
#       define PE_EXIT_CODE 2
#   endif
#endif

#ifndef FAIL_EXIT_CODE
#   ifdef EJUDGE
#       define FAIL_EXIT_CODE 6
#   elif defined(CONTESTER)
#       define FAIL_EXIT_CODE 0xA3
#   else
#       define FAIL_EXIT_CODE 3
#   endif
#endif

#ifndef DIRT_EXIT_CODE
#   ifdef EJUDGE
#       define DIRT_EXIT_CODE 6
#   else
#       define DIRT_EXIT_CODE 4
#   endif
#endif

#ifndef POINTS_EXIT_CODE
#   define POINTS_EXIT_CODE 7
#endif

#ifndef UNEXPECTED_EOF_EXIT_CODE
#   define UNEXPECTED_EOF_EXIT_CODE 8
#endif

#ifndef PC_BASE_EXIT_CODE
#   ifdef TESTSYS
#       define PC_BASE_EXIT_CODE 50
#   else
#       define PC_BASE_EXIT_CODE 0
#   endif
#endif

int resultExitCode(TResult r) {
    if (r == _ok)
        return OK_EXIT_CODE;
    if (r == _wa)
        return WA_EXIT_CODE;
    if (r == _pe)
        return PE_EXIT_CODE;
    if (r == _fail)
        return FAIL_EXIT_CODE;
    if (r == _dirt)
        return DIRT_EXIT_CODE;
    if (r == _points)
        return POINTS_EXIT_CODE;
    if (r == _unexpected_eof)
#ifdef ENABLE_UNEXPECTED_EOF
        return UNEXPECTED_EOF_EXIT_CODE;
#else
        return PE_EXIT_CODE;
#endif
    if (r >= _partially)
        return PC_BASE_EXIT_CODE + (r - _partially);
    return FAIL_EXIT_CODE;
}


switch (result) {
    case _ok:
        errorName = "ok ";
        quitscrS(LightGreen, errorName);
        break;
    case _wa:
        errorName = "wrong answer ";
        quitscrS(LightRed, errorName);
        break;
    case _pe:
        errorName = "wrong output format ";
        quitscrS(LightRed, errorName);
        break;
    case _fail:
        errorName = "FAIL ";
        quitscrS(LightRed, errorName);
        break;
    case _dirt:
        errorName = "wrong output format ";
        quitscrS(LightCyan, errorName);
        result = _pe;
        break;
    case _points:
        errorName = "points ";
        quitscrS(LightYellow, errorName);
        break;
    case _unexpected_eof:
        errorName = "unexpected eof ";
        quitscrS(LightCyan, errorName);
        break;
    default:
        if (result >= _partially) {
            errorName = format("partially correct (%d) ", pctype);
            isPartial = true;
            quitscrS(LightYellow, errorName);
        } else
            quit(_fail, "What is the code ??? ");
```

### 其他平台编译参数汇总

luogu：https://www.luogu.com.cn/discuss/86673

codeforces(may be old)：https://codeforces.com/blog/entry/79

loj：https://github.com/syzoj/syzoj-ng-judge/tree/master/src/languages

lojv3：https://github.com/syzoj/judge-v3/tree/master/src/languages

uoj：https://github.com/UniversalOJ/UOJ-System/blob/230738b770022cc6b882c42b67b82d7b29b82003/judger/uoj_judger/include/uoj_judger.h#L1137

pta: https://github.com/pintia/ljudge/tree/master/etc/ljudge


### todo

- spj cache LRU