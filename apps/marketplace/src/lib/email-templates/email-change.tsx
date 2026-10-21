import * as React from 'react'
import { Button, Heading, Link, Text } from '@react-email/components'
import { BrandedEmail, emailStyles as s } from './_layout'

interface EmailChangeEmailProps {
  siteName: string
  siteUrl: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  siteUrl,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <BrandedEmail siteName={siteName} siteUrl={siteUrl} previewText={`Bevestig je nieuwe e-mailadres voor ${siteName}`}>
    <Heading style={s.h1}>Bevestig je e-mailwijziging</Heading>
    <Text style={s.text}>
      Je hebt gevraagd om je e-mailadres te wijzigen van{' '}
      <Link href={`mailto:${oldEmail}`} style={s.link}>{oldEmail}</Link> naar{' '}
      <Link href={`mailto:${newEmail}`} style={s.link}>{newEmail}</Link>.
    </Text>
    <Button style={s.button} href={confirmationUrl}>Bevestig wijziging</Button>
    <Text style={s.small}>Heb jij deze wijziging niet aangevraagd? Beveilig dan direct je account.</Text>
  </BrandedEmail>
)

export default EmailChangeEmail
