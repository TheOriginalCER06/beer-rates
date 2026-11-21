import type { Category } from '../graphql/operations'

// Suggested styles per category (international names, as on labels). Free text is allowed too.
export const STYLES: Record<Category, string[]> = {
  BEER: [
    'IPA', 'West Coast IPA', 'Hazy IPA / NEIPA', 'Double IPA', 'Session IPA',
    'Pale Ale', 'American Pale Ale', 'Lager', 'Pilsner', 'Helles', 'Bayer',
    'Wheat Beer / Weizen', 'Witbier', 'Stout', 'Imperial Stout', 'Oatmeal Stout', 'Pastry Stout',
    'Porter', 'Baltic Porter', 'Sour', 'Gose', 'Berliner Weisse', 'Lambic / Gueuze',
    'Belgian Tripel', 'Belgian Dubbel', 'Quadrupel', 'Saison', 'Farmhouse Ale',
    'Amber Ale', 'Red Ale', 'Brown Ale', 'Bock', 'Doppelbock', 'Barleywine',
    'Juleøl', 'Bokkøl', 'Fruit Beer', 'Other',
  ],
  WINE: [
    'Red Wine', 'White Wine', 'Rosé', 'Sparkling / Champagne', 'Prosecco', 'Cava',
    'Dessert Wine', 'Fortified (Port / Sherry)', 'Natural Wine', 'Orange Wine', 'Pét-Nat', 'Gløgg', 'Other',
  ],
  COCKTAIL: [
    'Classic Cocktail', 'Sour', 'Highball', 'Martini / Gimlet', 'Negroni / Old Fashioned',
    'Mojito / Mint Julep', 'Daiquiri', 'Margarita', 'Tiki', 'Spritz', 'Shot', 'Other',
  ],
  ALCOHOL_FREE: [
    'Alcohol-free Beer', 'Mocktail', 'Kombucha', 'Sparkling Water', 'Soda', 'Juice', 'Iced Tea', 'Other',
  ],
  OTHER: [
    'Cider', 'Mead', 'Sake', 'Soju', 'Whisky', 'Bourbon', 'Gin', 'Rum', 'Vodka', 'Aquavit',
    'Tequila / Mezcal', 'Brandy / Cognac', 'Liqueur', 'Amaro / Bitters', 'Hard Seltzer', 'Other',
  ],
}

export const CATEGORY_ICON: Record<Category, string> = {
  BEER: '🍺',
  WINE: '🍷',
  COCKTAIL: '🍸',
  ALCOHOL_FREE: '🥤',
  OTHER: '🥃',
}

// Common countries for the autocomplete (names in both languages are accepted as typed).
export const COUNTRIES = [
  'Norge', 'Sverige', 'Danmark', 'Finland', 'Island', 'Tyskland', 'Belgia', 'Nederland', 'Storbritannia',
  'Irland', 'Skottland', 'Frankrike', 'Italia', 'Spania', 'Portugal', 'Tsjekkia', 'Polen', 'Østerrike',
  'Sveits', 'USA', 'Canada', 'Mexico', 'Argentina', 'Chile', 'Australia', 'New Zealand', 'Sør-Afrika',
  'Japan', 'Kina', 'Hellas', 'Ungarn', 'Georgia',
]
