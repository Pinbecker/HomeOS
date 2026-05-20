import type { RecordCategory } from '@/lib/db/schema'

export type CategoryMeta = {
  key: RecordCategory
  label: string
  icon: string
  color: string
  desc: string
  // Suggested empty fields when creating a record here (keeps data structured)
  defaultFields: string[]
  renewalLabel?: string
}

export const CATEGORIES: CategoryMeta[] = [
  {
    key: 'identity',
    label: 'People & IDs',
    icon: '🪪',
    color: '#5856D6',
    desc: 'Names, NHS, NI, passports, licences',
    defaultFields: ['NHS number', 'NI number', 'Passport number', 'Passport expiry', 'Driving licence', 'Blood type'],
  },
  {
    key: 'home',
    label: 'Home',
    icon: '🏠',
    color: '#FF9500',
    desc: 'Property, mortgage, boiler, council tax',
    defaultFields: ['Provider', 'Account / reference', 'Phone'],
    renewalLabel: 'Renews',
  },
  {
    key: 'utility',
    label: 'Utilities',
    icon: '💡',
    color: '#FFCC00',
    desc: 'Water, energy, broadband, mobile',
    defaultFields: ['Provider', 'Account number', 'Phone', 'Online login'],
    renewalLabel: 'Contract ends',
  },
  {
    key: 'insurance',
    label: 'Insurance & Cover',
    icon: '🛡️',
    color: '#34C759',
    desc: 'Home, car, breakdown, pet',
    defaultFields: ['Provider', 'Policy number', 'Cover', 'Phone', 'Excess'],
    renewalLabel: 'Renews',
  },
  {
    key: 'vehicle',
    label: 'Vehicles',
    icon: '🚗',
    color: '#007AFF',
    desc: 'Reg, MOT, service, VIN',
    defaultFields: ['Registration', 'Make & model', 'VIN', 'Insurer'],
    renewalLabel: 'MOT due',
  },
  {
    key: 'contact',
    label: 'Contacts',
    icon: '📇',
    color: '#00C7BE',
    desc: 'GP, dentist, employers, key people',
    defaultFields: ['Phone', 'Email', 'Address'],
  },
  {
    key: 'subscription',
    label: 'Money & Bills',
    icon: '💳',
    color: '#AF52DE',
    desc: 'Recurring payments and subscriptions',
    defaultFields: ['Amount', 'Frequency', 'Account'],
    renewalLabel: 'Next payment',
  },
  {
    key: 'pet',
    label: 'Pets',
    icon: '🐾',
    color: '#FF2D55',
    desc: 'Insurance, vet, microchip',
    defaultFields: ['Microchip', 'Vet', 'Date of birth', 'Insurer'],
  },
  {
    key: 'reference',
    label: 'Reference',
    icon: '📋',
    color: '#8E8E93',
    desc: 'Wi-Fi, router, anything else handy',
    defaultFields: ['Detail'],
  },
]

export const CATEGORY_MAP: Record<string, CategoryMeta> =
  Object.fromEntries(CATEGORIES.map(c => [c.key, c]))
