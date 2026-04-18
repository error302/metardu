import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true, // Use TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export interface SendEmailOptions {
  to: string
  subject: string
  text?: string
  html?: string
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(`[email] Email service not configured. Would have sent "${subject}" to ${to}`)
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.RESEND_FROM_EMAIL || `"METARDU" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    })
    return { success: true, info }
  } catch (error) {
    console.error('[email] Error sending email:', error)
    return { success: false, error }
  }
}
