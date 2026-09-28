# Puerts 分层 Mixin

蓝图继承链与 TypeScript 继承链可以逐层对应。例如 `BP_B_C` 继承 `BP_A_C`，
`TS_B` 继承 `TS_A`。先加载并 Mixin 父层，再加载并 Mixin 子层：

```typescript
const A = blueprint.tojs<typeof UE.Game.BP_A.BP_A_C>(
    UE.Class.Load("/Game/BP_A.BP_A_C"));
const B = blueprint.tojs<typeof UE.Game.BP_B.BP_B_C>(
    UE.Class.Load("/Game/BP_B.BP_B_C"));

interface TS_A extends UE.Game.BP_A.BP_A_C {}
class TS_A {
    ReceiveBeginPlay(): void {
        console.log("A");
    }
}

interface TS_B extends UE.Game.BP_B.BP_B_C {}
class TS_B extends TS_A {
    override ReceiveBeginPlay(): void {
        super.ReceiveBeginPlay();
        console.log("B");
    }
}

blueprint.mixin(A, TS_A, { objectTakeByNative: true });
blueprint.mixin(B, TS_B, { objectTakeByNative: true });
```

实际项目中，每个 Mixin 类应声明对应蓝图接口；若要在 TS 中调用 UE 原始方法，
按常规 Mixin 写法连接占位类原型。建议按蓝图路径存放 TS 文件。

Mixin 会收集 TS 原型链上的方法。纯 TS 基类的方法会绑定到当前蓝图；
已 Mixin 到蓝图祖先的 TS 基类方法则由 UE wrapper 的继承链提供，
避免在子蓝图重复绑定。子 TS 类的同名方法覆盖父 TS 方法；
`super.Foo()` 直接调用父 TS 实现。

子蓝图无需为覆写的事件额外创建空事件。若子蓝图继承到父蓝图已
Mixin 的 `UFunction`，Puerts 会为子蓝图建立独立的临时函数与 JS 绑定。
卸载子层 Mixin 后会移除临时函数，重新使用父层实现；虚拟机退出时
从最深的子层开始恢复。显式卸载时也应从子层到父层。

`blueprint.mixin` 的 `inherit: true` 会生成新的 UE 类，不控制 TS 的
`extends` 继承。TS 类字段初始化器不会在 UE 对象构造时执行；
运行时状态仍应按项目规则在生命周期函数中初始化。

## 验证场景

1. A、B 蓝图都不声明 `ReceiveBeginPlay`，TS_A 和 TS_B 都实现它。
2. 启动 PIE：A 实例只执行 A；B 实例先执行 A、再执行 B，均只执行一次。
3. TS_A 声明纯 TS 辅助方法，TS_B 调用并覆写它，确认 B 实例使用子层实现。
4. 卸载 B 的 Mixin 后，B 实例调用父层实现；重新注册 B 后再次使用子层实现。
5. 退出并第二次进入 PIE，确认没有旧 `UFunction` 或 JS 绑定残留。

JS 层回归测试：在 UE 项目中运行
`node Plugins/Puerts/Tests/mixin-inheritance.test.cjs`；在 Puerts 源码仓库中运行
`node unreal/Puerts/Tests/mixin-inheritance.test.cjs`。
