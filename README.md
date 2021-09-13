# 众衡

本系统是为ThinkSpirit实验室的下一代在线评测系统设计的评测机系统的评测端。专职负责运行用户程序并得出判定结论。

系统的详细结构参见[协议仓库](https://github.com/ThinkSpiritLab/Heng-Protocol), 参考的评测机实现在 [Heng-Controler](https://github.com/ThinkSpiritLab/heng-controller)

本仓库的 `Docker` 镜像（语言环境已封装）见 [https://hub.docker.com/r/thinkspiritlab/heng-client](https://hub.docker.com/r/thinkspiritlab/heng-client)

## 依赖

### 沙盒部分

本系统依赖 `nsjail` 和 `Heng-Core` 作为沙盒内核。
需要在配置文件中指定对应路径。

它们的仓库分别是 [https://github.com/google/nsjail](https://github.com/google/nsjail) 和 [https://github.com/ThinkSpiritLab/Heng-Core](https://github.com/ThinkSpiritLab/Heng-Core)

### 语言

为了评测机正常工作，需要其支持的各种语言环境。

### 运行时

开发使用 `nodejs:14` 不保证在更低版本下能够运行。

## 架构

### 基础设施

#### 沙盒运行支持

分为 `Meter` 和 `Jail` 两部分，分别对应 `Heng-Core` 和 `nsjail` 的调用逻辑。

#### 语言支持

对于每种语言，实现一个 `Language` 类型的函数并在 `src/Spawn/Language/index.ts` 中 `import` 并注册。

#### 限流

`Throttle` 模块实现了异步限流，调用方法是将逻辑封装在异步函数中发送给 `withThrottle` 方法。

### 业务逻辑

#### 控制端模块

在 `src/controller.ts` 中实现了控制端相关逻辑。

调用时，实例化一个 `Controller` 对象，注册各类评测机方法后获取token并开启连接。

#### 评测

不同的评测类型被封装在 `JudgeAgent` 的子类中。

而 `JudgeFactory` 是 `JudgeAgent` 的工厂类。

要添加评测类型，先实现其对应的 `JudgeAgent` 然后在 `JudgeFactory` 中添加对应的 `case` 。

`getJudgerFactory` 负责在生成 `JudgeFactory` 前进行自测以确定修正参数。

> spj 返回值汇总

```cpp
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