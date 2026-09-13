'use client';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { CheckCircle2, Mail, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionHeading } from './shared';

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Too long'),
  email: z.string().min(1, 'Email is required').email('Invalid email'),
  message: z.string().min(10, 'Min 10 characters').max(2000, 'Too long'),
});
type Values = z.infer<typeof contactSchema>;

/**
 * Hand-rolled resolver (same rationale as login/register forms): the
 * workspace's hoisted Zod version is incompatible with the
 * `@hookform/resolvers` package protocol.
 */
const resolver: Resolver<Values> = async (raw) => {
  const r = contactSchema.safeParse(raw);
  if (r.success) return { values: r.data, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const i of r.error.issues) {
    const k = i.path[0]?.toString();
    if (!k || errors[k]) continue;
    errors[k] = { type: 'validation', message: i.message };
  }
  return { values: {} as Record<string, never>, errors };
};

/** Left info card beside the contact form. */
export function ContactInfoCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-blue-950/50 to-slate-900/60 p-6 md:col-span-2">
      <Mail className="h-8 w-8 text-blue-400" aria-hidden="true" />
      <h3 className="mt-4 text-lg font-semibold text-slate-100">
        Prefer email?
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        Reach us directly and we will reply within two business days.
      </p>
      <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm font-medium text-blue-300">
        hello@socialops.example
      </p>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        The contact backend endpoint is deferred to a later approved phase
        — the form validates and confirms your message in the browser.
      </p>
    </div>
  );
}

/** Frontend-only contact form (no backend call in this phase). */
export function ContactForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Values>({
    resolver,
    mode: 'onBlur',
    defaultValues: { name: '', email: '', message: '' },
  });

  if (sent) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-10 text-center">
        <CheckCircle2
          className="h-12 w-12 text-emerald-400"
          aria-hidden="true"
        />
        <h3 className="mt-4 text-lg font-semibold text-slate-100">
          Message ready — thank you!
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
          Your message passed validation and looks good. The sending
          endpoint is not live yet, so please email us directly at
          hello@socialops.example.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-6"
          onClick={() => setSent(false)}
        >
          Write another message
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(() => {
        setSent(true);
        reset();
      })}
      noValidate
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="contact-name">Name</Label>
        <Input
          id="contact-name"
          type="text"
          autoComplete="name"
          placeholder="Your full name"
          {...register('name')}
        />
        {errors.name && (
          <p className="text-xs text-red-400">{errors.name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-email">Email</Label>
        <Input
          id="contact-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-red-400">{errors.email.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-message">Message</Label>
        <textarea
          id="contact-message"
          rows={5}
          placeholder="How can we help?"
          className="flex min-h-[120px] w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          {...register('message')}
        />
        {errors.message && (
          <p className="text-xs text-red-400">{errors.message.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full sm:w-auto">
        <Send className="h-4 w-4" aria-hidden="true" />
        Send message
      </Button>
    </form>
  );
}

/** Contact section (`#contact`): info card + validated form. */
export function ContactSection() {
  return (
    <section id="contact" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Contact"
          title="Talk to a human"
          intro="Questions about fit, onboarding or the roadmap? Write to us — we read everything."
        />
        <div className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-5">
          <ContactInfoCard />
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:col-span-3">
            <ContactForm />
          </div>
        </div>
      </div>
    </section>
  );
}
