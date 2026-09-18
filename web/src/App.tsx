/**
 * Application router.
 *
 * Three portals share one codebase and one design system, and the routing reflects
 * that: public pages anybody can read, `/app` for mothers and their supporters,
 * `/provider` for clinicians, `/admin` for operators. Guards decide *where* you
 * land; the policy module and the data layer decide *what you may read*, so a wrong
 * guess in a URL bar can never expose a record.
 *
 * Every route is lazily loaded. A mother on a 3G connection in Lusaka should
 * download the pregnancy tracker, not the administrator's audit log.
 */

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppProviders, useSession } from '@/providers/app-providers';
import {
  FullPageSpinner,
  RedirectIfSignedIn,
  RequireAdmin,
  RequireAuth,
  RequireProvider,
  RequireSystemAdmin,
  homeForRole,
} from '@/routes/guards';
import { ARTICLE_CATEGORY_LABELS, type ArticleCategory } from '@/types/domain';
import { NotFoundPage } from '@/routes/public/static';

/* ── Public ────────────────────────────────────────────────────────────── */
const Landing = lazy(() => import('@/routes/public/landing'));
const LearnPage = lazy(() => import('@/routes/public/learn'));
const ArticlePage = lazy(() => import('@/routes/public/article'));
const FacilitiesPage = lazy(() => import('@/routes/public/facilities'));
const ProvidersPage = lazy(() => import('@/routes/public/providers'));
const EmergencyPage = lazy(() => import('@/routes/public/emergency'));

/* ── Authentication ────────────────────────────────────────────────────── */
const SignInPage = lazy(() => import('@/routes/auth/sign-in'));
const RegisterPage = lazy(() => import('@/routes/auth/register'));
const ForgotPasswordPage = lazy(() => import('@/routes/auth/forgot-password'));
const PendingApprovalPage = lazy(() => import('@/routes/auth/pending'));
const BecomeAProviderPage = lazy(() => import('@/routes/auth/become-a-provider'));

/* ── Mother (and supporter) app ────────────────────────────────────────── */
const MotherHome = lazy(() => import('@/routes/mother/home'));
const MotherRecordsPage = lazy(() => import('@/routes/mother/records'));
const MotherReportsPage = lazy(() => import('@/routes/mother/reports'));
const PregnancyTrackerPage = lazy(() => import('@/routes/mother/pregnancy'));
const WeeklyGuidePage = lazy(() => import('@/routes/mother/guide'));
const AppointmentsPage = lazy(() => import('@/routes/mother/appointments'));
const RemindersPage = lazy(() => import('@/routes/mother/reminders'));
const BabyPage = lazy(() => import('@/routes/mother/baby'));
const JournalPage = lazy(() => import('@/routes/mother/journal'));
const MotherLearnPage = lazy(() => import('@/routes/mother/learn'));
const MotherFacilitiesPage = lazy(() => import('@/routes/mother/facilities'));
const MotherMessagesPage = lazy(() => import('@/routes/mother/messages'));
const MotherEmergencyPage = lazy(() => import('@/routes/mother/emergency'));
const NotificationsPage = lazy(() => import('@/routes/mother/notifications'));
const MotherProfilePage = lazy(() => import('@/routes/mother/profile'));
const MotherSettingsPage = lazy(() => import('@/routes/mother/settings'));
const LogoutPage = lazy(() => import('@/routes/auth/logout'));

/* ── Healthcare provider portal ────────────────────────────────────────── */
const ProviderDashboard = lazy(() => import('@/routes/provider/dashboard'));
const ProviderPatientsPage = lazy(() => import('@/routes/provider/patients'));
const ProviderAppointments = lazy(() => import('@/routes/provider/appointments'));
const ProviderEducation = lazy(() => import('@/routes/provider/education'));
const ProviderMessages = lazy(() => import('@/routes/provider/messages'));
const ProviderReports = lazy(() => import('@/routes/provider/reports'));
const ProviderProfile = lazy(() => import('@/routes/provider/profile'));

/* ── Administration ────────────────────────────────────────────────────── */
const AdminDashboard = lazy(() => import('@/routes/admin/dashboard'));
const AdminUsers = lazy(() => import('@/routes/admin/users'));
const AdminProviders = lazy(() => import('@/routes/admin/providers'));
const AdminFacilities = lazy(() => import('@/routes/admin/facilities'));
const AdminArticles = lazy(() => import('@/routes/admin/articles'));
const AdminAnnouncements = lazy(() => import('@/routes/admin/announcements'));
const AdminNotifications = lazy(() => import('@/routes/admin/notifications'));
const AdminAppointments = lazy(() => import('@/routes/admin/appointments'));
const AdminReports = lazy(() => import('@/routes/admin/reports'));
const AdminFeedback = lazy(() => import('@/routes/admin/feedback'));
const AdminMedia = lazy(() => import('@/routes/admin/media'));
const AdminAudit = lazy(() => import('@/routes/admin/audit'));
const AdminSettings = lazy(() => import('@/routes/admin/settings'));

/* Lazy modules that also export named screens are resolved through their module. */
const PatientDetailPage = lazy(() =>
  import('@/routes/provider/patients').then((module) => ({ default: module.PatientDetailPage })),
);
const LearnCategoryPage = lazy(() =>
  import('@/routes/public/learn').then((module) => ({ default: module.CategoryPage })),
);
const StaticScreens = {
  About: lazy(() => import('@/routes/public/static').then((m) => ({ default: m.AboutPage }))),
  HowItWorks: lazy(() => import('@/routes/public/static').then((m) => ({ default: m.HowItWorksPage }))),
  Faq: lazy(() => import('@/routes/public/static').then((m) => ({ default: m.FaqPage }))),
  Contact: lazy(() => import('@/routes/public/static').then((m) => ({ default: m.ContactPage }))),
  Privacy: lazy(() => import('@/routes/public/static').then((m) => ({ default: m.PrivacyPage }))),
  Terms: lazy(() => import('@/routes/public/static').then((m) => ({ default: m.TermsPage }))),
  Status: lazy(() => import('@/routes/public/static').then((m) => ({ default: m.StatusPage }))),
};

/** Sends a signed-in person to the portal that matches their role. */
function HomeRedirect() {
  const { actor, ready } = useSession();
  if (!ready) return <FullPageSpinner label="Finding your home screen" />;
  return <Navigate to={homeForRole(actor?.role)} replace />;
}

function ReportsRedirect() {
  const { actor, ready } = useSession();
  if (!ready) return <FullPageSpinner label="Loading reports" />;
  if (!actor) return <Navigate to="/sign-in" replace />;
  if (actor.role === 'ADMIN' || actor.role === 'FACILITY_ADMIN') return <Navigate to="/admin/reports" replace />;
  if (actor.role === 'PROVIDER' || actor.role === 'NURSE') return <Navigate to="/provider/reports" replace />;
  return <Navigate to="/app/reports" replace />;
}

function RecordsRedirect() {
  const { actor, ready } = useSession();
  if (!ready) return <FullPageSpinner label="Loading health records" />;
  if (!actor) return <Navigate to="/sign-in" replace />;
  if (actor.role === 'ADMIN' || actor.role === 'FACILITY_ADMIN') return <Navigate to="/admin/reports" replace />;
  if (actor.role === 'PROVIDER' || actor.role === 'NURSE') return <Navigate to="/provider/patients" replace />;
  return <Navigate to="/app/records" replace />;
}

function ProfileRedirect() {
  const { actor, ready } = useSession();
  if (!ready) return <FullPageSpinner label="Loading profile" />;
  if (!actor) return <Navigate to="/sign-in" replace />;
  if (actor.role === 'ADMIN' || actor.role === 'FACILITY_ADMIN') return <Navigate to="/admin/settings" replace />;
  if (actor.role === 'PROVIDER' || actor.role === 'NURSE') return <Navigate to="/provider/profile" replace />;
  return <Navigate to="/app/profile" replace />;
}

function SettingsRedirect() {
  const { actor, ready } = useSession();
  if (!ready) return <FullPageSpinner label="Loading settings" />;
  if (!actor) return <Navigate to="/sign-in" replace />;
  if (actor.role === 'ADMIN' || actor.role === 'FACILITY_ADMIN') return <Navigate to="/admin/settings" replace />;
  if (actor.role === 'PROVIDER' || actor.role === 'NURSE') return <Navigate to="/provider/profile" replace />;
  return <Navigate to="/app/settings" replace />;
}

function NotificationsRedirect() {
  const { actor, ready } = useSession();
  if (!ready) return <FullPageSpinner label="Loading notifications" />;
  if (!actor) return <Navigate to="/sign-in" replace />;
  if (actor.role === 'ADMIN' || actor.role === 'FACILITY_ADMIN') return <Navigate to="/admin/notifications" replace />;
  if (actor.role === 'PROVIDER' || actor.role === 'NURSE') return <Navigate to="/provider/messages" replace />;
  return <Navigate to="/app/notifications" replace />;
}

function PatientRouteRedirect() {
  const location = useLocation();
  const sub = location.pathname.replace(/^\/patient\/?/, '');
  if (!sub || sub === 'dashboard') return <Navigate to="/app" replace />;
  return <Navigate to={`/app/${sub}`} replace />;
}

function NurseRouteRedirect() {
  const location = useLocation();
  const sub = location.pathname.replace(/^\/nurse\/?/, '');
  if (!sub || sub === 'dashboard') return <Navigate to="/provider" replace />;
  return <Navigate to={`/provider/${sub}`} replace />;
}

/** `/learn/:category` — validates the slug against the known categories. */
function CategoryRoute() {
  const { category = '' } = useParams();
  const known = Object.keys(ARTICLE_CATEGORY_LABELS) as ArticleCategory[];
  const match = known.find((value) => value === category);
  if (!match) return <NotFoundPage />;
  return (
    <Suspense fallback={<FullPageSpinner label="Loading this topic" />}>
      <LearnCategoryPage category={match} />
    </Suspense>
  );
}

/** Scrolls to the top on navigation, unless the browser is restoring a position. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function AppRoutes() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        {/* ── Public ─────────────────────────────────────────────── */}
        <Route path="/" element={<Landing />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/learn/category/:category" element={<CategoryRoute />} />
        <Route path="/learn/:slug" element={<ArticlePage />} />
        <Route path="/facilities" element={<FacilitiesPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/emergency" element={<EmergencyPage />} />
        <Route path="/about" element={<StaticScreens.About />} />
        <Route path="/how-it-works" element={<StaticScreens.HowItWorks />} />
        <Route path="/faq" element={<StaticScreens.Faq />} />
        <Route path="/contact" element={<StaticScreens.Contact />} />
        <Route path="/privacy" element={<StaticScreens.Privacy />} />
        <Route path="/terms" element={<StaticScreens.Terms />} />
        <Route path="/status" element={<StaticScreens.Status />} />

        {/* ── Authentication ─────────────────────────────────────── */}
        <Route
          path="/sign-in"
          element={
            <RedirectIfSignedIn>
              <SignInPage />
            </RedirectIfSignedIn>
          }
        />
        <Route path="/login" element={<Navigate to="/sign-in" replace />} />
        <Route
          path="/register"
          element={
            <RedirectIfSignedIn>
              <RegisterPage />
            </RedirectIfSignedIn>
          }
        />
        <Route path="/sign-up" element={<Navigate to="/register" replace />} />
        <Route
          path="/forgot-password"
          element={
            <RedirectIfSignedIn>
              <ForgotPasswordPage />
            </RedirectIfSignedIn>
          }
        />
        <Route path="/logout" element={<LogoutPage />} />
        <Route
          path="/pending"
          element={
            <RequireAuth>
              <PendingApprovalPage />
            </RequireAuth>
          }
        />
        <Route
          path="/become-a-provider"
          element={
            <RequireAuth>
              <BecomeAProviderPage />
            </RequireAuth>
          }
        />
        <Route path="/home" element={<HomeRedirect />} />

        {/* ── Universal & Role Shortcuts ─────────────────────────── */}
        <Route path="/reports" element={<ReportsRedirect />} />
        <Route path="/records" element={<RecordsRedirect />} />
        <Route path="/profile" element={<ProfileRedirect />} />
        <Route path="/settings" element={<SettingsRedirect />} />
        <Route path="/notifications" element={<NotificationsRedirect />} />

        <Route path="/patient" element={<PatientRouteRedirect />} />
        <Route path="/patient/*" element={<PatientRouteRedirect />} />
        <Route path="/nurse" element={<NurseRouteRedirect />} />
        <Route path="/nurse/*" element={<NurseRouteRedirect />} />

        {/* ── Mother and supporter app ───────────────────────────── */}
        <Route
          path="/app"
          element={
            <RequireAuth roles={['MOTHER', 'PATIENT', 'SUPPORTER']}>
              <Suspense fallback={<FullPageSpinner label="Opening your tracker" />}>
                <Routes>
                  <Route index element={<MotherHome />} />
                  <Route path="records" element={<MotherRecordsPage />} />
                  <Route path="reports" element={<MotherReportsPage />} />
                  <Route path="pregnancy" element={<PregnancyTrackerPage />} />
                  <Route path="guide" element={<WeeklyGuidePage />} />
                  <Route path="appointments" element={<AppointmentsPage />} />
                  <Route path="reminders" element={<RemindersPage />} />
                  <Route path="baby" element={<BabyPage />} />
                  <Route path="journal" element={<JournalPage />} />
                  <Route path="learn" element={<MotherLearnPage />} />
                  <Route path="facilities" element={<MotherFacilitiesPage />} />
                  <Route path="messages" element={<MotherMessagesPage />} />
                  <Route path="emergency" element={<MotherEmergencyPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="profile" element={<MotherProfilePage />} />
                  <Route path="settings" element={<MotherSettingsPage />} />
                  <Route path="*" element={<Navigate to="/app" replace />} />
                </Routes>
              </Suspense>
            </RequireAuth>
          }
        />

        {/* ── Healthcare provider portal ─────────────────────────── */}
        <Route
          path="/provider"
          element={
            <RequireProvider>
              <Suspense fallback={<FullPageSpinner label="Opening the clinical portal" />}>
                <Routes>
                  <Route index element={<ProviderDashboard />} />
                  <Route path="patients" element={<ProviderPatientsPage />} />
                  <Route path="patients/:patientId" element={<PatientDetailPage />} />
                  <Route path="appointments" element={<ProviderAppointments />} />
                  <Route path="education" element={<ProviderEducation />} />
                  <Route path="messages" element={<ProviderMessages />} />
                  <Route path="reports" element={<ProviderReports />} />
                  <Route path="profile" element={<ProviderProfile />} />
                  <Route path="*" element={<Navigate to="/provider" replace />} />
                </Routes>
              </Suspense>
            </RequireProvider>
          }
        />

        {/* ── Administration ─────────────────────────────────────── */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <Suspense fallback={<FullPageSpinner label="Opening administration" />}>
                <Routes>
                  <Route index element={<AdminDashboard />} />
                  <Route
                    path="users"
                    element={
                      <RequireSystemAdmin>
                        <AdminUsers />
                      </RequireSystemAdmin>
                    }
                  />
                  <Route
                    path="providers"
                    element={
                      <RequireSystemAdmin>
                        <AdminProviders />
                      </RequireSystemAdmin>
                    }
                  />
                  <Route path="facilities" element={<AdminFacilities />} />
                  <Route path="articles" element={<AdminArticles />} />
                  <Route path="announcements" element={<AdminAnnouncements />} />
                  <Route
                    path="notifications"
                    element={
                      <RequireSystemAdmin>
                        <AdminNotifications />
                      </RequireSystemAdmin>
                    }
                  />
                  <Route path="appointments" element={<AdminAppointments />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="feedback" element={<AdminFeedback />} />
                  <Route path="media" element={<AdminMedia />} />
                  <Route
                    path="audit"
                    element={
                      <RequireSystemAdmin>
                        <AdminAudit />
                      </RequireSystemAdmin>
                    }
                  />
                  <Route
                    path="settings"
                    element={
                      <RequireSystemAdmin>
                        <AdminSettings />
                      </RequireSystemAdmin>
                    }
                  />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </Suspense>
            </RequireAdmin>
          }
        />

        {/* ── Everything else ────────────────────────────────────── */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProviders>
        <ScrollToTop />
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  );
}
