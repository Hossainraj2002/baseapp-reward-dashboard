import FrameReady from "@/components/FrameReady";
import ProfileDashboardClient from "@/components/ProfileDashboardClient";

export default function ProfilePage() {
  // IMPORTANT:
  // ProfileDashboardClient uses /api/profile?address=... (connected wallet address is resolved there)
  // so we just pass a placeholder checksum-like address here to satisfy the prop type.
  //
  // The component will NOT use this to show someone else’s profile unless your API does.
  // If you want, we can change ProfileDashboardClient to not require this prop at all.
  const dummyAddress = "0x0000000000000000000000000000000000000000" as const;

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 16, paddingBottom: 28, background: "#FFFFFF" }}>
      <FrameReady />
      <ProfileDashboardClient address={dummyAddress} />
    </main>
  );
}
