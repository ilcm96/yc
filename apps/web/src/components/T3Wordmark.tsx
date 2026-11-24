import type { SVGProps } from "react";

/** The YC mark; it keeps the upstream name so every place that shows the product mark follows it. */
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 120 64" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 6 28 33M50 6 28 33V58M108.7 12.1A26 26 0 1 0 108.7 51.9"
        fill="none"
        stroke="currentColor"
        strokeWidth={12}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
