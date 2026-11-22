import { CombinedGraphQLErrors, ServerError } from '@apollo/client'
import type { TFunction } from 'i18next'
import i18n from '../i18n'

/** Translate a backend error code (`extensions.code`), falling back to the server's message. */
export function translateCode(
  code: string | undefined,
  detail: string,
  t: TFunction,
  params: Record<string, unknown> = {},
): string {
  const key = `errors.${code}`
  if (code && i18n.exists(key)) {
    return t(key, { ...params, detail }).trim()
  }
  return detail || t('errors.UNKNOWN')
}

/** Human-readable, translated message for any error thrown by Apollo. */
export function describeError(error: unknown, t: TFunction): string {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors
      .map((e) => translateCode(e.extensions?.code as string | undefined, e.message, t, e.extensions ?? {}))
      .join('\n')
  }
  if (ServerError.is(error)) {
    return t('errors.SERVER_ERROR', { status: error.statusCode })
  }
  if (error instanceof TypeError) {
    return t('errors.NETWORK')
  }
  return t('errors.UNKNOWN')
}
