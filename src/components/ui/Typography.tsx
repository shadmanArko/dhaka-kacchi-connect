import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "block font-sans text-[0.68rem] uppercase text-gold",
        "tracking-[0.3em] mb-5",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SectionTitle({
  children,
  className,
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag
      className={cn(
        "font-serif font-light text-cream leading-[1.12]",
        "text-[clamp(2rem,4vw,3.4rem)]",
        "[&_em]:not-italic [&_em]:text-gold [&_em]:font-serif [&_em]:italic",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function GoldRule({ className }: { className?: string }) {
  return <div className={cn("h-px w-[50px] bg-gold my-7", className)} />;
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="font-sans text-[0.67rem] uppercase tracking-[0.15em] text-gold border border-line px-[15px] py-[7px]">
      {children}
    </span>
  );
}

export function PullQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="font-serif font-light italic text-cream text-[1.6rem] leading-[1.45] border-l-2 border-gold pl-7 my-8">
      {children}
    </blockquote>
  );
}
