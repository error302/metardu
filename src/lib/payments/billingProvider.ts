export type BillingMutationProvider = 'mpesa' | 'paypal'

/**
 * Resolve the exact provider allowed to receive a billing mutation.
 * Missing, legacy, or differently-cased values fail closed.
 */
export function resolveBillingMutationProvider(
  paymentMethod: string | null | undefined,
): BillingMutationProvider | null {
  if (paymentMethod === 'mpesa' || paymentMethod === 'paypal') return paymentMethod
  return null
}
