import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { NavScope } from '@/components/layout/nav-scope';
import { ADMIN_NAV, APP_NAV, MOTHER_NAV } from '@/components/layout/shell';
import { BootScreen, ForbiddenPage, NotFoundPage, RequireAuth, RequireGuest, RequireStaff, ServerErrorPage } from '@/routes/guards';
import { AppProviders } from '@/providers/app-providers';

/* Route-level code splitting: the public site, the portal and the workspace each
   ship their own chunk so a first visit to the landing page never downloads the
   clinical screens. */
const Landing = lazy(() => import('@/routes/public/landing'));
const MaternalHealth = lazy(() => import('@/routes/public/maternal-health'));
const Emergency = lazy(() => import('@/routes/public/emergency'));
const Contact = lazy(() => import('@/routes/public/contact'));
const Faq = lazy(() => import('@/routes/public/faq-page'));
const Privacy = lazy(() => import('@/routes/public/privacy'));

const SignIn = lazy(() => import('@/routes/auth/sign-in'));
const Register = lazy(() => import('@/routes/auth/register'));
const ForgotPassword = lazy(() => import('@/routes/auth/forgot-password'));
const ResetPassword = lazy(() => import('@/routes/auth/reset-password'));
const PendingApproval = lazy(() => import('@/routes/auth/pending-approval'));

const WorkerDashboard = lazy(() => import('@/routes/app/dashboard'));
const MothersPage = lazy(() => import('@/routes/app/mothers'));
const MotherProfilePage = lazy(() => import('@/routes/app/mother-profile'));
const AncVisitsPage = lazy(() => import('@/routes/app/anc-visits'));
const AppointmentsPage = lazy(() => import('@/routes/app/appointments'));
const AlertsPage = lazy(() => import('@/routes/app/alerts'));
const ReferralsPage = lazy(() => import('@/routes/app/referrals'));
const DocumentsPage = lazy(() => import('@/routes/app/documents'));
const ReportsPage = lazy(() => import('@/routes/app/reports'));
const EducationPage = lazy(() => import('@/routes/app/education'));
const NotificationsPage = lazy(() => import('@/routes/app/notifications'));
const ProfilePage = lazy(() => import('@/routes/app/profile'));

const AdminDashboard = lazy(() => import('@/routes/admin/dashboard'));
const AdminUsers = lazy(() => import('@/routes/admin/users'));
const AdminUserDetail = lazy(() => import('@/routes/admin/user-detail'));
const AdminFacilities = lazy(() => import('@/routes/admin/facilities'));
const AdminSettings = lazy(() => import('@/routes/admin/settings'));
const AdminAudit = lazy(() => import('@/routes/admin/audit'));

const MotherHome = lazy(() => import('@/routes/mother/home'));
const MotherAppointments = lazy(() => import('@/routes/mother/appointments'));
const MotherRecords = lazy(() => import('@/routes/mother/records'));
const MotherEducation = lazy(() => import('@/routes/mother/education'));
const MotherNotifications = lazy(() => import('@/routes/mother/notifications'));
const MotherProfile = lazy(() => import('@/routes/mother/profile'));

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <Suspense fallback={<BootScreen />}>
            <Routes>
              {/* Public site — this is the first screen, never a login wall. */}
              <Route path="/" element={<Landing />} />
              <Route path="/maternal-health" element={<MaternalHealth />} />
              <Route path="/emergency" element={<Emergency />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/contact" element={<Contact />} />

              <Route
                path="/signin"
                element={
                  <RequireGuest>
                    <SignIn />
                  </RequireGuest>
                }
              />
              <Route
                path="/register"
                element={
                  <RequireGuest>
                    <Register />
                  </RequireGuest>
                }
              />
              <Route
                path="/forgot-password"
                element={
                  <RequireGuest>
                    <ForgotPassword />
                  </RequireGuest>
                }
              />
              <Route
                path="/reset-password"
                element={
                  <RequireGuest>
                    <ResetPassword />
                  </RequireGuest>
                }
              />
              <Route path="/pending-approval" element={<PendingApproval />} />
              {/* Legacy alias kept so an old bookmark still lands somewhere sane. */}
              <Route path="/login" element={<Navigate to="/signin" replace />} />

              {/* Mother’s portal */}
              <Route
                path="/home/*"
                element={
                  <RequireAuth roles={['MOTHER']}>
                    <NavScope nav={MOTHER_NAV} base="/home" tone="mother">
                      <Routes>
                        <Route index element={<MotherHome />} />
                        <Route path="appointments" element={<MotherAppointments />} />
                        <Route path="records" element={<MotherRecords />} />
                        <Route path="education" element={<MotherEducation />} />
                        <Route path="notifications" element={<MotherNotifications />} />
                        <Route path="profile" element={<MotherProfile />} />
                        <Route path="*" element={<Navigate to="/home" replace />} />
                      </Routes>
                    </NavScope>
                  </RequireAuth>
                }
              />

              {/* Staff workspace */}
              <Route
                path="/app/*"
                element={
                  <RequireStaff>
                    <NavScope nav={APP_NAV} base="/app">
                      <Routes>
                        <Route index element={<WorkerDashboard />} />
                        <Route path="mothers" element={<MothersPage />} />
                        <Route path="mothers/:motherId" element={<MotherProfilePage />} />
                        <Route path="anc" element={<AncVisitsPage />} />
                        <Route path="appointments" element={<AppointmentsPage />} />
                        <Route path="alerts" element={<AlertsPage />} />
                        <Route path="referrals" element={<ReferralsPage />} />
                        <Route path="documents" element={<DocumentsPage />} />
                        <Route path="reports" element={<ReportsPage />} />
                        <Route path="education" element={<EducationPage />} />
                        <Route path="notifications" element={<NotificationsPage />} />
                        <Route path="profile" element={<ProfilePage />} />
                        <Route path="*" element={<Navigate to="/app" replace />} />
                      </Routes>
                    </NavScope>
                  </RequireStaff>
                }
              />

              {/* Administrator console — same screens where they are the same job. */}
              <Route
                path="/admin/*"
                element={
                  <RequireAuth roles={['ADMIN']}>
                    <NavScope nav={ADMIN_NAV} base="/admin">
                      <Routes>
                        <Route index element={<AdminDashboard />} />
                        <Route path="users" element={<AdminUsers />} />
                        <Route path="users/:uid" element={<AdminUserDetail />} />
                        <Route path="facilities" element={<AdminFacilities />} />
                        <Route path="settings" element={<AdminSettings />} />
                        <Route path="audit" element={<AdminAudit />} />
                        <Route path="mothers" element={<MothersPage />} />
                        <Route path="mothers/:motherId" element={<MotherProfilePage />} />
                        <Route path="appointments" element={<AppointmentsPage />} />
                        <Route path="alerts" element={<AlertsPage />} />
                        <Route path="referrals" element={<ReferralsPage />} />
                        <Route path="documents" element={<DocumentsPage />} />
                        <Route path="reports" element={<ReportsPage />} />
                        <Route path="education" element={<EducationPage />} />
                        <Route path="notifications" element={<NotificationsPage />} />
                        <Route path="*" element={<Navigate to="/admin" replace />} />
                      </Routes>
                    </NavScope>
                  </RequireAuth>
                }
              />

              <Route path="/forbidden" element={<ForbiddenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProviders>
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Never a bare console.log in a clinical app: this is the hook a deployment
    // connects to its own error reporting (Sentry, CloudWatch, …).
    console.error('[mamacare] unhandled interface error', error.message, info.componentStack?.slice(0, 400));
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <ServerErrorPage
        error={this.state.error}
        onRetry={() => {
          this.setState({ error: null });
          window.location.reload();
        }}
      />
    );
  }
}

export default App;
