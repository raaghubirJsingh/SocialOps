'use client';

import type { Control, FieldErrors } from 'react-hook-form';
import { Controller } from 'react-hook-form';

import type { WizardValues } from '@/types/raw-data';
import {
  AGE_GROUPS,
  CONTACT_SOURCES,
  CONTENT_CATEGORIES,
  CONTENT_PURPOSES,
  CONTENT_TYPES,
  CREATIVE_STYLES,
  CTA_OPTIONS,
  CUSTOMER_TYPES,
  GENDERS,
  KEY_POINTS_MAX,
  LANGUAGES,
  MATERIAL_TYPES,
  OFFER_TYPES,
  PLATFORMS,
  PRIORITIES,
  PUBLISHING_PLATFORMS,
  REGISTRATION_OPTIONS,
  TARGET_AUDIENCES,
  TONES,
  WRITING_STYLES,
} from '@/types/raw-data';
import { MultiSelectChips, SingleSelect, TextareaField, TextField } from '@/components/client/raw-data/fields';

function addRow(
  items: string[],
  onChange: (next: string[]) => void,
): React.ReactNode[] {
  return items.map((item, index) => (
    <div key={index} className="flex gap-2">
      <TextField
        label={`Key point ${index + 1}`}
        value={item}
        onChange={(e) => {
          const next = [...items];
          next[index] = e.target.value;
          onChange(next);
        }}
        placeholder="Enter a key point"
      />
      <button
        type="button"
        onClick={() => {
          const next = items.filter((_, i) => i !== index);
          onChange(next);
        }}
        className="shrink-0 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-300 hover:border-red-500 hover:text-red-300"
      >
        Remove
      </button>
    </div>
  ));
}

const err = (errors: FieldErrors<WizardValues>, name: keyof WizardValues): string | undefined => {
  const e = errors[name];
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') return e.message;
  return undefined;
};

interface Props {
  control: Control<WizardValues>;
  errors: FieldErrors<WizardValues>;
}

export function StepBasic({ control, errors }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Controller
        control={control}
        name="contentPurpose"
        render={({ field }) => (
          <SingleSelect
            label="Content Purpose"
            required
            options={CONTENT_PURPOSES}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'contentPurpose')}
          />
        )}
      />
      <Controller
        control={control}
        name="contentCategory"
        render={({ field }) => (
          <SingleSelect
            label="Content Category"
            required
            options={CONTENT_CATEGORIES}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'contentCategory')}
          />
        )}
      />
      <Controller
        control={control}
        name="contentType"
        render={({ field }) => (
          <SingleSelect
            label="Content Type"
            required
            options={CONTENT_TYPES}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'contentType')}
          />
        )}
      />
      <Controller
        control={control}
        name="priority"
        render={({ field }) => (
          <SingleSelect
            label="Priority"
            required
            options={PRIORITIES}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'priority')}
          />
        )}
      />
      <div className="sm:col-span-2">
        <Controller
          control={control}
          name="platform"
          render={({ field }) => (
            <MultiSelectChips
              label="Platform"
              required
              options={PLATFORMS}
              value={(field.value as string[]) ?? []}
              onChange={field.onChange}
              error={err(errors, 'platform')}
            />
          )}
        />
      </div>

      <div className="sm:col-span-2">
        <Controller
          control={control}
          name="publishingPlatform"
          render={({ field }) => (
            <MultiSelectChips
              label="Publishing Platform (optional)"
              options={PUBLISHING_PLATFORMS}
              value={(field.value as string[]) ?? []}
              onChange={field.onChange}
              error={err(errors, 'publishingPlatform')}
            />
          )}
        />
      </div>
      <Controller
        control={control}
        name="publishingPriority"
        render={({ field }) => (
          <SingleSelect
            label="Publishing Priority (optional)"
            options={PRIORITIES}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'publishingPriority')}
          />
        )}
      />
      <Controller
        control={control}
        name="campaignOccasion"
        render={({ field }) => (
          <TextField
            label="Campaign / Occasion (optional)"
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'campaignOccasion')}
          />
        )}
      />
      <Controller
        control={control}
        name="customerType"
        render={({ field }) => (
          <MultiSelectChips
            label="Customer Type (optional)"
            options={CUSTOMER_TYPES}
            value={(field.value as string[]) ?? []}
            onChange={field.onChange}
            error={err(errors, 'customerType')}
          />
        )}
      />
    </div>
  );
}

export function StepAudience({ control, errors }: Props) {
  return (
    <div className="grid gap-4">
      <Controller
        control={control}
        name="targetAudience"
        render={({ field }) => (
          <MultiSelectChips
            label="Target Audience"
            required
            options={TARGET_AUDIENCES}
            value={(field.value as string[]) ?? []}
            onChange={field.onChange}
            error={err(errors, 'targetAudience')}
          />
        )}
      />
      <Controller
        control={control}
        name="ageGroup"
        render={({ field }) => (
          <MultiSelectChips
            label="Age Group (optional)"
            options={AGE_GROUPS}
            value={(field.value as string[]) ?? []}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="gender"
        render={({ field }) => (
          <MultiSelectChips
            label="Gender (optional)"
            options={GENDERS}
            value={(field.value as string[]) ?? []}
            onChange={field.onChange}
          />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="geoCountry"
          render={({ field }) => (
            <TextField label="Country (optional)" value={(field.value as string) ?? ''} onChange={field.onChange} />
          )}
        />
        <Controller
          control={control}
          name="geoState"
          render={({ field }) => (
            <TextField label="State (optional)" value={(field.value as string) ?? ''} onChange={field.onChange} />
          )}
        />
      </div>
    </div>
  );
}

export function StepLanguageStyle({ control, errors }: Props) {
  return (
    <div className="grid gap-4">
      <Controller
        control={control}
        name="language"
        render={({ field }) => (
          <MultiSelectChips
            label="Language"
            required
            options={LANGUAGES}
            value={(field.value as string[]) ?? []}
            onChange={field.onChange}
            error={err(errors, 'language')}
          />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Controller
          control={control}
          name="tone"
          render={({ field }) => (
            <SingleSelect
              label="Tone (optional)"
              options={TONES}
              value={(field.value as string) ?? ''}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="writingStyle"
          render={({ field }) => (
            <SingleSelect
              label="Writing Style (optional)"
              options={WRITING_STYLES}
              value={(field.value as string) ?? ''}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="creativeStyle"
          render={({ field }) => (
            <SingleSelect
              label="Creative Style (optional)"
              options={CREATIVE_STYLES}
              value={(field.value as string) ?? ''}
              onChange={field.onChange}
            />
          )}
        />
      </div>
    </div>
  );
}

export function StepContentInfo({ control, errors }: Props) {
  return (
    <div className="grid gap-4">
      <Controller
        control={control}
        name="topic"
        render={({ field }) => (
          <TextField
            label="Content Topic"
            required
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'topic')}
          />
        )}
      />
      <Controller
        control={control}
        name="keyMessage"
        render={({ field }) => (
          <TextareaField
            label="Key Message"
            required
            rows={3}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'keyMessage')}
          />
        )}
      />
      <Controller
        control={control}
        name="brief"
        render={({ field }) => (
          <TextareaField
            label="Raw Information"
            required
            rows={6}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'brief')}
          />
        )}
      />

      <div className="grid gap-3">
        <p className="text-sm font-medium text-slate-200">Key Points</p>
        <Controller
          control={control}
          name="keyPoints"
          render={({ field }) => {
            const rows = (field.value as string[]) ?? [''];
            const setRows = (next: string[]) => field.onChange(next);
            return (
              <div className="space-y-2">
                {addRow(rows, setRows)}
                {rows.length < KEY_POINTS_MAX && (
                  <button
                    type="button"
                    onClick={() => setRows([...rows, ''])}
                    className="text-xs text-blue-300 hover:text-blue-200"
                  >
                    + Add key point
                  </button>
                )}
                {errors.keyPoints && (
                  <p className="text-xs text-red-400">{String(errors.keyPoints.message)}</p>
                )}
              </div>
            );
          }}
        />
      </div>

      <Controller
        control={control}
        name="specialInstructions"
        render={({ field }) => (
          <TextareaField
            label="Special Instructions (optional)"
            rows={3}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'specialInstructions')}
          />
        )}
      />
    </div>
  );
}

export function StepDetails(props: Props & {
  contentCategory: string;
  contentPurpose: string;
  ctaValue: string;
  registrationValue: string;
  contactValue: string;
}) {
  const { control, errors } = props;
  const showEvent = props.contentCategory === 'Event';
  const showProductService =
    props.contentCategory === 'Product' ||
    props.contentCategory === 'Service' ||
    props.contentPurpose === 'Product/Service Information';
  const showOffer = props.contentCategory === 'Offer' || props.contentPurpose === 'Promotion';
  return (
    <div className="grid gap-6">
      {showEvent ? <EventGroup control={control} errors={errors} registrationValue={props.registrationValue} /> : null}
      {showProductService ? <ProductServiceGroup control={control} errors={errors} /> : null}
      {showOffer ? <OfferGroup control={control} errors={errors} /> : null}
      <CtaGroup control={control} errors={errors} ctaValue={props.ctaValue} />
      <ContactGroup control={control} errors={errors} contactValue={props.contactValue} />
    </div>
  );
}

function EventGroup({ control, errors, registrationValue }: Props & { registrationValue: string }) {
  return (
    <section aria-label="Event details" className="grid gap-4">
      <h3 className="text-sm font-semibold text-slate-200">Event (only for Event category)</h3>
      <Controller
        control={control}
        name="eventName"
        render={({ field }) => (
          <TextField label="Event Name" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'eventName')} />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="eventDate"
          render={({ field }) => (
            <TextField label="Event Date" required type="date" value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'eventDate')} />
          )}
        />
        <Controller
          control={control}
          name="registrationRequired"
          render={({ field }) => (
            <SingleSelect label="Registration Required" required options={REGISTRATION_OPTIONS} value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'registrationRequired')} />
          )}
        />

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="startTime"
          render={({ field }) => (
            <TextField label="Start Time" required type="time" value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'startTime')} />
          )}
        />
        <Controller
          control={control}
          name="endTime"
          render={({ field }) => (
            <TextField label="End Time" required type="time" value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'endTime')} />
          )}
        />
      </div>
      <Controller
        control={control}
        name="venue"
        render={({ field }) => (
          <TextField label="Venue" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'venue')} />
        )}
      />
      <div className="grid gap-4">

      <Controller
        control={control}
        name="psOfferType"
        render={({ field }) => (
          <SingleSelect label="Offer Type" options={OFFER_TYPES} value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psOfferType')} />
        )}
      />
      <Controller
        control={control}
        name="psPrice"
        render={({ field }) => (
          <TextField label="Price" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psPrice')} />
        )}
      />
      <Controller
        control={control}
        name="psDiscount"
        render={({ field }) => (
          <TextField label="Discount" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psDiscount')} />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="psValidFrom"
          render={({ field }) => (
            <TextField label="Valid From" required type="date" value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psValidFrom')} />
          )}
        />
        <Controller
          control={control}
          name="psValidUntil"
          render={({ field }) => (
            <TextField label="Valid Until" required type="date" value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psValidUntil')} />
          )}
        />
      </div>
      <Controller
        control={control}
        name="psFeatures"
        render={({ field }) => (
          <TextareaField label="Key Features" required rows={3} value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psFeatures')} />
        )}
      />
      <Controller
        control={control}
        name="psBenefits"
        render={({ field }) => (
          <TextareaField label="Key Benefits" required rows={3} value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psBenefits')} />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="psPurchaseUrl"
          render={({ field }) => (
            <TextField label="Purchase URL" value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psPurchaseUrl')} />
          )}
        />
        <Controller
          control={control}
          name="psContact"
          render={({ field }) => (
            <TextField label="Contact" value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'psContact')} />
          )}
        />
      </div>

        <Controller
          control={control}
          name="country"
          render={({ field }) => (
            <TextField label="Country (required for events)" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'country')} />
          )}
        />
        <Controller
          control={control}
          name="state"
          render={({ field }) => (
            <TextField label="State / District (required for events)" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'state')} />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="city"
            render={({ field }) => (
              <TextField label="City (required for events)" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'city')} />
            )}
          />
          <Controller
            control={control}
            name="area"
            render={({ field }) => (
              <TextField label="Area (required for events)" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'area')} />
            )}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="eventContactPerson"
          render={({ field }) => (
            <TextField label="Event Contact Person" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'eventContactPerson')} />
          )}
        />
        <Controller
          control={control}
          name="eventContactNumber"
          render={({ field }) => (
            <TextField label="Event Contact Number" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'eventContactNumber')} />
          )}
        />
      </div>

      </div>
      {registrationValue === 'Yes' ? (
        <Controller
          control={control}
          name="registrationUrl"
          render={({ field }) => (
            <TextField label="Registration URL" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'registrationUrl')} />
          )}
        />
      ) : null}
    </section>
  );
}

function ProductServiceGroup({ control, errors }: Props) {
  return (
    <section aria-label="Product or service" className="grid gap-4">
      <h3 className="text-sm font-semibold text-slate-200">Product / Service</h3>
      <Controller
        control={control}
        name="productServiceRef"
        render={({ field }) => (
          <TextField label="Product / Service" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'productServiceRef')} />
        )}
      />
    </section>
  );
}

function OfferGroup({ control }: Props) {
  return (
    <section aria-label="Offer" className="grid gap-4">
      <h3 className="text-sm font-semibold text-slate-200">Offer (optional)</h3>
      <Controller
        control={control}
        name="promoOfferType"
        render={({ field }) => (
          <SingleSelect label="Offer Type (optional)" options={OFFER_TYPES} value={(field.value as string) ?? ''} onChange={field.onChange} />
        )}
      />
    </section>
  );
}

function CtaGroup({ control, errors, ctaValue }: Props & { ctaValue: string }) {
  return (
    <section aria-label="Call to action" className="grid gap-4">
      <h3 className="text-sm font-semibold text-slate-200">Call to Action</h3>
      <Controller
        control={control}
        name="cta"
        render={({ field }) => (
          <SingleSelect label="CTA (optional)" options={CTA_OPTIONS} value={(field.value as string) ?? ''} onChange={field.onChange} />
        )}
      />
      {ctaValue === 'Custom' ? (
        <Controller
          control={control}
          name="customCtaText"
          render={({ field }) => (
            <TextField label="Custom CTA Text" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'customCtaText')} />
          )}
        />
      ) : null}
    </section>
  );
}

function ContactGroup({ control, errors, contactValue }: Props & { contactValue: string }) {
  return (
    <section aria-label="Contact" className="grid gap-4">
      <h3 className="text-sm font-semibold text-slate-200">Contact</h3>
      <Controller
        control={control}
        name="contactSource"
        render={({ field }) => (
          <SingleSelect label="Contact Source (optional)" options={CONTACT_SOURCES} value={(field.value as string) ?? ''} onChange={field.onChange} />
        )}
      />
      {contactValue === 'Custom Contact' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            control={control}
            name="customName"
            render={({ field }) => (
              <TextField label="Name (optional)" value={(field.value as string) ?? ''} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="customPhone"
            render={({ field }) => (
              <TextField label="Phone (optional)" value={(field.value as string) ?? ''} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="customEmail"
            render={({ field }) => (
              <TextField label="Email (required for custom contact)" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'customEmail')} />
            )}
          />
          <Controller
            control={control}
            name="customWebsite"
            render={({ field }) => (
              <TextField label="Website (required for custom contact)" required value={(field.value as string) ?? ''} onChange={field.onChange} error={err(errors, 'customWebsite')} />
            )}
          />
        </div>
      ) : null}
    </section>
  );
}

export function StepReference({ control, errors }: Props) {
  return (
    <div className="grid gap-4">
      <Controller
        control={control}
        name="materialType"
        render={({ field }) => (
          <MultiSelectChips
            label="Material Type (optional)"
            options={MATERIAL_TYPES}
            value={(field.value as string[]) ?? []}
            onChange={field.onChange}
            error={err(errors, 'materialType')}
          />
        )}
      />
      <Controller
        control={control}
        name="materialPurpose"
        render={({ field }) => (
          <TextareaField
            label="Material Purpose (optional)"
            rows={3}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
          />
        )}
      />
      <p className="text-xs text-slate-500">Reference URLs are collected as text links only. File upload is out of scope for V1.</p>
    </div>
  );
}

export function StepPublishing({ control, errors }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Controller
        control={control}
        name="preferredDate"
        render={({ field }) => (
          <TextField label="Preferred Date (optional)" type="date" value={(field.value as string) ?? ''} onChange={field.onChange} />
        )}
      />
      <Controller
        control={control}
        name="deadline"
        render={({ field }) => (
          <TextField label="Deadline (optional)" type="date" value={(field.value as string) ?? ''} onChange={field.onChange} />
        )}
      />

      <div className="sm:col-span-2">
        <Controller
          control={control}
          name="publishingPlatform"
          render={({ field }) => (
            <MultiSelectChips
              label="Publishing Platform (optional)"
              options={PUBLISHING_PLATFORMS}
              value={(field.value as string[]) ?? []}
              onChange={field.onChange}
              error={err(errors, 'publishingPlatform')}
            />
          )}
        />
      </div>
      <Controller
        control={control}
        name="publishingPriority"
        render={({ field }) => (
          <SingleSelect
            label="Publishing Priority (optional)"
            options={PRIORITIES}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'publishingPriority')}
          />
        )}
      />
      <Controller
        control={control}
        name="campaignOccasion"
        render={({ field }) => (
          <TextField
            label="Campaign / Occasion (optional)"
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'campaignOccasion')}
          />
        )}
      />
      <Controller
        control={control}
        name="customEmail"
        render={({ field }) => (
          <TextField
            label="Custom Email (optional)"
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'customEmail')}
          />
        )}
      />
      <Controller
        control={control}
        name="customWebsite"
        render={({ field }) => (
          <TextField
            label="Custom Website (optional)"
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            error={err(errors, 'customWebsite')}
          />
        )}
      />

    </div>
  );
}

export function StepReview({ control }: Props) {
  return (
    <div className="grid gap-4">
      <Controller
        control={control}
        name="additionalInformation"
        render={({ field }) => (
          <TextareaField
            label="Additional Information (optional)"
            rows={4}
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
          />
        )}
      />
    </div>
  );
}
