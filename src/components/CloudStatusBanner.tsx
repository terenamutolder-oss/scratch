import { isFirebaseConfigured } from "../lib/firebase";
import { useAuth } from "../state/AuthContext";

type Props = {
  /** True when signed-in user syncs to Firestore (not guest). */
  cloudSyncActive: boolean;
};

export default function CloudStatusBanner({ cloudSyncActive }: Props) {
  const { currentUser } = useAuth();
  const firebaseOn = isFirebaseConfigured();

  if (!currentUser) return null;

  if (currentUser.isGuest && firebaseOn) {
    return (
      <div className="cloud-banner cloud-banner--warn" role="status">
        <strong>Guest mode.</strong> Projects stay on this device only. Sign in
        with the same username on other devices to share your library.
      </div>
    );
  }

  if (!firebaseOn) {
    return (
      <div className="cloud-banner cloud-banner--warn" role="status">
        <strong>Cloud not connected.</strong> This copy of the app saves
        projects in the browser only — other devices will not see them. Add
        Firebase config (<code>VITE_FIREBASE_*</code> in <code>.env</code>) and
        redeploy.
      </div>
    );
  }

  if (firebaseOn && cloudSyncActive) {
    return (
      <div className="cloud-banner cloud-banner--ok" role="status">
        Cloud sync on — sign in with the same account on each device.
      </div>
    );
  }

  return null;
}

