import {
  wallDesignFile,
  wallDesignFileFormat,
  wallDesignFileVersion,
} from '@digital-autograph/contracts';
import type { WallDesign } from '@digital-autograph/domain';

const maxFileBytes = 768 * 1024;

async function checkImage(source: string | null) {
  if (!source) return;
  const image = new Image();
  image.src = source;
  await image.decode();
  if (image.naturalWidth * image.naturalHeight > 4 * 1024 * 1024)
    throw Error('INVALID_DESIGN_FILE');
}

export async function readWallDesignFile(file: File): Promise<WallDesign> {
  if (file.size > maxFileBytes) throw Error('INVALID_DESIGN_FILE');
  const { design } = wallDesignFile.parse(JSON.parse(await file.text()));
  await Promise.all([
    checkImage(design.avatarDataUrl),
    checkImage(design.coverDataUrl),
  ]);
  return design;
}

export function downloadWallDesignFile(design: WallDesign) {
  const file = {
    format: wallDesignFileFormat,
    version: wallDesignFileVersion,
    design,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2) + '\n'], {
      type: 'application/json',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'supcube-wall-design.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
