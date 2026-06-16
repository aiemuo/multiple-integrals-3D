"use strict";

const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow
};

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E
};

const KNOWN_IDENTIFIERS = [
  ...Object.keys(FUNCTIONS),
  ...Object.keys(CONSTANTS),
  "x",
  "y"
].sort((a, b) => b.length - a.length);

function splitKnownIdentifier(identifier) {
  if (KNOWN_IDENTIFIERS.includes(identifier)) return [identifier];

  const memo = new Map();
  function splitFrom(index) {
    if (index === identifier.length) return [];
    if (memo.has(index)) return memo.get(index);

    for (const name of KNOWN_IDENTIFIERS) {
      if (!identifier.startsWith(name, index)) continue;
      const remainder = splitFrom(index + name.length);
      if (remainder) {
        const result = [name, ...remainder];
        memo.set(index, result);
        return result;
      }
    }

    memo.set(index, null);
    return null;
  }

  return splitFrom(0) || [identifier];
}

function normalizeMathSource(source) {
  return source
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .normalize("NFKC")
    .replace(/[πΠ]/g, "pi")
    .replace(/[×⋅・·]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-");
}

function tokenize(source) {
  source = normalizeMathSource(source);
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const numberMatch = source.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      tokens.push({ type: "number", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    const idMatch = source.slice(index).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (idMatch) {
      const identifier = idMatch[0].toLowerCase();
      for (const name of splitKnownIdentifier(identifier)) {
        tokens.push({ type: "id", value: name });
      }
      index += idMatch[0].length;
      continue;
    }

    if ("+-*/^(),√".includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    throw new Error(`数式で使用できない文字があります: ${char}`);
  }

  const withMultiplication = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const current = tokens[i];
    const previous = withMultiplication[withMultiplication.length - 1];
    const leftValue = previous && (previous.type === "number" || previous.type === "id" || previous.type === ")");
    const rightValue = current.type === "number" || current.type === "id" || current.type === "(" || current.type === "√";
    const isFunctionCall = previous && previous.type === "id" && current.type === "(" && FUNCTIONS[previous.value];
    if (leftValue && rightValue && !isFunctionCall) {
      withMultiplication.push({ type: "*", value: "*" });
    }
    withMultiplication.push(current);
  }
  return withMultiplication;
}

function compileArithmetic(source) {
  if (!source.trim()) {
    throw new Error("数式が空です。");
  }

  const tokens = tokenize(source);
  let position = 0;

  function peek(type) {
    return tokens[position] && tokens[position].type === type;
  }

  function consume(type) {
    if (!peek(type)) {
      const found = tokens[position] ? tokens[position].value : "数式の終端";
      throw new Error(`${type} が必要ですが、${found} が見つかりました。`);
    }
    return tokens[position++];
  }

  function parsePrimary() {
    if (peek("√")) {
      consume("√");
      const operand = parseExpression(3);
      return (x, y) => Math.sqrt(operand(x, y));
    }

    if (peek("number")) {
      const value = consume("number").value;
      return () => value;
    }

    if (peek("id")) {
      const name = consume("id").value;
      if (peek("(")) {
        if (!FUNCTIONS[name]) {
          throw new Error(`未対応の関数です: ${name}`);
        }
        consume("(");
        const args = [];
        if (!peek(")")) {
          args.push(parseExpression(0));
          while (peek(",")) {
            consume(",");
            args.push(parseExpression(0));
          }
        }
        consume(")");
        return (x, y) => FUNCTIONS[name](...args.map((arg) => arg(x, y)));
      }

      if (name === "x") return (x) => x;
      if (name === "y") return (_x, y) => y;
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
        return () => CONSTANTS[name];
      }
      throw new Error(`使用できる変数は x, y です: ${name}`);
    }

    if (peek("(")) {
      consume("(");
      const expression = parseExpression(0);
      consume(")");
      return expression;
    }

    const found = tokens[position] ? tokens[position].value : "数式の終端";
    throw new Error(`数式を解釈できません: ${found}`);
  }

  function parseUnary() {
    if (peek("+")) {
      consume("+");
      return parseExpression(3);
    }
    if (peek("-")) {
      consume("-");
      const operand = parseExpression(3);
      return (x, y) => -operand(x, y);
    }
    return parsePrimary();
  }

  function parseExpression(minPrecedence) {
    let left = parseUnary();
    const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };

    while (position < tokens.length) {
      const operator = tokens[position].type;
      const currentPrecedence = precedence[operator];
      if (currentPrecedence === undefined || currentPrecedence < minPrecedence) break;
      position += 1;
      const nextMin = operator === "^" ? currentPrecedence : currentPrecedence + 1;
      const right = parseExpression(nextMin);
      const previousLeft = left;

      if (operator === "+") left = (x, y) => previousLeft(x, y) + right(x, y);
      if (operator === "-") left = (x, y) => previousLeft(x, y) - right(x, y);
      if (operator === "*") left = (x, y) => previousLeft(x, y) * right(x, y);
      if (operator === "/") left = (x, y) => previousLeft(x, y) / right(x, y);
      if (operator === "^") left = (x, y) => Math.pow(previousLeft(x, y), right(x, y));
    }
    return left;
  }

  const evaluator = parseExpression(0);
  if (position !== tokens.length) {
    throw new Error(`数式の末尾を解釈できません: ${tokens[position].value}`);
  }
  return evaluator;
}

function normalizeRegion(source) {
  let normalized = normalizeMathSource(source)
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≠/g, "!=")
    .replace(/∧/g, "&&")
    .replace(/∨/g, "||")
    .replace(/\band\b/gi, "&&")
    .replace(/\bor\b/gi, "||")
    .replace(/[；;]/g, "&&");

  let depth = 0;
  let result = "";
  for (const char of normalized) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    result += char === "," && depth === 0 ? "&&" : char;
  }
  return result;
}

function isWrapped(source) {
  if (!source.startsWith("(") || !source.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    if (source[i] === ")") depth -= 1;
    if (depth === 0 && i < source.length - 1) return false;
  }
  return depth === 0;
}

function findTopLevel(source, operators) {
  let depth = 0;
  for (let i = source.length - 1; i >= 0; i -= 1) {
    if (source[i] === ")") depth += 1;
    if (source[i] === "(") depth -= 1;
    if (depth !== 0) continue;
    for (const operator of operators) {
      const start = i - operator.length + 1;
      if (start >= 0 && source.slice(start, i + 1) === operator) {
        return { index: start, operator };
      }
    }
  }
  return null;
}

function splitTopLevelComparisons(source) {
  const expressions = [];
  const operators = [];
  let depth = 0;
  let segmentStart = 0;

  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "(") {
      depth += 1;
      continue;
    }
    if (source[i] === ")") {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;

    const twoCharacters = source.slice(i, i + 2);
    const operator = ["<=", ">=", "==", "!="].includes(twoCharacters)
      ? twoCharacters
      : ["<", ">"].includes(source[i]) ? source[i] : null;
    if (!operator) continue;

    expressions.push(source.slice(segmentStart, i).trim());
    operators.push(operator);
    i += operator.length - 1;
    segmentStart = i + 1;
  }

  if (!operators.length) return null;
  expressions.push(source.slice(segmentStart).trim());
  return { expressions, operators };
}

function compareValues(left, operator, right) {
  if (operator === "<=") return left <= right;
  if (operator === ">=") return left >= right;
  if (operator === "<") return left < right;
  if (operator === ">") return left > right;
  if (operator === "==") return Math.abs(left - right) < 1e-9;
  return Math.abs(left - right) >= 1e-9;
}

function compileRegion(source) {
  const normalized = normalizeRegion(source).trim();
  if (!normalized) {
    throw new Error("領域 D の条件が空です。");
  }

  function compileBoolean(part) {
    let expression = part.trim();
    while (isWrapped(expression)) expression = expression.slice(1, -1).trim();

    const orMatch = findTopLevel(expression, ["||"]);
    if (orMatch) {
      const left = compileBoolean(expression.slice(0, orMatch.index));
      const right = compileBoolean(expression.slice(orMatch.index + 2));
      return (x, y) => left(x, y) || right(x, y);
    }

    const andMatch = findTopLevel(expression, ["&&"]);
    if (andMatch) {
      const left = compileBoolean(expression.slice(0, andMatch.index));
      const right = compileBoolean(expression.slice(andMatch.index + 2));
      return (x, y) => left(x, y) && right(x, y);
    }

    if (expression.startsWith("!")) {
      const operand = compileBoolean(expression.slice(1));
      return (x, y) => !operand(x, y);
    }

    const comparison = splitTopLevelComparisons(expression);
    if (comparison) {
      if (comparison.expressions.some((part) => !part)) {
        throw new Error("不等式の比較対象が不足しています。");
      }
      const evaluators = comparison.expressions.map(compileArithmetic);
      return (x, y) => comparison.operators.every((operator, index) => (
        compareValues(evaluators[index](x, y), operator, evaluators[index + 1](x, y))
      ));
    }

    const arithmetic = compileArithmetic(expression);
    return (x, y) => Boolean(arithmetic(x, y));
  }

  return compileBoolean(normalized);
}

const elements = {
  canvas: document.getElementById("graph-canvas"),
  canvasWrap: document.getElementById("canvas-wrap"),
  form: document.getElementById("graph-form"),
  functionInput: document.getElementById("function-input"),
  regionInput: document.getElementById("region-input"),
  xMin: document.getElementById("x-min"),
  xMax: document.getElementById("x-max"),
  yMin: document.getElementById("y-min"),
  yMax: document.getElementById("y-max"),
  integrateButton: document.getElementById("integrate-button"),
  resetView: document.getElementById("reset-view"),
  error: document.getElementById("error-message"),
  resultStatus: document.getElementById("result-status"),
  resultExpression: document.getElementById("result-expression"),
  integralResult: document.getElementById("integral-result"),
  areaResult: document.getElementById("area-result"),
  absoluteResult: document.getElementById("absolute-result"),
  methodResult: document.getElementById("method-result"),
  volumeLegend: document.getElementById("volume-legend")
};

const context = elements.canvas.getContext("2d");
const state = {
  evaluator: null,
  region: null,
  bounds: null,
  samples: null,
  zLimit: 1,
  mode: "surface",
  yaw: -0.72,
  pitch: 0.58,
  zoom: 1,
  dragStart: null
};

function readInputs() {
  const bounds = {
    xMin: Number(elements.xMin.value),
    xMax: Number(elements.xMax.value),
    yMin: Number(elements.yMin.value),
    yMax: Number(elements.yMax.value)
  };

  if (Object.values(bounds).some((value) => !Number.isFinite(value))) {
    throw new Error("表示範囲には有限の数値を入力してください。");
  }
  if (bounds.xMin >= bounds.xMax || bounds.yMin >= bounds.yMax) {
    throw new Error("表示範囲は min < max となるように指定してください。");
  }

  const functionSource = elements.functionInput.value.trim();
  const regionSource = elements.regionInput.value.trim();
  const evaluator = functionSource ? compileArithmetic(functionSource) : null;
  const region = regionSource ? compileRegion(regionSource) : null;
  return { bounds, evaluator, region };
}

function evaluateSafe(evaluator, x, y) {
  const value = evaluator(x, y);
  return Number.isFinite(value) && Math.abs(value) < 1e8 ? value : null;
}

function buildSamples(evaluator, region, bounds, count = 40) {
  const samples = [];
  const finiteValues = [];
  for (let row = 0; row <= count; row += 1) {
    const y = bounds.yMin + (bounds.yMax - bounds.yMin) * row / count;
    const sampleRow = [];
    for (let column = 0; column <= count; column += 1) {
      const x = bounds.xMin + (bounds.xMax - bounds.xMin) * column / count;
      const z = evaluator ? evaluateSafe(evaluator, x, y) : null;
      if (z !== null) finiteValues.push(Math.abs(z));
      sampleRow.push({ x, y, z, inside: region ? Boolean(region(x, y)) : false });
    }
    samples.push(sampleRow);
  }

  finiteValues.sort((a, b) => a - b);
  const percentile = finiteValues.length ? finiteValues[Math.floor(finiteValues.length * 0.96)] : 1;
  return { samples, zLimit: Math.max(percentile || 1, 0.001) };
}

function updateGraph(mode) {
  try {
    const { bounds, evaluator, region } = readInputs();
    const sampled = buildSamples(evaluator, region, bounds);
    state.bounds = bounds;
    state.evaluator = evaluator;
    state.region = region;
    state.samples = sampled.samples;
    state.zLimit = sampled.zLimit;
    state.mode = mode;
    elements.error.textContent = "";
    elements.resultExpression.textContent = evaluator
      ? `(${elements.functionInput.value}) dx dy`
      : "F(x,y) 未入力";
    elements.volumeLegend.classList.toggle("active", mode === "integral");
    if (mode === "surface") {
      if (evaluator && region) elements.resultStatus.textContent = "関数と領域 D を表示中";
      else if (evaluator) elements.resultStatus.textContent = "F(x,y) を表示中";
      else if (region) elements.resultStatus.textContent = "領域 D を表示中";
      else elements.resultStatus.textContent = "入力を待機中";
      elements.integralResult.textContent = "—";
      elements.areaResult.textContent = "—";
      elements.absoluteResult.textContent = "—";
    }
    draw();
    return true;
  } catch (error) {
    elements.error.textContent = error.message;
    return false;
  }
}

function numericalIntegral() {
  const divisions = 180;
  const { xMin, xMax, yMin, yMax } = state.bounds;
  const dx = (xMax - xMin) / divisions;
  const dy = (yMax - yMin) / divisions;
  let integral = 0;
  let absolute = 0;
  let area = 0;
  let insideCount = 0;

  for (let row = 0; row < divisions; row += 1) {
    const y = yMin + (row + 0.5) * dy;
    for (let column = 0; column < divisions; column += 1) {
      const x = xMin + (column + 0.5) * dx;
      if (!state.region(x, y)) continue;
      const z = evaluateSafe(state.evaluator, x, y);
      if (z === null) continue;
      const cellArea = dx * dy;
      integral += z * cellArea;
      absolute += Math.abs(z) * cellArea;
      area += cellArea;
      insideCount += 1;
    }
  }

  if (!insideCount) {
    throw new Error("指定した表示範囲内に領域 D が見つかりません。");
  }
  return { integral, absolute, area, divisions };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "計算不能";
  const absolute = Math.abs(value);
  if ((absolute > 0 && absolute < 0.0001) || absolute >= 100000) {
    return value.toExponential(5);
  }
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 6 });
}

function runIntegral() {
  if (!elements.functionInput.value.trim()) {
    updateGraph("surface");
    elements.error.textContent = "重積分を実行するには F(x,y) を入力してください。";
    elements.resultStatus.textContent = "関数を入力してください";
    return;
  }
  if (!elements.regionInput.value.trim()) {
    updateGraph("surface");
    elements.error.textContent = "重積分を実行するには領域 D を入力してください。";
    elements.resultStatus.textContent = "領域を入力してください";
    return;
  }
  if (!updateGraph("integral")) return;
  try {
    const result = numericalIntegral();
    elements.resultStatus.textContent = "数値積分 完了";
    elements.integralResult.textContent = formatNumber(result.integral);
    elements.areaResult.textContent = formatNumber(result.area);
    elements.absoluteResult.textContent = formatNumber(result.absolute);
    elements.methodResult.textContent = `中点則 ${result.divisions}²`;
  } catch (error) {
    elements.error.textContent = error.message;
  }
}

function resizeCanvas() {
  const width = elements.canvasWrap.clientWidth;
  const height = elements.canvasWrap.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  elements.canvas.width = Math.max(1, Math.floor(width * dpr));
  elements.canvas.height = Math.max(1, Math.floor(height * dpr));
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function project(point, width, height) {
  const cosYaw = Math.cos(state.yaw);
  const sinYaw = Math.sin(state.yaw);
  const cosPitch = Math.cos(state.pitch);
  const sinPitch = Math.sin(state.pitch);
  const rotatedX = point.x * cosYaw - point.y * sinYaw;
  const rotatedY = point.x * sinYaw + point.y * cosYaw;
  const scale = Math.min(width, height) * 0.31 * state.zoom;
  return {
    x: width * 0.5 + rotatedX * scale,
    y: height * 0.55 + (rotatedY * sinPitch - point.z * cosPitch) * scale,
    depth: rotatedY * cosPitch + point.z * sinPitch
  };
}

function worldPoint(x, y, z) {
  const bounds = state.bounds;
  return {
    x: (x - (bounds.xMin + bounds.xMax) / 2) / ((bounds.xMax - bounds.xMin) / 2),
    y: (y - (bounds.yMin + bounds.yMax) / 2) / ((bounds.yMax - bounds.yMin) / 2),
    z: Math.max(-1.55, Math.min(1.55, z / state.zLimit)) * 0.82
  };
}

function colorForHeight(z, alpha = 0.82) {
  const normalized = Math.max(-1, Math.min(1, z / state.zLimit));
  if (normalized >= 0) {
    const amount = normalized;
    const r = Math.round(96 - amount * 55);
    const g = Math.round(154 - amount * 55);
    const b = Math.round(170 - amount * 45);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const amount = -normalized;
  const r = Math.round(111 + amount * 65);
  const g = Math.round(153 - amount * 62);
  const b = Math.round(164 - amount * 83);
  return `rgba(${r},${g},${b},${alpha})`;
}

function polygon(points, fill, stroke, lineWidth = 0.5) {
  return {
    points,
    fill,
    stroke,
    lineWidth,
    depth: points.reduce((sum, point) => sum + point.depth, 0) / points.length
  };
}

function addBasePlane(shapes, width, height) {
  const gridSteps = 8;
  for (let i = 0; i <= gridSteps; i += 1) {
    const coordinate = -1 + 2 * i / gridSteps;
    const horizontal = [project({ x: -1, y: coordinate, z: 0 }, width, height), project({ x: 1, y: coordinate, z: 0 }, width, height)];
    const vertical = [project({ x: coordinate, y: -1, z: 0 }, width, height), project({ x: coordinate, y: 1, z: 0 }, width, height)];
    shapes.push(polygon(horizontal, null, "rgba(21,36,43,0.15)", 0.7));
    shapes.push(polygon(vertical, null, "rgba(21,36,43,0.15)", 0.7));
  }
}

function addRegionBase(shapes, width, height) {
  if (!state.region) return;
  const divisions = 34;
  const { xMin, xMax, yMin, yMax } = state.bounds;
  const dx = (xMax - xMin) / divisions;
  const dy = (yMax - yMin) / divisions;
  for (let row = 0; row < divisions; row += 1) {
    for (let column = 0; column < divisions; column += 1) {
      const x0 = xMin + column * dx;
      const y0 = yMin + row * dy;
      if (!state.region(x0 + dx / 2, y0 + dy / 2)) continue;
      const points = [
        project(worldPoint(x0, y0, 0), width, height),
        project(worldPoint(x0 + dx, y0, 0), width, height),
        project(worldPoint(x0 + dx, y0 + dy, 0), width, height),
        project(worldPoint(x0, y0 + dy, 0), width, height)
      ];
      shapes.push(polygon(points, state.mode === "integral" ? "rgba(213,168,79,0.42)" : "rgba(213,168,79,0.68)", null));
    }
  }
}

function addSurface(shapes, width, height) {
  if (!state.evaluator) return;
  const samples = state.samples;
  for (let row = 0; row < samples.length - 1; row += 1) {
    for (let column = 0; column < samples[row].length - 1; column += 1) {
      const a = samples[row][column];
      const b = samples[row][column + 1];
      const c = samples[row + 1][column + 1];
      const d = samples[row + 1][column];
      if ([a, b, c, d].some((sample) => sample.z === null)) continue;
      const alpha = state.mode === "integral" ? 0.18 : 0.76;
      const stroke = state.mode === "integral" ? "rgba(29,89,112,0.08)" : "rgba(21,36,43,0.16)";
      const first = [a, b, c].map((sample) => project(worldPoint(sample.x, sample.y, sample.z), width, height));
      const second = [a, c, d].map((sample) => project(worldPoint(sample.x, sample.y, sample.z), width, height));
      shapes.push(polygon(first, colorForHeight((a.z + b.z + c.z) / 3, alpha), stroke));
      shapes.push(polygon(second, colorForHeight((a.z + c.z + d.z) / 3, alpha), stroke));
    }
  }
}

function addIntegralVolume(shapes, width, height) {
  if (state.mode !== "integral") return;
  const divisions = 30;
  const { xMin, xMax, yMin, yMax } = state.bounds;
  const dx = (xMax - xMin) / divisions;
  const dy = (yMax - yMin) / divisions;
  const inside = Array.from({ length: divisions }, () => Array(divisions).fill(false));

  for (let row = 0; row < divisions; row += 1) {
    for (let column = 0; column < divisions; column += 1) {
      const centerX = xMin + (column + 0.5) * dx;
      const centerY = yMin + (row + 0.5) * dy;
      inside[row][column] = state.region(centerX, centerY);
    }
  }

  for (let row = 0; row < divisions; row += 1) {
    for (let column = 0; column < divisions; column += 1) {
      if (!inside[row][column]) continue;
      const x0 = xMin + column * dx;
      const x1 = x0 + dx;
      const y0 = yMin + row * dy;
      const y1 = y0 + dy;
      const corners = [
        { x: x0, y: y0, z: evaluateSafe(state.evaluator, x0, y0) },
        { x: x1, y: y0, z: evaluateSafe(state.evaluator, x1, y0) },
        { x: x1, y: y1, z: evaluateSafe(state.evaluator, x1, y1) },
        { x: x0, y: y1, z: evaluateSafe(state.evaluator, x0, y1) }
      ];
      if (corners.some((corner) => corner.z === null)) continue;

      const topPoints = corners.map((corner) => project(worldPoint(corner.x, corner.y, corner.z), width, height));
      const averageZ = corners.reduce((sum, corner) => sum + corner.z, 0) / 4;
      shapes.push(polygon(topPoints, colorForHeight(averageZ, 0.92), "rgba(21,36,43,0.28)", 0.5));

      const boundaries = [
        { edge: [0, 1], outside: row === 0 || !inside[row - 1][column] },
        { edge: [1, 2], outside: column === divisions - 1 || !inside[row][column + 1] },
        { edge: [2, 3], outside: row === divisions - 1 || !inside[row + 1][column] },
        { edge: [3, 0], outside: column === 0 || !inside[row][column - 1] }
      ];

      for (const boundary of boundaries) {
        if (!boundary.outside) continue;
        const first = corners[boundary.edge[0]];
        const second = corners[boundary.edge[1]];
        const side = [
          project(worldPoint(first.x, first.y, 0), width, height),
          project(worldPoint(second.x, second.y, 0), width, height),
          project(worldPoint(second.x, second.y, second.z), width, height),
          project(worldPoint(first.x, first.y, first.z), width, height)
        ];
        const sideColor = averageZ >= 0 ? "rgba(196,95,60,0.66)" : "rgba(62,105,127,0.66)";
        shapes.push(polygon(side, sideColor, "rgba(21,36,43,0.34)", 0.7));
      }
    }
  }
}

function drawShape(shape) {
  if (!shape.points.length) return;
  context.beginPath();
  context.moveTo(shape.points[0].x, shape.points[0].y);
  for (let i = 1; i < shape.points.length; i += 1) {
    context.lineTo(shape.points[i].x, shape.points[i].y);
  }
  if (shape.points.length > 2) context.closePath();
  if (shape.fill) {
    context.fillStyle = shape.fill;
    context.fill();
  }
  if (shape.stroke) {
    context.strokeStyle = shape.stroke;
    context.lineWidth = shape.lineWidth;
    context.stroke();
  }
}

function drawAxes(width, height) {
  const axes = [
    { start: { x: -1.08, y: 0, z: 0 }, end: { x: 1.2, y: 0, z: 0 }, label: "x" },
    { start: { x: 0, y: -1.08, z: 0 }, end: { x: 0, y: 1.2, z: 0 }, label: "y" },
    { start: { x: 0, y: 0, z: -1.05 }, end: { x: 0, y: 0, z: 1.35 }, label: "z" }
  ];
  context.lineWidth = 1.25;
  context.strokeStyle = "rgba(21,36,43,0.78)";
  context.fillStyle = "#15242b";
  context.font = "italic 14px Georgia";
  for (const axis of axes) {
    const start = project(axis.start, width, height);
    const end = project(axis.end, width, height);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.fillText(axis.label, end.x + 5, end.y - 4);
  }
}

function draw() {
  if (!state.samples || !state.bounds) return;
  const rect = elements.canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  context.clearRect(0, 0, width, height);

  const shapes = [];
  addBasePlane(shapes, width, height);
  addRegionBase(shapes, width, height);
  addSurface(shapes, width, height);
  addIntegralVolume(shapes, width, height);
  shapes.sort((a, b) => a.depth - b.depth);
  shapes.forEach(drawShape);
  drawAxes(width, height);
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(liveUpdateTimer);
  updateGraph("surface");
});

elements.integrateButton.addEventListener("click", runIntegral);

let liveUpdateTimer = null;
const liveInputs = [
  elements.functionInput,
  elements.regionInput,
  elements.xMin,
  elements.xMax,
  elements.yMin,
  elements.yMax
];

liveInputs.forEach((input) => {
  input.addEventListener("input", () => {
    clearTimeout(liveUpdateTimer);
    liveUpdateTimer = setTimeout(() => updateGraph("surface"), 180);
  });
});

elements.resetView.addEventListener("click", () => {
  state.yaw = -0.72;
  state.pitch = 0.58;
  state.zoom = 1;
  draw();
});

elements.canvas.addEventListener("pointerdown", (event) => {
  state.dragStart = { x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch };
  elements.canvas.setPointerCapture(event.pointerId);
  elements.canvasWrap.classList.add("dragging");
});

elements.canvas.addEventListener("pointermove", (event) => {
  if (!state.dragStart) return;
  state.yaw = state.dragStart.yaw + (event.clientX - state.dragStart.x) * 0.009;
  state.pitch = Math.max(0.12, Math.min(1.35, state.dragStart.pitch - (event.clientY - state.dragStart.y) * 0.007));
  draw();
});

function endDrag() {
  state.dragStart = null;
  elements.canvasWrap.classList.remove("dragging");
}

elements.canvas.addEventListener("pointerup", endDrag);
elements.canvas.addEventListener("pointercancel", endDrag);
elements.canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.zoom = Math.max(0.55, Math.min(1.75, state.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
  draw();
}, { passive: false });

const exampleValues = {
  paraboloid: { fn: "4 - x^2 - y^2", region: "x^2 + y^2 <= 4", range: [-3, 3, -3, 3] },
  wave: { fn: "sin(x) * cos(y) + 1", region: "abs(x) <= pi && abs(y) <= pi/2", range: [-4, 4, -3, 3] },
  saddle: { fn: "x^2 - y^2", region: "x^2 + y^2 <= 4", range: [-3, 3, -3, 3] }
};

document.querySelectorAll("[data-example]").forEach((button) => {
  button.addEventListener("click", () => {
    const example = exampleValues[button.dataset.example];
    elements.functionInput.value = example.fn;
    elements.regionInput.value = example.region;
    [elements.xMin.value, elements.xMax.value, elements.yMin.value, elements.yMax.value] = example.range;
    updateGraph("surface");
  });
});

const resizeObserver = new ResizeObserver(resizeCanvas);
resizeObserver.observe(elements.canvasWrap);
updateGraph("surface");
