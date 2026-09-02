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

## First baseline, 2026-09-01

Run 33562750648, commit `4a948dc3`, on the self-hosted runner. About 80 minutes.

| Stage | Result |
|---|---|
| sweep | 63 validated of 140 candidates. Executable bytes 35.0 -> 16.2 MiB, 53.7% removed |
| fileprune | 53 accepted, 1,529 files, 33.6 MB removed (86.0 -> 53.9 MiB, 37.3%) |
| buildgate | passed, 0 offenders, 3 builds - but see the build cache below |
| fullgate | 180 overlays, 0 failing at baseline, 0 failing with overlays, passed |
| covtrim | 0 trims |

Largest bundle reductions: `date-fns` 9.5 -> 3.4 MiB, `typia` 4.0 -> 0.1 MiB,
`moment` 3.6 -> 0.7 MiB, `zod` 3.8 -> 1.8 MiB. Largest pruned tree: `storybook`
35.0 -> 12.3 MiB.

## What the baseline settled

1. **jest `projects` and the trace resolver work together.** This was the top
   risk before the first run. 63 dependencies carry `testEvidence: traced`, with
   up to 287 mapped test files each. `--resolver` reaches both the `client` and
   `server` projects.

2. **`yarn run .testunit:jest` forwards chainstrip's flags and paths.** Listing
   and per-file runs both work through the package script, so the project's own
   `TZ=UTC` and `TS_NODE_COMPILER_OPTIONS` are carried, as intended.

3. **The stock suite is green.** The preflight recorded `stockBaseline: passed`,
   so no claim in this run is labelled DEGRADED.

## What is NOT measured yet, or not yet trusted

State these when reading any number this pipeline produces.

1. **The mocha suite is invisible.** `apps/meteor` runs about 196 spec files
   under mocha and about 286 under jest. chainstrip supports jest, vitest and
   `node --test`; it has no mocha tracer. 75 of the 140 candidates came back
   `no-mapped-tests`, which is consistent with that. Those ship as pinned stock
   rather than a rebuilt copy: lost reduction, not an unsound claim. Tracked as
   roadmap item 29, with the mechanism already measured - mocha's positional
   arguments ADD to the config's `spec` instead of filtering it, so per-dependency
   isolation needs a generated config.

2. **The build gate's verdict is NOT yet trusted.** The baseline build took 177s
   and the two overlay builds 33s and 31s. A 5x gap is the cached-replay
   signature: chainstrip clears `.next`, `.nx`, `.angular`, `.turbo`,
   `.parcel-cache` and `node_modules/.cache` before every oracle build, and knows
   nothing about `~/.meteor` or `apps/meteor/.meteor/local`. It is not proof -
   Meteor keys on file content, unlike nx's task hash, so incremental recompile
   may be entirely legitimate. `chainstrip-probe-modules.yml` settles it by
   breaking a file the app imports 892 times and rebuilding warm. Until that
   probe runs, read `buildgate: passed, 0 offenders` as unproven.

3. **Twelve dependencies produced NO coverage at all**, with `functionsTotal: 0`,
   while `apps/meteor` imports them heavily - `react-i18next` at 892 sites,
   `zustand` at 13, `ejson` at 9. Four of the twelve are remapped by
   `jest.config.ts` to `<rootDir>/node_modules`, which is `apps/meteor`'s OWN
   nested tree, not the hoisted root chainstrip overlays. If the tests load a
   nested copy, then both the coverage AND the validation describe bytes that are
   not the ones chainstrip changed. The same probe answers this, by asking node
   which copy it resolves from `apps/meteor`.

4. **covtrim trimmed nothing, and that part is by design.** Every one of the 26
   dependencies with candidates reported `all N candidate(s) held: reachable from
   the used surface but never executed`. That is the at-risk hold, which is the
   ratified default. Zero functions were proven dead, because on a monorepo with
   `target: "."` most dependencies have installed dependents, which forces the
   reachability roots to all export names and makes everything read as reachable.
   Yield here grows through reachability precision, not through more tests.

5. **40% of validated bundles are larger than stock**, 25 of 63. Those ship as
   pinned stock, correctly, but `shipDecision` is consulted only AFTER per-dep
   validation has run: 9.2 minutes of test runs on this target bought nothing.
   Eight of the 25 are within 2 KB. Two are not rounding at all - `node-fetch`
   bundles to 8.9x stock and `@testing-library/jest-dom` to 4x, which is an
   inlining artifact worth its own investigation.

6. **Development-only packages are in the candidate set.** `@actions/core`,
   `@babel/preset-env`, `@eslint/js` and `@changesets/types` all appear. That
   follows from `target: "."` inventorying the whole monorepo. It costs time, not
   soundness.

7. **The e2e stages are not configured.** There is no `e2e` block, so `cove2e`
   contributes no browser or server execution evidence.

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
