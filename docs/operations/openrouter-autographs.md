# OpenRouter autograph features (EGO-176)

Two server-only features, disabled by default. They do not deploy or activate payments, legal publication or creator admission.

## Configuration and privacy

Supply `OPENROUTER_API_KEY` through the API server's private environment, never a browser variable or a committed file. Set `OPENROUTER_IMAGE_MODEL` to an explicitly chosen OpenRouter image-output model and `OPENROUTER_MODERATION_MODEL` to a vision model supporting JSON output. No model name is guessed. Independently enable `AI_AUTOGRAPH_GENERATION_ENABLED=true` and/or `AI_AUTOGRAPH_MODERATION_ENABLED=true`. Incomplete enabled configuration fails startup and `--check-config`, with values redacted.

Moderation also requires `AI_MODERATOR_USER_ID`: a dedicated, clearly named AI service account with an existing platform moderator role. No code creates a user or grants a role. Do not reuse a real person's identity. Ordinary role/status checks run before disclosure and again at decision time. Provider output is untrusted. Original uploads, signed URLs, object keys, cookies and user IDs are never sent to OpenRouter. Only the owner-approved cleaned PNG is sent for moderation; a submitted nickname is sent for generation. The UI explains these transfers. Before enabling on real data, configure the deployment's privacy notice, provider agreement and restricted API key budget. Calls require no data collection and disable provider fallback; incompatible models fail closed.

The endpoint is fixed to HTTPS OpenRouter, redirects are refused, response reads are bounded to 4 MiB and each model call has a 60-second deadline. No model-generated remote URL is fetched: generation accepts inline PNG only, at most 2 MiB per image. Existing image processing checks the selected image's actual dimensions/format. Errors/logs never include the key, nickname, image or provider diagnostics. No live provider calls have been made in development validation.

## Generation

A signed-in user explicitly requests three styles by nickname. The POST is protected by the existing Origin and first-use guards and returns 202 immediately; polling GET requests are scoped to that same owner and use no-store. Request UUID plus nickname hash prevent duplicate dispatch. There are three sequential image calls, with no automatic provider retries. The UI never uploads, approves or places an image merely because it was generated or selected. Selecting a variant provides a PNG blob to the existing `photo` private upload/processing/cleaned-preview/owner-approval flow. Drawing and photo editing remain available.

PostgreSQL serializes admission across API instances: at most 3 batches per user per UTC day and 20 batches globally (up to 60 image calls). These are request budgets, not a currency cap; configure a provider-side spending limit. Pending and failed batches consume budget. A crash/unknown result is not automatically retried; the same UUID cannot trigger another charge. Successful results can be replayed by their owner for one hour. Image results are removed by the running API cleanup cycle after an hour; metadata remains for quotas. Nicknames themselves are not persisted. An API crash can leave a pending job; the UI times out and retains drawing as fallback. After an uncertain outcome, an operator must inspect before authorizing any new spend; changing the nickname explicitly starts a new budgeted request.

## Automated moderation

The API runs a bounded one-item cycle every ten seconds with no overlapping cycles per process. Durable uniqueness on the cleaned asset prevents duplicate provider dispatch across instances, even after a crash or actor configuration change. AI request/model/asset/policy-version/verdict evidence is saved before attempting an ordinary moderation decision. Completed moderation evidence is immutable in PostgreSQL. It is separate from human evidence and never portrayed as a human review.

Only a valid approved/rejected verdict with confidence >= 0.95 may enter the existing transactional decision path. Manual, malformed, lower-confidence, oversized-image and provider-failure cases remain in the manual queue. There is no automatic approval on outage. The eight existing rejection codes are the only accepted reasons; prompts reject real bank/legal/passport samples without claiming handwriting/identity verification. The numerical threshold is a conservative routing rule, not calibrated accuracy evidence: review representative labeled samples before production activation. A concurrent human decision wins through existing row locking/immutable evidence. Model results are recorded as assessments; a recorded result does not by itself prove it was applied. No Slot, Order, financial ledger or refund writer is added.

At most 200 moderation attempts per UTC day globally; uncertainty stays charged and is not automatically retried. A dedicated actor's access can be revoked to stop future moderation. Disabling the feature prevents new cycles; stop/restart API instances and wait for any in-flight cycle before changing policy. A shutdown waits for bounded running calls and never applies a late verdict once shutdown begins.

## Schema and deployment

Migration 0024 adds the durable request/audit table, a unique moderation-asset index and immutable evidence trigger. API receives SELECT/INSERT and only state/result/finished_at UPDATE on that table; worker privileges do not change. Manual tooling recognizes both the existing 24-migration release and this 25-migration release; migration receipt/hash comparisons remain mandatory. Build the manifest from the exact reviewed source; never reuse the PR92 manifest for AI source.

PR92 release preparation is separate: accepted SHA f476c50a0f2ec9611289611cd07dd134233bcd03 has only migrations 0000–0023. Do not include this unaccepted AI migration in that operation. No existing deployment receipt may be replayed. Real rollout and key/model activation require a concrete accepted release and operator configuration.
