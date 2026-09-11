import { z } from 'zod';

/**
 * Approved Client Module V1 industry contract (ACT-1 decision D4).
 *
 * Exactly these values, in this order, plus "Other". Arbitrary industry
 * strings are NOT allowed in V1 domain validation - later API DTOs and
 * frontend selects import from this module so the contract stays
 * centralized and reusable.
 */
export const INDUSTRY_VALUES = Object.freeze([
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
] as const);

export type Industry = (typeof INDUSTRY_VALUES)[number];

/** Zod schema for the approved industry contract (optional-friendly). */
export const industrySchema = z.enum(INDUSTRY_VALUES);