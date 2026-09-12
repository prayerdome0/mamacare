import { useCallback, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, ErrorState, ProgressBar } from '@/components/ui/display';
import { uploadImage } from '@/services/media/media-service';
import { mediaSetupInstructions, type MediaFolder } from '@/services/media/cloudinary';
import { validateFile, MAX_IMAGE_BYTES, IMAGE_ACCEPTED_MIME } from '@/lib/validation';
import { formatBytes } from '@/lib/utils';
import { AppImage } from '@/components/media/app-image';
import type { UploadedAsset } from '@/services/media/cloudinary';
import type { MediaFolder as _MediaFolder } from '@/services/media/cloudinary';

export interface ImageUploadResult {
  publicId: string | null;
  secureUrl: string | null;
  localHandle?: string | null;
  storage?: UploadedAsset['storage'];
  bytes?: number;
}

/**
 * Single-image picker with validation, real upload progress and a stored-where
 * banner. Used for mother photos, facility imagery and education covers.
 */
export function ImageUploader({
  folder,
  value,
  onChange,
  hint,
  ratio = '4 / 3',
  label = 'Image',
  disabled,
}: {
  folder: _MediaFolder;
  value: ImageUploadResult | null;
  onChange: (result: ImageUploadResult | null) => void;
  hint?: string;
  ratio?: string;
  label?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<'idle' | 'validating' | 'uploading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const start = useCallback(
    async (picked: File) => {
      setFile(picked);
      setError(null);
      setProgress(0);
      setState('validating');
      const invalid = validateFile(picked, {
        accept: IMAGE_ACCEPTED_MIME,
        maxBytes: MAX_IMAGE_BYTES,
      });
      if (invalid) {
        setState('error');
        setError(invalid);
        return;
      }
      setState('uploading');
      try {
        const asset = await uploadImage(picked, folder as Extract<MediaFolder, 'profiles' | 'facilities' | 'education' | 'branding' | 'public'>, picked.name);
        onChange({
          publicId: asset.publicId,
          secureUrl: asset.secureUrl ?? null,
          localHandle: asset.localHandle ?? null,
          storage: asset.storage,
          bytes: asset.bytes,
        });
        setState('done');
        setProgress(100);
      } catch (caught) {
        setState('error');
        setError(caught instanceof Error ? caught.message : 'The upload failed. Please try again.');
      }
    },
    [folder, onChange],
  );

  // A stored reference (`firebase:…`, `device:…`, a Cloudinary id) is resolved
  // by <AppImage>; only a fresh local file needs an object URL here.
  const previewSrc = value?.secureUrl ?? value?.localHandle ?? (file ? URL.createObjectURL(file) : null);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="label !mb-0">{label}</p>
        {value?.storage ? (
          <Badge tone={value.storage === 'device' ? 'amber' : 'green'}>
            {value.storage === 'cloudinary' ? 'Cloudinary' : value.storage === 'firebase' ? 'Firebase Storage' : 'This device only'}
          </Badge>
        ) : null}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped) void start(dropped);
        }}
        className={`mt-2 rounded-xl border border-dashed p-3 transition-colors ${dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-ink-300 bg-ink-50/60'}`}
      >
        {previewSrc ? (
          <div className="flex items-start gap-3">
            <div className="w-40 shrink-0">
              <AppImage src={previewSrc ?? value?.publicId ?? null} alt={`${label} preview`} ratio={ratio} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[0.82rem] font-semibold text-ink-800">{file?.name ?? 'Stored image'}</p>
              <p className="caption mt-0.5 break-all">
                {value?.publicId ?? value?.localHandle ?? 'pending upload'}
                {value?.bytes ? ` · ${formatBytes(value.bytes)}` : ''}
              </p>
              {state === 'uploading' || state === 'validating' ? (
                <ProgressBar value={progress || 12} className="mt-2.5" label={state === 'validating' ? 'Checking the file' : 'Uploading'} />
              ) : null}
              {state === 'error' ? <ErrorState message={error ?? 'Upload failed.'} compact className="mt-2" onRetry={() => file && void start(file)} /> : null}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={disabled || state === 'uploading'} icon={<RefreshCw className="size-3.5" aria-hidden />}>
                  Replace
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => {
                    onChange(null);
                    setFile(null);
                    setState('idle');
                    setError(null);
                  }}
                  icon={<Trash2 className="size-3.5" aria-hidden />}
                >
                  Remove
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="flex w-full flex-col items-center gap-2 px-4 py-6 text-center disabled:opacity-60"
          >
            {state === 'uploading' ? <Loader2 className="size-5 animate-spin text-brand-700" aria-hidden /> : <ImageIcon className="size-5 text-ink-400" aria-hidden />}
            <span className="text-[0.86rem] font-semibold text-ink-800">Choose or drop an image</span>
            <span className="caption max-w-sm">JPEG, PNG, WebP or HEIC up to {formatBytes(MAX_IMAGE_BYTES)}, validated before upload. Public imagery goes to Cloudinary; clinical files go to Firebase Storage.</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) void start(picked);
            event.target.value = '';
          }}
        />
      </div>

      {hint ? <p className="hint">{hint}</p> : null}
      {state === 'idle' && !value ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[0.76rem] font-semibold text-ink-500 hover:text-ink-800">Where will this be stored?</summary>
          {/* Long configuration keys: wrap them rather than making the page scroll. */}
          <pre className="break-anywhere mt-1.5 max-h-64 overflow-y-auto rounded-lg bg-ink-100 p-2.5 text-[0.72rem] leading-relaxed whitespace-pre-wrap text-ink-600">
{mediaSetupInstructions()}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export { Upload as UploadIcon };
