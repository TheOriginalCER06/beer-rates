import { createTheme, type MantineColorsTuple } from '@mantine/core'

// Amber like a pale ale, and a dark stout brown for the header (see branding/build_icons.py).
const beer: MantineColorsTuple = [
  '#fff8e6',
  '#ffefc7',
  '#fde08f',
  '#fbcf55',
  '#f8bf2a',
  '#f59e0b', // logo amber
  '#d98706',
  '#b46c05',
  '#8f5508',
  '#73450b',
]

const stout: MantineColorsTuple = [
  '#f6efe7',
  '#e7dacb',
  '#cfb498',
  '#b68d64',
  '#a06e3c',
  '#8c5a28',
  '#6e4520',
  '#523219',
  '#3b2410',
  '#2b1a0b', // header and app icon background
]

export const theme = createTheme({
  colors: { beer, stout },
  primaryColor: 'beer',
  primaryShade: { light: 6, dark: 5 },
  // Dark text on amber buttons and badges.
  autoContrast: true,
  defaultRadius: 'md',
  headings: { fontWeight: '800' },
  // 16px inputs: iOS zooms the page into anything smaller when it gets focus.
  components: {
    TextInput: { defaultProps: { size: 'md' } },
    PasswordInput: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    Autocomplete: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
  },
})

export const CATEGORY_COLOR: Record<string, string> = {
  BEER: 'beer',
  WINE: 'grape',
  COCKTAIL: 'pink',
  ALCOHOL_FREE: 'teal',
  OTHER: 'blue',
}

/** Rating → Mantine colour, red (1) to teal (10). */
export function ratingColor(rating: number): string {
  if (rating <= 2) return 'red'
  if (rating <= 4) return 'orange'
  if (rating <= 5) return 'yellow'
  if (rating <= 7) return 'lime'
  if (rating <= 9) return 'green'
  return 'teal'
}
