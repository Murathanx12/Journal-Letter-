import type { Metadata } from "next";

import { PageHeader } from "@/components/ui/surface";

import { NewBookForm } from "./new-book-form";

export const metadata: Metadata = { title: "New book" };

export default function NewBookPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Start a new book"
        description="You can change any of this later — nothing here is permanent."
      />
      <NewBookForm />
    </div>
  );
}
