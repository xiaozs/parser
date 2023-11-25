export function errorExtendHelper<T extends Error>(ctor: new (...args: any) => T, instance: T) {
    instance.name = ctor.name;
    Error?.captureStackTrace(instance, ctor);
    Object.setPrototypeOf(instance, ctor.prototype);
}

export class Stack<T> {
    private head?: Item<T>;
    private tail?: Item<T>;
    private leng = 0;

    constructor(arr: T[] = []) {
        for (let it of arr) {
            this.push(it);
        }
    }

    get length() {
        return this.leng;
    }

    get top() {
        return this.tail?.value;
    }

    push(item: T) {
        let node: Item<T> = { value: item };
        if (this.tail) {
            this.tail.next = node;
            node.prev = this.tail;
            this.tail = node;
        } else {
            this.head = node;
            this.tail = node;
        }
        this.leng++;
    }

    pop(): T | undefined {
        if (this.leng === 0) {
            return;
        } else if (this.leng === 1) {
            let node = this.head!;
            this.head = undefined;
            this.tail = undefined;
            this.leng--;
            return node.value;
        } else {
            let node = this.tail!;
            this.tail = node.prev;
            this.leng--;
            return node.value;
        }
    }

    toArray(): T[] {
        let res: T[] = new Array(this.leng);

        let i = 0;
        let current = this.head;
        while (current) {
            res[i] = current.value;
            i++;
            current = current.next;
        }

        return res;
    }

    *reverse() {
        let current = this.tail;
        while (current) {
            yield current.value;
            current = current.prev;
        }
    }
}

interface Item<T> {
    value: T;
    prev?: Item<T>;
    next?: Item<T>;
}