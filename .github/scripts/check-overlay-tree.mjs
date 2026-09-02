// Refuse to run chainstrip when the tree it overlays is not the tree the tests
// load. Exits non-zero with the reason.
//
// chainstrip writes every overlay to exactly <target>/node_modules/<name>
// (validate.ts overlayExtracted, artifact.ts applyArtifact). node resolves
// nested-FIRST, so a workspace member carrying its own node_modules shadows
// that overlay completely. The mapped tests then compare stock against stock,
// find no difference, and the dependency ships `validated` having proved
// nothing about the bytes chainstrip built.
//
// MEASURED on this repository 2026-09-02: 61 of 63 validated dependencies
// resolved to apps/meteor/node_modules and ZERO to the hoisted root, so an
// entire 80-minute baseline was hollow and nothing in it said so. The cause is
// deliberate and permanent - apps/meteor sets installConfig.hoistingLimits to
// "workspaces" because Meteor cannot use yarn's hoisted tree.
//
// This is chainstrip roadmap item 30. The guard lives here until the tool
// carries it itself.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const root = process.cwd();
const cfg = JSON.parse(readFileSync(join(root, "chainstrip.config.json"), "utf8"));
const target = resolve(root, cfg.target ?? ".");
const testCwd = resolve(target, cfg.testCwd ?? ".");
const overlayTree = join(target, "node_modules") + sep;

const pkgPath = join(testCwd, "package.json");
if (!existsSync(pkgPath)) {
  console.error(`no package.json at ${pkgPath}; cannot check the overlay tree`);
  process.exit(1);
}
const names = Object.keys(JSON.parse(readFileSync(pkgPath, "utf8")).dependencies ?? {});
if (names.length === 0) {
  console.error(`${pkgPath} declares no dependencies; nothing to check`);
  process.exit(1);
}

// Resolve from the CONSUMER context, which is what the runner and the build use.
const req = createRequire(join(testCwd, "package.json"));
const shadowed = [];
const inTree = [];
let unresolved = 0;
for (const n of names) {
  let p;
  try {
    p = req.resolve(n);
  } catch {
    // A types-only or optional dep that does not resolve is not evidence
    // either way, and must not be counted as if it were.
    unresolved++;
    continue;
  }
  (p.startsWith(overlayTree) ? inTree : shadowed).push(n);
}

console.log(`overlay tree:   ${overlayTree}`);
console.log(`consumer:       ${testCwd}`);
console.log(`resolved in the overlay tree: ${inTree.length}`);
console.log(`resolved ELSEWHERE (shadowed): ${shadowed.length}`);
console.log(`unresolvable (not counted):   ${unresolved}`);

if (shadowed.length === 0) {
  console.log("\nOK: every resolvable dependency loads from the tree chainstrip overlays.");
  process.exit(0);
}

// REPORT-ONLY SINCE 0.4.4-nested.1, which carries roadmap #30: chainstrip now
// resolves from the importing file's directory and overlays EVERY copy at the
// extracted version, so a shadowed tree is handled rather than fatal. This
// stayed as diagnostics because the shape is worth seeing in the log, and
// because the baseline's own numbers are what verify the fix - if the deps
// listed here come back with no coverage again, the hard stop goes back.
console.log(`
NOTE. ${shadowed.length} of ${shadowed.length + inTree.length} resolvable dependencies load from a tree that is not
the hoisted root. That USED to make every verdict here hollow; as of the CLI
carrying roadmap #30 the overlay follows copies, and this is reported rather
than refused.

Examples: ${shadowed.slice(0, 6).map((n) => `${n} -> ${req.resolve(n).replace(root + sep, "")}`).join("\n          ")}

Cause on this repository: apps/meteor sets installConfig.hoistingLimits to
"workspaces", because Meteor cannot use yarn's hoisted tree. yarn therefore
installs that workspace's dependencies into apps/meteor/node_modules, and node
resolves those first.

Check the run's own output: these dependencies must come back with coverage and
with validation that describes the copy they resolve to. If they do not, the
fix is not working here and this check should hard-stop again.
`);
process.exit(0);
