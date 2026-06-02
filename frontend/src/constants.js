export const CATEGORIES = ['Beer', 'Wine', 'Cocktail', 'Alcohol Free', 'Other']

// Serving / packaging type — shown for categories where it's meaningful.
export const CONTAINERS = ['Bottle', 'Can', 'Draft', 'Cask', 'Growler', 'Other']
export const CONTAINER_CATEGORIES = ['Beer', 'Alcohol Free', 'Other']
export const CONTAINER_ICON = {
  Bottle: '🍾', Can: '🥫', Draft: '🍺', Cask: '🛢️', Growler: '🧴', Other: '🍶',
}

export const CATEGORY_ICON = {
  Beer:           '🍺',
  Wine:           '🍷',
  Cocktail:       '🍸',
  'Alcohol Free': '🥤',
  Other:          '🍶',
}

// MUI-compatible color tokens (used in sx props)
export const CATEGORY_COLOR = {
  Beer:           { bg: '#f59f0b1f', color: '#f59e0b', border: '#f59f0b40' },
  Wine:           { bg: '#a855f71f', color: '#a855f7', border: '#a855f740' },
  Cocktail:       { bg: '#f174a61f', color: '#ec4899', border: '#ec489940' },
  'Alcohol Free': { bg: '#04cc5e1f',  color: '#04cc5e', border: '#04cc5e40' },
  Other:          { bg: '#2b83ff1f', color: '#2b83ff', border: '#2b83ff40' },
}

export const CATEGORY_DOT_COLOR = {
  Beer:           '#f59e0b',
  Wine:           '#a855f7',
  Cocktail:       '#ec4899',
  'Alcohol Free': '#04cc5e',
  Other:          '#2b83ff',
}

// Rating → background colour
export const ratingColor = (r) => {
  if (r <= 2) return '#dc2626'
  if (r <= 4) return '#ea580c'
  if (r <= 5) return '#ca8a04'
  if (r <= 7) return '#16a34a'
  if (r <= 9) return '#059669'
  return '#0d9488'
}

export const STYLES_BY_CATEGORY = {
  Beer: [
    'American IPA', 'West Coast IPA', 'Hazy IPA / NEIPA', 'Double IPA',
    'Pale Ale', 'American Pale Ale',
    'Lager', 'Pilsner', 'Helles',
    'Wheat Beer / Weizen', 'Witbier',
    'Stout', 'Imperial Stout', 'Oatmeal Stout',
    'Porter', 'Baltic Porter',
    'Sour / Gose', 'Berliner Weisse', 'Lambic / Gueuze',
    'Belgian Tripel', 'Belgian Dubbel', 'Saison',
    'Amber Ale', 'Red Ale', 'Irish Red',
    'Bock', 'Doppelbock', 'Barleywine',
    'Session Beer', 'Fruit Beer', 'Ginger Beer', 'Other',
  ],
  Wine: [
    'Red Wine', 'White Wine', 'Rosé',
    'Sparkling / Champagne', 'Prosecco', 'Cava',
    'Dessert Wine', 'Fortified (Port / Sherry)',
    'Natural Wine', 'Orange Wine', 'Pét-Nat', 'Other',
  ],
  Cocktail: [
    'Classic Cocktail', 'Sour', 'Highball',
    'Martini / Gimlet', 'Negroni / Old Fashioned',
    'Mojito / Mint Julep', 'Daiquiri', 'Margarita',
    'Tiki', 'Spritz', 'Shot / Shooter', 'Other',
  ],
  'Alcohol Free': [
    'Non-Alcoholic Beer', 'Mocktail', 'Kombucha',
    'Sparkling Water', 'Juice', 'Smoothie',
    'Iced Tea', 'Shrub', 'Other',
  ],
  Other: [
    'Cider', 'Hard Cider', 'Mead', 'Sake', 'Soju',
    'Whisky / Bourbon', 'Gin', 'Rum', 'Vodka',
    'Tequila / Mezcal', 'Brandy / Cognac',
    'Liqueur', 'Amaro / Bitters', 'Hard Seltzer', 'Other',
  ],
}
