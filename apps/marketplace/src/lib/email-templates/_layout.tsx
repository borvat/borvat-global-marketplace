import * as React from 'react'
import { Body, Container, Head, Html, Img, Preview, Section, Hr, Text } from '@react-email/components'
import { brandLogoUrl } from './_brand'

interface Props {
  siteName: string
  siteUrl: string
  previewText: string
  children: React.ReactNode
}

export const BrandedEmail = ({ siteName, siteUrl, previewText, children }: Props) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>{previewText}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src={brandLogoUrl(siteUrl)} alt={siteName} width="140" style={{ display: 'block' }} />
        </Section>
        <Section style={card}>{children}</Section>
        <Hr style={hr} />
        <Text style={footer}>
          © {new Date().getFullYear()} Borvat® — Smart living, made affordable.
        </Text>
      </Container>
    </Body>
  </Html>
)

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: '24px 0' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '0 16px' }
const header = { padding: '8px 4px 20px' }
const card = {
  border: '1px solid #eeeeee',
  borderRadius: '10px',
  padding: '28px 28px 24px',
  backgroundColor: '#ffffff',
}
const hr = { borderColor: '#eeeeee', margin: '24px 0 12px' }
const footer = { fontSize: '11px', color: '#8a8a8a', textAlign: 'center' as const, margin: 0 }

export const emailStyles = {
  h1: { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0a0a', margin: '0 0 16px' },
  text: { fontSize: '14px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 18px' },
  button: {
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    borderRadius: '6px',
    padding: '12px 22px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  small: { fontSize: '12px', color: '#71717a', margin: '20px 0 0', lineHeight: '1.5' },
  link: { color: '#dc2626', textDecoration: 'underline' },
  code: {
    display: 'inline-block',
    padding: '10px 18px',
    fontSize: '20px',
    letterSpacing: '4px',
    fontWeight: 'bold' as const,
    backgroundColor: '#f4f4f5',
    borderRadius: '6px',
    color: '#0a0a0a',
  },
}
