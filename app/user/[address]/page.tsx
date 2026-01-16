import { redirect } from "next/navigation";

export default function LegacyUserRedirect({
  params,
}: {
  params: { address: string };
}) {
  redirect(`/find/${params.address}`);
}
