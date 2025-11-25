/**
 * Utilities for building template replacements for the generation template
 */

import type { SetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import { FeatureType } from '@/types'
import type { ExtractedCodebaseInfo } from './codebaseAnalysisExtractor'
import {
  getFrameworkKey,
  getAuthKey,
  getLocationKey,
  resolveSnippets,
} from './codeSnippetUtils'

export interface TemplateReplacementContext {
  codebaseInfo: ExtractedCodebaseInfo
  codebaseAnalysis?: string
  pricingModelData?: SetupPricingModelInput | null
  snippets: any
  finalProjectStructure: 'nextjs' | 'react'
  finalStackDetails: string
}

/**
 * Builds all template replacements for the generation template
 */
export function buildTemplateReplacements(
  context: TemplateReplacementContext
): Record<string, string> {
  const {
    codebaseInfo,
    codebaseAnalysis,
    pricingModelData,
    snippets,
    finalProjectStructure,
    finalStackDetails,
  } = context

  // Extract usage meters and features from pricing model
  const usageMeterSlugs =
    pricingModelData?.usageMeters.map((m) => m.slug).join(', ') ||
    'usage_meter_slug'
  const featureToggleSlugs =
    pricingModelData?.features
      .filter((f) => f.type === FeatureType.Toggle)
      .map((f) => f.slug)
      .join(', ') || 'feature_slug'
  const productNames =
    pricingModelData?.products
      .map((p) => p.product?.name || p.product?.slug || 'Product')
      .join(', ') || 'Product Name'

  // Determine routing info
  const routingInfo =
    finalProjectStructure === 'nextjs'
      ? codebaseAnalysis?.match(
          /If Next\.js: Is it using App Router|Pages Router/i
        )
        ? codebaseAnalysis.match(
            /App Router \(`([^`]+)`\)|Pages Router \(`([^`]+)`\)/i
          )?.[1] || 'App Router'
        : 'App Router'
      : 'Standard React routing'

  // Get framework info
  const frameworkKey = getFrameworkKey(finalProjectStructure)
  const frameworkInfo = snippets.frameworks[frameworkKey]
  const authProvider = codebaseAnalysis
    ? getAuthKey(codebaseAnalysis)
    : getAuthKey(finalStackDetails)

  // Extract auth file path
  const authFilePath = codebaseAnalysis
    ? codebaseAnalysis.match(
        /Where is the server-side auth configuration\?[^\n]*\n- ([^\n]+)/i
      )?.[1] || 'src/lib/auth.ts'
    : 'src/lib/auth.ts'

  // Build base replacements
  const replacements: Record<string, string> = {
    '{FRAMEWORK}': codebaseInfo.framework,
    '{LANGUAGE}': codebaseInfo.language,
    '{FRAMEWORK_ROUTING_INFO}': routingInfo,
    '{AUTH_LIBRARY}': codebaseInfo.authLibrary,
    '{AUTH_FILE_PATHS}': authFilePath,
    '{CUSTOMER_ENTITY}':
      codebaseInfo.customerModel === 'B2B' ? 'organization' : 'user',
    '{CUSTOMER_ID_SOURCE}': codebaseInfo.customerIdSource,
    '{FRONTEND_FRAMEWORK}': codebaseInfo.framework,
    '{FLOWGLAD_CLIENT_PACKAGE}':
      frameworkInfo?.providerPkg || '@flowglad/nextjs',
    '{USAGE_METER_EXAMPLES}': usageMeterSlugs,
    '{FEATURE_TOGGLE_EXAMPLES}': featureToggleSlugs,
    '{USAGE_METER_SLUGS}': usageMeterSlugs,
    '{FEATURE_TOGGLE_SLUGS}': featureToggleSlugs,
    '{PRODUCT_NAMES}': productNames,
    '{PACKAGE_FILE}': codebaseInfo.filePaths.packageFile,
    '{PACKAGE_DEPENDENCIES_CODE}': `\`\`\`json
{
  "@flowglad/nextjs": "latest",
  "@flowglad/server": "latest"
}
\`\`\``,
    '{PACKAGE_SCRIPTS_CODE}': '',
    '{FLOWGLAD_SERVER_PATH}': codebaseInfo.filePaths.serverFile,
    '{FLOWGLAD_ROUTE_PATH}': codebaseInfo.filePaths.routeHandler,
    '{PROVIDER_COMPONENT_PATH}': `${codebaseInfo.filePaths.libPath}/providers.tsx`,
    '{ROOT_LAYOUT_PATH}': codebaseInfo.filePaths.layoutFile,
    '{MOCK_BILLING_PATH}': codebaseInfo.filePaths.mockBillingPath,
    '{MOCK_BILLING_IMPORT_PATH}':
      codebaseInfo.filePaths.mockBillingPath.replace(
        /\.(ts|tsx|js|jsx)$/,
        ''
      ),
    '{BILLING_HELPERS_PATH}': `${codebaseInfo.filePaths.libPath}/billing-helpers.ts`,
    '{TYPE_SYSTEM}': codebaseInfo.language.includes('TypeScript')
      ? 'TypeScript'
      : 'JavaScript',
    '{USAGE_EVENTS_ROUTE_PATH}': `${codebaseInfo.filePaths.apiRoutePath}/usage-events/route.ts`,
    '{PRICING_COMPONENT_PATH}':
      codebaseInfo.filePaths.pricingComponentPath,
    '{NAVBAR_COMPONENT_PATH}':
      codebaseInfo.filePaths.navbarComponentPath,
    '{DASHBOARD_COMPONENT_PATH}':
      codebaseInfo.filePaths.dashboardComponentPath,
    '{ENV_FILE}': codebaseInfo.filePaths.envFile,
    '{ENV_VAR_ACCESS}': codebaseInfo.filePaths.envVarAccess,
    '{LANGUAGE_EXTENSION}': codebaseInfo.language.includes(
      'TypeScript'
    )
      ? 'typescript'
      : 'javascript',
    '{USAGE_EXAMPLES}': usageMeterSlugs,
    '{USAGE_METER_DEFINITIONS}':
      pricingModelData?.usageMeters
        .map((m) => `- ${m.slug}: ${m.name}`)
        .join('\n') || '- usage_meter_slug: Usage Meter Name',
  }

  // Load code snippets for server and provider setup
  const locationKey = getLocationKey(finalStackDetails)
  const resolvedSnippets = resolveSnippets(snippets, frameworkKey)
  const authSnippets = resolvedSnippets?.[authProvider]
  const filePaths = snippets.filePaths?.[locationKey]
  const frameworkSnippets = snippets.frameworks[frameworkKey]

  if (authSnippets && filePaths && frameworkSnippets) {
    // Use snippets from codeSnippets.json
    replacements['{FLOWGLAD_SERVER_CODE}'] = authSnippets.serverInit
    replacements['{FLOWGLAD_ROUTE_CODE}'] =
      frameworkSnippets.routeHandlerTemplate.replace(
        /\{SERVER_PKG\}/g,
        frameworkSnippets.serverPkg
      )
    replacements['{FRONTEND_PROVIDER_SECTION}'] =
      `Add the FlowgladProvider to your root layout:

\`\`\`tsx
${authSnippets.layoutImport.replace(/\{PROVIDER_PKG\}/g, frameworkSnippets.providerPkg)}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        ${authSnippets.layoutProvider}
          {children}
        ${authSnippets.layoutProviderClose || '</FlowgladProvider>'}
      </body>
    </html>
  )
}
\`\`\``
    replacements['{BILLING_HELPERS_CODE}'] =
      `// Helper functions for billing UI
// Add your custom billing helpers here`
  } else {
    // Fallback snippets
    const customerIdField =
      codebaseInfo.customerIdSource
        .replace(/^(user\.|session\.user\.)/, '')
        .split('.')[0] || 'id'
    replacements['{FLOWGLAD_SERVER_CODE}'] =
      `import { FlowgladServer } from '@flowglad/server'
import { getSessionUser } from '${codebaseInfo.filePaths.libPath}/auth'

export const flowgladServer = new FlowgladServer({
  apiKey: process.env.FLOWGLAD_SECRET_KEY,
  getRequestingCustomer: async () => {
    const user = await getSessionUser()
    if (!user) {
      throw new Error('Unauthorized')
    }
    return {
      externalId: user.${customerIdField},
      email: user.email,
      name: user.name,
    }
  },
})`
    replacements['{FLOWGLAD_ROUTE_CODE}'] =
      `import { flowgladServer } from '${codebaseInfo.filePaths.serverFile.replace(/\.(ts|tsx|js|jsx)$/, '')}'

export async function GET(request: Request) {
  return flowgladServer.handleRequest(request)
}

export async function POST(request: Request) {
  return flowgladServer.handleRequest(request)
}`
    replacements['{FRONTEND_PROVIDER_SECTION}'] =
      `Add FlowgladProvider to your root layout.`
    replacements['{BILLING_HELPERS_CODE}'] =
      `// Billing helper functions`
  }

  return replacements
}

/**
 * Applies template replacements to a template string
 */
export function applyTemplateReplacements(
  template: string,
  replacements: Record<string, string>
): string {
  let result = template
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replace(
      new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
      value
    )
  }
  return result
}
