/**
 * Provider directory (public).
 *
 * Only APPROVED providers who have opted into the directory appear here, and only
 * the fields a patient legitimately needs: name, profession, facility, town,
 * languages and whether they are accepting new patients. Direct phone numbers are
 * shown only for verified providers — otherwise contact goes through Mama Care
 * messaging, so the conversation stays part of the care record.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { useAsync } from '@/hooks';
import { facilityRepo, providerRepo } from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { PROFESSION_LABELS, type Facility, type HealthcareProvider, type Profession } from '@/types/domain';
import { PROVINCES, directionsUrl } from '@/config/facilities';
import { PublicHero } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { SearchInput, Select } from '@/components/ui/form';
import { initials, titleCase } from '@/lib/utils';

const PROFESSION_ORDER: Profession[] = ['doctor', 'midwife', 'nurse', 'maternal-educator', 'community-health-worker', 'pharmacist'];

export default function ProvidersPage() {
  const { data, loading, error, retryable, run } = useAsync(() => providerRepo.directory(), { deps: [] });
  const { data: facilities } = useAsync(() => facilityRepo.list(), { deps: [] });
  const { actor } = useSession();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [profession, setProfession] = useState<Profession | ''>('');
  const [province, setProvince] = useState('');
  const [acceptingOnly, setAcceptingOnly] = useState(false);

  const providers = useMemo<HealthcareProvider[]>(() => data ?? [], [data]);
  const facilityById = useMemo(() => new Map((facilities ?? []).map((facility: Facility) => [facility.id, facility])), [facilities]);

  const results = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return providers
      .filter((provider) => (profession ? provider.profession === profession : true))
      .filter((provider) => (acceptingOnly ? provider.acceptingNewPatients : true))
      .filter((provider) => (province ? facilityById.get(provider.facilityId ?? '')?.province === province : true))
      .filter((provider) =>
        needle
          ? [provider.fullName, provider.title ?? '', provider.facilityName, provider.bio ?? '', ...provider.languages]
              .join(' ')
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [providers, facilityById, search, profession, province, acceptingOnly]);

  useEffect(() => {
    document.title = 'Find a healthcare provider · Mama Care';
  }, []);

  const message = (provider: HealthcareProvider): void => {
    if (!provider.userId) return;
    if (!actor) {
      navigate('/register', { state: { from: '/providers' } });
      return;
    }
    navigate(`/app/messages?to=${provider.userId}&name=${encodeURIComponent(provider.fullName)}`);
  };

  return (
    <>
      <PublicHero
        eyebrow="Providers"
        title="Midwives, nurses and doctors on Mama Care"
        lede="Verified healthcare providers who accept messages through Mama Care. Ask a question, confirm an appointment, or describe a symptom you are unsure about — and get an answer from a professional rather than a search engine."
        image={<AppImage name="midwife" alt="A midwife examining a pregnant woman at a clinic" ratio="4 / 3" />}
      />

      <section className="shell py-8">
        <Card className="card-pad">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <p className="label">Search</p>
              <SearchInput value={search} onValueChange={setSearch} placeholder="Search name, facility or language" />
            </div>
            <div>
              <label className="label" htmlFor="provider-profession">
                Profession
              </label>
              <Select
                id="provider-profession"
                value={profession}
                onChange={(event) => setProfession(event.target.value as Profession | '')}
                options={[
                  { value: '', label: 'All professions' },
                  ...PROFESSION_ORDER.map((item) => ({ value: item, label: PROFESSION_LABELS[item] })),
                ]}
              />
            </div>
            <div>
              <label className="label" htmlFor="provider-province">
                Province
              </label>
              <Select
                id="provider-province"
                value={province}
                onChange={(event) => setProvince(event.target.value)}
                options={[{ value: '', label: 'All provinces' }, ...PROVINCES.map((item) => ({ value: item, label: item }))]}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className={acceptingOnly ? 'chip chip-active' : 'chip'}
              aria-pressed={acceptingOnly}
              onClick={() => setAcceptingOnly((value) => !value)}
            >
              <UserPlus className="size-3.5" aria-hidden /> Accepting new patients
            </button>
            <p className="text-sm text-ink-600">
              {loading ? 'Loading providers…' : `${results.length} ${results.length === 1 ? 'provider' : 'providers'} listed`}
            </p>
          </div>
        </Card>

        {error ? (
          <ErrorState className="mt-4" title="The directory could not be loaded" message={error} onRetry={retryable ? run : undefined} />
        ) : null}
        {loading ? <LoadingRows className="mt-4" rows={4} /> : null}
        {!loading && !error && results.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon={<Search className="size-6" aria-hidden />}
            title="No providers match that search"
            description="Try a different profession or province. New providers join as their documents are verified by an administrator."
          />
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {results.map((provider) => {
            const facility = facilityById.get(provider.facilityId ?? '');
            const location = [facility?.city, facility?.province].filter(Boolean).join(' · ');
            return (
              <Card key={provider.id} className="card-pad">
                <div className="flex items-start gap-3">
                  {provider.photoUrl ? (
                    <img src={provider.photoUrl} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="avatar-lg bg-brand-600 text-brand-50" aria-hidden>
                      {initials(provider.fullName)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="card-title">{titleCase(provider.fullName)}</h3>
                      {provider.status === 'approved' ? (
                        <Badge tone="green">
                          <ShieldCheck className="size-3" aria-hidden /> Verified
                        </Badge>
                      ) : null}
                      {provider.acceptingNewPatients ? <Badge tone="brand">Accepting patients</Badge> : null}
                    </div>
                    <p className="text-sm text-ink-600">
                      {[provider.title, PROFESSION_LABELS[provider.profession]].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {[provider.facilityName, location].filter(Boolean).join(' · ') || 'Independent practice'}
                    </p>
                  </div>
                </div>

                {provider.bio ? <p className="mt-3 text-sm leading-relaxed text-ink-700">{provider.bio}</p> : null}

                {provider.languages.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {provider.languages.map((language) => (
                      <Badge key={language} tone="neutral">
                        {language}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {provider.userId ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => message(provider)}
                      icon={<MessageCircle className="size-4" aria-hidden />}
                    >
                      Send a message
                    </Button>
                  ) : null}
                  {provider.phone && provider.status === 'approved' ? (
                    <a href={`tel:${provider.phone}`} className="btn btn-secondary btn-sm">
                      Call {provider.phone}
                    </a>
                  ) : null}
                  {facility ? (
                    <a
                      href={directionsUrl(facility)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn btn-secondary btn-sm"
                    >
                      Directions
                    </a>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-10">
          <SectionHeading eyebrow="Before you message" title="How provider messaging works" />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Card className="card-pad">
              <ul className="checklist">
                {[
                  'Your message and the reply stay inside Mama Care, attached to your care record.',
                  'A provider only sees patients who have linked their care to them.',
                  'Messages are not monitored in real time — for an emergency, call or go in.',
                  'Mama Care can moderate or remove messages that breach the conduct policy.',
                ].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
            <Card className="card-pad">
              <h3 className="card-title">Are you a provider?</h3>
              <p className="mt-1 text-sm text-ink-600">
                Register with your profession, facility and licence number. An administrator verifies your documents
                before your profile becomes visible here.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => navigate('/register?role=PROVIDER')}>
                  Register as a provider
                </Button>
                <Button variant="secondary" size="sm" onClick={() => navigate('/how-it-works')}>
                  How it works
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
