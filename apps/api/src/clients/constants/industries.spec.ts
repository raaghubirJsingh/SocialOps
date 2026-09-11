import { INDUSTRY_VALUES, industrySchema } from './industries.js';

describe('Client V1 industry contract (approved decision D4)', () => {
  it('contains exactly the 19 approved values in order', () => {
    expect(INDUSTRY_VALUES).toEqual([
      'Advertising & Marketing',
      'Automotive',
      'Beauty & Personal Care',
      'Education & Training',
      'Entertainment & Media',
      'Fashion & Apparel',
      'Finance & Insurance',
      'Food & Beverage',
      'Healthcare & Wellness',
      'Hospitality & Travel',
      'Manufacturing',
      'Legal & Professional Services',
      'Nonprofit & Community',
      'Real Estate & Construction',
      'Retail & E-commerce',
      'Sports & Fitness',
      'Technology & Software',
      'Transportation & Logistics',
      'Other',
    ]);
  });

  it('includes the required "Other" option', () => {
    expect(INDUSTRY_VALUES).toContain('Other');
  });

  it('is frozen (no runtime mutation of the approved contract)', () => {
    expect(Object.isFrozen(INDUSTRY_VALUES)).toBe(true);
  });

  it('accepts every approved value through the Zod schema', () => {
    for (const value of INDUSTRY_VALUES) {
      expect(industrySchema.safeParse(value).success).toBe(true);
    }
  });

  it('rejects arbitrary industry strings (no free-text in V1)', () => {
    expect(industrySchema.safeParse('Aerospace').success).toBe(false);
    expect(industrySchema.safeParse('technology').success).toBe(false);
    expect(industrySchema.safeParse('').success).toBe(false);
    expect(industrySchema.safeParse(null).success).toBe(false);
    expect(industrySchema.safeParse(undefined).success).toBe(false);
  });
});