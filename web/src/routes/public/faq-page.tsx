import { Link } from 'react-router-dom';
import { PublicShell } from '@/components/layout/public-shell';
import { FaqList } from '@/routes/public/faq';

export default function FaqPage() {
  return (
    <PublicShell>
      <section className="shell py-14 sm:py-20">
        <div className="max-w-3xl">
          <p className="eyebrow mb-3">Questions</p>
          <h1 className="display mb-4">What people ask us</h1>
          <p className="lede mb-8">
            Answers about how MAMA CARE is used by clinics, what happens to a record, and what is never asked of you.
          </p>
          <FaqList />
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/contact" className="btn btn-primary">
              Ask us something else
            </Link>
            <Link to="/privacy" className="btn btn-secondary">
              How records are protected
            </Link>
            <Link to="/emergency" className="btn btn-quiet">
              Emergency guidance
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
