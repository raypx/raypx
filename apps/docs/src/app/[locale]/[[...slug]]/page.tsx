import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "@fumadocs/base-ui/layouts/docs/page";
import { notFound } from "next/navigation";
import { source } from "~/lib/source";

export default async function Page(props: {
  params: Promise<{ slug?: string[]; locale: string }>;
}) {
  const params = await props.params;
  const { slug, locale } = params;

  console.log("[Docs Page] Rendering:", {
    slug,
    locale,
    pageSlug: !slug || slug.length === 0 ? ["index"] : slug,
  });

  // Use index page if no slug provided
  const pageSlug = slug ?? [];
  const page = source.getPage(pageSlug, locale);

  console.log("[Docs Page] Page data:", {
    pageSlug,
    found: !!page,
    title: page?.data?.title,
  });

  if (!page) {
    console.error("[Docs Page] Page not found:", { pageSlug });
    notFound();
  }

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[]; locale: string }>;
}) {
  const { slug, locale } = await params;
  const page = source.getPage(slug, locale);

  if (!page) {
    return {};
  }

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
