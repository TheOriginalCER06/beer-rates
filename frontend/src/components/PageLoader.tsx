import { Center, Loader } from '@mantine/core'

/** Shown while a page's code is being fetched (pages are lazy-loaded, see App.tsx). */
export function PageLoader() {
  return (
    <Center py="xl">
      <Loader size="sm" />
    </Center>
  )
}
