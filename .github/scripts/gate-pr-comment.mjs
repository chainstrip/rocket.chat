// Render .chainstrip/gate-report.json into ONE sticky PR comment (created on
// the first run, updated in place on every later run) so the gate's verdict --
// and the exact unblock procedure -- live in the PR conversation, not in the
// raw step log. Self-contained: node built-ins + the preinstalled gh CLI
// (GH_TOKEN provided by the workflow step). Exit 0 always: commenting is
// presentation; the check's pass/fail already carries the verdict.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MARKER = "<!-- chainstrip-update-gate -->";

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 16 * 1024 * 1024 });
}

function main() {
  const pr = process.argv[2];
  if (!pr) {
    console.log("gate-pr-comment: no PR number argument; nothing to do");
    return;
  }
  let gate;
  try {
    gate = JSON.parse(readFileSync(".chainstrip/gate-report.json", "utf8"));
  } catch {
    console.log("gate-pr-comment: no gate-report.json (gate did not reach a verdict); leaving comments untouched");
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY;
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null;

  const lines = [MARKER, `## chainstrip update gate: ${gate.overall === "BLOCK" ? "BLOCKED" : "PASS"}`, ""];
  const sg = gate.subGates || {};
  lines.push(
    `${(gate.findings || []).length} finding(s): ${sg.versionBump ?? 0} version bump / ${sg.newDependency ?? 0} new dependency / ${sg.expandedUsage ?? 0} expanded usage`,
  );
  for (const f of gate.findings || []) {
    const label = `${f.dep}${f.candidateVersion ? "@" + f.candidateVersion : ""}`;
    const status = f.blocking ? "BLOCK" : f.approved ? `approved by ${f.approved.by}` : "report";
    lines.push("", `### ${f.blocking ? "BLOCK: " : ""}${label} — ${f.classification}${f.approved ? ` (approved by ${f.approved.by})` : ""}`, "");
    for (const r of f.reasons || []) lines.push(`- ${String(r).replace(/[\r\n]+/g, " ")}`);
    if (!f.reasons?.length) lines.push(`- ${status}`);
  }
  const blocked = (gate.findings || []).filter((f) => f.blocking);
  if (blocked.length > 0) {
    lines.push("", "### To unblock", "", "If a finding is acceptable after review, record a waiver bound to exactly this state and commit it to this PR:", "");
    for (const f of blocked) {
      lines.push("```", `chainstrip update approve ${f.dep}${f.candidateVersion ? "@" + f.candidateVersion : ""} --reason "why this is safe"`, "```");
    }
    lines.push(
      "",
      "then commit `chainstrip-approvals.json` — the gate passes the waived finding on the next run. Any later change to the dep voids the waiver and re-blocks. See `CHAINSTRIP.md` for the full flow.",
    );
  }
  if (runUrl) lines.push("", `Full log and report artifact: ${runUrl}`);
  const body = lines.join("\n") + "\n";

  // Sticky: find our previous comment by marker, update it; else create.
  const existing = JSON.parse(gh(["api", `repos/${repo}/issues/${pr}/comments`, "--paginate"]));
  const mine = existing.find((c) => typeof c.body === "string" && c.body.includes(MARKER));
  if (mine) {
    gh(["api", "--method", "PATCH", `repos/${repo}/issues/comments/${mine.id}`, "-f", `body=${body}`]);
    console.log(`gate-pr-comment: updated comment ${mine.id} on PR #${pr} (${gate.overall})`);
  } else {
    gh(["api", "--method", "POST", `repos/${repo}/issues/${pr}/comments`, "-f", `body=${body}`]);
    console.log(`gate-pr-comment: created comment on PR #${pr} (${gate.overall})`);
  }
}

try {
  main();
} catch (err) {
  // Presentation must never fail the job: the check status already carries the
  // verdict, and the CLI's annotations/summary carry the WHY.
  console.log(`gate-pr-comment: skipped (${err?.message || err})`);
}
