// Isolated server-module harness: never imports the real database connection.
// This executes the actual page/action code with explicit in-memory adapters.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

export function loadTestModule<T>(file: string, overrides: Record<string, unknown>): T {
  const requirePackage = createRequire(import.meta.url);
  const cache = new Map<string, { exports: unknown }>();
  function load(filename: string): unknown {
    const absolute = path.resolve(filename);
    if (cache.has(absolute)) return cache.get(absolute)!.exports;
    const moduleRecord = { exports: {} as unknown };
    cache.set(absolute, moduleRecord);
    const compiled = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    const localRequire = (specifier: string): unknown => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier === "@/lib/prisma" || specifier.endsWith("/auth")) throw new Error(`Missing test adapter: ${specifier}`);
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/") ? path.resolve("src", specifier.slice(2)) : path.resolve(path.dirname(absolute), specifier);
        const candidate = [base, `${base}.ts`, `${base}.tsx`].find((entry) => existsSync(entry));
        if (!candidate) throw new Error(`Cannot resolve ${specifier}`);
        return load(candidate);
      }
      return requirePackage(specifier);
    };
    new Function("require", "module", "exports", compiled)(localRequire, moduleRecord, moduleRecord.exports);
    return moduleRecord.exports;
  }
  return load(file) as T;
}

export type TestElement = { type: unknown; props: Record<string, unknown> };
export function findElements(tree: unknown, type: unknown): TestElement[] {
  if (Array.isArray(tree)) return tree.flatMap((child) => findElements(child, type));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as TestElement;
  return [...(element.type === type ? [element] : []), ...findElements(element.props.children, type)];
}
