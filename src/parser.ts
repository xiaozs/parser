import { Terminal, TerminalClass, getToken } from "./lexer";
import { errorExtendHelper } from "./utils";

export type AndChildren<T extends Ast[]> = [...T];
export type OrChildren<T extends Ast[]> = { [K in keyof T]: T[K] | undefined };
export type MoreChildren<T extends [Ast]> = T[0][];
export type RepeatChildren<T extends [Ast]> = T[0][];
export type OptionalChildren<T extends [Ast]> = (T[0] | undefined);

export type And<T extends Ast[]> = { children: AndChildren<T>; };
export type Or<T extends Ast[]> = { children: OrChildren<T>; };
export type More<T extends [Ast]> = { children: MoreChildren<T>; };
export type Repeat<T extends [Ast]> = { children: RepeatChildren<T>; };
export type Optional<T extends [Ast]> = { children: OptionalChildren<T>; };
export type Empty = { children: []; };

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

export type Bnf<S extends string[], A extends Ast[]> = BnfTokensToAst<ToBnfTokens<Zip<S, A>>>["children"];

/* delete start */
type AstMap<S extends string[], M extends Record<string, Ast>> = [...{ [I in keyof S]: M[S[I]] extends Ast ? M[S[I]] : S[I] }];
export type _Bnf<S extends string, M extends Record<string, Ast>> = BnfTokensToAst<AstMap<ToTokens<S>, M>>["children"];
/* delete end */

export class AstDefineError extends Error {
    constructor(public rule: Rule) {
        super(`You should define a ast class in this way: 
class AstClassName {
    children = bnf\`bnf string\`;
}`);
        errorExtendHelper(new.target, this);
    }
}

export function bnf<S extends string[], A extends AstClass[]>(strArr: [...S], astArr: [...A]): Bnf<S, { [K in keyof A]: InstanceType<A[K]> }> {
    if (isGenerateMode) {
        return [];
    }
    throw new AstDefineError(getRule(strArr, astArr));
}

export function _bnf<S extends string, M extends Record<string, AstClass>>(str: S, map: M): _Bnf<S, { [K in keyof M]: InstanceType<M[K]> }> {
    if (isGenerateMode) {
        return [];
    }
    throw new AstDefineError(getRule(str, map));
}
let isGenerateMode = false;

type SubRule<T extends AstClass> = { type: "sub", children: T };
type AndRule<T extends Rule[]> = { type: "and", children: T };
type OrRule<T extends Rule[]> = { type: "or", children: T };
type MoreRule<T extends [Rule]> = { type: "more", children: T };
type RepeatRule<T extends [Rule]> = { type: "repeat", children: T };
type OptionalRule<T extends [Rule]> = { type: "optional", children: T };
type EmptyRule = { type: "empty" };

type Rule =
    | SubRule<AstClass>
    | AndRule<Rule[]>
    | OrRule<Rule[]>
    | MoreRule<[Rule]>
    | RepeatRule<[Rule]>
    | OptionalRule<[Rule]>
    | EmptyRule
    ;

function getRule(strArr: string[], astArr: AstClass[]): Rule;
function getRule(str: string, map: Record<string, AstClass>): Rule;
function getRule(strOrStrArr: string[] | string, astArrOrMap: AstClass[] | Record<string, AstClass>): Rule {
    if (Array.isArray(strOrStrArr)) {
        const strArr = strOrStrArr;
        const astArr = astArrOrMap as AstClass[];

        const zipArr = zip(strArr, astArr);
        const bnfTokens = toBnfTokens(zipArr);
        return bnfTokensToRule(bnfTokens);
    } else {
        const str = strOrStrArr;
        const map = astArrOrMap as Record<string, AstClass>;

        const tokens = toTokens(str);
        const bnfTokens = astMap(tokens, map);
        return bnfTokensToRule(bnfTokens);
    }
}

function zip(strArr: string[], astArr: AstClass[]) {
    const result: (string | AstClass)[] = [];
    const min = Math.min(strArr.length, astArr.length);
    for (let i = 0; i < min; i++) {
        result.push(strArr[i], astArr[i]);
    }
    result.push(...strArr.slice(min), ...astArr.slice(min));
    return result;
}

function toBnfTokens(arr: (string | AstClass)[]) {
    const result: (string | AstClass)[] = [];
    for (const item of arr) {
        if (typeof item === "string") {
            result.push(...toTokens(item));
        } else {
            result.push(item);
        }
    }
    return result;
}

function toTokens(str: string): string[] {
    return str.split(/\s+|([\|\(\)\+\*\?])/).filter(it => it);
}

function bnfTokensToRule(bnfTokens: (string | AstClass)[]): Rule {
    const group = bnfTokensToGroup(bnfTokens);
    return groupToRule(group);
}

type Stack = { prev?: Stack, children: AstClassGroup }
type AstClassGroup = (string | AstClass | AstClassGroup)[];
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

function groupToRule(group: AstClassGroup): Rule {
    if (group.length === 0) return { type: "empty" };
    return isOrGroup(group) ? toOr(group) : toAnd(group);
}

function isOrGroup(group: AstClassGroup) {
    return group.includes("|");
}

function toOr(group: AstClassGroup): Rule {
    return {
        type: "or",
        children: groupArrToRule(splitOrGroup(group)),
    };
}

function toAnd(group: AstClassGroup): Rule {
    return {
        type: "and",
        children: splitAndGroup(group),
    }
}

function groupArrToRule(groupArr: AstClassGroup[]): Rule[] {
    return groupArr.map(group => groupToRule(group));
}

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

function splitAndGroup(group: AstClassGroup): Rule[] {
    let result: Rule[] = [];
    for (let i = 0; i < group.length; i++) {
        const current = group[i];
        const sub: Rule = Array.isArray(current)
            ? groupToRule(current)
            : { type: "sub", children: current as AstClass };
        const next = group[i + 1];
        switch (next) {
            case "+":
                result.push({ type: "more", children: [sub] });
                i++;
                continue;
            case "*":
                result.push({ type: "repeat", children: [sub] });
                i++;
                continue;
            case "?":
                result.push({ type: "optional", children: [sub] });
                i++;
                continue;
            default:
                result.push(sub);
        }
    }
    return result;
}

function astMap(bnfTokens: string[], map: Record<string, AstClass>): (string | AstClass)[] {
    return bnfTokens.map(it => map[it] ?? it);
}

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

type Zip<A extends any[], B extends any[]> =
    A extends [] ? B :
    B extends [] ? A :
    A extends [infer AHead, ...infer ARest] ? B extends [infer BHead, ...infer BRest] ? [AHead, BHead, ...Zip<ARest, BRest>] : never : never;

type ToBnfTokens<T extends any[]> =
    T extends [] ? [] :
    T extends [infer Head, ...infer Rest] ? Head extends string ? [...ToTokens<Head>, ...ToBnfTokens<Rest>] : [Head, ...ToBnfTokens<Rest>] : never;

type BnfToken = string | Ast;
type Group = (BnfToken | Group)[];

type StackNode = { prev: StackNode | undefined, children: Group };
type BnfTokensToGroup<T extends BnfToken[], Current extends StackNode = { prev: undefined, children: [] }> =
    T extends [] ? Current["prev"] extends undefined ? Current["children"] : never :
    T extends ["(", ...infer Rest extends BnfToken[]] ? BnfTokensToGroup<Rest, { prev: Current, children: [] }> :
    T extends [")", ...infer Rest extends BnfToken[]] ? BnfTokensToGroup<Rest, { prev: Exclude<Current["prev"], undefined>["prev"], children: [...Exclude<Current["prev"], undefined>["children"], Current["children"]] }> :
    T extends [infer Head extends BnfToken, ...infer Rest extends BnfToken[]] ? BnfTokensToGroup<Rest, { prev: Current["prev"], children: [...Current["children"], Head] }> : never;

type BnfTokensToAst<T extends BnfToken[]> = GroupToAst<BnfTokensToGroup<T>>;
type GroupToAst<G extends Group> =
    G extends [] ? Empty :
    IsOrGroup<G> extends true ? ToOr<G> : ToAnd<G>;
type IsOrGroup<G extends Group> = G extends [infer Head, ...infer Rest extends Group] ? Head extends "|" ? true : IsOrGroup<Rest> : false;

type ToOr<G extends Group> = Or<GroupArrToAst<SplitOrGroup<G>>>;
type ToAnd<G extends Group> = And<SplitAndGroup<G>>;

type GroupArrToAst<T extends Group[]> =
    T extends [] ? [] :
    T extends [infer Head extends Group, ...infer Rest extends Group[]] ? [GroupToAst<Head>, ...GroupArrToAst<Rest>] : never;

type SplitOrGroup<G extends Group, Current extends StackNode = { prev: undefined, children: [] }> =
    G extends [] ? GetSplitResult<Current> :
    G extends ["|", ...infer Rest extends Group] ? SplitOrGroup<Rest, { prev: Current, children: [] }> :
    G extends [infer Head extends (string | Ast | Group), ...infer Rest extends Group] ? SplitOrGroup<Rest, { prev: Current["prev"], children: [...Current["children"], Head] }> :
    never;
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

type FlatAst<A extends Ast> =
    A extends And<infer Sub extends Ast[]> ? Sub extends [infer Only extends Ast] ? FlatAst<Only> : And<FlatAstArr<Sub>> :
    A extends Or<infer Sub extends Ast[]> ? Or<FlatAstArr<Sub>> :
    A extends More<[infer Sub extends Ast]> ? More<[FlatAst<Sub>]> :
    A extends Repeat<[infer Sub extends Ast]> ? Repeat<[FlatAst<Sub>]> :
    A extends Optional<[infer Sub extends Ast]> ? Optional<[FlatAst<Sub>]> :
    A;
type FlatAstArr<Arr extends Ast[]> =
    Arr extends [] ? [] :
    Arr extends [infer Head extends Ast, ...infer Rest extends Ast[]] ? [FlatAst<Head>, ...FlatAstArr<Rest>] : never;

class a {
    token = getToken("a");
}

class b {
    token = getToken("a");
}

class c {
    test() {
        this.children[1]!.children.map(it => it)
    }

    children = _bnf("a b | (a)+ | ((a | b)+)+ | ", { a: a, b: b });
}

try {
    new c();
} catch (e) {
    debugger;
}