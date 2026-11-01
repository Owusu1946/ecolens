import { redirect } from "next/navigation";

// The help site opens on the docs home.
export default function HomePage() {
  redirect("/docs");
}
