/**
 * Tiny safe expression evaluator used by the `formula` property type.
 *
 * Implements a hand-written Pratt parser over a fixed grammar so we never
 * touch `eval` / `Function` constructors. The grammar supports:
 *
 *   – numeric, string, boolean and `null` literals,
 *   – identifiers used as built-in function names,
 *   – `prop("key")` to read another property's value,
 *   – binary `+ - * / %` and unary `+ -`,
 *   – comparisons `== != < <= > >=`,
 *   – logical `&& || !` and ternary `cond ? a : b`,
 *   – grouping with parentheses,
 *   – built-ins: abs, round, floor, ceil, min, max, length, concat, if,
 *     lower, upper, coalesce.
 *
 * The evaluator is **deterministic** and **side-effect free**: it only
 * reads from the `propResolver` callback supplied by the caller.
 */

type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'null'; value: null }
  | { type: 'ident'; value: string }
  | { type: 'sym'; value: string };

const SYMBOLS = [
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '(',
  ')',
  ',',
  '?',
  ':',
  '!',
];

/** Tokenise an expression source string. */
function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === undefined) break;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let out = '';
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < src.length) {
          out += src[j + 1];
          j += 2;
        } else {
          out += src[j];
          j += 1;
        }
      }
      if (src[j] !== quote) throw new Error('Unterminated string literal');
      tokens.push({ type: 'str', value: out });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j] ?? '')) j += 1;
      const lit = src.slice(i, j);
      const n = Number(lit);
      if (!Number.isFinite(n)) throw new Error(`Invalid number: ${lit}`);
      tokens.push({ type: 'num', value: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j] ?? '')) j += 1;
      const word = src.slice(i, j);
      if (word === 'true') tokens.push({ type: 'bool', value: true });
      else if (word === 'false') tokens.push({ type: 'bool', value: false });
      else if (word === 'null') tokens.push({ type: 'null', value: null });
      else tokens.push({ type: 'ident', value: word });
      i = j;
      continue;
    }
    const sym = SYMBOLS.find((s) => src.startsWith(s, i));
    if (sym) {
      tokens.push({ type: 'sym', value: sym });
      i += sym.length;
      continue;
    }
    throw new Error(`Unexpected character: ${c}`);
  }
  return tokens;
}

/** Result type the evaluator may produce. */
export type FormulaResult = number | string | boolean | null;

const BUILTINS: Record<string, (args: FormulaResult[]) => FormulaResult> = {
  abs: (a) => coerceNumber(a[0]) !== null ? Math.abs(coerceNumber(a[0])!) : null,
  round: (a) => {
    const n = coerceNumber(a[0]);
    if (n === null) return null;
    const d = coerceNumber(a[1]) ?? 0;
    const factor = 10 ** d;
    return Math.round(n * factor) / factor;
  },
  floor: (a) => (coerceNumber(a[0]) !== null ? Math.floor(coerceNumber(a[0])!) : null),
  ceil: (a) => (coerceNumber(a[0]) !== null ? Math.ceil(coerceNumber(a[0])!) : null),
  min: (a) => {
    const ns = a.map(coerceNumber).filter((n): n is number => n !== null);
    return ns.length ? Math.min(...ns) : null;
  },
  max: (a) => {
    const ns = a.map(coerceNumber).filter((n): n is number => n !== null);
    return ns.length ? Math.max(...ns) : null;
  },
  length: (a) => (typeof a[0] === 'string' ? a[0].length : null),
  concat: (a) => a.map((v) => (v == null ? '' : String(v))).join(''),
  if: (a) => (truthy(a[0]) ? a[1] ?? null : a[2] ?? null),
  lower: (a) => (typeof a[0] === 'string' ? a[0].toLowerCase() : null),
  upper: (a) => (typeof a[0] === 'string' ? a[0].toUpperCase() : null),
  coalesce: (a) => a.find((v) => v !== null && v !== undefined && v !== '') ?? null,
};

function coerceNumber(v: FormulaResult | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

function truthy(v: FormulaResult | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.length > 0;
  if (typeof v === 'number') return v !== 0;
  return Boolean(v);
}

/**
 * Compile + evaluate a formula expression. Resolves identifier-style calls
 * to built-ins and `prop("key")` lookups via the supplied resolver.
 *
 * @param src - Expression source text (user input).
 * @param propResolver - Returns the current value of a property by `key`.
 *   Should return `null` for missing / empty values.
 * @returns Evaluation result (`number | string | boolean | null`).
 * @throws Error with a human-readable message on parse / type errors.
 */
export function evaluateFormula(
  src: string,
  propResolver: (key: string) => FormulaResult,
): FormulaResult {
  const tokens = tokenize(src);
  let pos = 0;

  function peek(offset = 0): Token | undefined {
    return tokens[pos + offset];
  }
  function consume(): Token {
    const t = tokens[pos];
    if (!t) throw new Error('Unexpected end of expression');
    pos += 1;
    return t;
  }
  function expectSym(sym: string): void {
    const t = consume();
    if (t.type !== 'sym' || t.value !== sym) {
      throw new Error(`Expected '${sym}'`);
    }
  }

  // Pratt-style precedence ladder.
  function parseExpr(): FormulaResult {
    return parseTernary();
  }
  function parseTernary(): FormulaResult {
    const cond = parseOr();
    const t = peek();
    if (t && t.type === 'sym' && t.value === '?') {
      consume();
      const a = parseExpr();
      expectSym(':');
      const b = parseExpr();
      return truthy(cond) ? a : b;
    }
    return cond;
  }
  function parseOr(): FormulaResult {
    let lhs = parseAnd();
    while (peek()?.type === 'sym' && peek()?.value === '||') {
      consume();
      const rhs = parseAnd();
      lhs = truthy(lhs) ? lhs : rhs;
    }
    return lhs;
  }
  function parseAnd(): FormulaResult {
    let lhs = parseEquality();
    while (peek()?.type === 'sym' && peek()?.value === '&&') {
      consume();
      const rhs = parseEquality();
      lhs = truthy(lhs) ? rhs : lhs;
    }
    return lhs;
  }
  function parseEquality(): FormulaResult {
    let lhs = parseComparison();
    while (peek()?.type === 'sym' && (peek()?.value === '==' || peek()?.value === '!=')) {
      const op = consume().value as '==' | '!=';
      const rhs = parseComparison();
      lhs = op === '==' ? lhs === rhs : lhs !== rhs;
    }
    return lhs;
  }
  function parseComparison(): FormulaResult {
    let lhs = parseAdditive();
    while (
      peek()?.type === 'sym' &&
      (['<', '<=', '>', '>='] as const).includes(
        (peek()?.value as '<' | '<=' | '>' | '>=' | undefined) ?? ('?' as never),
      )
    ) {
      const op = consume().value as '<' | '<=' | '>' | '>=';
      const rhs = parseAdditive();
      const a = coerceNumber(lhs) ?? 0;
      const b = coerceNumber(rhs) ?? 0;
      lhs =
        op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
    }
    return lhs;
  }
  function parseAdditive(): FormulaResult {
    let lhs = parseMultiplicative();
    while (peek()?.type === 'sym' && (peek()?.value === '+' || peek()?.value === '-')) {
      const op = consume().value as '+' | '-';
      const rhs = parseMultiplicative();
      if (op === '+') {
        if (typeof lhs === 'string' || typeof rhs === 'string') {
          lhs = `${lhs ?? ''}${rhs ?? ''}`;
        } else {
          lhs = (coerceNumber(lhs) ?? 0) + (coerceNumber(rhs) ?? 0);
        }
      } else {
        lhs = (coerceNumber(lhs) ?? 0) - (coerceNumber(rhs) ?? 0);
      }
    }
    return lhs;
  }
  function parseMultiplicative(): FormulaResult {
    let lhs = parseUnary();
    while (
      peek()?.type === 'sym' &&
      (peek()?.value === '*' || peek()?.value === '/' || peek()?.value === '%')
    ) {
      const op = consume().value as '*' | '/' | '%';
      const rhs = parseUnary();
      const a = coerceNumber(lhs) ?? 0;
      const b = coerceNumber(rhs) ?? 0;
      lhs =
        op === '*' ? a * b : op === '/' ? (b === 0 ? null : a / b) : a % b;
    }
    return lhs;
  }
  function parseUnary(): FormulaResult {
    const t = peek();
    if (t && t.type === 'sym' && (t.value === '-' || t.value === '+' || t.value === '!')) {
      const op = consume().value;
      const v = parseUnary();
      if (op === '!') return !truthy(v);
      const n = coerceNumber(v) ?? 0;
      return op === '-' ? -n : n;
    }
    return parsePrimary();
  }
  function parsePrimary(): FormulaResult {
    const t = consume();
    if (t.type === 'num') return t.value;
    if (t.type === 'str') return t.value;
    if (t.type === 'bool') return t.value;
    if (t.type === 'null') return null;
    if (t.type === 'sym' && t.value === '(') {
      const v = parseExpr();
      expectSym(')');
      return v;
    }
    if (t.type === 'ident') {
      // Function calls: `name(arg, …)`.
      const next = peek();
      if (next && next.type === 'sym' && next.value === '(') {
        consume();
        const args: FormulaResult[] = [];
        if (!(peek()?.type === 'sym' && peek()?.value === ')')) {
          args.push(parseExpr());
          while (peek()?.type === 'sym' && peek()?.value === ',') {
            consume();
            args.push(parseExpr());
          }
        }
        expectSym(')');
        if (t.value === 'prop') {
          const key = args[0];
          if (typeof key !== 'string') throw new Error('prop() expects a string key');
          return propResolver(key);
        }
        const fn = BUILTINS[t.value];
        if (!fn) throw new Error(`Unknown function: ${t.value}`);
        return fn(args);
      }
      // Bare identifiers without `()` are interpreted as property keys.
      return propResolver(t.value);
    }
    throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
  }

  if (tokens.length === 0) return null;
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('Trailing tokens after expression');
  return result;
}
