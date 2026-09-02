# chainstrip on this repository

chainstrip rebuilds each third-party package that the product actually imports,
keeping only the code the project uses, and proves the result with the
project's own tests and the project's own production build. It never edits the
product source. This file records how it is wired here, what it measures, and
what it does not measure yet.

The tool's own documentation lives with the CLI. This file is about THIS repo.

## What runs, and when

| Workflow | Trigger | Cost | What it does |
|---|---|---|---|
| `chainstrip-baseline.yml` | push to `master`, or manual | hours | Full run: inventory, trace, sweep, buildgate, fileprune, cove2e, covtrim, gate, pack. Caches the gate baseline, keyed on `yarn.lock`. |
| `ci-chainstrip.yml`, called by `ci.yml` as the `chainstrip-gate` job | pull requests that change a dependency manifest | minutes | Restores that baseline and runs `chainstrip update`, the no-arg dependency scan. |

The gate job is conditional. `release-versions` sets `dependencies-changed`
when the pull request touches `yarn.lock`, any `package.json`, or
`.yarn/patches/`. Every other pull request skips the gate, and `✅ Tests Done`
treats a skip as a pass.

Both jobs run on the `self-hosted` runner. The repository variable
`CHAINSTRIP_LARGE_RUNNER` overrides that label without editing a workflow.

## This fork does not run the upstream pipeline

`packages-build` in `ci.yml` carries `if: vars.CHAINSTRIP_TESTBED != 'true'`,
and every heavy job reaches the pipeline through it: the Meteor builds, the
docker images, the ten e2e suites, storybook and the unit tests. Setting the
repository variable `CHAINSTRIP_TESTBED` to `true` therefore skips all of them
with one switch. `Tests Done` is skipped for the same reason, because it would
otherwise fail a pull request over jobs that were never meant to run.

What still runs: `release-versions` and `test-guard`, which are two API calls;
`actionlint`; and `chainstrip-gate`, which depends on `release-versions` only.

Unset, which is what upstream is, none of this applies. Every unrelated
standalone workflow - releases, codeql, the issue bots, gh-pages - is disabled
at the repository level rather than edited, so the files stay as upstream wrote
them.

## Configuration

`chainstrip.config.json` at the repository root:

- **`target` is `.`, not `apps/meteor`.** Yarn 4 runs with
  `nodeLinker: node-modules` and hoists every dependency to the repository
  root, so `node_modules` is at `.`. chainstrip overlays into
  `<target>/node_modules/<name>`, which is the only path it writes.
- **`testCommand` is `yarn run .testunit:jest`, from `apps/meteor`.** That is
  the project's own script, so it carries the project's own environment
  (`TZ=UTC`, `TS_NODE_COMPILER_OPTIONS`). Reducing a test command to a bare
  runner invocation drops that environment, and the timezone-sensitive tests
  then fail for a reason that has nothing to do with any dependency.
- **`buildCommand` is `yarn run build:ci`, from `apps/meteor`.** That is
  `meteor build`. The baseline workflow sets `BABEL_ENV=production`, matching
  what `.github/actions/meteor-build` passes for a production build. A
  development-mode build skips production-only plugins and gates nothing.
- **`update.block`** lists the finding classes that fail a pull request.

## RETRACTED: the first baseline measured the wrong tree

Run 33562750648 completed on 2026-09-01 and reported 63 validated packages,
executable bytes down 53.7%, and a green suite under 180 overlays. **Do not
quote those numbers.** They describe bytes that nothing loaded.

chainstrip writes every overlay to `<target>/node_modules/<name>`, and node
resolves nested-first. `apps/meteor` carries its own `node_modules`, so it
shadows the hoisted root the overlay was written to. The mapped tests then
compare stock against stock, find no difference, and each dependency ships
`validated` having proved nothing.

MEASURED by `chainstrip-probe-modules.yml`, run 33587232923:

| | |
|---|---|
| packages present in BOTH trees | 1,517 |
| nested packages under `apps/meteor` | 1,304 |
| validated deps resolving to the NESTED tree | **61 of 63** |
| validated deps resolving to the hoisted root | **0** |

The cause is deliberate and permanent. `apps/meteor/package.json` sets
`installConfig: { "hoistingLimits": "workspaces" }`, because Meteor cannot use
yarn's hoisted tree. yarn therefore installs that workspace's dependencies into
`apps/meteor/node_modules` by design.

It was visible only by accident. covtrim reports `functionsTotal`, so twelve
deps with no coverage record stood out. sweep reports nothing that distinguishes
"validated against the overlay" from "validated against a copy the overlay never
touched" - so on a target without covtrim, or for a dep it skips, a hollow
verdict is completely invisible.

**This target cannot be measured soundly until chainstrip overlays every
resolved copy.** That is chainstrip roadmap item 30, which also specifies the
conservative half that must land first: a dependency whose consumer-resolved
path is not the overlaid path must not read as `validated`.

Moving `target` to `apps/meteor` does NOT fix it and was rejected: the workspace
clone has to be the whole repository, because the member alone cannot resolve
the hoisted packages or its sibling workspace packages.

### The guard

`.github/scripts/check-overlay-tree.mjs` runs before chainstrip in both
workflows. It resolves every dependency `apps/meteor` declares, from
`apps/meteor`, and fails the run when any of them load from outside the tree
chainstrip overlays. Until the tool carries this check itself, the pipeline
refuses to produce numbers rather than producing false ones.

PROVEN on baseline run 33587857628, the first run after the guard landed. It
stopped before chainstrip started, with:

```
overlay tree:   /home/actions-runner/_work/rocket.chat/rocket.chat/node_modules/
consumer:       /home/actions-runner/_work/rocket.chat/rocket.chat/apps/meteor
resolved in the overlay tree: 0
resolved ELSEWHERE (shadowed): 255

STOP. 255 of 255 resolvable dependencies load from a tree
chainstrip does NOT overlay ...
```

255 of 255 is the whole declared dependency set of `apps/meteor`, which is a
stronger statement than the 61 of 63 the probe measured over the validated
subset. Both workflows fail at that step on this repository, by design.

## What the baseline did establish

These stand, because they are about the plumbing rather than the measurement.

1. **jest `projects` and the trace resolver work together.** 63 dependencies
   carried `testEvidence: traced`, with up to 287 mapped test files each, so
   `--resolver` reaches both the `client` and `server` projects.
2. **`yarn run .testunit:jest` forwards chainstrip's flags and paths.**
3. **The stock suite is green**, recorded as `stockBaseline: passed`.
4. **The CI shape works end to end** on a self-hosted runner: corepack for yarn,
   Meteor on PATH without sudo, turbo packages built, CLI installed from GitHub
   Packages, ~80 minutes for a full run.

## Still open, independent of the retraction

1. **The mocha suite is invisible.** `apps/meteor` runs about 196 spec files
   under mocha and about 286 under jest, and chainstrip has no mocha tracer.
   Tracked as roadmap item 29, mechanism measured: mocha's positionals ADD to
   the config's `spec` rather than filtering it, so per-dependency isolation
   needs a generated config.

2. **Whether the Meteor build cache replays is UNKNOWN.** A first probe broke the
   CJS entry of `react-i18next` and the warm build passed in 31s, which looked
   like a replay. The control refuted it: the same break passed a COLD build in
   37s, so that file is not in the build graph and the probe measured nothing. A
   probe whose result has two explanations has not measured anything. Settling it
   needs a file provably in the graph.

3. **covtrim trimmed nothing, and that part is by design.** Every candidate was
   at-risk - reachable but never executed - and at-risk is held by default. Zero
   functions were proven dead, because with `target: "."` most dependencies have
   installed dependents, which forces reachability roots to all export names.

4. **40% of validated bundles were larger than stock**, 25 of 63, costing 9.2
   minutes of per-dep validation that buys nothing, because `shipDecision` is
   consulted only after validation runs. Two are not rounding: `node-fetch`
   bundles to 8.9x stock and `@testing-library/jest-dom` to 4x.

5. **Development-only packages are in the candidate set** - `@actions/core`,
   `@babel/preset-env`, `@eslint/js` - which follows from `target: "."`
   inventorying the whole monorepo.

6. **The e2e stages are not configured**, so `cove2e` contributes no evidence.

## Waiving a finding

A reviewer waives a blocking finding by committing
`chainstrip-approvals.json` next to `chainstrip.config.json`, in the same pull
request:

```
$CHAINSTRIP update approve <dep>@<version> --reason "why this is safe"
```

The approval binds to a fingerprint over the dependency, the classification,
the version, the surface and the capability set. Any later change to that
dependency produces a different fingerprint, so the waiver stops matching and
the gate blocks again. There are no blanket waivers, and the file ships in the
pull request diff, so `git blame` records who accepted what.

## Repository prerequisites

- Variable `CHAINSTRIP_LARGE_RUNNER` = `self-hosted`.
- Variable `CHAINSTRIP_CLI_VERSION`, pinning an exact CLI version. Unset means
  `latest`, which makes a run irreproducible.
- Read access to the `@chainstrip/cli` package on GitHub Packages for this
  repository. The workflows use the ambient `GITHUB_TOKEN` and carry no secret.
- Optional: `CHAINSTRIP_CSBOX_PACKAGE` or `CHAINSTRIP_CSBOX_PATH` to contain the
  dependency code chainstrip executes. Without one the run degrades and says so.
