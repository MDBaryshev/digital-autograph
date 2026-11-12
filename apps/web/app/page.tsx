import { getTranslator } from '../lib/i18n-server';
import { Icon } from '../components/ui-icon';
import { SignatureArt } from '../components/signature-art';
import styles from './page.module.css';

export default async function HomePage() {
  const t = await getTranslator();
  const steps = [
    [
      'Make an autograph',
      'Draw by hand or upload a photo. Your original upload stays private.',
    ],
    [
      'Review and submit',
      'Check the cleaned preview and send it for moderation. Follow the decision in My autographs.',
    ],
    [
      'Choose a place',
      'Open the Wall from your invitation and choose an empty place once your autograph is approved.',
    ],
  ] as const;

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-heading">
        <div className={styles.heroCopy}>
          <h1 id="home-heading">{t('Autograph walls')}</h1>
          <p className={styles.description}>
            {t(
              'Make an autograph and leave it on a creator’s Wall. Walls open from an invitation link.',
            )}
          </p>
          <div className={styles.heroActions}>
            <a className="primaryLink" href="/autograph/create">
              {t('Create autograph')} <Icon name="arrow" size={18} />
            </a>
            <a className={styles.textAction} href="#how-it-works">
              {t('How it works')}
            </a>
          </div>
        </div>

        <figure className={styles.example} aria-labelledby="example-wall">
          <figcaption className={styles.exampleHeader} id="example-wall">
            <span>{t('Example Wall')}</span>
            <span>{t('10 places')}</span>
          </figcaption>
          <ol className={styles.exampleGrid} role="list">
            {Array.from({ length: 10 }, (_, index) => (
              <li
                key={index}
                className={index < 3 ? styles.signed : styles.empty}
              >
                <span className={styles.placeNumber}>{index + 1}</span>
                {index < 3 ? (
                  <>
                    <span className={styles.visuallyHidden}>{t('Signed')}</span>
                    <SignatureArt variant={index} />
                  </>
                ) : (
                  <span className={styles.emptyLabel}>{t('Empty place')}</span>
                )}
              </li>
            ))}
          </ol>
        </figure>
      </section>

      <section className={styles.process} aria-labelledby="how-it-works">
        <div>
          <h2 id="how-it-works" tabIndex={-1}>
            {t('From drawing to Wall')}
          </h2>
          <p>
            {t(
              'With an approved autograph, you can use one free placement on each Wall that has room.',
            )}
          </p>
        </div>
        <ol className={styles.steps}>
          {steps.map(([title, description]) => (
            <li key={title}>
              <h3>{t(title)}</h3>
              <p>{t(description)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.owner} aria-labelledby="home-owner-heading">
        <div>
          <h2 id="home-owner-heading">{t('A Wall of your own')}</h2>
          <p>
            {t(
              'With a public profile, you can prepare a private draft and publish your Wall when it’s ready to share.',
            )}
          </p>
        </div>
        <a className={styles.textAction} href="/me/walls">
          {t('Open my Walls')} <Icon name="arrow" size={18} />
        </a>
      </section>
    </main>
  );
}
