import * as React from 'react'
import { Button, Heading, Link, Text } from '@react-email/components'
import { BrandedEmail, emailStyles as s } from './_layout'

interface MagicLinkEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, siteUrl, confirmationUrl }: MagicLinkEmailProps) => (
  <BrandedEmail siteName={siteName} siteUrl={siteUrl} previewText={`Je inloglink voor ${siteName}`}>
    <Heading style={s.h1}>Je inloglink</Heading>
    <Text style={s.text}>Klik op de knop om direct in te loggen bij {siteName}. Deze link verloopt snel.</Text>
    <Button style={s.button} href={confirmationUrl}>Inloggen</Button>
    <Text style={s.small}>
      Werkt de knop niet? <Link href={confirmationUrl} style={s.link}>{confirmationUrl}</Link>
    </Text>
    <Text style={s.small}>Heb je deze link niet aangevraagd? Negeer deze e-mail.</Text>
  </BrandedEmail>
)

export default MagicLinkEmail
