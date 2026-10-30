import { expandAllergies, findAllergens, parseAllergyList } from './allergens.js';

describe('parseAllergyList', () => {
  it('splits, trims, lowercases and removes duplicates', () => {
    expect(parseAllergyList(' Peanuts, shrimp ,,peanuts, Tree  Nuts')).toEqual(['peanuts', 'shrimp', 'tree nuts']);
    expect(parseAllergyList('')).toEqual([]);
  });
});

describe('findAllergens', () => {
  const scan = (allergies: string, text: string) =>
    findAllergens(text, expandAllergies(parseAllergyList(allergies))).map((h) => h.term);

  it('catches hidden sources of a known allergen', () => {
    expect(scan('fish', 'Pinakbet with 1 tbsp patis')).toEqual(['patis']);
    expect(scan('shrimp', 'Kangkong with bagoong alamang')).toHaveLength(1);
    expect(scan('gluten', 'Chicken with soy sauce')).toEqual(['soy sauce']);
    expect(scan('dairy', 'Oatmeal with ghee')).toEqual(['ghee']);
  });

  it('matches plurals but not other words that contain the allergen', () => {
    expect(scan('egg', '2 boiled eggs')).toEqual(['egg']);
    expect(scan('egg', 'Tortang talong (grilled eggplant)')).toEqual([]);
    expect(scan('milk', 'Roasted butternut squash')).toEqual([]);
  });

  it('flags "peanut-free" style wording too: a false alarm is safer than a missed allergen', () => {
    expect(scan('peanuts', 'Peanut-free turon')).toEqual(['peanut']);
  });

  it('still blocks an allergy it has no list for, by its own name', () => {
    expect(scan('kiwi', 'Fruit cup with kiwi and mango')).toEqual(['kiwi']);
    expect(scan('kiwi', 'Fruit cup with mango')).toEqual([]);
  });
});
