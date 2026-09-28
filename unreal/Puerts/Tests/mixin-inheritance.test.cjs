const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const registrations = [];
const puerts = {
    loadUEType() {},
    loadCPPType() {},
    getFNameString(name) { return name; },
    registerBuildinModule() {},
};
const context = vm.createContext({
    puerts,
    __tgjsUEClassToJSClass: cls => cls.jsClass,
    __tgjsMixin(cls, methods, objectTakeByNative, inherit, noMixinedWarning, release) {
        registrations.push({ cls, names: Object.keys(methods), release: !!release });
        return cls;
    },
    __tgjsNewContainer: () => ({}),
});
context.global = context;

const loader = path.join(__dirname, '..', 'Content', 'JavaScript', 'puerts', 'uelazyload.js');
vm.runInContext(fs.readFileSync(loader, 'utf8'), context, { filename: loader });

vm.runInContext(`
    class A {}
    class B extends A {}
    class E extends B {}
    const aClass = { jsClass: A };
    const bClass = { jsClass: B };
    const eClass = { jsClass: E };
    A.StaticClass = () => aClass;
    B.StaticClass = () => bClass;
    E.StaticClass = () => eClass;

    class Helper {
        helper() { return 'helper'; }
        event() { return 'Helper'; }
    }
    class C extends Helper {
        event() { return 'C>' + super.event(); }
        cOnly() { return this.helper(); }
    }
    class D extends C {
        event() { return 'D>' + super.event(); }
        dOnly() { return this.cOnly(); }
    }
    class F extends D {
        event() { return 'F>' + super.event(); }
    }

    puerts.blueprint.mixin(A, C);
    puerts.blueprint.mixin(B, D);
    puerts.blueprint.mixin(E, F);
    globalThis.mixinTest = { A, B, E };
`, context);

assert.deepEqual(registrations[0].names.sort(), ['cOnly', 'event', 'helper']);
assert.deepEqual(registrations[1].names.sort(), ['dOnly', 'event']);
assert.deepEqual(registrations[2].names, ['event']);
assert.equal(new context.mixinTest.E().event(), 'F>D>C>Helper');
assert.equal(new context.mixinTest.E().dOnly(), 'helper');

vm.runInContext(`
    puerts.blueprint.unmixin(E);
    if (new E().event() !== 'D>C>Helper') throw new Error('child restore failed');
    puerts.blueprint.unmixin(B);
    if (new E().event() !== 'C>Helper') throw new Error('parent restore failed');
    A.prototype.helper = () => 'custom';
    puerts.blueprint.unmixin(A);
    if (new E().helper() !== 'custom') throw new Error('user override was removed');
`, context);

assert.deepEqual(registrations.slice(3).map(registration => registration.release), [true, true, true]);

vm.runInContext(`
    delete A.prototype.helper;
    puerts.blueprint.mixin(A, C);
    puerts.blueprint.mixin(B, D);
    if (new B().event() !== 'D>C>Helper') throw new Error('re-mixin failed');
`, context);
assert.deepEqual(registrations[6].names.sort(), ['cOnly', 'event', 'helper']);
assert.deepEqual(registrations[7].names.sort(), ['dOnly', 'event']);
console.log('Mixin TypeScript inheritance passed');
