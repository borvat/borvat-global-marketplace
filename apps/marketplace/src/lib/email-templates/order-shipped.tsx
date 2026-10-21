import * as React from 'react'
import { Button, Column, Heading, Hr, Link, Row, Section, Text } from '@react-email/components'
import { BrandedEmail, emailStyles } from './_layout'
import type { TemplateEntry } from './registry'

interface OrderItem {
  title: string
  quantity: number
}

interface Props {
  siteUrl: string
  orderNumber: string
  customerName: string
  items: OrderItem[]
  orderTotal: string
  trackingCarrier: string
  trackingCode: string
  trackingUrl?: string
}

const Email = ({
  siteUrl,
  orderNumber,
  customerName,
  items,
  orderTotal,
  trackingCarrier,
  trackingCode,
  trackingUrl,
}: Props) => (
  <BrandedEmail
    siteName="Borvat"
    siteUrl={siteUrl}
    previewText={`Je bestelling ${orderNumber} is verzonden`}
  >
    <Heading style={emailStyles.h1}>Je pakket is onderweg</Heading>
    <Text style={emailStyles.text}>Hoi {customerName},</Text>
    <Text style={emailStyles.text}>
      Bestelling <strong>{orderNumber}</strong> is verzonden. Je pakket is nu onderweg naar het bezorgadres.
    </Text>
    <Text style={emailStyles.text}>
      Huidige status: <strong>Verzonden</strong>.
    </Text>

    <Section style={trackingBox}>
      <Text style={{ ...emailStyles.text, margin: 0, fontWeight: 'bold' }}>Track & trace</Text>
      <Text style={{ ...emailStyles.text, margin: '4px 0 0' }}>
        {trackingCarrier} · {trackingCode}
      </Text>
      {trackingUrl && (
        <Section style={{ marginTop: '12px' }}>
          <Link href={trackingUrl} style={emailStyles.button}>
            Volg mijn pakket
          </Link>
        </Section>
      )}
    </Section>

    <Section style={summary}>
      {items.map((item, idx) => (
        <Row key={idx} style={row}>
          <Column>
            <Text style={{ ...emailStyles.text, margin: 0, fontWeight: 'bold' }}>{item.title}</Text>
            <Text style={{ ...emailStyles.text, margin: 0, fontSize: '12px', color: '#71717a' }}>
              {item.quantity} stuk(s)
            </Text>
          </Column>
        </Row>
      ))}
      <Hr style={hr} />
      <Text style={{ ...emailStyles.text, margin: 0, fontWeight: 'bold' }}>Totaal: {orderTotal}</Text>
    </Section>

    <Section style={{ textAlign: 'center' as const, marginTop: '24px' }}>
      <Button href={`${siteUrl.replace(/\/$/, '')}/orders`} style={emailStyles.button}>
        Bekijk je bestelling
      </Button>
    </Section>

    <Text style={emailStyles.small}>
      Geen track & trace-link zichtbaar? Soms duurt het een paar uur voordat het vervoerder de zending registreert.
    </Text>
  </BrandedEmail>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Borvat — Je bestelling ${data.orderNumber} is verzonden`,

  displayName: 'Orderstatus: verzonden',
  previewData: {
    siteUrl: 'https://borvatshop.com',
    orderNumber: 'ORD-2026-1234',
    customerName: 'Jan',
    items: [{ title: 'Slimme WiFi-lamp', quantity: 2 }],
    orderTotal: '€ 49,98',
    trackingCarrier: 'PostNL',
    trackingCode: '3SBXYZ1234567',
    trackingUrl: 'https://postnl.nl/tracktrace/?B=3SBXYZ1234567',
  },
} satisfies TemplateEntry

const trackingBox = {
  border: '1px solid #eeeeee',
  borderRadius: '8px',
  padding: '16px',
  marginTop: '16px',
  backgroundColor: '#fafafa',
}
const summary = {
  border: '1px solid #eeeeee',
  borderRadius: '8px',
  padding: '16px',
  marginTop: '16px',
  backgroundColor: '#fafafa',
}
const row = { marginBottom: '8px' }
const hr = { borderColor: '#e4e4e7', margin: '12px 0' }
