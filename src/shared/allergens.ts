// Turns the user's allergy list into the words to look for in a meal plan,
// including common hidden sources, and scans generated text for them.

const GROUPS: Record<string, string[]> = {
  peanut: ['peanut', 'groundnut', 'peanut butter', 'satay', 'kare-kare', 'mani'],
  'tree nut': [
    'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut',
    'pine nut', 'pili', 'praline', 'marzipan', 'nutella',
  ],
  milk: [
    'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'whey', 'casein', 'ghee', 'kesong puti',
    'evaporated milk', 'condensed milk', 'leche flan', 'paneer', 'custard',
  ],
  egg: ['egg', 'mayonnaise', 'mayo', 'meringue', 'albumin', 'leche flan', 'custard', 'itlog'],
  fish: [
    'fish', 'fish sauce', 'patis', 'anchovy', 'anchovies', 'tuna', 'salmon', 'tilapia', 'bangus',
    'milkfish', 'galunggong', 'dilis', 'tinapa', 'sardine', 'sardines', 'mackerel', 'cod', 'bagoong',
    'dashi', 'bonito', 'worcestershire',
  ],
  shellfish: [
    'shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'alamang', 'bagoong', 'shrimp paste', 'oyster',
    'mussel', 'tahong', 'clam', 'halaan', 'scallop', 'squid', 'pusit', 'octopus', 'oyster sauce',
  ],
  soy: ['soy', 'soya', 'soy sauce', 'toyo', 'tofu', 'tokwa', 'taho', 'edamame', 'miso', 'tempeh', 'natto'],
  wheat: [
    'wheat', 'flour', 'bread', 'pandesal', 'pasta', 'spaghetti', 'noodle', 'noodles', 'pancit canton',
    'miki', 'misua', 'couscous', 'semolina', 'soy sauce', 'toyo', 'breadcrumbs', 'tortilla', 'cracker',
    'crackers', 'biscuit', 'cake', 'pastry', 'udon', 'ramen', 'seitan', 'barley',
  ],
  sesame: ['sesame', 'tahini', 'sesame oil', 'gomasio', 'hummus'],
};

const ALIASES: Record<string, string[]> = {
  peanuts: ['peanut'],
  nuts: ['tree nut', 'peanut'],
  'tree nuts': ['tree nut'],
  dairy: ['milk'],
  lactose: ['milk'],
  eggs: ['egg'],
  seafood: ['fish', 'shellfish'],
  shellfish: ['shellfish'],
  shrimp: ['shellfish'],
  prawns: ['shellfish'],
  crustaceans: ['shellfish'],
  gluten: ['wheat'],
  soya: ['soy'],
  soybean: ['soy'],
  soybeans: ['soy'],
};

export interface AllergenRule {
  allergy: string; // as the user wrote it
  terms: string[];
}

export function parseAllergyList(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const term = part.trim().toLowerCase().replace(/\s+/g, ' ');
    if (term) seen.add(term);
  }
  return [...seen];
}

export function expandAllergies(allergies: string[]): AllergenRule[] {
  return allergies.map((allergy) => {
    const groups = ALIASES[allergy] ?? (GROUPS[allergy] ? [allergy] : []);
    const terms = new Set<string>([allergy]);
    for (const g of groups) for (const t of GROUPS[g]) terms.add(t);
    return { allergy, terms: [...terms] };
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Whole-word match with an optional plural, so "egg" does not match "eggplant"
// and "butter" does not match "butternut squash".
export function findAllergens(text: string, rules: AllergenRule[]): { allergy: string; term: string }[] {
  const hits: { allergy: string; term: string }[] = [];
  for (const rule of rules) {
    for (const term of rule.terms) {
      const re = new RegExp(`(^|[^\\p{L}])${escape(term)}(s|es)?(?=$|[^\\p{L}])`, 'iu');
      if (re.test(text)) {
        hits.push({ allergy: rule.allergy, term });
        break;
      }
    }
  }
  return hits;
}
