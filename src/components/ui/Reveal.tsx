import { type ReactNode } from "react";
import { useReveal } from "@/hooks/useReveal";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
  delayMs?: number;
};

export function Reveal({ children, className, delayMs = 0 }: Props) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const style = delayMs ? { transitionDelay: `${delayMs}ms` } : undefined;
  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        "opacity-0 translate-y-7 transition-[opacity,transform] duration-700 ease-out",
        visible && "opacity-100 translate-y-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
