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
  `nodeLinker: node-modules`, but `apps/meteor` sets
  `installConfig.hoistingLimits: "workspaces"`, because Meteor cannot use
  yarn's hoisted tree. So that member installs its own 1,304 dependencies and
  node resolves them nested-first. chainstrip writes EVERY installed copy at
  the extracted version, not only the root one.
- **Four suites, and each names the project's own script.** `jest` and `mocha`
  both run from `apps/meteor`; `pkg-gazzodown` and `pkg-message-parser` run
  from their own packages. A script carries the project's own environment
  (`TZ=UTC`, `TS_NODE_COMPILER_OPTIONS`), and reducing a test command to a bare
  runner invocation drops it - after which the timezone-sensitive tests fail
  for a reason that has nothing to do with any dependency.

  One command may not name two runners: `yarn testunit` chains three, and
  chainstrip refuses it rather than tracing one runner while validating
  against another. Two suites may share a `testCwd`, which is why a file that
  both would collect is assigned by configuration order and never by probing
  the filesystem.
- **`devPaths` names what is not the product.** `apps/uikit-playground` is a
  playground, and four `packages/*` entries are release and Storybook tooling.
  Their dependencies are not shippable and no suite covers them, so counting
  them made every percentage in the report wrong. The paths are still scanned,
  so `drift` still reports a new dependency arriving in one of them.
- **`buildCommand` is `yarn run build:ci`, from `apps/meteor`.** That is
  `meteor build`. The baseline workflow sets `BABEL_ENV=production`, matching
  what `.github/actions/meteor-build` passes for a production build. A
  development-mode build skips production-only plugins and gates nothing.
- **`update.block`** lists the finding classes that fail a pull request.

## Verified baseline, 2026-09-03

Run 33731088496 on `@chainstrip/cli@0.4.4-nested.8`, artifact `156e4301955ab985`.

| Stage | Result |
|---|---|
| sweep | 67 validated of 180 candidates. Bytes 113.5 -> 19.0 MB, 83.3% removed |
| buildgate | passed, 3 builds, 0 offenders |
| fileprune | 65 of 128 accepted, 1,949 files pruned, 37.2 MB removed |
| fullgate | 169 overlays, 0 failing at baseline, 0 failing with overlays, passed |
| covtrim | 0 accepted, 3,256 at-risk functions held (1.2 MB) |
| artifact | 169 extracted + 34 pinned, store 27.8 MB |

The other 113 candidates: 73 `larger-than-stock`, 37 `no-mapped-tests`,
2 `extract-failed`, 1 `overlay-failed`. So 67 of the 107 candidates that can
ship a bundle validated, which is 63%.

`larger-than-stock` is a decision, not a failure. The bundle came out bigger
than the package it replaces, so the package ships instead - pinned, or pruned
by fileprune. chainstrip spends no validation on those, which is why the
candidate count and the validated count are read together.

### The earlier baseline, 2026-09-02

Run 33607078804 on `nested.4`, artifact `78a0fb9a29b8f61b`: 74 validated of
215 candidates, 41.5% of executable bytes. That run counted oversized bundles
as validated and ran no mocha suite, so it is superseded rather than compared.

### What the earlier run got wrong, and it was retracted

The 2026-09-01 baseline reported 63 validated and a 53.7% cut. Those numbers
were withdrawn: chainstrip overlaid `<target>/node_modules/<name>` while the
tests loaded `apps/meteor`'s own copy, so the differential compared stock with
stock and could not fail. 255 of 255 declared dependencies resolved outside the
overlaid tree; 61 of 63 validated ones did.

The cause is deliberate and permanent. `apps/meteor/package.json` sets
`installConfig: { "hoistingLimits": "workspaces" }`, because Meteor cannot use
yarn's hoisted tree.

### How this run proves the fix

The strongest evidence is not the byte count, it is that **the oracle can now
fail**. Four dependencies fail their overlays where the old code had ZERO and
was structurally incapable of having any:

- `react` (211 mapped tests)
- `@tanstack/react-query` (190)
- `@rocket.chat/styled` (176)
- `@rocket.chat/fuselage-toastbar` (4)

`@tanstack/react-query` had shipped as `validated` in the retracted run with no
coverage at all. Its bundle genuinely breaks the suite.

Coverage attribution moved too: 31 of 43 covtrim dependencies now carry
coverage, against 26 of 38 before, and deps that reported `functionsTotal: 0`
while their tests passed now report real figures — `react-i18next` 55%,
`@storybook/react` 11%, `i18next-sprintf-postprocessor` 29%.

### Three bugs this target found in the fix itself

Each surfaced only because the overlay had widened, and each had a precondition
the old single-path write never had to meet.

1. **A dangling `bin` symlink.** Replacing a package whose extraction omits its
   CLI leaves `apps/meteor/node_modules/.bin/<name>` pointing at nothing, and
   Meteor's builder refuses to walk such a tree. It reverted six deps and failed
   the build gate. Bin targets are now stashed and restored.
2. **`@unknown` version on a pruned tree.** A fileprune output carries no
   `chainstrip-manifest.json`, so the version read as unknown and the
   conservative fallback named the root copy — which `chart.js` does not have
   here. The version now comes from the extraction's own `package.json` too.
3. **Coverage attribution did not follow copies.** `parseCoverageDir`'s
   workspace-root prefix rule dropped every execution from a member's own
   `node_modules`, so covtrim was blind on exactly the dependencies the fix had
   unblocked. `nestedNodeModules` is now passed on every capture path.

## What is still true, and still not measured

1. **Adding more package suites buys almost nothing, and that is measured.**
   The `jest` and `mocha` suites both run in `apps/meteor`. Of the 37
   `no-mapped-tests` dependencies, 24 (7.14 MiB of 10.9 MiB) are imported by
   `apps/meteor` code, so they already sit inside both suites' scope. They are
   unmapped because no unit test names them: all 37 were checked against every
   `*.spec.*` and `*.test.*` file in the repository and two matched, both
   substring coincidences.

   The rest divide as follows. `packages/gazzodown` holds one (`katex`,
   2.51 MiB) and `packages/message-parser` holds one (`tinybench`, 0.11 MiB);
   both have jest suites, and both are configured. `packages/livechat` holds
   six (0.72 MiB) and `ee/packages/media-calls` holds one, and NEITHER ships a
   test file, so no suite can reach them. Four have no import site at all.

   Six package suites that an earlier plan named - `cas-validate`,
   `server-fetch`, `ui-client`, `federation-matrix`, `ddp-streamer`,
   `omnichannel-services` - map ZERO unmapped dependencies and are therefore
   not configured. The remaining levers for those 24 dependencies are witness
   probes and e2e evidence, not another suite.

2. **The Meteor build cache is content-aware, and the build gate is SOUND.**
   Settled by probe run 33592323704: breaking `zustand/index.js`, proven
   compiled into the client bundle, failed the warm build in 25s and the cold
   build in 30s. The earlier 177s-versus-31s timing gap was ordinary incremental
   compilation. Two earlier probe rounds concluded "the cache replays" and both
   were wrong, because their signal proved inclusion rather than compilation.

3. **covtrim still trims nothing, and that part is by design.** Every candidate
   is at-risk - reachable from the used surface but never executed - and
   at-risk is held by default. Zero functions are proven dead, because with
   `target: "."` most dependencies have installed dependents, which forces the
   reachability roots to all export names.

4. **A dependency installed ONLY in a workspace member still gets no coverage.**
   The nested byte guard compares against the workspace-root copy, and there is
   none to compare against. Conservative and documented; closing it needs the
   guard to compare against the extraction instead.

5. **The e2e stages are not configured**, so `cove2e` contributes no evidence.

### The guard

`.github/scripts/check-overlay-tree.mjs` is report-only. It reports the shape
in the log; the tool now handles it. If these dependencies ever come back with
no coverage again, the hard stop goes back.

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
