/**
 * Code parser for Code Constellation.
 * ===========================================================================
 * The point of this file is that the visualisation should mean something. The
 * previous version matched functions with
 *
 *     /function\s+(\w+)\s*\(([^)]*)\)\s*{([^}]*)}/
 *
 * whose body group stops at the *first* closing brace, so any function
 * containing a loop, a conditional or even an object literal had its body
 * truncated -- and every metric derived from that body was measuring a
 * fragment. Arrow functions, class methods, async functions and anything
 * nested were not matched at all.
 *
 * The approach here: blank out every string, template, comment and regex
 * literal first, preserving offsets and line breaks. What remains is source
 * whose braces, keywords and parentheses can be trusted, so brace matching
 * finds real function bodies and keyword counts cannot be inflated by prose
 * inside a comment. Offsets stay valid against the original text, so the real
 * source can still be sliced out for display.
 *
 * This is not a JavaScript parser and does not pretend to be one. It is a
 * scanner that is right about the constructs people actually paste in.
 */
(function (global) {
    'use strict';

    const KEYWORDS_BEFORE_REGEX = [
        'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
        'throw', 'case', 'do', 'else', 'yield', 'await'
    ];

    // Words that look like calls but are control flow.
    const NOT_CALLS = new Set([
        'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof',
        'instanceof', 'delete', 'void', 'throw', 'with', 'do', 'else', 'yield',
        'await', 'super', 'import', 'export', 'class', 'const', 'let', 'var'
    ]);

    /**
     * Replace the contents of strings, templates, comments and regex literals
     * with spaces. Same length as the input, newlines preserved, so every
     * offset still lines up with the original source.
     */
    function blankLiterals(src) {
        const out = new Array(src.length);
        for (let i = 0; i < src.length; i++) out[i] = src[i];

        const blank = function (from, to) {
            for (let i = from; i < to && i < src.length; i++) {
                if (src[i] !== '\n') out[i] = ' ';
            }
        };

        // Tracks `${` depth inside template literals so nested templates work.
        const templateStack = [];
        let i = 0;

        // True when a '/' at this position must start a regex rather than a
        // division: decided from the last meaningful character before it.
        const regexAllowed = function (pos) {
            let j = pos - 1;
            while (j >= 0 && /\s/.test(out[j])) j--;
            if (j < 0) return true;
            const ch = out[j];
            if ('(,=:[!&|?{};+-*%^<>~'.indexOf(ch) !== -1) return true;
            if (/[\w$)\]]/.test(ch)) {
                // Could still be `return /re/` and friends.
                let k = j;
                while (k >= 0 && /[\w$]/.test(out[k])) k--;
                const word = out.slice(k + 1, j + 1).join('');
                return KEYWORDS_BEFORE_REGEX.indexOf(word) !== -1;
            }
            return false;
        };

        while (i < src.length) {
            const c = src[i];
            const next = src[i + 1];

            if (c === '/' && next === '/') {
                const start = i;
                while (i < src.length && src[i] !== '\n') i++;
                blank(start, i);
                continue;
            }
            if (c === '/' && next === '*') {
                const start = i;
                i += 2;
                while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
                i = Math.min(src.length, i + 2);
                blank(start, i);
                continue;
            }
            if (c === '"' || c === "'") {
                const quote = c;
                const start = i;
                i++;
                while (i < src.length && src[i] !== quote) {
                    if (src[i] === '\\') i++;
                    if (src[i] === '\n') break;   // unterminated; bail out
                    i++;
                }
                i = Math.min(src.length, i + 1);
                blank(start + 1, i - 1);
                continue;
            }
            if (c === '`') {
                templateStack.push('template');
                const start = i;
                i++;
                while (i < src.length) {
                    if (src[i] === '\\') { i += 2; continue; }
                    if (src[i] === '`') { i++; break; }
                    if (src[i] === '$' && src[i + 1] === '{') {
                        // Blank the literal text so far, then let the scanner
                        // handle the interpolation as ordinary code.
                        blank(start + 1, i);
                        i += 2;
                        let depth = 1;
                        while (i < src.length && depth > 0) {
                            if (src[i] === '{') depth++;
                            else if (src[i] === '}') depth--;
                            if (depth === 0) break;
                            i++;
                        }
                        i++;
                        // Continue scanning the rest of this template.
                        const rest = i;
                        while (i < src.length && src[i] !== '`') {
                            if (src[i] === '\\') i++;
                            i++;
                        }
                        blank(rest, i);
                        i++;
                        break;
                    }
                    i++;
                }
                templateStack.pop();
                continue;
            }
            if (c === '/' && regexAllowed(i)) {
                const start = i;
                i++;
                let inClass = false;
                let closed = false;
                while (i < src.length) {
                    const ch = src[i];
                    if (ch === '\\') { i += 2; continue; }
                    if (ch === '\n') break;
                    if (ch === '[') inClass = true;
                    else if (ch === ']') inClass = false;
                    else if (ch === '/' && !inClass) { closed = true; i++; break; }
                    i++;
                }
                if (closed) {
                    while (i < src.length && /[a-z]/.test(src[i])) i++;  // flags
                    blank(start + 1, i - 1);
                } else {
                    i = start + 1;   // not a regex after all
                }
                continue;
            }
            i++;
        }

        return out.join('');
    }

    /** Index of the brace matching the `{` at `open`, or -1. */
    function matchBrace(clean, open) {
        let depth = 0;
        for (let i = open; i < clean.length; i++) {
            if (clean[i] === '{') depth++;
            else if (clean[i] === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    function lineOf(src, index) {
        let line = 1;
        for (let i = 0; i < index && i < src.length; i++) {
            if (src[i] === '\n') line++;
        }
        return line;
    }

    function countMatches(text, pattern) {
        const m = text.match(pattern);
        return m ? m.length : 0;
    }

    /**
     * Cyclomatic complexity: one, plus one per branch point. Counted on the
     * blanked source so a comment mentioning "if" or a string containing "&&"
     * cannot inflate it -- which the old version had no defence against.
     */
    function complexityOf(cleanBody) {
        return 1 +
            countMatches(cleanBody, /\bif\b/g) +
            countMatches(cleanBody, /\bfor\b/g) +
            countMatches(cleanBody, /\bwhile\b/g) +
            countMatches(cleanBody, /\bcase\b/g) +
            countMatches(cleanBody, /\bcatch\b/g) +
            countMatches(cleanBody, /&&/g) +
            countMatches(cleanBody, /\|\|/g) +
            countMatches(cleanBody, /\?\??[^.]/g);
    }

    /** Deepest brace nesting inside a body. */
    function maxDepthOf(cleanBody) {
        let depth = 0;
        let max = 0;
        for (let i = 0; i < cleanBody.length; i++) {
            if (cleanBody[i] === '{') { depth++; if (depth > max) max = depth; }
            else if (cleanBody[i] === '}') depth--;
        }
        return max;
    }

    function splitParams(raw) {
        if (!raw || !raw.trim()) return [];
        const params = [];
        let depth = 0;
        let current = '';
        for (let i = 0; i < raw.length; i++) {
            const c = raw[i];
            if ('([{'.indexOf(c) !== -1) depth++;
            else if (')]}'.indexOf(c) !== -1) depth--;
            if (c === ',' && depth === 0) { params.push(current.trim()); current = ''; continue; }
            current += c;
        }
        if (current.trim()) params.push(current.trim());
        return params.filter(Boolean);
    }

    /** Find the body span for a function whose parameter list ends at `from`. */
    function bodySpan(clean, from) {
        let i = from;
        while (i < clean.length && /\s/.test(clean[i])) i++;
        if (clean[i] === '{') {
            const end = matchBrace(clean, i);
            return end === -1 ? null : { start: i, end: end + 1, braced: true };
        }
        // Concise arrow body: run to the end of the statement at depth 0.
        let depth = 0;
        const start = i;
        while (i < clean.length) {
            const c = clean[i];
            if ('([{'.indexOf(c) !== -1) depth++;
            else if (')]}'.indexOf(c) !== -1) {
                if (depth === 0) break;
                depth--;
            } else if ((c === ';' || c === '\n') && depth === 0) break;
            i++;
        }
        return { start: start, end: i, braced: false };
    }

    /**
     * Extract every function-like construct.
     * Nested functions are kept; `parent` is resolved by span containment.
     */
    function findFunctions(src, clean) {
        const found = [];
        let id = 0;

        const push = function (spec) {
            const span = bodySpan(clean, spec.afterParams);
            if (!span) return;
            const body = src.slice(span.start, span.end);
            const cleanBody = clean.slice(span.start, span.end);
            found.push({
                id: id++,
                name: spec.name,
                kind: spec.kind,
                className: spec.className || null,
                isAsync: !!spec.isAsync,
                isGenerator: !!spec.isGenerator,
                isStatic: !!spec.isStatic,
                accessor: spec.accessor || null,
                params: splitParams(spec.params),
                start: spec.start,
                end: span.end,
                bodyStart: span.start,
                line: lineOf(src, spec.start),
                endLine: lineOf(src, span.end),
                lines: Math.max(1, lineOf(src, span.end) - lineOf(src, spec.start) + 1),
                complexity: complexityOf(cleanBody),
                maxDepth: maxDepthOf(cleanBody),
                body: body,
                cleanBody: cleanBody,
                calls: []
            });
        };

        let m;

        // function foo(...) / async function* foo(...)
        const decl = /(?:^|[^.\w$])(async\s+)?function(\s*\*)?\s+([A-Za-z_$][\w$]*)\s*\(/g;
        while ((m = decl.exec(clean)) !== null) {
            const paren = m.index + m[0].length - 1;
            const close = matchParen(clean, paren);
            if (close === -1) continue;
            push({
                name: m[3], kind: 'function', isAsync: !!m[1], isGenerator: !!m[2],
                params: src.slice(paren + 1, close),
                start: m.index + (m[0][0].match(/[^.\w$]/) ? 1 : 0),
                afterParams: close + 1
            });
        }

        // const foo = function (...) / const foo = async function (...)
        const expr = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?function(\s*\*)?\s*[A-Za-z_$][\w$]*?\s*\(|\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?function(\s*\*)?\s*\(/g;
        while ((m = expr.exec(clean)) !== null) {
            const paren = m.index + m[0].length - 1;
            const close = matchParen(clean, paren);
            if (close === -1) continue;
            push({
                name: m[1] || m[4], kind: 'function', isAsync: !!(m[2] || m[5]),
                isGenerator: !!(m[3] || m[6]),
                params: src.slice(paren + 1, close),
                start: m.index, afterParams: close + 1
            });
        }

        // const foo = (...) => / const foo = async x =>
        const arrowParen = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?\(/g;
        while ((m = arrowParen.exec(clean)) !== null) {
            const paren = m.index + m[0].length - 1;
            const close = matchParen(clean, paren);
            if (close === -1) continue;
            let after = close + 1;
            while (after < clean.length && /\s/.test(clean[after])) after++;
            if (clean.substr(after, 2) !== '=>') continue;
            push({
                name: m[1], kind: 'arrow', isAsync: !!m[2],
                params: src.slice(paren + 1, close),
                start: m.index, afterParams: after + 2
            });
        }

        const arrowBare = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(async\s+)?([A-Za-z_$][\w$]*)\s*=>/g;
        while ((m = arrowBare.exec(clean)) !== null) {
            push({
                name: m[1], kind: 'arrow', isAsync: !!m[2], params: m[3],
                start: m.index, afterParams: m.index + m[0].length
            });
        }

        // class bodies and their methods
        const klass = /\bclass\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+[\w$.]+)?\s*\{/g;
        while ((m = klass.exec(clean)) !== null) {
            const open = m.index + m[0].length - 1;
            const close = matchBrace(clean, open);
            if (close === -1) continue;
            const className = m[1];
            found.push({
                id: id++, name: className, kind: 'class', className: className,
                params: [], start: m.index, end: close + 1, bodyStart: open,
                line: lineOf(src, m.index), endLine: lineOf(src, close),
                lines: Math.max(1, lineOf(src, close) - lineOf(src, m.index) + 1),
                complexity: 1, maxDepth: 0,
                body: src.slice(open, close + 1),
                cleanBody: clean.slice(open, close + 1),
                calls: [], isClass: true
            });

            const inner = clean.slice(open, close + 1);
            const method = /(?:^|[\s;}])(static\s+)?(async\s+)?(get\s+|set\s+)?(\*\s*)?([A-Za-z_$][\w$]*)\s*\(/g;
            let mm;
            while ((mm = method.exec(inner)) !== null) {
                const name = mm[5];
                if (NOT_CALLS.has(name)) continue;
                const paren = open + mm.index + mm[0].length - 1;
                const closeParen = matchParen(clean, paren);
                if (closeParen === -1) continue;
                let after = closeParen + 1;
                while (after < clean.length && /\s/.test(clean[after])) after++;
                if (clean[after] !== '{') continue;   // not a method body
                push({
                    name: name, kind: 'method', className: className,
                    isStatic: !!mm[1], isAsync: !!mm[2],
                    accessor: mm[3] ? mm[3].trim() : null,
                    isGenerator: !!mm[4],
                    params: src.slice(paren + 1, closeParen),
                    start: open + mm.index, afterParams: closeParen + 1
                });
            }
        }

        // Deduplicate: the same span can be reached by more than one pattern.
        const seen = new Set();
        const unique = found.filter(function (f) {
            const key = f.name + ':' + f.start + ':' + f.end;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        unique.forEach(function (f, i) { f.id = i; });
        return unique;
    }

    function matchParen(clean, open) {
        let depth = 0;
        for (let i = open; i < clean.length; i++) {
            if (clean[i] === '(') depth++;
            else if (clean[i] === ')') {
                depth--;
                if (depth === 0) return i;
            }
        }
        return -1;
    }

    /** Innermost function whose span contains `index`, excluding `exclude`. */
    function ownerOf(functions, index, exclude) {
        let best = null;
        functions.forEach(function (f) {
            if (f === exclude || f.isClass) return;
            if (index > f.bodyStart && index < f.end) {
                if (!best || (f.end - f.start) < (best.end - best.start)) best = f;
            }
        });
        return best;
    }

    function findVariables(src, clean, functions) {
        const vars = [];
        const re = /\b(const|let|var)\s+([A-Za-z_$][\w$]*)/g;
        let m;
        while ((m = re.exec(clean)) !== null) {
            const owner = ownerOf(functions, m.index, null);
            // Skip names that are really function definitions -- they are stars.
            if (functions.some(function (f) { return f.name === m[2] && Math.abs(f.start - m.index) < 4; })) continue;
            vars.push({
                name: m[2],
                kind: m[1],
                line: lineOf(src, m.index),
                owner: owner ? owner.id : null
            });
        }
        return vars;
    }

    /** Resolve call edges between known functions. */
    function findEdges(functions) {
        const byName = new Map();
        functions.forEach(function (f) {
            if (!byName.has(f.name)) byName.set(f.name, f);
        });

        const edges = [];
        const edgeKey = new Map();

        functions.forEach(function (caller) {
            if (caller.isClass) return;
            const re = /(\.\s*)?\b([A-Za-z_$][\w$]*)\s*\(/g;
            let m;
            while ((m = re.exec(caller.cleanBody)) !== null) {
                const name = m[2];
                if (NOT_CALLS.has(name)) continue;
                const callee = byName.get(name);
                if (!callee || callee.isClass) continue;
                // A nested function's own definition is not a call to itself.
                const absolute = caller.bodyStart + m.index;
                if (absolute >= callee.start && absolute <= callee.end && callee !== caller) continue;

                const key = caller.id + '->' + callee.id;
                if (edgeKey.has(key)) {
                    edgeKey.get(key).count++;
                } else {
                    const edge = { from: caller.id, to: callee.id, count: 1, recursive: caller === callee };
                    edgeKey.set(key, edge);
                    edges.push(edge);
                }
                if (caller.calls.indexOf(name) === -1) caller.calls.push(name);
            }
        });

        return edges;
    }

    /** Longest call chain, ignoring cycles. */
    function longestChain(functions, edges) {
        const out = new Map();
        functions.forEach(function (f) { out.set(f.id, []); });
        edges.forEach(function (e) {
            if (e.from !== e.to) out.get(e.from).push(e.to);
        });

        const memo = new Map();
        const visiting = new Set();
        const depth = function (id) {
            if (memo.has(id)) return memo.get(id);
            if (visiting.has(id)) return 0;      // cycle
            visiting.add(id);
            let best = 0;
            out.get(id).forEach(function (next) {
                best = Math.max(best, 1 + depth(next));
            });
            visiting.delete(id);
            memo.set(id, best);
            return best;
        };

        let max = 0;
        functions.forEach(function (f) { max = Math.max(max, depth(f.id) + 1); });
        return max;
    }

    function analyze(src) {
        const clean = blankLiterals(src || '');
        const functions = findFunctions(src, clean);
        const variables = findVariables(src, clean, functions);
        const edges = findEdges(functions);

        // Fan-in / fan-out, and parent nesting.
        functions.forEach(function (f) {
            f.fanIn = 0;
            f.fanOut = 0;
            f.recursive = false;
            const parent = ownerOf(functions, f.start, f);
            f.parent = parent ? parent.id : null;
        });
        edges.forEach(function (e) {
            if (e.from === e.to) {
                functions[e.to].recursive = true;
                return;
            }
            functions[e.from].fanOut++;
            functions[e.to].fanIn++;
        });

        // Mutually recursive pairs render as binary systems.
        const pairs = [];
        edges.forEach(function (a) {
            edges.forEach(function (b) {
                if (a.from === b.to && a.to === b.from && a.from < a.to) {
                    pairs.push([a.from, a.to]);
                }
            });
        });

        const callable = functions.filter(function (f) { return !f.isClass; });

        // "Nothing calls it" covers two very different situations and they
        // should not be reported as the same thing. A function that calls
        // nothing and is called by nothing is almost certainly dead. One that
        // is called by nothing but drives other functions is an entry point,
        // which is exactly what you want a top-level function to look like.
        // A constructor is neither: `new Foo()` invokes it without ever naming
        // it, so its fan-in is always zero and never means anything.
        const eligible = function (f) {
            return f.parent === null && f.name !== 'constructor' && f.accessor === null;
        };
        callable.forEach(function (f) {
            f.isDeadCode = eligible(f) && f.fanIn === 0 && f.fanOut === 0 && !f.recursive;
            f.isEntryPoint = eligible(f) && f.fanIn === 0 && f.fanOut > 0;
        });
        const deadCode = callable.filter(function (f) { return f.isDeadCode; });
        const entryPoints = callable.filter(function (f) { return f.isEntryPoint; });
        const totalComplexity = callable.reduce(function (s, f) { return s + f.complexity; }, 0);
        const sorted = callable.slice().sort(function (a, b) { return b.complexity - a.complexity; });
        const deepest = callable.slice().sort(function (a, b) { return b.maxDepth - a.maxDepth; })[0] || null;

        return {
            functions: functions,
            variables: variables,
            edges: edges,
            binaryPairs: pairs,
            stats: {
                functionCount: callable.length,
                classCount: functions.length - callable.length,
                variableCount: variables.length,
                totalLines: (src.match(/\n/g) || []).length + 1,
                totalComplexity: totalComplexity,
                averageComplexity: callable.length ? totalComplexity / callable.length : 0,
                mostComplex: sorted[0] || null,
                deepest: deepest,
                deadCode: deadCode,
                entryPoints: entryPoints,
                recursive: callable.filter(function (f) { return f.recursive; }),
                longestChain: longestChain(callable, edges),
                edgeCount: edges.length
            }
        };
    }

    global.CodeParser = {
        analyze: analyze,
        blankLiterals: blankLiterals,
        complexityOf: complexityOf,
        matchBrace: matchBrace
    };
})(typeof window !== 'undefined' ? window : globalThis);
