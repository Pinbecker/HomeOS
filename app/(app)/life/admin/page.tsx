import { requireSession } from '@/lib/auth/session'
import { getRecordsOverviewData } from '@/lib/entities/records'
import { RecordsOverview } from './records-overview'

export default async function LifeAdminPage() {
  await requireSession()
  const data = await getRecordsOverviewData()
  return <RecordsOverview data={data} />
}
