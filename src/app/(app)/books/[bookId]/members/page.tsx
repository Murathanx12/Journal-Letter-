import { notFound } from "next/navigation";

import { AuthorMark } from "@/components/book/author-mark";
import { InvitePanel } from "@/components/members/invite-panel";
import { MemberRow } from "@/components/members/member-row";
import { Card } from "@/components/ui/surface";
import { getSessionUser } from "@/lib/auth/session";
import { getBook, getBookMembers, getPendingInvitations } from "@/lib/books/queries";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  const book = await getBook(bookId);
  // A personal journal has no membership screen to speak of.
  if (book.type !== "shared_letter_book") notFound();

  const [members, invitations, user] = await Promise.all([
    getBookMembers(bookId),
    book.isOwner ? getPendingInvitations(bookId) : Promise.resolve([]),
    getSessionUser(),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-4">
        <h2 className="font-serif text-lg text-ink">Who writes in this book</h2>

        <Card className="divide-y divide-rule p-0">
          {members.map((member) => (
            <div key={member.userId} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <AuthorMark author={member} showSignature={false} />
                <p className="mt-1 pl-8.5 text-xs text-ink-muted">
                  {member.role === "owner"
                    ? "Owner"
                    : member.role === "editor"
                      ? "Can write"
                      : "Can read"}
                  {member.userId === user?.id ? " · you" : ""}
                </p>
              </div>

              {book.isOwner && member.role !== "owner" ? (
                <MemberRow bookId={bookId} userId={member.userId} role={member.role} name={member.displayName} />
              ) : null}
            </div>
          ))}
        </Card>

        <p className="text-xs text-ink-muted">
          Only these people can open this book. There is no public link, and nobody else can read
          it — including by guessing its web address.
        </p>
      </section>

      {book.isOwner ? <InvitePanel bookId={bookId} invitations={invitations} /> : null}
    </div>
  );
}
