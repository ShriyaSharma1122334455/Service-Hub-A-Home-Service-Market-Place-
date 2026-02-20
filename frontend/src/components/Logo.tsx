import React from "react";

interface LogoProps {
  className?: string;
  variant?: "icon" | "full";
  size?: "sm" | "md" | "lg" | "xl";
}

export const Logo: React.FC<LogoProps> = ({
  className = "",
  variant = "full",
  size = "md",
}) => {
  const sizeClasses = {
    sm: "h-8",
    md: "h-10",
    lg: "h-16", // Login screen size
    xl: "h-24",
  };

  const textSizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-3xl",
    xl: "text-5xl",
  };

  const subTextSizeClasses = {
    sm: "text-[0.4rem]",
    md: "text-[0.5rem]",
    lg: "text-[0.7rem]",
    xl: "text-xs",
  };

  const iconSize = sizeClasses[size];

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* Icon */}
      <div className={`${iconSize} aspect-square relative flex-shrink-0`}>
        <svg
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-sm filter"
        >
          {/* House Body */}
          <path
            d="M100 20L20 90V180H180V90L100 20Z"
            stroke="#0F172A"
            strokeWidth="16"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-slate-900"
            fill="white"
          />

          {/* Gear in center */}
          <circle
            cx="100"
            cy="135"
            r="28"
            stroke="#F59E0B"
            strokeWidth="12"
            className="stroke-amber-500"
          />
          <path
            d="M100 95V107 M100 163V175 M60 135H72 M128 135H140 M72 107L80 115 M120 155L128 163 M72 163L80 155 M120 115L128 107"
            stroke="#F59E0B"
            strokeWidth="12"
            strokeLinecap="round"
            className="stroke-amber-500"
          />

          {/* Crossed Tools */}
          {/* Wrench handle */}
          <path
            d="M55 165L145 75"
            stroke="#0F172A"
            strokeWidth="16"
            strokeLinecap="round"
            className="stroke-slate-900"
          />
          {/* Wrench Head */}
          <path
            d="M135 85L155 65"
            stroke="#0F172A"
            strokeWidth="16"
            strokeLinecap="round"
            className="stroke-slate-900"
          />

          {/* Paintbrush/Screwdriver handle */}
          <path
            d="M145 165L55 75"
            stroke="#0F172A"
            strokeWidth="16"
            strokeLinecap="round"
            className="stroke-slate-900"
          />
          {/* Tip (Gold) */}
          <path
            d="M55 75L40 60"
            stroke="#F59E0B"
            strokeWidth="16"
            strokeLinecap="round"
            className="stroke-amber-500"
          />
        </svg>
      </div>

      {/* Text */}
      {variant === "full" && (
        <div className="flex flex-col justify-center">
          <h1
            className={`font-black text-slate-900 leading-none tracking-tighter ${textSizeClasses[size]}`}
          >
            SERVICE HUB
          </h1>
          <p
            className={`font-bold text-amber-500 tracking-[0.25em] uppercase leading-none mt-1 ${subTextSizeClasses[size]}`}
          >
            Home & Local Services
          </p>
        </div>
      )}
    </div>
  );
};
