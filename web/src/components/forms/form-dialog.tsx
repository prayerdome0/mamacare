import { type ReactNode } from 'react';
import { Modal } from '@/components/ui/overlay';
import { Button } from '@/components/ui/button';
import { NoticeState } from '@/components/ui/display';

/**
 * Dialog shell for every record-creating form: consistent header, footer, busy
 * state, error surface and a guard against losing a half-typed clinical entry.
 */
export function FormDialog({
  open,
  onClose,
  title,
  description,
  children,
  formError,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  submitting,
  dirty,
  onSubmit,
  size = 'lg',
  extraActions,
  notice,
  confirmDiscard,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  formError?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  dirty?: boolean;
  onSubmit: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  extraActions?: ReactNode;
  notice?: { tone: 'info' | 'warning' | 'success' | 'error'; title: string; body: ReactNode } | null;
  confirmDiscard?: () => Promise<boolean>;
}) {
  const attemptClose = async () => {
    if (dirty && confirmDiscard) {
      const ok = await confirmDiscard();
      if (!ok) return;
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : attemptClose}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          {extraActions}
          <Button variant="quiet" onClick={attemptClose} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button type="submit" onClick={onSubmit} loading={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="space-y-5"
        noValidate
      >
        {formError ? (
          <NoticeState tone="error" title="This was not saved">
            {formError}
          </NoticeState>
        ) : null}
        {notice ? <NoticeState tone={notice.tone} title={notice.title}>{notice.body}</NoticeState> : null}
        {children}
        {/* Keeps Enter-to-submit working on single-input forms. */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </Modal>
  );
}

export function FormSection({ title, description, children, columns = 1 }: { title: string; description?: ReactNode; children: ReactNode; columns?: 1 | 2 }) {
  return (
    <section className="rounded-xl border border-ink-200 bg-white p-4">
      <header className="mb-3.5">
        <h3 className="h3">{title}</h3>
        {description ? <p className="muted mt-1">{description}</p> : null}
      </header>
      <div className={columns === 2 ? 'grid gap-4 lg:grid-cols-2' : 'space-y-4'}>{children}</div>
    </section>
  );
}
