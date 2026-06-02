import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SectionStubProps {
  title: string;
  description?: string;
}

/**
 * Placeholder content for a section/route whose full implementation lands in a
 * later cycle. Renders inside the role layout so the topbar and navigation
 * remain visible.
 */
export function SectionStub({ title, description }: SectionStubProps) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description ?? "Раздел в разработке."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-secondary">
          Функциональность появится в следующих итерациях.
        </p>
      </CardContent>
    </Card>
  );
}
