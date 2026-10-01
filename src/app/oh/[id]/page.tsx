import { redirect } from 'next/navigation'

export default async function ShortOpenHouseRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ref?: string }>
}) {
  const { id } = await params
  const { ref } = await searchParams
  // "ref" = agente che ha inviato il link (preselezionato come agente di riferimento)
  redirect(ref ? `/open-house/${id}?ref=${encodeURIComponent(ref)}` : `/open-house/${id}`)
}
