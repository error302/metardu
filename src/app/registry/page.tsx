import { redirect } from 'next/navigation'

/** Keep the old navigation URL, but use the consolidated parcel-records page. */
export default function RegistryPage() {
  redirect('/parcel')
}
