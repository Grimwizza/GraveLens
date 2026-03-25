import ResultPage from "@/components/results/ResultPage";

export default function Page({ params }: { params: { id: string } }) {
  return <ResultPage id={params.id} />;
}
