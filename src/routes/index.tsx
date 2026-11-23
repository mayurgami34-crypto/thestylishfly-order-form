import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
  head: () => ({
    meta: [
      { title: "THESTYLISHFLY — Dashboard" },
      { name: "description", content: "Open wholesale order dashboard for THESTYLISHFLY by Ambika Garment, Mumbai." },
      { property: "og:title", content: "THESTYLISHFLY — Dashboard" },
      { property: "og:description", content: "Manage wholesale orders and products for THESTYLISHFLY." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});