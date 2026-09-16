import { ArrowRight } from 'lucide-react';

import { WORKFLOW_STEPS } from './data';
import { SectionHeading } from './shared';

/** Workflow section (`#workflow`): the 11-stage operational pipeline. */
export function WorkflowSection() {
  return (
    <section id="workflow" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="How it works"
          title="Client → Commitment → … → Report"
          intro="Eleven stages carry every engagement forward. At each stage, four concerns travel with it: user, permission, client scope and audit."
        />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WORKFLOW_STEPS.map((step, index) => (
            <li
              key={step.name}
              className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition-colors hover:border-blue-500/40"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-fuchsia-600 text-sm font-bold text-white shadow-lg shadow-blue-600/25">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-slate-100">{step.name}</h3>
                  <p className="text-xs text-slate-500">{step.detail}</p>
                </div>
              </div>
              {index < WORKFLOW_STEPS.length - 1 && (
                <ArrowRight
                  className="absolute right-4 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-700 transition-colors group-hover:text-blue-400 lg:block"
                  aria-hidden="true"
                />
              )}
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-8 max-w-2xl rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-center text-xs leading-relaxed text-slate-400">
          USER + PERMISSION + CLIENT SCOPE + AUDIT — present at every
          stage, enforced server-side, never trusted from client input.
          {' '}
          <span className="text-slate-500">
            Stages after approval (publish, distribute, analytics, report) ship
            only in later approved phases — see the live-vs-next list above.
          </span>
        </p>
      </div>
    </section>
  );
}
