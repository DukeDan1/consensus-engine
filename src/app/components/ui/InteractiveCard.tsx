"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";

type InteractiveCardProps = {
  href?: string;
  className?: string;
  cardClassName?: string;
  cardStyle?: React.CSSProperties;
  tabIndex?: number;
  children: React.ReactNode;
};

export default function InteractiveCard({
  href,
  className,
  cardClassName,
  cardStyle,
  tabIndex,
  children,
}: InteractiveCardProps) {
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  const baseStyle = useMemo<React.CSSProperties>(
    () => ({
      transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
      transform: "translateY(0) scale(1)",
      boxShadow: "0 0.125rem 0.25rem rgba(0,0,0,0.05)",
    }),
    []
  );

  const combinedStyle = useMemo<React.CSSProperties>(() => {
    const hoverStyle = hovered
      ? { transform: "translateY(-4px) scale(1.01)", boxShadow: "0 0.5rem 1rem rgba(0,0,0,0.08)" }
      : {};
    const activeStyle = active
      ? { transform: "translateY(-2px) scale(0.998)", boxShadow: "0 0.25rem 0.5rem rgba(0,0,0,0.12)" }
      : {};
    return { ...baseStyle, ...hoverStyle, ...activeStyle, ...cardStyle };
  }, [active, baseStyle, cardStyle, hovered]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLAnchorElement | HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      setActive(true);
      window.setTimeout(() => setActive(false), 180);
    }
  };

  const commonHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => {
      setHovered(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    onFocus: () => setHovered(true),
    onBlur: () => {
      setHovered(false);
      setActive(false);
    },
    onKeyDown: handleKeyDown,
  } satisfies React.HTMLAttributes<HTMLAnchorElement & HTMLDivElement>;

  const cardClasses = ["card", cardClassName].filter(Boolean).join(" ");

  const cardContent = (
    <div className={cardClasses} style={combinedStyle}>
      {children}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className={className} {...commonHandlers}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div
      className={className}
      {...commonHandlers}
      role="link"
      tabIndex={tabIndex ?? 0}
      aria-label={undefined}
    >
      {cardContent}
    </div>
  );
}
