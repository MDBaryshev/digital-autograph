# GitHub button for a prepared staging release (EGO-186)

This is a bounded bridge to the **last `start` phase** of the existing manual
release procedure. It does not build a release, transfer private backups, apply
migrations, prepare credentials, or waive their gates. The operator prepares the
accepted main bundle and completes backup/restore and `apply` first, following
[deployment.md](deployment.md). Only a fresh `MIGRATED` operation can be activated.
The owner then uses **Actions → Deploy prepared staging release → Run workflow**
in `MDBaryshev/digital-autograph`, with the operation ID and manifest SHA256.

The previous `Release` remains disabled. Do not restore the old application-VM
runner, Docker/sudo grants, SHA-only deployment or incompatible rollback. The
historical operation `staging-8bae284a-20261030` is `STOPPED` in its original
receipt and had a separately authorized recovery; this bridge refuses to replay
it. Working containers do not justify rewriting that evidence.

## Transport and trust boundary

1. A manual main workflow, on a disposable GitHub-hosted runner, creates a staging
   deployment record. No application source is checked out or executed. The job
   has only contents read, deployment-metadata write and id-token write.
2. Its short-lived GitHub OIDC proof is sent in the private deployment payload,
   never printed or stored in source/artifacts. It authorizes only the dedicated
   audience `https://staging.destka.online/prepared-deployment/OPERATION/MANIFEST_SHA256`; this is an identity
   string, **not a new HTTP endpoint**. The proof expires in minutes. Repository
   readers can see that short-lived payload; it is not a reusable cloud/SSH key.
3. A root-owned oneshot controller on the existing VM polls GitHub over outbound
   HTTPS. No new VM, inbound port, SSH key in Actions, workload federation,
   registry publication or cloud IAM grant is required. The earlier federation
   migration proposal is not a prerequisite for this path. Do not apply its
   custom-sub/federation instructions merely to enable this button.
4. The server verifies the GitHub RSA signature using the fixed issuer's JWKS,
   exact operation/manifest-bound audience, immutable owner/repository IDs, workflow/ref/event, SHA and
   workflow SHA, allowed actor IDs, run ID/attempt, token age and expiry. It verifies the
   current main's latest push CI/Secret Scan runs and six required jobs, the merged
   PR head's latest PR CI/Secret Scan/PR Policy runs and seven required jobs, an
   eligible other developer's exact-head APPROVED review and resolved review
   threads. A newer failed/cancelled required run or job, self-approval, stale head,
   direct main push without the merged reviewed PR or unresolved thread refuses
   activation. Current reviewers are MDBaryshev/s1lmn, excluding the PR author.
5. A separate, root-only operator approval pins one operation, exact manifest
   bytes, source SHA and installed manual-engine hash for at most 15 minutes.
   The controller also pins the existing VM and the two existing staging origins;
   a production host or another VM is refused even if an approval hashes it.
   A workflow edit or repository write permission alone cannot create it. This
   independent server gate remains necessary when GitHub's private-repository
   plan does not provide branch protection. It does not claim branch protection
   has been enabled and does not replace normal protected review where available.
6. Immediately before launch, the server checks the real Actions run: it must
   still be in progress, be the same attempt, and have an allowed triggering
   actor. Cancellation before this check refuses startup. Cancellation after
   STARTING is not an automatic rollback; inspect the actual server outcome.
   Only `/usr/bin/node /opt/digital-autograph/manual-deploy.mjs start MANIFEST`
   can run, with a clean environment and no GitHub token. The installed manual
   engine repeats restore/schema/fence/tool/image/role checks and health checks.
   No request supplies a shell command, URL, tool path, environment, phase or DDL.
7. An exclusive fsynced receipt is written before launch. Lost responses and
   retries reconcile GitHub status only. A crash/unknown result requires operator
   inspection; it never starts again or automatically rolls back. GitHub displays
   success only from the scoped token owner (MDBaryshev118826513), after a
   `HEALTHY` server receipt; arbitrary collaborator/bot status writes are ignored. Request acceptance is not success.

This controller is privileged deployment code, not a sandbox. It can reach the
Docker socket through the already reviewed manual engine. Install only exact
peer-reviewed source, root-owned and not writable by application/CI identities.
Do not run a checkout, arbitrary application script or caller-selected command
inside it. Independent review and actual server acceptance remain required.

## One-time setup

### Partner: one repository-scoped credential

The personal repository owner performs GitHub settings; an Admin collaborator
role is not required. Create a **fine-grained PAT**, with an expiry (for example,
30 days), resource owner MDBaryshev and **only digital-autograph** selected:

| Repository permission | Access           | Use                                           |
| --------------------- | ---------------- | --------------------------------------------- |
| Contents              | Read             | Exact current main                            |
| Actions               | Read             | Exact source/PR workflow runs and latest jobs |
| Pull requests         | Read             | Merged PR, review and thread evidence         |
| Deployments           | Read and write   | Read requests and report deployment metadata  |
| Metadata              | Read (automatic) | Repository identity                           |

CI evidence is read from Actions workflow runs and jobs. A fine-grained PAT
cannot use the Checks API or grant the Checks permission. Select Actions Read
even when an older handoff archive asks for Checks Read. Main evidence requires
push runs, PR evidence requires pull_request runs plus pull_request_target policy.
Manual CI runs are available through Actions → CI → Run workflow and provide
additional test evidence. The release gate separately requires the push/PR runs.

See GitHub's [fine-grained PAT permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens#repository-permissions-for-actions).

No source write, Actions administration, workflows write, organization, billing,
cloud, database or SSH permission is needed. Do not send the PAT in chat, issues,
PRs, screenshots or logs. The operator supplies a one-time public encryption key;
encrypt the PAT to it and return only the ciphertext. Import over the existing
trusted operator SSH session directly into the root-only token file, without
printing it. Revoke/rotate the PAT on expiry or suspected exposure.

The token lives **only on the server**, at
`/etc/digital-autograph/github-deployment-token` (root, 0600/0400), not in API/worker
env, Lockbox runtime grants or GitHub Actions secrets. If it stops working, no
release is activated; the current application is not stopped merely to poll.
Its write capability is deployment metadata, not repository contents. Actions read also exposes repository workflow logs/artifacts, so keep the token limited to this repository and this host.

### Operator: reviewed installation

After peer review/acceptance, install exact reviewed files from this PR:

- `deploy/github-staging-controller.mjs` and `approve-github-staging.mjs` into
  `/opt/digital-autograph/`, root-owned 0644, directory not group/world writable.
- `deploy/github-controller.example.json` as
  `/etc/digital-autograph/github-controller.json`, root-owned 0600; parent 0700.
- The token file privately as above, not as a command-line argument.
- The service/timer into `/etc/systemd/system/`, root-owned 0644.
- `/var/lib/digital-autograph/github-controller`, root-owned 0700.

Verify installed SHA256s against the accepted source and run
`systemd-analyze verify` on both units. Existing application images, Compose,
credentials, receipts, backups, SSH, DNS, IAM and firewall remain unchanged by
this installation. Do not overwrite the existing manual tool bundle as part of
the transport installation.

With **no active approval file**, run the controller once as root; it must return
`IDLE` without making a release request or stopping services. Verify the scoped
PAT's API access privately, then enable only `github-staging-controller.timer`
with systemd. The old Actions runner and old Release remain disabled. This timer
is not an Actions runner and does not accept arbitrary jobs. Before accepting
the bridge, test invalid proof/expired approval and a prepared isolated fixture;
then get one explicit exact live release approval. No live deployment is claimed
by source unit tests or by installation of an idle timer.

## Each release

1. Accept/review the source PR normally; wait for actual final main CI and Secret
   Scan. Build its exact accepted SHA. Prepare a new unique operation on the
   existing VM using the existing manual runbook, including real backup/restore
   and migration gates. Do not create an approval for an old STOPPED receipt.
2. Keep the owner-authorized window and compatible recovery plan. At `MIGRATED`,
   the operator verifies the exact manifest and installed tool hashes and runs:

   ```sh
   sudo node /opt/digital-autograph/approve-github-staging.mjs --approve OPERATION FULL_MAIN_SHA
   ```

   This is the privileged authorization step. It writes a new approval with
   exclusive creation; it never overwrites a previous approval. The operator
   privately archives any resolved old approval before making a new one. Never
   clear an unresolved execution receipt to make a retry work.

3. The helper returns operation, source SHA, manifest SHA256 and expiry, without
   credentials. The owner uses those values in Run workflow, selecting `main`,
   within 15 minutes. Current allowed actor IDs are MDBaryshev118826513 and
   s1lmn210857445. Other actors require a reviewed operator change.
4. The workflow waits for the server's health result. If it times out or reports
   failure, inspect private controller/manual receipts and actual containers;
   never blindly press again, enable old images or repeat DDL. A metadata-only
   response retry may reconcile a completed success without executing start.

## Disable / recovery

Stop/disable **only** `github-staging-controller.timer` and the controller service
after checking whether a release is STARTING. Disabling it while idle does not
stop the application. Revoke the scoped PAT if appropriate. Preserve approvals,
execution receipts and the original manual recovery evidence. If interrupted
while STARTING, use the manual incident procedure and compatible forward recovery;
do not delete the latch or manufacture a healthy receipt.

## Evidence and limits

Portable tests exercise real RSA signatures, claim substitutions, cancelled CI,
peer/self review and unresolved threads. POSIX tests exercise private file paths,
symlinks, changed manifests, one-shot receipts, repeated clicks, poisoned queues,
lost status responses and unknown start outcomes with a synthetic launcher. They
do not certify production restore, timing or live image activation.

The initial bridge has deliberately limited scope: the final activation is a
GitHub button; package preparation, backup/restore and migrations remain operator
steps under the existing runbook. Unattended full-cycle deployment and production
promotion require separate review. Financial/legal publication flags stay closed.

References: [GitHub OIDC claims](https://docs.github.com/en/actions/reference/security/oidc),
[deployments](https://docs.github.com/en/rest/deployments/deployments),
[deployment statuses](https://docs.github.com/en/rest/deployments/statuses),
[fine-grained GraphQL support](https://github.blog/changelog/2023-04-27-graphql-improvements-for-fine-grained-pats-and-github-apps/).
