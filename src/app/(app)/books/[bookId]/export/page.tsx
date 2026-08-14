import { ExportPanel } from "@/components/export/export-panel";
import { PrintPreview } from "@/components/export/print-preview";
import { FormError } from "@/components/ui/form";
import { getBook, getBookMembers, getBookStats } from "@/lib/books/queries";
import { featureFlags } from "@/lib/env";

export default async function ExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ googleError?: string }>;
}) {
  const { bookId } = await params;
  const { googleError } = await searchParams;

  const [book, members, stats] = await Promise.all([
    getBook(bookId),
    getBookMembers(bookId),
    getBookStats(bookId),
  ]);

  return (
    <div className="space-y-8">
      {googleError ? <FormError>{googleError}</FormError> : null}

      <div className="grid gap-8 lg:grid-cols-[22rem_1fr]">
        <ExportPanel
          bookId={bookId}
          firstEntryDate={stats.firstEntryDate}
          lastEntryDate={stats.lastEntryDate}
          entryCount={stats.entryCount}
          wordCount={stats.wordCount}
          googleDocsAvailable={featureFlags.googleDocsExport}
        />

        <PrintPreview book={book} members={members} />
      </div>
    </div>
  );
}
