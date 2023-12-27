import { Terminal, TerminalClass, getToken } from "./lexer";
import { errorExtendHelper } from "./utils";

export type AndChildren<T extends Ast[]> = [...T];
export type OrChildren<T extends Ast[]> = { [K in keyof T]: T[K] | undefined };
export type MoreChildren<T extends [Ast]> = T[0][];
export type RepeatChildren<T extends [Ast]> = T[0][];
export type OptionalChildren<T extends [Ast]> = (T[0] | undefined);

export type And<T extends Ast[]> = { type: "and", children: AndChildren<T>; };
export type Or<T extends Ast[]> = { type: "or", children: OrChildren<T>; };
export type More<T extends [Ast]> = { type: "more", children: MoreChildren<T>; };
export type Repeat<T extends [Ast]> = { type: "repeat", children: RepeatChildren<T>; };
export type Optional<T extends [Ast]> = { type: "optional", children: OptionalChildren<T>; };
export type Empty = { type: "empty", children: []; };

type SubRule<T extends AstClass> = { type: "sub", children: T };
type AndRule<T extends Rule[]> = { type: "and", children: T };
type OrRule<T extends Rule[]> = { type: "or", children: T };
type MoreRule<T extends [Rule]> = { type: "more", children: T };
type RepeatRule<T extends [Rule]> = { type: "repeat", children: T };
type OptionalRule<T extends [Rule]> = { type: "optional", children: T };
type EmptyRule = { type: "empty" };

export type AndClass<T extends Ast[]> = new () => And<T>;
export type OrClass<T extends Ast[]> = new () => Or<T>;
export type MoreClass<T extends [Ast]> = new () => More<T>;
export type RepeatClass<T extends [Ast]> = new () => Repeat<T>;
export type OptionalClass<T extends [Ast]> = new () => Optional<T>;
export type EmptyClass = new () => Empty;

export type AstClass =
    | TerminalClass<Terminal>
    | AndClass<Ast[]>
    | OrClass<Ast[]>
    | MoreClass<[Ast]>
    | RepeatClass<[Ast]>
    | OptionalClass<[Ast]>
    | EmptyClass
    ;

export type Ast =
    | Terminal
    | And<Ast[]>
    | Or<Ast[]>
    | More<[Ast]>
    | Repeat<[Ast]>
    | Optional<[Ast]>
    | Empty
    ;

type Rule =
    | SubRule<AstClass>
    | AndRule<Rule[]>
    | OrRule<Rule[]>
    | MoreRule<[Rule]>
    | RepeatRule<[Rule]>
    | OptionalRule<[Rule]>
    | EmptyRule
    ;


let isGenerateMode = false;
export function bnf<S extends string, M extends Record<string, AstClass>>(str: S, map: M): Bnf<S, { [K in keyof M]: InstanceType<M[K]> }> {
    if (isGenerateMode) {
        return [] as any;
    }
    throw new AstDefineError(getRule(str, map));
}

export type Bnf<S extends string, M extends Record<string, Ast>> =
    BnfTokensToAst<AstMap<ToTokens<S>, M>> extends infer T extends Exclude<Ast, Terminal>
    ? T["children"]
    : never;

const AstDefineErrorMessage = `
You should define a ast class in this way: 
class AstClassName {
    children = bnf("bnf string", { OtherAstClass });
}
`;

export class AstDefineError extends Error {
    constructor(public rule: Rule) {
        super(AstDefineErrorMessage);
        errorExtendHelper(new.target, this);
    }
}

function getRule(str: string, map: Record<string, AstClass>): Rule {
    const tokens = toTokens(str);
    const bnfTokens = astMap(tokens, map);
    return bnfTokensToRule(bnfTokens);
}

type BnfToken = string | Ast;
type Group = (BnfToken | Group)[];
type AstClassGroupItem = string | AstClass | AstClassGroup;
type AstClassGroup = AstClassGroupItem[];

type Spaces = " " | "\f" | "\n" | "\r" | "\t" | "\v";
type LeftTrim<S extends string> = S extends `${Spaces}${infer Rest}` ? LeftTrim<Rest> : S;
type RightTrim<S extends string> = S extends `${infer Rest}${Spaces}` ? RightTrim<Rest> : S;
type Trim<S extends string> = LeftTrim<RightTrim<S>>;
type ToTokens<S extends string> =
    Trim<S> extends `${infer Left}${Spaces}${infer Right}` ? [...ToTokens<Left>, ...ToTokens<Right>] :
    Trim<S> extends `${infer Left}${"|"}${infer Right}` ? [...ToTokens<Left>, "|", ...ToTokens<Right>] :
    Trim<S> extends `${infer Left}${"("}${infer Right}` ? [...ToTokens<Left>, "(", ...ToTokens<Right>] :
    Trim<S> extends `${infer Left}${")"}${infer Right}` ? [...ToTokens<Left>, ")", ...ToTokens<Right>] :
    Trim<S> extends `${infer Left}${"+"}${infer Right}` ? [...ToTokens<Left>, "+", ...ToTokens<Right>] :
    Trim<S> extends `${infer Left}${"*"}${infer Right}` ? [...ToTokens<Left>, "*", ...ToTokens<Right>] :
    Trim<S> extends `${infer Left}${"?"}${infer Right}` ? [...ToTokens<Left>, "?", ...ToTokens<Right>] :
    Trim<S> extends "" ? [] : [Trim<S>];
function toTokens(str: string): string[] {
    return str.split(/\s+|([\|\(\)\+\*\?])/).filter(it => it);
}

type AstMap<S extends string[], M extends Record<string, Ast>> = [...{ [I in keyof S]: M[S[I]] extends Ast ? M[S[I]] : S[I] }];
function astMap(bnfTokens: string[], map: Record<string, AstClass>): (string | AstClass)[] {
    return bnfTokens.map(it => map[it] ?? it);
}

type StackNode = { prev: StackNode | undefined, children: Group };
type BnfTokensToGroup<T extends BnfToken[], Current extends StackNode = { prev: undefined, children: [] }> =
    T extends [] ? Current["prev"] extends undefined ? Current["children"] : never :
    T extends ["(", ...infer Rest extends BnfToken[]] ? BnfTokensToGroup<Rest, { prev: Current, children: [] }> :
    T extends [")", ...infer Rest extends BnfToken[]] ? BnfTokensToGroup<Rest, { prev: Exclude<Current["prev"], undefined>["prev"], children: [...Exclude<Current["prev"], undefined>["children"], Current["children"]] }> :
    T extends [infer Head extends BnfToken, ...infer Rest extends BnfToken[]] ? BnfTokensToGroup<Rest, { prev: Current["prev"], children: [...Current["children"], Head] }> : never;
type Stack = { prev?: Stack, children: AstClassGroup };
function bnfTokensToGroup(bnfTokens: (string | AstClass)[]) {
    let stack: Stack = { children: [] };
    for (let token of bnfTokens) {
        if (token === "(") {
            stack = { prev: stack, children: [] };
        } else if (token === ")") {
            if (!stack.prev) throw new Error();
            stack.prev.children.push(stack.children);
            stack = stack.prev;
        } else {
            stack.children.push(token);
        }
    }
    if (stack.prev) throw new Error();
    return stack.children;
}

type BnfTokensToAst<T extends BnfToken[]> =
    GroupToAst<BnfTokensToGroup<T>> extends infer R extends Terminal
    ? And<[R]>
    : GroupToAst<BnfTokensToGroup<T>>;
function bnfTokensToRule(bnfTokens: (string | AstClass)[]): Rule {
    const group = bnfTokensToGroup(bnfTokens);
    const result = groupToRule(group);
    return result.type === "sub"
        ? { type: "and", children: [result] }
        : result;
}

type GroupToAst<G extends Group> =
    G extends [] ? Empty :
    IsOrGroup<G> extends true ? ToOr<G> : ToAnd<G>;
function groupToRule(group: AstClassGroup): Rule {
    if (group.length === 0) return { type: "empty" };
    return isOrGroup(group) ? toOr(group) : toAnd(group);
}

type IsOrGroup<G extends Group> = G extends [infer Head, ...infer Rest extends Group] ? Head extends "|" ? true : IsOrGroup<Rest> : false;
function isOrGroup(group: AstClassGroup) {
    return group.includes("|");
}

type ToOr<G extends Group> = Or<GroupArrToAst<SplitOrGroup<G>>>;
function toOr(group: AstClassGroup): Rule {
    return { type: "or", children: groupArrToRule(splitOrGroup(group)) };
}

type GroupArrToAst<T extends Group[]> =
    T extends [] ? [] :
    T extends [infer Head extends Group, ...infer Rest extends Group[]] ? [GroupToAst<Head>, ...GroupArrToAst<Rest>] : never;
function groupArrToRule(groupArr: AstClassGroup[]): Rule[] {
    return groupArr.map(group => groupToRule(group));
}

type ToAnd<G extends Group> =
    SplitAndGroup<G> extends [infer Only extends Ast]
    ? Only
    : And<SplitAndGroup<G>>;
function toAnd(group: AstClassGroup): Rule {
    const subGroups = splitAndGroup(group);
    return subGroups.length === 1
        ? subGroups[0]
        : { type: "and", children: subGroups };
}

type SplitOrGroup<G extends Group, Current extends StackNode = { prev: undefined, children: [] }> =
    G extends [] ? GetSplitResult<Current> :
    G extends ["|", ...infer Rest extends Group] ? SplitOrGroup<Rest, { prev: Current, children: [] }> :
    G extends [infer Head extends (string | Ast | Group), ...infer Rest extends Group] ? SplitOrGroup<Rest, { prev: Current["prev"], children: [...Current["children"], Head] }> :
    never;
function splitOrGroup(group: AstClassGroup): AstClassGroup[] {
    const result: AstClassGroup[] = [];
    let current: AstClassGroup = [];
    for (const item of group) {
        if (item === "|") {
            result.push(current);
            current = [];
        } else {
            current.push(item);
        }
    }
    result.push(current);
    return result;
}

type GetSplitResult<Current extends StackNode | undefined, Result extends Group[] = []> =
    Current extends undefined ? Result :
    Current extends StackNode ? GetSplitResult<Current["prev"], [Current["children"], ...Result]> :
    never;
type SplitAndGroup<G extends Group> =
    G extends [] ? [] :
    G extends [infer Head extends Ast, "+", ...infer Rest extends Group] ? [More<[Head]>, ...SplitAndGroup<Rest>] :
    G extends [infer Head extends Ast, "*", ...infer Rest extends Group] ? [Repeat<[Head]>, ...SplitAndGroup<Rest>] :
    G extends [infer Head extends Ast, "?", ...infer Rest extends Group] ? [Optional<[Head]>, ...SplitAndGroup<Rest>] :
    G extends [infer Head extends Ast, ...infer Rest extends Group] ? [Head, ...SplitAndGroup<Rest>] :
    G extends [infer Head extends Group, "+", ...infer Rest extends Group] ? [More<[GroupToAst<Head>]>, ...SplitAndGroup<Rest>] :
    G extends [infer Head extends Group, "*", ...infer Rest extends Group] ? [Repeat<[GroupToAst<Head>]>, ...SplitAndGroup<Rest>] :
    G extends [infer Head extends Group, "?", ...infer Rest extends Group] ? [Optional<[GroupToAst<Head>]>, ...SplitAndGroup<Rest>] :
    G extends [infer Head extends Group, ...infer Rest extends Group] ? [GroupToAst<Head>, ...SplitAndGroup<Rest>] :
    never;
function splitAndGroup(group: AstClassGroup): Rule[] {
    let result: Rule[] = [];
    for (const current of group) {
        if (isOperator(current)) {
            const last = result.pop();
            if (!last) throw new Error();
            result.push({ type: operatorTypeMap[current], children: [last] });
        } else {
            const sub = toSub(current);
            result.push(sub);
        }
    }
    return result;
}

const operatorTypeMap = {
    "+": "more",
    "*": "repeat",
    "?": "optional",
} as const;

function isOperator(item: AstClassGroupItem): item is keyof typeof operatorTypeMap {
    return (["+", "*", "?"] as AstClassGroup).includes(item);
}

function toSub(current: string | AstClassGroup | AstClass): Rule {
    if (typeof current === "string") throw new Error("todo");
    return Array.isArray(current)
        ? groupToRule(current)
        : { type: "sub", children: current };
}

class a {
    token = getToken("a");
}

class b {
    token = getToken("a");
}

type ddd = ToTokens<"a b | (a)+ | ((a | b)+)+ | b? | ">
class c {
    test() {
        this.children
    }

    children = bnf("a b | (a)+ | ((a | b)+)+ | b? | ", { a: a, b: b });
}

try {
    new c();
} catch (e: any) {
    e.rule
    debugger;
}