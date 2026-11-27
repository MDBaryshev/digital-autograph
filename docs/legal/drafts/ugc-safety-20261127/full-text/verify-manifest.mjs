import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read-only: no regeneration, staging, writes, subprocess build, or network.
const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../../../..');
const folder = 'docs/legal/drafts/ugc-safety-20261127/full-text';
const base = 'a626529196e77c2245df0ec8ec7f40d3fc2a22c4';
if (process.argv.slice(2).some((arg) => arg !== '--check'))
  throw new Error('Only --check is supported');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) =>
  Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const read = (path) => readFileSync(resolve(root, path));
const git = (...args) => execFileSync('git', args, { cwd: root });
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const manifest = JSON.parse(read(`${folder}/manifest.json`));
assert(
  manifest.schema_version === 1 && manifest.issue === 'EGO-215',
  'Identity',
);
assert(manifest.base_commit === base, 'Unexpected base commit');
assert(
  manifest.status ===
    'unpublished/lawyer-and-implementation-acceptance-required' &&
    manifest.artifact_type === 'proposed-full-text-review-copies' &&
    manifest.new_legal_identity_assigned === false &&
    manifest.publication_approved === false &&
    manifest.legal_acceptance === 'required' &&
    manifest.implementation_acceptance === 'required' &&
    manifest.canonical_sources_changed === false &&
    manifest.publication_registry_changed === false &&
    manifest.original_docx_changed === false,
  'Draft-only / immutable-source flags changed',
);
assert(
  manifest.publication_blockers.some(
    (item) => item.id === 'auth-privacy-alignment',
  ) &&
    manifest.publication_blockers.some(
      (item) => item.id === 'source-placeholders',
    ),
  'Missing known publication blockers',
);
const scopes = [
  'docs/legal/public',
  'docs/legal/security',
  'docs/legal/sources',
  'docs/legal/destka-source-map.json',
  'docs/legal/destka-source-integrity.json',
  'packages/config/src/legal-documents.json',
  'docs/legal/drafts/ugc-safety-20261127',
];
const protectedPaths = git(
  'ls-tree',
  '-r',
  '-z',
  '--name-only',
  base,
  '--',
  ...scopes,
)
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .sort();
assert(
  JSON.stringify(manifest.protected_files.map((item) => item.path).sort()) ===
    JSON.stringify(protectedPaths),
  'Protected-file inventory differs from pinned Git tree',
);
let rawMatches = 0;
function checkRecord(record, blob) {
  const checkout = read(record.path);
  if (hash(checkout) === record.checkout_raw_sha256) rawMatches++;
  if (record.encoding === 'opaque-bytes') {
    assert(
      hash(checkout) === record.checkout_raw_sha256,
      `Raw bytes: ${record.path}`,
    );
  } else {
    assert(
      hash(lf(checkout)) === record.lf_sha256,
      `LF content: ${record.path}`,
    );
    assert(
      !checkout.includes(0) && !checkout.toString('utf8').includes('\uFFFD'),
      `Unsupported text encoding: ${record.path}`,
    );
  }
  if (blob) {
    assert(hash(blob) === record.git_blob_sha256, `Git blob: ${record.path}`);
    assert(
      record.encoding === 'opaque-bytes'
        ? blob.equals(checkout)
        : lf(blob).equals(lf(checkout)),
      `Protected source changed: ${record.path}`,
    );
  }
}
for (const record of manifest.protected_files)
  checkRecord(record, git('cat-file', 'blob', `${base}:${record.path}`));
const outputNames = [
  'public-offer-destka-20261010.md',
  'content-rules-destka-20261010.md',
  'user-agreement-destka-20261010.md',
  'refund-policy-destka-20261010.md',
];
const expectedArtifacts = [
  ...outputNames,
  'README.md',
  'edits.json',
  'build.mjs',
  'verify-manifest.mjs',
]
  .map((name) => `${folder}/${name}`)
  .sort();
assert(
  JSON.stringify(manifest.artifacts.map((item) => item.path).sort()) ===
    JSON.stringify(expectedArtifacts),
  'Unexpected artifact inventory',
);
for (const record of manifest.artifacts) checkRecord(record);
const map = JSON.parse(read(`${folder}/edits.json`));
const clauses = lf(read(map.clauses.path)).toString('utf8');
assert(
  hash(Buffer.from(clauses)) === map.clauses.sha256,
  'Proposed clauses hash',
);
const occurrence = (text, needle, label) => {
  assert(
    needle.length > 0 && text.split(needle).length === 2,
    `Not unique: ${label}`,
  );
  return text.indexOf(needle);
};
const headings = new Set();
let edits = 0;
for (const doc of map.documents) {
  assert(
    outputNames.includes(doc.output.slice(folder.length + 1)),
    'Unexpected output',
  );
  const original = lf(read(doc.source)).toString('utf8');
  assert(
    hash(Buffer.from(original)) === doc.source_sha256,
    `Map source: ${doc.source}`,
  );
  const full = lf(read(doc.output)).toString('utf8');
  const begin = '<!-- BEGIN PROPOSED FULL TEXT -->\n\n';
  const end = '\n<!-- END PROPOSED FULL TEXT -->';
  let restored = full.slice(
    occurrence(full, begin, doc.output) + begin.length,
    occurrence(full, end, doc.output),
  );
  for (const edit of [...doc.edits].reverse()) {
    occurrence(restored, edit.after, edit.id);
    restored = restored.replace(edit.after, edit.before);
    headings.add(edit.proposal_heading);
    edits++;
  }
  assert(restored === original, `Reverse reconstruction: ${doc.source}`);
}
let paragraphs = 0;
for (const heading of headings) {
  const anchor = `\n### ${heading}\n\n`;
  const start = occurrence(clauses, anchor, heading) + anchor.length;
  const tail = clauses.slice(start);
  const next = tail.search(/\n#{2,3} /);
  const blocks = (next === -1 ? tail : tail.slice(0, next))
    .trim()
    .split('\n\n');
  const targetDocs = map.documents.filter((doc) =>
    doc.edits.some((edit) => edit.proposal_heading === heading),
  );
  assert(targetDocs.length === 1, `Ambiguous clause target: ${heading}`);
  const output = lf(read(targetDocs[0].output)).toString('utf8');
  for (const block of blocks) occurrence(output, block, heading);
  paragraphs += blocks.length;
}
assert(
  map.documents.length === 4 &&
    edits === 16 &&
    headings.size === 11 &&
    paragraphs === 24 &&
    manifest.assembly.documents === 4 &&
    manifest.assembly.literal_edits === 16 &&
    manifest.assembly.substantive_sections === 11 &&
    manifest.assembly.clause_paragraphs === 24,
  'Unexpected assembly counts',
);
assert(
  map.preserved_instruction.operation === 'preserve-no-edit',
  'Editorial instruction',
);
const terms = lf(read(map.documents[2].output)).toString('utf8');
assert(
  !terms.includes(
    map.preserved_instruction.instruction_not_inserted_as_contract_text,
  ) && terms.includes(map.preserved_instruction.source_section_exact_text),
  'Editorial instruction inserted or preserved section changed',
);
const changed = git('diff', '--name-only', base, '--', ...scopes)
  .toString('utf8')
  .trim()
  .split('\n')
  .filter((path) => path && !path.startsWith(`${folder}/`))
  .join('\n');
assert(!changed, `Tracked protected paths changed: ${changed}`);
console.log(
  `Manifest verified read-only: ${manifest.protected_files.length} protected files; 8 artifacts; 4 drafts / 16 edits / 11 sections / 24 paragraphs; ${rawMatches} exact checkout raw hashes. Text comparison permits CRLF -> LF only; no legal or operational acceptance.`,
);
