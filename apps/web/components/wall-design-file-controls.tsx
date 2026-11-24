import type { WallDesign } from '@digital-autograph/domain';
import { downloadWallDesignFile } from '../lib/wall-design-file';
import { useLocale } from './locale-provider';
import styles from './wall-design-studio.module.css';

export function WallDesignFileControls({
  design,
  disabled,
  onImport,
}: {
  design: WallDesign;
  disabled?: boolean;
  onImport: (file: File) => void;
}) {
  const { t } = useLocale();
  return (
    <section className={styles.group}>
      <h2>{t('Wall design file')}</h2>
      <label>
        {t('Import design file')}
        <input
          type="file"
          accept=".json,application/json"
          disabled={disabled}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) onImport(file);
          }}
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => downloadWallDesignFile(design)}
      >
        {t('Download design file')}
      </button>
    </section>
  );
}
