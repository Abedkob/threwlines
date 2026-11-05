import { Check, FileText, Waves } from "lucide-react";
import { WAVE_BACKGROUND } from "@/lib/template-background";
import type { TemplateBackgroundStyle } from "@/types/db";

type Props = {
  value: TemplateBackgroundStyle;
  onChange: (value: TemplateBackgroundStyle) => void;
};

const choices: Array<{
  value: TemplateBackgroundStyle;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    value: "clean",
    label: "Clean paper",
    description: "A quiet white page for formal documents.",
    icon: FileText,
  },
  {
    value: WAVE_BACKGROUND,
    label: "Signature wave",
    description: "A print-safe lime ribbon inspired by the official site.",
    icon: Waves,
  },
];

export function TemplateBackgroundPicker({ value, onChange }: Props) {
  return (
    <fieldset className="template-background-field span-2">
      <legend>Page background</legend>
      <div className="template-background-picker">
        {choices.map((choice) => {
          const Icon = choice.icon;
          const active = choice.value === value;

          return (
            <button
              type="button"
              key={choice.value}
              className={`template-background-choice template-background-choice-${choice.value}${active ? " active" : ""}`}
              aria-pressed={active}
              onClick={() => onChange(choice.value)}
            >
              <span className="template-background-swatch" aria-hidden="true">
                <i />
              </span>
              <span className="template-background-copy">
                <span>
                  <Icon size={14} />
                  <strong>{choice.label}</strong>
                </span>
                <small>{choice.description}</small>
              </span>
              <span className="template-background-check" aria-hidden="true">
                {active && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
