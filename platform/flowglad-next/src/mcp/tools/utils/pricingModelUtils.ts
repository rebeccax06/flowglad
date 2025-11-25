/**
 * Utilities for analyzing and constructing pricing model instructions
 */

import { FeatureType } from '@/types'
import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'

export interface PricingModelAnalysis {
  hasTrials: boolean
  hasUsageMeters: boolean
  hasToggleFeatures: boolean
}

/**
 * Analyzes pricing model to determine what features it includes
 */
export function analyzePricingModel(
  pricingModelData: SetupPricingModelInput
): PricingModelAnalysis {
  const hasTrials = pricingModelData.products.some((product) =>
    product.prices.some(
      (price) =>
        price.trialPeriodDays !== undefined &&
        price.trialPeriodDays !== null
    )
  )

  const hasUsageMeters = pricingModelData.usageMeters.length > 0

  const hasToggleFeatures = pricingModelData.features.some(
    (feature) => feature.type === FeatureType.Toggle
  )

  return {
    hasTrials,
    hasUsageMeters,
    hasToggleFeatures,
  }
}

/**
 * Constructs conditional instructions based on pricing model analysis
 */
export function constructPricingModelInstructions(
  pricingModelData: SetupPricingModelInput,
  analysis: PricingModelAnalysis
): string {
  const sections: string[] = []

  if (analysis.hasTrials) {
    sections.push(`## Free Trials

Your pricing model includes products with free trials. When customers subscribe to a product with a trial period, they will have access to the product features during the trial without being charged. After the trial period ends, billing will begin automatically.

<Important>
Trial periods are automatically handled by Flowglad. You don't need to implement any special logic for trial management - just ensure your products are configured with the correct \`trialPeriodDays\` values in your pricing model.
</Important>
`)
  }

  if (analysis.hasUsageMeters) {
    sections.push(`## Usage-Based Pricing

Your pricing model includes usage meters. You'll need to:

1. **Check usage balances** before allowing usage-based operations
2. **Record usage events** when customers consume metered resources

### Checking Usage Balances

Use \`checkUsageBalance\` to see how much of a usage meter a customer has remaining:

\`\`\`tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function UsageBalanceIndicator({
  usageMeterSlug,
}: {
  usageMeterSlug: string
}) {
  const {
    loaded,
    errors,
    checkUsageBalance,
  } = useBilling()

  if (!loaded || !checkUsageBalance) {
    return <p>Loading usage…</p>
  }

  if (errors) {
    return <p>Unable to load billing data right now.</p>
  }

  const usage = checkUsageBalance(usageMeterSlug)

  return (
    <div>
      <h3>Usage Balance</h3>
      <p>
        Remaining:{' '}
        {usage ? \`\${usage.availableBalance} credits\` : 'No usage meter found'}
      </p>
    </div>
  )
}
\`\`\`

### Recording Usage Events

On the server, use \`createUsageEvent\` to record when customers consume metered resources:

\`\`\`ts
import { FlowgladServer } from '@flowglad/server'
import { getSessionUser } from '@/lib/auth'

const flowgladServer = new FlowgladServer({
  apiKey: process.env.FLOWGLAD_SECRET_KEY,
  getRequestingCustomer: async () => {
    const user = await getSessionUser()
    if (!user) {
      throw new Error('Unauthorized')
    }

    return {
      externalId: user.id,
      email: user.email,
      name: user.name,
    }
  },
})

// Example: Record usage when an API call is made
export async function POST(request: Request) {
  const { amount, usageMeterId, subscriptionId, priceId } = await request.json()

  // Note: You'll need to resolve the usageMeterId from the usageMeterSlug
  // by querying your database or using the billing object to get usage meter details
  
  const usageEvent = await flowgladServer.createUsageEvent({
    amount,
    priceId,
    subscriptionId,
    usageMeterId,
    transactionId: crypto.randomUUID(),
    usageDate: Date.now(),
  })

  return Response.json({ usageEvent })
}
\`\`\`

<Important>
Usage events should be recorded server-side to prevent tampering. Always validate the amount and ensure the customer has sufficient balance before allowing the operation.
</Important>
`)
  }

  if (analysis.hasToggleFeatures) {
    sections.push(`## Feature Access (Toggle Features)

Your pricing model includes toggle-type features. Use \`checkFeatureAccess\` to gate premium functionality:

\`\`\`tsx
'use client'

import { useBilling } from '@flowglad/nextjs'

export function FeatureAccessGate({
  featureSlug,
}: {
  featureSlug: string
}) {
  const {
    loaded,
    errors,
    checkFeatureAccess,
  } = useBilling()

  if (!loaded || !checkFeatureAccess) {
    return <p>Loading billing state…</p>
  }

  if (errors) {
    return <p>Unable to load billing data right now.</p>
  }

  return (
    <div>
      <h3>Feature Access</h3>
      {checkFeatureAccess(featureSlug) ? (
        <p>You can use this feature ✨</p>
      ) : (
        <p>You need to upgrade to unlock this feature.</p>
      )}
    </div>
  )
}
\`\`\`

You can also check feature access on the server:

\`\`\`ts
import { NextResponse } from 'next/server'
import { FlowgladServer } from '@flowglad/server'
import { getSessionUser } from '@/lib/auth'

const flowgladServer = new FlowgladServer({
  apiKey: process.env.FLOWGLAD_SECRET_KEY,
  getRequestingCustomer: async () => {
    const user = await getSessionUser()
    if (!user) {
      throw new Error('Unauthorized')
    }

    return {
      externalId: user.id,
      email: user.email,
      name: user.name,
    }
  },
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const featureSlug = searchParams.get('featureSlug') ?? 'ai-copilot'

  const billing = await flowgladServer.getBilling()
  const hasAccess = billing.checkFeatureAccess(featureSlug)

  return NextResponse.json({ featureSlug, hasAccess })
}
\`\`\`
`)
  }

  return sections.join('\n\n')
}
