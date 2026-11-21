import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { SetContextLink } from '@apollo/client/link/context'
import { HttpLink } from '@apollo/client/link/http'
import i18n from './i18n'
import { apiUrl, authHeaders, isNative } from './lib/platform'

// Read the token/CSRF cookie on every request: both change at login.
const headersLink = new SetContextLink((prevContext) => ({
  headers: {
    ...prevContext.headers,
    ...authHeaders(),
    'Accept-Language': i18n.language,
  },
}))

// The URI is a function so a changed server address (apps only) takes effect at once.
const httpLink = new HttpLink({ uri: () => apiUrl('/graphql/'), credentials: isNative ? 'omit' : 'same-origin' })

export const client = new ApolloClient({
  link: ApolloLink.from([headersLink, httpLink]),
  cache: new InMemoryCache({
    typePolicies: {
      Query: { fields: { drinks: { keyArgs: ['filter', 'sort', 'descending'], merge: false } } },
      SiteConfig: { keyFields: [] },
      Stats: { keyFields: false },
    },
  }),
})
