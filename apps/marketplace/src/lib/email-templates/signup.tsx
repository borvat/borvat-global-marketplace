import * as React from 'react'
import { Button, Heading, Link, Text } from '@react-email/components'
import { BrandedEmail, emailStyles as s } from './_layout'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <BrandedEmail siteName={siteName} siteUrl={siteUrl} previewText={`Bevestig je e-mail voor ${siteName}`}>
    <Heading style={s.h1}>Welkom bij Borvat®</Heading>
    <Text style={s.text}>
      Bedankt voor je aanmelding bij <strong>{siteName}</strong>. Bevestig je e-mailadres ({recipient}) om je account te activeren.
    </Text>
    <Button style={s.button} href={confirmationUrl}>Bevestig e-mail</Button>
    <Text style={s.small}>
      Werkt de knop niet? Kopieer deze link in je browser:{' '}
      <Link href={confirmationUrl} style={s.link}>{confirmationUrl}</Link>
    </Text>
    <Text style={s.small}>Heb je geen account aangemaakt? Dan kun je deze e-mail negeren.</Text>
  </BrandedEmail>
)

export default SignupEmail
