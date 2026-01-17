import ProfileView from "@/app/_components/ProfileView";

export default function FindAddressPage({
  params,
}: {
  params: { address: string };
}) {
  return <ProfileView mode="address" address={params.address} />;
}
