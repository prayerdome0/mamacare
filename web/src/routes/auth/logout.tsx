/**
 * Dedicated Logout route handler.
 *
 * Clears the user's authenticated session, resets policy context,
 * and navigates to the sign-in screen with clean feedback.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogOut } from 'lucide-react';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';

export default function LogoutPage() {
  const { signOut, actor } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;
    const performSignOut = async () => {
      try {
        if (actor) {
          await signOut();
          toast.info('Signed out', 'You have been safely signed out of Mama Care.');
        }
      } catch {
        // If already signed out or network failure, still redirect
      } finally {
        if (active) {
          setCompleted(true);
          navigate('/sign-in', { replace: true });
        }
      }
    };

    void performSignOut();

    return () => {
      active = false;
    };
  }, [signOut, navigate, toast, actor]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" role="status">
      <LogOut className="size-8 animate-pulse text-brand-700" aria-hidden />
      <p className="text-sm font-medium text-ink-700">Signing out safely from Mama Care…</p>
    </div>
  );
}
