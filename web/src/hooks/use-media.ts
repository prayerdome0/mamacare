import { useEffect, useState } from 'react';
import { isDirectUrl } from '@/services/media/cloudinary';

/**
 * Resolves a stored image reference to something an `<img>` can load.
 *
 * A record may hold any of four things in a photo/document field:
 *  • an absolute URL (Cloudinary delivery, or a Firebase download URL);
 *  • a bare Cloudinary public id at the media-library root;
 *  • `firebase:<object path>` — resolved through Firebase Storage, whose rules
 *    decide whether this user may read it;
 *  • `device:<handle>` — a blob in this browser's store (offline uploads).
 *
 * Components should never have to care which one they were handed.
 */

export interface ResolvedMedia {
  src: string | null;
  loading: boolean;
  failed: boolean;
}

export function useResolvedMedia(reference: string | null | undefined, mimeType?: string): ResolvedMedia {
  const [state, setState] = useState<ResolvedMedia>(() => ({
    src: reference && isDirectUrl(reference) ? reference : null,
    loading: Boolean(reference) && !(reference && isDirectUrl(reference)),
    failed: false,
  }));

  useEffect(() => {
    if (!reference) {
      setState({ src: null, loading: false, failed: false });
      return;
    }
    if (isDirectUrl(reference)) {
      setState({ src: reference, loading: false, failed: false });
      return;
    }

    let cancelled = false;
    setState({ src: null, loading: true, failed: false });

    void import('@/services/media/cloudinary')
      .then(({ resolveAssetUrl }) => resolveAssetUrl({ publicId: reference, mimeType }))
      .then((url) => {
        if (!cancelled) setState({ src: url, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ src: null, loading: false, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [reference, mimeType]);

  return state;
}
