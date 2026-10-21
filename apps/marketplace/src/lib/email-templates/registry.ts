import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

import { template as orderProcessing } from './order-processing'
import { template as orderShipped } from './order-shipped'
import { template as orderDelivered } from './order-delivered'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'order-processing': orderProcessing,
  'order-shipped': orderShipped,
  'order-delivered': orderDelivered,
}
