import * as React from 'react'
import { Button, Heading, Link, Text } from '@react-email/components'
import { BrandedEmail, emailStyles as s } from './_layout'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <BrandedEmail siteName={siteName} siteUrl={siteUrl} previewText={`Je bent uitgenodigd voor ${siteName}`}>
    <Heading style={s.h1}>Je bent uitgenodigd</Heading>
    <Text style={s.text}>
      Je bent uitgenodigd om lid te worden van{' '}
      <Link href={siteUrl} style={s.link}><strong>{siteName}</strong></Link>. Klik op de knop om je account aan te maken.
    </Text>
    <Button style={s.button} href={confirmationUrl}>Uitnodiging accepteren</Button>
    <Text style={s.small}>Verwachtte je geen uitnodiging? Dan kun je deze e-mail negeren.</Text>
  </BrandedEmail>
)

export default InviteEmail
