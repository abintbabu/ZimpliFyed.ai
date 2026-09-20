import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { jsonLd, organizationLd, websiteLd } from "@/lib/site";

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-full flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd([organizationLd, websiteLd])} />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
