import * as React from 'react'
import { Button, Heading, Link, Text } from '@react-email/components'
import { BrandedEmail, emailStyles as s } from './_layout'

interface RecoveryEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, siteUrl, confirmationUrl }: RecoveryEmailProps) => (
  <BrandedEmail siteName={siteName} siteUrl={siteUrl} previewText={`Reset je wachtwoord voor ${siteName}`}>
    <Heading style={s.h1}>Wachtwoord opnieuw instellen</Heading>
    <Text style={s.text}>
      We ontvingen een verzoek om je wachtwoord voor {siteName} te resetten. Klik op de knop om een nieuw wachtwoord te kiezen.
    </Text>
    <Button style={s.button} href={confirmationUrl}>Wachtwoord resetten</Button>
    <Text style={s.small}>
      Link werkt niet? <Link href={confirmationUrl} style={s.link}>{confirmationUrl}</Link>
    </Text>
    <Text style={s.small}>Heb je geen reset aangevraagd? Negeer deze e-mail; je wachtwoord blijft ongewijzigd.</Text>
  </BrandedEmail>
)

export default RecoveryEmail
