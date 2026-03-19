/**
 * Safe Rule Engine — NO eval() used
 * Supports: ==, !=, <, >, <=, >=, &&, ||, contains(), startsWith(), endsWith(), DEFAULT
 */

// Token types
const TT = {
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  IDENTIFIER: 'IDENTIFIER',
  OP: 'OP',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  AND: 'AND',
  OR: 'OR',
  EOF: 'EOF',
};

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) { i++; continue; }

    // Number
    if (/[0-9]/.test(expr[i]) || (expr[i] === '-' && /[0-9]/.test(expr[i + 1]))) {
      let num = '';
      if (expr[i] === '-') { num += '-'; i++; }
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i++]; }
      tokens.push({ type: TT.NUMBER, value: parseFloat(num) });
      continue;
    }

    // String single or double quoted
    if (expr[i] === '"' || expr[i] === "'") {
      const q = expr[i++];
      let str = '';
      while (i < expr.length && expr[i] !== q) { str += expr[i++]; }
      i++; // closing quote
      tokens.push({ type: TT.STRING, value: str });
      continue;
    }

    // Two-char operators
    if (i + 1 < expr.length) {
      const two = expr.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
        if (two === '&&') tokens.push({ type: TT.AND });
        else if (two === '||') tokens.push({ type: TT.OR });
        else tokens.push({ type: TT.OP, value: two });
        i += 2;
        continue;
      }
    }

    // Single-char operators
    if (['<', '>'].includes(expr[i])) {
      tokens.push({ type: TT.OP, value: expr[i++] });
      continue;
    }

    if (expr[i] === '(') { tokens.push({ type: TT.LPAREN }); i++; continue; }
    if (expr[i] === ')') { tokens.push({ type: TT.RPAREN }); i++; continue; }
    if (expr[i] === ',') { tokens.push({ type: TT.COMMA }); i++; continue; }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(expr[i])) {
      let id = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { id += expr[i++]; }
      if (id === 'true') tokens.push({ type: TT.BOOLEAN, value: true });
      else if (id === 'false') tokens.push({ type: TT.BOOLEAN, value: false });
      else tokens.push({ type: TT.IDENTIFIER, value: id });
      continue;
    }

    throw new Error(`Unexpected character: '${expr[i]}' at position ${i}`);
  }
  tokens.push({ type: TT.EOF });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }

  expect(type) {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type}`);
    return t;
  }

  parse() {
    const node = this.parseOr();
    if (this.peek().type !== TT.EOF) throw new Error('Unexpected token after expression');
    return node;
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.peek().type === TT.OR) {
      this.consume();
      const right = this.parseAnd();
      left = { type: 'OR', left, right };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseComparison();
    while (this.peek().type === TT.AND) {
      this.consume();
      const right = this.parseComparison();
      left = { type: 'AND', left, right };
    }
    return left;
  }

  parseComparison() {
    const t = this.peek();

    // Function calls: contains(), startsWith(), endsWith()
    if (t.type === TT.IDENTIFIER && ['contains', 'startsWith', 'endsWith'].includes(t.value)) {
      const fn = this.consume().value;
      this.expect(TT.LPAREN);
      const field = this.expect(TT.IDENTIFIER).value;
      this.expect(TT.COMMA);
      const val = this.consume(); // string token
      this.expect(TT.RPAREN);
      return { type: 'FUNC', fn, field, value: val.value };
    }

    // Grouped expression
    if (t.type === TT.LPAREN) {
      this.consume();
      const node = this.parseOr();
      this.expect(TT.RPAREN);
      return node;
    }

    // Identifier op value
    const left = this.parsePrimary();
    if (this.peek().type === TT.OP) {
      const op = this.consume().value;
      const right = this.parsePrimary();
      return { type: 'CMP', op, left, right };
    }

    // Boolean identifier alone (e.g. `is_active`)
    return left;
  }

  parsePrimary() {
    const t = this.peek();
    if (t.type === TT.NUMBER) { this.consume(); return { type: 'LITERAL', value: t.value }; }
    if (t.type === TT.STRING) { this.consume(); return { type: 'LITERAL', value: t.value }; }
    if (t.type === TT.BOOLEAN) { this.consume(); return { type: 'LITERAL', value: t.value }; }
    if (t.type === TT.IDENTIFIER) { this.consume(); return { type: 'VAR', name: t.value }; }
    throw new Error(`Unexpected token type ${t.type}`);
  }
}

function evaluate(node, data) {
  if (!node) throw new Error('Null node');

  switch (node.type) {
    case 'LITERAL': return node.value;
    case 'VAR': return data[node.name] !== undefined ? data[node.name] : null;
    case 'CMP': {
      const l = evaluate(node.left, data);
      const r = evaluate(node.right, data);
      switch (node.op) {
        case '==': return l == r; // loose equality intentional for type coercion
        case '!=': return l != r;
        case '<':  return Number(l) < Number(r);
        case '>':  return Number(l) > Number(r);
        case '<=': return Number(l) <= Number(r);
        case '>=': return Number(l) >= Number(r);
        default: throw new Error(`Unknown operator: ${node.op}`);
      }
    }
    case 'AND': return evaluate(node.left, data) && evaluate(node.right, data);
    case 'OR':  return evaluate(node.left, data) || evaluate(node.right, data);
    case 'FUNC': {
      const fieldVal = String(data[node.field] || '');
      const cmpVal   = String(node.value);
      switch (node.fn) {
        case 'contains':    return fieldVal.includes(cmpVal);
        case 'startsWith':  return fieldVal.startsWith(cmpVal);
        case 'endsWith':    return fieldVal.endsWith(cmpVal);
        default: throw new Error(`Unknown function: ${node.fn}`);
      }
    }
    default: throw new Error(`Unknown node type: ${node.type}`);
  }
}

/**
 * evaluateCondition — main export
 * @param {string} condition - rule condition string
 * @param {object} data - execution data object
 * @returns {{ result: boolean, error: string|null }}
 */
function evaluateCondition(condition, data) {
  if (!condition || condition.trim().toUpperCase() === 'DEFAULT') {
    return { result: true, error: null };
  }

  try {
    const tokens = tokenize(condition);
    const ast = new Parser(tokens).parse();
    const result = evaluate(ast, data);
    return { result: Boolean(result), error: null };
  } catch (err) {
    return { result: false, error: err.message };
  }
}

/**
 * evaluateRules — evaluate ordered rules, return selected rule
 * @param {Array} rules - ordered by priority (ascending)
 * @param {object} data - execution data
 * @returns {{ selectedRule, evaluatedRules, error }}
 */
function evaluateRules(rules, data) {
  const evaluatedRules = [];
  let defaultRule = null;
  let selectedRule = null;
  let engineError = null;

  for (const rule of rules) {
    if (rule.condition.trim().toUpperCase() === 'DEFAULT') {
      defaultRule = rule;
      evaluatedRules.push({ rule: rule.condition, result: false, isDefault: true });
      continue;
    }

    const { result, error } = evaluateCondition(rule.condition, data);

    if (error) {
      engineError = `Rule evaluation error: ${error}`;
      evaluatedRules.push({ rule: rule.condition, result: false, error });
      continue;
    }

    evaluatedRules.push({ rule: rule.condition, result });

    if (result && !selectedRule) {
      selectedRule = rule;
    }
  }

  // If no rule matched, use DEFAULT
  if (!selectedRule && defaultRule) {
    selectedRule = defaultRule;
    // Mark default as matched in evaluated rules
    const di = evaluatedRules.findIndex(r => r.isDefault);
    if (di !== -1) evaluatedRules[di].result = true;
  }

  return { selectedRule, evaluatedRules, error: engineError };
}

module.exports = { evaluateCondition, evaluateRules };
