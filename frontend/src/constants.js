export const CATEGORIES = ['Beer', 'Wine', 'Cocktail', 'Alcohol Free', 'Other']

export const CATEGORY_ICON = {
  Beer:           '🍺',
  Wine:           '🍷',
  Cocktail:       '🍸',
  'Alcohol Free': '🥤',
  Other:          '🍶',
}

// MUI-compatible color tokens (used in sx props)
export const CATEGORY_COLOR = {
  Beer:           { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.25)' },
  Wine:           { bg: 'rgba(192,132,252,0.12)', color: '#c084fc', border: 'rgba(192,132,252,0.25)' },
  Cocktail:       { bg: 'rgba(249,168,212,0.12)', color: '#f9a8d4', border: 'rgba(249,168,212,0.25)' },
  'Alcohol Free': { bg: 'rgba(52,211,153,0.12)',  color: '#34d399', border: 'rgba(52,211,153,0.25)' },
  Other:          { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)' },
}

export const CATEGORY_DOT_COLOR = {
  Beer:           '#f59e0b',
  Wine:           '#a855f7',
  Cocktail:       '#ec4899',
  'Alcohol Free': '#10b981',
  Other:          '#64748b',
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
    'Session Beer', 'Fruit Beer', 'Other',
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
