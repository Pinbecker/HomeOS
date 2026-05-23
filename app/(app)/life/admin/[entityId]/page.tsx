import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { getEntityProfileData } from '@/lib/entities/records'
import { EntityProfile } from './entity-profile'

export default async function EntityProfilePage({ params }: { params: Promise<{ entityId: string }> }) {
  await requireSession()
  const { entityId } = await params
  const profile = await getEntityProfileData(entityId)
  if (!profile) notFound()

  return <EntityProfile profile={profile} />
}
