import { createFileRoute } from "@tanstack/react-router";

import { StudyMateApp } from "@/features/studymate/StudyMateApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StudyMate AI RAG Notes Assistant" },
      {
        name: "description",
        content: "Upload notes and ask grounded questions with a RAG-powered Lovable AI study assistant.",
      },
      { property: "og:title", content: "StudyMate AI RAG Notes Assistant" },
      {
        property: "og:description",
        content: "A submission-ready RAG app for notes upload, retrieval, and context-only AI answers.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <StudyMateApp />;
}
