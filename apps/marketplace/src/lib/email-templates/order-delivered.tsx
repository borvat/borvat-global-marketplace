import * as React from 'react'
import { Button, Column, Heading, Hr, Row, Section, Text } from '@react-email/components'
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
}

const Email = ({ siteUrl, orderNumber, customerName, items, orderTotal }: Props) => (
  <BrandedEmail
    siteName="Borvat"
    siteUrl={siteUrl}
    previewText={`Je bestelling ${orderNumber} is geleverd`}
  >
    <Heading style={emailStyles.h1}>Je pakket is bezorgd</Heading>
    <Text style={emailStyles.text}>Hoi {customerName},</Text>
    <Text style={emailStyles.text}>
      Bestelling <strong>{orderNumber}</strong> is geleverd. Geniet van je aankoop!
    </Text>
    <Text style={emailStyles.text}>
      Huidige status: <strong>Geleverd</strong>.
    </Text>

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
      Iets niet in orde? Neem contact op met de verkoper via je bestellingenpagina.
    </Text>
  </BrandedEmail>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Borvat — Je bestelling ${data.orderNumber} is geleverd`,

  displayName: 'Orderstatus: geleverd',
  previewData: {
    siteUrl: 'https://borvatshop.com',
    orderNumber: 'ORD-2026-1234',
    customerName: 'Jan',
    items: [{ title: 'Slimme WiFi-lamp', quantity: 2 }],
    orderTotal: '€ 49,98',
  },
} satisfies TemplateEntry

const summary = {
  border: '1px solid #eeeeee',
  borderRadius: '8px',
  padding: '16px',
  marginTop: '16px',
  backgroundColor: '#fafafa',
}
const row = { marginBottom: '8px' }
const hr = { borderColor: '#e4e4e7', margin: '12px 0' }
