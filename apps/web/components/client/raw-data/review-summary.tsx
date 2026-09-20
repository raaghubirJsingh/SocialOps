'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  values: Record<string, unknown>;
}

function val(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  return String(value).trim() || '—';
}

function row(label: string, value: string) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
      <span className="min-w-0 flex-1 text-slate-400">{label}</span>
      <span className="min-w-0 text-right text-slate-200 break-all">{value}</span>
    </div>
  );
}

export function ReviewSummary({ values }: Props) {
  const section = (title: string, children: React.ReactNode) => (
    <section className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="grid gap-1.5 sm:grid-cols-2">{children}</div>
    </section>
  );

  return (
    <Card className="mt-2">
      <CardHeader>
        <CardTitle className="text-base">Review request</CardTitle>
        <CardDescription>Use this recap before submitting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {section('Basic', (
          <>
            {row('Purpose', val(values.contentPurpose))}
            {row('Category', val(values.contentCategory))}
            {row('Type', val(values.contentType))}
            {row('Priority', val(values.priority))}
            {row('Platform(s)', val(values.platform))}
          </>
        ))}
        {section('Audience & Geo', (
          <>
            {row('Target Audience', val(values.targetAudience))}
            {row('Age Group', val(values.ageGroup))}
            {row('Gender', val(values.gender))}
            {row('Country', val(values.geoCountry))}
            {row('State', val(values.geoState))}
            {row('District', val(values.geoDistrict))}
            {row('City', val(values.geoCity))}
            {row('Area', val(values.geoArea))}
          </>
        ))}
        {section('Language & Style', (
          <>
            {row('Language', val(values.language))}
            {row('Tone', val(values.tone))}
            {row('Writing Style', val(values.writingStyle))}
            {row('Creative Style', val(values.creativeStyle))}
          </>
        ))}
        {section('Customer Type', (
          <>
            {row('Customer Type', val(values.customerType))}
          </>
        ))}
        {section('Event', (
          <>
            {row('Event Name', val(values.eventName))}
            {row('Event Date', val(values.eventDate))}
            {row('Start Time', val(values.startTime))}
            {row('End Time', val(values.endTime))}
            {row('Venue', val(values.venue))}
            {row('Country', val(values.country))}
            {row('State', val(values.state))}
            {row('District', val(values.district))}
            {row('City', val(values.city))}
            {row('Area', val(values.area))}
            {row('Registration', val(values.registrationRequired))}
            {row('Registration URL', val(values.registrationUrl))}
            {row('Contact Person', val(values.eventContactPerson))}
            {row('Contact Number', val(values.eventContactNumber))}
          </>
        ))}
        {section('Product / Service', (
          <>
            {row('Product / Service', val(values.productServiceRef))}
            {row('Offer Type', val(values.psOfferType))}
            {row('Price', val(values.psPrice))}
            {row('Discount', val(values.psDiscount))}
            {row('Valid From', val(values.psValidFrom))}
            {row('Valid Until', val(values.psValidUntil))}
            {row('Features', val(values.psFeatures))}
            {row('Benefits', val(values.psBenefits))}
            {row('Purchase URL', val(values.psPurchaseUrl))}
            {row('Contact', val(values.psContact))}
            {row('Offer Type (Promo)', val(values.promoOfferType))}
          </>
        ))}
        {section('Call to Action', (
          <>
            {row('CTA', val(values.cta))}
            {row('Custom CTA Text', val(values.customCtaText))}
          </>
        ))}
        {section('Contact', (
          <>
            {row('Contact Source', val(values.contactSource))}
            {row('Name', val(values.customName))}
            {row('Phone', val(values.customPhone))}
            {row('Email', val(values.customEmail))}
            {row('Website', val(values.customWebsite))}
          </>
        ))}
        {section('Reference / Material', (
          <>
            {row('Material Type', val(values.materialType))}
            {row('Material Purpose', val(values.materialPurpose))}
            {row('Reference Links', val(values.referenceLinkUrls))}
          </>
        ))}
        {section('Publishing', (
          <>
            {row('Preferred Date', val(values.preferredDate))}
            {row('Preferred Time', val(values.preferredTime))}
            {row('Publishing Platform(s)', val(values.publishingPlatform))}
            {row('Publishing Priority', val(values.publishingPriority))}
            {row('Campaign / Occasion', val(values.campaignOccasion))}
            {row('Deadline', val(values.deadline))}
            {row('Custom Email', val(values.customEmail))}
            {row('Custom Website', val(values.customWebsite))}
          </>
        ))}
        {section('Notes', (
          <>
            {row('Additional Information', val(values.additionalInformation))}
          </>
        ))}
      </CardContent>
    </Card>
  );
}
