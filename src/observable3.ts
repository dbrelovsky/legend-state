import { isArray } from '@legendapp/tools';
import {
    arrPaths,
    delim,
    getNodeValue,
    getParentNode,
    getPathNode,
    getValueAtPath,
    hasPathNode,
    isPrimitive2,
    symbolEqualityFn,
    symbolID,
    symbolProp,
    symbolShallow,
} from './globals';
import {
    EqualityFn,
    Observable2,
    ObservableListenerInfo2,
    ObservableWrapper,
    PathNode,
    Shallow,
} from './observableInterfaces';
import { onChange, onEquals, onHasValue, onTrue } from './on';

const objectFns = new Map<string, Function>([
    ['set', set],
    ['onChange', onChange.bind(this, false)],
    ['onChangeShallow', onChange.bind(this, true)],
    ['onEquals', onEquals],
    ['onHasValue', onHasValue],
    ['onTrue', onTrue],
    ['prop', prop],
    ['assign', assign],
    ['delete', deleteFn],
]);

let nextID = 0;

const wrapFn = (fn: Function) =>
    function (a, b, c) {
        let node: PathNode;
        const prop = this[symbolProp];
        let num = arguments.length;
        if (prop) {
            node = prop.node;
            c = b;
            b = a;
            a = prop.key;
            num++;
        } else {
            const id = this._?.[symbolID];
            if (id !== undefined) {
                node = arrPaths[id];
            }
        }
        if (node) {
            // Micro-optimize here because it's the core and this is faster than apply.
            return num === 3 ? fn(node, a, b, c) : num === 2 ? fn(node, a, b) : num === 1 ? fn(node, a) : fn(node);
        }
    };

// const descriptors: PropertyDescriptorMap = {};

// objectFns.forEach((fn, key) => {
//     descriptors['_' + key] = {
//         enumerable: false,
//         value: wrapFn(fn),
//     };
// });

const descriptorsArray: PropertyDescriptorMap = {};
['push', 'splice'].forEach((key) => {
    descriptorsArray[key] = {
        value() {
            const prevValue = this.slice();
            const ret = Array.prototype[key].apply(this, arguments);

            let node;
            const id = this._?.[symbolID];
            if (id !== undefined) {
                node = arrPaths[id];
            }
            if (node) {
                const parentNode = getParentNode(node);
                if (parentNode) {
                    const parent = getNodeValue(parentNode);
                    parent[node.key] = prevValue;

                    set(node, this);
                }
            }

            return ret;
        },
    };
});

function boundObjDescriptors(obj: any, node: PathNode): PropertyDescriptor {
    const id = nextID++;
    const out = {
        [symbolID]: id,
    };
    arrPaths[id] = node;
    objectFns.forEach((fn, key) => {
        out[key] = wrapFn(fn).bind(obj);
    });
    return {
        enumerable: false,
        value: out,
    };
}

function createNodes(parent: PathNode, obj: Record<any, any>, prevValue?: any) {
    const isArr = isArray(obj);
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        const isObj = !isPrimitive2(obj[key]);
        const doNotify =
            prevValue && !isArr && obj[key] !== prevValue[key] && hasPathNode(parent.root, parent.path, key);
        const child = (isObj || doNotify) && getPathNode(parent.root, parent.path, key);
        if (isObj) {
            createNodes(child, obj[key], prevValue?.[key]);
        }
        if (doNotify) {
            _notify(child, { path: [], prevValue: prevValue[key], value: obj[key] });
        }
    }
    const hasDefined = obj._;
    if (!hasDefined) {
        Object.defineProperty(obj, '_', boundObjDescriptors(obj, parent));
        if (isArray(obj)) {
            Object.defineProperties(obj, descriptorsArray);
        }
    }
}

function cleanup(obj: object) {
    const isArr = isArray(obj);
    const keys = isArr ? obj : Object.keys(obj);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        const key = isArr ? i : keys[i];
        if (!isPrimitive2(obj[key])) {
            cleanup(obj[key]);
        }
    }
    const id = (obj as { _: any })._?.[symbolID];
    delete arrPaths[id];
}

function set(node: PathNode, newValue: any): any;
function set(node: PathNode, key: string, newValue: any): any;
function set(node: PathNode, key: string, newValue?: any): any {
    if (arguments.length < 3) {
        if (node.path.includes(delim)) {
            return set(getParentNode(node), node.key, key);
        } else {
            // Set on the root has to assign
            assign(node, key);
        }
    } else {
        let parentValue = getNodeValue(node);
        const prevValue = parentValue[key];

        if (!isPrimitive2(parentValue[key])) {
            cleanup(parentValue[key]);
        }
        parentValue[key] = newValue;

        const childNode = getPathNode(node.root, node.path, key);
        if (!isPrimitive2(newValue)) {
            createNodes(childNode, newValue, prevValue);
        }

        notify(childNode, newValue, prevValue);
    }
}

function _notify(node: PathNode, listenerInfo: ObservableListenerInfo2, levelsUp?: number) {
    if (node.listeners) {
        const value = getNodeValue(node);
        for (let listener of node.listeners) {
            if (!listener.shallow || levelsUp <= 1) {
                listener.callback(value, listenerInfo);
            }
        }
    }
}

function _notifyUp(node: PathNode, listenerInfo: ObservableListenerInfo2, levelsUp?: number) {
    _notify(node, listenerInfo, levelsUp);
    if (node.path !== '_') {
        const parent = getParentNode(node);

        const parentListenerInfo = Object.assign({}, listenerInfo);
        parentListenerInfo.path = [node.key].concat(listenerInfo.path);
        _notifyUp(parent, parentListenerInfo, levelsUp + 1);
    }
}
function notify(node: PathNode, value: any, prevValue: any) {
    const listenerInfo = { path: [], prevValue, value };
    _notifyUp(node, listenerInfo, prevValue === undefined ? -1 : 0);
}

function assign(node: PathNode, value: any) {
    const keys = Object.keys(value);
    const length = keys.length;
    for (let i = 0; i < length; i++) {
        set(node, keys[i], value[keys[i]]);
    }
}

function deleteFn(node: PathNode, key?: string) {
    if (!node.path) return;
    if (arguments.length < 2) {
        return deleteFn(getParentNode(node), node.key);
    }

    set(node, key, undefined);

    let child = getValueAtPath(node.root, node.path);

    delete child[key];
}

export function shallow(obs: Observable2): Shallow {
    return {
        [symbolShallow]: obs,
    };
}
export function equalityFn(obs: Observable2, fn: (value) => any): EqualityFn {
    return {
        [symbolEqualityFn]: { obs, fn },
    };
}

export function prop(node: PathNode, key: string) {
    const prop = {
        [symbolProp]: { node, key },
    };
    Object.defineProperty(prop, '_', boundObjDescriptors(prop, node));
    return prop;
}

export function observable3<T extends object | Array<any>>(obj: T): Observable2<T> {
    if (isPrimitive2(obj)) return undefined;

    const obs = {
        _: obj as Observable2,
        pathNodes: new Map(),
    } as ObservableWrapper;

    createNodes(getPathNode(obs, '_'), obs._);

    return obs._ as Observable2<T>;
}

// ((numProps, propsLength, numIter) => {
//     const performance = require('perf_hooks').performance;

//     const symbolID = Symbol('__symbolID');

//     let weakMap = new WeakMap();
//     let arrOfID = [];
//     let arr = [];
//     for (let p = 0; p < numProps; p++) {
//         arr[p] = { text: String(p * propsLength) };
//         Object.defineProperty(arr[p], symbolID, {
//             enumerable: false,
//             value: p,
//         });
//         arrOfID[p] = 'hi';
//     }
//     let t0 = performance.now();
//     for (let i = 0; i < numIter; i++) {
//         for (let p = 0; p < numProps; p++) {
//             let val = arr[p];
//             weakMap.set(val, 'hi');
//         }
//     }
//     console.log('Weak map set loop: ' + (performance.now() - t0));

//     t0 = performance.now();
//     for (let p = 0; p < numIter; p++) {
//         for (let p = 0; p < numProps; p++) {
//             let val = arr[p];
//             weakMap.has(val);
//         }
//     }
//     console.log('Weak map has loop: ' + (performance.now() - t0));

//     t0 = performance.now();
//     for (let p = 0; p < numIter; p++) {
//         for (let p = 0; p < numProps; p++) {
//             let val = arr[p];
//             arrOfID[val[symbolID]];
//         }
//     }
//     console.log('Get by symbol loop: ' + (performance.now() - t0));
// })(1000, 1, 10000);
