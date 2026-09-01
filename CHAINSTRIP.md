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

## What is NOT measured yet

State these when reading any number this pipeline produces.

1. **The mocha suite is invisible.** `apps/meteor` runs about 196 spec files
   under mocha and about 286 under jest. chainstrip supports jest, vitest and
   `node --test`; it has no mocha tracer, so `testunit`'s mocha halves cannot be
   used. Dependencies that only mocha tests exercise get no mapped test, so they
   ship as pinned stock rather than as a rebuilt copy. That is lost reduction,
   not an unsound claim. Tracked as roadmap item 29, with the mechanism already
   measured: mocha's positional arguments ADD to the config's `spec` instead of
   filtering it, so per-dependency isolation needs a generated config.

2. **The Meteor build cache is not cleared by the tool.** chainstrip clears
   `.next`, `.nx`, `.angular`, `.turbo`, `.parcel-cache` and
   `node_modules/.cache` before every oracle build, because a cached replay is a
   false pass that validates nothing. It does not know about `~/.meteor` or
   `apps/meteor/.meteor/local`. `actions/checkout` cleans the in-repo one on
   every run, and `build:ci` already sets `METEOR_DISABLE_OPTIMISTIC_CACHING=1`.
   Confirm on the first baseline that the oracle builds really do recompile;
   a build that finishes suspiciously fast is the symptom.

3. **jest `projects` and the trace resolver are unproven together.**
   `apps/meteor/jest.config.ts` declares two projects, `client` and `server`.
   chainstrip traces jest by passing `--resolver` on the command line. Whether
   that reaches each project's configuration has not been tested here. If it
   does not, trace observes zero packages, and chainstrip hard-stops rather than
   reporting an empty result as a clean one. That guard is the reason this is a
   risk to a first run and not a risk to a published number.

4. **The e2e stages are not configured.** There is no `e2e` block, so `cove2e`
   contributes no browser or server execution evidence. Unit tests alone do not
   execute everything production executes.

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
