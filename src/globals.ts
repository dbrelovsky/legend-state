import { isArray, isObject } from '@legendapp/tools';
import { ObservableChecker3, ObservableWrapper, PathNode } from './observableInterfaces';
import { observableConfiguration } from './configureObservable';

export const delim = '\uFEFF';
export const mapPaths = new WeakMap<object, PathNode>();
export const arrPaths = [];

export const symbolDateModified = Symbol('__dateModified');
export const symbolShallow = Symbol('__shallow');
export const symbolEqualityFn = Symbol('__equalityFn');
export const symbolValue = Symbol('__value');
export const symbolProp = Symbol('__prop');
export const symbolID = Symbol('__id');

export function removeNullUndefined<T extends Record<string, any>>(a: T) {
    if (a === undefined) return null;
    Object.keys(a).forEach((key) => {
        const v = a[key];
        if (v === null || v === undefined) {
            delete a[key];
        } else if (isObject(v)) {
            removeNullUndefined(v);
        }
    });
}

export function replaceKeyInObject(obj: object, keySource: any, keyTarget: any, clone: boolean) {
    if (isObject(obj)) {
        const target = clone ? {} : obj;
        if (obj[keySource]) {
            target[keyTarget] = obj[keySource];
            delete target[keySource];
        }
        Object.keys(obj).forEach((key) => {
            if (key !== keySource) {
                target[key] = replaceKeyInObject(obj[key], keySource, keyTarget, clone);
            }
        });
        return target;
    } else {
        return obj;
    }
}

export function isPrimitive(val: any) {
    return (
        !isObject(val) &&
        !isArray(val) &&
        !(val instanceof WeakMap) &&
        !(val instanceof WeakSet) &&
        !(val instanceof Error) &&
        !(val instanceof Date) &&
        !(val instanceof String) &&
        !(val instanceof ArrayBuffer)
    );
}
export function isPrimitive2(arg) {
    var type = typeof arg;
    return arg == null || (type != 'object' && type != 'function');
}

export function isCollection(obj: any) {
    return isArray(obj) || obj instanceof Map || obj instanceof Set || obj instanceof WeakMap || obj instanceof WeakSet;
}

export function getDateModifiedKey(dateModifiedKey: string) {
    return dateModifiedKey || observableConfiguration.dateModifiedKey || '@';
}

export function clone(obj: any) {
    return obj === undefined || obj === null
        ? obj
        : isArray(obj)
        ? obj.slice()
        : isObject(obj)
        ? Object.assign({}, obj)
        : JSON.parse(JSON.stringify(obj));
}

export function getValueAtPath(root: object, path: string) {
    let child = root;
    const arr = path.split(delim).filter((a) => !!a);
    for (let i = 0; i < arr.length; i++) {
        if (child) {
            child = child[arr[i]];
        }
    }
    return child;
}

export function getNodeValue(node: PathNode) {
    return getValueAtPath(node.root, node.path);
}

export function hasPathNode(root: ObservableWrapper, path: string, key?: string) {
    if (key && path) {
        path += delim + key;
    }
    return root.pathNodes.has(path);
}
export function getPathNode(root: ObservableWrapper, path: string, key?: string) {
    const parent = path;
    if (key !== undefined && path !== undefined) {
        path += delim + key;
    }
    let pathNode = root.pathNodes.get(path);
    if (!pathNode) {
        pathNode = {
            root,
            path,
            parent,
            key,
        };
        root.pathNodes.set(path, pathNode);
    }
    return pathNode;
}

export function getParentNode(node: PathNode) {
    return getPathNode(node.root, node.parent);
}

export function getObjectNode(obj: any) {
    return mapPaths.get(obj);
}

export function getObservableRawValue<T>(obs: ObservableChecker3<T>): T {
    if (!obs) return obs as T;
    const prop = obs[symbolProp as any];
    if (prop) {
        return getNodeValue(prop.node)?.[prop.key] as any;
    } else {
        const eq = obs[symbolEqualityFn as any];
        if (eq) {
            return getObservableRawValue(eq.obs);
        } else {
            return obs[symbolShallow as any] || obs;
            // obs = obs[symbolShallow as any] || obs;
            // const node = getObjectNode(obs);
            // return (node ? getNodeValue(node) : obs) as unknown as T;
        }
    }
}
