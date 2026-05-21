'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/auth/session'
import { deleteCategorySetting, upsertCategory, type CategoryInput } from '@/lib/entities/category-settings'

function cleanCategoryInput(input: CategoryInput): CategoryInput {
  return {
    key: input.key?.trim() || undefined,
    label: input.label.trim(),
    icon: input.icon.trim(),
    color: input.color.trim(),
    desc: input.desc?.trim() || undefined,
  }
}

export async function saveRecordCategory(input: CategoryInput) {
  await requireSession()
  const key = await upsertCategory(cleanCategoryInput(input))
  revalidatePath('/life/admin')
  revalidatePath(`/life/${key}`)
  revalidatePath('/life')
  revalidatePath('/')
  return { key }
}

export async function deleteRecordCategory(key: string) {
  await requireSession()
  await deleteCategorySetting(key)
  revalidatePath('/life/admin')
  revalidatePath(`/life/${key}`)
  revalidatePath('/life')
  revalidatePath('/')
}
