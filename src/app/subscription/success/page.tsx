import SubscriptionSuccessClient from './SubscriptionSuccessClient'

export default async function SubscriptionSuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <SubscriptionSuccessClient searchParams={await searchParams} />
}
