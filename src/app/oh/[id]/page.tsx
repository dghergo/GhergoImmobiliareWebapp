import { redirect } from 'next/navigation'

export default async function ShortOpenHouseRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/open-house/${id}`)
}
