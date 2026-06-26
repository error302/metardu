import { redirect } from 'next/navigation'

/**
 * Redirect /tools/land-law → /land-law
 * The land-law page lives at /land-law for historical reasons.
 * This redirect ensures both routes work.
 */
export default function LandLawRedirect() {
  redirect('/land-law')
}
