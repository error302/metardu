import QRCode from 'qrcode'

export async function generateVerificationQR(
  verificationToken: string,
  baseUrl: string
): Promise<string> {
  const url = `${baseUrl}/verify/${verificationToken}`
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    width: 120,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' }
  })
}

export function getVerificationUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://metardu.vercel.app'
  return `${base}/verify/${token}`
}
