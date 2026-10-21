import * as React from 'react'
import { Heading, Text } from '@react-email/components'
import { BrandedEmail, emailStyles as s } from './_layout'

interface ReauthenticationEmailProps {
  siteName: string
  siteUrl: string
  token: string
}

export const ReauthenticationEmail = ({ siteName, siteUrl, token }: ReauthenticationEmailProps) => (
  <BrandedEmail siteName={siteName} siteUrl={siteUrl} previewText="Je verificatiecode">
    <Heading style={s.h1}>Bevestig je identiteit</Heading>
    <Text style={s.text}>Gebruik onderstaande code om je identiteit te bevestigen:</Text>
    <Text style={s.code}>{token}</Text>
    <Text style={s.small}>Deze code verloopt snel. Heb je dit niet aangevraagd? Negeer deze e-mail.</Text>
  </BrandedEmail>
)

export default ReauthenticationEmail
