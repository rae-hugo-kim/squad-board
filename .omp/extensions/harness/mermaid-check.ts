// mermaid-check.ts — validate ```mermaid blocks in Markdown using OMP's
// bundled mermaid-ascii parser (@oh-my-pi/pi-utils), the same parser the OMP
// TUI uses to render diagrams in chat.
//
// This replaces the retired mmdc (puppeteer/chromium) build-time validation
// from scripts/docs-build.sh. It runs IN-PROCESS in the harness extension —
// it cannot be a spawned gates/*.mjs script because the bundled package
// registry only exists inside the compiled omp binary.
//
// Fail-open contract: if the bundled API is unavailable (non-omp runtime,
// future omp dropping the specifier), validation silently degrades to a no-op
// so extension load and the other gates are never taken down with it.

import { readFile } from "node:fs/promises";

export const MERMAID_SUPPORTED =
	"graph/flowchart (TD|TB|LR|BT|RL), stateDiagram(-v2), sequenceDiagram, classDiagram, erDiagram, xychart";

interface MermaidBlock {
	source: string;
	hash: bigint;
}

interface MermaidApi {
	renderMermaidAscii(source: string): string;
	extractMermaidBlocks(markdown: string): MermaidBlock[];
}

function isMermaidApi(mod: unknown): mod is MermaidApi {
	if (!mod || typeof mod !== "object") return false;
	if (!("renderMermaidAscii" in mod) || !("extractMermaidBlocks" in mod)) return false;
	return typeof mod.renderMermaidAscii === "function" && typeof mod.extractMermaidBlocks === "function";
}

// The parser lives in ./mermaid-api.ts (a leaf whose STATIC `@oh-my-pi/pi-utils`
// import only resolves inside omp — see that file's header). Loading the leaf
// via a guarded dynamic RELATIVE import is deliberate (ts-no-dynamic-import
// exception: platform-specific module): under omp it resolves through the
// loader's rewrite pipeline; under plain bun/node it throws and we fail open.
const apiPromise: Promise<MermaidApi | null> = (async () => {
	try {
		const mod: unknown = await import("./mermaid-api.ts");
		return isMermaidApi(mod) ? mod : null;
	} catch {
		return null;
	}
})();

/**
 * Validate every ```mermaid block in `markdown`.
 * Returns one message per broken block; empty array = all valid (or fail-open).
 */
export async function checkMermaidMarkdown(markdown: string): Promise<string[]> {
	if (!markdown.includes("```mermaid")) return [];
	const api = await apiPromise;
	if (!api) return [];
	const problems: string[] = [];
	let blocks: MermaidBlock[];
	try {
		blocks = api.extractMermaidBlocks(markdown);
	} catch {
		return [];
	}
	for (const [index, block] of blocks.entries()) {
		try {
			api.renderMermaidAscii(block.source);
		} catch (error) {
			const header = block.source.split("\n", 1)[0]?.trim() ?? "";
			const message = error instanceof Error ? error.message : String(error);
			problems.push(`block ${index + 1} ("${header}"): ${message}`);
		}
	}
	return problems;
}

/**
 * Validate a Markdown file on disk (post-write). Non-.md paths and read
 * failures return [] — the check never turns an applied edit into an error.
 */
export async function checkMermaidFile(filePath: string): Promise<string[]> {
	if (!filePath.toLowerCase().endsWith(".md")) return [];
	let markdown: string;
	try {
		markdown = await readFile(filePath, "utf8");
	} catch {
		return [];
	}
	return checkMermaidMarkdown(markdown);
}
