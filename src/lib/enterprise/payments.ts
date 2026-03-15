/**
 * Payment Integration Service
 * Supports Stripe, PayPal, M-Pesa (Kenya), Mobile Money (Uganda, Tanzania)
 */

export interface PaymentMethod {
  id: string
  type: 'card' | 'mpesa' | 'airtel_money' | 'vodacom_momo' | 'paypal'
  name: string
  enabled: boolean
  countries: string[]
}

export interface PaymentIntent {
  id: string
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'
  method: PaymentMethod['type']
  createdAt: number
  completedAt?: number
  metadata?: Record<string, string>
}

export interface Invoice {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  customerEmail: string
  items: InvoiceItem[]
  subtotal: number
  tax: number
  total: number
  currency: string
  status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled'
  dueDate: number
  paidAt?: number
}

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface SubscriptionPayment {
  id: string
  userId: string
  planId: string
  planName: string
  amount: number
  currency: string
  interval: 'monthly' | 'yearly'
  status: 'active' | 'cancelled' | 'past_due'
  startDate: number
  nextBillingDate: number
  paymentMethod: PaymentMethod['type']
}

const paymentMethods: PaymentMethod[] = [
  { id: 'stripe_card', type: 'card', name: 'Credit/Debit Card (Stripe)', enabled: true, countries: ['*'] },
  { id: 'mpesa', type: 'mpesa', name: 'M-Pesa', enabled: true, countries: ['Kenya'] },
  { id: 'airtel_money', type: 'airtel_money', name: 'Airtel Money', enabled: true, countries: ['Kenya', 'Uganda', 'Tanzania'] },
  { id: 'vodacom_momo', type: 'vodacom_momo', name: 'Vodacom MoMO', enabled: true, countries: ['South Africa', 'Tanzania', 'DRC'] },
  { id: 'paypal', type: 'paypal', name: 'PayPal', enabled: true, countries: ['*'] },
]

const invoices: Invoice[] = []
const subscriptions: SubscriptionPayment[] = []

export function getPaymentMethods(country?: string): PaymentMethod[] {
  if (!country) return paymentMethods.filter(p => p.enabled)
  return paymentMethods.filter(p => p.enabled && (p.countries.includes('*') || p.countries.includes(country)))
}

export function createPaymentIntent(
  amount: number,
  currency: string,
  method: PaymentMethod['type'],
  metadata?: Record<string, string>
): PaymentIntent {
  const intent: PaymentIntent = {
    id: `pay_${Date.now()}`,
    amount,
    currency,
    status: 'pending',
    method,
    createdAt: Date.now(),
    metadata,
  }
  
  setTimeout(() => {
    intent.status = 'completed'
    intent.completedAt = Date.now()
  }, 2000)
  
  return intent
}

export function processMpesaPayment(
  phoneNumber: string,
  amount: number,
  description: string
): { success: boolean; transactionId?: string; message: string } {
  console.log(`M-Pesa STK Push: ${phoneNumber}, KES ${amount}`)
  
  return {
    success: true,
    transactionId: `MPESA_${Date.now()}`,
    message: 'Payment request sent to your phone'
  }
}

export function processMobileMoneyPayment(
  phoneNumber: string,
  amount: number,
  provider: 'airtel_money' | 'vodacom_momo',
  description: string
): { success: boolean; transactionId?: string; message: string } {
  console.log(`${provider} Payment: ${phoneNumber}, ${amount}`)
  
  return {
    success: true,
    transactionId: `${provider.toUpperCase()}_${Date.now()}`,
    message: 'Payment request sent to your phone'
  }
}

export function createInvoice(
  customerId: string,
  customerName: string,
  customerEmail: string,
  items: InvoiceItem[],
  currency: string,
  dueInDays: number = 30
): Invoice {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0)
  const tax = subtotal * 0.16 // 16% VAT
  const invoice: Invoice = {
    id: `inv_${Date.now()}`,
    invoiceNumber: `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, '0')}`,
    customerId,
    customerName,
    customerEmail,
    items,
    subtotal,
    tax,
    total: subtotal + tax,
    currency,
    status: 'pending',
    dueDate: Date.now() + dueInDays * 24 * 60 * 60 * 1000,
  }
  
  invoices.push(invoice)
  return invoice
}

export function getInvoices(customerId: string): Invoice[] {
  return invoices.filter(inv => inv.customerId === customerId)
}

export function getInvoiceById(invoiceId: string): Invoice | undefined {
  return invoices.find(inv => inv.id === invoiceId)
}

export function createSubscription(
  userId: string,
  planId: string,
  planName: string,
  amount: number,
  currency: string,
  interval: SubscriptionPayment['interval'],
  paymentMethod: PaymentMethod['type']
): SubscriptionPayment {
  const sub: SubscriptionPayment = {
    id: `sub_${Date.now()}`,
    userId,
    planId,
    planName,
    amount,
    currency,
    interval,
    status: 'active',
    startDate: Date.now(),
    nextBillingDate: interval === 'monthly' 
      ? Date.now() + 30 * 24 * 60 * 60 * 1000 
      : Date.now() + 365 * 24 * 60 * 60 * 1000,
    paymentMethod,
  }
  
  subscriptions.push(sub)
  return sub
}

export function getSubscription(userId: string): SubscriptionPayment | undefined {
  return subscriptions.find(s => s.userId === userId && s.status === 'active')
}

export function cancelSubscription(subscriptionId: string): boolean {
  const sub = subscriptions.find(s => s.id === subscriptionId)
  if (sub) {
    sub.status = 'cancelled'
    return true
  }
  return false
}

export function getCurrencyForCountry(country: string): string {
  const currencies: Record<string, string> = {
    Kenya: 'KES',
    Uganda: 'UGX',
    Tanzania: 'TZS',
    Nigeria: 'NGN',
    Ghana: 'GHS',
    'South Africa': 'ZAR',
    default: 'USD',
  }
  return currencies[country] || currencies.default
}

export function convertPrice(amount: number, fromCurrency: string, toCurrency: string): number {
  const rates: Record<string, number> = {
    KES: 1,
    UGX: 27.5,
    TZS: 0.045,
    NGN: 0.65,
    GHS: 0.067,
    ZAR: 0.055,
    USD: 150,
    EUR: 165,
    GBP: 190,
  }
  
  const inUSD = amount / (rates[fromCurrency] || 1)
  return inUSD * (rates[toCurrency] || 1)
}

export function calculateCommission(amount: number, rate: number = 0.05): number {
  return amount * rate
}
