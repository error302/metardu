import { redirect } from 'next/navigation'

/**
 * Community is retired as a primary product area per Blueprint §0.3 & §24.
 * Useful functions migrated:
 *  - Equipment marketplace → /marketplace
 *  - Project collaboration → inside projects
 *  - Professional profile → /account/professional
 *  - CPD → /cpd
 *  - Beacon/control discovery → /map layers and /beacons
 *  - Assistant/help → /assistant, /help, /docs
 */
export default function CommunityPage() {
  redirect('/marketplace')
}
