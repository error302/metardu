
---
Task ID: 3
Agent: Main Agent
Task: Fix admin/founder stuck on free subscription tier

Work Log:
- Analyzed subscription system: server-side subscriptionEngine.ts had admin detection, but 5 client-side locations directly queried user_subscriptions DB table (defaulting to 'free' for admin with no row)
- Created /api/subscription endpoint that uses subscriptionEngine (which has ADMIN_EMAILS + hardcoded founder detection)
- Created /api/subscription/project-count endpoint for limit checks
- Fixed subscriptionContext.tsx to use /api/subscription instead of direct DB read
- Fixed NavBar.tsx to use /api/subscription instead of direct DB read
- Fixed account/billing/page.tsx to use /api/subscription instead of direct DB read
- Fixed account/page.tsx to use /api/subscription instead of direct DB read
- Fixed dashboard/page.tsx: admin gets 'enterprise' not just 'pro'
- Fixed SubscriptionStatus.tsx: added enterprise + firm badge styles
- Fixed reports/surveyReport/subscription.ts: added admin email bypass
- Added isAdmin flag to SubscriptionContext for feature gating
- Build passed, committed, pushed, deployed via GitHub Actions
- Verified live: admin account now shows ENTERPRISE instead of FREE

Stage Summary:
- Root cause: client-side code bypassed server-side admin detection
- Fix: unified all subscription reads through server API endpoint
- Admin (mohameddosho20@gmail.com) now shows ENTERPRISE everywhere
- API response: {plan:"enterprise", isAdmin:true, isUnlimitedProjects:true}
- Commit: d21187c
