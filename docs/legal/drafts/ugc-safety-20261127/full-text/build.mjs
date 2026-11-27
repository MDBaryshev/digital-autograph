import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build only these unpublished review copies. Never writes source or registry.
const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../../../..');
const folder = 'docs/legal/drafts/ugc-safety-20261127/full-text';
const clausesPath = 'docs/legal/drafts/ugc-safety-20261127/proposed-clauses.md';
const oldManifestPath = 'docs/legal/drafts/ugc-safety-20261127/manifest.json';
const baseCommit = 'a626529196e77c2245df0ec8ec7f40d3fc2a22c4';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const read = (path) =>
  readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
const clauses = read(clausesPath);
const oldManifest = JSON.parse(read(oldManifestPath));
const approvedClauses = oldManifest.drafts.find(
  (entry) => entry.path === clausesPath,
);
if (!approvedClauses || sha256(clauses) !== approvedClauses.sha256) {
  throw new Error('Proposed clauses differ from the EGO-209 manifest');
}
const check = process.argv.includes('--check');
if (process.argv.slice(2).some((argument) => argument !== '--check')) {
  throw new Error('Only --check is supported');
}

function occurrence(text, literal, label) {
  if (!literal || text.split(literal).length !== 2) {
    throw new Error(`Expected exactly one literal occurrence: ${label}`);
  }
  return text.indexOf(literal);
}

function proposed(heading) {
  const anchor = `\n### ${heading}\n\n`;
  const start = occurrence(clauses, anchor, heading) + anchor.length;
  const tail = clauses.slice(start);
  const next = tail.search(/\n#{2,3} /);
  return (next === -1 ? tail : tail.slice(0, next)).trim();
}

function paragraph(source, prefix) {
  const matches = source
    .split('\n\n')
    .filter((block) => block.startsWith(prefix));
  if (matches.length !== 1)
    throw new Error(`Expected one source paragraph: ${prefix}`);
  return matches[0];
}

function paragraphs(text, count, label) {
  const blocks = text.split('\n\n');
  if (blocks.length !== count)
    throw new Error(`Unexpected paragraph count: ${label}`);
  return blocks;
}

function document(sourceFile, title) {
  const path = `docs/legal/public/${sourceFile}`;
  const original = read(path);
  const source = oldManifest.sources.find((entry) => entry.path === path);
  if (!source || sha256(original) !== source.sha256) {
    throw new Error(`Canonical input differs from EGO-209 source: ${path}`);
  }
  const edits = [];
  let body = original;
  return {
    replace(id, before, after, proposalHeading) {
      occurrence(body, before, id);
      if (before === after) throw new Error(`No-op edit: ${id}`);
      body = body.replace(before, after);
      occurrence(body, after, `${id} after`);
      edits.push({
        id,
        operation: 'literal-replace-once',
        proposal_heading: proposalHeading,
        before,
        after,
      });
    },
    insertBefore(id, heading, insertion, proposalHeading) {
      this.replace(
        id,
        `\n\n${heading}\n\n`,
        `\n\n${insertion}\n\n${heading}\n\n`,
        proposalHeading,
      );
    },
    original,
    finish() {
      // Independently reverse all mapped changes and prove the remaining source
      // is byte-identical after the documented CRLF -> LF checkout conversion.
      let restored = body;
      for (const edit of [...edits].reverse()) {
        occurrence(restored, edit.after, `${edit.id} reverse`);
        restored = restored.replace(edit.after, edit.before);
      }
      if (restored !== original)
        throw new Error(`Unmapped source change: ${path}`);
      const banner =
        `# ${title} — полный проект для проверки\n\n` +
        '> **НЕ ОПУБЛИКОВАНО. Требуются юридическая и эксплуатационная приёмка.**\n> Дата сборки проекта: 27.11.2026; это не дата вступления условий в силу.\n> Исходный документ: Destka, 10.10.2026. Сохранённые ниже обозначения\n> «Редакция 1.0», даты и формулировки о вступлении в силу относятся к исходному\n> тексту; изменённому проекту новая legal identity не присвоена.\n> Сборка включает только вставки и замены из проекта EGO-209, а не их юридическое\n> утверждение. Публикация, включение функций и изменение согласий не выполнялись.\n\n' +
        `Источник: \`${path}\`. Предлагаемые положения: \`../proposed-clauses.md\`.\n\n` +
        '<!-- prettier-ignore-start -->\n\n<!-- BEGIN PROPOSED FULL TEXT -->\n\n';
      const suffix =
        '\n<!-- END PROPOSED FULL TEXT -->\n\n<!-- prettier-ignore-end -->\n';
      const output = banner + body + suffix;
      const outputPath = `${folder}/${sourceFile}`;
      if (check) {
        if (read(outputPath) !== output)
          throw new Error(`Full-text output differs: ${outputPath}`);
      } else writeFileSync(resolve(root, outputPath), output);
      return {
        source: path,
        source_sha256: sha256(original),
        output: outputPath,
        edits,
      };
    },
  };
}

const offer = document('public-offer-destka-20261010.md', 'Публичная оферта');
offer.insertBefore(
  'offer-3.8-3.10',
  '4. Цена, оплата и кассовый чек',
  proposed('Дополнить раздел 3 пунктами 3.8–3.10'),
  'Дополнить раздел 3 пунктами 3.8–3.10',
);
offer.insertBefore(
  'offer-5.14',
  '6. Ответственность сторон',
  proposed('Дополнить раздел 5 пунктом 5.14'),
  'Дополнить раздел 5 пунктом 5.14',
);
const [offer64, offer67] = paragraphs(
  proposed('Заменить пункт 6.4 и дополнить пунктом 6.7'),
  2,
  'offer 6.4/6.7',
);
offer.replace(
  'offer-6.4',
  paragraph(offer.original, '6.4. Возможность применения'),
  offer64,
  'Заменить пункт 6.4 и дополнить пунктом 6.7',
);
offer.insertBefore(
  'offer-6.7',
  '7. Обстоятельства непреодолимой силы',
  offer67,
  'Заменить пункт 6.4 и дополнить пунктом 6.7',
);

const rules = document(
  'content-rules-destka-20261010.md',
  'Правила размещения контента',
);
const introduction = paragraph(
  rules.original,
  'Настоящие Правила устанавливают',
);
rules.replace(
  'rules-introduction',
  introduction,
  introduction +
    '\n\n' +
    proposed('Дополнить вводную часть после первого абзаца'),
  'Дополнить вводную часть после первого абзаца',
);
const rule9Heading =
  'В разделе 9 заменить абзацы о URL/QR, рекламе и запрещённом продвижении';
const rule9 = paragraphs(proposed(rule9Heading), 5, 'rules 9');
rules.replace(
  'rules-9-urls',
  paragraph(
    rules.original,
    'На текущем этапе в Автографах запрещены пользовательские QR-коды',
  ),
  rule9.slice(0, 2).join('\n\n'),
  rule9Heading,
);
rules.replace(
  'rules-9-advertising',
  paragraph(
    rules.original,
    'Без предварительного согласования с Исполнителем запрещены рекламные',
  ),
  rule9[2],
  rule9Heading,
);
rules.replace(
  'rules-9-prohibited-promotion',
  paragraph(
    rules.original,
    'Запрещён контент, продвигающий наркотические средства',
  ),
  rule9.slice(3).join('\n\n'),
  rule9Heading,
);
const rule12Heading =
  'В разделе 12 заменить абзацы об автоматизации, повторной проверке и мерах';
const rule12 = paragraphs(proposed(rule12Heading), 4, 'rules 12');
rules.replace(
  'rules-12-automation',
  paragraph(
    rules.original,
    'Платформа может использовать автоматизированные средства проверки',
  ),
  rule12[0],
  rule12Heading,
);
rules.replace(
  'rules-12-recheck',
  paragraph(
    rules.original,
    'Опубликованный контент может быть проверен повторно',
  ),
  rule12[1],
  rule12Heading,
);
rules.replace(
  'rules-12-measures',
  paragraph(
    rules.original,
    'В зависимости от тяжести, характера, повторяемости и риска нарушения',
  ),
  rule12.slice(2).join('\n\n'),
  rule12Heading,
);
rules.insertBefore(
  'rules-13-reporting',
  '14. Заявления о нарушении авторских и смежных прав',
  proposed('Дополнить раздел 13; существующий адрес обращения не заменять'),
  'Дополнить раздел 13; существующий адрес обращения не заменять',
);
rules.insertBefore(
  'rules-15-appeals',
  '16. Оплаченный и бесплатный контент',
  proposed('Дополнить раздел 15'),
  'Дополнить раздел 15',
);

const terms = document(
  'user-agreement-destka-20261010.md',
  'Пользовательское соглашение',
);
terms.insertBefore(
  'terms-moderation',
  'Жалобы и заявления правообладателей',
  proposed('Дополнить раздел «Модерация»'),
  'Дополнить раздел «Модерация»',
);
terms.insertBefore(
  'terms-liability',
  'Обстоятельства непреодолимой силы',
  proposed('Дополнить раздел «Ответственность»'),
  'Дополнить раздел «Ответственность»',
);
const preserveInstruction = proposed(
  'При подготовке полной редакции сохранить раздел об изменении Соглашения',
);
const preserveStart = occurrence(
  terms.original,
  '\n\nИзменение настоящего Соглашения\n\n',
  'terms change section',
);
const preserveEnd = occurrence(
  terms.original,
  '\n\nИерархия документов\n\n',
  'terms hierarchy section',
);
const preservedSection = terms.original.slice(preserveStart, preserveEnd);

const refund = document(
  'refund-policy-destka-20261010.md',
  'Политика возвратов',
);
refund.insertBefore(
  'refund-6-content-restriction',
  '7. После окончания Гарантированного периода видимости',
  proposed('Дополнить раздел об удалении или ограничении контента'),
  'Дополнить раздел об удалении или ограничении контента',
);

const documents = [offer, rules, terms, refund].map((item) => item.finish());
if (!read(documents[2].output).includes(preservedSection))
  throw new Error('Terms change section was not preserved');
const map = {
  schema_version: 1,
  issue: 'EGO-215',
  status: 'unpublished/lawyer-and-implementation-acceptance-required',
  base_pull_request: 'https://github.com/MDBaryshev/digital-autograph/pull/34',
  base_commit: baseCommit,
  source_edition_date: '2026-10-10',
  assembly_date: '2026-11-27',
  new_legal_identity_assigned: false,
  normalization:
    'Input checkout CRLF is converted to LF only; all other source bytes are preserved except exact mapped replacements. Output is UTF-8 LF.',
  clauses: { path: clausesPath, sha256: sha256(clauses) },
  documents,
  preserved_instruction: {
    proposal_heading:
      'При подготовке полной редакции сохранить раздел об изменении Соглашения',
    operation: 'preserve-no-edit',
    instruction_not_inserted_as_contract_text: preserveInstruction,
    source_section_exact_text: preservedSection,
  },
};
const mapText = JSON.stringify(map, null, 2) + '\n';
if (check) {
  if (read(`${folder}/edits.json`) !== mapText)
    throw new Error('Exact edit map differs');
} else writeFileSync(resolve(here, 'edits.json'), mapText);
console.log(
  `Verified ${documents.length} unpublished full-text drafts and ${documents.reduce((sum, item) => sum + item.edits.length, 0)} exact edits; reverse reconstruction matches all four sources.`,
);
