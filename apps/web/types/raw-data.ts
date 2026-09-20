/**
 * Client Raw Data Input V1 — master lists.
 * CLIENT SELF-SERVICE ONLY. UI validation baseline (no backend call yet).
 */
import { z } from 'zod';

export const CONTENT_PURPOSES = [
  'Awareness', 'Promotion', 'Announcement', 'Education', 'Engagement',
  'Lead Generation', 'Event', 'Recruitment', 'Product/Service Information',
  'Customer Information', 'Other',
] as const;
export type ContentPurpose = (typeof CONTENT_PURPOSES)[number];

export const CONTENT_CATEGORIES = [
  'Product', 'Service', 'Event', 'News/Update', 'Offer', 'Educational',
  'Corporate', 'Community', 'Festival/Occasion', 'Testimonial',
  'Recruitment', 'Other',
] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CONTENT_TYPES = [
  'Social Post', 'Carousel', 'Reel', 'Short Video', 'Long Video', 'Story',
  'Poster', 'Infographic', 'Article/Blog', 'Advertisement', 'Other',
] as const;

export const PLATFORMS = ['Instagram', 'Facebook', 'YouTube', 'Website'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PRIORITIES = ['Normal', 'Important', 'Urgent'] as const;

export const TARGET_AUDIENCES = [
  'General Public', 'Existing Customers', 'Potential Customers', 'Students',
  'Parents', 'Youth', 'Professionals', 'Business Owners', 'Farmers', 'Women',
  'Senior Citizens', 'Local Community', 'Employees', 'Other',
] as const;

export const AGE_GROUPS = [
  'Children', 'Teenagers', '18–24', '25–34', '35–44', '45–59', '60+', 'All Ages',
] as const;

export const GENDERS = ['All', 'Male', 'Female', 'Other'] as const;

export const LANGUAGES = ['Hindi', 'English', 'Punjabi', 'Hinglish', 'Other'] as const;
export type Language = (typeof LANGUAGES)[number];

export const TONES = [
  'Informative', 'Professional', 'Promotional', 'Educational', 'Emotional',
  'Inspirational', 'Conversational', 'Formal', 'Urgent', 'Festive', 'Humorous',
  'Other',
] as const;

export const WRITING_STYLES = [
  'Short & Crisp', 'Detailed', 'News Style', 'Storytelling',
  'Question/Answer', 'Promotional', 'Call-to-Action Focused',
] as const;

export const CREATIVE_STYLES = [
  'Clean', 'Corporate', 'Modern', 'Minimal', 'Bold', 'Traditional', 'Festive',
  'News/Editorial', 'Premium', 'Youth-oriented',
] as const;

export const OFFER_TYPES = [
  'Discount', 'Flat Price', 'Percentage Discount', 'Buy One Get One',
  'Limited Time Offer', 'New Launch', 'Free Trial', 'Free Consultation',
  'Seasonal Offer', 'Other',
] as const;

export const CTA_OPTIONS = [
  'Learn More', 'Buy Now', 'Book Now', 'Register Now', 'Contact Us',
  'Call Now', 'Visit Website', 'Visit Store', 'Download', 'Apply Now',
  'Subscribe', 'Follow Us', 'Share', 'Send Message', 'No CTA', 'Custom',
] as const;
export type CtaOption = (typeof CTA_OPTIONS)[number];

export const CONTACT_SOURCES = [
  'Use Client Primary Contact', 'Use Client Business Contact',
  'Use Existing Saved Contact', 'Custom Contact',
] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const MATERIAL_TYPES = [
  'Image', 'Video', 'PDF', 'Document', 'Spreadsheet', 'Logo',
  'Product Catalogue', 'Previous Content', 'Reference Link', 'Other',
] as const;

export const CUSTOMER_TYPES = [
  'Existing Customers',
  'Potential Customers',
  'Families',
  'Students',
  'Professionals',
  'Business Buyers',
  'Local Community',
  'Other',
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const KEY_POINTS_MAX = 8;

export const PUBLISHING_PLATFORMS = [
  'Instagram Feed',
  'Instagram Stories',
  'Instagram Reels',
  'Facebook Feed',
  'Facebook Stories',
  'Facebook Reels',
  'YouTube Short',
  'YouTube Video',
  'Website Banner',
  'Website Article',
  'Email Newsletter',
  'Other',
] as const;
export const CAMPAIGNS = [
  'Regular Content', 'Product Campaign', 'Service Campaign',
  'Festival Campaign', 'Seasonal Campaign', 'Event Campaign',
  'Awareness Campaign', 'Promotional Campaign', 'Election/Political Campaign',
  'Social Campaign', 'Recruitment Campaign', 'Other',
] as const;

export const REGISTRATION_OPTIONS = ['Yes', 'No'] as const;

export const WIZARD_STEPS = [
  'Basic', 'Audience', 'Language & Style', 'Content', 'Details', 'Reference',
  'Publishing', 'Review',
] as const;
export const contentInfoStepSchema = z.object({
  topic: z.string().min(1, 'Content topic is required.').max(200),
  keyMessage: z.string().min(1, 'Key message is required.').max(1000),
  brief: z.string().min(1, 'Raw information is required.').max(5000),
  keyPoints: z.array(z.string().min(1).max(140)).max(20).optional(),
  specialInstructions: z.string().max(2000).optional(),
});
export type ContentInfoStepValues = z.infer<typeof contentInfoStepSchema>;

const req = (msg: string) => ({ errorMap: () => ({ message: msg }) }) as const;

export const basicStepSchema = z.object({
  contentPurpose: z.enum(CONTENT_PURPOSES, req('Select a content purpose.')),
  contentCategory: z.enum(CONTENT_CATEGORIES, req('Select a content category.')),
  contentType: z.enum(CONTENT_TYPES, req('Select a content type.')),
  platform: z.array(z.enum(PLATFORMS)).min(1, 'Select one platform.'),
  priority: z.enum(PRIORITIES, req('Select a priority.')),
});
export type BasicStepValues = z.infer<typeof basicStepSchema>;

export const audienceStepSchema = z.object({
  targetAudience: z.array(z.string()).min(1, 'Select one audience.'),
  ageGroup: z.array(z.string()).optional(),
  gender: z.array(z.string()).optional(),
  geoCountry: z.string().max(100).optional(),
  geoState: z.string().max(100).optional(),
  geoDistrict: z.string().max(100).optional(),
  geoCity: z.string().max(100).optional(),
  geoArea: z.string().max(200).optional(),
  customerType: z.array(z.string()).optional(),
});
export type AudienceStepValues = z.infer<typeof audienceStepSchema>;

export const languageStyleStepSchema = z.object({
  language: z.array(z.enum(LANGUAGES)).min(1, 'Select one language.'),
  tone: z.string().max(50).optional(),
  writingStyle: z.string().max(50).optional(),
  creativeStyle: z.string().max(50).optional(),
});
export type LanguageStyleStepValues = z.infer<typeof languageStyleStepSchema>;

export const eventDetailsSchema = z.object({
  eventName: z.string().min(1).max(200),
  eventDate: z.string().min(1, 'Event date is required.'),
  startTime: z.string().max(50).optional(),
  endTime: z.string().max(50).optional(),
  venue: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  area: z.string().max(200).optional(),
  registrationRequired: z.enum(REGISTRATION_OPTIONS),
  registrationUrl: z.string().max(500).optional(),
  contactPerson: z.string().max(200).optional(),
  contactNumber: z.string().max(50).optional(),
});
export type EventDetailsValues = z.infer<typeof eventDetailsSchema>;

type DetailsStepShape = {
  contentCategory?: string;
  contentPurpose?: string;
  eventName?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  area?: string;
  registrationRequired?: string;
  registrationUrl?: string;
  eventContactPerson?: string;
  eventContactNumber?: string;
  productServiceRef?: string;
  psOfferType?: string;
  psPrice?: string;
  psDiscount?: string;
  psValidFrom?: string;
  psValidUntil?: string;
  psFeatures?: string;
  psBenefits?: string;
  psPurchaseUrl?: string;
  psContact?: string;
  promoOfferType?: string;
  cta?: string;
  customCtaText?: string;
  contactSource?: string;
  customName?: string;
  customPhone?: string;
  customEmail?: string;
  customWebsite?: string;
};

export function isEventVisible(v: DetailsStepShape): boolean {
  return v.contentCategory === 'Event';
}

export function isProductServiceVisible(v: DetailsStepShape): boolean {
  return (
    v.contentCategory === 'Product' ||
    v.contentCategory === 'Service' ||
    v.contentPurpose === 'Product/Service Information'
  );
}

export function isOfferVisible(v: DetailsStepShape): boolean {
  return v.contentCategory === 'Offer' || v.contentPurpose === 'Promotion';
}

export const detailsStepSchema = z
  .object({
    contentCategory: z.string().optional(),
    contentPurpose: z.string().optional(),
    eventName: z.string().max(200).optional(),
    eventDate: z.string().optional(),
    startTime: z.string().max(50).optional(),
    endTime: z.string().max(50).optional(),
    venue: z.string().max(200).optional(),
    country: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    district: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    area: z.string().max(200).optional(),
    registrationRequired: z.enum(REGISTRATION_OPTIONS).optional(),
    registrationUrl: z.string().max(500).optional(),
    eventContactPerson: z.string().max(200).optional(),
    eventContactNumber: z.string().max(50).optional(),
    productServiceRef: z.string().max(300).optional(),
    psOfferType: z.string().max(50).optional(),
    psPrice: z.string().max(50).optional(),
    psDiscount: z.string().max(50).optional(),
    psValidFrom: z.string().max(50).optional(),
    psValidUntil: z.string().max(50).optional(),
    psFeatures: z.string().max(2000).optional(),
    psBenefits: z.string().max(2000).optional(),
    psPurchaseUrl: z.string().max(500).optional(),
    psContact: z.string().max(300).optional(),
    promoOfferType: z.string().max(50).optional(),
    cta: z.string().max(50).optional(),
    customCtaText: z.string().max(100).optional(),
    contactSource: z.string().max(50).optional(),
    customName: z.string().max(200).optional(),
    customPhone: z.string().max(50).optional(),
    customEmail: z.string().max(200).optional(),
    customWebsite: z.string().max(300).optional(),
    keyPoints: z.array(z.string().min(1).max(140)).max(KEY_POINTS_MAX).optional(),
    publishingPlatform: z.array(z.string()).optional(),
    publishingPriority: z.string().max(20).optional(),
    campaignOccasion: z.string().max(100).optional(),
  })
  .superRefine((v, ctx) => {
    if (isEventVisible(v)) {
      if (!v.eventName || v.eventName.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventName'], message: 'Event name is required.' });
      }
      if (!v.eventDate || v.eventDate.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventDate'], message: 'Event date is required.' });
      }
      if (!v.startTime || v.startTime.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startTime'], message: 'Start time is required for events.' });
      }
      if (!v.endTime || v.endTime.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'End time is required for events.' });
      }
      if (!v.venue || v.venue.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['venue'], message: 'Venue is required for events.' });
      }
      if (!v.country || v.country.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['country'], message: 'Country is required for events.' });
      }
      if (!v.state || v.state.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'State/district is required for events.' });
      }
      if (!v.city || v.city.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: 'City is required for events.' });
      }
      if (!v.area || v.area.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['area'], message: 'Area is required for events.' });
      }
      if (!v.registrationRequired) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationRequired'], message: 'Choose whether registration is required.' });
      }
      if (v.registrationRequired === 'Yes' && (!v.registrationUrl || v.registrationUrl.trim().length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['registrationUrl'], message: 'Registration URL is required.' });
      }
      if (!v.eventContactPerson || v.eventContactPerson.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventContactPerson'], message: 'Event contact person is required.' });
      }
      if (!v.eventContactNumber || v.eventContactNumber.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['eventContactNumber'], message: 'Event contact number is required.' });
      }
    }
    if (isProductServiceVisible(v)) {
      if (!v.productServiceRef || v.productServiceRef.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['productServiceRef'], message: 'Product / Service is required.' });
      }
      if (!v.psPrice || v.psPrice.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['psPrice'], message: 'Price is required for product/service.' });
      }
      if (!v.psValidFrom || v.psValidFrom.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['psValidFrom'], message: 'Valid from date is required.' });
      }
      if (!v.psValidUntil || v.psValidUntil.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['psValidUntil'], message: 'Valid until date is required.' });
      }
      if (!v.psFeatures || v.psFeatures.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['psFeatures'], message: 'Key features are required.' });
      }
      if (!v.psBenefits || v.psBenefits.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['psBenefits'], message: 'Key benefits are required.' });
      }
    }
    if (isOfferVisible(v)) {
      if (!v.promoOfferType || v.promoOfferType.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['promoOfferType'], message: 'Offer type is required for offers.' });
      }
      if (!v.psDiscount || v.psDiscount.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['psDiscount'], message: 'Discount value is required for offers.' });
      }
    }
    if (v.contactSource === 'Custom Contact') {
      if (!v.customName || v.customName.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customName'], message: 'Contact name is required for custom contact.' });
      }
      if (!v.customPhone || v.customPhone.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customPhone'], message: 'Contact number is required for custom contact.' });
      }
      if (!v.customEmail || v.customEmail.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customEmail'], message: 'Contact email is required for custom contact.' });
      }
      if (!v.customWebsite || v.customWebsite.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customWebsite'], message: 'Contact website is required for custom contact.' });
      }
    }
    if (v.cta === 'Custom' && (!v.customCtaText || v.customCtaText.trim().length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customCtaText'], message: 'Custom CTA text is required.' });
    }
    if (v.publishingPlatform && v.publishingPlatform.length > 0) {
      if (!v.publishingPriority || v.publishingPriority.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['publishingPriority'], message: 'Publishing priority is required when platforms are set.' });
      }
      if (!v.campaignOccasion || v.campaignOccasion.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['campaignOccasion'], message: 'Campaign / occasion is required when platforms are set.' });
      }
    }
    if (v.keyPoints && v.keyPoints.length > KEY_POINTS_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['keyPoints'], message: `Key points must be ${KEY_POINTS_MAX} or fewer.` });
    }
  });
export type DetailsStepValues = z.infer<typeof detailsStepSchema>;

export const referenceStepSchema = z.object({
  materialType: z.array(z.string()).optional(),
  referenceLinkUrls: z.string().max(5000).optional(),
  materialPurpose: z.string().max(1000).optional(),
});
export type ReferenceStepValues = z.infer<typeof referenceStepSchema>;

export const publishingStepSchema = z.object({
  preferredDate: z.string().max(50).optional(),
  preferredTime: z.string().max(50).optional(),
  preferredPlatforms: z.array(z.string()).optional(),
  publishingPriority: z.string().max(20).optional(),
  campaignOccasion: z.string().max(50).optional(),
  deadline: z.string().max(50).optional(),
});
export type PublishingStepValues = z.infer<typeof publishingStepSchema>;

export const reviewStepSchema = z.object({
  additionalInformation: z.string().max(2000).optional(),
});
export type ReviewStepValues = z.infer<typeof reviewStepSchema>;

/** Full payload = every step merged. Submit validates this schema. */
export const rawDataRequestSchema = z.object({
  contentPurpose: z.enum(CONTENT_PURPOSES),
  contentCategory: z.enum(CONTENT_CATEGORIES),
  contentType: z.enum(CONTENT_TYPES),
  platform: z.array(z.enum(PLATFORMS)).min(1),
  priority: z.enum(PRIORITIES),
  targetAudience: z.array(z.string()).min(1),
  ageGroup: z.array(z.string()).optional(),
  gender: z.array(z.string()).optional(),
  geoCountry: z.string().max(100).optional(),
  geoState: z.string().max(100).optional(),
  geoDistrict: z.string().max(100).optional(),
  geoCity: z.string().max(100).optional(),
  geoArea: z.string().max(200).optional(),
  customerType: z.array(z.string()).optional(),
  language: z.array(z.enum(LANGUAGES)).min(1),
  tone: z.string().max(80).optional(),
  writingStyle: z.string().max(80).optional(),
  creativeStyle: z.string().max(80).optional(),
  topic: z.string().min(1).max(200),
  keyMessage: z.string().min(1).max(1000),
  brief: z.string().min(1).max(5000),
  keyPoints: z.array(z.string().min(1).max(140)).max(KEY_POINTS_MAX).optional(),
  specialInstructions: z.string().max(2000).optional(),
  eventName: z.string().max(200).optional(),
  eventDate: z.string().optional(),
  startTime: z.string().max(50).optional(),
  endTime: z.string().max(50).optional(),
  venue: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  area: z.string().max(200).optional(),
  registrationRequired: z.enum(REGISTRATION_OPTIONS).optional(),
  registrationUrl: z.string().max(500).optional(),
  eventContactPerson: z.string().max(200).optional(),
  eventContactNumber: z.string().max(50).optional(),
  productServiceRef: z.string().max(300).optional(),
  psOfferType: z.string().max(50).optional(),
  psPrice: z.string().max(50).optional(),
  psDiscount: z.string().max(50).optional(),
  psValidFrom: z.string().max(50).optional(),
  psValidUntil: z.string().max(50).optional(),
  psFeatures: z.string().max(2000).optional(),
  psBenefits: z.string().max(2000).optional(),
  psPurchaseUrl: z.string().max(500).optional(),
  psContact: z.string().max(300).optional(),
  promoOfferType: z.string().max(50).optional(),
  cta: z.string().max(50).optional(),
  customCtaText: z.string().max(100).optional(),
  contactSource: z.string().max(50).optional(),
  customName: z.string().max(200).optional(),
  customPhone: z.string().max(50).optional(),
  customEmail: z.string().max(300).optional(),
  customWebsite: z.string().max(300).optional(),
  materialType: z.array(z.string()).optional(),
  referenceLinkUrls: z.string().max(5000).optional(),
  materialPurpose: z.string().max(1000).optional(),
  preferredDate: z.string().max(50).optional(),
  preferredTime: z.string().max(50).optional(),
  publishingPlatform: z.array(z.string()).optional(),
  publishingPriority: z.string().max(20).optional(),
  campaignOccasion: z.string().max(100).optional(),
  deadline: z.string().max(50).optional(),
  additionalInformation: z.string().max(2000).optional(),
});
export type RawDataRequestValues = z.infer<typeof rawDataRequestSchema>;

/** Blank defaults for a fresh wizard. */
export const RAW_DATA_REQUEST_DEFAULTS: WizardValues = {
  platform: [],
  targetAudience: [],
  ageGroup: [],
  gender: [],
  customerType: [],
  language: [],
  keyPoints: [''],
  materialType: [],
  referenceLinkUrls: '',
  preferredPlatforms: [],
};

export type WizardValues = {
  contentPurpose?: string;
  contentCategory?: string;
  contentType?: string;
  platform?: string[];
  priority?: string;
  targetAudience?: string[];
  ageGroup?: string[];
  gender?: string[];
  geoCountry?: string;
  geoState?: string;
  geoDistrict?: string;
  geoCity?: string;
  geoArea?: string;
  customerType?: string[];
  language?: string[];
  tone?: string;
  writingStyle?: string;
  creativeStyle?: string;
  topic?: string;
  keyMessage?: string;
  brief?: string;
  keyPoints?: string[];
  specialInstructions?: string;
  eventName?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  venue?: string;
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  area?: string;
  registrationRequired?: string;
  registrationUrl?: string;
  eventContactPerson?: string;
  eventContactNumber?: string;
  productServiceRef?: string;
  psOfferType?: string;
  psPrice?: string;
  psDiscount?: string;
  psValidFrom?: string;
  psValidUntil?: string;
  psFeatures?: string;
  psBenefits?: string;
  psPurchaseUrl?: string;
  psContact?: string;
  promoOfferType?: string;
  cta?: string;
  customCtaText?: string;
  contactSource?: string;
  customName?: string;
  customPhone?: string;
  customEmail?: string;
  customWebsite?: string;
  materialType?: string[];
  referenceLinkUrls?: string;
  materialPurpose?: string;
  preferredDate?: string;
  preferredTime?: string;
  preferredPlatforms?: string[];
  publishingPlatform?: string[];
  publishingPriority?: string;
  campaignOccasion?: string;
  deadline?: string;
  additionalInformation?: string;
};
