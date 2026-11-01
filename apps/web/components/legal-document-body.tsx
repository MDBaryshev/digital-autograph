import styles from './legal-pages.module.css';

function isSectionTitle(block: string): boolean {
  // Numbered section headings are present in source DOCX exports.
  // Never interpret Markdown/HTML or rewrite the canonical API text.
  return (
    !block.includes('\n') &&
    block.length <= 140 &&
    /^\d{1,2}\.\s+\S/u.test(block)
  );
}

export function LegalDocumentBody({ text }: { text: string }) {
  // The API verifies the immutable byte hash before this presentation-only split.
  // Paragraphs are rendered as ordinary React text, not trusted HTML.
  const blocks = text.split(/\r?\n[ \t]*\r?\n/u).filter((block) => block.length > 0);

  return (
    <div className={styles.documentBody}>
      {blocks.map((block, index) =>
        isSectionTitle(block) ? (
          <h2 className={styles.sectionTitle} key={index}>
            {block}
          </h2>
        ) : (
          <p className={styles.paragraph} key={index}>
            {block}
          </p>
        ),
      )}
    </div>
  );
}
