const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const pluginRuntimePath = path.resolve(__dirname, "../Content/JavaScript/puerts/uelazyload.js");
const projectRuntimePath = path.resolve(__dirname, "../../../Content/JavaScript/puerts/uelazyload.js");
const source = fs.readFileSync(pluginRuntimePath, "utf8");

if (fs.existsSync(projectRuntimePath)) {
    assert.equal(fs.readFileSync(projectRuntimePath, "utf8"), source, "project runtime copy must match the plugin source");
}

const helperStart = source.indexOf("    function isUEClassPrototype");
const helperEnd = source.indexOf("    function unmixin(", helperStart);
assert.notEqual(helperStart, -1, "mixin helper block was not found");
assert.notEqual(helperEnd, -1, "unmixin function was not found");

const mixinMethodsByClass = new Map();
const sandbox = {
    Object,
    Set,
    Error,
    blueprint: {},
    UEClassToJSClass: (cls) => cls,
    __tgjsMixin: (cls, methods) => {
        mixinMethodsByClass.set(cls, methods);
        return cls;
    },
};
vm.runInNewContext(
    `${source.slice(helperStart, helperEnd)}\nthis.collectMixinMethods = collectMixinMethods;`,
    sandbox,
);
const collectMixinMethods = sandbox.collectMixinMethods;
assert.equal(collectMixinMethods.length, 2, "hierarchical collection must always be enabled");

class BlueprintA {
    BlueprintOnly() {}
}
BlueprintA.StaticClass = () => BlueprintA;

class BlueprintB extends BlueprintA {}
BlueprintB.StaticClass = () => BlueprintB;

class BlueprintC extends BlueprintB {}
BlueprintC.StaticClass = () => BlueprintC;

class ParentPlaceholder {}
Object.setPrototypeOf(ParentPlaceholder.prototype, BlueprintA.prototype);

class ParentMixin extends ParentPlaceholder {
    Shared() {
        return "parent";
    }

    ParentOnly() {}
}

class ChildMixin extends ParentMixin {
    Shared() {
        return "child";
    }

    ChildOnly() {}
}

const collectedMethods = collectMixinMethods(BlueprintB, ChildMixin);
assert.deepEqual(Object.keys(collectedMethods).sort(), ["ChildOnly", "ParentOnly", "Shared"]);
assert.equal(collectedMethods.Shared, ChildMixin.prototype.Shared, "the most-derived TS method must win");
assert.equal(collectedMethods.BlueprintOnly, undefined, "UE wrapper methods must not be collected");

class DirectTargetMixin extends BlueprintB {
    DirectOnly() {}
}
assert.deepEqual(
    Object.keys(collectMixinMethods(BlueprintB, DirectTargetMixin)),
    ["DirectOnly"],
    "collection must stop at the target UE wrapper boundary",
);

class DirectParentMixin extends BlueprintA {
    DirectParentOnly() {}
}
class DirectChildMixin extends DirectParentMixin {
    DirectChildOnly() {}
}
assert.deepEqual(
    Object.keys(collectMixinMethods(BlueprintB, DirectChildMixin)).sort(),
    ["DirectChildOnly", "DirectParentOnly"],
    "an inherited StaticClass must not make a TypeScript subclass look like a UE wrapper",
);

class UnrelatedBlueprint {}
UnrelatedBlueprint.StaticClass = () => UnrelatedBlueprint;

class UnrelatedPlaceholder {}
Object.setPrototypeOf(UnrelatedPlaceholder.prototype, UnrelatedBlueprint.prototype);

class InvalidMixin extends UnrelatedPlaceholder {}
assert.throws(
    () => collectMixinMethods(BlueprintB, InvalidMixin),
    /inherits from a UE class outside BlueprintB's hierarchy/,
);

class RuntimeParentPlaceholder {}
Object.setPrototypeOf(RuntimeParentPlaceholder.prototype, BlueprintA.prototype);

class RuntimeParentMixin extends RuntimeParentPlaceholder {
    ReceiveBeginPlay() {
        this.testFloat = 5;
        return ["parent"];
    }

    ParentOnly() {
        return "inherited";
    }
}

class RuntimeChildMixin extends RuntimeParentMixin {
    ReceiveBeginPlay() {
        return ["child", ...super.ReceiveBeginPlay()];
    }
}

class RuntimeGrandchildMixin extends RuntimeChildMixin {
    ReceiveBeginPlay() {
        const calls = super.ReceiveBeginPlay();
        return ["grandchild", ...calls, this.testFloat];
    }
}

sandbox.blueprint.mixin(BlueprintA, RuntimeParentMixin);
sandbox.blueprint.mixin(BlueprintB, RuntimeChildMixin);
sandbox.blueprint.mixin(BlueprintC, RuntimeGrandchildMixin);

const instance = new BlueprintC();
const grandchildMethods = mixinMethodsByClass.get(BlueprintC);
assert.deepEqual(grandchildMethods.ReceiveBeginPlay.call(instance), ["grandchild", "child", "parent", 5]);
assert.equal(
    grandchildMethods.ParentOnly.call(instance),
    "inherited",
    "inherited TS methods must remain callable on the most-derived Blueprint",
);

console.log("always-on hierarchical mixin runtime tests passed");
