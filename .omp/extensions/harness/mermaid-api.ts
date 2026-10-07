// mermaid-api.ts — leaf module isolating the omp-bundled parser import.
//
// The STATIC import below only resolves inside the omp runtime: omp's
// extension loader rewrites `@oh-my-pi/*` specifiers in the extension's file
// graph onto its bundled module registry. (A dynamic `import("@oh-my-pi/…")`
// does NOT work — the rewritten namespace-prefixed specifier resolves for
// static graph loads only, verified empirically.)
//
// Keeping the static import in this leaf lets mermaid-check.ts load it via a
// guarded dynamic RELATIVE import: under omp this file loads and re-exports
// the parser; under any other runtime (plain bun/node) this module fails to
// resolve and the caller falls back to a no-op (fail-open).

export { extractMermaidBlocks, renderMermaidAscii } from "@oh-my-pi/pi-utils";
