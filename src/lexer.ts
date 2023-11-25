import { Stack, errorExtendHelper } from "./utils";

export interface Position {
    index: number;
    row: number;
    col: number;
}

export interface Token<T extends string> {
    content: string;
    start: Position;
    end: Position;
}

export interface SpliterHandler {
    (str: string, start: number): number | undefined | null;
}

export type SpliterParams = string | RegExp | SpliterHandler;

export interface TerminalArgs<T extends string> {
    spliter: SpliterParams;
    mode?: string;
    pushMode?: string;
    popMode?: true;
    channel?: T;
    priority?: number;
}

export class TermianlDefineError extends Error {
    constructor(public args?: TerminalArgs<string> | SpliterParams) {
        super(`You should define a terminal class in this way: 
class TerminalClassName {
    token = getToken(options);
}`);
        errorExtendHelper(new.target, this);
    }
}

export class SpliterHandlerError extends Error {
    constructor() {
        super("The index you returned should large than the start index.");
        errorExtendHelper(new.target, this);
    }
}

export function getToken<T extends string = "default">(args: TerminalArgs<T> | SpliterParams): Token<T> {
    if (isGenerateMode) {
        return {
            content: '',
            start: { index: 0, row: 0, col: 0 },
            end: { index: 0, row: 0, col: 0 },
        };
    }
    throw new TermianlDefineError(args);
}

export interface Terminal {
    token: Token<string>;
}

export type TerminalClass = new () => Terminal;

export type TerminalResult<T extends TerminalClass[]> = {
    [Channel in GetChannel<T[number]>]: TerminalType<T, Channel>[];
};

export type TerminalType<T extends TerminalClass[], Channel> =
    T extends [infer first extends TerminalClass, ... infer rest extends TerminalClass[]]
    ? (GetChannel<first> extends Channel ? InstanceType<first> : never) | TerminalType<rest, Channel> : never;

export interface LexerResult<T extends TerminalClass[]> {
    success: TerminalResult<T>;
    fail: Token<string>[];
}

export class Lexer<T extends TerminalClass[]> {
    private metas: TerminalMeta[];

    constructor(terminals: [...T]) {
        this.metas = terminals
            .map(ctor => {
                const params = getTerminalParams(ctor);
                return { ctor, params };
            })
            .sort((a, b) => b.params.priority - a.params.priority);
    }

    private switchMode(meta: TerminalMeta, modes: Stack<string>) {
        const { pushMode, popMode } = meta.params;
        if (pushMode) modes.push(pushMode);
        if (popMode) modes.pop();
    }

    private generateResultMap() {
        const map = new Map<string, Stack<Terminal>>();
        const channels = [...new Set(this.metas.map(it => it.params.channel))];
        for (const channel of channels) {
            map.set(channel, new Stack());
        }
        return map;
    }

    private getResult(resultMap: Map<string, Stack<Terminal>>) {
        const result: Record<string, Terminal[]> = {};
        for (const [channel, stack] of resultMap.entries()) {
            result[channel] = stack.toArray();
        }
        return result;
    }

    exec(str: string): LexerResult<T> {
        const modes = new Stack<string>();
        const resultMap = this.generateResultMap();
        const counter = new PositionCounter();
        const failResults = new Stack<Token<string>>();

        function collectFailResult() {
            if (errorStart !== undefined) {
                const content = str.slice(errorStart, start);
                const positions = counter.getPosition(content);
                failResults.push({
                    content,
                    ...positions,
                });
                errorStart = undefined;
            }
        }

        let errorStart: number | undefined;
        let start = 0;
        outer: while (start < str.length) {
            for (const meta of this.metas) {
                if (meta.params.mode !== modes.top) continue;

                const end = meta.params.spliter.exec(str, start);
                if (typeof end !== "number") continue;
                this.switchMode(meta, modes);
                collectFailResult();

                const content = str.slice(start, end);
                const positions = counter.getPosition(content);
                start = end;

                const terminal = generateTermianl(meta.ctor);
                terminal.token = {
                    content,
                    ...positions,
                };

                resultMap.get(meta.params.channel)?.push(terminal);
                continue outer;
            }

            if (errorStart === undefined) {
                errorStart = start;
            }
            start++;
        }

        collectFailResult();
        return {
            success: this.getResult(resultMap) as TerminalResult<T>,
            fail: failResults.toArray(),
        };
    }
}

interface TerminalMeta {
    params: TerminalParams;
    ctor: TerminalClass;
}

type GetChannel<T extends TerminalClass> = InstanceType<T>["token"] extends Token<infer C> ? C : never;

function keywordHandler(keyword: string): SpliterHandler {
    return function (str: string, start: number) {
        return str.startsWith(keyword, start) ? start + keyword.length : null;
    }
}

function regHandler(reg: RegExp): SpliterHandler {
    const _flags = reg.sticky ? reg.flags : reg.flags + "y";
    const flags = _flags.replace("g", "");
    const stickyReg = new RegExp(reg, flags);
    return function (str: string, index: number) {
        stickyReg.lastIndex = index;
        const res = str.match(stickyReg)?.[0];
        return res ? index + res.length : null;
    }
}

function customHandler(fn: SpliterHandler): SpliterHandler {
    return function (str: string, start: number) {
        const res = fn(str, start);
        if (typeof res === "number" && res <= start) {
            throw new SpliterHandlerError();
        }
        return res;
    }
}

class Spliter {
    private handler: SpliterHandler;

    constructor(arg: SpliterParams) {
        this.handler =
            typeof arg === "string" ? keywordHandler(arg) :
                arg instanceof RegExp ? regHandler(arg) :
                    customHandler(arg);
    }

    exec(str: string, start: number): number | undefined | null {
        return this.handler(str, start);
    }
}

interface TerminalParams {
    spliter: Spliter;
    channel: string;
    priority: number;

    mode?: string;
    pushMode?: string;
    popMode?: true;
}


let isGenerateMode = false;
function generateTermianl(ctor: TerminalClass) {
    try {
        isGenerateMode = true;
        return new ctor();
    } finally {
        isGenerateMode = false;
    }
}

function getTerminalParams(ctor: TerminalClass): TerminalParams {
    try {
        new ctor();
        throw new TermianlDefineError();
    } catch (e) {
        if (e instanceof TermianlDefineError) {
            const args = e.args;
            if (!args) throw e;

            const params: TerminalParams = (typeof args === "object" && "spliter" in args)
                ? {
                    channel: "default",
                    priority: 0,
                    ...args,
                    spliter: new Spliter(args.spliter),
                }
                : {
                    channel: "default",
                    priority: 0,
                    spliter: new Spliter(args),
                };
            return params;
        } else {
            throw e;
        }
    }
}

class PositionCounter {
    private start: Position = {
        index: 0,
        row: 1,
        col: 1,
    };

    getPosition(str: string) {
        const rows = str.match(/\r\n|\r|\n/g)?.length ?? 0;
        const cols = str.match(/([^\r\n]*)$/)![0].length;

        const end: Position = {
            index: this.start.index + str.length,
            row: this.start.row + rows,
            col: rows > 0 ? 1 + cols : this.start.col + cols,
        };

        const result = {
            start: this.start,
            end,
        };

        this.start = end;

        return result;
    }
}