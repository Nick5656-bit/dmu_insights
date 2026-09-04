"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type Props = Omit<React.ComponentProps<"button">, "type" | "children"> & {
  children: React.ReactNode;
  pendingText?: string;
};

export function LoadingSpinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function SubmitButton({ children, pendingText, className, disabled, ...buttonProps }: Props) {
  const { pending } = useFormStatus();

  return (
    <button {...buttonProps} type="submit" disabled={pending || disabled} className={className}>
      {pending ? (
        <span className="flex items-center justify-center gap-2">
          <LoadingSpinner />
          {pendingText ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

type DetachedSubmitButtonProps = Props & {
  form: string;
};

// Used only where HTML requires the submit button to sit outside its associated form.
export function DetachedSubmitButton({ children, pendingText, form, className, disabled, onClick, ...buttonProps }: DetachedSubmitButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <button
      {...buttonProps}
      type="submit"
      form={form}
      disabled={isSubmitting || disabled}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }

        const linkedForm = document.getElementById(form) as HTMLFormElement | null;
        if (linkedForm && !linkedForm.checkValidity()) {
          return;
        }

        setIsSubmitting(true);
      }}
    >
      {isSubmitting ? (
        <span className="flex items-center justify-center gap-2">
          <LoadingSpinner />
          {pendingText ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
