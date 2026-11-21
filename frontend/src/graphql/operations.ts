import { gql, type TypedDocumentNode } from '@apollo/client'

// --- Types (mirror backend/api/types.py) --------------------------------------

export type Language = 'EN' | 'NB'
export type Role = 'ADMIN' | 'CONTRIBUTOR' | 'VIEWER'
export type Category = 'BEER' | 'WINE' | 'COCKTAIL' | 'ALCOHOL_FREE' | 'OTHER'
export type Container = 'BOTTLE' | 'CAN' | 'DRAFT' | 'GLASS' | 'OTHER'
export type DrinkSort = 'DATE' | 'ADDED' | 'RATING' | 'NAME' | 'ABV'
export type FieldName = 'PRODUCER' | 'COUNTRY' | 'LOCATION' | 'STYLE'

export const CATEGORIES: Category[] = ['BEER', 'WINE', 'COCKTAIL', 'ALCOHOL_FREE', 'OTHER']
export const CONTAINERS: Container[] = ['BOTTLE', 'CAN', 'DRAFT', 'GLASS', 'OTHER']

export interface User {
  id: string
  username: string
  email: string | null
  role: Role
  isAdmin: boolean
  isApproved: boolean
  isActive: boolean
  isSuperuser: boolean
  language: Language
  dateJoined: string
  canAddDrinks: boolean
  pushNewDrinks: boolean
  pushCheers: boolean
  pushAdminNewSignup: boolean
  emailAdminNewSignup: boolean
  drinkCount?: number | null
}

export interface Person {
  id: string
  username: string
}

export interface Drink {
  id: string
  name: string
  producer: string
  style: string
  abv: number | null
  country: string
  category: Category
  container: Container | null
  rating: number
  comment: string
  location: string
  dateTried: string
  wouldHaveAgain: boolean
  barcode: string
  photoUrl: string | null
  thumbnailUrl: string | null
  photoWidth: number | null
  photoHeight: number | null
  createdBy: Person | null
  createdAt: string
  updatedAt: string
  cheersCount: number
  cheeredByMe: boolean
  canEdit: boolean
  clientId: string | null
}

export interface DrinkInput {
  name: string
  rating: number
  category: Category
  producer?: string
  style?: string
  abv?: number | null
  country?: string
  container?: Container | null
  comment?: string
  location?: string
  dateTried?: string
  wouldHaveAgain?: boolean
  barcode?: string
}

export interface DrinkFilter {
  search?: string
  category?: Category | null
  style?: string
  minRating?: number | null
  maxRating?: number | null
  userId?: string | null
  mine?: boolean
  dateFrom?: string
  dateTo?: string
  wouldHaveAgain?: boolean | null
  hasPhoto?: boolean | null
}

export interface LookupResult {
  source: string
  name: string
  producer: string | null
  style: string | null
  abv: number | null
  country: string | null
  category: Category
  thumbnail: string | null
  detail: string | null
  barcode: string | null
}

export interface Bucket {
  label: string
  count: number
  avgRating: number | null
}

export interface UserBucket {
  userId: string | null
  username: string
  count: number
  avgRating: number | null
}

export interface Stats {
  total: number
  avgRating: number | null
  wouldHaveAgainPct: number | null
  uniqueProducers: number
  uniqueCountries: number
  withPhoto: number
  ratingDistribution: number[]
  byCategory: Bucket[]
  byContainer: Bucket[]
  topStyles: Bucket[]
  topCountries: Bucket[]
  topProducers: Bucket[]
  monthly: Bucket[]
  byUser: UserBucket[]
  topDrinks: Drink[]
  years: number[]
}

export interface SiteConfig {
  version: string
  publicView: boolean
  allowSignup: boolean
  requireApproval: boolean
  lookupEnabled: boolean
  photoAi: boolean
  pushFcm: boolean
  providers: { openbrewerydb: boolean; thecocktaildb: boolean; openfoodfacts: boolean; vivino: boolean }
}

export interface SiteSettings {
  publicView: boolean
  allowSignup: boolean
  requireApproval: boolean
  defaultRole: Role
  lookupEnabled: boolean
  lookupOpenbrewerydb: boolean
  lookupThecocktaildb: boolean
  lookupOpenfoodfacts: boolean
  lookupVivino: boolean
  photoAi: boolean
}

export interface SystemStatus {
  version: string
  workerHealthy: boolean
  workerLastSeen: string | null
  emailsPending: number
  emailsFailed: number
  pushesPending: number
  users: number
  pendingUsers: number
  drinks: number
  photos: number
  appLogins: number
}

// --- Fragments ------------------------------------------------------------------

const USER_FIELDS = gql`
  fragment UserFields on User {
    id
    username
    email
    role
    isAdmin
    isApproved
    isActive
    isSuperuser
    language
    dateJoined
    canAddDrinks
    pushNewDrinks
    pushCheers
    pushAdminNewSignup
    emailAdminNewSignup
  }
`

const DRINK_FIELDS = gql`
  fragment DrinkFields on Drink {
    id
    name
    producer
    style
    abv
    country
    category
    container
    rating
    comment
    location
    dateTried
    wouldHaveAgain
    barcode
    photoUrl
    thumbnailUrl
    photoWidth
    photoHeight
    createdBy {
      id
      username
    }
    createdAt
    updatedAt
    cheersCount
    cheeredByMe
    canEdit
    clientId
  }
`

// --- Queries --------------------------------------------------------------------

export const ME: TypedDocumentNode<{ me: User | null }> = gql`
  ${USER_FIELDS}
  query Me {
    me {
      ...UserFields
    }
  }
`

export const SITE_CONFIG: TypedDocumentNode<{ siteConfig: SiteConfig }> = gql`
  query SiteConfig {
    siteConfig {
      version
      publicView
      allowSignup
      requireApproval
      lookupEnabled
      photoAi
      pushFcm
      providers {
        openbrewerydb
        thecocktaildb
        openfoodfacts
        vivino
      }
    }
  }
`

export interface DrinksVars {
  filter?: DrinkFilter
  sort?: DrinkSort
  descending?: boolean
  offset?: number
  limit?: number
}

export const DRINKS: TypedDocumentNode<
  { drinks: { items: Drink[]; total: number; hasMore: boolean } },
  DrinksVars
> = gql`
  ${DRINK_FIELDS}
  query Drinks($filter: DrinkFilter, $sort: DrinkSort, $descending: Boolean, $offset: Int, $limit: Int) {
    drinks(filter: $filter, sort: $sort, descending: $descending, offset: $offset, limit: $limit) {
      total
      hasMore
      items {
        ...DrinkFields
      }
    }
  }
`

export const DRINK: TypedDocumentNode<{ drink: Drink }, { id: string }> = gql`
  ${DRINK_FIELDS}
  query Drink($id: ID!) {
    drink(id: $id) {
      ...DrinkFields
    }
  }
`

export const SIMILAR_DRINKS: TypedDocumentNode<{ similarDrinks: Drink[] }, { name: string; excludeId?: string }> =
  gql`
    ${DRINK_FIELDS}
    query SimilarDrinks($name: String!, $excludeId: ID) {
      similarDrinks(name: $name, excludeId: $excludeId) {
        ...DrinkFields
      }
    }
  `

export const FIELD_VALUES: TypedDocumentNode<
  { producers: string[]; countries: string[]; locations: string[]; styles: string[] }
> = gql`
  query FieldValues {
    producers: fieldValues(field: PRODUCER)
    countries: fieldValues(field: COUNTRY)
    locations: fieldValues(field: LOCATION)
    styles: fieldValues(field: STYLE)
  }
`

export const PEOPLE: TypedDocumentNode<{ people: Person[] }> = gql`
  query People {
    people {
      id
      username
    }
  }
`

export const STATS: TypedDocumentNode<{ stats: Stats }, { userId?: string | null; year?: number | null }> = gql`
  ${DRINK_FIELDS}
  query Stats($userId: ID, $year: Int) {
    stats(userId: $userId, year: $year) {
      total
      avgRating
      wouldHaveAgainPct
      uniqueProducers
      uniqueCountries
      withPhoto
      ratingDistribution
      byCategory {
        label
        count
        avgRating
      }
      byContainer {
        label
        count
        avgRating
      }
      topStyles {
        label
        count
        avgRating
      }
      topCountries {
        label
        count
        avgRating
      }
      topProducers {
        label
        count
        avgRating
      }
      monthly {
        label
        count
        avgRating
      }
      byUser {
        userId
        username
        count
        avgRating
      }
      topDrinks {
        ...DrinkFields
      }
      years
    }
  }
`

const LOOKUP_FIELDS = gql`
  fragment LookupFields on LookupResult {
    source
    name
    producer
    style
    abv
    country
    category
    thumbnail
    detail
    barcode
  }
`

export const LOOKUP: TypedDocumentNode<{ lookup: LookupResult[] }, { category: Category; query: string }> = gql`
  ${LOOKUP_FIELDS}
  query Lookup($category: Category!, $query: String!) {
    lookup(category: $category, query: $query) {
      ...LookupFields
    }
  }
`

export const LOOKUP_BARCODE: TypedDocumentNode<
  { lookupBarcode: { code: string; product: LookupResult | null; previous: Drink[] } },
  { code: string }
> = gql`
  ${LOOKUP_FIELDS}
  ${DRINK_FIELDS}
  query LookupBarcode($code: String!) {
    lookupBarcode(code: $code) {
      code
      product {
        ...LookupFields
      }
      previous {
        ...DrinkFields
      }
    }
  }
`

export const PUSH_CONFIG: TypedDocumentNode<{ pushConfig: { publicKey: string; devices: number; fcmEnabled: boolean } }> =
  gql`
    query PushConfig {
      pushConfig {
        publicKey
        devices
        fcmEnabled
      }
    }
  `

// --- Auth mutations ---------------------------------------------------------------

export const LOGIN: TypedDocumentNode<
  { login: { token: string | null; user: User } },
  { username: string; password: string; device?: string | null }
> = gql`
  ${USER_FIELDS}
  mutation Login($username: String!, $password: String!, $device: String) {
    login(username: $username, password: $password, device: $device) {
      token
      user {
        ...UserFields
      }
    }
  }
`

export const SIGNUP: TypedDocumentNode<
  { signup: { token: string | null; user: User } },
  { username: string; email: string; password: string; language?: Language; device?: string | null }
> = gql`
  ${USER_FIELDS}
  mutation Signup($username: String!, $email: String!, $password: String!, $language: Language, $device: String) {
    signup(username: $username, email: $email, password: $password, language: $language, device: $device) {
      token
      user {
        ...UserFields
      }
    }
  }
`

export const LOGOUT: TypedDocumentNode<{ logout: boolean }> = gql`
  mutation Logout {
    logout
  }
`

export const REQUEST_PASSWORD_RESET: TypedDocumentNode<{ requestPasswordReset: boolean }, { email: string }> = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`

export const RESET_PASSWORD: TypedDocumentNode<
  { resetPassword: boolean },
  { uid: string; token: string; newPassword: string }
> = gql`
  mutation ResetPassword($uid: String!, $token: String!, $newPassword: String!) {
    resetPassword(uid: $uid, token: $token, newPassword: $newPassword)
  }
`

export const CHANGE_PASSWORD: TypedDocumentNode<
  { changePassword: boolean },
  { currentPassword: string; newPassword: string }
> = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`

export const UPDATE_PROFILE: TypedDocumentNode<
  { updateProfile: User },
  { email?: string | null; language?: Language }
> = gql`
  ${USER_FIELDS}
  mutation UpdateProfile($email: String, $language: Language) {
    updateProfile(email: $email, language: $language) {
      ...UserFields
    }
  }
`

export const UPDATE_NOTIFICATIONS: TypedDocumentNode<
  { updateNotifications: User },
  { input: Partial<Pick<User, 'pushNewDrinks' | 'pushCheers' | 'pushAdminNewSignup' | 'emailAdminNewSignup'>> }
> = gql`
  ${USER_FIELDS}
  mutation UpdateNotifications($input: NotificationSettingsInput!) {
    updateNotifications(input: $input) {
      ...UserFields
    }
  }
`

// --- Drink mutations ---------------------------------------------------------------

export const CREATE_DRINK: TypedDocumentNode<{ createDrink: Drink }, { input: DrinkInput; clientId?: string }> = gql`
  ${DRINK_FIELDS}
  mutation CreateDrink($input: DrinkInput!, $clientId: String) {
    createDrink(input: $input, clientId: $clientId) {
      ...DrinkFields
    }
  }
`

export const UPDATE_DRINK: TypedDocumentNode<{ updateDrink: Drink }, { id: string; input: DrinkInput }> = gql`
  ${DRINK_FIELDS}
  mutation UpdateDrink($id: ID!, $input: DrinkInput!) {
    updateDrink(id: $id, input: $input) {
      ...DrinkFields
    }
  }
`

export const DELETE_DRINK: TypedDocumentNode<{ deleteDrink: boolean }, { id: string }> = gql`
  mutation DeleteDrink($id: ID!) {
    deleteDrink(id: $id)
  }
`

export const REMOVE_PHOTO: TypedDocumentNode<{ removePhoto: Drink }, { drinkId: string }> = gql`
  ${DRINK_FIELDS}
  mutation RemovePhoto($drinkId: ID!) {
    removePhoto(drinkId: $drinkId) {
      ...DrinkFields
    }
  }
`

export const IMPORT_PHOTO: TypedDocumentNode<{ importPhoto: Drink }, { drinkId: string; url: string }> = gql`
  ${DRINK_FIELDS}
  mutation ImportPhoto($drinkId: ID!, $url: String!) {
    importPhoto(drinkId: $drinkId, url: $url) {
      ...DrinkFields
    }
  }
`

export const CHEER: TypedDocumentNode<
  { cheer: Pick<Drink, 'id' | 'cheersCount' | 'cheeredByMe'> },
  { drinkId: string; on: boolean }
> = gql`
  mutation Cheer($drinkId: ID!, $on: Boolean!) {
    cheer(drinkId: $drinkId, on: $on) {
      id
      cheersCount
      cheeredByMe
    }
  }
`

// --- Push ---------------------------------------------------------------------------

export const REGISTER_WEB_PUSH: TypedDocumentNode<
  { registerWebPush: boolean },
  { endpoint: string; p256dh: string; auth: string }
> = gql`
  mutation RegisterWebPush($endpoint: String!, $p256dh: String!, $auth: String!) {
    registerWebPush(endpoint: $endpoint, p256dh: $p256dh, auth: $auth)
  }
`

export const REGISTER_FCM: TypedDocumentNode<{ registerFcm: boolean }, { token: string; device?: string }> = gql`
  mutation RegisterFcm($token: String!, $device: String) {
    registerFcm(token: $token, device: $device)
  }
`

export const UNREGISTER_PUSH: TypedDocumentNode<{ unregisterPush: boolean }, { endpoint: string }> = gql`
  mutation UnregisterPush($endpoint: String!) {
    unregisterPush(endpoint: $endpoint)
  }
`

export const SEND_TEST_PUSH: TypedDocumentNode<{ sendTestPush: number }> = gql`
  mutation SendTestPush {
    sendTestPush
  }
`

// --- Admin --------------------------------------------------------------------------

export const ADMIN_USERS: TypedDocumentNode<{ users: User[] }> = gql`
  ${USER_FIELDS}
  query AdminUsers {
    users {
      ...UserFields
      drinkCount
    }
  }
`

const SITE_SETTINGS_FIELDS = gql`
  fragment SiteSettingsFields on SiteSettings {
    publicView
    allowSignup
    requireApproval
    defaultRole
    lookupEnabled
    lookupOpenbrewerydb
    lookupThecocktaildb
    lookupOpenfoodfacts
    lookupVivino
    photoAi
  }
`

export const ADMIN_SETTINGS: TypedDocumentNode<{ siteSettings: SiteSettings; systemStatus: SystemStatus }> = gql`
  ${SITE_SETTINGS_FIELDS}
  query AdminSettings {
    siteSettings {
      ...SiteSettingsFields
    }
    systemStatus {
      version
      workerHealthy
      workerLastSeen
      emailsPending
      emailsFailed
      pushesPending
      users
      pendingUsers
      drinks
      photos
      appLogins
    }
  }
`

export const UPDATE_SITE_SETTINGS: TypedDocumentNode<
  { updateSiteSettings: SiteSettings },
  { input: Partial<SiteSettings> }
> = gql`
  ${SITE_SETTINGS_FIELDS}
  mutation UpdateSiteSettings($input: SiteSettingsInput!) {
    updateSiteSettings(input: $input) {
      ...SiteSettingsFields
    }
  }
`

export const CREATE_USER: TypedDocumentNode<
  { createUser: User },
  { username: string; password: string; role: Role; email?: string | null }
> = gql`
  ${USER_FIELDS}
  mutation CreateUser($username: String!, $password: String!, $role: Role!, $email: String) {
    createUser(username: $username, password: $password, role: $role, email: $email) {
      ...UserFields
      drinkCount
    }
  }
`

export const UPDATE_USER: TypedDocumentNode<
  { updateUser: User },
  { id: string; role?: Role; isActive?: boolean }
> = gql`
  ${USER_FIELDS}
  mutation UpdateUser($id: ID!, $role: Role, $isActive: Boolean) {
    updateUser(id: $id, role: $role, isActive: $isActive) {
      ...UserFields
      drinkCount
    }
  }
`

export const APPROVE_USER: TypedDocumentNode<{ approveUser: User }, { id: string }> = gql`
  ${USER_FIELDS}
  mutation ApproveUser($id: ID!) {
    approveUser(id: $id) {
      ...UserFields
      drinkCount
    }
  }
`

export const REJECT_USER: TypedDocumentNode<{ rejectUser: boolean }, { id: string }> = gql`
  mutation RejectUser($id: ID!) {
    rejectUser(id: $id)
  }
`

export const DELETE_USER: TypedDocumentNode<{ deleteUser: boolean }, { id: string; deleteDrinks: boolean }> = gql`
  mutation DeleteUser($id: ID!, $deleteDrinks: Boolean!) {
    deleteUser(id: $id, deleteDrinks: $deleteDrinks)
  }
`

export const SET_USER_PASSWORD: TypedDocumentNode<{ setUserPassword: boolean }, { id: string; password: string }> =
  gql`
    mutation SetUserPassword($id: ID!, $password: String!) {
      setUserPassword(id: $id, password: $password)
    }
  `
