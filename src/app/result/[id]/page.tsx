import ResultPage from "@/components/results/ResultPage";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultPage id={id} />;
}
