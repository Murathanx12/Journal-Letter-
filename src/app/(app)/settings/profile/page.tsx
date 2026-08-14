import type { Metadata } from "next";

import { ProfileForm } from "@/components/settings/profile-form";
import { PageHeader } from "@/components/ui/surface";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileSettingsPage() {
  const user = await requireUser("/settings/profile");

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader
        title="Your writing identity"
        description="How you appear above your entries, in every book you write in."
      />

      <ProfileForm
        email={user.email}
        displayName={user.profile.display_name}
        signature={user.profile.signature}
        preferredFont={user.profile.preferred_font}
        accent={user.profile.accent}
      />
    </div>
  );
}
