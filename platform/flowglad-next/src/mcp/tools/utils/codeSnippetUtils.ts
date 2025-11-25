/**
 * Utilities for resolving and mapping code snippets from codeSnippets.json
 */

export type FrameworkKey = 'nextjs' | 'react'
export type AuthKey = 'supabase' | 'clerk' | 'nextauth' | 'custom'
export type LocationKey = 'src/app' | 'src/pages' | 'app' | 'pages'

/**
 * Maps a framework string to a framework key for code snippets
 */
export function getFrameworkKey(framework: string): FrameworkKey {
  const lower = framework.toLowerCase()
  if (lower.includes('nextjs') || lower.includes('next.js'))
    return 'nextjs'
  if (lower.includes('react')) return 'react'
  return 'nextjs' // fallback
}

/**
 * Maps an auth provider string to an auth key for code snippets
 */
export function getAuthKey(authProvider: string): AuthKey {
  const lower = authProvider.toLowerCase()
  if (lower.includes('supabase')) return 'supabase'
  if (lower.includes('clerk')) return 'clerk'
  if (lower.includes('nextauth') || lower.includes('next-auth'))
    return 'nextauth'
  return 'custom' // fallback
}

/**
 * Maps a location string to a location key for code snippets
 */
export function getLocationKey(stackDetails: string): LocationKey {
  const lower = stackDetails.toLowerCase()
  if (lower.includes('src/app') || lower.includes('src\\app'))
    return 'src/app'
  if (lower.includes('src/pages') || lower.includes('src\\pages'))
    return 'src/pages'
  if (lower.includes('app router') || lower.includes('app/'))
    return 'app'
  if (lower.includes('pages router') || lower.includes('pages/'))
    return 'pages'
  return 'app' // fallback
}

/**
 * Resolves framework-specific snippets from base templates
 */
export function resolveSnippets(
  snippets: any,
  frameworkKey: FrameworkKey
) {
  const base = snippets.base
  const framework = snippets.frameworks[frameworkKey]
  if (!base || !framework) return null

  const resolved: Record<string, Record<string, string>> = {}

  for (const [authKey, authSnippets] of Object.entries(base)) {
    resolved[authKey] = {}
    for (const [key, value] of Object.entries(
      authSnippets as Record<string, string>
    )) {
      if (key.endsWith('Template')) {
        const baseKey = key.replace('Template', '')
        resolved[authKey][baseKey] = (value as string)
          .replace(/\{SERVER_PKG\}/g, framework.serverPkg)
          .replace(/\{PROVIDER_PKG\}/g, framework.providerPkg)
          .replace(/\{BILLING_HOOK_PKG\}/g, framework.billingHookPkg)
      } else {
        resolved[authKey][key] = value as string
      }
    }
  }

  return resolved
}
