import { getLocale, getTranslator } from '../lib/i18n-server';
import { Icon } from '../components/ui-icon';
import { CobaltSignature } from '../components/cobalt-signature';
import { TryWall } from '../components/try-wall';
import { OpenInvitation } from '../components/open-invitation';
import { CommunityCubeHome } from '../components/community-cube-home';
import styles from './page.module.css';

export default async function HomePage() {
  const t = await getTranslator();
  const locale = await getLocale();
  const steps = [
    [
      'Make an autograph',
      'Draw by hand or upload a photo. Your original upload stays private.',
      'pen',
    ],
    [
      'Review and submit',
      'Check the cleaned preview and send it for moderation. Follow the decision in My autographs.',
      'check',
    ],
    [
      'Choose a place',
      'Open the Wall from your invitation and choose an empty place once your autograph is approved.',
      'grid',
    ],
  ] as const;

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-heading">
        <div className={styles.heroCopy}>
          <h1 id="home-heading">
            {t('Leave your autograph.').slice(0, -1)}
            <span>.</span>
          </h1>
          <p className={styles.description}>
            {t(
              'Draw your autograph and leave it on someone’s Wall. Every Wall has 10 places.',
            )}
          </p>
        </div>
        <CobaltSignature />
      </section>

      <div className={styles.wallLayout}>
        <TryWall />
        <aside
          className={styles.heroActions}
          aria-label={t('Create autograph')}
        >
          <h2>{t('Make an autograph')}</h2>
          <p>
            {t(
              'Draw by hand or upload a photo. Your original upload stays private.',
            )}
          </p>
          <a className="primaryLink" href="/autograph/create">
            <Icon name="pen" size={18} /> {t('Create autograph')}
          </a>
          <OpenInvitation />
        </aside>
      </div>

      <CommunityCubeHome locale={locale} />

      <section className={styles.process} aria-labelledby="how-it-works">
        <div className={styles.sectionHeading}>
          <h2 id="how-it-works" tabIndex={-1}>
            {t('From drawing to Wall')}
          </h2>
          <p>
            {t(
              'With an approved autograph, you can use one free placement on each Wall that has room.',
            )}
          </p>
        </div>
        <ol className={styles.steps} role="list">
          {steps.map(([title, description, icon]) => (
            <li key={title}>
              <span className={styles.stepIcon}>
                <Icon name={icon} size={23} />
              </span>
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
        <a className="actionLink" href="/me/walls">
          {t('Open my Walls')} <Icon name="arrow" size={18} />
        </a>
      </section>
    </main>
  );
}
