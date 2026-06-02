import { SectionStub } from "@/components/section-stub";

/**
 * Senior-procurement landing (`/sourcing`). Placeholder until the supplier
 * sourcing kanban ships in phase 7.6. Access is gated by the segment layout,
 * middleware, and RLS.
 */
export default function SourcingPage() {
  return (
    <SectionStub
      title="Проработка поставщиков"
      description="Канбан проработки поставщиков — в разработке (Фаза 7.6)."
    />
  );
}
