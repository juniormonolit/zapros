import { BRAND_ASSETS } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

type BrandLogoVariant = "header" | "login";

interface BrandLogoProps {
  className?: string;
  /** `header` — top bar; `login` — sign-in card (80% of card width). */
  variant?: BrandLogoVariant;
  /** Center within a sidebar-width header cell (admin layout). */
  centered?: boolean;
}

const VARIANT_CLASS: Record<BrandLogoVariant, string> = {
  header: "h-10 w-auto max-w-[11rem] shrink-0 object-contain",
  login: "mx-auto h-auto w-[80%] max-w-full object-contain",
};

/**
 * Zapros wordmark from public object storage. Size is enforced via CSS so large
 * intrinsic dimensions in the source file cannot blow up the layout.
 */
export function BrandLogo({
  className,
  variant = "header",
  centered = false,
}: BrandLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external CDN asset
    <img
      src={BRAND_ASSETS.logo}
      alt="Zapros"
      className={cn(
        "block",
        VARIANT_CLASS[variant],
        centered ? "mx-auto object-center" : "object-left",
        className,
      )}
      decoding="async"
    />
  );
}
