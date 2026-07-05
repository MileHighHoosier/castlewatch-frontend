import ts from "typescript";
import { readFile } from "node:fs/promises";

const SOURCE_SUFFIXES = [".ts", ".tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier)) {
    for (const suffix of SOURCE_SUFFIXES) {
      try {
        return await nextResolve(`${specifier}${suffix}`, context);
      } catch {
        // Try the next supported TypeScript suffix.
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const source = await readFile(new URL(url), "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
      fileName: new URL(url).pathname,
      reportDiagnostics: true,
    });

    const errors = (result.diagnostics || []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length) {
      const message = ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      });
      throw new Error(message);
    }

    return {
      format: "module",
      source: result.outputText,
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
